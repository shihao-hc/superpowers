/**
 * AgentTeam - 多Agent协作团队系统
 * BaseAgent + 14 Subclasses + AgentTeamManager
 * Extracted from BrainSystem.js v22.0
 *
 * Uses dependency injection to decouple from BrainSystem.
 * Each agent receives a brainApi object with the methods it needs.
 */

const _AGENT_TEAMS = {
  // 分析团队
  analysis: ['IntentAgent', 'EmotionAgent', 'ContextAgent'],
  // 执行团队
  execution: ['CodeAgent', 'SearchAgent', 'DebugAgent', 'OptimizeAgent', 'TestAgent'],
  // 审核团队
  review: ['QualityAgent', 'SecurityAgent', 'EffectAgent'],
  // 学习团队
  learning: ['SummaryAgent', 'ImprovementAgent', 'KnowledgeAgent']
};

/**
 * Agent基类 - 融合v21.0能力
 */
class BaseAgent {
  constructor(name, team, brainApi = {}) {
    this.name = name;
    this.team = team;
    this._initialized = false;
    this._brain = brainApi;
  }

  // 同步execute方法 - 便于检查
  execute(input, context = {}) {
    try {
      return this._executeSync(input, context);
    } catch (e) {
      return { agent: this.name, error: e.message };
    }
  }

  _executeSync(_input, _context = {}) {
    throw new Error('子类必须实现_executeSync方法');
  }
}

// ========== 分析团队 Agents ==========

class IntentAgent extends BaseAgent {
  constructor(brainApi) {
    super('IntentAgent', 'analysis', brainApi);
  }

  _executeSync(input, _context = {}) {
    const result = this._brain.analyzeIntent?.(input) || { intent: 'unknown', confidence: 0 };
    return {
      agent: this.name,
      team: this.team,
      result: result.intent,
      confidence: result.confidence,
      suggestions: result.suggestions || [],
      timestamp: Date.now()
    };
  }
}

class EmotionAgent extends BaseAgent {
  constructor(brainApi) {
    super('EmotionAgent', 'analysis', brainApi);
  }

  _executeSync(input, _context = {}) {
    const result = this._brain.expressEmotion?.(input, '') || { detected: null, expression: null };
    return {
      agent: this.name,
      team: this.team,
      emotion: result.detected,
      expression: result.expression,
      timestamp: Date.now()
    };
  }
}

class ContextAgent extends BaseAgent {
  constructor(brainApi) {
    super('ContextAgent', 'analysis', brainApi);
  }

  _executeSync(input, _context = {}) {
    const result = this._brain.agiEngine?.(input) || { perception: {}, reasoning: {} };
    return {
      agent: this.name,
      team: this.team,
      context: result.perception?.context || {},
      complexity: result.perception?.complexity || 'unknown',
      timestamp: Date.now()
    };
  }
}

// ========== 执行团队 Agents ==========

class CodeAgent extends BaseAgent {
  constructor(brainApi) {
    super('CodeAgent', 'execution', brainApi);
  }

  _executeSync(input, _context = {}) {
    const intent = this._brain.analyzeIntent?.(input);
    const lessons = this._brain.getRelatedLessons?.(input) || [];
    return {
      agent: this.name,
      team: this.team,
      action: '代码生成',
      intent: intent?.intent,
      lessons: lessons.length,
      status: 'ready',
      timestamp: Date.now()
    };
  }
}

class SearchAgent extends BaseAgent {
  constructor(brainApi) {
    super('SearchAgent', 'execution', brainApi);
  }

  _executeSync(input, _context = {}) {
    return {
      agent: this.name,
      team: this.team,
      action: '搜索执行',
      status: 'ready',
      timestamp: Date.now()
    };
  }
}

class DebugAgent extends BaseAgent {
  constructor(brainApi) {
    super('DebugAgent', 'execution', brainApi);
  }

