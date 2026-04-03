/**
 * UltraWork AI Memory Service
 * Semantic memory storage with RAG context retrieval
 */

const { EventEmitter } = require('events');
const { escapeHtml } = require('../utils/logger');
const crypto = require('crypto');

const MAX_INPUT_LENGTH = 10000;
const MAX_RESULTS = 10;
const SIMILARITY_THRESHOLD = 0.7;

class MemoryService extends EventEmitter {
  constructor() {
    super();
    this.collections = new Map();
    this.initialized = false;
    this.stats = {
      totalMemories: 0,
      searches: 0,
      hits: 0
    };

    this._initCollections();
  }

  _initCollections() {
    const collectionConfigs = {
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

    for (const [key, config] of Object.entries(collectionConfigs)) {
      this.collections.set(key, {
        name: config.name,
        description: config.description,
        metadata: config.metadata,
        documents: [],
        index: new Map()
      });
    }

    this.initialized = true;
  }

  _generateId(prefix = 'mem') {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  _normalizeText(text) {
    if (typeof text !== 'string') {
      return JSON.stringify(text);
    }
    return text.trim();
  }

  _calculateSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  _indexDocument(doc) {
    const words = this._normalizeText(doc.content)
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 1);
    
    for (const word of words) {
      if (!doc.index) doc.index = new Map();
      const existing = doc.index.get(word) || [];
      existing.push(doc.id);
      doc.index.set(word, existing);
    }
  }

  _searchIndex(collection, query) {
    const queryWords = this._normalizeText(query)
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 1);

    const scores = new Map();

    for (const word of queryWords) {
      for (const doc of collection.documents) {
        if (!doc.index) continue;
        
        const matches = doc.index.get(word) || [];
        const currentScore = scores.get(doc.id) || 0;
        scores.set(doc.id, currentScore + matches.length);
      }
    }

    return scores;
  }

