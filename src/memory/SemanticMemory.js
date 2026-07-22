/**
 * Semantic Memory System
 * 语义记忆系统 - 使用 ChromaDB 进行向量存储
 */

class SemanticMemory {
  constructor(options = {}) {
    this.options = {
      persistDirectory: options.persistDirectory || './chromadb',
      collectionName: options.collectionName || 'semantic_memory',
      embeddingModel: options.embeddingModel || 'sentence-transformers',
      distanceFunction: options.distanceFunction || 'cosine',
      ...options
    };

    this.collection = null;
    this.initialized = false;
    this.client = null;
  }

  /**
   * 初始化
   */
  async initialize() {
    try {
      const { ChromaClient } = require('chromadb');

      this.client = new ChromaClient({
        path: this.options.persistDirectory
      });

      this.collection = await this.client.getOrCreateCollection({
        name: this.options.collectionName,
        metadata: {
          description: 'Semantic memory storage',
          embeddingFunction: this.options.embeddingModel
        }
      });

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize ChromaDB:', error.message);
      // 降级到内存模式
      this.memoryStore = new Map();
      this.initialized = true;
      return false;
    }
  }

  /**
   * 添加语义记忆
   */
  async add(text, metadata = {}) {
    if (!this.initialized) {await this.initialize();}

    const id = this.generateId();

    if (this.collection) {
      await this.collection.add({
        ids: [id],
        documents: [text],
        metadatas: [{
          ...metadata,
          createdAt: Date.now()
        }]
      });
    } else {
      this.memoryStore.set(id, { text, metadata: { ...metadata, createdAt: Date.now() } });
    }

    return id;
  }

  /**
   * 语义搜索
   */
  async search(query, options = {}) {
    const { limit = 10, filter = {}, whereDocument = null } = options;

    if (!this.initialized) {await this.initialize();}

    if (this.collection) {
      const results = await this.collection.query({
        queryTexts: [query],
        nResults: limit,
        where: Object.keys(filter).length > 0 ? filter : undefined,
        whereDocument: whereDocument
      });

      return results.ids[0].map((id, i) => ({
        id,
        text: results.documents[0][i],
        metadata: results.metadatas[0][i],
        distance: results.distances?.[0]?.[i]
      }));
    } else {
      // 降级搜索
      const all = Array.from(this.memoryStore.entries()).slice(0, limit);
      return all.map(([id, data]) => ({ id, ...data }));
    }
  }

  /**
   * 更新语义记忆
   */
  async update(id, text, metadata = {}) {
    if (!this.collection) {return false;}

    try {
      await this.collection.update({
        ids: [id],
        documents: [text],
        metadatas: [metadata]
      });
      return true;
    } catch (error) {
      console.error('Update failed:', error.message);
      return false;
    }
  }

  /**
   * 删除语义记忆
   */
  async delete(id) {
    if (!this.collection) {
      this.memoryStore.delete(id);
      return true;
    }

    try {
      await this.collection.delete({ ids: [id] });
      return true;
    } catch (error) {
      console.error('Delete failed:', error.message);
      return false;
    }
  }

  /**
   * 批量添加
   */
  async addBatch(items) {
    const ids = items.map(() => this.generateId());

    if (this.collection) {
      await this.collection.add({
        ids,
        documents: items.map((item) => typeof item === 'string' ? item : item.text),
        metadatas: items.map((item) =>
          typeof item === 'object' ? item.metadata : {}
        )
      });
    } else {
      items.forEach((item, i) => {
        this.memoryStore.set(ids[i], {
          text: typeof item === 'string' ? item : item.text,
          metadata: typeof item === 'object' ? item.metadata : {}
        });
      });
    }

    return ids;
  }

  /**
   * 按标签搜索
   */
  async searchByTag(tag, limit = 10) {
    return this.search('', {
      limit,
      filter: { tag }
    });
  }

  /**
   * 获取记忆数量
   */
  async count() {
    if (!this.initialized) {await this.initialize();}

    if (this.collection) {
      return (await this.collection.count()) || 0;
    } else {
      return this.memoryStore.size;
    }
  }

  /**
   * 生成ID
   */
  generateId() {
    return `smem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 关闭连接
   */
  async close() {
    if (this.client) {
      await this.client.close();
    }
    this.initialized = false;
  }
}

module.exports = { SemanticMemory };
