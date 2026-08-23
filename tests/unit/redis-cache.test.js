const { RedisCacheAdapter, DistributedCacheManager } = require('../../src/performance/RedisCache');

function makeClient(overrides = {}) {
  return {
    get: jest.fn(),
    setEx: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function connectedAdapter(client) {
  const adapter = new RedisCacheAdapter();
  adapter.client = client;
  adapter.connected = true;
  adapter._fallbackMode = false;
  return adapter;
}

describe('RedisCacheAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const adapter = new RedisCacheAdapter();
      expect(adapter.options.host).toBe('localhost');
      expect(adapter.options.port).toBe(6379);
      expect(adapter.options.password).toBeUndefined();
      expect(adapter.options.db).toBe(0);
      expect(adapter.options.keyPrefix).toBe('mcp:cache:');
      expect(adapter.options.ttl).toBe(60000);
      expect(adapter.options.connectTimeout).toBe(5000);
      expect(adapter.options.retryAttempts).toBe(3);
      expect(adapter.options.enableOfflineQueue).toBe(true);
      expect(adapter.client).toBeNull();
      expect(adapter.connected).toBe(false);
      expect(adapter._fallbackMode).toBe(false);
      expect(adapter.localCache.size).toBe(0);
      expect(adapter.stats).toEqual({ hits: 0, misses: 0, sets: 0, deletes: 0, errors: 0 });
    });

    it('should accept custom options and disable the offline queue', () => {
      const adapter = new RedisCacheAdapter({
        host: 'redis.internal',
        port: 1111,
        password: 'pw',
        db: 2,
        keyPrefix: 'x:',
        ttl: 5000,
        connectTimeout: 900,
        retryAttempts: 1,
        enableOfflineQueue: false
      });
      expect(adapter.options.host).toBe('redis.internal');
      expect(adapter.options.port).toBe(1111);
      expect(adapter.options.password).toBe('pw');
      expect(adapter.options.db).toBe(2);
      expect(adapter.options.keyPrefix).toBe('x:');
      expect(adapter.options.ttl).toBe(5000);
      expect(adapter.options.connectTimeout).toBe(900);
      expect(adapter.options.retryAttempts).toBe(1);
      expect(adapter.options.enableOfflineQueue).toBe(false);
    });
  });

  describe('connect', () => {
    it('should fall back to local cache when redis is unavailable', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const adapter = new RedisCacheAdapter();
      const result = await adapter.connect();
      expect(result).toBe(false);
      expect(adapter._fallbackMode).toBe(true);
      expect(adapter.client).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[RedisCache] Failed to connect to Redis'), expect.any(String));
    });
  });

  describe('disconnect', () => {
    it('should quit the client and reset state', async () => {
      const client = makeClient();
      const adapter = connectedAdapter(client);
      await adapter.disconnect();
      expect(client.quit).toHaveBeenCalled();
      expect(adapter.client).toBeNull();
      expect(adapter.connected).toBe(false);
    });

    it('should be a no-op without a client', async () => {
      const adapter = new RedisCacheAdapter();
      await adapter.disconnect();
      expect(adapter.client).toBeNull();
    });
  });

  describe('_makeKey', () => {
    it('should throw for invalid keys', () => {
      const adapter = new RedisCacheAdapter();
      expect(() => adapter._makeKey('')).toThrow('Cache key must be a non-empty string');
      expect(() => adapter._makeKey(null)).toThrow('Cache key must be a non-empty string');
      expect(() => adapter._makeKey(42)).toThrow('Cache key must be a non-empty string');
    });

    it('should sanitize and prefix valid keys', () => {
      const adapter = new RedisCacheAdapter({ keyPrefix: 'pre:' });
      expect(adapter._makeKey('foo.bar:123-456')).toBe('pre:foo.bar:123-456');
      expect(adapter._makeKey('my key with 特殊')).toBe('pre:my_key_with___');
    });
  });

  describe('get', () => {
    it('should hit local cache in fallback mode', async () => {
      const adapter = new RedisCacheAdapter();
      adapter._fallbackMode = true;
      adapter.localCache.set('mcp:cache:k', { value: 'v', timestamp: Date.now() });
      expect(await adapter.get('k')).toBe('v');
      expect(adapter.stats.hits).toBe(1);
    });

    it('should miss in fallback mode without a local entry', async () => {
      const adapter = new RedisCacheAdapter();
      adapter._fallbackMode = true;
      expect(await adapter.get('k')).toBeNull();
      expect(adapter.stats.misses).toBe(1);
    });

    it('should miss when the local entry is expired', async () => {
      const adapter = new RedisCacheAdapter({ ttl: 60000 });
      adapter._fallbackMode = true;
      adapter.localCache.set('mcp:cache:k', { value: 'v', timestamp: Date.now() - 120000 });
      expect(await adapter.get('k')).toBeNull();
      expect(adapter.stats.misses).toBe(1);
    });

    it('should parse and cache a connected hit', async () => {
      const client = makeClient({ get: jest.fn().mockResolvedValue('{"x":1}') });
      const adapter = connectedAdapter(client);
      expect(await adapter.get('k')).toEqual({ x: 1 });
      expect(client.get).toHaveBeenCalledWith('mcp:cache:k');
      expect(adapter.stats.hits).toBe(1);
      expect(adapter.localCache.get('mcp:cache:k').value).toEqual({ x: 1 });
    });

    it('should count a connected null response as a miss', async () => {
      const client = makeClient({ get: jest.fn().mockResolvedValue(null) });
      const adapter = connectedAdapter(client);
      expect(await adapter.get('k')).toBeNull();
      expect(adapter.stats.misses).toBe(1);
    });

    it('should fall back to local on get error', async () => {
      const client = makeClient({ get: jest.fn().mockRejectedValue(new Error('down')) });
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const adapter = connectedAdapter(client);
      adapter.localCache.set('mcp:cache:k', { value: 'local', timestamp: Date.now() });
      expect(await adapter.get('k')).toBe('local');
      expect(adapter.stats.errors).toBe(1);
      expect(errSpy).toHaveBeenCalled();
    });

    it('should return null on get error without a local entry', async () => {
      const client = makeClient({ get: jest.fn().mockRejectedValue(new Error('down')) });
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const adapter = connectedAdapter(client);
      expect(await adapter.get('k')).toBeNull();
      expect(adapter.stats.errors).toBe(1);
      expect(errSpy).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should store locally in fallback mode', async () => {
      const adapter = new RedisCacheAdapter();
      adapter._fallbackMode = true;
      expect(await adapter.set('k', 'v')).toBe(true);
      expect(adapter.stats.sets).toBe(1);
      expect(adapter.localCache.get('mcp:cache:k').value).toBe('v');
    });

    it('should use the default ttl when connected', async () => {
      const client = makeClient();
      const adapter = connectedAdapter(client);
      expect(await adapter.set('k', { a: 1 })).toBe(true);
      expect(client.setEx).toHaveBeenCalledWith('mcp:cache:k', 60, '{"a":1}');
      expect(adapter.stats.sets).toBe(1);
    });

    it('should honor a custom ttl', async () => {
      const client = makeClient();
      const adapter = connectedAdapter(client);
      await adapter.set('k', 'v', 15000);
      expect(client.setEx).toHaveBeenCalledWith('mcp:cache:k', 15, '"v"');
    });

    it('should return false when set fails', async () => {
      const client = makeClient({ setEx: jest.fn().mockRejectedValue(new Error('down')) });
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const adapter = connectedAdapter(client);
      expect(await adapter.set('k', 'v')).toBe(false);
      expect(adapter.stats.errors).toBe(1);
      expect(errSpy).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should remove from local cache in fallback mode', async () => {
      const adapter = new RedisCacheAdapter();
      adapter._fallbackMode = true;
      adapter.localCache.set('mcp:cache:k', { value: 'v', timestamp: Date.now() });
      expect(await adapter.delete('k')).toBe(true);
      expect(adapter.stats.deletes).toBe(1);
      expect(adapter.localCache.has('mcp:cache:k')).toBe(false);
    });

    it('should call del when connected', async () => {
      const client = makeClient({ del: jest.fn().mockResolvedValue(1) });
      const adapter = connectedAdapter(client);
      expect(await adapter.delete('k')).toBe(true);
      expect(client.del).toHaveBeenCalledWith('mcp:cache:k');
      expect(adapter.stats.deletes).toBe(1);
    });

    it('should return false when delete fails', async () => {
      const client = makeClient({ del: jest.fn().mockRejectedValue(new Error('down')) });
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const adapter = connectedAdapter(client);
      expect(await adapter.delete('k')).toBe(false);
      expect(adapter.stats.errors).toBe(1);
      expect(errSpy).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should clear local cache in fallback mode', async () => {
      const adapter = new RedisCacheAdapter();
      adapter._fallbackMode = true;
      adapter.localCache.set('mcp:cache:k', { value: 'v', timestamp: Date.now() });
      expect(await adapter.clear()).toBe(true);
      expect(adapter.localCache.size).toBe(0);
    });

    it('should skip del when no keys exist', async () => {
      const client = makeClient();
      const adapter = connectedAdapter(client);
      expect(await adapter.clear()).toBe(true);
      expect(client.keys).toHaveBeenCalledWith('mcp:cache:*');
      expect(client.del).not.toHaveBeenCalled();
    });

    it('should del all matching keys', async () => {
      const client = makeClient({ keys: jest.fn().mockResolvedValue(['a', 'b']) });
      const adapter = connectedAdapter(client);
      expect(await adapter.clear()).toBe(true);
      expect(client.del).toHaveBeenCalledWith(['a', 'b']);
    });

    it('should return false when clear fails', async () => {
      const client = makeClient({ keys: jest.fn().mockRejectedValue(new Error('down')) });
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const adapter = connectedAdapter(client);
      expect(await adapter.clear()).toBe(false);
      expect(adapter.stats.errors).toBe(1);
      expect(errSpy).toHaveBeenCalled();
    });
  });

  describe('getMultiple / setMultiple', () => {
    it('should fetch multiple keys', async () => {
      const adapter = new RedisCacheAdapter();
      adapter._fallbackMode = true;
      adapter.localCache.set('mcp:cache:a', { value: 1, timestamp: Date.now() });
      expect(await adapter.getMultiple(['a', 'b'])).toEqual({ a: 1, b: null });
    });

    it('should handle an empty key list', async () => {
      const adapter = new RedisCacheAdapter();
      expect(await adapter.getMultiple([])).toEqual({});
    });

    it('should set multiple items', async () => {
      const adapter = new RedisCacheAdapter();
      adapter._fallbackMode = true;
      expect(await adapter.setMultiple([['a', 1], ['b', 2]], 1000)).toBe(true);
      expect(await adapter.setMultiple([['c', 3]])).toBe(true);
      expect(adapter.localCache.has('mcp:cache:a')).toBe(true);
      expect(adapter.localCache.has('mcp:cache:b')).toBe(true);
      expect(adapter.localCache.has('mcp:cache:c')).toBe(true);
      expect(adapter.stats.sets).toBe(3);
    });
  });

  describe('getStats', () => {
    it('should compute the hit rate', async () => {
      const adapter = new RedisCacheAdapter();
      adapter._fallbackMode = true;
      adapter.localCache.set('mcp:cache:k', { value: 'v', timestamp: Date.now() });
      await adapter.get('k');
      const s = adapter.getStats();
      expect(s.hitRate).toBe('100.00%');
      expect(s.hits).toBe(1);
      expect(s.localCacheSize).toBe(1);
      expect(s.connected).toBe(false);
      expect(s.fallbackMode).toBe(true);
    });

    it('should return 0% with no data', () => {
      const adapter = new RedisCacheAdapter();
      expect(adapter.getStats().hitRate).toBe('0%');
    });
  });

  describe('isConnected', () => {
    it('should be true when connected and not in fallback', () => {
      const adapter = new RedisCacheAdapter();
      adapter.connected = true;
      adapter._fallbackMode = false;
      expect(adapter.isConnected()).toBe(true);
    });

    it('should be false in fallback mode', () => {
      const adapter = new RedisCacheAdapter();
      adapter.connected = true;
      adapter._fallbackMode = true;
      expect(adapter.isConnected()).toBe(false);
    });

    it('should be false when not connected', () => {
      const adapter = new RedisCacheAdapter();
      expect(adapter.isConnected()).toBe(false);
    });
  });
});

