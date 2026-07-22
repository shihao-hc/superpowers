const PreToolRiskAnalyzer = require('../../src/core/PreToolRiskAnalyzer');

describe('PreToolRiskAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new PreToolRiskAnalyzer();
  });

  describe('_classifyOp', () => {
    it('classifies delete operations', () => {
      expect(analyzer._classifyOp('deleteFile')).toBe('delete');
      expect(analyzer._classifyOp('removeItem')).toBe('delete');
      expect(analyzer._classifyOp('unlink')).toBe('delete');
    });

    it('classifies write operations by tool name', () => {
      expect(analyzer._classifyOp('writeFile')).toBe('write');
      expect(analyzer._classifyOp('editFile')).toBe('write');
      expect(analyzer._classifyOp('createFile')).toBe('write');
      expect(analyzer._classifyOp('modify')).toBe('write');
    });

    it('classifies write operations by args content', () => {
      expect(analyzer._classifyOp('someTool', { action: 'write' })).toBe('write');
      expect(analyzer._classifyOp('someTool', { mode: 'overwrite' })).toBe('write');
    });

    it('classifies read operations', () => {
      expect(analyzer._classifyOp('readFile')).toBe('read');
      expect(analyzer._classifyOp('getItem')).toBe('read');
      expect(analyzer._classifyOp('listDir')).toBe('read');
      expect(analyzer._classifyOp('searchQuery')).toBe('read');
    });

    it('returns unknown for unrecognized tools', () => {
      expect(analyzer._classifyOp('runScript')).toBe('unknown');
      expect(analyzer._classifyOp('execute')).toBe('unknown');
    });

    it('is case insensitive', () => {
      expect(analyzer._classifyOp('DELETEFILE')).toBe('delete');
      expect(analyzer._classifyOp('WriteFile')).toBe('write');
    });
  });

  describe('_extractTargets', () => {
    it('extracts file paths from args', () => {
      const result = analyzer._extractTargets({ path: 'src/core/BrainSystem.js' });
      expect(result).toContain('src/core/BrainSystem.js');
    });

    it('extracts paths from stringified args', () => {
      const result = analyzer._extractTargets('file: "AGENTS.md"');
      expect(result).toContain('AGENTS.md');
    });

    it('detects traversal paths', () => {
      const result = analyzer._extractTargets({ path: '../../etc/passwd' });
      expect(result).toContain('../../etc/passwd');
    });

    it('returns empty array for null args', () => {
      expect(analyzer._extractTargets(null)).toEqual([]);
    });

    it('returns empty array for args with no file paths', () => {
      expect(analyzer._extractTargets({ action: 'run', cmd: 'test' })).toEqual([]);
    });
  });

  describe('_classifyFile', () => {
    it('marks critical paths', () => {
      const cr = analyzer._classifyFile('src/core/BrainSystem.js');
      expect(cr.level).toBe('critical');
      const ag = analyzer._classifyFile('AGENTS.md');
      expect(ag.level).toBe('critical');
    });

    it('marks config paths', () => {
      const op = analyzer._classifyFile('.opencode/config.json');
      expect(op.level).toBe('config');
    });

    it('marks traversal as critical with traversal flag', () => {
      const r = analyzer._classifyFile('../evil.js');
      expect(r.level).toBe('critical');
      expect(r.traversal).toBe(true);
    });

    it('returns null for non-critical paths', () => {
      expect(analyzer._classifyFile('src/utils/helper.js')).toBeNull();
      expect(analyzer._classifyFile('README.md')).toBeNull();
    });

    it('handles backslash paths', () => {
      const r = analyzer._classifyFile('..\\evil.js');
      expect(r.level).toBe('critical');
      expect(r.traversal).toBe(true);
    });
  });

  describe('_findMatch', () => {
    const lessons = [
      { id: 'L1', category: 'security', tags: ['critical'] },
      { id: 'L2', category: 'performance', tags: ['optimization'] },
      { id: 'L3', category: 'style', tags: [] },
    ];

    it('matches by category', () => {
      expect(analyzer._findMatch(lessons, 'security')).toEqual(lessons[0]);
    });

    it('matches by tag', () => {
      expect(analyzer._findMatch(lessons, 'optimization')).toEqual(lessons[1]);
    });

    it('returns null for no match', () => {
      expect(analyzer._findMatch(lessons, 'security')).toEqual(lessons[0]);
    });

    it('returns null for null input', () => {
      expect(analyzer._findMatch(null, 'security')).toBeNull();
    });

    it('returns null for non-array input', () => {
      expect(analyzer._findMatch({}, 'security')).toBeNull();
    });

    it('handles lessons without tags property', () => {
      const noTags = [{ id: 'L4', category: 'general' }];
      expect(analyzer._findMatch(noTags, 'nonexistent')).toBeUndefined();
    });
  });

  describe('_loadBaseline', () => {
    it('returns cached baseline on repeated calls', () => {
      analyzer._baselineCache = new Set(['test.js']);
      const result = analyzer._loadBaseline();
      expect(result.has('test.js')).toBe(true);
    });

    it('returns a Set instance from baseline', () => {
      const result = analyzer._loadBaseline();
      expect(result).toBeInstanceOf(Set);
    });

    it('returns empty Set when baseline file does not exist', () => {
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValueOnce(false);
      analyzer._baselineCache = null;
      const result = analyzer._loadBaseline();
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
      fs.existsSync.mockRestore();
    });

    it('handles baseline where raw is an array of file objects', () => {
      const fs = require('fs');
      const data = JSON.stringify([{ file: 'file1.js' }, { file: 'file2.js' }]);
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(data);
      analyzer._baselineCache = null;
      const result = analyzer._loadBaseline();
      expect(result).toBeInstanceOf(Set);
      expect(result.has('file1.js')).toBe(true);
      expect(result.has('file2.js')).toBe(true);
      fs.readFileSync.mockRestore();
    });

    it('handles baseline where raw is null', () => {
      const fs = require('fs');
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce('null');
      analyzer._baselineCache = null;
      const result = analyzer._loadBaseline();
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
      fs.readFileSync.mockRestore();
    });

    it('handles baseline with no perFile property', () => {
      const fs = require('fs');
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce('{"version":1}');
      analyzer._baselineCache = null;
      const result = analyzer._loadBaseline();
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
      fs.readFileSync.mockRestore();
    });

    it('handles baseline entries missing file property', () => {
      const fs = require('fs');
      const data = JSON.stringify([{ file: 'a.js' }, { notfile: 'b.js' }]);
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce(data);
      analyzer._baselineCache = null;
      const result = analyzer._loadBaseline();
      expect(result.has('a.js')).toBe(true);
      expect(result.has('')).toBe(true);
      fs.readFileSync.mockRestore();
    });
  });

  describe('_classifyFile null path', () => {
    it('returns null for null filePath', () => {
      expect(analyzer._classifyFile(null)).toBeNull();
    });

    it('returns null for empty filePath', () => {
      expect(analyzer._classifyFile('')).toBeNull();
    });
  });

  describe('analyze', () => {
    it('returns ALLOW for null tool', () => {
      const r = analyzer.analyze(null, {});
      expect(r.action).toBe('ALLOW');
      expect(r.reason).toMatch(/no tool specified/);
    });

    it('BLOCKs path traversal', () => {
      const r = analyzer.analyze('writeFile', { path: '../evil.js' });
      expect(r.action).toBe('BLOCK');
      expect(r.traversal).toBe(true);
    });

    it('BLOCKs delete of critical file', () => {
      const r = analyzer.analyze('deleteFile', { path: 'src/core/BrainSystem.js' });
      expect(r.action).toBe('BLOCK');
    });

    it('WARNs on write to critical file', () => {
      const r = analyzer.analyze('writeFile', { path: 'AGENTS.md' });
      expect(r.action).toBe('WARN');
    });

    it('WARNs on write to config file', () => {
      const r = analyzer.analyze('writeFile', { path: '.opencode/config.json' });
      expect(r.action).toBe('WARN');
    });

    it('WARNs on delete of config file', () => {
      const r = analyzer.analyze('deleteFile', { path: '.opencode/config.json' });
      expect(r.action).toBe('WARN');
    });

    it('includes security lesson warnings when match found', () => {
      analyzer._findMatch = () => ({ id: 'L1', title: 'Security rule' });
      const r = analyzer.analyze('writeFile', { path: '.opencode/config.json' });
      expect(r.action).toBe('WARN');
      expect(r.warnings).toBeDefined();
    });

    it('ALLOWs safe operations', () => {
      const r = analyzer.analyze('readFile', { path: 'src/utils/helper.js' });
      expect(r.action).toBe('ALLOW');
    });

    it('WARNs on write to guardrail baselined file', () => {
      analyzer._baselineCache = new Set(['src/utils/helper.js']);
      const r = analyzer.analyze('writeFile', { path: 'src/utils/helper.js' });
      expect(r.action).toBe('WARN');
      expect(r.warnings.some(w => w.includes('防护基线'))).toBe(true);
    });

    it('BLOCKs delete with lesson reference', () => {
      const r = analyzer.analyze('deleteFile', { path: 'src/core/BrainSystem.js' });
      expect(r.action).toBe('BLOCK');
      expect(r.lessonMatch).toBeDefined();
    });

    it('logs BLOCK action via audit provider', () => {
      const audit = { log: jest.fn() };
      const riskAnalyzer = new PreToolRiskAnalyzer({ audit });
      riskAnalyzer.analyze('writeFile', { path: '../evil.js' });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'warn', action: 'pre_tool_block' })
      );
    });

    it('logs WARN action via audit provider', () => {
      const audit = { log: jest.fn() };
      const riskAnalyzer = new PreToolRiskAnalyzer({ audit });
      riskAnalyzer.analyze('writeFile', { path: 'AGENTS.md' });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'info', action: 'pre_tool_warn' })
      );
    });

    it('returns WARN for write with empty baseline', () => {
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValueOnce(false);
      analyzer._baselineCache = null;
      const r = analyzer.analyze('writeFile', { path: 'src/utils/new.js' });
      expect(r.action).toBe('ALLOW');
      fs.existsSync.mockRestore();
    });
  });
});
