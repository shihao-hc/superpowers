/**
 * SemanticMemorySystem - 基于ChromaDB的语义记忆系统
 * 
 * 功能:
 * - 向量化记忆存储
 * - 语义相似度搜索
 * - RAG上下文检索
 * - 跨会话人格连续性
 */

const Chroma = require('chromadb');
const { ChromaClient } = require('chromadb');

class SemanticMemorySystem {
  constructor(options = {}) {
    this.client = null;
    this.collections = new Map();
    this.embedder = null;
    this.isInitialized = false;
    
    this.options = {
      persistDirectory: options.persistDirectory || './data/chromadb',
      collectionName: options.collectionName || 'semantic_memory',
      embeddingModel: options.embeddingModel || 'sentence-transformers/all-MiniLM-L6-v2',
      maxResults: options.maxResults || 5,
      similarityThreshold: options.similarityThreshold || 0.7,
      ...options
    };
    
    this.collectionConfigs = {
      conversations: {
        name: 'conversations',
        description: '对话历史记忆',
        metadata: { type: 'conversation' }
      },
      facts: {
        name: 'facts',
        description: '事实知识记忆',
        metadata: { type: 'fact' }
      },
      preferences: {
        name: 'preferences',
        description: '用户偏好记忆',
        metadata: { type: 'preference' }
      },
      personality: {
        name: 'personality',
        description: '人格特征记忆',
        metadata: { type: 'personality' }
      },
      events: {
        name: 'events',
        description: '重要事件记忆',
        metadata: { type: 'event' }
      }
    };
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      this.client = new ChromaClient({
        path: this.options.persistDirectory
      });
      
      console.log('[SemanticMemory] ChromaDB client created');
      
      for (const [key, config] of Object.entries(this.collectionConfigs)) {
        await this._createCollection(key, config);
      }
      
      this.isInitialized = true;
      console.log('[SemanticMemory] Initialized with', this.collections.size, 'collections');
      
      return true;
    } catch (error) {
      console.error('[SemanticMemory] Initialization failed:', error);
      return false;
    }
  }

  async _createCollection(key, config) {
    try {
      const collection = await this.client.getOrCreateCollection({
        name: config.name,
        metadata: config.metadata
      });
      this.collections.set(key, collection);
    } catch (error) {
      console.error(`[SemanticMemory] Failed to create collection ${key}:`, error.message);
    }
  }

  async addMemory(type, content, metadata = {}) {
    if (!this.isInitialized) await this.initialize();
    
    const collection = this.collections.get(type);
    if (!collection) {
      console.error(`[SemanticMemory] Unknown collection type: ${type}`);
      return null;
    }
    
    try {
      const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const doc = typeof content === 'string' ? content : JSON.stringify(content);
      
      const record = {
        id,
        document: doc,
        metadata: {
          ...metadata,
          createdAt: Date.now(),
          type
        }
      };
      
      await collection.add(record);
      
      console.log(`[SemanticMemory] Added memory to ${type}:`, id);
      
      return id;
    } catch (error) {
      console.error('[SemanticMemory] Failed to add memory:', error);
      return null;
    }
  }

  async search(type, query, options = {}) {
    if (!this.isInitialized) await this.initialize();
    
    const collection = this.collections.get(type);
    if (!collection) {
      console.error(`[SemanticMemory] Unknown collection type: ${type}`);
      return [];
    }
    
    try {
      const maxResults = options.maxResults || this.options.maxResults;
      const threshold = options.similarityThreshold || this.options.similarityThreshold;
      
      const results = await collection.query({
        queryTexts: [query],
        nResults: maxResults
      });
      
      if (!results.documents || !results.documents[0]) {
        return [];
      }
      
      const memories = results.documents[0].map((doc, i) => ({
        content: doc,
        distance: results.distances?.[0]?.[i] || 0,
        id: results.ids?.[0]?.[i],
        metadata: results.metadatas?.[0]?.[i]
      }));
      
      const filtered = memories.filter(m => {
        const similarity = 1 - (m.distance || 0);
        return similarity >= threshold;
      });
      
      return filtered;
    } catch (error) {
      console.error('[SemanticMemory] Search failed:', error);
      return [];
    }
  }

  async searchAll(query, options = {}) {
    if (!this.isInitialized) await this.initialize();
    
    const allResults = [];
    
    for (const [type, collection] of this.collections) {
      try {
        const results = await this.search(type, query, options);
        allResults.push(...results.map(r => ({ ...r, collection: type })));
      } catch (e) {
        // Skip failed collections
      }
    }
    
    allResults.sort((a, b) => a.distance - b.distance);
    
    return allResults.slice(0, options.maxResults || this.options.maxResults);
  }

  async deleteMemory(type, id) {
    if (!this.isInitialized) await this.initialize();
    
    const collection = this.collections.get(type);
    if (!collection) return false;
    
    try {
      await collection.delete({ ids: [id] });
      console.log(`[SemanticMemory] Deleted memory ${id} from ${type}`);
      return true;
    } catch (error) {
      console.error('[SemanticMemory] Delete failed:', error);
      return false;
    }
  }

  async getContext(query, options = {}) {
    const maxTokens = options.maxTokens || 2000;
    const results = await this.searchAll(query, { maxResults: 10 });
    
    let context = '';
    let tokenCount = 0;
    
    for (const result of results) {
      const content = result.content;
      const estimateTokens = content.length / 4;
      
      if (tokenCount + estimateTokens > maxTokens) {
        break;
      }
      
      context += `[${result.collection}] ${content}\n\n`;
      tokenCount += estimateTokens;
    }
    
    return context.trim();
  }

  async getConversationContext(userId, options = {}) {
    if (!this.isInitialized) await this.initialize();
    
    const collection = this.collections.get('conversations');
    if (!collection) return '';
    
    try {
      const results = await collection.get({
        where: { userId },
        limit: 20
      });
      
      if (!results.documents) return '';
      
      return results.documents
        .map((doc, i) => ({
          content: doc,
          metadata: results.metadatas?.[i]
        }))
        .filter(m => m.metadata?.userId === userId)
        .sort((a, b) => (a.metadata?.createdAt || 0) - (b.metadata?.createdAt || 0))
        .slice(-10)
        .map(m => m.content)
        .join('\n');
    } catch (error) {
      console.error('[SemanticMemory] Get conversation context failed:', error);
      return '';
    }
  }

  async recordConversation(userId, role, content, metadata = {}) {
    return this.addMemory('conversations', content, {
      userId,
      role,
      ...metadata
    });
  }

  async getPersonalityContext(userId) {
    return this.search('personality', `user ${userId} personality preferences`, {
      maxResults: 5
    });
  }

  async learnPreference(userId, preferenceType, value, reason = '') {
    return this.addMemory('preferences', 
      `User ${userId} prefers ${preferenceType}: ${value}. Reason: ${reason}`,
      { userId, preferenceType, value }
    );
  }

  async getUserFacts(userId) {
    return this.search('facts', `facts about user ${userId}`, {
      maxResults: 20
    });
  }

  async addFact(userId, fact, confidence = 1.0) {
    return this.addMemory('facts',
      `Known fact about ${userId}: ${fact}`,
      { userId, confidence }
    );
  }

  async recordEvent(userId, eventType, description, metadata = {}) {
    return this.addMemory('events',
      `Event for ${userId}: ${eventType} - ${description}`,
      { userId, eventType, ...metadata }
    );
  }

  async consolidateMemory(userId) {
    const conversations = await this.getConversationContext(userId);
    const facts = await this.getUserFacts(userId);
    
    const summary = this._generateSummary(conversations, facts);
    
    if (summary) {
      await this.addMemory('personality', summary, {
        userId,
        type: 'consolidated',
        timestamp: Date.now()
      });
    }
    
    return summary;
  }

  _generateSummary(conversations, facts) {
    if (!conversations && !facts) return '';
    
    const parts = [];
    if (conversations) {
      parts.push(`Recent conversations:\n${conversations.slice(-500)}`);
    }
    if (facts && facts.length > 0) {
      parts.push(`Known facts:\n${facts.map(f => f.content).join('\n')}`);
    }
    
    return parts.join('\n\n');
  }

  async getStats() {
    const stats = {};
    
    for (const [name, collection] of this.collections) {
      try {
        const count = await collection.count();
        stats[name] = count;
      } catch (e) {
        stats[name] = 'error';
      }
    }
    
    return stats;
  }

  async clear(type = null) {
    if (!this.isInitialized) await this.initialize();
    
    if (type) {
      const collection = this.collections.get(type);
      if (collection) {
        await collection.delete({ where: {} });
        console.log(`[SemanticMemory] Cleared collection ${type}`);
      }
    } else {
      for (const [name, collection] of this.collections) {
        await collection.delete({ where: {} });
      }
      console.log('[SemanticMemory] Cleared all collections');
    }
  }

  async destroy() {
    this.collections.clear();
    this.client = null;
    this.isInitialized = false;
  }
}

