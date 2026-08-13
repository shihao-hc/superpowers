'use strict';

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
    readdir: jest.fn(),
    access: jest.fn(),
    stat: jest.fn(),
    rmdir: jest.fn()
  }
}));

const fs = require('fs').promises;
const { CacheEntry, MemoryCache, FileCache, RedisCache, MultiLevelCache } = require('../../src/multiagent/patterns/MultiLevelCache');

describe('CacheEntry', () => {
  let now;

  beforeEach(() => {
    now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    Date.now.mockRestore();
  });

  it('should store value, ttl, and metadata defaults', () => {
    const entry = new CacheEntry('val', 1000, { source: 'test' });
    expect(entry.value).toBe('val');
    expect(entry.ttl).toBe(1000);
    expect(entry.metadata).toEqual({ source: 'test' });
    expect(entry.createdAt).toBe(now);
    expect(entry.accessCount).toBe(0);
    expect(entry.lastAccessed).toBe(now);
  });

  it('should set metadata to empty object when not provided', () => {
    const entry = new CacheEntry('val', 1000);
    expect(entry.metadata).toEqual({});
  });

  it('isExpired returns false when ttl <= 0', () => {
    const entry = new CacheEntry('val', 0);
    expect(entry.isExpired()).toBe(false);
    const entry2 = new CacheEntry('val', -1);
    expect(entry2.isExpired()).toBe(false);
  });

  it('isExpired returns false when within TTL', () => {
    const entry = new CacheEntry('val', 1000);
    expect(entry.isExpired()).toBe(false);
  });

  it('isExpired returns true after TTL', () => {
    const entry = new CacheEntry('val', 1000);
    now += 1001;
    expect(entry.isExpired()).toBe(true);
  });

  it('access increments count and updates lastAccessed', () => {
    const entry = new CacheEntry('val', 1000);
    now += 500;
    const result = entry.access();
    expect(result).toBe('val');
    expect(entry.accessCount).toBe(1);
    expect(entry.lastAccessed).toBe(now);
  });

  it('toJSON and fromJSON roundtrip', () => {
    const entry = new CacheEntry({ nested: true }, 2000, { ver: 1 });
    entry.access();
    const json = entry.toJSON();
    const restored = CacheEntry.fromJSON(json);
    expect(restored.value).toEqual({ nested: true });
    expect(restored.ttl).toBe(2000);
    expect(restored.metadata).toEqual({ ver: 1 });
    expect(restored.createdAt).toBe(now);
    expect(restored.accessCount).toBe(1);
    expect(restored.lastAccessed).toBe(now);
  });

  it('fromJSON handles missing accessCount and lastAccessed', () => {
    const restored = CacheEntry.fromJSON({ value: 'x', ttl: 100, createdAt: 100, metadata: {} });
    expect(restored.accessCount).toBe(0);
    expect(restored.lastAccessed).toBe(100);
  });
});