  addMemory(type, content, metadata = {}) {
    if (!this.initialized) {
      this._initCollections();
    }

    const collection = this.collections.get(type);
    if (!collection) {
      const error = new Error(`Unknown collection type: ${escapeHtml(String(type))}`);
      this.emit('error', error);
      return null;
    }

    try {
      const id = this._generateId(type);
      const doc = {
        id,
        content: this._normalizeText(content),
        metadata: {
          ...metadata,
          createdAt: Date.now(),
          type,
          wordCount: content.split(/\s+/).length
        },
        index: null
      };

      this._indexDocument(doc);
      collection.documents.push(doc);
      this.stats.totalMemories++;

      this.emit('memory:added', { id, type, metadata });

      return id;
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  search(type, query, options = {}) {
    if (!this.initialized) {
      this._initCollections();
    }

    const collection = this.collections.get(type);
    if (!collection) {
      this.emit('error', new Error(`Unknown collection type: ${escapeHtml(String(type))}`));
      return [];
    }

    try {
      this.stats.searches++;

      const maxResults = options.maxResults || MAX_RESULTS;
      const threshold = options.similarityThreshold || SIMILARITY_THRESHOLD;

      const scores = this._searchIndex(collection, query);

      const results = [];

      for (const [docId, score] of scores) {
        const doc = collection.documents.find(d => d.id === docId);
        if (!doc) continue;

        const similarity = this._calculateSimilarity(query, doc.content);
        
        if (similarity >= threshold) {
          results.push({
            id: doc.id,
            content: doc.content,
            similarity,
            score,
            metadata: doc.metadata
          });
          this.stats.hits++;
        }
      }

      results.sort((a, b) => b.similarity - a.similarity);

      return results.slice(0, maxResults);
    } catch (error) {
      this.emit('error', error);
      return [];
    }
  }

  searchAll(query, options = {}) {
    const maxResults = options.maxResults || MAX_RESULTS;
    const allResults = [];

    for (const [type, collection] of this.collections) {
      const results = this.search(type, query, { ...options, maxResults: 5 });
      allResults.push(...results.map(r => ({ ...r, collection: type })));
    }

    allResults.sort((a, b) => b.similarity - a.similarity);

    return allResults.slice(0, maxResults);
  }

  getMemory(type, id) {
    const collection = this.collections.get(type);
    if (!collection) return null;

    return collection.documents.find(d => d.id === id) || null;
  }

  deleteMemory(type, id) {
    const collection = this.collections.get(type);
    if (!collection) return false;

    const index = collection.documents.findIndex(d => d.id === id);
    if (index === -1) return false;

    collection.documents.splice(index, 1);
    this.stats.totalMemories--;
    
    this.emit('memory:deleted', { id, type });
    return true;
  }

  getContext(query, options = {}) {
    const maxTokens = options.maxTokens || 2000;
    const results = this.searchAll(query, { maxResults: 10 });

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

  recordConversation(userId, role, content, metadata = {}) {
    const safeContent = this._normalizeText(content).substring(0, MAX_INPUT_LENGTH);
    return this.addMemory('conversations', safeContent, {
      userId,
      role: ['system', 'user', 'assistant'].includes(role) ? role : 'user',
      ...metadata
    });
  }

  getConversationContext(userId, options = {}) {
    const collection = this.collections.get('conversations');
    if (!collection) return '';

    const limit = options.limit || 20;
    
    const userMessages = collection.documents
      .filter(doc => doc.metadata.userId === userId)
      .sort((a, b) => (a.metadata.createdAt || 0) - (b.metadata.createdAt || 0))
      .slice(-limit);

    return userMessages.map(m => m.content).join('\n');
  }

  getPersonalityContext(userId) {
    return this.search('personality', `user ${escapeHtml(String(userId))} personality preferences`, {
      maxResults: 5
    });
  }

  learnPreference(userId, preferenceType, value, reason = '') {
    const content = `User ${escapeHtml(String(userId))} prefers ${escapeHtml(String(preferenceType))}: ${escapeHtml(String(value))}. Reason: ${escapeHtml(String(reason))}`;
    return this.addMemory('preferences', content, {
      userId,
      preferenceType,
      value
    });
  }

  getUserFacts(userId) {
    return this.search('facts', `facts about user ${escapeHtml(String(userId))}`, {
      maxResults: 20
    });
  }

  addFact(userId, fact, confidence = 1.0) {
    const safeFact = this._normalizeText(fact).substring(0, MAX_INPUT_LENGTH);
    return this.addMemory('facts', `Known fact about ${escapeHtml(String(userId))}: ${safeFact}`, {
      userId,
      confidence
    });
  }

  recordEvent(userId, eventType, description, metadata = {}) {
    const safeDesc = this._normalizeText(description).substring(0, MAX_INPUT_LENGTH);
    return this.addMemory('events', `Event for ${escapeHtml(String(userId))}: ${eventType} - ${safeDesc}`, {
      userId,
      eventType,
      ...metadata
    });
  }

  consolidateMemory(userId) {
    const conversations = this.getConversationContext(userId);
    const facts = this.getUserFacts(userId);

    const summary = this._generateSummary(conversations, facts);

    if (summary) {
      this.addMemory('personality', summary, {
        userId,
        type: 'consolidated',
        timestamp: Date.now()
      });
    }

    return summary;
  }

  _generateSummary(conversations, facts) {
    if (!conversations && (!facts || facts.length === 0)) return '';

    const parts = [];

    if (conversations) {
      parts.push(`Recent conversations:\n${conversations.slice(-500)}`);
    }
    
    if (facts && facts.length > 0) {
      parts.push(`Known facts:\n${facts.map(f => f.content).join('\n')}`);
    }

    return parts.join('\n\n');
  }

  getStats() {
    const stats = {};

    for (const [name, collection] of this.collections) {
      stats[name] = collection.documents.length;
    }

    return {
      ...stats,
      totalMemories: this.stats.totalMemories,
      searches: this.stats.searches,
      hits: this.stats.hits,
      hitRate: this.stats.searches > 0 
        ? (this.stats.hits / this.stats.searches * 100).toFixed(2) + '%' 
        : '0%'
    };
  }

  clear(type = null) {
    if (type) {
      const collection = this.collections.get(type);
      if (collection) {
        collection.documents = [];
        this.emit('collection:cleared', { type });
      }
    } else {
      for (const [name, collection] of this.collections) {
        collection.documents = [];
      }
      this.emit('all:cleared', {});
    }
  }

  export() {
    const data = {};
    for (const [type, collection] of this.collections) {
      data[type] = collection.documents.map(d => ({
        id: d.id,
        content: d.content,
        metadata: d.metadata
      }));
    }
    return data;
  }

  import(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid import data');
    }

    for (const [type, documents] of Object.entries(data)) {
      if (!this.collections.has(type)) continue;
      
      if (Array.isArray(documents)) {
        for (const doc of documents) {
          if (doc.content && doc.metadata) {
            this.addMemory(type, doc.content, doc.metadata);
          }
        }
      }
    }

    this.emit('imported', { count: this.stats.totalMemories });
  }
}

module.exports = new MemoryService();
