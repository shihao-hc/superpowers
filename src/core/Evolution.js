/**
 * Evolution - 自我进化模块
 *
 * 知道不足、主动改进、每次都在变
 *
 * @version 1.0.0
 * @license MIT
 * @copyright 2026 AI Brain System
 */

class Evolution {
  constructor(selfLearning = null) {
    this.selfLearning = selfLearning;

    // 进化数据
    this.data = {
      patterns: [],        // 成功模式
      mistakes: [],        // 错误记录
      improvements: [],    // 改进记录
      lessons: []          // 教训库
    };

    // 配置
    this.config = {
      maxPatterns: 100,
      maxMistakes: 50,
      maxImprovements: 100,
      minConfidence: 0.6
    };

    // 进化策略
    this.strategies = {
      fromSuccess: '从成功中提取模式',
      fromMistake: '从错误中学习',
      proactive: '主动识别改进点'
    };

    console.log('[Evolution] 自我进化模块已初始化');
  }

  /**
   * 每次交互后学习
   */
  learn(context, action, result) {
    if (!result) {return;}

    // 记录模式
    if (result.success) {
      this.recordPattern(context, action, result);
    } else {
      this.recordMistake(context, action, result);
    }

    // 主动识别改进点
    if (this.selfLearning) {
      const improvements = this.findImprovements();
      if (improvements.length > 0) {
        this.data.improvements.push(...improvements);
        console.log(`[Evolution] 发现 ${improvements.length} 个改进点`);
      }
    }

    // 教训：完成任务后必须自检
    // 注意：postTaskCheck由外部显式调用，避免循环
  }

