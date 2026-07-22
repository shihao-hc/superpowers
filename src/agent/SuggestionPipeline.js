/**
 * SuggestionPipeline - 建议管道系统
 * 基于 Claude Code Suggestions 设计模式
 *
 * 核心功能:
 * - Pipeline 管道化处理
 * - 推测执行 (Speculation)
 * - 多阶段过滤和排序
 */

const { EventEmitter } = require('events');

/**
 * 建议类型
 */
const SuggestionType = {
  COMMAND: 'command',
  CODE: 'code',
  EXPLANATION: 'explanation',
  REFACTOR: 'refactor',
  TEST: 'test'
};

/**
 * 建议优先级
 */
const SuggestionPriority = {
  CRITICAL: 100,
  HIGH: 75,
  MEDIUM: 50,
  LOW: 25
};

/**
 * 安全限制
 */
const LIMITS = {
  maxSuggestions: 10,
  maxContextLength: 5000,
  maxBlacklistSize: 100
};

/**
 * Pipeline Stage 接口
 */
class PipelineStage {
  constructor(name) {
    this.name = name;
    this.enabled = true;
  }

  async process(_context) {
    throw new Error('Must be implemented by subclass');
  }
}

/**
 * Generate Stage - 生成建议
 */
class GenerateStage extends PipelineStage {
  constructor(llmAdapter) {
    super('generate');
    this.llmAdapter = llmAdapter;
  }

  async process(context) {
    if (!this.enabled) {return context;}

    const { prompt, maxSuggestions = 5 } = context;

    try {
      const response = await this.llmAdapter.generate(
        `Generate ${maxSuggestions} suggestions for: ${prompt}`,
        { maxTokens: 500, temperature: 0.7 }
      );

      const suggestions = this.parseSuggestions(response);

      return {
        ...context,
        suggestions,
        generatedAt: Date.now()
      };
    } catch (error) {
      console.error('Generate stage failed:', error.message);
      return { ...context, suggestions: [] };
    }
  }

  parseSuggestions(text) {
    const suggestions = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const match = line.match(/^\d+[.)]\s+(.+)$/);
      if (match) {
        suggestions.push({
          text: match[1],
          type: this.inferType(match[1]),
          confidence: 0.8
        });
      }
    }

    return suggestions;
  }

  inferType(text) {
    const lower = text.toLowerCase();
    if (lower.includes('test')) {return SuggestionType.TEST;}
    if (lower.includes('refactor') || lower.includes('improve')) {return SuggestionType.REFACTOR;}
    if (lower.includes('explain') || lower.includes('what')) {return SuggestionType.EXPLANATION;}
    if (lower.match(/^`.*`$/)) {return SuggestionType.CODE;}
    return SuggestionType.COMMAND;
  }
}

/**
 * Filter Stage - 过滤建议
 */
class FilterStage extends PipelineStage {
  constructor(options = {}) {
    super('filter');
    // 安全：限制黑名单大小
    const rawBlacklist = options.blacklist || [];
    this.blacklist = Array.isArray(rawBlacklist) ? rawBlacklist.slice(0, LIMITS.maxBlacklistSize) : [];
    this.minConfidence = options.minConfidence || 0.5;
  }

  async process(context) {
    if (!this.enabled) {return context;}

    const { suggestions, history } = context;

    const filtered = suggestions.filter((s) => {
      // 检查黑名单
      if (this.isBlacklisted(s.text)) {return false;}

      // 检查置信度
      if (s.confidence < this.minConfidence) {return false;}

      // 检查是否重复
      if (this.isDuplicate(s.text, history)) {return false;}

      return true;
    });

    return {
      ...context,
      suggestions: filtered,
      filteredAt: Date.now()
    };
  }

  isBlacklisted(text) {
    const lower = text.toLowerCase();
    return this.blacklist.some((term) => lower.includes(term.toLowerCase()));
  }

  isDuplicate(text, history) {
    if (!history) {return false;}
    const normalized = text.toLowerCase().trim();
    return history.some((h) =>
      h.text && h.text.toLowerCase().trim() === normalized
    );
  }
}

/**
 * Rank Stage - 排序建议
 */
class RankStage extends PipelineStage {
  constructor(options = {}) {
    super('rank');
    this.priorityWeights = {
      recency: options.recencyWeight || 0.3,
      relevance: options.relevanceWeight || 0.4,
      confidence: options.confidenceWeight || 0.3
    };
  }

  async process(context) {
    if (!this.enabled) {return context;}

    const { suggestions, currentContext } = context;

    const ranked = suggestions.map((s) => ({
      ...s,
      score: this.calculateScore(s, currentContext)
    }));

    ranked.sort((a, b) => b.score - a.score);

    return {
      ...context,
      suggestions: ranked,
      rankedAt: Date.now()
    };
  }

  calculateScore(suggestion, context) {
    const recencyScore = suggestion.generatedAt
      ? (Date.now() - suggestion.generatedAt) / 3600000 // 小时
      : 0;

    const relevanceScore = this.calculateRelevance(suggestion, context);
    const confidenceScore = suggestion.confidence || 0;

    return (
      (1 - Math.min(recencyScore, 1)) * this.priorityWeights.recency +
      relevanceScore * this.priorityWeights.relevance +
      confidenceScore * this.priorityWeights.confidence
    );
  }

  calculateRelevance(suggestion, context) {
    if (!context) {return 0.5;}

    const suggestionWords = suggestion.text.toLowerCase().split(/\s+/);
    const contextWords = (`${context.filePath} ${context.description || ''}`)
      .toLowerCase()
      .split(/\s+/);

    const matches = suggestionWords.filter((w) => contextWords.includes(w));
    return matches.length / suggestionWords.length;
  }
}