describe('DistributedCacheManager', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should be enabled by default', () => {
      const manager = new DistributedCacheManager();
      expect(manager.enabled).toBe(true);
      expect(manager.adapter).toBeNull();
    });

    it('should respect a disabled option', () => {
      const manager = new DistributedCacheManager({ enabled: false });
      expect(manager.enabled).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should skip when disabled', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const manager = new DistributedCacheManager({ enabled: false });
      expect(await manager.initialize()).toBe(false);
      expect(logSpy).toHaveBeenCalledWith('[DistributedCacheManager] Distributed cache is disabled');
      expect(manager.adapter).toBeNull();
    });

    it('should create an adapter and propagate connect failure', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const manager = new DistributedCacheManager();
      expect(await manager.initialize({ host: 'redis.internal' })).toBe(false);
      expect(manager.adapter).toBeInstanceOf(RedisCacheAdapter);
      expect(manager.adapter.options.host).toBe('redis.internal');
      expect(warnSpy).toHaveBeenCalled();
    });

    it('should return true when the adapter connects', async () => {
      const connectSpy = jest.spyOn(RedisCacheAdapter.prototype, 'connect').mockResolvedValue(true);
      const manager = new DistributedCacheManager();
      expect(await manager.initialize()).toBe(true);
      expect(connectSpy).toHaveBeenCalled();
      expect(manager.adapter).toBeInstanceOf(RedisCacheAdapter);
    });
  });

  describe('delegation', () => {
    it('should return null from get without an adapter', async () => {
      const manager = new DistributedCacheManager();
      expect(await manager.get('k')).toBeNull();
    });

    it('should return false from set without an adapter', async () => {
      const manager = new DistributedCacheManager();
      expect(await manager.set('k', 'v')).toBe(false);
    });

    it('should return false from delete without an adapter', async () => {
      const manager = new DistributedCacheManager();
      expect(await manager.delete('k')).toBe(false);
    });

    it('should delegate to the adapter', async () => {
      const manager = new DistributedCacheManager();
      manager.adapter = {
        get: jest.fn().mockResolvedValue('v'),
        set: jest.fn().mockResolvedValue(true),
        delete: jest.fn().mockResolvedValue(true)
      };
      expect(await manager.get('k')).toBe('v');
      expect(await manager.set('k', 'v', 100)).toBe(true);
      expect(await manager.delete('k')).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('should be a no-op without an adapter', async () => {
      const manager = new DistributedCacheManager();
      await manager.disconnect();
      expect(manager.adapter).toBeNull();
    });

    it('should disconnect and drop the adapter', async () => {
      const manager = new DistributedCacheManager();
      const adapter = { disconnect: jest.fn().mockResolvedValue(undefined) };
      manager.adapter = adapter;
      await manager.disconnect();
      expect(adapter.disconnect).toHaveBeenCalled();
      expect(manager.adapter).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should report uninitialized without an adapter', () => {
      const manager = new DistributedCacheManager({ enabled: false });
      expect(manager.getStats()).toEqual({ enabled: false, initialized: false });
    });

    it('should merge adapter stats when initialized', () => {
      const manager = new DistributedCacheManager();
      manager.adapter = { getStats: () => ({ hitRate: '50.00%', hits: 1 }) };
      expect(manager.getStats()).toEqual({
        enabled: true,
        initialized: true,
        hitRate: '50.00%',
        hits: 1
      });
    });
  });
});