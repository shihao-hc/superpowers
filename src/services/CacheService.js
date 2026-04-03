const redis = require('redis');

class CacheService {
  constructor(options = {}) {
    this.url = options.url || process.env.REDIS_URL || 'redis://localhost:6379';
    this.defaultTTL = options.defaultTTL || 3600;
    this.client = null;
    this.connected = false;
    this.localCache = new Map();
    this.localCacheTTL = new Map();
    this.localCacheMaxSize = options.localCacheMaxSize || 100;
    this.localCacheTTLms = options.localCacheTTLms || 60000;

    this.stats = {
      hits: 0,
      misses: 0,
      localHits: 0,
      redisHits: 0,
      errors: 0
    };
  }

  async connect() {
    try {
      this.client = redis.createClient({ url: this.url });

      this.client.on('error', (err) => {
        console.error('[Cache] Redis error:', err.message);
        this.connected = false;
        this.stats.errors++;
      });

      this.client.on('connect', () => {
        console.log('[Cache] Redis connected');
        this.connected = true;
      });

      this.client.on('disconnect', () => {
        console.log('[Cache] Redis disconnected');
        this.connected = false;
      });

      await this.client.connect();
      return true;
    } catch (error) {
      console.warn('[Cache] Redis not available, using local cache only:', error.message);
      this.connected = false;
      return false;
    }
  }

  async get(key) {
    const localValue = this._getLocal(key);
    if (localValue !== null) {
      this.stats.hits++;
      this.stats.localHits++;
      return localValue;
    }

    if (!this.connected) {
      this.stats.misses++;
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (value !== null) {
        const parsed = JSON.parse(value);
        this._setLocal(key, parsed);
        this.stats.hits++;
        this.stats.redisHits++;
        return parsed;
      }
      this.stats.misses++;
      return null;
    } catch (error) {
      this.stats.misses++;
      this.stats.errors++;
      return null;
    }
  }

  async set(key, value, ttl) {
    this._setLocal(key, value);

    if (!this.connected) return false;

    try {
      const actualTTL = ttl || this.defaultTTL;
      await this.client.setEx(key, actualTTL, JSON.stringify(value));
      return true;
    } catch (error) {
      this.stats.errors++;
      return false;
    }
  }

  async del(key) {
    this._deleteLocal(key);

    if (!this.connected) return false;

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      this.stats.errors++;
      return false;
    }
  }

  async getOrSet(key, fetchFn, ttl) {
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    if (!this._pendingFetches) {
      this._pendingFetches = new Map();
    }

    if (this._pendingFetches.has(key)) {
      return this._pendingFetches.get(key);
    }

    const fetchPromise = (async () => {
      try {
        const value = await fetchFn();
        await this.set(key, value, ttl);
        return value;
      } finally {
        this._pendingFetches.delete(key);
      }
    })();

    this._pendingFetches.set(key, fetchPromise);
    return fetchPromise;
  }

  async invalidatePattern(pattern) {
    if (!this.connected) return 0;

    try {
      const keys = [];
      let cursor = 0;

      do {
        const result = await this.client.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = result.cursor;
        keys.push(...result.keys);
      } while (cursor !== 0);

      if (keys.length > 0) {
        await this.client.del(keys);
        return keys.length;
      }
      return 0;
    } catch (error) {
      this.stats.errors++;
      return 0;
    }
  }

  _getLocal(key) {
    if (!this.localCache.has(key)) return null;

    const timestamp = this.localCacheTTL.get(key);
    if (timestamp && Date.now() > timestamp) {
      this.localCache.delete(key);
      this.localCacheTTL.delete(key);
      return null;
    }

    return this.localCache.get(key);
  }

  _setLocal(key, value) {
    if (this.localCache.size >= this.localCacheMaxSize) {
      const oldestKey = this.localCache.keys().next().value;
      this.localCache.delete(oldestKey);
      this.localCacheTTL.delete(oldestKey);
    }

    this.localCache.set(key, value);
    this.localCacheTTL.set(key, Date.now() + this.localCacheTTLms);
  }

  _deleteLocal(key) {
    this.localCache.delete(key);
    this.localCacheTTL.delete(key);
  }

  clearLocalCache() {
    this.localCache.clear();
    this.localCacheTTL.clear();
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%',
      localCacheSize: this.localCache.size,
      redisConnected: this.connected
    };
  }

  async destroy() {
    this.clearLocalCache();
    if (this.client && this.connected) {
      try {
        await this.client.quit();
      } catch (error) {}
    }
    this.client = null;
    this.connected = false;
  }
}

function memoize(fn, options = {}) {
  const ttl = options.ttl || 60000;
  const cache = new Map();
  const cacheTimestamps = new Map();
  const keyFn = options.keyFn || ((...args) => JSON.stringify(args));

  const memoized = function(...args) {
    const key = keyFn(...args);
    const timestamp = cacheTimestamps.get(key);

    if (timestamp && Date.now() - timestamp < ttl) {
      return cache.get(key);
    }

    const result = fn.apply(this, args);
    cache.set(key, result);
    cacheTimestamps.set(key, Date.now());

    if (cache.size > (options.maxSize || 100)) {
      const oldestKey = cacheTimestamps.keys().next().value;
      cache.delete(oldestKey);
      cacheTimestamps.delete(oldestKey);
    }

    return result;
  };

  memoized.clear = () => {
    cache.clear();
    cacheTimestamps.clear();
  };

  return memoized;
}

function asyncMemoize(fn, options = {}) {
  const ttl = options.ttl || 60000;
  const cache = new Map();
  const cacheTimestamps = new Map();
  const pending = new Map();
  const keyFn = options.keyFn || ((...args) => JSON.stringify(args));

  const memoized = async function(...args) {
    const key = keyFn(...args);
    const timestamp = cacheTimestamps.get(key);

    if (timestamp && Date.now() - timestamp < ttl) {
      return cache.get(key);
    }

    if (pending.has(key)) {
      return pending.get(key);
    }

    const promise = fn.apply(this, args).then(result => {
      cache.set(key, result);
      cacheTimestamps.set(key, Date.now());
      pending.delete(key);

      if (cache.size > (options.maxSize || 100)) {
        const oldestKey = cacheTimestamps.keys().next().value;
        cache.delete(oldestKey);
        cacheTimestamps.delete(oldestKey);
      }

      return result;
    }).catch(error => {
      pending.delete(key);
      throw error;
    });

    pending.set(key, promise);
    return promise;
  };

  memoized.clear = () => {
    cache.clear();
    cacheTimestamps.clear();
    pending.clear();
  };

  return memoized;
}

module.exports = { CacheService, memoize, asyncMemoize };