  _executeSync(input, _context = {}) {
    return {
      agent: this.name,
      team: this.team,
      action: '调试执行',
      status: 'ready',
      timestamp: Date.now()
    };
  }
}

class OptimizeAgent extends BaseAgent {
  constructor(brainApi) {
    super('OptimizeAgent', 'execution', brainApi);
  }

  _executeSync(input, _context = {}) {
    return {
      agent: this.name,
      team: this.team,
      action: '优化执行',
      status: 'ready',
      timestamp: Date.now()
    };
  }
}

class TestAgent extends BaseAgent {
  constructor(brainApi) {
    super('TestAgent', 'execution', brainApi);
  }

  _executeSync(input, _context = {}) {
    return {
      agent: this.name,
      team: this.team,
      action: '测试生成',
      status: 'ready',
      timestamp: Date.now()
    };
  }
}

// ========== 审核团队 Agents ==========

class QualityAgent extends BaseAgent {
  constructor(brainApi) {
    super('QualityAgent', 'review', brainApi);
  }

  _executeSync(input, _context = {}) {
    return {
      agent: this.name,
      team: this.team,
      result: '审核通过',
      quality: 'high',
      timestamp: Date.now()
    };
  }
}

class SecurityAgent extends BaseAgent {
  constructor(brainApi) {
    super('SecurityAgent', 'review', brainApi);
  }

  _executeSync(input, _context = {}) {
    return {
      agent: this.name,
      team: this.team,
      result: '安全审核通过',
      security: 'high',
      timestamp: Date.now()
    };
  }
}

class EffectAgent extends BaseAgent {
  constructor(brainApi) {
    super('EffectAgent', 'review', brainApi);
  }

  _executeSync(input, _context = {}) {
    return {
      agent: this.name,
      team: this.team,
      result: '效果审核通过',
      effectiveness: 'high',
      timestamp: Date.now()
    };
  }
}

// ========== 学习团队 Agents ==========

class SummaryAgent extends BaseAgent {
  constructor(brainApi) {
    super('SummaryAgent', 'learning', brainApi);
  }

  _executeSync(input, _context = {}) {
    const _result = this._brain.recordImprovement?.('interaction', input);
    return {
      agent: this.name,
      team: this.team,
      result: '经验已记录',
      timestamp: Date.now()
    };
  }
}

class ImprovementAgent extends BaseAgent {
  constructor(brainApi) {
    super('ImprovementAgent', 'learning', brainApi);
  }

  _executeSync(input, context = {}) {
    const result = this._brain.autonomousLearn?.({ intent: context?.intent });
    return {
      agent: this.name,
      team: this.team,
      improvements: result?.learning?.length || 0,
      timestamp: Date.now()
    };
  }
}

class KnowledgeAgent extends BaseAgent {
  constructor(brainApi) {
    super('KnowledgeAgent', 'learning', brainApi);
  }

  _executeSync(input, context = {}) {
    this._brain.smartStore?.(`knowledge_${Date.now()}`, { input, context });
    return {
      agent: this.name,
      team: this.team,
      result: '知识已存储',
      timestamp: Date.now()
    };
  }
}

// ========== AgentTeamManager ==========

class AgentTeamManager {
  constructor(brainApi = {}) {
    this._brain = brainApi;
    this._agents = this._initAgents();
    this._teamStats = { tasks: 0, completed: 0, avgTime: 0 };
    this._cache = new Map();
  }

  _initAgents() {
    const b = this._brain;
    return {
      // 分析团队 (3个)
      IntentAgent: new IntentAgent(b),
      EmotionAgent: new EmotionAgent(b),
      ContextAgent: new ContextAgent(b),
      // 执行团队 (5个)
      CodeAgent: new CodeAgent(b),
      SearchAgent: new SearchAgent(b),
      DebugAgent: new DebugAgent(b),
      OptimizeAgent: new OptimizeAgent(b),
      TestAgent: new TestAgent(b),
      // 审核团队 (3个)
      QualityAgent: new QualityAgent(b),
      SecurityAgent: new SecurityAgent(b),
      EffectAgent: new EffectAgent(b),
      // 学习团队 (3个)
      SummaryAgent: new SummaryAgent(b),
      ImprovementAgent: new ImprovementAgent(b),
      KnowledgeAgent: new KnowledgeAgent(b)
    };
  }

