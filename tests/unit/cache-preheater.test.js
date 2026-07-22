const { CachePreheater, createMCPToolPreheater } = require('../../src/performance/CachePreheater');

describe('CachePreheater', () => {
  let preheater;

  beforeEach(() => {
    preheater = new CachePreheater();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(preheater.warmupStrategies).toBeInstanceOf(Map);
      expect(preheater.warmupQueue).toEqual([]);
      expect(preheater.isWarming).toBe(false);
      expect(preheater.options.enabled).toBe(true);
      expect(preheater.options.maxConcurrent).toBe(5);
      expect(preheater.options.retryAttempts).toBe(3);
    });

    it('should accept custom options', () => {
      const p = new CachePreheater({ enabled: false, maxConcurrent: 2 });
      expect(p.options.enabled).toBe(false);
      expect(p.options.maxConcurrent).toBe(2);
    });
  });

  describe('registerStrategy', () => {
    it('should register a strategy', () => {
      preheater.registerStrategy('test', {
        priority: 10,
        items: ['a', 'b'],
        executor: jest.fn()
      });
      const strategy = preheater.warmupStrategies.get('test');
      expect(strategy.name).toBe('test');
      expect(strategy.priority).toBe(10);
      expect(strategy.items).toEqual(['a', 'b']);
      expect(typeof strategy.executor).toBe('function');
    });

    it('should set default condition and ttl', () => {
      preheater.registerStrategy('test', { executor: jest.fn() });
      const strategy = preheater.warmupStrategies.get('test');
      expect(typeof strategy.condition).toBe('function');
      expect(strategy.condition()).toBe(true);
      expect(strategy.ttl).toBe(300000);
    });
  });

  describe('addWarmupItem', () => {
    it('should add a warmup item to queue', () => {
      preheater.addWarmupItem('test-key', 'cache-key', { foo: 'bar' });
      expect(preheater.warmupQueue).toHaveLength(1);
      expect(preheater.warmupQueue[0].name).toBe('test-key');
      expect(preheater.warmupQueue[0].key).toBe('cache-key');
    });

    it('should accept null key', () => {
      preheater.addWarmupItem('test-key', null, {});
      expect(preheater.warmupQueue).toHaveLength(1);
    });

    it('should throw for invalid name', () => {
      expect(() => preheater.addWarmupItem(null, 'key', {})).toThrow();
      expect(() => preheater.addWarmupItem(123, 'key', {})).toThrow();
    });

    it('should throw for invalid key', () => {
      expect(() => preheater.addWarmupItem('name', 123, {})).toThrow();
    });

    it('should throw for invalid data', () => {
      expect(() => preheater.addWarmupItem('name', 'key', 'string')).toThrow();
    });
  });

  describe('preheat', () => {
    it('should return skipped if disabled', async () => {
      const p = new CachePreheater({ enabled: false });
      const result = await p.preheat({});
      expect(result.skipped).toBe(true);
    });

    it('should return skipped if already warming', async () => {
      preheater.isWarming = true;
      const result = await preheater.preheat({});
      expect(result.skipped).toBe(true);
    });

    it('should execute strategies and queue items', async () => {
      const executor = jest.fn().mockResolvedValue();
      preheater.registerStrategy('test', {
        priority: 10,
        items: [
          { key: 'item1', name: 'Item 1' },
          { key: 'item2', name: 'Item 2' }
        ],
        executor
      });
      preheater.addWarmupItem('queue-item', 'queue-key', { data: 1 });

      const mockBridge = { _isCacheable: jest.fn() };
      const result = await preheater.preheat(mockBridge);
      expect(result.preheated).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
      expect(executor).toHaveBeenCalledTimes(2);
    });

    it('should handle strategy executor errors gracefully', async () => {
      const executor = jest.fn().mockRejectedValue(new Error('Network error'));
      preheater.registerStrategy('test', {
        priority: 10,
        items: [
          { key: 'item1', name: 'Item 1' }
        ],
        executor
      });

      const result = await preheater.preheat({});
      expect(result.preheated).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
    });

    it('should sort strategies by priority descending', async () => {
      const execOrder = [];
      preheater.registerStrategy('low', { priority: 1, items: [{ key: 'low' }], executor: jest.fn().mockImplementation(async () => { execOrder.push('low'); }) });
      preheater.registerStrategy('high', { priority: 100, items: [{ key: 'high' }], executor: jest.fn().mockImplementation(async () => { execOrder.push('high'); }) });

      await preheater.preheat({});
      expect(execOrder[0]).toBe('high');
    });

    it('should skip strategies whose condition returns false', async () => {
      const executor = jest.fn();
      preheater.registerStrategy('skip', {
        priority: 10,
        items: [{ key: 'test' }],
        executor,
        condition: () => false
      });

      const result = await preheater.preheat({});
      expect(result.preheated).toHaveLength(0);
      expect(executor).not.toHaveBeenCalled();
    });

    it('should handle strategy items as a function', async () => {
      const executor = jest.fn().mockResolvedValue();
      preheater.registerStrategy('dynamic', {
        priority: 10,
        items: () => [
          { key: 'dynamic-1' },
          { key: 'dynamic-2' }
        ],
        executor
      });

      await preheater.preheat({});
      expect(executor).toHaveBeenCalledTimes(2);
    });

    it('should handle invalid strategy items', async () => {
      preheater.registerStrategy('bad', {
        priority: 10,
        items: 'not-an-array',
        executor: jest.fn()
      });

      const result = await preheater.preheat({});
      expect(result.preheated).toHaveLength(0);
    });

    it('should emit preheat-complete event', async () => {
      const handler = jest.fn();
      preheater.on('preheat-complete', handler);

      preheater.registerStrategy('test', {
        priority: 10,
        items: [{ key: 'item1' }],
        executor: jest.fn().mockResolvedValue()
      });

      await preheater.preheat({});
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStats', () => {
    it('should return current stats', () => {
      const stats = preheater.getStats();
      expect(stats.totalPreheated).toBe(0);
      expect(stats.isWarming).toBe(false);
      expect(stats.strategiesCount).toBe(0);
      expect(stats.queueSize).toBe(0);
      expect(stats.duration).toBeNull();
    });

    it('should reflect warming state', async () => {
      preheater.registerStrategy('test', {
        items: [{ key: 'a' }],
        executor: jest.fn().mockResolvedValue()
      });
      const promise = preheater.preheat({});
      expect(preheater.isWarming).toBe(true);
      await promise;
      expect(preheater.isWarming).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear warmup queue', () => {
      preheater.addWarmupItem('test', 'key', {});
      preheater.clear();
      expect(preheater.warmupQueue).toHaveLength(0);
    });
  });

  describe('destroy', () => {
    it('should clear queue, strategies, and listeners', () => {
      preheater.registerStrategy('test', { executor: jest.fn() });
      preheater.addWarmupItem('test', 'key', {});
      const handler = jest.fn();
      preheater.on('test', handler);

      preheater.destroy();
      expect(preheater.warmupQueue).toHaveLength(0);
      expect(preheater.warmupStrategies.size).toBe(0);
    });
  });

  describe('createMCPToolPreheater', () => {
    it('should create a preheater with MCP strategy', () => {
      const mockBridge = {
        clients: new Map([['server1', {}]]),
        serverToTools: new Map([['server1', [{ fullName: 'server1:tool1', inputSchema: { properties: { param1: { type: 'string' } }, required: ['param1'] } }]]]),
        _isCacheable: jest.fn().mockReturnValue(true),
        call: jest.fn().mockResolvedValue({})
      };
      const p = createMCPToolPreheater(mockBridge);
      expect(p.warmupStrategies.has('mcp-tools')).toBe(true);
      const strategy = p.warmupStrategies.get('mcp-tools');
      expect(strategy.priority).toBe(100);
    });

    it('should handle bridge with no clients', () => {
      const p = createMCPToolPreheater({ clients: new Map() });
      expect(p.options.enabled).toBe(true);
    });

    it('should execute MCP preheater strategy - executor with cacheable bridge', async () => {
      const mockCall = jest.fn().mockResolvedValue({});
      const mockBridge = {
        clients: new Map([['server1', {}]]),
        serverToTools: new Map([['server1', [
          { fullName: 'server1:tool1', inputSchema: { type: 'object', properties: { param1: { type: 'string' } }, required: ['param1'] } }
        ]]]),
        _isCacheable: jest.fn().mockReturnValue(true),
        call: mockCall
      };
      const p = createMCPToolPreheater(mockBridge);
      const strategy = p.warmupStrategies.get('mcp-tools');
      expect(strategy.condition()).toBe(true);
      expect(await strategy.items()).toHaveLength(1);
      await strategy.executor(mockBridge, (await strategy.items())[0]);
      expect(mockCall).toHaveBeenCalled();
    });

    it('should handle MCP preheater when bridge has no serverToTools', () => {
      const mockBridge = {
        clients: new Map([['server1', {}]])
      };
      const p = createMCPToolPreheater(mockBridge);
      const strategy = p.warmupStrategies.get('mcp-tools');
      expect(strategy.condition()).toBe(true);
    });
  });

  describe('_warmupItem', () => {
    it('should warm up item with executor that fails', async () => {
      const errorExecutor = jest.fn().mockRejectedValue(new Error('warmup failed'));
      preheater.warmupQueue.push({
        name: 'failing-item',
        key: 'fail-key',
        data: {},
        executor: errorExecutor,
        addedAt: Date.now()
      });
      preheater.registerStrategy('noop', { items: [], executor: jest.fn() });
      const result = await preheater.preheat({});
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].key).toBe('fail-key');
    });

    it('should warm up item with executor that succeeds', async () => {
      const successExecutor = jest.fn().mockResolvedValue('done');
      preheater.warmupQueue.push({
        name: 'success-item',
        key: 'ok-key',
        data: {},
        executor: successExecutor,
        addedAt: Date.now()
      });
      preheater.registerStrategy('noop', { items: [], executor: jest.fn() });
      const result = await preheater.preheat({});
      expect(result.preheated).toContain('ok-key');
    });
  });

  describe('getStats after preheat', () => {
    it('should include non-null duration after preheat', async () => {
      preheater.registerStrategy('test', {
        items: [{ key: 'a' }],
        executor: jest.fn().mockResolvedValue()
      });
      await preheater.preheat({});
      const stats = preheater.getStats();
      expect(stats.duration).not.toBeNull();
      expect(typeof stats.duration).toBe('number');
    });
  });

  describe('_getSampleValue', () => {
    it('should handle all types via MCP preheater executor', async () => {
      const mockCall = jest.fn().mockResolvedValue({});
      const tools = [
        { fullName: 's:t1', inputSchema: { type: 'object', properties: { p1: { type: 'string' }, p2: { type: 'number' }, p3: { type: 'boolean' }, p4: { type: 'array' }, p5: { type: 'object' }, p6: { type: 'unknown' } }, required: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] } }
      ];
      const mockBridge = {
        clients: new Map([['s', {}]]),
        serverToTools: new Map([['s', tools]]),
        _isCacheable: jest.fn().mockReturnValue(true),
        call: mockCall
      };
      const p = createMCPToolPreheater(mockBridge);
      const strategy = p.warmupStrategies.get('mcp-tools');
      const items = await strategy.items();
      expect(items).toHaveLength(1);
      expect(items[0].sampleParams).toEqual({ p1: '', p2: 0, p3: false, p4: [], p5: {}, p6: null });
      await strategy.executor(mockBridge, items[0]);
      expect(mockCall).toHaveBeenCalledWith('s:t1', items[0].sampleParams, { skipCache: false });
    });
  });
});
