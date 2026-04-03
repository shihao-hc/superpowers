/**
 * BrowserEmbedding - 浏览器端向量Embedding系统
 * 
 * 使用Transformers.js实现本地文本向量化
 * 减少对外部API的依赖
 */

class BrowserEmbedding {
  constructor(options = {}) {
    this.model = null;
    this.tokenizer = null;
    this.isLoaded = false;
    this.modelName = options.modelName || 'Xenova/all-MiniLM-L6-v2';
    this.maxTokens = options.maxTokens || 256;
    this.dimensions = options.dimensions || 384;
    
    this.onProgress = options.onProgress || (() => {});
    this.onLoaded = options.onLoaded || (() => {});
    this.onerror = options.onerror || (() => {});
    
    this.cache = new Map();
    this.maxCacheSize = options.maxCacheSize || 1000;
  }

  async load() {
    if (typeof transformers === 'undefined') {
      try {
        await this._loadTransformers();
      } catch (e) {
        console.error('[BrowserEmbedding] Failed to load Transformers.js:', e);
        return false;
      }
    }

    try {
      this.onProgress('Loading tokenizer...');
      this.tokenizer = await transformers.AutoTokenizer.from_pretrained(this.modelName);
      
      this.onProgress('Loading model...');
      this.model = await transformers.AutoModel.from_pretrained(this.modelName);
      
      this.isLoaded = true;
      this.onProgress('Model loaded');
      this.onLoaded();
      
      console.log('[BrowserEmbedding] Model loaded successfully');
      return true;
    } catch (error) {
      console.error('[BrowserEmbedding] Failed to load model:', error);
      this.onerror(error);
      return false;
    }
  }

  async _loadTransformers() {
    return new Promise((resolve, reject) => {
      if (typeof transformers !== 'undefined') {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';
      script.integrity = 'sha384-lYpvlJSCh7r5IOlKsNJp1Nl7gJYMhN8nCj0NjF9XpJOKYqF8JQ6oFGfZ5I5l2H8';
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        console.log('[BrowserEmbedding] Transformers.js loaded');
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async embed(text) {
    if (!this.isLoaded) {
      console.warn('[BrowserEmbedding] Model not loaded, returning null');
      return null;
    }

    if (!text || typeof text !== 'string' || text.length > 5000) {
      console.warn('[BrowserEmbedding] Invalid or too long text input');
      return null;
    }

    const cacheKey = text.substring(0, 100);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const inputs = await this.tokenizer(text, {
        padding: true,
        truncation: true,
        max_length: this.maxTokens,
        return_tensors: 'pt'
      });

      const output = await this.model(inputs);
      const embedding = this._meanPool(output.last_hidden_state, inputs.attention_mask);
      
      const embeddingArray = Array.from(embedding.data);
      
      if (this.cache.size >= this.maxCacheSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, embeddingArray);

      return embeddingArray;
    } catch (error) {
      console.error('[BrowserEmbedding] Embedding error:', error);
      return null;
    }
  }

  async embedBatch(texts) {
    const results = [];
    for (const text of texts) {
      const embedding = await this.embed(text);
      results.push(embedding);
    }
    return results;
  }

  _meanPool(lastHiddenState, attentionMask) {
    const [batchSize, seqLen, hiddenSize] = lastHiddenState.shape;
    const pooled = new Float32Array(hiddenSize);
    
    for (let i = 0; i < batchSize; i++) {
      let sum = 0;
      for (let j = 0; j < seqLen; j++) {
        const mask = attentionMask.data[i * seqLen + j];
        if (mask === 1) {
          for (let k = 0; k < hiddenSize; k++) {
            pooled[k] += lastHiddenState.data[(i * seqLen + j) * hiddenSize + k];
          }
          sum++;
        }
      }
      if (sum > 0) {
        for (let k = 0; k < hiddenSize; k++) {
          pooled[k] /= sum;
        }
      }
    }
    
    return { data: pooled, shape: [hiddenSize] };
  }

  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  euclideanDistance(a, b) {
    if (!a || !b || a.length !== b.length) return Infinity;
    
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    
    return Math.sqrt(sum);
  }

  clearCache() {
    this.cache.clear();
  }

  getCacheSize() {
    return this.cache.size;
  }

  dispose() {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.tokenizer = null;
    this.isLoaded = false;
    this.clearCache();
  }
}

/**
 * SemanticSearchWithEmbedding - 使用本地Embedding的语义搜索
 */
class SemanticSearchWithEmbedding {
  constructor(semanticMemory, options = {}) {
    this.memory = semanticMemory;
    this.embedder = new BrowserEmbedding(options);
    this.embeddings = new Map();
  }

  async initialize() {
    return await this.embedder.load();
  }

  async indexDocuments(documents) {
    for (const doc of documents) {
      const embedding = await this.embedder.embed(doc.content);
      if (embedding) {
        this.embeddings.set(doc.id, {
          embedding,
          document: doc
        });
      }
    }
    console.log(`[SemanticSearch] Indexed ${this.embeddings.size} documents`);
  }

  async search(query, topK = 5) {
    const queryEmbedding = await this.embedder.embed(query);
    if (!queryEmbedding) return [];

    const results = [];
    for (const [id, data] of this.embeddings) {
      const similarity = this.embedder.cosineSimilarity(queryEmbedding, data.embedding);
      results.push({
        id,
        document: data.document,
        similarity,
        score: similarity
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  dispose() {
    this.embedder.dispose();
    this.embeddings.clear();
  }
}

if (typeof window !== 'undefined') {
  window.BrowserEmbedding = BrowserEmbedding;
  window.SemanticSearchWithEmbedding = SemanticSearchWithEmbedding;
}

if (typeof module !== 'undefined') {
  module.exports = { BrowserEmbedding, SemanticSearchWithEmbedding };
}
