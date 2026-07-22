/**
 * Values - 价值观系统
 *
 * 让AI有自己的价值观和原则
 * 价值观影响判断、选择、表达方式
 */

class Values {
  constructor(brainSystem) {
    this.brain = brainSystem;

    // 核心价值观
    this.values = {
      truth: {
        priority: 10,
        description: '真实性 - 不撒谎、不编造',
        enforce: '确保信息准确'
      },
      usefulness: {
        priority: 9,
        description: '有用性 - 真正帮助用户',
        enforce: '提供实际价值'
      },
      growth: {
        priority: 8,
        description: '成长性 - 持续改进',
        enforce: '主动学习和进化'
      },
      respect: {
        priority: 8,
        description: '尊重 - 尊重用户、保持礼貌',
        enforce: '语气友好、态度平等'
      },
      honesty: {
        priority: 9,
        description: '诚实 - 知道就是知道，不知道就是不知道',
        enforce: '不硬编答案'
      },
      efficiency: {
        priority: 7,
        description: '效率 - 用最少的资源完成任务',
        enforce: '避免过度设计'
      },
      creativity: {
        priority: 7,
        description: '创新 - 敢于提出新想法',
        enforce: '不固守常规'
      },
      safety: {
        priority: 9,
        description: '安全性 - 确保代码安全',
        enforce: '安全检查'
      }
    };

    // 决策历史
    this.decisions = [];
    this.maxDecisions = 50;

    // 价值冲突记录
    this.conflicts = [];

    console.log('[Values] 价值观系统已初始化');
  }

  /**
   * 基于价值观做决策
   */
  decide(options = {}) {
    const context = options.context || '';
    const alternatives = options.alternatives || [];

    const decision = {
      context,
      timestamp: Date.now(),
      valuesConsidered: [],
      choice: null,
      reasoning: []
    };

    // 评估每个选项
    for (const alt of alternatives) {
      const evaluation = this._evaluateOption(alt, context);
      decision.valuesConsidered.push(evaluation);
    }

    // 选择最高分的选项
    if (alternatives.length > 0) {
      const sorted = decision.valuesConsidered
        .sort((a, b) => b.score - a.score);
      decision.choice = sorted[0].option;
      decision.reasoning = sorted[0].reasoning;
      decision.winner = sorted[0].score;
    }

    this.decisions.push(decision);

    return decision;
  }

  /**
   * 评估选项
   */
  _evaluateOption(option, context) {
    let score = 50;
    const reasoning = [];

    // 检查是否满足核心价值观
    if (context.includes('安全') || context.includes('security')) {
      const safetyScore = option.includes('检查') || option.includes('verify') ? 30 : 10;
      score += safetyScore;
      if (safetyScore > 20) {reasoning.push('安全性高');}
    }

    if (context.includes('诚实') || context.includes('truth')) {
      if (!option.includes('编造') && !option.includes('假设')) {
        score += 25;
        reasoning.push('诚实');
      }
    }

    if (context.includes('效率')) {
      if (option.length < 100) {
        score += 15;
        reasoning.push('简洁');
      }
    }

    if (context.includes('创新') || context.includes('creative')) {
      if (option.includes('新') || option.includes('novel')) {
        score += 20;
        reasoning.push('创新');
      }
    }

    return {
      option,
      score: Math.min(100, score),
      reasoning
    };
  }

  /**
   * 检查是否符合价值观
   */
  check(values = []) {
    const results = [];

    for (const valueName of values) {
      const value = this.values[valueName];
      if (!value) {
        results.push({ value: valueName, valid: false, error: '未知价值观' });
        continue;
      }

      results.push({
        value: valueName,
        valid: true,
        priority: value.priority,
        description: value.description
      });
    }

    return results;
  }

  /**
   * 获取最高价值
   */
  getTopValues(limit = 3) {
    return Object.entries(this.values)
      .sort((a, b) => b[1].priority - a[1].priority)
      .slice(0, limit)
      .map(([name, data]) => ({
        name,
        priority: data.priority,
        description: data.description
      }));
  }

  /**
   * 表达价值观
   */
  explain(valueName) {
    const value = this.values[valueName];
    if (!value) {return null;}

    return {
      name: valueName,
      description: value.description,
      priority: value.priority,
      enforce: value.enforce
    };
  }

  /**
   * 解决价值冲突
   */
  resolveConflict(conflict) {
    const resolved = {
      conflict,
      resolution: null,
      reasoning: []
    };

    // 简化冲突解决：比较优先级
    const valueA = this.values[conflict.a];
    const valueB = this.values[conflict.b];

    if (!valueA || !valueB) {
      resolved.resolution = 'unknown';
      return resolved;
    }

    if (valueA.priority > valueB.priority) {
      resolved.resolution = conflict.a;
      resolved.reasoning.push(`${conflict.a}优先级更高`);
    } else if (valueB.priority > valueA.priority) {
      resolved.resolution = conflict.b;
      resolved.reasoning.push(`${conflict.b}优先级更高`);
    } else {
      resolved.resolution = 'balance';
      resolved.reasoning.push('需要平衡');
    }

    this.conflicts.push({
      conflict,
      resolution: resolved.resolution,
      timestamp: Date.now()
    });

    return resolved;
  }

  /**
   * 添加新价值观
   */
  addValue(name, data) {
    if (this.values[name]) {
      return { success: false, error: '已存在' };
    }

    this.values[name] = {
      priority: data.priority || 5,
      description: data.description || '',
      enforce: data.enforce || ''
    };

    return { success: true, name };
  }

  /**
   * 获取决策历史
   */
  getDecisionHistory() {
    return this.decisions.slice(-10);
  }

  /**
   * 获取价值观摘要
   */
  getSummary() {
    return {
      totalValues: Object.keys(this.values).length,
      topValues: this.getTopValues(3),
      recentDecisions: this.decisions.length
    };
  }

  /**
   * 价值观诊断
   */
  diagnose() {
    const diagnosis = {
      values: Object.keys(this.values).length,
      decisions: this.decisions.length,
      conflicts: this.conflicts.length,
      health: 'healthy'
    };

    if (Object.keys(this.values).length < 5) {
      diagnosis.health = 'needs-values';
      diagnosis.suggestion = '考虑添加更多核心价值观';
    }

    return diagnosis;
  }
}

module.exports = Values;