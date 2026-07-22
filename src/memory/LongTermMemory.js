/**
 * Long-term Memory System
 * 长期记忆存储和检索
 * 基于 Mem0 架构
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class LongTermMemory {
  constructor(options = {}) {
    this.options = {
      storageDir: options.storageDir || './memory',
      maxMemorySize: options.maxMemorySize || 10000,
      retentionDays: options.retentionDays || 90,
      enableCompression: options.enableCompression !== false,
      ...options
    };

    this.index = new Map();
    this.metadata = {
      totalMemories: 0,
      lastCleanup: Date.now()
    };

    this.ensureStorage();
  }

  /**
   * 确保存储目录存在
   */
  ensureStorage() {
    const dirs = ['episodic', 'semantic', 'working', 'archive'];
    for (const dir of dirs) {
      const dirPath = path.join(this.options.storageDir, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
  }

  /**
   * 存储记忆
   */
  async store(memory, options = {}) {
    const {
      type = 'episodic',  // episodic, semantic, working
      userId = 'default',
      entityId = null,
      tags = [],
      importance = 0.5
    } = options;

    const id = this.generateMemoryId();
    const now = Date.now();

    const memoryObj = {
      id,
      type,
      userId,
      entityId,
      content: memory,
      tags,
      importance,
      accessCount: 0,
      lastAccessed: now,
      createdAt: now,
      updatedAt: now,
      embedding: options.embedding || null,
      metadata: options.metadata || {}
    };

    // 生成嵌入向量 (简化版)
    if (!memoryObj.embedding) {
      memoryObj.embedding = this.generateSimpleEmbedding(memory);
    }

    // 保存到文件
    const filePath = this.getMemoryPath(id, type);
    fs.writeFileSync(filePath, JSON.stringify(memoryObj, null, 2));

    // 更新索引
    this.index.set(id, {
      type,
      userId,
      entityId,
      tags,
      importance,
      path: filePath
    });

    this.metadata.totalMemories++;

    // 清理过期记忆
    if (this.metadata.totalMemories > this.options.maxMemorySize) {
      await this.cleanup();
    }

    return { id, memory: memoryObj };
  }

  /**
   * 检索记忆
   */
  async retrieve(query, options = {}) {
    const {
      type = null,
      userId = null,
      limit = 10,
      threshold = 0.5
    } = options;

    const queryEmbedding = this.generateSimpleEmbedding(query);
    const results = [];

    // 遍历索引
    for (const [id, meta] of this.index) {
      if (type && meta.type !== type) {continue;}
      if (userId && meta.userId !== userId) {continue;}

      try {
        const memory = this.loadMemory(id, meta.type);
        if (!memory) {continue;}

        // 计算相似度
        const similarity = this.cosineSimilarity(queryEmbedding, memory.embedding);

        if (similarity >= threshold) {
          results.push({
            id,
            memory,
            similarity,
            score: similarity * memory.importance
          });
        }

        // 更新访问计数
        memory.accessCount++;
        memory.lastAccessed = Date.now();
        this.saveMemory(memory);

      } catch (error) {
        console.error(`Failed to load memory ${id}:`, error.message);
      }
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * 搜索记忆
   */
  async search(query, options = {}) {
    const { tags = [], entityId = null, limit = 20 } = options;

    const results = [];

    for (const [id, meta] of this.index) {
      let match = true;

      if (tags.length > 0) {
        match = tags.some((tag) => meta.tags.includes(tag));
      }

      if (entityId && meta.entityId !== entityId) {
        match = false;
      }

      if (match) {
        try {
          const memory = this.loadMemory(id, meta.type);
          if (memory) {
            results.push(memory);
          }
        } catch (error) {
          // 跳过损坏的记忆
        }
      }
    }

    return results.slice(0, limit);
  }

  /**
   * 更新记忆
   */
  async update(id, updates) {
    for (const type of ['episodic', 'semantic', 'working']) {
      const filePath = this.getMemoryPath(id, type);
      try {
        const memory = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        Object.assign(memory, updates, { updatedAt: Date.now() });
        fs.writeFileSync(filePath, JSON.stringify(memory, null, 2));
        return memory;
      } catch { continue; }
    }
    return null;
  }

  /**
   * 删除记忆
   */
  async delete(id) {
    for (const type of ['episodic', 'semantic', 'working', 'archive']) {
      const filePath = this.getMemoryPath(id, type);
      try {
        fs.unlinkSync(filePath);
        this.index.delete(id);
        this.metadata.totalMemories--;
        return true;
      } catch { continue; }
    }
    return false;
  }

  /**
   * 获取实体相关记忆
   */
  async getEntityMemories(entityId) {
    return this.search('', { entityId, limit: 100 });
  }

  /**
   * 获取用户记忆
   */
  async getUserMemories(userId) {
    return this.search('', { userId, limit: 100 });
  }

  /**
   * 清理过期记忆
   */
  async cleanup() {
    const now = Date.now();
    const cutoffTime = now - (this.options.retentionDays * 24 * 60 * 60 * 1000);
    let cleaned = 0;

    for (const [id, meta] of this.index) {
      try {
        const memory = this.loadMemory(id, meta.type);
        if (memory && memory.updatedAt < cutoffTime && memory.accessCount < 2) {
          await this.archive(id);
          cleaned++;
        }
      } catch (error) {
        // 跳过
      }
    }

    this.metadata.lastCleanup = now;
    return cleaned;
  }

  /**
   * 归档记忆
   */
  async archive(id) {
    for (const type of ['episodic', 'semantic', 'working']) {
      const srcPath = this.getMemoryPath(id, type);
      try {
        const destPath = this.getMemoryPath(id, 'archive');
        fs.renameSync(srcPath, destPath);
        this.index.get(id).type = 'archive';
        return true;
      } catch { continue; }
    }
    return false;
  }

  /**
   * 获取记忆路径
   */
  getMemoryPath(id, type) {
    return path.join(this.options.storageDir, type, `${id}.json`);
  }

  /**
   * 加载记忆
   */
  loadMemory(id, type) {
    const filePath = this.getMemoryPath(id, type);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return null;
  }

  /**
   * 保存记忆
   */
  saveMemory(memory) {
    const filePath = this.getMemoryPath(memory.id, memory.type);
    fs.writeFileSync(filePath, JSON.stringify(memory, null, 2));
  }

  /**
   * 生成简单嵌入向量
   */
  generateSimpleEmbedding(text) {
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(128).fill(0);

    for (const word of words) {
      const hash = this.hashString(word);
      for (let i = 0; i < 128; i++) {
        embedding[i] += ((hash >> (i % 32)) & 1) ? 1 : -1;
      }
    }

    // 归一化
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map((v) => v / (norm || 1));
  }

  /**
   * 字符串哈希
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * 余弦相似度
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) {return 0;}

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  /**
   * 生成记忆ID
   */
  generateMemoryId() {
    return `mem_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const byType = {};
    for (const [, meta] of this.index) {
      byType[meta.type] = (byType[meta.type] || 0) + 1;
    }

    return {
      total: this.metadata.totalMemories,
      byType,
      lastCleanup: this.metadata.lastCleanup
    };
  }
}

module.exports = { LongTermMemory };
