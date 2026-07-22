const EventEmitter = require('events');

jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    promises: {
      mkdir: jest.fn().mockResolvedValue(undefined),
      writeFile: jest.fn().mockResolvedValue(undefined),
      readFile: jest.fn().mockRejectedValue({ code: 'ENOENT' }),
      unlink: jest.fn().mockResolvedValue(undefined),
    },
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn(),
  };
});

jest.mock('../src/utils/SafeExec', () => ({
  safeSpawn: jest.fn(),
}));

jest.mock('os', () => ({
  ...jest.requireActual('os'),
  tmpdir: () => '\\tmp',
}));

const { SessionMemory, MemorySections, SectionLimits, DefaultConfig } = require('../src/memory/SessionMemory');
const fs = require('fs');
const SafeExec = require('../src/utils/SafeExec');

function createMockChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 12345;
  return child;
}

describe('SessionMemory', () => {
  let mem;

  beforeEach(() => {
    jest.clearAllMocks();
    mem = new SessionMemory({ sessionId: 'test-session', filePath: '\\tmp\\test-memory.md' });
  });

  describe('constructor', () => {
    test('sets default config', () => {
      expect(mem.config.autoExtract).toBe(true);
      expect(mem.config.enabled).toBe(true);
      expect(mem.config.minimumTokensBetweenUpdate).toBe(5000);
      expect(mem.config.toolCallsBetweenUpdates).toBe(3);
      expect(mem.config.sessionId).toBe('test-session');
      expect(mem.config.filePath).toBe('\\tmp\\test-memory.md');
    });

    test('overrides config with options', () => {
      const m = new SessionMemory({ enabled: false, minimumTokensBetweenUpdate: 100, sessionId: 's1', filePath: 'p' });
      expect(m.config.enabled).toBe(false);
      expect(m.config.minimumTokensBetweenUpdate).toBe(100);
    });

    test('generates sessionId when not provided', () => {
      const m = new SessionMemory();
      expect(m.sessionId).toMatch(/^session-/);
    });

    test('generates default filePath when not provided', () => {
      const m = new SessionMemory({ sessionId: 's2' });
      expect(m.filePath).toContain('.claude');
      expect(m.filePath).toContain('s2.md');
    });

    test('initializes all memory sections as empty strings', () => {
      expect(mem.content.size).toBe(10);
      for (const section of Object.values(MemorySections)) {
        expect(mem.content.get(section)).toBe('');
      }
    });

    test('initializes counters to zero', () => {
      expect(mem.tokenCount).toBe(0);
      expect(mem.toolCallCount).toBe(0);
      expect(mem.lastUpdateTokenCount).toBe(0);
    });
  });

  describe('generateSessionId', () => {
    test('generates unique session IDs', () => {
      const id1 = mem.generateSessionId();
      const id2 = mem.generateSessionId();
      expect(id1).not.toBe(id2);
    });

    test('starts with session-', () => {
      expect(mem.generateSessionId()).toMatch(/^session-/);
    });
  });

  describe('getDefaultPath', () => {
    test('uses HOME env for default path', () => {
      const m = new SessionMemory({ sessionId: 's3' });
      const home = process.env.HOME || process.env.USERPROFILE;
      expect(m.filePath).toBe(`${home}\\.claude\\session-memory\\s3.md`);
    });

    test('falls back to USERPROFILE when HOME not set', () => {
      const origHome = process.env.HOME;
      delete process.env.HOME;
      const m = new SessionMemory({ sessionId: 'fallback' });
      const expected = `${process.env.USERPROFILE}\\.claude\\session-memory\\fallback.md`;
      expect(m.filePath).toBe(expected);
      if (origHome !== undefined) { process.env.HOME = origHome; }
    });
  });

  describe('recordMessage', () => {
    test('increments tokenCount', () => {
      mem.recordMessage('user', 'hello', 100);
      expect(mem.tokenCount).toBe(100);
    });

    test('calls checkThreshold', () => {
      const spy = jest.spyOn(mem, 'checkThreshold');
      mem.recordMessage('user', 'hello', 50);
      expect(spy).toHaveBeenCalled();
    });

    test('defaults tokens to 0 when not provided', () => {
      mem.recordMessage('user', 'hello');
      expect(mem.tokenCount).toBe(0);
    });
  });

  describe('recordToolCall', () => {
    test('increments toolCallCount', () => {
      mem.recordToolCall('read');
      expect(mem.toolCallCount).toBe(1);
    });

    test('increments on multiple calls', () => {
      mem.recordToolCall('read');
      mem.recordToolCall('write');
      mem.recordToolCall('edit');
      expect(mem.toolCallCount).toBe(3);
    });

    test('calls checkThreshold', () => {
      const spy = jest.spyOn(mem, 'checkThreshold');
      mem.recordToolCall('read');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('checkThreshold', () => {
    test('returns false when autoExtract is false', () => {
      const m = new SessionMemory({ autoExtract: false, sessionId: 't1', filePath: 'p' });
      m.tokenCount = 10000;
      m.toolCallCount = 10;
      expect(m.checkThreshold()).toBe(false);
    });

    test('returns false when token threshold not met', () => {
      mem.tokenCount = 1000;
      mem.toolCallCount = 10;
      expect(mem.checkThreshold()).toBe(false);
    });

    test('returns false when toolCall threshold not met', () => {
      mem.tokenCount = 10000;
      mem.toolCallCount = 0;
      expect(mem.checkThreshold()).toBe(false);
    });

    test('returns true when both thresholds met', () => {
      mem.tokenCount = 10000;
      mem.toolCallCount = 5;
      expect(mem.checkThreshold()).toBe(true);
    });

    test('returns true when both thresholds exactly met', () => {
      mem.tokenCount = 5000;
      mem.toolCallCount = 3;
      expect(mem.checkThreshold()).toBe(true);
    });
  });

  describe('extract', () => {
    test('returns null when threshold not met', async () => {
      const result = await mem.extract({ messages: [] });
      expect(result).toBeNull();
    });

    test('returns null and catches error from runExtractionAgent', async () => {
      mem.tokenCount = 10000;
      mem.toolCallCount = 3;
      const mockChild = createMockChild();
      SafeExec.safeSpawn.mockReturnValue(mockChild);

      const extractPromise = mem.extract({ messages: [{ role: 'user', content: 'test' }] });
      mockChild.emit('error', new Error('spawn failed'));
      const result = await extractPromise;
      expect(result).toBeNull();
    });

    test('resets counters and returns result on success', async () => {
      mem.tokenCount = 10000;
      mem.toolCallCount = 3;
      const mockChild = createMockChild();
      SafeExec.safeSpawn.mockReturnValue(mockChild);

      const extractPromise = mem.extract({ messages: [{ role: 'user', content: 'test' }] });
      mockChild.stdout.emit('data', Buffer.from(JSON.stringify({ sections: { 'Session Title': 'My Session' } })));
      mockChild.emit('close', 0);
      const result = await extractPromise;

      expect(result).toEqual({ sections: { 'Session Title': 'My Session' } });
      expect(mem.tokenCount).toBe(10000);
      expect(mem.lastUpdateTokenCount).toBe(10000);
      expect(mem.toolCallCount).toBe(0);
    });
  });

  describe('runExtractionAgent', () => {
    test('resolves with parsed JSON on successful extraction', async () => {
      mem.tokenCount = 10000;
      mem.toolCallCount = 3;
      const mockChild = createMockChild();
      SafeExec.safeSpawn.mockReturnValue(mockChild);

      const extractPromise = mem.extract({ messages: [{ role: 'user', content: 'test' }] });
      mockChild.stdout.emit('data', Buffer.from(JSON.stringify({ result: 'parsed' })));
      mockChild.emit('close', 0);
      const result = await extractPromise;

      expect(result).toEqual({ result: 'parsed' });
    });

    test('resolves with raw output when JSON parsing fails', async () => {
      mem.tokenCount = 10000;
      mem.toolCallCount = 3;
      const mockChild = createMockChild();
      SafeExec.safeSpawn.mockReturnValue(mockChild);

      const extractPromise = mem.extract({ messages: [{ role: 'user', content: 'test' }] });
      mockChild.stdout.emit('data', Buffer.from('not json'));
      mockChild.emit('close', 0);
      const result = await extractPromise;

      expect(result).toEqual({ raw: 'not json' });
    });

    test('rejects when child exits with non-zero code', async () => {
      mem.tokenCount = 10000;
      mem.toolCallCount = 3;
      const mockChild = createMockChild();
      SafeExec.safeSpawn.mockReturnValue(mockChild);

      const extractPromise = mem.extract({ messages: [{ role: 'user', content: 'test' }] });
      mockChild.stderr.emit('data', Buffer.from('error occurred'));
      mockChild.emit('close', 1);
      const result = await extractPromise;

      expect(result).toBeNull();
    });

    test('writes temp file and cleans up on close', async () => {
      mem.tokenCount = 10000;
      mem.toolCallCount = 3;
      const mockChild = createMockChild();
      SafeExec.safeSpawn.mockReturnValue(mockChild);

      const extractPromise = mem.extract({ messages: [{ role: 'user', content: 'test' }] });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('session-extract-'),
        expect.stringContaining('AgentLoop')
      );
      mockChild.stdout.emit('data', Buffer.from('ok'));
      mockChild.emit('close', 0);
      await extractPromise;

      expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('session-extract-'));
    });

    test('cleans up temp file on error event', async () => {
      mem.tokenCount = 10000;
      mem.toolCallCount = 3;
      const mockChild = createMockChild();
      SafeExec.safeSpawn.mockReturnValue(mockChild);

      const extractPromise = mem.extract({ messages: [{ role: 'user', content: 'test' }] });
      mockChild.emit('error', new Error('spawn failed'));
      await extractPromise;

      expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('session-extract-'));
    });
  });

  describe('buildExtractionPrompt', () => {
    test('includes recent messages from session', () => {
      const messages = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ];
      const session = { messages };
      const prompt = mem.buildExtractionPrompt(session);
      expect(prompt).toContain('user: hello');
      expect(prompt).toContain('assistant: hi');
    });

    test('includes all section headers', () => {
      const prompt = mem.buildExtractionPrompt({ messages: [] });
      for (const section of Object.values(MemorySections)) {
        expect(prompt).toContain(`# ${section}`);
      }
    });
  });

  describe('getRecentMessages', () => {
    test('returns empty array for null session', () => {
      expect(mem.getRecentMessages(null)).toEqual([]);
    });

    test('returns empty array for session without messages', () => {
      expect(mem.getRecentMessages({})).toEqual([]);
    });

    test('returns last N messages', () => {
      const messages = Array.from({ length: 25 }, (_, i) => ({ role: 'user', content: `msg${i}` }));
      const result = mem.getRecentMessages({ messages });
      expect(result).toHaveLength(20);
      expect(result[0].content).toBe('msg5');
    });

    test('returns all messages when less than count', () => {
      const messages = [{ role: 'user', content: 'only' }];
      expect(mem.getRecentMessages({ messages })).toHaveLength(1);
    });
  });

  describe('mergeExtraction', () => {
    test('does nothing for null extraction', () => {
      const saveSpy = jest.spyOn(mem, 'save');
      mem.mergeExtraction(null);
      expect(saveSpy).not.toHaveBeenCalled();
      saveSpy.mockRestore();
    });

    test('merges parsed sections into memory', () => {
      const saveSpy = jest.spyOn(mem, 'save').mockResolvedValue(true);
      mem.mergeExtraction({
        sections: { 'Session Title': 'Test Title', 'Key results': 'Done everything' }
      });
      expect(mem.content.get('Session Title')).toBe('Test Title');
      expect(mem.content.get('Key results')).toBe('Done everything');
      expect(saveSpy).toHaveBeenCalled();
      saveSpy.mockRestore();
    });

    test('appends to existing section content', () => {
      const saveSpy = jest.spyOn(mem, 'save').mockResolvedValue(true);
      mem.content.set('Session Title', 'Previous content');
      mem.mergeExtraction({ sections: { 'Session Title': 'New content' } });
      expect(mem.content.get('Session Title')).toContain('Previous content');
      expect(mem.content.get('Session Title')).toContain('New content');
      saveSpy.mockRestore();
    });
  });

  describe('parseExtraction', () => {
    test('parses markdown-style string extraction', () => {
      const sections = mem.parseExtraction(`# Session Title
My Title
# Key results
Result A`);
      expect(sections['Session Title']).toBe('My Title');
      expect(sections['Key results']).toBe('Result A');
    });

    test('handles extraction.sections format', () => {
      const sections = mem.parseExtraction({
        sections: { 'Session Title': 'Structured Title' }
      });
      expect(sections['Session Title']).toBe('Structured Title');
    });

    test('handles extraction.result format', () => {
      const sections = mem.parseExtraction({
        result: { output: 'agent result' }
      });
      expect(sections['KEY_RESULTS']).toBe('{"output":"agent result"}');
    });

    test('returns all sections as empty strings for empty input', () => {
      const sections = mem.parseExtraction({});
      for (const section of Object.values(MemorySections)) {
        expect(sections[section]).toBe('');
      }
    });

    test('handles multi-line section content', () => {
      const sections = mem.parseExtraction(`# Workflow
Step 1: init
Step 2: process
Step 3: finalize`);
      expect(sections['Workflow']).toBe('Step 1: init\nStep 2: process\nStep 3: finalize');
    });

    test('handles content before first section header', () => {
      const sections = mem.parseExtraction('preamble text\n# Session Title\nMain');
      expect(sections['Session Title']).toBe('Main');
    });

    test('handles content after last section without trailing newline', () => {
      const sections = mem.parseExtraction('# Learnings\nLesson 1\nLesson 2');
      expect(sections['Learnings']).toBe('Lesson 1\nLesson 2');
    });

    test('handles single empty section', () => {
      const sections = mem.parseExtraction('# Workflow');
      expect(sections['Workflow']).toBe('');
    });

    test('handles text with no section headers', () => {
      const sections = mem.parseExtraction('plain text without headers');
      for (const section of Object.values(MemorySections)) {
        expect(sections[section]).toBe('');
      }
    });
  });

  describe('mergeSection', () => {
    test('combines existing and new content', () => {
      const result = mem.mergeSection('Old', 'New', 1000);
      expect(result).toBe('Old\n---\nNew');
    });

    test('returns only new content when no existing', () => {
      const result = mem.mergeSection('', 'New', 1000);
      expect(result).toBe('New');
    });

    test('keeps newer half when over token limit', () => {
      const longExisting = 'A'.repeat(500);
      const longNew = 'B'.repeat(500);
      const result = mem.mergeSection(longExisting, longNew, 200);
      expect(result).toContain('B');
      expect(result).not.toContain('A');
    });
  });

  describe('estimateTokens', () => {
    test('returns 0 for null text', () => {
      expect(mem.estimateTokens(null)).toBe(0);
    });

    test('returns 0 for undefined text', () => {
      expect(mem.estimateTokens(undefined)).toBe(0);
    });

    test('returns 0 for empty string', () => {
      expect(mem.estimateTokens('')).toBe(0);
    });

    test('estimates tokens as ceil(text.length / 4)', () => {
      expect(mem.estimateTokens('hello')).toBe(2);
      expect(mem.estimateTokens('hello world')).toBe(3);
    });
  });

  describe('save', () => {
    test('creates directory and writes file', async () => {
      const result = await mem.save();
      expect(result).toBe(true);
      expect(fs.promises.mkdir).toHaveBeenCalledWith('\\tmp', { recursive: true });
      expect(fs.promises.writeFile).toHaveBeenCalledWith('\\tmp\\test-memory.md', expect.any(String), 'utf-8');
    });

    test('returns false on error', async () => {
      fs.promises.mkdir.mockRejectedValueOnce(new Error('permission denied'));
      const result = await mem.save();
      expect(result).toBe(false);
    });

    test('includes session id and timestamp in output', async () => {
      await mem.save();
      const content = fs.promises.writeFile.mock.calls[0][1];
      expect(content).toContain('test-session');
      expect(content).toContain('Last Updated:');
    });
  });

  describe('load', () => {
    test('returns true and parses content on successful load', async () => {
      fs.promises.readFile.mockResolvedValueOnce('## Session Title\nLoaded\n## Key results\nDone');
      const result = await mem.load();
      expect(result).toBe(true);
      expect(mem.content.get('Session Title')).toBe('Loaded');
      expect(mem.content.get('Key results')).toBe('Done');
    });

    test('returns false when file does not exist (ENOENT)', async () => {
      const result = await mem.load();
      expect(result).toBe(false);
    });

    test('logs error for non-ENOENT errors', async () => {
      fs.promises.readFile.mockRejectedValueOnce({ code: 'EACCES', message: 'access denied' });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await mem.load();
      expect(result).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith('Failed to load session memory:', 'access denied');
      errorSpy.mockRestore();
    });

    test('handles file with empty sections', async () => {
      fs.promises.readFile.mockResolvedValueOnce('');
      const result = await mem.load();
      expect(result).toBe(true);
    });
  });

  describe('toMarkdown', () => {
    test('includes session header', () => {
      const md = mem.toMarkdown();
      expect(md).toContain('# Session Memory');
      expect(md).toContain('test-session');
    });

    test('includes sections that have content', () => {
      mem.content.set('Session Title', 'My Work');
      mem.content.set('Key results', 'All done');
      const md = mem.toMarkdown();
      expect(md).toContain('## Session Title');
      expect(md).toContain('My Work');
      expect(md).toContain('## Key results');
      expect(md).toContain('All done');
    });

    test('skips empty sections', () => {
      const md = mem.toMarkdown();
      for (const [name, content] of mem.content) {
        if (!content) {
          expect(md).not.toContain(`## ${name}`);
        }
      }
    });
  });

  describe('parseFromMarkdown', () => {
    test('parses section headers and content', () => {
      mem.parseFromMarkdown('## Session Title\nMy Work\n## Errors & Corrections\nBug fixed');
      expect(mem.content.get('Session Title')).toBe('My Work');
      expect(mem.content.get('Errors & Corrections')).toBe('Bug fixed');
    });

    test('ignores lines before first section header', () => {
      mem.parseFromMarkdown('preamble\n## Session Title\nValue');
      expect(mem.content.get('Session Title')).toBe('Value');
    });

    test('handles empty content sections', () => {
      mem.parseFromMarkdown('## Session Title\n\n## Key results');
      expect(mem.content.get('Session Title')).toBe('');
      expect(mem.content.get('Key results')).toBe('');
    });

    test('handles only header lines', () => {
      mem.parseFromMarkdown('## Session Title\n## Key results');
      expect(mem.content.get('Session Title')).toBe('');
    });

    test('preserves multi-line content', () => {
      mem.parseFromMarkdown('## Workflow\nStep 1\nStep 2\nStep 3');
      expect(mem.content.get('Workflow')).toBe('Step 1\nStep 2\nStep 3');
    });
  });

  describe('get', () => {
    test('returns content for existing section', () => {
      mem.content.set('Session Title', 'test');
      expect(mem.get('Session Title')).toBe('test');
    });

    test('returns empty string for missing section', () => {
      expect(mem.get('Nonexistent')).toBe('');
    });
  });

  describe('getAll', () => {
    test('returns all content as object', () => {
      mem.content.set('Session Title', 'test');
      const all = mem.getAll();
      expect(all['Session Title']).toBe('test');
      expect(Object.keys(all)).toHaveLength(10);
    });
  });

  describe('getPromptContext', () => {
    test('returns formatted context with non-empty sections', () => {
      mem.content.set('Session Title', 'My Title');
      mem.content.set('Key results', 'Done');
      const ctx = mem.getPromptContext();
      expect(ctx).toContain('Session Memory');
      expect(ctx).toContain('[Session Title]');
      expect(ctx).toContain('My Title');
      expect(ctx).toContain('[Key results]');
      expect(ctx).toContain('Done');
    });

    test('returns empty string when all sections empty', () => {
      expect(mem.getPromptContext()).toBe('');
    });

    test('returns empty string for mixed empty and non-empty', () => {
      mem.content.set('Session Title', 'Has content');
      const ctx = mem.getPromptContext();
      expect(ctx).toContain('[Session Title]');
      expect(ctx).not.toContain('[Workflow]');
    });
  });

  describe('clear', () => {
    test('clears all section content', () => {
      mem.content.set('Session Title', 'test');
      mem.content.set('Key results', 'test2');
      mem.clear();
      for (const content of mem.content.values()) {
        expect(content).toBe('');
      }
    });

    test('resets all counters to zero', () => {
      mem.tokenCount = 100;
      mem.toolCallCount = 5;
      mem.lastUpdateTokenCount = 50;
      mem.clear();
      expect(mem.tokenCount).toBe(0);
      expect(mem.toolCallCount).toBe(0);
      expect(mem.lastUpdateTokenCount).toBe(0);
    });
  });

  describe('getStats', () => {
    test('returns zero totals for empty memory', () => {
      const stats = mem.getStats();
      expect(stats.sessionId).toBe('test-session');
      expect(stats.sections).toBe(10);
      expect(stats.totalTokens).toBe(0);
      expect(stats.pendingTokens).toBe(0);
      expect(stats.pendingToolCalls).toBe(0);
    });

    test('calculates totalTokens from section content', () => {
      mem.content.set('Session Title', 'A'.repeat(100));
      const stats = mem.getStats();
      expect(stats.totalTokens).toBe(25);
    });

    test('calculates nextExtractIn', () => {
      mem.tokenCount = 2000;
      mem.lastUpdateTokenCount = 1000;
      mem.toolCallCount = 1;
      const stats = mem.getStats();
      expect(stats.pendingTokens).toBe(1000);
      expect(stats.nextExtractIn).toBe(4000);
    });

    test('nextExtractIn can be negative when tokens exceeded', () => {
      mem.tokenCount = 20000;
      mem.lastUpdateTokenCount = 0;
      mem.toolCallCount = 2;
      const stats = mem.getStats();
      expect(stats.nextExtractIn).toBe(-15000);
    });
  });

  describe('destroy', () => {
    test('clears content and resets counters', () => {
      mem.content.set('Session Title', 'test');
      mem.tokenCount = 100;
      mem.toolCallCount = 5;
      mem.destroy();
      expect(mem.content.size).toBe(0);
    });
  });

  describe('MemorySections constants', () => {
    test('has all 10 sections', () => {
      expect(Object.keys(MemorySections)).toHaveLength(10);
      expect(MemorySections.SESSION_TITLE).toBe('Session Title');
      expect(MemorySections.WORKLOG).toBe('Worklog');
    });
  });

  describe('SectionLimits constants', () => {
    test('has correct values', () => {
      expect(SectionLimits.MAX_SECTION_TOKENS).toBe(2000);
      expect(SectionLimits.MAX_TOTAL_TOKENS).toBe(12000);
    });
  });

  describe('DefaultConfig constants', () => {
    test('has default values', () => {
      expect(DefaultConfig.minimumTokensBetweenUpdate).toBe(5000);
      expect(DefaultConfig.toolCallsBetweenUpdates).toBe(3);
      expect(DefaultConfig.enabled).toBe(true);
      expect(DefaultConfig.autoExtract).toBe(true);
    });
  });
});
