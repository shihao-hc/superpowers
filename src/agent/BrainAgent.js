/**
 * BrainAgent - AI大脑与Agent系统的桥梁
 *
 * 将 BrainSystem 的五大核心能力封装成 Agent 可用的接口
 *
 * @version 1.0.0
 * @license MIT
 * @copyright 2026 AI Brain System
 *
 * @example
 * const BrainAgent = require('./BrainAgent');
 * const brain = new BrainAgent({ verbose: true });
 * const result = brain.thinkComplete('你的问题');
 */
const SelfLearningSystem = require('../core/SelfLearningSystem');

class BrainAgent {
  /**
   * @param {Object} options - 配置选项
   * @param {boolean} [options.enabled=true] - 是否启用大脑
   * @param {boolean} [options.verbose=false] - 是否输出详细日志
   * @param {boolean} [options.enableMetaCognition=true] - 启用元认知
   * @param {boolean} [options.enableThinking=true] - 启用独立思维
   * @param {boolean} [options.enableReverseThinking=true] - 启用逆向思维
   * @param {boolean} [options.enableEvolution=true] - 启用自我进化
   * @param {boolean} [options.enableTools=true] - 启用工具管理
   * @param {number} [options.maxReflectionDepth=3] - 最大反思深度
   */
  constructor(options = {}) {
    const env = {
      enabled: process.env.BRAIN_ENABLED,
      verbose: process.env.BRAIN_VERBOSE,
      maxDepth: process.env.BRAIN_MAX_REFLECTION_DEPTH
    };

    this.brain = new SelfLearningSystem({
      enabled: options.enabled !== false
    });
    this.config = {
      enableMetaCognition: options.enableMetaCognition !== false,
      enableThinking: options.enableThinking !== false,
      enableReverseThinking: options.enableReverseThinking !== false,
      enableEvolution: options.enableEvolution !== false,
      enableTools: options.enableTools !== false,
      maxReflectionDepth: env.maxDepth ? parseInt(env.maxDepth) : (options.maxReflectionDepth || 3),
      verbose: env.verbose === 'true' || options.verbose || false
    };
    this._history = [];
  }

  /**
   * 决策前 - 激活元认知和多角度思考
   * @param {string} context - 决策上下文/问题描述
   * @returns {Object} 包含元认知问题和自我检查结果
   * @returns {boolean} returns.skip - 是否跳过
   * @returns {Array} returns.questions - 元认知问题列表
   */
  beforeDecision(context) {
    if (!this.config.enableMetaCognition) {
      return { skip: true, reason: 'MetaCognition disabled' };
    }

    const result = this.brain.beforeDecision(context);
    this._log('beforeDecision', context, result);
    return result;
  }

  /**
   * 决策后 - 激活复盘和自我进化
   * @param {string} context - 决策上下文
   * @param {Object} outcome - 决策结果
   * @param {string} action - 执行的动作
   * @returns {Object} 包含反思和改进建议
   * @returns {boolean} returns.skip - 是否跳过
   * @returns {Array} returns.improvements - 改进建议
   */
  afterDecision(context, outcome, action) {
    if (!this.config.enableEvolution) {
      return { skip: true, reason: 'Evolution disabled' };
    }

    const result = this.brain.afterDecision(context, outcome, action);
    this._log('afterDecision', context, result);
    return result;
  }

  /**
   * 分析问题 - 多角度思考
   * @param {string} problem - 问题描述
   * @returns {Object} 多角度分析结果
   * @returns {string} returns.technical - 技术视角
   * @returns {string} returns.business - 业务视角
   * @returns {string} returns.risk - 风险视角
   * @returns {string} returns.user - 用户视角
   */
  analyze(problem) {
    if (!this.config.enableThinking) {
      return { skip: true, reason: 'Thinking disabled' };
    }

    const perspectives = this.brain.brain.thinking.multiAngle(problem);
    this._log('analyze', problem, perspectives);
    return perspectives;
  }

  /**
   * 质疑假设 - 独立思维
   * @param {string} assumption - 需要质疑的假设
   * @returns {Object} 质疑问题和替代方案
   * @returns {Array} returns.questions - 质疑问题列表
   * @returns {Array} returns.alternatives - 替代方案
   */
  question(assumption) {
    if (!this.config.enableThinking) {
      return { skip: true, reason: 'Thinking disabled' };
    }

    const result = this.brain.brain.thinking.question(assumption);
    this._log('question', assumption, result);
    return result;
  }

