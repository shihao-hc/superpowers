/**
 * Response Cache for OpenClaw
 * LRU cache with TTL expiration
 */

const crypto = require('crypto');

class ResponseCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 500;
    this.defaultTTL = options.defaultTTL || 300000;
    this.enabled = options.enabled !== false;
    
    this.cache = new Map();
    this.accessOrder = [];
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0
    };
    
    this._cleanupInterval = null;
    if (this.enabled) {
      this._startCleanup();
    }
  }

  _startCleanup() {
    this._cleanupInterval = setInterval(() => {
      this._cleanup();
    }, Math.min(this.defaultTTL, 60000));
  }

  _generateKey(params) {
    const hash = crypto.createHash('sha256');
    const normalized = JSON.stringify({
      model: params.model,
      messages: params.messages?.slice(0, 10).map(m => ({
        role: m.role,
        content: m.content?.slice(0, 1000)
      })),
      temperature: params.temperature,
      max_tokens: params.max_tokens
    });
    hash.update(normalized);
    return hash.digest('hex').slice(0, 32);
  }

  _evictLRU() {
    while (this.cache.size >= this.maxSize && this.accessOrder.length > 0) {
      const oldestKey = this.accessOrder.shift();
      if (this.cache.has(oldestKey)) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
    }
  }

  _updateAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  _isExpired(entry) {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  _cleanup() {
    const now = Date.now();
    let evicted = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        const index = this.accessOrder.indexOf(key);
        if (index !== -1) {
          this.accessOrder.splice(index, 1);
        }
        evicted++;
      }
    }
    
    this.stats.evictions += evicted;
    this.stats.size = this.cache.size;
  }

  get(params) {
    if (!this.enabled) return null;
    
    const key = this._generateKey(params);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    if (this._isExpired(entry)) {
      this.cache.delete(key);
      const index = this.accessOrder.indexOf(key);
      if (index !== -1) {
        this.accessOrder.splice(index, 1);
      }
      this.stats.misses++;
      this.stats.size = this.cache.size;
      return null;
    }
    
    this._updateAccessOrder(key);
    this.stats.hits++;
    return entry.data;
  }

  set(params, data, ttl = this.defaultTTL) {
    if (!this.enabled) return;
    
    const key = this._generateKey(params);
    
    if (this.cache.has(key)) {
      const entry = this.cache.get(key);
      entry.data = data;
      entry.timestamp = Date.now();
      entry.ttl = ttl;
      this._updateAccessOrder(key);
      return;
    }
    
    this._evictLRU();
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: Math.min(ttl, 3600000),
      params: {
        model: params.model,
        messageCount: params.messages?.length || 0
      }
    });
    
    this.accessOrder.push(key);
    this.stats.size = this.cache.size;
  }

  invalidate(model = null) {
    let count = 0;
    
    if (model) {
      for (const [key, entry] of this.cache.entries()) {
        if (entry.params?.model === model) {
          this.cache.delete(key);
          const index = this.accessOrder.indexOf(key);
          if (index !== -1) {
            this.accessOrder.splice(index, 1);
          }
          count++;
        }
      }
    } else {
      count = this.cache.size;
      this.cache.clear();
      this.accessOrder = [];
    }
    
    this.stats.size = this.cache.size;
    return count;
  }

  getStats() {
    return {
      ...this.stats,
      hitRate: this.stats.hits + this.stats.misses > 0 
        ? (this.stats.hits / (this.stats.hits + this.stats.misses)).toFixed(4)
        : 0,
      size: this.cache.size,
      maxSize: this.maxSize,
      enabled: this.enabled
    };
  }

  clear() {
    const count = this.cache.size;
    this.cache.clear();
    this.accessOrder = [];
    this.stats.size = 0;
    return count;
  }

  destroy() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    this.clear();
  }
}

function createResponseCache(options) {
  return new ResponseCache(options);
}

module.exports = { ResponseCache, createResponseCache };