describe('MemoryCache', () => {
  let cache;
  let now;

  beforeEach(() => {
    now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    cache = new MemoryCache({ maxSize: 3, defaultTTL: 60000 });
  });

  afterEach(() => {
    Date.now.mockRestore();
  });

  describe('constructor', () => {
    it('should set default options', () => {
      const c = new MemoryCache();
      expect(c.maxSize).toBe(1000);
      expect(c.defaultTTL).toBe(300000);
      expect(c.cache instanceof Map).toBe(true);
      expect(c.accessOrder).toEqual([]);
      expect(c.stats).toEqual({ hits: 0, misses: 0, evictions: 0 });
    });

    it('should accept custom options', () => {
      const c = new MemoryCache({ maxSize: 50, defaultTTL: 5000 });
      expect(c.maxSize).toBe(50);
      expect(c.defaultTTL).toBe(5000);
    });
  });

  describe('_generateKey', () => {
    it('should return string directly for primitive strings', () => {
      const key = cache._generateKey('hello');
      expect(typeof key).toBe('string');
      expect(key).toBe('hello');
    });

    it('should return string for numbers', () => {
      const key = cache._generateKey(42);
      expect(key).toBe('42');
    });

    it('should hash objects', () => {
      const key1 = cache._generateKey({ a: 1 });
      const key2 = cache._generateKey({ a: 1 });
      expect(key1).toBe(key2);
      expect(key1.length).toBe(64); // sha256 hex
    });

    it('should produce different hashes for different objects', () => {
      const k1 = cache._generateKey({ a: 1 });
      const k2 = cache._generateKey({ a: 2 });
      expect(k1).not.toBe(k2);
    });
  });

  describe('set and get', () => {
    it('should store and retrieve a value', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for non-existent key', () => {
      expect(cache.get('nope')).toBeNull();
    });

    it('should update existing key', () => {
      cache.set('key', 'old');
      cache.set('key', 'new');
      expect(cache.get('key')).toBe('new');
    });

    it('should use defaultTTL when not specified', () => {
      cache.set('key', 'val');
      now += 60001;
      expect(cache.get('key')).toBeNull();
    });

    it('should respect custom TTL per entry', () => {
      cache.set('key', 'val', 10000);
      now += 5000;
      expect(cache.get('key')).toBe('val');
      now += 6000;
      expect(cache.get('key')).toBeNull();
    });

    it('should return null for expired entry', () => {
      cache.set('key', 'val', 100);
      now += 101;
      expect(cache.get('key')).toBeNull();
    });

    it('should delete expired entry from cache', () => {
      cache.set('key', 'val', 100);
      now += 101;
      cache.get('key');
      expect(cache.cache.has(cache._generateKey('key'))).toBe(false);
    });

    it('should store object keys', () => {
      cache.set({ id: 1 }, 'found');
      expect(cache.get({ id: 1 })).toBe('found');
    });
  });

  describe('delete', () => {
    it('should delete existing key and return true', () => {
      cache.set('key', 'val');
      expect(cache.delete('key')).toBe(true);
      expect(cache.get('key')).toBeNull();
    });

    it('should return false for non-existent key', () => {
      expect(cache.delete('nope')).toBe(false);
    });

    it('should remove key from accessOrder', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.delete('a');
      expect(cache.accessOrder).toEqual([cache._generateKey('b')]);
    });

    it('should handle delete when key missing from accessOrder', () => {
      const hash = cache._generateKey('a');
      cache.cache.set(hash, new CacheEntry(1, 60000));
      cache.delete('a');
      expect(cache.get('a')).toBeNull();
    });

    it('should handle update when key missing from accessOrder', () => {
      const hash = cache._generateKey('a');
      cache.cache.set(hash, new CacheEntry(1, 60000));
      cache.accessOrder = [];
      cache.set('a', 2);
      expect(cache.get('a')).toBe(2);
    });
  });

  describe('clear', () => {
    it('should remove all entries and return size', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      const cleared = cache.clear();
      expect(cleared).toBe(2);
      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBeNull();
      expect(cache.accessOrder).toEqual([]);
    });

    it('should return 0 on empty cache', () => {
      expect(cache.clear()).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when at capacity', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // should evict 'a'
      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    it('should skip eviction when oldest key already removed', () => {
      cache.set('a', 1, 100);
      cache.set('b', 2);
      now += 101;
      cache.get('a'); // expired -> cache.delete(hash) but accessOrder keeps it
      cache.set('c', 3);
      cache.set('d', 4);
      cache.set('e', 5); // triggers eviction; 'a' in accessOrder but not cache
      expect(cache.get('a')).toBeNull();
      expect(cache.stats.evictions).toBeGreaterThanOrEqual(1);
    });

    it('should NOT evict recently accessed key', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.get('a'); // promote 'a' to most recent
      cache.set('d', 4); // should evict 'b'
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBeNull();
    });

    it('should track eviction count in stats', () => {
      for (let i = 0; i < 10; i++) { cache.set(`k${i}`, i); }
      expect(cache.stats.evictions).toBe(7);
    });

    it('should handle re-set after expired entry removal', () => {
      cache.set('k', 'old', 100);
      now += 101;
      cache.get('k'); // deletes cache entry, keeps accessOrder
      cache.set('k', 'new'); // cache.has false -> new entry
      expect(cache.get('k')).toBe('new');
    });
  });

  describe('stats', () => {
    it('should start with zeros', () => {
      expect(cache.getStats().hits).toBe(0);
      expect(cache.getStats().misses).toBe(0);
      expect(cache.getStats().evictions).toBe(0);
    });

    it('should track hits and misses', () => {
      cache.set('k', 'v');
      cache.get('k');
      cache.get('missing');
      const s = cache.getStats();
      expect(s.hits).toBe(1);
      expect(s.misses).toBe(1);
    });

    it('should calculate hitRate = 0 when no operations', () => {
      expect(cache.getStats().hitRate).toBe(0);
    });

    it('should calculate hitRate correctly', () => {
      cache.set('k', 'v');
      cache.get('k');
      cache.get('k');
      cache.get('missing');
      expect(cache.getStats().hitRate).toBe('0.6667');
    });

    it('should report size and maxSize', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      const s = cache.getStats();
      expect(s.size).toBe(2);
      expect(s.maxSize).toBe(3);
    });
  });
});

