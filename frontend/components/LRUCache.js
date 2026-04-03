/**
 * LRUCache - LRU缓存系统
 * 
 * 减少API调用，提升性能
 * 支持TTL过期、持久化、统计
 */

class LRUCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;
    this.ttl = options.ttl || 3600000;
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
    
    this.storageKey = options.storageKey || 'lru_cache';
    this.persistToStorage = options.persistToStorage || false;
    
    if (this.persistToStorage) {
      this._loadFromStorage();
    }
  }

  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.hits++;
    return entry.value;
  }

  set(key, value, ttl = null) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    const entry = {
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + (ttl || this.ttl),
      accessCount: 0,
      lastAccessed: Date.now()
    };
    
    this.cache.set(key, entry);
    
    if (this.persistToStorage) {
      this._saveToStorage();
    }
  }

  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    
    if (this.persistToStorage) {
      localStorage.removeItem(this.storageKey);
    }
  }

  getStats() {
    const now = Date.now();
    let expired = 0;
    let valid = 0;
    
    for (const [, entry] of this.cache) {
      if (now > entry.expiresAt) {
        expired++;
      } else {
        valid++;
      }
    }
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      valid,
      expired,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? 
        this.hits / (this.hits + this.misses) : 0
    };
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  _loadFromStorage() {
    try {
      const stored = sessionStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        for (const [key, entry] of Object.entries(data)) {
          if (Date.now() < entry.expiresAt) {
            this.cache.set(key, entry);
          }
        }
      }
    } catch (e) {
      console.warn('[LRUCache] Failed to load from storage:', e);
    }
  }

  _saveToStorage() {
    try {
      const data = {};
      for (const [key, entry] of this.cache) {
        if (!this._isSensitive(key)) {
          data[key] = entry;
        }
      }
      sessionStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {
      console.warn('[LRUCache] Failed to save to storage:', e);
    }
  }

  _isSensitive(key) {
    const sensitivePatterns = ['token', 'key', 'secret', 'password', 'auth'];
    return sensitivePatterns.some(p => key.toLowerCase().includes(p));
  }

  getKeys() {
    return Array.from(this.cache.keys());
  }

  values() {
    return Array.from(this.cache.values()).map(e => e.value);
  }

  setMaxSize(size) {
    this.maxSize = size;
    while (this.cache.size > size) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  setTTL(ttl) {
    this.ttl = ttl;
  }
}

/**
 * CachedAPIClient - 带缓存的API客户端
 */
class CachedAPIClient {
  constructor(options = {}) {
    this.cache = new LRUCache({
      maxSize: options.cacheSize || 200,
      ttl: options.cacheTTL || 300000,
      persistToStorage: options.persistToStorage || false,
      storageKey: 'api_cache'
    });
    
    this.baseUrl = options.baseUrl || '';
    this.defaultHeaders = options.headers || {};
    this.requestTimeout = options.timeout || 10000;
  }

  async get(url, options = {}) {
    const cacheKey = `GET:${url}:${JSON.stringify(options.query || {})}`;
    
    if (!options.skipCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return { data: cached, fromCache: true };
      }
    }

    const fullUrl = this._buildUrl(url, options.query);
    
    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: { ...this.defaultHeaders, ...options.headers },
        signal: AbortSignal.timeout(this.requestTimeout)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (options.cacheTTL !== 0) {
        this.cache.set(cacheKey, data, options.cacheTTL);
      }

      return { data, fromCache: false };
    } catch (error) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        console.warn('[CachedAPI] Request failed, returning stale cache:', error.message);
        return { data: cached, fromCache: true, stale: true };
      }
      throw error;
    }
  }

  async post(url, body, options = {}) {
    const fullUrl = this._buildUrl(url);
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.defaultHeaders,
        ...options.headers
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.requestTimeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  _buildUrl(url, query = null) {
    let fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
    
    if (query && Object.keys(query).length > 0) {
      const params = new URLSearchParams(query);
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + params.toString();
    }
    
    return fullUrl;
  }

  invalidateCache(pattern = null) {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    
    for (const key of this.cache.getKeys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  getCacheStats() {
    return this.cache.getStats();
  }
}

if (typeof window !== 'undefined') {
  window.LRUCache = LRUCache;
  window.CachedAPIClient = CachedAPIClient;
}

if (typeof module !== 'undefined') {
  module.exports = { LRUCache, CachedAPIClient };
}
