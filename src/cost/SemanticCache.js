/**
 * Semantic Cache
 * 语义缓存 - 基于向量相似度的智能缓存
 */

const crypto = require('crypto');

class SemanticCache {
  constructor(options = {}) {
    this.vectorStore = new Map();
    this.cacheStore = new Map();
    this.embeddings = new Map();
    
    this.config = {
      similarityThreshold: options.similarityThreshold || 0.85,
      maxCacheSize: options.maxCacheSize || 10000,
      defaultTTL: options.defaultTTL || 24 * 60 * 60 * 1000, // 24小时
      embeddingModel: options.embeddingModel || 'text-embedding-3-large'
    };

    this.stats = {
      hits: 0,
      misses: 0,
      semanticHits: 0,
      evictions: 0
    };
  }

  // 生成向量嵌入
  async embed(text) {
    // 实际实现应调用 embedding API
    // 这里使用简化的一致性哈希作为文本指纹
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    const vector = this._hashToVector(hash);
    
    return {
      id: `emb_${hash.substring(0, 16)}`,
      vector,
      text: text.substring(0, 500) // 存储原文用于调试
    };
  }

  _hashToVector(hash) {
    // 将哈希转换为固定维度的向量
    const dimensions = 1536; // 与 text-embedding-3-large 一致
    const vector = [];
    
    for (let i = 0; i < dimensions; i++) {
      const charIndex = (i * 2) % hash.length;
      const value = parseInt(hash.substring(charIndex, charIndex + 2), 16) / 255;
      vector.push(value * 2 - 1); // 归一化到 [-1, 1]
    }
    
    return vector;
  }

  // 存储缓存
  async set(key, value, options = {}) {
    const { ttl = this.config.defaultTTL, tags = [] } = options;
    
    // 生成嵌入
    const embedding = await this.embed(key);
    
    const cacheEntry = {
      key,
      value,
      embedding,
      tags,
      ttl,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
      hits: 0,
      size: this._estimateSize(value)
    };

    // 存储向量
    this.embeddings.set(embedding.id, embedding);
    this.vectorStore.set(embedding.id, embedding.vector);

    // 存储值
    const valueKey = crypto.createHash('sha256').update(key).digest('hex');
    this.cacheStore.set(valueKey, cacheEntry);

    // 检查缓存大小，必要时驱逐
    await this._evictIfNeeded();

    return {
      cacheKey: valueKey,
      embeddingId: embedding.id,
      expiresAt: cacheEntry.expiresAt
    };
  }

  // 获取缓存
  async get(key, options = {}) {
    const { useSemantic = true, exactMatch = false } = options;
    
    const valueKey = crypto.createHash('sha256').update(key).digest('hex');
    const entry = this.cacheStore.get(valueKey);

    // 精确匹配
    if (entry) {
      if (entry.expiresAt > Date.now()) {
        entry.hits++;
        this.stats.hits++;
        return { type: 'exact', value: entry.value, hit: true };
      } else {
        // 已过期，删除
        this._deleteEntry(valueKey);
      }
    }

    // 语义匹配
    if (useSemantic && !exactMatch) {
      const semanticResult = await this._findSimilar(key);
      if (semanticResult) {
        this.stats.semanticHits++;
        return {
          type: 'semantic',
          value: semanticResult.value,
          hit: true,
          similarity: semanticResult.similarity
        };
      }
    }

    this.stats.misses++;
    return { type: 'none', value: null, hit: false };
  }

  // 查找相似的缓存
  async _findSimilar(key) {
    const queryEmbedding = await this.embed(key);
    let bestMatch = null;
    let bestSimilarity = 0;

    for (const [id, vector] of this.vectorStore.entries()) {
      const similarity = this._cosineSimilarity(queryEmbedding.vector, vector);
      
      if (similarity > this.config.similarityThreshold && similarity > bestSimilarity) {
        const entry = this._findEntryByEmbeddingId(id);
        if (entry && entry.expiresAt > Date.now()) {
          bestSimilarity = similarity;
          bestMatch = { entry, similarity };
        }
      }
    }

    if (bestMatch) {
      bestMatch.entry.hits++;
      return bestMatch.entry;
    }

    return null;
  }

  _cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return (similarity + 1) / 2; // 归一化到 [0, 1]
  }

  _findEntryByEmbeddingId(embeddingId) {
    for (const entry of this.cacheStore.values()) {
      if (entry.embedding.id === embeddingId) {
        return entry;
      }
    }
    return null;
  }

  _deleteEntry(valueKey) {
    const entry = this.cacheStore.get(valueKey);
    if (entry) {
      this.embeddings.delete(entry.embedding.id);
      this.vectorStore.delete(entry.embedding.id);
      this.cacheStore.delete(valueKey);
    }
  }

  async _evictIfNeeded() {
    if (this.cacheStore.size < this.config.maxCacheSize) return;

    // LRU 驱逐：删除最旧的条目
    const entries = Array.from(this.cacheStore.values())
      .sort((a, b) => a.createdAt - b.createdAt);

    const toDelete = entries.slice(0, Math.floor(this.config.maxCacheSize * 0.1));
    
    for (const entry of toDelete) {
      const valueKey = crypto.createHash('sha256').update(entry.key).digest('hex');
      this._deleteEntry(valueKey);
      this.stats.evictions++;
    }
  }

  _estimateSize(value) {
    return JSON.stringify(value).length;
  }

  // 清除过期缓存
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cacheStore.entries()) {
      if (entry.expiresAt < now) {
        this._deleteEntry(key);
        cleaned++;
      }
    }

    return { cleaned };
  }

  // 获取统计
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      semanticHits: this.stats.semanticHits,
      evictions: this.stats.evictions,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      semanticHitRate: this.stats.hits > 0 ? this.stats.semanticHits / this.stats.hits : 0,
      size: this.cacheStore.size,
      maxSize: this.config.maxCacheSize
    };
  }

  // 删除特定标签的缓存
  invalidateByTags(tags) {
    let invalidated = 0;
    
    for (const [key, entry] of this.cacheStore.entries()) {
      if (tags.some(tag => entry.tags.includes(tag))) {
        this._deleteEntry(key);
        invalidated++;
      }
    }
    
    return { invalidated };
  }

  // 清除所有缓存
  clear() {
    this.vectorStore.clear();
    this.cacheStore.clear();
    this.embeddings.clear();
    this.stats = { hits: 0, misses: 0, semanticHits: 0, evictions: 0 };
  }
}

module.exports = { SemanticCache };