/**
 * RAGContextBuilder - RAG上下文构建器
 */
class RAGContextBuilder {
  constructor(semanticMemory) {
    this.memory = semanticMemory;
    this.systemPrompt = '';
    this.maxContextLength = 4000;
  }

  async buildContext(userId, currentQuery, options = {}) {
    const context = {
      semantic: await this.memory.getContext(currentQuery, { maxTokens: 1000 }),
      conversations: await this.memory.getConversationContext(userId, { maxResults: 5 }),
      personality: await this.memory.getPersonalityContext(userId),
      facts: await this.memory.getUserFacts(userId)
    };
    
    return this._formatContext(context, options);
  }

  _formatContext(context, options = {}) {
    const parts = [];
    
    if (options.includeSemantic !== false && context.semantic) {
      parts.push(`[相关记忆]\n${context.semantic}`);
    }
    
    if (options.includeConversations !== false && context.conversations) {
      parts.push(`[对话历史]\n${context.conversations}`);
    }
    
    if (options.includePersonality && context.personality.length > 0) {
      parts.push(`[人格特征]\n${context.personality.map(p => p.content).join('\n')}`);
    }
    
    if (options.includeFacts && context.facts.length > 0) {
      parts.push(`[已知事实]\n${context.facts.map(f => f.content).join('\n')}`);
    }
    
    let result = parts.join('\n\n');
    
    if (result.length > this.maxContextLength) {
      result = result.slice(0, this.maxContextLength) + '\n\n[内容已截断]';
    }
    
    return result;
  }