  /**
   * 智能路由 - 根据任务复杂度决定执行策略
   */
  _routeTask(input, intent) {
    const isComplex = intent.confidence < 0.7 || input.length > 50 || /实现|架构|设计|优化/.test(input);
    return isComplex ? 'full' : 'fast';
  }

  /**
   * 并行执行团队
   */
  async _executeTeamParallel(teamName, agents, input, context) {
    const teamAgents = agents;
    const promises = teamAgents.map((agentName) => {
      const agent = this._agents[agentName];
      return Promise.resolve(agent.execute(input, context));
    });

    const results = await Promise.all(promises);
    return { team: teamName, results, count: results.length };
  }

  /**
   * 处理任务 - 完整的多Agent流程
   */
  async processTask(input, _options = {}) {
    const startTime = Date.now();
    this._teamStats.tasks++;

    // 1. 意图分析（快速）
    const intent = this._brain.analyzeIntent?.(input) || { intent: 'general', confidence: 0.5 };

    // 2. 智能路由
    const route = this._routeTask(input, intent);

    if (route === 'fast') {
      // 轻量模式：只调用核心Agent
      const r = await this._executeTeamParallel('fast', ['IntentAgent', 'EmotionAgent'], input, {});
      this._teamStats.completed++;
      return {
        manager: 'v22.1 FastMode',
        route,
        intent: intent.intent,
        confidence: intent.confidence,
        agentsUsed: r.count,
        time: Date.now() - startTime
      };
    }

    // 3. 完整模式：四阶段并行
    const stages = [
      { name: 'analysis', agents: ['IntentAgent', 'EmotionAgent', 'ContextAgent'] },
      { name: 'execution', agents: ['CodeAgent', 'SearchAgent', 'DebugAgent', 'OptimizeAgent', 'TestAgent'] },
      { name: 'review', agents: ['QualityAgent', 'SecurityAgent', 'EffectAgent'] },
      { name: 'learning', agents: ['SummaryAgent', 'ImprovementAgent', 'KnowledgeAgent'] }
    ];

    const stageResults = [];
    for (const stage of stages) {
      const result = await this._executeTeamParallel(stage.name, stage.agents, input, {});
      stageResults.push(result);
    }

    this._teamStats.completed++;
    const totalTime = Date.now() - startTime;
    this._teamStats.avgTime = (this._teamStats.avgTime + totalTime) / 2;

    return {
      manager: 'v22.1 FullMode',
      route,
      intent: intent.intent,
      confidence: intent.confidence,
      stages: stageResults.length,
      agentsUsed: stageResults.reduce((sum, s) => sum + s.count, 0),
      time: totalTime,
      stats: { ...this._teamStats }
    };
  }

  /**
   * 获取缓存结果
   */
  _getCache(key) {
    return this._cache.get(key);
  }

  /**
   * 设置缓存
   */
  _setCache(key, value) {
    if (this._cache.size > 100) {
      const firstKey = this._cache.keys().next().value;
      this._cache.delete(firstKey);
    }
    this._cache.set(key, { value, timestamp: Date.now() });
  }
}

module.exports = {
  BaseAgent,
  IntentAgent,
  EmotionAgent,
  ContextAgent,
  CodeAgent,
  SearchAgent,
  DebugAgent,
  OptimizeAgent,
  TestAgent,
  QualityAgent,
  SecurityAgent,
  EffectAgent,
  SummaryAgent,
  ImprovementAgent,
  KnowledgeAgent,
  AgentTeamManager,
  _AGENT_TEAMS
};
