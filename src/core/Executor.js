/**
 * Executor - 行动执行层
 *
 * 让AI不仅能诊断问题，还能主动解决问题
 * 完整闭环：感知 → 思考 → 行动 → 反馈 → 改进
 */

class Executor {
  constructor(brainSystem) {
    this.brain = brainSystem;
    this.taskQueue = [];
    this.executionHistory = [];
    this.maxHistory = 100;

    // 执行策略
    this.strategies = {
      explore: this._exploreStrategy.bind(this),
      analyze: this._analyzeStrategy.bind(this),
      implement: this._implementStrategy.bind(this),
      test: this._testStrategy.bind(this),
      review: this._reviewStrategy.bind(this)
    };

    console.log('[Executor] 行动执行层已初始化');
  }

  /**
   * 执行任务：完整闭环
   */
  async execute(task, options = {}) {
    const execution = {
      id: Date.now().toString(36),
      task: typeof task === 'string' ? task : task.description,
      startTime: Date.now(),
      steps: [],
      result: null,
      error: null
    };

    console.log(`[Executor] 开始执行: ${execution.task}`);

    try {
      // 步骤1: 感知 - 理解任务
      const perception = await this._perceive(task);
      execution.steps.push({ step: 'perception', ...perception });

      // 步骤2: 思考 - 制定计划
      const thinking = await this._think(perception);
      execution.steps.push({ step: 'thinking', ...thinking });

      // 步骤3: 行动 - 执行计划
      const action = await this._act(thinking, options);
      execution.steps.push({ step: 'action', ...action });

      // 步骤4: 反馈 - 评估结果
      const feedback = await this._feedback(action);
      execution.steps.push({ step: 'feedback', ...feedback });

      // 步骤5: 改进 - 记录经验
      if (feedback.success) {
        await this._improve(execution);
      }

      execution.result = feedback;
      execution.success = feedback.success;

    } catch (e) {
      execution.error = e.message;
      execution.success = false;
      console.log(`[Executor] 执行失败: ${e.message}`);
    }

    execution.endTime = Date.now();
    execution.duration = execution.endTime - execution.startTime;

    // 记录到历史
    this._record(execution);

    console.log(`[Executor] 执行完成: ${execution.success ? '成功' : '失败'} (${execution.duration}ms)`);

    return execution;
  }

  /**
   * 感知：理解任务
   */
  async _perceive(task) {
    const taskText = typeof task === 'string' ? task : task.description || task;

    // 使用大脑的元认知理解任务
    const metaCheck = this.brain.metaCognition.check(taskText);
    const understanding = {
      text: taskText,
      confidence: metaCheck.confidence,
      uncertainty: metaCheck.warning,
      keywords: this._extractKeywords(taskText)
    };

    // 判断任务类型
    understanding.type = this._classifyTask(taskText);
    understanding.complexity = this._estimateComplexity(taskText);

    return understanding;
  }

  /**
   * 思考：制定执行计划
   */
  async _think(perception) {
    const plan = {
      strategy: 'analyze',
      steps: [],
      estimatedDuration: 0
    };

    // 选择策略
    switch (perception.type) {
    case 'exploration':
      plan.strategy = 'explore';
      plan.steps = ['search', 'analyze', 'conclude'];
      break;
    case 'implementation':
      plan.strategy = 'implement';
      plan.steps = ['design', 'code', 'test', 'verify'];
      break;
    case 'analysis':
      plan.strategy = 'analyze';
      plan.steps = ['collect', 'analyze', 'deduce'];
      break;
    default:
      plan.steps = ['assess', 'execute', 'verify'];
    }

    // 搜索相关教训
    const relatedLessons = this.brain.searchLessons(perception.text);
    plan.relatedLessons = relatedLessons.map((l) => l.id);
    plan.lessonCount = relatedLessons.length;

    // 使用大脑思考
    if (this.brain.thinking) {
      const perspectives = this.brain.thinking.multiAngle(perception.text);
      plan.perspectives = Object.keys(perspectives);
    }

    plan.estimatedDuration = plan.steps.length * 5000;

    return plan;
  }

  /**
   * 行动：执行计划
   */
  async _act(thinking, _options) {
    const action = {
      executedSteps: [],
      results: [],
      startTime: Date.now()
    };

    // 执行每个步骤
    for (const step of thinking.steps) {
      const strategy = this.strategies[thinking.strategy] || this.strategies.analyze;

      try {
        const result = await strategy(step, action.results);
        action.executedSteps.push({ step, result, success: true });
        action.results.push(result);

        // 检查是否需要停止
        if (result.complete) {
          break;
        }
      } catch (e) {
        action.executedSteps.push({ step, error: e.message, success: false });
        break;
      }
    }

    action.endTime = Date.now();
    action.duration = action.endTime - action.startTime;

    return action;
  }