/**
 * Present Stage - 呈现建议
 */
class PresentStage extends PipelineStage {
  constructor(options = {}) {
    super('present');
    this.maxDisplay = options.maxDisplay || 5;
    this.format = options.format || 'markdown';
  }

  async process(context) {
    if (!this.enabled) {return context;}

    const { suggestions } = context;
    const display = suggestions.slice(0, this.maxDisplay);

    return {
      ...context,
      display,
      presentedAt: Date.now()
    };
  }

  formatMarkdown(suggestions) {
    const lines = ['## Suggestions\n'];

    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      lines.push(`${i + 1}. ${s.text}`);
      if (s.confidence) {
        lines.push(`   Confidence: ${(s.confidence * 100).toFixed(0)}%`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Speculative Executor - 推测执行器
 */
class SpeculativeExecutor {
  constructor(toolExecutor) {
    this.toolExecutor = toolExecutor;
  }

  async speculate(tool, input) {
    // 运行推测 Agent
    const specResult = await this.runSpeculativeAgent(tool, input);

    return {
      speculation: specResult,
      tool,
      input,
      execute: async () => {
        return this.toolExecutor.execute(tool, input);
      }
    };
  }

  async runSpeculativeAgent(_tool, _input) {
    // 简化的推测逻辑
    return {
      predictedOutcome: 'success',
      confidence: 0.9,
      risks: [],
      estimatedTime: 1000
    };
  }
}

/**
 * SuggestionPipeline - 主管道
 */
class SuggestionPipeline extends EventEmitter {
  constructor(options = {}) {
    super();

    this.stages = new Map();
    this.llmAdapter = options.llmAdapter;
    this.toolExecutor = options.toolExecutor;
    this.enabled = options.enabled !== false;

    this.speculator = this.toolExecutor
      ? new SpeculativeExecutor(this.toolExecutor)
      : null;
  }

  /**
   * 添加阶段
   */
  use(name, stage) {
    if (stage instanceof PipelineStage) {
      this.stages.set(name, stage);
    } else if (typeof stage === 'function') {
      this.stages.set(name, {
        name,
        process: stage,
        enabled: true
      });
    }
    return this;
  }

  /**
   * 添加生成阶段
   */
  useGenerate(llmAdapter) {
    return this.use('generate', new GenerateStage(llmAdapter));
  }

  /**
   * 添加过滤阶段
   */
  useFilter(options = {}) {
    return this.use('filter', new FilterStage(options));
  }

  /**
   * 添加排序阶段
   */
  useRank(options = {}) {
    return this.use('rank', new RankStage(options));
  }

  /**
   * 添加呈现阶段
   */
  usePresent(options = {}) {
    return this.use('present', new PresentStage(options));
  }

  /**
   * 执行管道
   */
  async execute(initialContext) {
    if (!this.enabled) {return initialContext;}

    // 安全：限制输入长度
    const safeContext = {
      ...initialContext,
      message: typeof initialContext.message === 'string'
        ? initialContext.message.substring(0, LIMITS.maxContextLength)
        : ''
    };

    let context = { ...safeContext };
    let result;

    // 按顺序执行所有阶段
    for (const [name, stage] of this.stages) {
      if (!stage.enabled) {continue;}

      this.emit('stageStart', { stage: name });

      try {
        result = await stage.process(context);
        context = result;

        this.emit('stageComplete', {
          stage: name,
          suggestions: context.suggestions?.length || 0
        });
      } catch (error) {
        this.emit('stageError', { stage: name, error: error.message });
        context.suggestions = [];
        break;
      }
    }

    // 安全：限制最终建议数量
    if (context.suggestions && context.suggestions.length > LIMITS.maxSuggestions) {
      context.suggestions = context.suggestions.slice(0, LIMITS.maxSuggestions);
    }

    this.emit('complete', context);
    return context;
  }

  /**
   * 执行推测
   */
  async speculate(tool, input) {
    if (!this.speculator) {
      throw new Error('SpeculativeExecutor not configured');
    }
    return this.speculator.speculate(tool, input);
  }

  /**
   * 启用/禁用阶段
   */
  enable(name) {
    const stage = this.stages.get(name);
    if (stage) {stage.enabled = true;}
    return this;
  }

  disable(name) {
    const stage = this.stages.get(name);
    if (stage) {stage.enabled = false;}
    return this;
  }

  /**
   * 清空所有阶段
   */
  clear() {
    this.stages.clear();
    return this;
  }

  /**
   * 获取阶段列表
   */
  getStages() {
    return Array.from(this.stages.entries()).map(([name, stage]) => ({
      name,
      enabled: stage.enabled
    }));
  }

  /**
   * 销毁 Pipeline，清理资源
   */
  destroy() {
    this.stages.clear();
    this.removeAllListeners();
    this.clearCache?.();
    return this;
  }
}

/**
 * 创建默认 Pipeline
 */
function createDefaultPipeline(llmAdapter, toolExecutor) {
  return new SuggestionPipeline({ llmAdapter, toolExecutor })
    .useGenerate(llmAdapter)
    .useFilter({ blacklist: ['rm -rf', 'drop database'] })
    .useRank({ recencyWeight: 0.2, relevanceWeight: 0.5, confidenceWeight: 0.3 })
    .usePresent({ maxDisplay: 5 });
}

module.exports = {
  SuggestionPipeline,
  SuggestionType,
  SuggestionPriority,
  PipelineStage,
  GenerateStage,
  FilterStage,
  RankStage,
  PresentStage,
  SpeculativeExecutor,
  createDefaultPipeline
};