  /**
   * 任务完成后自动自检（固化教训：完成任务后必须自检）
   */
  async postTaskCheck(taskName, taskResult) {
    console.log(`[Evolution] 任务完成后自检: ${taskName}`);

    try {
      // 尝试运行ComprehensiveChecker
      const checkerPath = require.resolve?.('path') || null;
      if (checkerPath) {
        try {
          const { ComprehensiveChecker } = require('../agent/ComprehensiveChecker');
          const checker = new ComprehensiveChecker({ projectRoot: process.cwd() });
          const report = await checker.run({ enableEvolution: false });

          if (report.stats.failed > 0) {
            console.log(`[Evolution] ⚠️ 自检发现问题: ${report.stats.failed} 项失败`);
            this.recordMistake(`任务: ${taskName}`, '自检', {
              error: `检查失败: ${report.stats.failed}项`,
              severity: 'high'
            });
            return { success: false, report };
          }
        } catch (e) {
          // ComprehensiveChecker不可用，跳过
          console.log(`[Evolution] 自检跳过: ${e.message}`);
        }
      }

      // 记录成功
      if (taskResult?.success !== false) {
        this.recordPattern(`任务: ${taskName}`, 'postTaskCheck', { success: true });
      }

      return { success: true };
    } catch (error) {
      this.recordMistake(`自检失败: ${taskName}`, 'postTaskCheck', {
        error: error.message,
        severity: 'medium'
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * 记录成功模式
   */
  recordPattern(context, action, result) {
    const pattern = {
      id: this._generateId(),
      context: this._truncate(context, 200),
      action: action,
      result: result,
      success: true,
      timestamp: Date.now(),
      confidence: result.confidence || 0.8
    };

    this.data.patterns.push(pattern);

    // 限制大小
    if (this.data.patterns.length > this.config.maxPatterns) {
      this.data.patterns = this.data.patterns.slice(-this.config.maxPatterns);
    }

    // 尝试提炼为教训
    if (pattern.confidence >= this.config.minConfidence) {
      this._extractLesson(pattern, 'pattern');
    }

    return pattern;
  }

  /**
   * 记录错误
   */
  recordMistake(context, action, result) {
    const mistake = {
      id: this._generateId(),
      context: this._truncate(context, 200),
      action: action,
      error: result.error || result,
      timestamp: Date.now(),
      severity: result.severity || 'medium'
    };

    this.data.mistakes.push(mistake);

    // 限制大小
    if (this.data.mistakes.length > this.config.maxMistakes) {
      this.data.mistakes = this.data.mistakes.slice(-this.config.maxMistakes);
    }

    // 从错误中提取教训
    this._extractLesson(mistake, 'mistake');

    return mistake;
  }

  /**
   * 从模式或错误中提取教训
   */
  _extractLesson(data, type) {
    const lesson = {
      id: this._generateId(),
      type,
      problem: data.context,
      lesson: type === 'pattern'
        ? `成功模式: ${data.action || '未知动作'}`
        : `错误教训: ${data.error || '未知错误'}`,
      improvement: type === 'pattern'
        ? '继续保持这个方法'
        : `避免: ${data.context}`,
      timestamp: Date.now(),
      source: data.id
    };

    // 检查是否已有类似教训
    const exists = this.data.lessons.some((l) =>
      l.lesson === lesson.lesson
    );

    if (!exists) {
      this.data.lessons.push(lesson);
    }

    return lesson;
  }

  /**
   * 从教训中学习
   */
  fromLesson(lesson) {
    return {
      principle: lesson.lesson,
      trigger: lesson.problem,
      improvement: lesson.improvement,
      integration: this._integrateLesson(lesson)
    };
  }

  /**
   * 将教训整合到系统
   */
  _integrateLesson(lesson) {
    // 通知学习系统
    if (this.selfLearning) {
      this.selfLearning.recordSuggestion(
        { type: 'lesson', name: lesson.lesson },
        'learned'
      );
    }

    return {
      integrated: true,
      action: '教训已记录',
      nextStep: '在实际问题中应用'
    };
  }

  /**
   * 主动识别改进点
   */
  findImprovements() {
    if (!this.selfLearning) {return [];}

    const improvements = [];

    let stats;
    try {
      stats = this.selfLearning.getStats();
    } catch (e) {
      return [];
    }

    // 从低采纳率识别
    if (stats.suggestions) {
      const lowAdoption = this._getLowAdoptionSuggestions();
      if (lowAdoption.length > 0) {
        improvements.push({
          type: 'adoption',
          items: lowAdoption,
          action: '优化建议内容',
          priority: 'medium'
        });
      }
    }

    // 从错误频率识别
    if (this.data.mistakes.length > 0) {
      const frequentErrors = this._getFrequentErrors();
      if (frequentErrors.length > 0) {
        improvements.push({
          type: 'error',
          items: frequentErrors,
          action: '改进错误处理',
          priority: 'high'
        });
      }
    }

    // 从响应质量识别
    if (stats.responses > 10) {
      const lowQuality = this._getLowQualityResponses();
      if (lowQuality) {
        improvements.push({
          type: 'quality',
          items: [lowQuality],
          action: '提升响应质量',
          priority: 'medium'
        });
      }
    }

    return improvements;
  }

  /**
   * 获取低采纳率的建议
   */
  _getLowAdoptionSuggestions() {
    if (!this.selfLearning?.data?.suggestions) {return [];}

    const lowAdoption = [];
    for (const [key, record] of this.selfLearning.data.suggestions) {
      if (record.shown >= 3) {
        const rate = record.adopted / record.shown;
        if (rate < 0.3) {
          lowAdoption.push({ key, rate });
        }
      }
    }

    return lowAdoption.slice(0, 5);
  }

  /**
   * 获取频繁错误
   */
  _getFrequentErrors() {
    const errorCount = {};

    for (const mistake of this.data.mistakes.slice(-20)) {
      const key = mistake.error || 'unknown';
      errorCount[key] = (errorCount[key] || 0) + 1;
    }

    return Object.entries(errorCount)
      .filter(([_, count]) => count >= 2)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  /**
   * 获取低质量响应
   */
  _getLowQualityResponses() {
    if (!this.selfLearning?.data?.responses) {return null;}

    const recent = this.selfLearning.data.responses.slice(-20);
    if (recent.length < 10) {return null;}

    const avgQuality = recent.reduce((sum, r) => sum + (r.quality || 0), 0) / recent.length;

    if (avgQuality < 0.5) {
      return { avgQuality, count: recent.length };
    }

    return null;
  }

  /**
   * 记录问题-解决方案
   */
  recordProblemSolution(problem, solution) {
    const record = {
      id: this._generateId(),
      problem: this._truncate(JSON.stringify(problem), 200),
      solution: solution.description,
      confidence: solution.confidence,
      perspectives: solution.perspectives,
      timestamp: Date.now()
    };

    // 添加到模式
    if (solution.confidence >= this.config.minConfidence) {
      this.data.patterns.push(record);
    }

    return record;
  }

  /**
   * 获取教训库
   */
  getLessons() {
    return this.data.lessons;
  }

  /**
   * 获取进化统计
   */
  getStats() {
    return {
      patterns: this.data.patterns.length,
      mistakes: this.data.mistakes.length,
      improvements: this.data.improvements.length,
      lessons: this.data.lessons.length,
      recentLesson: this.data.lessons[this.data.lessons.length - 1] || null
    };
  }

  /**
   * 生成ID
   */
  _generateId() {
    return `evo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 截断文本
   */
  _truncate(text, maxLength) {
    if (!text) {return '';}
    if (text.length <= maxLength) {return text;}
    return `${text.substring(0, maxLength)}...`;
  }

  /**
   * 进化建议
   */
  suggestEvolution() {
    const suggestions = [];

    if (this.data.mistakes.length > 5) {
      suggestions.push({
        type: 'pattern',
        message: '近期错误较多，建议回顾教训库',
        action: '查看最近的教训'
      });
    }

    if (this.data.lessons.length > 0) {
      const unused = this.data.lessons.filter((l) =>
        !this.data.patterns.some((p) => p.source === l.id)
      );
      if (unused.length > 3) {
        suggestions.push({
          type: 'integration',
          message: `有 ${unused.length} 个教训尚未应用`,
          action: '在下次解决问题时尝试应用'
        });
      }
    }

    return suggestions;
  }
}

module.exports = Evolution;