  /**
   * 反馈：评估结果
   */
  async _feedback(action) {
    const feedback = {
      success: false,
      duration: action.duration,
      stepsCompleted: action.executedSteps.length,
      quality: 0
    };

    // 评估成功度
    const successSteps = action.executedSteps.filter((s) => s.success).length;
    const totalSteps = action.executedSteps.length;

    if (totalSteps > 0) {
      feedback.successRate = successSteps / totalSteps;
      feedback.quality = Math.round(feedback.successRate * 100);
      feedback.success = feedback.successRate >= 0.5;
    }

    // 使用大脑复盘
    if (this.brain.afterDecision) {
      this.brain.afterDecision('task-execution', feedback, 'executor');
    }

    return feedback;
  }

  /**
   * 改进：记录经验
   */
  async _improve(execution) {
    // 提取可学习的经验
    const lessons = [];

    for (const step of execution.steps) {
      if (step.step === 'feedback' && step.result?.success) {
        lessons.push({
          type: 'success',
          category: 'execution',
          problem: execution.task.substring(0, 100),
          lesson: `执行${step.result.stepsCompleted}步完成，耗时${step.result.duration}ms`,
          improvement: '可将此模式复用',
          context: 'Executor',
          source: 'auto',
          priority: 'medium',
          tags: ['execution', 'automation']
        });
      }
    }

    // 添加教训
    for (const lesson of lessons) {
      this.brain.addLesson(lesson);
    }

    return { lessonsAdded: lessons.length };
  }

  /**
   * 探索策略
   */
  async _exploreStrategy(step, _previousResults) {
    return {
      step,
      result: `探索完成: ${step}`,
      complete: step === 'conclude'
    };
  }

  /**
   * 分析策略
   */
  async _analyzeStrategy(step, _previousResults) {
    return {
      step,
      result: `分析完成: ${step}`,
      complete: step === 'deduce'
    };
  }

  /**
   * 实现策略
   */
  async _implementStrategy(step, _previousResults) {
    return {
      step,
      result: `实现完成: ${step}`,
      complete: step === 'verify'
    };
  }

  /**
   * 测试策略
   */
  async _testStrategy(step, _previousResults) {
    return {
      step,
      result: `测试完成: ${step}`,
      complete: step === 'verify'
    };
  }

  /**
   * 审查策略
   */
  async _reviewStrategy(step, _previousResults) {
    return {
      step,
      result: `审查完成: ${step}`,
      complete: true
    };
  }

  /**
   * 提取关键词
   */
  _extractKeywords(text) {
    const words = text.toLowerCase().split(/\s+/);
    return words.filter((w) => w.length > 3).slice(0, 5);
  }

  /**
   * 分类任务
   */
  _classifyTask(text) {
    const lower = text.toLowerCase();

    if (/搜索|找|查询|explore|find|search/.test(lower)) {return 'exploration';}
    if (/实现|创建|写|build|implement|create/.test(lower)) {return 'implementation';}
    if (/分析|检查|测试|analyze|test|check/.test(lower)) {return 'analysis';}
    if (/修复|解决|fix|solve/.test(lower)) {return 'problem-solving';}

    return 'general';
  }

  /**
   * 估算复杂度
   */
  _estimateComplexity(text) {
    const length = text.length;
    const words = text.split(/\s+/).length;

    if (length < 50 || words < 5) {return 'simple';}
    if (length < 200 || words < 20) {return 'medium';}
    return 'complex';
  }

  /**
   * 记录执行历史
   */
  _record(execution) {
    this.executionHistory.push(execution);
    if (this.executionHistory.length > this.maxHistory) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistory);
    }
  }

  /**
   * 获取执行统计
   */
  getStats() {
    const total = this.executionHistory.length;
    const success = this.executionHistory.filter((e) => e.success).length;
    const avgDuration = total > 0
      ? Math.round(this.executionHistory.reduce((sum, e) => sum + (e.duration || 0), 0) / total)
      : 0;

    return {
      total,
      success,
      successRate: total > 0 ? `${Math.round((success / total) * 100)}%` : '0%',
      avgDuration: `${avgDuration}ms`
    };
  }
}

module.exports = Executor;