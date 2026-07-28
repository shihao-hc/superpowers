/**
 * SmartMemory - 智能存储系统
 * LRU 淘汰 + 语义检索 + 标签提取
 */

class SmartMemory {
  constructor() {
    this._memories = [];
    this._index = {};
    this._maxSize = 100;
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
