'use strict';

const { ResponseCache, createResponseCache } = require('../../src/integrations/openclaw/ResponseCache');

function makeParams(model, messages, overrides = {}) {
  return {
    model: model || 'gpt-4',
    messages: messages || [{ role: 'user', content: 'hello' }],
    temperature: 0.7,
    max_tokens: 100,
    ...overrides
  };
}

describe('ResponseCache', () => {
  let cache;

  beforeEach(() => {
    cache = new ResponseCache({ maxSize: 5, defaultTTL: 300000 });
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('constructor', () => {
    it('should set default options', () => {
      const c = new ResponseCache();
      expect(c.maxSize).toBe(500);
      expect(c.defaultTTL).toBe(300000);
      expect(c.enabled).toBe(true);
      expect(c.cache instanceof Map).toBe(true);
      c.destroy();
    });

    it('should accept custom options', () => {
      const c = new ResponseCache({ maxSize: 10, defaultTTL: 60000, enabled: false });
      expect(c.maxSize).toBe(10);
      expect(c.defaultTTL).toBe(60000);
      expect(c.enabled).toBe(false);
      c.destroy();
    });

    it('should start cleanup interval when enabled', () => {
      const c = new ResponseCache({ enabled: true });
      expect(c._cleanupInterval).not.toBeNull();
      c.destroy();
    });

    it('should not start cleanup when disabled', () => {
      const c = new ResponseCache({ enabled: false });
      expect(c._cleanupInterval).toBeNull();
      c.destroy();
    });

    it('should run cleanup on interval callback', () => {
      jest.useFakeTimers();
      const spy = jest.spyOn(ResponseCache.prototype, '_cleanup');
      const c = new ResponseCache({ defaultTTL: 50 });
      jest.advanceTimersByTime(50);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
      c.destroy();
      jest.useRealTimers();
    });

    it('should initialize stats to zero', () => {
      expect(cache.stats).toEqual({
        hits: 0, misses: 0, evictions: 0, size: 0
      });
    });
  });

  describe('_generateKey', () => {
    it('should return deterministic hash for same params', () => {
      const params = makeParams('gpt-4', [{ role: 'user', content: 'hello' }]);
      const key1 = cache._generateKey(params);
      const key2 = cache._generateKey(params);
      expect(key1).toBe(key2);
    });

    it('should return different keys for different content', () => {
      const params1 = makeParams('gpt-4', [{ role: 'user', content: 'hello' }]);
      const params2 = makeParams('gpt-4', [{ role: 'user', content: 'world' }]);
      expect(cache._generateKey(params1)).not.toBe(cache._generateKey(params2));
    });

    it('should return different keys for different models', () => {
      const params1 = makeParams('gpt-4', [{ role: 'user', content: 'hello' }]);
      const params2 = makeParams('gpt-3.5', [{ role: 'user', content: 'hello' }]);
      expect(cache._generateKey(params1)).not.toBe(cache._generateKey(params2));
    });

    it('should handle missing messages field', () => {
      const key = cache._generateKey({ model: 'gpt-4', temperature: 0.5, max_tokens: 50 });
      expect(typeof key).toBe('string');
      expect(key).toHaveLength(32);
    });

    it('should produce a 32-char hex string', () => {
      const key = cache._generateKey(makeParams());
      expect(key).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('_evictLRU', () => {
    it('should evict oldest entry when at max capacity', () => {
      for (let i = 0; i < 5; i++) {
        cache.set(makeParams(`model-${i}`, [{ role: 'user', content: `msg-${i}` }]), { data: i });
      }
      expect(cache.cache.size).toBe(5);
      cache.set(makeParams('model-new', [{ role: 'user', content: 'new' }]), { data: 'new' });
      expect(cache.cache.size).toBe(5);
    });

    it('should update eviction stats', () => {
      for (let i = 0; i < 6; i++) {
        cache.set(makeParams(`model-${i}`, [{ role: 'user', content: `msg-${i}` }]), { data: i });
      }
      expect(cache.stats.evictions).toBe(1);
    });

    it('should skip stale accessOrder entry during eviction', () => {
      for (let i = 0; i < 5; i++) {
        cache.set(makeParams(`m${i}`, [{ role: 'user', content: `msg-${i}` }]), { data: i });
      }
      cache.accessOrder.unshift('stale-key');
      cache.set(makeParams('new', [{ role: 'user', content: 'new' }]), { data: 'new' });
      expect(cache.cache.size).toBe(5);
    });
  });

  describe('_updateAccessOrder', () => {
    it('should move existing key to the end', () => {
      cache.accessOrder = ['a', 'b', 'c'];
      cache._updateAccessOrder('a');
      expect(cache.accessOrder).toEqual(['b', 'c', 'a']);
    });

    it('should add new key to the end', () => {
      cache.accessOrder = ['a'];
      cache._updateAccessOrder('b');
      expect(cache.accessOrder).toEqual(['a', 'b']);
    });
  });

  describe('_isExpired', () => {
    it('should return true for undefined entry', () => {
      expect(cache._isExpired(undefined)).toBe(true);
    });

    it('should return true for entry with no ttl', () => {
      expect(cache._isExpired({ timestamp: Date.now() })).toBe(true);
    });

    it('should return false for non-expired entry', () => {
      const entry = { timestamp: Date.now(), ttl: 60000 };
      expect(cache._isExpired(entry)).toBe(false);
    });

    it('should return true for expired entry', () => {
      const entry = { timestamp: Date.now() - 100000, ttl: 100 };
      expect(cache._isExpired(entry)).toBe(true);
    });
  });

  describe('_cleanup', () => {
    it('should remove expired entries', () => {
      const key1 = cache._generateKey(makeParams('a'));
      const key2 = cache._generateKey(makeParams('b'));
      cache.cache.set(key1, { timestamp: Date.now() - 500000, ttl: 100 });
      cache.cache.set(key2, { timestamp: Date.now(), ttl: 60000 });
      cache.accessOrder = [key1, key2];
      cache._cleanup();
      expect(cache.cache.has(key1)).toBe(false);
      expect(cache.cache.has(key2)).toBe(true);
    });

    it('should update eviction stats', () => {
      const key = cache._generateKey(makeParams('expired'));
      cache.cache.set(key, { timestamp: Date.now() - 500000, ttl: 100 });
      cache.stats.evictions = 0;
      cache._cleanup();
      expect(cache.stats.evictions).toBe(1);
    });

    it('should remove expired key from accessOrder', () => {
      const key = cache._generateKey(makeParams('expired'));
      cache.cache.set(key, { timestamp: Date.now() - 500000, ttl: 100 });
      cache.accessOrder = [key, 'other'];
      cache._cleanup();
      expect(cache.accessOrder).toEqual(['other']);
    });
  });

  describe('get', () => {
    it('should return cached data on hit', () => {
      const params = makeParams('gpt-4', [{ role: 'user', content: 'hello' }]);
      cache.set(params, { reply: 'hi' });
      const result = cache.get(params);
      expect(result).toEqual({ reply: 'hi' });
    });

    it('should return null on miss', () => {
      const result = cache.get(makeParams('nonexistent'));
      expect(result).toBeNull();
    });

    it('should return null for expired entry', () => {
      const params = makeParams('gpt-4');
      const key = cache._generateKey(params);
      cache.cache.set(key, { data: 'stale', timestamp: Date.now() - 500000, ttl: 100 });
      const result = cache.get(params);
      expect(result).toBeNull();
    });

    it('should remove expired entry from cache and accessOrder', () => {
      const params = makeParams('gpt-4');
      const key = cache._generateKey(params);
      cache.cache.set(key, { data: 'stale', timestamp: Date.now() - 500000, ttl: 100 });
      cache.accessOrder = [key];
      cache.get(params);
      expect(cache.cache.has(key)).toBe(false);
      expect(cache.accessOrder).toEqual([]);
    });

    it('should increment misses when entry not found', () => {
      cache.get(makeParams('unknown'));
      expect(cache.stats.misses).toBe(1);
    });

    it('should increment misses when entry expired', () => {
      const params = makeParams('gpt-4');
      const key = cache._generateKey(params);
      cache.cache.set(key, { data: 'x', timestamp: Date.now() - 500000, ttl: 100 });
      cache.get(params);
      expect(cache.stats.misses).toBe(1);
    });

    it('should increment hits on successful get', () => {
      cache.set(makeParams('gpt-4'), { reply: 'hello' });
      cache.get(makeParams('gpt-4'));
      expect(cache.stats.hits).toBe(1);
    });

    it('should return null when disabled', () => {
      const disabled = new ResponseCache({ enabled: false });
      disabled.set(makeParams('gpt-4'), { reply: 'hi' });
      expect(disabled.get(makeParams('gpt-4'))).toBeNull();
      disabled.destroy();
    });
  });

  describe('set', () => {
    it('should store data and make it retrievable', () => {
      const params = makeParams('gpt-4', [{ role: 'user', content: 'test' }]);
      cache.set(params, { result: 'ok' });
      expect(cache.get(params)).toEqual({ result: 'ok' });
    });

    it('should update existing entry', () => {
      const params = makeParams('gpt-4');
      cache.set(params, { v: 1 });
      cache.set(params, { v: 2 });
      expect(cache.get(params)).toEqual({ v: 2 });
      expect(cache.cache.size).toBe(1);
    });

    it('should cap TTL at 3600000', () => {
      const params = makeParams('gpt-4');
      cache.set(params, { data: 1 }, 9999999);
      const key = cache._generateKey(params);
      expect(cache.cache.get(key).ttl).toBe(3600000);
    });

    it('should use defaultTTL when ttl is 0', () => {
      const params = makeParams('gpt-4');
      cache.set(params, { data: 1 }, 0);
      const key = cache._generateKey(params);
      expect(cache.cache.get(key).ttl).toBe(300000);
    });

    it('should use defaultTTL when ttl is negative', () => {
      const params = makeParams('gpt-4');
      cache.set(params, { data: 1 }, -1);
      const key = cache._generateKey(params);
      expect(cache.cache.get(key).ttl).toBe(300000);
    });

    it('should store params metadata', () => {
      const params = makeParams('claude-3', [{ role: 'user', content: 'hi' }]);
      cache.set(params, { data: 1 });
      const key = cache._generateKey(params);
      expect(cache.cache.get(key).params.model).toBe('claude-3');
      expect(cache.cache.get(key).params.messageCount).toBe(1);
    });

    it('should update stats size', () => {
      expect(cache.stats.size).toBe(0);
      cache.set(makeParams('a'), { data: 1 });
      expect(cache.stats.size).toBe(1);
    });

    it('should handle missing messages in params metadata', () => {
      const params = { model: 'gpt-4', temperature: 0.5, max_tokens: 50 };
      cache.set(params, { data: 1 });
      const key = cache._generateKey(params);
      expect(cache.cache.get(key).params.messageCount).toBe(0);
    });

    it('should do nothing when disabled', () => {
      const disabled = new ResponseCache({ enabled: false });
      disabled.set(makeParams('gpt-4'), { data: 1 });
      expect(disabled.cache.size).toBe(0);
      disabled.destroy();
    });
  });

  describe('invalidate', () => {
    it('should invalidate all entries for a specific model', () => {
      cache.set(makeParams('gpt-4'), { data: 1 });
      cache.set(makeParams('gpt-4', [{ role: 'user', content: 'other' }]), { data: 2 });
      cache.set(makeParams('claude-3'), { data: 3 });
      const count = cache.invalidate('gpt-4');
      expect(count).toBe(2);
      expect(cache.cache.size).toBe(1);
      expect(cache.get(makeParams('claude-3'))).toEqual({ data: 3 });
    });

    it('should invalidate all entries when model is null', () => {
      cache.set(makeParams('gpt-4'), { data: 1 });
      cache.set(makeParams('claude-3'), { data: 2 });
      const count = cache.invalidate();
      expect(count).toBe(2);
      expect(cache.cache.size).toBe(0);
    });

    it('should return 0 when cache is empty', () => {
      expect(cache.invalidate()).toBe(0);
    });

    it('should handle key missing from accessOrder during invalidation', () => {
      cache.set(makeParams('gpt-4'), { data: 1 });
      const key = cache._generateKey(makeParams('gpt-4'));
      cache.accessOrder = cache.accessOrder.filter(k => k !== key);
      cache.invalidate('gpt-4');
      expect(cache.cache.has(key)).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return stats with hit rate', () => {
      cache.set(makeParams('gpt-4'), { data: 'x' });
      cache.get(makeParams('gpt-4'));
      cache.get(makeParams('unknown'));
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe('0.5000');
      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(5);
      expect(stats.enabled).toBe(true);
    });

    it('should return 0 hit rate when no access', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all entries and return count', () => {
      cache.set(makeParams('a'), { data: 1 });
      cache.set(makeParams('b'), { data: 2 });
      const count = cache.clear();
      expect(count).toBe(2);
      expect(cache.cache.size).toBe(0);
      expect(cache.accessOrder).toEqual([]);
      expect(cache.stats.size).toBe(0);
    });
  });

  describe('destroy', () => {
    it('should stop cleanup interval', () => {
      cache._cleanupInterval = setInterval(() => {}, 1000);
      const _intervalId = cache._cleanupInterval;
      cache.destroy();
      expect(cache._cleanupInterval).toBeNull();
    });

    it('should clear cache', () => {
      cache.set(makeParams('a'), { data: 1 });
      cache.destroy();
      expect(cache.cache.size).toBe(0);
    });
  });

  describe('createResponseCache', () => {
    it('should create a ResponseCache instance', () => {
      const c = createResponseCache({ maxSize: 100 });
      expect(c).toBeInstanceOf(ResponseCache);
      expect(c.maxSize).toBe(100);
      c.destroy();
    });
  });

  describe('LRU behavior', () => {
    it('should evict least recently used entry when full', () => {
      const smallCache = new ResponseCache({ maxSize: 3 });
      const paramsA = makeParams('a', [{ role: 'user', content: 'msg-a' }]);
      const paramsB = makeParams('b', [{ role: 'user', content: 'msg-b' }]);
      const paramsC = makeParams('c', [{ role: 'user', content: 'msg-c' }]);
      const paramsD = makeParams('d', [{ role: 'user', content: 'msg-d' }]);

      smallCache.set(paramsA, { data: 'A' });
      smallCache.set(paramsB, { data: 'B' });
      smallCache.set(paramsC, { data: 'C' });
      smallCache.get(paramsA);
      smallCache.set(paramsD, { data: 'D' });

      expect(smallCache.get(paramsA)).toEqual({ data: 'A' });
      expect(smallCache.get(paramsB)).toBeNull();
      expect(smallCache.get(paramsD)).toEqual({ data: 'D' });
      smallCache.destroy();
    });
  });
});
