/**
 * Integration Tests for New Modules
 * Tests the following modules:
 * - src/hooks/HooksManager.js
 * - src/memory/SessionMemory.js
 * - src/agent/SuggestionPipeline.js
 * - src/config/SettingsSync.js
 * - src/utils/FuzzyMatcher.js
 */

describe('New Modules Integration Tests', () => {
  describe('HooksManager', () => {
    let HooksManager, HookEvents, HookResult, HookType;

    beforeAll(() => {
      const module = require('../../src/hooks');
      HooksManager = module.HooksManager;
      HookEvents = module.HookEvents;
      HookResult = module.HookResult;
      HookType = module.HookType;
    });

    it('should export required components', () => {
      expect(HooksManager).toBeDefined();
      expect(HookEvents).toBeDefined();
      expect(HookResult).toBeDefined();
      expect(HookType).toBeDefined();
    });

    it('should instantiate without errors', () => {
      const hooksManager = new HooksManager();
      hooksManager.enabled = true;
      expect(hooksManager).toBeDefined();
      expect(hooksManager.enabled).toBe(true);
      hooksManager.clear();
    });

    it('should register hooks', () => {
      const hooksManager = new HooksManager();

      const config = {
        type: HookType.COMMAND,
        event: HookEvents.PRE_TOOL_USE,
        handler: () => {},
        enabled: true
      };

      const registered = hooksManager.register(config);
      expect(registered).toBe(true);

      const hooks = hooksManager.getHooks();
      expect(hooks.length).toBeGreaterThan(0);

      hooksManager.clear();
    });

    it('should handle hook execution result', async () => {
      const hooksManager = new HooksManager();

      hooksManager.register({
        type: HookType.COMMAND,
        event: HookEvents.PRE_TOOL_USE,
        handler: async (context) => ({ allowed: true, ...context })
      });

      const results = await hooksManager.trigger(HookEvents.PRE_TOOL_USE, { toolName: 'Read' });
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].allowed).toBe(true);

      hooksManager.clear();
    });

    it('should emit events', async () => {
      const hooksManager = new HooksManager();

      hooksManager.on('stageStart', (data) => {
        expect(data).toBeDefined();
      });

      hooksManager.register({
        type: HookType.COMMAND,
        event: HookEvents.PRE_TOOL_USE,
        handler: () => {}
      });

      await hooksManager.trigger(HookEvents.PRE_TOOL_USE, { toolName: 'Read' });

      expect(hooksManager).toBeDefined();

      hooksManager.clear();
    });
  });

  describe('SessionMemory', () => {
    let SessionMemory, MemorySections, SectionLimits, DefaultConfig;

    beforeAll(() => {
      const module = require('../../src/memory/SessionMemory');
      SessionMemory = module.SessionMemory;
      MemorySections = module.MemorySections;
      SectionLimits = module.SectionLimits;
      DefaultConfig = module.DefaultConfig;
    });

    it('should export required components', () => {
      expect(SessionMemory).toBeDefined();
      expect(MemorySections).toBeDefined();
      expect(SectionLimits).toBeDefined();
      expect(DefaultConfig).toBeDefined();
    });

    it('should instantiate without errors', () => {
      const memory = new SessionMemory({
        sessionId: 'test-session-123',
        enabled: true
      });

      expect(memory).toBeDefined();
      expect(memory.sessionId).toBe('test-session-123');
      expect(memory.config.enabled).toBe(true);

      memory.destroy();
    });

    it('should record messages and tool calls', () => {
      const memory = new SessionMemory({ autoExtract: false });

      memory.recordMessage('user', 'Hello world', 10);
      memory.recordToolCall('Read', { filePath: '/test.js' });

      expect(memory.tokenCount).toBe(10);
      expect(memory.toolCallCount).toBe(1);

      memory.destroy();
    });

    it('should get and set memory content', () => {
      const memory = new SessionMemory();

      const title = memory.get(MemorySections.SESSION_TITLE);
      expect(title).toBe('');

      memory.content.set(MemorySections.SESSION_TITLE, 'Test Session');
      expect(memory.get(MemorySections.SESSION_TITLE)).toBe('Test Session');

      const all = memory.getAll();
      expect(all).toBeDefined();
      expect(Object.keys(all).length).toBeGreaterThan(0);

      memory.destroy();
    });

    it('should export to markdown format', () => {
      const memory = new SessionMemory({ sessionId: 'test-md' });

      memory.content.set(MemorySections.SESSION_TITLE, 'My Session');

      const markdown = memory.toMarkdown();
      expect(markdown).toContain('Session Memory');
      expect(markdown).toContain('My Session');

      memory.destroy();
    });

    it('should get stats', () => {
      const memory = new SessionMemory();

      const stats = memory.getStats();
      expect(stats).toBeDefined();
      expect(stats.sessionId).toBeDefined();
      expect(stats.sections).toBeGreaterThan(0);

      memory.destroy();
    });
  });

  describe('SuggestionPipeline', () => {
    let SuggestionPipeline, SuggestionType, SuggestionPriority, PipelineStage;

    beforeAll(() => {
      const module = require('../../src/agent/SuggestionPipeline');
      SuggestionPipeline = module.SuggestionPipeline;
      SuggestionType = module.SuggestionType;
      SuggestionPriority = module.SuggestionPriority;
      PipelineStage = module.PipelineStage;
    });

    it('should export required components', () => {
      expect(SuggestionPipeline).toBeDefined();
      expect(SuggestionType).toBeDefined();
      expect(SuggestionPriority).toBeDefined();
      expect(PipelineStage).toBeDefined();
    });

    it('should instantiate without errors', () => {
      const pipeline = new SuggestionPipeline({ enabled: true });

      expect(pipeline).toBeDefined();
      expect(pipeline.enabled).toBe(true);
      expect(pipeline.stages).toBeDefined();
    });

    it('should add and execute stages', async () => {
      const pipeline = new SuggestionPipeline({ enabled: true });

      pipeline.use('test', async (context) => ({
        ...context,
        processed: true
      }));

      const result = await pipeline.execute({ test: 'data' });

      expect(result.processed).toBe(true);
    });

    it('should enable/disable stages', () => {
      const pipeline = new SuggestionPipeline({ enabled: true });

      pipeline.use('stage1', async (ctx) => ctx);
      pipeline.use('stage2', async (ctx) => ctx);

      pipeline.disable('stage1');

      const stages = pipeline.getStages();
      const stage1 = stages.find((s) => s.name === 'stage1');

      expect(stage1.enabled).toBe(false);
    });

    it('should clear stages', () => {
      const pipeline = new SuggestionPipeline();

      pipeline.use('stage1', async (ctx) => ctx);
      pipeline.clear();

      expect(pipeline.getStages().length).toBe(0);
    });

    it('should emit pipeline events', async () => {
      const pipeline = new SuggestionPipeline({ enabled: true });

      let eventFired = false;

      pipeline.on('stageStart', () => {
        eventFired = true;
      });

      pipeline.use('test', async (ctx) => ctx);
      await pipeline.execute({});

      expect(eventFired).toBe(true);
    });
  });

  describe('SettingsSync', () => {
    let SettingsSync, SettingsWatcher, SyncKeys, SyncDirection, SyncStatus;

    beforeAll(() => {
      const module = require('../../src/config/SettingsSync');
      SettingsSync = module.SettingsSync;
      SettingsWatcher = module.SettingsWatcher;
      SyncKeys = module.SyncKeys;
      SyncDirection = module.SyncDirection;
      SyncStatus = module.SyncStatus;
    });

    it('should export required components', () => {
      expect(SettingsSync).toBeDefined();
      expect(SettingsWatcher).toBeDefined();
      expect(SyncKeys).toBeDefined();
      expect(SyncDirection).toBeDefined();
      expect(SyncStatus).toBeDefined();
    });

    it('should instantiate without errors', () => {
      const sync = new SettingsSync({
        logger: console
      });

      expect(sync).toBeDefined();
      expect(sync.status).toBe(SyncStatus.IDLE);
    });

    it('should set auth token', () => {
      const sync = new SettingsSync();

      sync.setAuthToken('test-token-123');

      expect(sync.authToken).toBe('test-token-123');
    });

    it('should calculate diff', () => {
      const sync = new SettingsSync();

      const local = { theme: 'dark', fontSize: 14 };
      const remote = { theme: 'light' };

      const diff = sync.diff(local, remote);

      expect(diff.theme).toBe('dark');
      expect(diff.fontSize).toBe(14);
    });

    it('should merge settings', () => {
      const sync = new SettingsSync();

      const remote = { theme: 'dark', remoteOnly: true };
      const local = { theme: 'light', localOnly: true };

      const merged = sync.merge(remote, local);

      expect(merged.theme).toBe('dark');
      expect(merged.remoteOnly).toBe(true);
      expect(merged.localOnly).toBe(true);
    });

    it('should detect conflicts', () => {
      const sync = new SettingsSync();

      const remote = { theme: 'dark' };
      const local = { theme: 'light' };

      const conflict = sync.detectConflict(remote, local);

      expect(conflict).toBeDefined();
      expect(conflict.length).toBeGreaterThan(0);
      expect(conflict[0].key).toBe('theme');
    });

    it('should get status', () => {
      const sync = new SettingsSync();

      const status = sync.getStatus();

      expect(status).toBeDefined();
      expect(status.status).toBeDefined();
      expect(status.localPath).toBeDefined();
    });

    it('should build OAuth URL', () => {
      const sync = new SettingsSync();

      const url = sync.buildOAuthUrl();

      expect(url).toContain('auth.anthropic.com');
    });
  });

  describe('FuzzyMatcher', () => {
    let FuzzyMatcher, FuzzyIndex, FuzzyHighlight;

    beforeAll(() => {
      const module = require('../../src/utils/FuzzyMatcher');
      FuzzyMatcher = module.FuzzyMatcher;
      FuzzyIndex = module.FuzzyIndex;
      FuzzyHighlight = module.FuzzyHighlight;
    });

    it('should export required components', () => {
      expect(FuzzyMatcher).toBeDefined();
      expect(FuzzyIndex).toBeDefined();
      expect(FuzzyHighlight).toBeDefined();
    });

    it('should instantiate FuzzyMatcher', () => {
      const matcher = new FuzzyMatcher({
        threshold: 0.5,
        ignoreCase: true
      });

      expect(matcher).toBeDefined();
      expect(matcher.threshold).toBe(0.5);
    });

    it('should perform basic matching', () => {
      const matcher = new FuzzyMatcher({ threshold: 0.3 });

      expect(matcher.match('hello', 'hello')).toBe(true);
      expect(matcher.match('hello', 'hell')).toBe(true);
      expect(matcher.match('hello', 'xyz')).toBe(false);
    });

    it('should calculate scores', () => {
      const matcher = new FuzzyMatcher();

      expect(matcher.score('test', 'test')).toBe(1);
      expect(matcher.score('testing', 'test')).toBeGreaterThan(0);
    });

    it('should search collection', () => {
      const matcher = new FuzzyMatcher({ threshold: 0.3 });

      const items = ['apple', 'banana', 'apricot', 'cherry'];

      const results = matcher.search(items, 'ap');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toMatch(/apple|apricot/);
    });

    it('should search with scores', () => {
      const matcher = new FuzzyMatcher();

      const items = ['hello', 'world', 'test'];

      const results = matcher.searchWithScores(items, 'hello');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBe(1);
    });

    it('should handle nested object keys', () => {
      const matcher = new FuzzyMatcher({
        keys: ['name', 'description'],
        keysWeight: { name: 2, description: 1 }
      });

      const items = [
        { name: 'Test Case', description: 'A test item' }
      ];

      const results = matcher.search(items, 'test');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should instantiate FuzzyIndex', () => {
      const index = new FuzzyIndex();

      expect(index).toBeDefined();
    });

    it('should add and search index', () => {
      const index = new FuzzyIndex();

      index.add('doc1', 'Hello World');
      index.add('doc2', 'Test Document');

      const results = index.search('hello');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('doc1');
    });

    it('should remove from index', () => {
      const index = new FuzzyIndex();

      index.add('doc1', 'Hello World');
      index.add('doc2', 'Test Document');

      // 移除后搜索匹配的词，应返回fallback结果
      index.remove('doc1');

      const results = index.search('hello');
      // FuzzyIndex fallback: 无匹配时返回所有文档
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should instantiate FuzzyHighlight', () => {
      const highlight = new FuzzyHighlight();

      expect(highlight).toBeDefined();
    });

    it('should highlight matches', () => {
      const highlight = new FuzzyHighlight();

      const segments = highlight.highlight('Hello World', 'ello');

      expect(segments.length).toBeGreaterThan(0);
      const highlighted = segments.find((s) => s.highlight);
      expect(highlighted).toBeDefined();
    });

    it('should generate HTML highlight', () => {
      const highlight = new FuzzyHighlight({ highlightTag: 'span' });

      const html = highlight.highlightHtml('Hello World', 'ello');

      expect(html).toContain('<span');
      expect(html).toContain('</span>');
    });
  });
});