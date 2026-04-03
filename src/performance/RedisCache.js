const { EventEmitter } = require('events');

class RedisCacheAdapter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      host: options.host || 'localhost',
      port: options.port || 6379,
      password: options.password || undefined,
      db: options.db || 0,
      keyPrefix: options.keyPrefix || 'mcp:cache:',
      ttl: options.ttl || 60000,
      connectTimeout: options.connectTimeout || 5000,
      retryAttempts: options.retryAttempts || 3,
      enableOfflineQueue: options.enableOfflineQueue !== false,
      ...options
    };
    
    this.client = null;
    this.connected = false;
    this.localCache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
    this._fallbackMode = false;
  }

  async connect() {
    try {
      const redis = await import('redis');
      const { createClient } = redis;
      
      this.client = createClient({
        socket: {
          host: this.options.host,
          port: this.options.port,
          connectTimeout: this.options.connectTimeout
        },
        password: this.options.password,
        database: this.options.db
      });

      this.client.on('error', (err) => {
        console.error('[RedisCache] Error:', err.message);
        this.stats.errors++;
        this._fallbackMode = true;
      });

      this.client.on('connect', () => {
        console.log('[RedisCache] Connected to Redis');
        this.connected = true;
        this._fallbackMode = false;
      });

      this.client.on('end', () => {
        console.log('[RedisCache] Disconnected from Redis');
        this.connected = false;
        this._fallbackMode = true;
      });

      await this.client.connect();
      return true;
    } catch (error) {
      console.warn('[RedisCache] Failed to connect to Redis, using local cache:', error.message);
      this._fallbackMode = true;
      return false;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
    }
  }

  _makeKey(key) {
    if (!key || typeof key !== 'string') {
      throw new Error('Cache key must be a non-empty string');
    }
    const sanitized = key.replace(/[^\w:.-]/g, '_');
    return `${this.options.keyPrefix}${sanitized}`;
  }

  async get(key) {
    const fullKey = this._makeKey(key);
    
    if (this._fallbackMode || !this.connected) {
      const local = this.localCache.get(fullKey);
      if (local && Date.now() - local.timestamp < this.options.ttl) {
        this.stats.hits++;
        return local.value;
      }
      this.stats.misses++;
      return null;
    }

    try {
      const value = await this.client.get(fullKey);
      if (value !== null) {
        this.stats.hits++;
        const parsed = JSON.parse(value);
        this.localCache.set(fullKey, { value: parsed, timestamp: Date.now() });
        return parsed;
      }
      this.stats.misses++;
      return null;
    } catch (error) {
      console.error('[RedisCache] Get error:', error.message);
      this.stats.errors++;
      
      const local = this.localCache.get(fullKey);
      if (local) return local.value;
      return null;
    }
  }

  async set(key, value, ttl = null) {
    const fullKey = this._makeKey(key);
    const expiry = ttl || this.options.ttl;
    
    this.localCache.set(fullKey, { value, timestamp: Date.now() });
    
    if (this._fallbackMode || !this.connected) {
      this.stats.sets++;
      return true;
    }

    try {
      await this.client.setEx(fullKey, Math.floor(expiry / 1000), JSON.stringify(value));
      this.stats.sets++;
      return true;
    } catch (error) {
      console.error('[RedisCache] Set error:', error.message);
      this.stats.errors++;
      return false;
    }
  }

  async delete(key) {
    const fullKey = this._makeKey(key);
    this.localCache.delete(fullKey);
    this.stats.deletes++;
    
    if (this._fallbackMode || !this.connected) {
      return true;
    }

    try {
      await this.client.del(fullKey);
      return true;
    } catch (error) {
      console.error('[RedisCache] Delete error:', error.message);
      this.stats.errors++;
      return false;
    }
  }

  async clear() {
    this.localCache.clear();
    
    if (this._fallbackMode || !this.connected) {
      return true;
    }

    try {
      const keys = await this.client.keys(`${this.options.keyPrefix}*`);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      console.error('[RedisCache] Clear error:', error.message);
      this.stats.errors++;
      return false;
    }
  }

  async getMultiple(keys) {
    const results = {};
    for (const key of keys) {
      results[key] = await this.get(key);
    }
    return results;
  }

  async setMultiple(items, ttl = null) {
    for (const [key, value] of items) {
      await this.set(key, value, ttl);
    }
    return true;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%',
      localCacheSize: this.localCache.size,
      connected: this.connected,
      fallbackMode: this._fallbackMode
    };
  }

  isConnected() {
    return this.connected && !this._fallbackMode;
  }
}

class DistributedCacheManager {
  constructor(options = {}) {
    this.adapter = null;
    this.options = options;
    this.enabled = options.enabled !== false;
  }

  async initialize(redisOptions = {}) {
    if (!this.enabled) {
      console.log('[DistributedCacheManager] Distributed cache is disabled');
      return false;
    }

    this.adapter = new RedisCacheAdapter(redisOptions);
    return await this.adapter.connect();
  }

  async get(key) {
    if (!this.adapter) return null;
    return await this.adapter.get(key);
  }

  async set(key, value, ttl) {
    if (!this.adapter) return false;
    return await this.adapter.set(key, value, ttl);
  }

  async delete(key) {
    if (!this.adapter) return false;
    return await this.adapter.delete(key);
  }

  async disconnect() {
    if (this.adapter) {
      await this.adapter.disconnect();
      this.adapter = null;
    }
  }

  getStats() {
    if (!this.adapter) {
      return { enabled: this.enabled, initialized: false };
    }
    return {
      enabled: this.enabled,
      initialized: true,
      ...this.adapter.getStats()
    };
  }
}

module.exports = { RedisCacheAdapter, DistributedCacheManager };