describe('FileCache', () => {
  let fileCache;
  let now;

  beforeEach(() => {
    jest.resetAllMocks();
    now = 1000000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    fileCache = new FileCache({ cacheDir: '/tmp/cache', defaultTTL: 3600000 });
  });

  afterEach(() => {
    Date.now.mockRestore();
  });

  describe('constructor', () => {
    it('should set defaults', () => {
      const c = new FileCache();
      expect(c.cacheDir).toBe('./cache');
      expect(c.defaultTTL).toBe(3600000);
      expect(c.maxSize).toBe(100 * 1024 * 1024);
    });
  });

  describe('_getFilePath', () => {
    it('should return dir and filePath with subdir', () => {
      const result = fileCache._getFilePath('mykey');
      expect(result.dir).toContain('tmp');
      expect(result.dir).toContain('cache');
      expect(result.dir).toMatch(/[0-9a-f]{2}$/);
      expect(result.filePath).toMatch(/\.json$/);
      expect(result.filePath).toContain(result.dir);
    });

    it('should hash string keys deterministically', () => {
      const r1 = fileCache._getFilePath('mykey');
      const r2 = fileCache._getFilePath('mykey');
      expect(r1.filePath).toBe(r2.filePath);
    });

    it('should hash object keys', () => {
      const r1 = fileCache._getFilePath({ a: 1 });
      const r2 = fileCache._getFilePath({ a: 1 });
      expect(r1.filePath).toBe(r2.filePath);
    });
  });

  describe('ensureDir', () => {
    it('should call mkdir with recursive', async () => {
      await fileCache.ensureDir('/tmp/cache/ab');
      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/cache/ab', { recursive: true });
    });

    it('should not throw on mkdir error', async () => {
      fs.mkdir.mockRejectedValueOnce(new Error('EEXIST'));
      await expect(fileCache.ensureDir('/tmp/x')).resolves.toBeUndefined();
    });
  });

  describe('get', () => {
    it('should return null when file not found', async () => {
      fs.access.mockRejectedValueOnce(new Error('ENOENT'));
      const result = await fileCache.get('missing');
      expect(result).toBeNull();
    });

    it('should return null for expired entry', async () => {
      const entry = new CacheEntry('val', 100);
      now += 200;
      fs.access.mockResolvedValueOnce();
      fs.readFile.mockResolvedValueOnce(JSON.stringify(entry.toJSON()));
      const result = await fileCache.get('key');
      expect(result).toBeNull();
    });

    it('should delete expired entry', async () => {
      const entry = new CacheEntry('val', 100);
      now += 200;
      fs.access.mockResolvedValueOnce();
      fs.readFile.mockResolvedValueOnce(JSON.stringify(entry.toJSON()));
      await fileCache.get('key');
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should return value for valid entry', async () => {
      fs.access.mockResolvedValueOnce();
      const entry = new CacheEntry('hello', 3600000);
      fs.readFile.mockResolvedValueOnce(JSON.stringify(entry.toJSON()));
      const result = await fileCache.get('key');
      expect(result).toBe('hello');
    });
  });

  describe('set', () => {
    it('should write JSON to file', async () => {
      fs.mkdir.mockResolvedValueOnce();
      fs.writeFile.mockResolvedValueOnce();
      await fileCache.set('key', 'value', 5000);
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      const writeArg = JSON.parse(fs.writeFile.mock.calls[0][1]);
      expect(writeArg.value).toBe('value');
      expect(writeArg.ttl).toBe(5000);
    });

    it('should use default TTL when not specified', async () => {
      fs.mkdir.mockResolvedValueOnce();
      fs.writeFile.mockResolvedValueOnce();
      await fileCache.set('key', 'value');
      const writeArg = JSON.parse(fs.writeFile.mock.calls[0][1]);
      expect(writeArg.ttl).toBe(3600000);
    });
  });

  describe('delete', () => {
    it('should unlink and return true', async () => {
      fs.unlink.mockResolvedValueOnce();
      const result = await fileCache.delete('key');
      expect(result).toBe(true);
    });

    it('should return false on failure', async () => {
      fs.unlink.mockRejectedValueOnce(new Error('ENOENT'));
      const result = await fileCache.delete('nope');
      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all files recursively', async () => {
      fs.readdir.mockResolvedValueOnce(['subdir']);
      fs.readdir.mockResolvedValueOnce(['file1.json', 'file2.json']);
      fs.stat.mockImplementation((p) => {
        if (p.endsWith('subdir')) return Promise.resolve({ isDirectory: () => true });
        return Promise.resolve({ isDirectory: () => false });
      });
      fs.unlink.mockResolvedValue();
      fs.rmdir.mockResolvedValue();

      const count = await fileCache.clear();
      expect(count).toBe(2);
      expect(fs.rmdir).toHaveBeenCalled();
    });

    it('should log and skip when directory read fails', async () => {
      fs.readdir.mockRejectedValueOnce(new Error('EACCES'));
      const logger = { debug: jest.fn() };
      fileCache.logger = logger;
      const count = await fileCache.clear();
      expect(count).toBe(0);
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('getSize', () => {
    it('should calculate total file size', async () => {
      fs.readdir.mockResolvedValue(['file1.json']);
      fs.stat.mockResolvedValue({ isDirectory: () => false, size: 1024 });
      const size = await fileCache.getSize();
      expect(size).toBe(1024);
    });

    it('should recurse into subdirectories', async () => {
      fs.readdir.mockResolvedValueOnce(['subdir']);
      fs.stat.mockImplementation((p) => {
        if (p.endsWith('subdir')) return Promise.resolve({ isDirectory: () => true, size: 0 });
        return Promise.resolve({ isDirectory: () => false, size: 2048 });
      });
      fs.readdir.mockResolvedValueOnce(['file.json']);
      const size = await fileCache.getSize();
      expect(size).toBe(2048);
    });

    it('should log and return 0 when read fails', async () => {
      fs.readdir.mockRejectedValueOnce(new Error('EACCES'));
      const logger = { debug: jest.fn() };
      fileCache.logger = logger;
      const size = await fileCache.getSize();
      expect(size).toBe(0);
      expect(logger.debug).toHaveBeenCalled();
    });
  });
});

describe('RedisCache', () => {
  let redisMock;
  let redisCache;
  let now;

  beforeEach(() => {
    now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    redisMock = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      keys: jest.fn()
    };
    redisCache = new RedisCache({ redis: redisMock, prefix: 'test:', defaultTTL: 60000 });
  });

  afterEach(() => {
    Date.now.mockRestore();
  });

  describe('constructor', () => {
    it('should store options', () => {
      expect(redisCache.redis).toBe(redisMock);
      expect(redisCache.prefix).toBe('test:');
      expect(redisCache.defaultTTL).toBe(60000);
      expect(redisCache.stats).toEqual({ hits: 0, misses: 0 });
    });

    it('should use defaults when no options provided', () => {
      const c = new RedisCache();
      expect(c.prefix).toBe('cache:');
      expect(c.defaultTTL).toBe(3600000);
    });
  });

  describe('_prefixKey', () => {
    it('should stringify non-string keys', () => {
      redisMock.get.mockResolvedValueOnce(null);
      redisCache.get({ id: 5 });
      expect(redisMock.get).toHaveBeenCalledWith(expect.stringMatching(/^test:[0-9a-f]{64}$/));
    });
  });

  describe('without redis', () => {
    it('should return null on get when no redis', async () => {
      const c = new RedisCache({});
      expect(await c.get('key')).toBeNull();
    });

    it('should do nothing on set when no redis', async () => {
      const c = new RedisCache({});
      await c.set('key', 'val');
      expect(c.stats.misses).toBe(0);
    });

    it('should return false on delete when no redis', async () => {
      const c = new RedisCache({});
      expect(await c.delete('key')).toBe(false);
    });

    it('should return 0 on clear when no redis', async () => {
      const c = new RedisCache({});
      expect(await c.clear()).toBe(0);
    });
  });

  describe('get', () => {
    it('should return null when redis key missing', async () => {
      redisMock.get.mockResolvedValueOnce(null);
      const result = await redisCache.get('key');
      expect(result).toBeNull();
      expect(redisCache.stats.misses).toBe(1);
    });

    it('should return value when found', async () => {
      const entry = new CacheEntry('stored', 60000);
      redisMock.get.mockResolvedValueOnce(JSON.stringify(entry.toJSON()));
      const result = await redisCache.get('key');
      expect(result).toBe('stored');
      expect(redisCache.stats.hits).toBe(1);
    });

    it('should return null for expired entry', async () => {
      const entry = new CacheEntry('stale', 100);
      now += 200;
      redisMock.get.mockResolvedValueOnce(JSON.stringify(entry.toJSON()));
      const result = await redisCache.get('key');
      expect(result).toBeNull();
      expect(redisMock.del).toHaveBeenCalled();
    });

    it('should return null on redis error', async () => {
      redisMock.get.mockRejectedValueOnce(new Error('timeout'));
      const result = await redisCache.get('key');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should call redis.set with PX', async () => {
      redisMock.set.mockResolvedValueOnce('OK');
      await redisCache.set('key', 'val', 5000);
      expect(redisMock.set).toHaveBeenCalledTimes(1);
      const args = redisMock.set.mock.calls[0];
      expect(args[0]).toMatch(/^test:/);
      expect(args[2]).toBe('PX');
      expect(args[3]).toBe(5000);
    });

    it('should handle set error gracefully', async () => {
      redisMock.set.mockRejectedValueOnce(new Error('ERR'));
      await expect(redisCache.set('key', 'val')).resolves.toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should call redis.del and return true', async () => {
      redisMock.del.mockResolvedValueOnce(1);
      const result = await redisCache.delete('key');
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      redisMock.del.mockRejectedValueOnce(new Error('ERR'));
      const result = await redisCache.delete('key');
      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('should delete all keys with prefix', async () => {
      redisMock.keys.mockResolvedValueOnce(['test:a', 'test:b']);
      redisMock.del.mockResolvedValueOnce(2);
      const count = await redisCache.clear();
      expect(count).toBe(2);
      expect(redisMock.del).toHaveBeenCalledWith('test:a', 'test:b');
    });

    it('should return 0 when no matching keys', async () => {
      redisMock.keys.mockResolvedValueOnce([]);
      expect(await redisCache.clear()).toBe(0);
    });

    it('should return 0 on error', async () => {
      redisMock.keys.mockRejectedValueOnce(new Error('ERR'));
      expect(await redisCache.clear()).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return stats with hitRate', () => {
      redisCache.stats.hits = 3;
      redisCache.stats.misses = 1;
      const s = redisCache.getStats();
      expect(s.hits).toBe(3);
      expect(s.misses).toBe(1);
      expect(s.hitRate).toBe('0.7500');
    });
  });
});

describe('MultiLevelCache', () => {
  let cache;
  let now;

  beforeEach(() => {
    now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    jest.clearAllMocks();
  });

  afterEach(() => {
    Date.now.mockRestore();
  });

  describe('constructor', () => {
    it('should create all levels with defaults', () => {
      cache = new MultiLevelCache();
      expect(cache.l1.maxSize).toBe(500);
      expect(cache.l1.defaultTTL).toBe(60000);
      expect(cache.l2).toBeNull();
      expect(cache.l3.cacheDir).toBe('./cache');
      expect(cache.enabled.l1).toBe(true);
      expect(cache.enabled.l2).toBe(false);
      expect(cache.enabled.l3).toBe(true);
    });

    it('should accept custom options', () => {
      cache = new MultiLevelCache({
        l1MaxSize: 100,
        l1TTL: 30000,
        l3Dir: '/data/cache',
        l3TTL: 7200000,
        enableL3: false
      });
      expect(cache.l1.maxSize).toBe(100);
      expect(cache.l1.defaultTTL).toBe(30000);
      expect(cache.l3.cacheDir).toBe('/data/cache');
      expect(cache.enabled.l3).toBe(false);
    });

    it('should create L2 when redis provided', () => {
      cache = new MultiLevelCache({ l2Redis: { fake: true } });
      expect(cache.l2).not.toBeNull();
      expect(cache.enabled.l2).toBe(true);
    });

    it('should use custom l2Prefix', () => {
      const r = { fake: true };
      cache = new MultiLevelCache({ l2Redis: r, l2Prefix: 'custom:' });
      expect(cache.l2.prefix).toBe('custom:');
    });
  });

  describe('get', () => {
    it('should return L1 hit immediately', async () => {
      cache = new MultiLevelCache();
      cache.l1.set('key', 'l1val');
      const result = await cache.get('key');
      expect(result).toBe('l1val');
      expect(cache.stats.reads.l1).toBe(1);
      expect(cache.stats.reads.l2).toBe(0);
      expect(cache.stats.reads.l3).toBe(0);
    });

    it('should cascade to L3 when L1 misses', async () => {
      cache = new MultiLevelCache();
      cache.l3.get = jest.fn().mockResolvedValue('l3val');
      const result = await cache.get('key');
      expect(result).toBe('l3val');
      expect(cache.stats.reads.l3).toBe(1);
    });

    it('should promote L3 hit to L1', async () => {
      cache = new MultiLevelCache();
      cache.l3.get = jest.fn().mockResolvedValue('val');
      await cache.get('key');
      expect(cache.l1.get('key')).toBe('val');
    });

    it('should return null on complete miss', async () => {
      cache = new MultiLevelCache();
      const result = await cache.get('nope');
      expect(result).toBeNull();
      expect(cache.stats.misses).toBe(1);
    });

    it('should handle L3 get error gracefully', async () => {
      cache = new MultiLevelCache();
      cache.l1.get = jest.fn().mockReturnValue(null);
      cache.l3.get = jest.fn().mockRejectedValue(new Error('disk error'));
      const result = await cache.get('key');
      expect(result).toBeNull();
    });

    it('should bypass disabled L1 and go to L3', async () => {
      cache = new MultiLevelCache({ enableL1: false });
      cache.l1.get = jest.fn().mockReturnValue('l1val');
      cache.l3.get = jest.fn().mockResolvedValue('l3val');
      const result = await cache.get('key');
      expect(result).toBe('l3val');
      expect(cache.l1.get).not.toHaveBeenCalled();
    });

    it('should promote L3 to L1 on L1-disabled config', async () => {
      cache = new MultiLevelCache({ enableL1: false });
      cache.l1.set = jest.fn();
      cache.l3.get = jest.fn().mockResolvedValue('val');
      await cache.get('key');
      expect(cache.l1.set).not.toHaveBeenCalled();
    });
  });

  describe('get with L2', () => {
    let redisMock;

    beforeEach(() => {
      redisMock = { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn() };
      cache = new MultiLevelCache({ l2Redis: redisMock });
    });

    it('should promote L2 hit to L1', async () => {
      const entry = new CacheEntry('l2val', 60000);
      redisMock.get.mockResolvedValueOnce(JSON.stringify(entry.toJSON()));
      const result = await cache.get('key');
      expect(result).toBe('l2val');
      expect(cache.stats.reads.l2).toBe(1);
      expect(cache.l1.get('key')).toBe('l2val');
    });

    it('should cascade L1→L2→L3', async () => {
      redisMock.get.mockResolvedValueOnce(null); // L2 miss
      cache.l3.get = jest.fn().mockResolvedValue('l3val');
      const result = await cache.get('key');
      expect(result).toBe('l3val');
      expect(cache.stats.reads.l3).toBe(1);
    });

    it('should promote L3 hit to L2', async () => {
      redisMock.get.mockResolvedValueOnce(null);
      cache.l3.get = jest.fn().mockResolvedValue('val');
      await cache.get('key');
      expect(redisMock.set).toHaveBeenCalled();
    });

    it('should skip L1 promotion when L1 disabled on L2 hit', async () => {
      redisMock.get.mockResolvedValueOnce(JSON.stringify(new CacheEntry('l2val', 60000).toJSON()));
      const c = new MultiLevelCache({ l2Redis: redisMock, enableL1: false });
      c.l1.set = jest.fn();
      const result = await c.get('key');
      expect(result).toBe('l2val');
      expect(c.l1.set).not.toHaveBeenCalled();
    });
  });

  describe('get with L3 disabled', () => {
    it('should skip L3 when disabled', async () => {
      cache = new MultiLevelCache({ enableL3: false });
      cache.l3.get = jest.fn().mockResolvedValue('should-not-be-read');
      const result = await cache.get('key');
      expect(result).toBeNull();
      expect(cache.l3.get).not.toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should write to all enabled levels', async () => {
      cache = new MultiLevelCache();
      cache.l3.set = jest.fn().mockResolvedValue();
      await cache.set('key', 'val');
      expect(cache.l1.get('key')).toBe('val');
      expect(cache.l3.set).toHaveBeenCalledWith('key', 'val', expect.any(Number));
      expect(cache.stats.writes.l1).toBe(1);
      expect(cache.stats.writes.l3).toBe(1);
    });

    it('should use custom TTL with per-level overrides', async () => {
      cache = new MultiLevelCache();
      cache.l3.set = jest.fn().mockResolvedValue();
      await cache.set('key', 'val', { ttl: 10000, l1TTL: 5000, l3TTL: 20000 });
      // L1 uses l1TTL
      expect(cache.l1.get('key')).toBe('val');
      // L3 uses l3TTL
      expect(cache.l3.set).toHaveBeenCalledWith('key', 'val', 20000);
    });

    it('should skip disabled L1', async () => {
      cache = new MultiLevelCache({ enableL1: false });
      cache.l3.set = jest.fn();
      const l1Set = jest.spyOn(cache.l1, 'set');
      await cache.set('key', 'val');
      expect(l1Set).not.toHaveBeenCalled();
      expect(cache.l3.set).toHaveBeenCalled();
    });

    it('should write to L2 when available', async () => {
      const rm = { set: jest.fn().mockResolvedValue() };
      cache = new MultiLevelCache({ l2Redis: rm });
      cache.l3.set = jest.fn();
      await cache.set('key', 'val');
      expect(rm.set).toHaveBeenCalled();
      expect(cache.stats.writes.l2).toBe(1);
    });

    it('should skip disabled L3 on set', async () => {
      cache = new MultiLevelCache({ enableL3: false });
      cache.l3.set = jest.fn();
      await cache.set('key', 'val');
      expect(cache.l3.set).not.toHaveBeenCalled();
      expect(cache.stats.writes.l3).toBe(0);
    });
  });

  describe('delete', () => {
    it('should delete from all enabled levels', async () => {
      cache = new MultiLevelCache();
      cache.l1.set('a', 1);
      cache.l3.delete = jest.fn().mockResolvedValue(true);
      const count = await cache.delete('a');
      expect(count).toBe(2);
      expect(cache.l1.get('a')).toBeNull();
    });

    it('should return 0 when key not present', async () => {
      cache = new MultiLevelCache();
      cache.l3.delete = jest.fn().mockResolvedValue(false);
      const count = await cache.delete('nope');
      expect(count).toBe(0);
    });

    it('should count L2 delete that returns falsy', async () => {
      cache = new MultiLevelCache({ l2Redis: {} });
      cache.l2 = { delete: jest.fn().mockResolvedValue(false) };
      cache.l1.set('a', 1);
      cache.l3.delete = jest.fn().mockResolvedValue(false);
      const count = await cache.delete('a');
      expect(count).toBe(1);
      expect(cache.l2.delete).toHaveBeenCalledWith('a');
    });

    it('should count L2 delete that returns truthy', async () => {
      cache = new MultiLevelCache({ l2Redis: {} });
      cache.l2 = { delete: jest.fn().mockResolvedValue(true) };
      cache.l1.set('a', 1);
      cache.l3.delete = jest.fn().mockResolvedValue(false);
      const count = await cache.delete('a');
      expect(count).toBe(2);
    });

    it('should skip disabled L3 on delete', async () => {
      cache = new MultiLevelCache({ enableL3: false });
      cache.l1.set('a', 1);
      cache.l3.delete = jest.fn().mockResolvedValue(true);
      const count = await cache.delete('a');
      expect(count).toBe(1);
      expect(cache.l3.delete).not.toHaveBeenCalled();
    });

    it('should skip disabled L1 on delete', async () => {
      cache = new MultiLevelCache({ enableL1: false });
      cache.l3.delete = jest.fn().mockResolvedValue(true);
      const count = await cache.delete('a');
      expect(count).toBe(1);
      expect(cache.l1.get('a')).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all enabled levels', async () => {
      const rm = { keys: jest.fn().mockResolvedValue(['a', 'b']), del: jest.fn().mockResolvedValue(2), clear: jest.fn().mockResolvedValue(2) };
      cache = new MultiLevelCache({ l2Redis: rm });
      cache.l1.set('a', 1);
      cache.l1.set('b', 2);
      cache.l3.clear = jest.fn().mockResolvedValue(5);
      const count = await cache.clear();
      expect(count).toBe(9);
    });

    it('should skip disabled levels on clear', async () => {
      cache = new MultiLevelCache({ enableL1: false, enableL3: false });
      cache.l1.clear = jest.fn().mockReturnValue(10);
      cache.l3.clear = jest.fn().mockResolvedValue(10);
      const count = await cache.clear();
      expect(count).toBe(0);
      expect(cache.l1.clear).not.toHaveBeenCalled();
      expect(cache.l3.clear).not.toHaveBeenCalled();
    });
  });

  describe('getOrFetch', () => {
    it('should return cached value on hit', async () => {
      cache = new MultiLevelCache();
      cache.l1.set('key', 'cached');
      const fetchFn = jest.fn().mockResolvedValue('fetched');
      const result = await cache.getOrFetch('key', fetchFn, {});
      expect(result).toEqual({ hit: true, value: 'cached' });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should fetch and store on miss', async () => {
      cache = new MultiLevelCache();
      cache.l3.set = jest.fn().mockResolvedValue();
      const fetchFn = jest.fn().mockResolvedValue('computed');
      const result = await cache.getOrFetch('key', fetchFn, {});
      expect(result).toEqual({ hit: false, value: 'computed' });
      expect(cache.l1.get('key')).toBe('computed');
    });

    it('should work without options argument', async () => {
      cache = new MultiLevelCache();
      cache.l3.set = jest.fn().mockResolvedValue();
      const fetchFn = jest.fn().mockResolvedValue('plain');
      const result = await cache.getOrFetch('key', fetchFn);
      expect(result).toEqual({ hit: false, value: 'plain' });
    });

    it('should skip store when fetch returns null', async () => {
      cache = new MultiLevelCache();
      cache.l3.set = jest.fn();
      const fetchFn = jest.fn().mockResolvedValue(null);
      const result = await cache.getOrFetch('key', fetchFn, {});
      expect(result).toEqual({ hit: false, value: null });
      expect(cache.l1.get('key')).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return aggregated stats', async () => {
      cache = new MultiLevelCache();
      await cache.get('miss');
      cache.l1.set('k', 'v');
      await cache.get('k');
      const s = cache.getStats();
      expect(s.l1).not.toBeNull();
      expect(s.l2).toBeNull();
      expect(s.l3).not.toBeNull();
      expect(s.reads.l1).toBe(1);
      expect(s.reads.l3).toBe(0);
      expect(s.misses).toBe(1);
      expect(s.totalHits).toBe(1);
      expect(s.totalMisses).toBe(1);
    });

    it('should return l2 stats when available', async () => {
      const rm = { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn() };
      cache = new MultiLevelCache({ l2Redis: rm });
      const s = cache.getStats();
      expect(s.l2).not.toBeNull();
    });

    it('should return null for disabled levels in stats', async () => {
      cache = new MultiLevelCache({ enableL1: false, enableL3: false });
      const s = cache.getStats();
      expect(s.l1).toBeNull();
      expect(s.l3).toBeNull();
    });

    it('should report checking size when l3 has getSize', async () => {
      cache = new MultiLevelCache();
      cache.l3.getSize = jest.fn();
      const s = cache.getStats();
      expect(s.l3.size).toBe('checking...');
    });

    it('should report 0 size when l3 has no getSize', async () => {
      cache = new MultiLevelCache();
      cache.l3.getSize = undefined;
      const s = cache.getStats();
      expect(s.l3.size).toBe(0);
    });
  });
});