  setSystemPrompt(prompt) {
    this.systemPrompt = prompt;
  }

  getSystemPrompt(context) {
    let prompt = this.systemPrompt;
    
    if (context) {
      prompt += '\n\n[上下文信息]\n' + context;
    }
    
    prompt += '\n\n请根据以上上下文信息回答用户的问题。';
    
    return prompt;
  }
}

/**
 * MemoryConsolidator - 记忆整合器
 * 定期整合碎片化记忆为结构化知识
 */
class MemoryConsolidator {
  constructor(semanticMemory) {
    this.memory = semanticMemory;
    this.lastConsolidation = Date.now();
    this.consolidationInterval = 24 * 60 * 60 * 1000; // 24 hours
  }

  async shouldConsolidate() {
    return Date.now() - this.lastConsolidation > this.consolidationInterval;
  }

  async consolidateUser(userId) {
    console.log(`[MemoryConsolidator] Consolidating memory for user ${userId}`);
    
    const recentMemories = await this.memory.searchAll(`user ${userId}`, {
      maxResults: 50
    });
    
    if (recentMemories.length < 10) {
      console.log('[MemoryConsolidator] Not enough memories to consolidate');
      return null;
    }
    
    const consolidated = this._processMemories(recentMemories);
    
    if (consolidated) {
      await this.memory.addMemory('personality', consolidated, {
        userId,
        type: 'consolidated',
        consolidatedAt: Date.now(),
        sourceCount: recentMemories.length
      });
      
      this.lastConsolidation = Date.now();
    }
    
    return consolidated;
  }

  _processMemories(memories) {
    const topics = this._extractTopics(memories);
    const preferences = this._extractPreferences(memories);
    const patterns = this._extractPatterns(memories);
    
    const parts = [];
    
    if (topics.length > 0) {
      parts.push(`关注的话题: ${topics.join(', ')}`);
    }
    if (preferences.length > 0) {
      parts.push(`已知偏好: ${preferences.join('; ')}`);
    }
    if (patterns.length > 0) {
      parts.push(`交互模式: ${patterns.join('; ')}`);
    }
    
    return parts.length > 0 ? parts.join('\n') : null;
  }

  _extractTopics(memories) {
    const topics = [];
    const topicKeywords = ['喜欢', '关注', '谈论', '询问', '讨论', '研究'];
    
    for (const mem of memories) {
      for (const keyword of topicKeywords) {
        if (mem.content.includes(keyword)) {
          const match = mem.content.match(new RegExp(`${keyword}[的]?([^。,]+)`));
          if (match) {
            topics.push(match[1].trim());
          }
        }
      }
    }
    
    return [...new Set(topics)].slice(0, 5);
  }

  _extractPreferences(memories) {
    const prefs = [];
    
    for (const mem of memories) {
      if (mem.collection === 'preferences') {
        prefs.push(mem.content);
      }
    }
    
    return prefs.slice(0, 5);
  }

  _extractPatterns(memories) {
    const patterns = [];
    
    if (memories.length > 20) {
      patterns.push('活跃用户');
    }
    
    const hasMultiCollection = new Set(memories.map(m => m.collection)).size > 3;
    if (hasMultiCollection) {
      patterns.push('多样化兴趣');
    }
    
    return patterns;
  }
}

module.exports = {
  SemanticMemorySystem,
  RAGContextBuilder,
  MemoryConsolidator
};
