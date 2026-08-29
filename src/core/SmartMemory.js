/**
 * SmartMemory - 智能存储系统
 * LRU 淘汰 + 语义检索 + 标签提取
 */

class SmartMemory {
  constructor() {
    this._memories = [];
    this._index = {};
    this._maxSize = 100;
    this._embeddings = new Map();
  }

  store(key, value, metadata = {}) {
    const memory = {
      key,
      value,
      metadata,
      timestamp: Date.now(),
      tags: this._extractTags(`${key} ${JSON.stringify(value)}`)
    };

    this._memories.push(memory);
    this._index[memory.timestamp] = memory;

    if (this._memories.length > this._maxSize) {
      const oldest = this._memories.shift();
      delete this._index[oldest.timestamp];
    }

    return { stored: true, key };
  }

  search(query, limit = 5) {
    const results = [];
    const queryLower = query.toLowerCase();

    for (const memory of this._memories) {
      const keyLower = memory.key.toLowerCase();
      const valueLower = JSON.stringify(memory.value).toLowerCase();

      let score = 0;
      const queryWords = queryLower.split(/\s+/);
      for (const word of queryWords) {
        if (word.length < 2) { continue; }
        if (keyLower.includes(word)) { score += 2; }
        if (valueLower.includes(word)) { score += 1; }
      }

      if (score > 0) {
        results.push({ ...memory, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * 语义检索 — 基于嵌入的余弦相似度
   * embedder: (text) => Promise<number[]>，失败/不可用时降级为关键词 search
   */
  async semanticSearch(query, limit = 5, embedder) {
    if (typeof embedder !== 'function') {
      return this.search(query, limit);
    }
    try {
      const queryEmbed = await embedder(String(query || ''));
      if (!Array.isArray(queryEmbed) || queryEmbed.length === 0) {
        return this.search(query, limit);
      }
      const scored = [];
      for (const memory of this._memories) {
        let memEmbed = this._embeddings.get(memory.key);
        if (!Array.isArray(memEmbed) || memEmbed.length === 0) {
          memEmbed = await embedder(`${memory.key} ${JSON.stringify(memory.value)}`);
          if (Array.isArray(memEmbed) && memEmbed.length > 0) {
            this._embeddings.set(memory.key, memEmbed);
          }
        }
        if (!Array.isArray(memEmbed) || memEmbed.length === 0) { continue; }
        const sim = this._cosineSimilarity(queryEmbed, memEmbed);
        scored.push({ ...memory, score: sim });
      }
      if (scored.length === 0) {
        return this.search(query, limit);
      }
      scored.sort((a, b) => b.score - a.score);
      const top = scored[0] ? scored[0].score : 0;
      // 仅当语义相似度足够时采用语义结果，否则回退关键词
      if (top < 0.3) {
        return this.search(query, limit);
      }
      return scored.slice(0, limit);
    } catch (e) {
      return this.search(query, limit);
    }
  }

  _cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
      return 0;
    }
    let dot = 0; let normA = 0; let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) { return 0; }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  getRecent(limit = 10) {
    return this._memories.slice(-limit);
  }

  getKeys() {
    return this._memories.map((m) => m.key);
  }

  _extractTags(text) {
    const tags = new Set();
    const words = text.toLowerCase().match(/\w{3,}/g) || [];
    for (const word of words) {
      if (['function', 'class', 'module', 'code', 'bug', 'fix', 'test', 'api'].includes(word)) {
        tags.add(word);
      }
    }
    return Array.from(tags);
  }

  getStats() {
    return {
      total: this._memories.length,
      keys: this.getKeys()
    };
  }
}

module.exports = SmartMemory;
