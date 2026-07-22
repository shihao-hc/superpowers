/**
 * BrainLoop - AgentLoop + AI大脑
 *
 * 将 BrainAgent 的五大核心能力集成到 AgentLoop 的感知-思考-行动循环中
 *
 * @version 1.0.0
 * @license MIT
 * @copyright 2026 AI Brain System
 */
const AgentLoop = require('./AgentLoop');
const BrainAgent = require('./BrainAgent');

const VERSION = '1.0.0';

class BrainLoop extends AgentLoop {
  constructor(options = {}) {
    super(options);

    // Brain 配置
    this.brainConfig = {
      enabled: options.brainEnabled !== false,
      verbose: options.brainVerbose || false,
      autoThink: options.brainAutoThink !== false,
      autoReview: options.brainAutoReview !== false
    };

    // 初始化大脑
    if (this.brainConfig.enabled) {
      this.brain = new BrainAgent({
        enabled: true,
        verbose: this.brainConfig.verbose,
        enableMetaCognition: options.enableMetaCognition !== false,
        enableThinking: options.enableThinking !== false,
        enableReverseThinking: options.enableReverseThinking !== false,
        enableEvolution: options.enableEvolution !== false,
        enableTools: options.enableTools !== false,
        maxReflectionDepth: options.maxReflectionDepth || 3
      });

      console.log('[BrainLoop] AI大脑已初始化');
      console.log('[BrainLoop] 能力:', {
        metaCognition: options.enableMetaCognition !== false,
        thinking: options.enableThinking !== false,
        reverseThinking: options.enableReverseThinking !== false,
        evolution: options.enableEvolution !== false,
        tools: options.enableTools !== false
      });
    }

    // 大脑思考历史
    this._brainHistory = [];
    this.version = VERSION;
    this._isShuttingDown = false;
  }

  /**
   * 优雅关闭
   */
  async shutdown() {
    if (this._isShuttingDown) {return;}
    this._isShuttingDown = true;

    console.log('[BrainLoop] 开始优雅关闭...');

    try {
      // 保存大脑状态
      if (this.brain) {
        const _report = this.brain.exportReport();
        console.log('[BrainLoop] 大脑状态已保存');
      }

      // 清理历史
      this._brainHistory = [];

      // 清理父类资源
      if (this.cleanup) {
        await this.cleanup();
      }

      console.log('[BrainLoop] 优雅关闭完成');
    } catch (error) {
      console.error('[BrainLoop] 关闭时出错:', error.message);
    }
  }

  /**
   * 重写 run 方法 - 在每个循环中添加大脑调用
   */
  async run(goal, context = {}) {
    if (!this.brainConfig.enabled) {
      return super.run(goal, context);
    }

    const brainStartTime = Date.now();

    // ========== 决策前大脑激活 ==========
    const preBrainResult = this._preDecision(goal);

    if (this.brainConfig.verbose) {
      console.log('[BrainLoop] 决策前大脑分析:', {
        questionsCount: preBrainResult?.metaQuestions?.questions?.questions?.length || 0,
        perspectives: Object.keys(preBrainResult?.perspectives || {}).length
      });
    }

    // ========== 执行父类循环 ==========
    const result = await super.run(goal, context);

    // ========== 决策后大脑复盘 ==========
    const postBrainResult = this._postDecision(goal, result);

    // 合并大脑结果
    result.brain = {
      preDecision: preBrainResult,
      postDecision: postBrainResult,
      duration: Date.now() - brainStartTime,
      status: this.brain.getStatus()
    };

    return result;
  }

  /**
   * 决策前 - 元认知 + 独立思维
   */
  _preDecision(goal) {
    if (!this.brain) {return null;}

    try {
      const result = this.brain.thinkComplete(goal, {
        metaQuestions: true,
        perspectives: true,
        questioning: true,
        reverse: true,
        tools: true,
        lessons: true
      });

      this._brainHistory.push({
        type: 'pre',
        goal,
        timestamp: Date.now(),
        metaQuestions: result.metaQuestions,
        perspectives: result.perspectives
      });

      // 将大脑分析注入到 context
      if (this.brainConfig.autoThink && this.llmAdapter) {
        this._injectBrainContext(result);
      }

      return result;
    } catch (error) {
      console.warn('[BrainLoop] Pre-decision brain error:', error.message);
      return null;
    }
  }

  /**
   * 决策后 - 复盘 + 进化
   */
  _postDecision(goal, result) {
    if (!this.brain) {return null;}

    try {
      const success = result.success !== false && !result.error;

      this.brain.learnFromResult(
        goal,
        'AgentLoop.run',
        result.error || result.result,
        success
      );

      const postResult = {
        success,
        improvements: this.brain.getEvolutionStats(),
        lessons: this.brain.getLessonStats()
      };

      this._brainHistory.push({
        type: 'post',
        goal,
        success,
        timestamp: Date.now()
      });

      return postResult;
    } catch (error) {
      console.warn('[BrainLoop] Post-decision brain error:', error.message);
      return null;
    }
  }

  /**
   * 将大脑分析注入到 LLM context
   */
  _injectBrainContext(brainResult) {
    if (!this._llmContext) {
      this._llmContext = '';
    }

    const sections = [];

    // 元认知问题
    if (brainResult.metaQuestions?.questions?.questions) {
      const questions = brainResult.metaQuestions.questions.questions
        .map((q) => `  • ${q.question}`)
        .join('\n');
      sections.push(`【决策前自问】
${questions}`);
    }

    // 多角度分析
    if (brainResult.perspectives) {
      const perspectives = Object.entries(brainResult.perspectives)
        .map(([key, value]) => `  • ${key}: ${String(value).substring(0, 100)}`)
        .join('\n');
      sections.push(`【多角度思考】
${perspectives}`);
    }

    // 质疑
    if (brainResult.questions?.questions) {
      sections.push(`【质疑假设】
  • ${brainResult.questions.questions.slice(0, 3).join('\n  • ')}`);
    }

    // 教训参考
    if (brainResult.lessons?.length > 0) {
      sections.push(`【历史教训】
  • ${brainResult.lessons.slice(0, 2).map((l) => l.lesson || l.problem).join('\n  • ')}`);
    }

    if (sections.length > 0) {
      this._llmContext = `\n\n【AI大脑分析】\n${sections.join('\n\n')}`;
    }
  }

  /**
   * 获取大脑思考历史
   */
  getBrainHistory() {
    return this._brainHistory;
  }

  /**
   * 获取完整报告
   */
  getReport() {
    return {
      brain: this.brain?.exportReport(),
      brainHistory: this._brainHistory,
      loopStats: this.getStats()
    };
  }

  /**
   * 手动调用大脑分析
   */
  async analyze(problem) {
    if (!this.brain) {
      return { error: 'Brain not enabled' };
    }

    return this.brain.thinkComplete(problem);
  }

  /**
   * 手动逆向思考
   */
  async reverseThink(goal) {
    if (!this.brain) {
      return { error: 'Brain not enabled' };
    }

    return this.brain.reverseThink(goal);
  }

  /**
   * 获取教训建议
   */
  async getLessons(context) {
    if (!this.brain) {
      return [];
    }

    return this.brain.getLessonSuggestions(context);
  }
}

module.exports = BrainLoop;