  /**
   * 逆向思考 - 从结果反推
   */
  reverseThink(goal) {
    if (!this.config.enableReverseThinking) {
      return { skip: true, reason: 'ReverseThinking disabled' };
    }

    const result = this.brain.brain.reverseThinking.analyze({ description: goal });
    this._log('reverseThink', goal, result);
    return result;
  }

  /**
   * 橘子练习 - 逆向思维训练
   */
  orangePractice(statement) {
    if (!this.config.enableReverseThinking) {
      return { skip: true, reason: 'ReverseThinking disabled' };
    }

    return this.brain.brain.reverseThinking.orangePractice(statement);
  }

  /**
   * 因果链分析
   */
  causalChain(event) {
    if (!this.config.enableThinking) {
      return { skip: true, reason: 'Thinking disabled' };
    }

    return this.brain.brain.thinking.causalChain(event);
  }

  /**
   * 第一性原理分析
   */
  firstPrinciples(subject) {
    if (!this.config.enableThinking) {
      return { skip: true, reason: 'Thinking disabled' };
    }

    return this.brain.brain.thinking.firstPrinciples(subject);
  }

  /**
   * 关联思考
   */
  associate(concept) {
    if (!this.config.enableThinking) {
      return { skip: true, reason: 'Thinking disabled' };
    }

    return this.brain.brain.thinking.associate(concept);
  }

  /**
   * 推荐工具
   */
  suggestTools(task) {
    if (!this.config.enableTools) {
      return { skip: true, reason: 'Tools disabled' };
    }

    return this.brain.brain.tools.suggestTools(task);
  }

  /**
   * 获取教训建议
   */
  getLessonSuggestions(context) {
    return this.brain.brain.getLessonSuggestions(context);
  }

  /**
   * 添加教训
   */
  addLesson(lesson) {
    return this.brain.brain.addLesson(lesson);
  }

  /**
   * 获取大脑状态
   */
  getStatus() {
    return this.brain.getBrainStatus();
  }

  /**
   * 获取进化统计
   */
  getEvolutionStats() {
    return this.brain.brain.evolution.getStats();
  }

  /**
   * 获取教训统计
   */
  getLessonStats() {
    return this.brain.brain.getLessonStats();
  }

  /**
   * 完整思考流程 - 组合多个大脑能力
   */
  thinkComplete(problem, options = {}) {
    const results = {
      metaQuestions: null,
      perspectives: null,
      questions: null,
      reverseAnalysis: null,
      tools: null,
      lessons: null
    };

    // 1. 元认知自问
    if (options.metaQuestions !== false) {
      results.metaQuestions = this.beforeDecision(problem);
    }

    // 2. 多角度分析
    if (options.perspectives !== false) {
      results.perspectives = this.analyze(problem);
    }

    // 3. 质疑假设
    if (options.questioning !== false) {
      results.questions = this.question(problem);
    }

    // 4. 逆向思考
    if (options.reverse !== false) {
      results.reverseAnalysis = this.reverseThink(problem);
    }

    // 5. 工具推荐
    if (options.tools !== false) {
      results.tools = this.suggestTools(problem);
    }

    // 6. 教训参考
    if (options.lessons !== false) {
      results.lessons = this.getLessonSuggestions(problem);
    }

    return results;
  }

  /**
   * 学习闭环 - 从结果中学习
   */
  learnFromResult(problem, action, result, success) {
    // 记录决策
    this.afterDecision(problem, { success, result }, action);

    // 如果失败，添加教训
    if (!success) {
      this.addLesson({
        type: 'failure',
        problem,
        action,
        lesson: `执行 "${action}" 失败: ${result}`,
        improvement: '待分析'
      });
    }
  }

  /**
   * 内部日志
   */
  _log(type, input, output) {
    if (this.config.verbose) {
      console.log(`[BrainAgent:${type}]`, {
        input: typeof input === 'string' ? `${input.substring(0, 50)}...` : input,
        output: typeof output === 'object' ? '...' : output
      });
    }

    this._history.push({
      type,
      input,
      timestamp: Date.now()
    });
  }

  /**
   * 获取历史
   */
  getHistory() {
    return this._history;
  }

  /**
   * 导出完整报告
   */
  exportReport() {
    return {
      status: this.getStatus(),
      evolution: this.getEvolutionStats(),
      lessons: this.getLessonStats(),
      history: this._history
    };
  }
}

module.exports = BrainAgent;
