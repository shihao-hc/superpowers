/**
 * Memory System Index
 * 统一内存系统接口
 *
 * 包含:
 * - SessionMemory: 会话记忆（Fork Agent 自动提取）
 * - LongTermMemory: 长期记忆
 * - SemanticMemory: 语义记忆
 * - GraphMemory: 知识图谱
 * - UnifiedMemory: 统一内存
 */

const { LongTermMemory } = require('./LongTermMemory');
const { SemanticMemory } = require('./SemanticMemory');
const { GraphMemory } = require('./GraphMemory');
const { SessionMemory, MemorySections } = require('./SessionMemory');

class UnifiedMemory {
  constructor(options = {}) {
    this.longTerm = new LongTermMemory(options.longTerm);
    this.semantic = new SemanticMemory(options.semantic);
    this.graph = new GraphMemory(options.graph);
    this.session = new SessionMemory(options.session);

    this.initialized = false;
  }

  async initialize() {
    await this.semantic.initialize();
    await this.session.load();
    this.initialized = true;
  }

  async store(text, options = {}) {
    const id = await this.longTerm.store(text, options);
    await this.semantic.add(text, { memoryId: id, ...options });

    if (options.entityId) {
      this.graph.createNode(
        options.entityId,
        'entity',
        { name: text.substring(0, 100) },
        options.tags || []
      );
    }

    return id;
  }

  async retrieve(query, options = {}) {
    const semanticResults = await this.semantic.search(query, options);
    const longTermResults = await this.longTerm.retrieve(query, options);
    const sessionContext = this.session.getPromptContext();

    return {
      semantic: semanticResults,
      longTerm: longTermResults,
      session: sessionContext,
      unified: this.mergeResults(semanticResults, longTermResults)
    };
  }

  mergeResults(semantic, longTerm) {
    const merged = new Map();

    for (const item of semantic) {
      merged.set(item.id, { ...item, source: 'semantic' });
    }

    for (const item of longTerm) {
      if (merged.has(item.id)) {
        const existing = merged.get(item.id);
        merged.set(item.id, { ...existing, longTermSimilarity: item.similarity });
      } else {
        merged.set(item.id, { ...item, source: 'longTerm' });
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, 10);
  }

  /**
   * 记录会话活动
   */
  recordActivity(role, content, tokens = 0) {
    this.session.recordMessage(role, content, tokens);
  }

  /**
   * 记录工具调用
   */
  recordToolCall(toolName, args) {
    this.session.recordToolCall(toolName, args);
  }

  /**
   * 检查并触发记忆提取
   */
  async extractIfNeeded(session) {
    return this.session.extract(session);
  }

  /**
   * 获取会话记忆统计
   */
  getSessionStats() {
    return this.session.getStats();
  }

  getGraph() {
    return this.graph;
  }

  getSession() {
    return this.session;
  }
}

module.exports = {
  LongTermMemory,
  SemanticMemory,
  GraphMemory,
  SessionMemory,
  MemorySections,
  UnifiedMemory
};
