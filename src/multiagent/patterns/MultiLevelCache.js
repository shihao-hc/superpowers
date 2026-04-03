/**
 * MultiLevelCache - 多级缓存策略
 * 
 * 参考 TradingAgents-CN 的 Redis + MongoDB 多级缓存架构
 * 
 * 核心思想:
 * L1: 内存缓存 (最快，容量小)
 * L2: Redis缓存 (快速，持久化)
 * L3: 文件缓存 (本地，持久化)
 * L4: 数据库 (最慢，高度持久化)
 * 
 * 使用场景:
 * - 新闻数据 (高并发，低时效性)
 * - 股票行情 (热点数据，加速访问)
 * - API响应 (减少外部调用)
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class CacheEntry {
  constructor(value, ttl, metadata = {}) {
    this.value = value;
    this.createdAt = Date.now();
    this.ttl = ttl;
    this.metadata = metadata;
    this.accessCount = 0;
    this.lastAccessed = this.createdAt;
  }
  
  isExpired() {
    if (this.ttl <= 0) return false;
    return Date.now() - this.createdAt > this.ttl;
  }
  
  access() {
    this.accessCount++;
    this.lastAccessed = Date.now();
    return this.value;
  }
  
  toJSON() {
    return {
      value: this.value,
      createdAt: this.createdAt,
      ttl: this.ttl,
      metadata: this.metadata,
      accessCount: this.accessCount,
      lastAccessed: this.lastAccessed
    };
  }
  
  static fromJSON(json) {
    const entry = new CacheEntry(json.value, json.ttl, json.metadata);
    entry.createdAt = json.createdAt;
    entry.accessCount = json.accessCount || 0;
    entry.lastAccessed = json.lastAccessed || json.createdAt;
    return entry;
  }
}

class MemoryCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || 300000;
    this.cache = new Map();
    this.accessOrder = [];
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }
  
  _generateKey(key) {
    if (typeof key === 'object') {
      return crypto.createHash('sha256')
        .update(JSON.stringify(key))
        .digest('hex');
    }
    return String(key);
  }
  
  _evictLRU() {
    while (this.cache.size >= this.maxSize && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift();
      if (this.cache.has(oldest)) {
        this.cache.delete(oldest);
        this.stats.evictions++;
      }
    }
  }
  
  _updateAccess(key) {
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
    }
    this.accessOrder.push(key);
  }
  
  get(key) {
    const hash = this._generateKey(key);
    const entry = this.cache.get(hash);
    
    if (!entry || entry.isExpired()) {
      this.stats.misses++;
      if (entry) this.cache.delete(hash);
      return null;
    }
    
    this._updateAccess(hash);
    this.stats.hits++;
    return entry.access();
  }
  
  set(key, value, ttl = this.defaultTTL) {
    const hash = this._generateKey(key);
    
    if (this.cache.has(hash)) {
      const entry = this.cache.get(hash);
      entry.value = value;
      entry.createdAt = Date.now();
      entry.ttl = ttl;
      this._updateAccess(hash);
      return;
    }
    
    this._evictLRU();
    
    const entry = new CacheEntry(value, ttl);
    this.cache.set(hash, entry);
    this.accessOrder.push(hash);
  }
  
  delete(key) {
    const hash = this._generateKey(key);
    if (this.cache.has(hash)) {
      const idx = this.accessOrder.indexOf(hash);
      if (idx !== -1) this.accessOrder.splice(idx, 1);
      this.cache.delete(hash);
      return true;
    }
    return false;
  }
  
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.accessOrder = [];
    return size;
  }
  
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total).toFixed(4) : 0,
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }
}

class FileCache {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || './cache';
    this.defaultTTL = options.defaultTTL || 3600000;
    this.maxSize = options.maxSize || 100 * 1024 * 1024;
  }
  
  _getFilePath(key) {
    const hash = crypto.createHash('sha256')
      .update(typeof key === 'string' ? key : JSON.stringify(key))
      .digest('hex');
    
    const subdir = hash.slice(0, 2);
    const dir = path.join(this.cacheDir, subdir);
    
    return { dir, filePath: path.join(dir, `${hash}.json`) };
  }
  
  async ensureDir(dir) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {}
  }
  
  async get(key) {
    const { filePath, dir } = this._getFilePath(key);
    
    try {
      await fs.access(filePath);
      const data = await fs.readFile(filePath, 'utf-8');
      const entry = CacheEntry.fromJSON(JSON.parse(data));
      
      if (entry.isExpired()) {
        await this.delete(key);
        return null;
      }
      
      return entry.access();
    } catch {
      return null;
    }
  }
  
  async set(key, value, ttl = this.defaultTTL) {
    const { filePath, dir } = this._getFilePath(key);
    
    await this.ensureDir(dir);
    
    const entry = new CacheEntry(value, ttl);
    await fs.writeFile(filePath, JSON.stringify(entry.toJSON()), 'utf-8');
  }
  
  async delete(key) {
    const { filePath } = this._getFilePath(key);
    
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  async clear() {
    let count = 0;
    
    const clearDir = async (dir) => {
      try {
        const entries = await fs.readdir(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = await fs.stat(fullPath);
          if (stat.isDirectory()) {
            await clearDir(fullPath);
            await fs.rmdir(fullPath);
          } else {
            await fs.unlink(fullPath);
            count++;
          }
        }
      } catch {}
    };
    
    await clearDir(this.cacheDir);
    return count;
  }
  
  async getSize() {
    let totalSize = 0;
    
    const calcSize = async (dir) => {
      try {
        const entries = await fs.readdir(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = await fs.stat(fullPath);
          if (stat.isDirectory()) {
            await calcSize(fullPath);
          } else {
            totalSize += stat.size;
          }
        }
      } catch {}
    };
    
    await calcSize(this.cacheDir);
    return totalSize;
  }
}

class RedisCache {
  constructor(options = {}) {
    this.redis = options.redis;
    this.prefix = options.prefix || 'cache:';
    this.defaultTTL = options.defaultTTL || 3600000;
    this.stats = { hits: 0, misses: 0 };
  }
  
  _prefixKey(key) {
    const hash = crypto.createHash('sha256')
      .update(typeof key === 'string' ? key : JSON.stringify(key))
      .digest('hex');
    return `${this.prefix}${hash}`;
  }
  
  async get(key) {
    if (!this.redis) return null;
    
    try {
      const prefixedKey = this._prefixKey(key);
      const data = await this.redis.get(prefixedKey);
      
      if (!data) {
        this.stats.misses++;
        return null;
      }
      
      const entry = CacheEntry.fromJSON(JSON.parse(data));
      
      if (entry.isExpired()) {
        await this.delete(key);
        this.stats.misses++;
        return null;
      }
      
      this.stats.hits++;
      return entry.access();
    } catch {
      this.stats.misses++;
      return null;
    }
  }
  
  async set(key, value, ttl = this.defaultTTL) {
    if (!this.redis) return;
    
    try {
      const prefixedKey = this._prefixKey(key);
      const entry = new CacheEntry(value, ttl);
      await this.redis.set(prefixedKey, JSON.stringify(entry.toJSON()), 'PX', ttl);
    } catch {}
  }
  
  async delete(key) {
    if (!this.redis) return false;
    
    try {
      const prefixedKey = this._prefixKey(key);
      await this.redis.del(prefixedKey);
      return true;
    } catch {
      return false;
    }
  }
  
  async clear() {
    if (!this.redis) return 0;
    
    try {
      const keys = await this.redis.keys(`${this.prefix}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return keys.length;
    } catch {
      return 0;
    }
  }
  
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total).toFixed(4) : 0
    };
  }
}

class MultiLevelCache {
  constructor(options = {}) {
    this.l1 = new MemoryCache({
      maxSize: options.l1MaxSize || 500,
      defaultTTL: options.l1TTL || 60000
    });
    
    this.l2 = options.l2Redis 
      ? new RedisCache({ redis: options.l2Redis, prefix: options.l2Prefix || 'ml2:' })
      : null;
    
    this.l3 = new FileCache({
      cacheDir: options.l3Dir || './cache',
      defaultTTL: options.l3TTL || 3600000
    });
    
    this.enabled = {
      l1: options.enableL1 !== false,
      l2: options.enableL2 !== false && !!options.l2Redis,
      l3: options.enableL3 !== false
    };
    
    this.stats = {
      reads: { l1: 0, l2: 0, l3: 0 },
      writes: { l1: 0, l2: 0, l3: 0 },
      misses: 0
    };
  }
  
  async get(key, options = {}) {
    if (this.enabled.l1) {
      const l1Result = this.l1.get(key);
      if (l1Result !== null) {
        this.stats.reads.l1++;
        return l1Result;
      }
    }
    
    if (this.enabled.l2 && this.l2) {
      const l2Result = await this.l2.get(key);
      if (l2Result !== null) {
        this.stats.reads.l2++;
        if (this.enabled.l1) {
          this.l1.set(key, l2Result);
        }
        return l2Result;
      }
    }
    
    if (this.enabled.l3) {
      try {
        const l3Result = await this.l3.get(key);
        if (l3Result !== null) {
          this.stats.reads.l3++;
          if (this.enabled.l1) {
            this.l1.set(key, l3Result);
          }
          if (this.enabled.l2 && this.l2) {
            await this.l2.set(key, l3Result);
          }
          return l3Result;
        }
      } catch {}
    }
    
    this.stats.misses++;
    return null;
  }
  
  async set(key, value, options = {}) {
    const ttl = options.ttl || 300000;
    
    if (this.enabled.l1) {
      this.l1.set(key, value, options.l1TTL || ttl);
      this.stats.writes.l1++;
    }
    
    if (this.enabled.l2 && this.l2) {
      await this.l2.set(key, value, options.l2TTL || ttl);
      this.stats.writes.l2++;
    }
    
    if (this.enabled.l3) {
      await this.l3.set(key, value, options.l3TTL || ttl);
      this.stats.writes.l3++;
    }
  }
  
  async delete(key) {
    let deleted = 0;
    
    if (this.enabled.l1) {
      deleted += this.l1.delete(key) ? 1 : 0;
    }
    
    if (this.enabled.l2 && this.l2) {
      deleted += await this.l2.delete(key) ? 1 : 0;
    }
    
    if (this.enabled.l3) {
      deleted += await this.l3.delete(key) ? 1 : 0;
    }
    
    return deleted;
  }
  
  async clear() {
    let cleared = 0;
    
    if (this.enabled.l1) {
      cleared += this.l1.clear();
    }
    
    if (this.enabled.l2 && this.l2) {
      cleared += await this.l2.clear();
    }
    
    if (this.enabled.l3) {
      cleared += await this.l3.clear();
    }
    
    return cleared;
  }
  
  async getOrFetch(key, fetchFn, options = {}) {
    const cached = await this.get(key);
    if (cached !== null) {
      return { hit: true, value: cached };
    }
    
    const value = await fetchFn();
    if (value !== null && value !== undefined) {
      await this.set(key, value, options);
    }
    
    return { hit: false, value };
  }
  
  getStats() {
    return {
      l1: this.enabled.l1 ? this.l1.getStats() : null,
      l2: this.enabled.l2 && this.l2 ? this.l2.getStats() : null,
      l3: this.enabled.l3 ? { 
        enabled: true,
        size: this.l3.getSize ? 'checking...' : 0 
      } : null,
      reads: this.stats.reads,
      writes: this.stats.writes,
      misses: this.stats.misses,
      totalHits: this.stats.reads.l1 + this.stats.reads.l2 + this.stats.reads.l3,
      totalMisses: this.stats.misses
    };
  }
}

module.exports = {
  CacheEntry,
  MemoryCache,
  FileCache,
  RedisCache,
  MultiLevelCache
};
