/**
 * LongTermMemorySystem - 长期记忆系统
 * 
 * 功能:
 * - 对话历史存储和检索
 * - 用户偏好学习
 * - 重要事件记录
 * - 记忆关联和回忆
 * - 记忆衰减和强化
 */

class MemoryStorage {
  constructor(options = {}) {
    this.dbName = options.dbName || 'ultrawork_memory';
    this.dbVersion = options.dbVersion || 1;
    this.db = null;
    this.stores = {
      conversations: 'conversations',
      preferences: 'preferences',
      events: 'events',
      facts: 'facts',
      associations: 'associations'
    };
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(true);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Conversations store
        if (!db.objectStoreNames.contains(this.stores.conversations)) {
          const convStore = db.createObjectStore(this.stores.conversations, { keyPath: 'id', autoIncrement: true });
          convStore.createIndex('timestamp', 'timestamp', { unique: false });
          convStore.createIndex('userId', 'userId', { unique: false });
          convStore.createIndex('type', 'type', { unique: false });
        }

        // Preferences store
        if (!db.objectStoreNames.contains(this.stores.preferences)) {
          const prefStore = db.createObjectStore(this.stores.preferences, { keyPath: 'key' });
          prefStore.createIndex('category', 'category', { unique: false });
        }

        // Events store
        if (!db.objectStoreNames.contains(this.stores.events)) {
          const eventStore = db.createObjectStore(this.stores.events, { keyPath: 'id', autoIncrement: true });
          eventStore.createIndex('timestamp', 'timestamp', { unique: false });
          eventStore.createIndex('type', 'type', { unique: false });
          eventStore.createIndex('importance', 'importance', { unique: false });
        }

        // Facts store
        if (!db.objectStoreNames.contains(this.stores.facts)) {
          const factStore = db.createObjectStore(this.stores.facts, { keyPath: 'id', autoIncrement: true });
          factStore.createIndex('subject', 'subject', { unique: false });
          factStore.createIndex('confidence', 'confidence', { unique: false });
        }

        // Associations store
        if (!db.objectStoreNames.contains(this.stores.associations)) {
          const assocStore = db.createObjectStore(this.stores.associations, { keyPath: 'id', autoIncrement: true });
          assocStore.createIndex('from', 'from', { unique: false });
          assocStore.createIndex('to', 'to', { unique: false });
        }
      };
    });
  }

  async add(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.add({ ...data, timestamp: Date.now() });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put({ ...data, updatedAt: Date.now() });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async query(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async count(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

class ConversationMemory {
  constructor(storage) {
    this.storage = storage;
    this.maxHistory = 1000;
    this.summarizeThreshold = 50;
  }

  async addMessage(message) {
    const entry = {
      content: message.content,
      role: message.role, // 'user' or 'assistant'
      emotion: message.emotion || 'neutral',
      personality: message.personality || 'default',
      userId: message.userId || 'default',
      sessionId: message.sessionId || this.getSessionId(),
      metadata: message.metadata || {}
    };

    await this.storage.add(this.storage.stores.conversations, entry);

    // Check if we need to summarize
    const count = await this.storage.count(this.storage.stores.conversations);
    if (count > this.summarizeThreshold) {
      await this.summarizeOldConversations();
    }
  }

  async getRecentMessages(count = 20, userId = 'default') {
    const allMessages = await this.storage.query(
      this.storage.stores.conversations,
      'userId',
      userId
    );
    
    return allMessages
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count)
      .reverse();
  }

  async searchMessages(keyword, limit = 10) {
    const allMessages = await this.storage.getAll(this.storage.stores.conversations);
    const keywordLower = keyword.toLowerCase();
    
    return allMessages
      .filter(msg => msg.content.toLowerCase().includes(keywordLower))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  async summarizeOldConversations() {
    const allMessages = await this.storage.getAll(this.storage.stores.conversations);
    
    if (allMessages.length <= this.maxHistory) return;

    const toSummarize = allMessages
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, allMessages.length - this.maxHistory);

    // Create summary entry
    const summary = {
      type: 'summary',
      content: `Summary of ${toSummarize.length} conversations`,
      messageCount: toSummarize.length,
      dateRange: {
        start: toSummarize[0].timestamp,
        end: toSummarize[toSummarize.length - 1].timestamp
      }
    };

    await this.storage.add(this.storage.stores.events, summary);

    // Delete old messages
    for (const msg of toSummarize) {
      await this.storage.delete(this.storage.stores.conversations, msg.id);
    }
  }

  getSessionId() {
    const date = new Date();
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  async getConversationStats(userId = 'default') {
    const messages = await this.storage.query(
      this.storage.stores.conversations,
      'userId',
      userId
    );

    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    return {
      total: messages.length,
      userMessages: userMessages.length,
      assistantMessages: assistantMessages.length,
      firstMessage: messages[0]?.timestamp,
      lastMessage: messages[messages.length - 1]?.timestamp
    };
  }
}

class PreferenceMemory {
  constructor(storage) {
    this.storage = storage;
  }

  async setPreference(key, value, category = 'general') {
    await this.storage.put(this.storage.stores.preferences, {
      key,
      value,
      category,
      confidence: 1.0,
      learnedAt: Date.now()
    });
  }

  async getPreference(key, defaultValue = null) {
    const result = await this.storage.get(this.storage.stores.preferences, key);
    return result?.value ?? defaultValue;
  }

  async getPreferencesByCategory(category) {
    return await this.storage.query(
      this.storage.stores.preferences,
      'category',
      category
    );
  }

  async getAllPreferences() {
    return await this.storage.getAll(this.storage.stores.preferences);
  }

  async learnPreference(key, value, context = {}) {
    const existing = await this.storage.get(this.storage.stores.preferences, key);
    
    if (existing) {
      // Update confidence based on consistency
      const isConsistent = existing.value === value;
      existing.confidence = isConsistent 
        ? Math.min(1, existing.confidence + 0.1)
        : Math.max(0.1, existing.confidence - 0.2);
      existing.value = isConsistent ? existing.value : value;
      existing.lastConfirmed = Date.now();
      existing.context = { ...existing.context, ...context };
      
      await this.storage.put(this.storage.stores.preferences, existing);
    } else {
      await this.setPreference(key, value, context.category);
    }
  }

  async inferPreferencesFromConversation(messages) {
    const preferences = {};
    
    for (const msg of messages) {
      if (msg.role !== 'user') continue;
      
      // Detect game preferences
      const gameKeywords = ['minecraft', 'pokemon', 'genshin', '我的世界', '原神'];
      for (const game of gameKeywords) {
        if (msg.content.toLowerCase().includes(game)) {
          preferences['favorite_game'] = game;
        }
      }
      
      // Detect personality preference
      const personalityKeywords = {
        'cute': ['可爱', '萌', '可爱'],
        'professional': ['专业', '正式', '认真'],
        'funny': ['搞笑', '好玩', '哈哈']
      };
      
      for (const [pref, keywords] of Object.entries(personalityKeywords)) {
        if (keywords.some(kw => msg.content.includes(kw))) {
          preferences[`preferred_${pref}`] = true;
        }
      }
    }
    
    // Learn all detected preferences
    for (const [key, value] of Object.entries(preferences)) {
      await this.learnPreference(key, value, { source: 'conversation_analysis' });
    }
    
    return preferences;
  }
}

class EventMemory {
  constructor(storage) {
    this.storage = storage;
  }

  async recordEvent(event) {
    const entry = {
      type: event.type, // 'milestone', 'achievement', 'incident', 'social'
      title: event.title,
      description: event.description,
      importance: event.importance || 1, // 1-10
      tags: event.tags || [],
      relatedEntities: event.relatedEntities || [],
      metadata: event.metadata || {}
    };

    return await this.storage.add(this.storage.stores.events, entry);
  }

  async getImportantEvents(minImportance = 7, limit = 20) {
    const events = await this.storage.getAll(this.storage.stores.events);
    
    return events
      .filter(e => e.importance >= minImportance)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  async getEventsByType(type, limit = 20) {
    const events = await this.storage.query(
      this.storage.stores.events,
      'type',
      type
    );
    
    return events
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  async getRecentEvents(days = 7, limit = 50) {
    const events = await this.storage.getAll(this.storage.stores.events);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    
    return events
      .filter(e => e.timestamp >= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  async searchEvents(keyword, limit = 10) {
    const events = await this.storage.getAll(this.storage.stores.events);
    const keywordLower = keyword.toLowerCase();
    
    return events
      .filter(e => 
        e.title?.toLowerCase().includes(keywordLower) ||
        e.description?.toLowerCase().includes(keywordLower) ||
        e.tags?.some(t => t.toLowerCase().includes(keywordLower))
      )
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
}

class FactMemory {
  constructor(storage) {
    this.storage = storage;
  }

  async addFact(fact) {
    const entry = {
      subject: fact.subject,      // What the fact is about
      predicate: fact.predicate,   // Relationship
      object: fact.object,        // Value
      source: fact.source || 'conversation',
      confidence: fact.confidence || 0.8,
      firstLearned: Date.now(),
      lastConfirmed: Date.now()
    };

    return await this.storage.add(this.storage.stores.facts, entry);
  }

  async getFactsAbout(subject) {
    return await this.storage.query(
      this.storage.stores.facts,
      'subject',
      subject
    );
  }

  async updateFactConfidence(factId, delta) {
    const fact = await this.storage.get(this.storage.stores.facts, factId);
    if (fact) {
      fact.confidence = Math.max(0, Math.min(1, fact.confidence + delta));
      fact.lastConfirmed = Date.now();
      await this.storage.put(this.storage.stores.facts, fact);
    }
  }

  async getHighConfidenceFacts(threshold = 0.7) {
    const facts = await this.storage.getAll(this.storage.stores.facts);
    return facts.filter(f => f.confidence >= threshold);
  }
}

class AssociationMemory {
  constructor(storage) {
    this.storage = storage;
  }

  async createAssociation(from, to, relationship, strength = 0.5) {
    const entry = {
      from,
      to,
      relationship,
      strength,
      createdAt: Date.now(),
      activations: 0
    };

    return await this.storage.add(this.storage.stores.associations, entry);
  }

  async getAssociationsFrom(entity) {
    return await this.storage.query(
      this.storage.stores.associations,
      'from',
      entity
    );
  }

  async getAssociationsTo(entity) {
    return await this.storage.query(
      this.storage.stores.associations,
      'to',
      entity
    );
  }

  async strengthenAssociation(associationId, amount = 0.1) {
    const assoc = await this.storage.get(this.storage.stores.associations, associationId);
    if (assoc) {
      assoc.strength = Math.min(1, assoc.strength + amount);
      assoc.activations++;
      assoc.lastActivated = Date.now();
      await this.storage.put(this.storage.stores.associations, assoc);
    }
  }

  async getRelatedEntities(entity, limit = 10) {
    const fromAssocs = await this.getAssociationsFrom(entity);
    const toAssocs = await this.getAssociationsTo(entity);
    
    const allAssocs = [...fromAssocs, ...toAssocs];
    const uniqueEntities = new Map();
    
    for (const assoc of allAssocs) {
      const related = assoc.from === entity ? assoc.to : assoc.from;
      if (!uniqueEntities.has(related)) {
        uniqueEntities.set(related, {
          entity: related,
          strength: assoc.strength,
          relationship: assoc.relationship
        });
      } else {
        const existing = uniqueEntities.get(related);
        existing.strength = Math.max(existing.strength, assoc.strength);
      }
    }
    
    return Array.from(uniqueEntities.values())
      .sort((a, b) => b.strength - a.strength)
      .slice(0, limit);
  }
}

class LongTermMemorySystem {
  constructor(options = {}) {
    this.storage = new MemoryStorage(options);
    this.conversation = null;
    this.preferences = null;
    this.events = null;
    this.facts = null;
    this.associations = null;
    this.isInitialized = false;
  }

  async init() {
    try {
      await this.storage.init();
      
      this.conversation = new ConversationMemory(this.storage);
      this.preferences = new PreferenceMemory(this.storage);
      this.events = new EventMemory(this.storage);
      this.facts = new FactMemory(this.storage);
      this.associations = new AssociationMemory(this.storage);
      
      this.isInitialized = true;
      console.log('Long-term memory system initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize memory system:', error);
      return false;
    }
  }

  async rememberConversation(role, content, metadata = {}) {
    if (!this.isInitialized) return;
    
    await this.conversation.addMessage({
      role,
      content,
      ...metadata
    });
  }

  async recallRecent(count = 10) {
    if (!this.isInitialized) return [];
    return await this.conversation.getRecentMessages(count);
  }

  async searchMemory(keyword) {
    if (!this.isInitialized) return [];
    
    const messages = await this.conversation.searchMessages(keyword);
    const events = await this.events.searchEvents(keyword);
    
    return { messages, events };
  }

  async learnPreference(key, value) {
    if (!this.isInitialized) return;
    await this.preferences.learnPreference(key, value);
  }

  async getPreference(key, defaultValue = null) {
    if (!this.isInitialized) return defaultValue;
    return await this.preferences.getPreference(key, defaultValue);
  }

  async recordEvent(event) {
    if (!this.isInitialized) return;
    return await this.events.recordEvent(event);
  }

  async getRecentEvents(days = 7) {
    if (!this.isInitialized) return [];
    return await this.events.getRecentEvents(days);
  }

  async addFact(subject, predicate, object) {
    if (!this.isInitialized) return;
    return await this.facts.addFact({ subject, predicate, object });
  }

  async getFactsAbout(subject) {
    if (!this.isInitialized) return [];
    return await this.facts.getFactsAbout(subject);
  }

  async createAssociation(from, to, relationship) {
    if (!this.isInitialized) return;
    return await this.associations.createAssociation(from, to, relationship);
  }

  async getRelated(entity) {
    if (!this.isInitialized) return [];
    return await this.associations.getRelatedEntities(entity);
  }

  async getStats() {
    if (!this.isInitialized) return {};
    
    return {
      conversations: await this.storage.count(this.storage.stores.conversations),
      preferences: await this.storage.count(this.storage.stores.preferences),
      events: await this.storage.count(this.storage.stores.events),
      facts: await this.storage.count(this.storage.stores.facts),
      associations: await this.storage.count(this.storage.stores.associations)
    };
  }

  async clearAll() {
    await this.storage.clear(this.storage.stores.conversations);
    await this.storage.clear(this.storage.stores.preferences);
    await this.storage.clear(this.storage.stores.events);
    await this.storage.clear(this.storage.stores.facts);
    await this.storage.clear(this.storage.stores.associations);
  }

  async exportData() {
    return {
      conversations: await this.storage.getAll(this.storage.stores.conversations),
      preferences: await this.storage.getAll(this.storage.stores.preferences),
      events: await this.storage.getAll(this.storage.stores.events),
      facts: await this.storage.getAll(this.storage.stores.facts),
      associations: await this.storage.getAll(this.storage.stores.associations),
      exportedAt: Date.now()
    };
  }

  async importData(data) {
    // Import each category
    for (const item of data.conversations || []) {
      await this.storage.add(this.storage.stores.conversations, item);
    }
    for (const item of data.preferences || []) {
      await this.storage.put(this.storage.stores.preferences, item);
    }
    for (const item of data.events || []) {
      await this.storage.add(this.storage.stores.events, item);
    }
    for (const item of data.facts || []) {
      await this.storage.add(this.storage.stores.facts, item);
    }
    for (const item of data.associations || []) {
      await this.storage.add(this.storage.stores.associations, item);
    }
  }
}

// Export
if (typeof window !== 'undefined') {
  window.MemoryStorage = MemoryStorage;
  window.ConversationMemory = ConversationMemory;
  window.PreferenceMemory = PreferenceMemory;
  window.EventMemory = EventMemory;
  window.FactMemory = FactMemory;
  window.AssociationMemory = AssociationMemory;
  window.LongTermMemorySystem = LongTermMemorySystem;
}

if (typeof module !== 'undefined') {
  module.exports = {
    MemoryStorage,
    ConversationMemory,
    PreferenceMemory,
    EventMemory,
    FactMemory,
    AssociationMemory,
    LongTermMemorySystem
  };
}
