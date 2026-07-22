/**
 * MetaCognition - 元认知模块
 *
 * 知道自己知道什么、不知道什么
 * - 决策前自问
 * - 决策后复盘
 * - 假设检测
 */

class MetaCognition {
  constructor() {
    // 决策前自问模板
    this.beforeQuestions = [
      '我真正理解这个问题了吗？',
      '我知道自己的判断依据吗？',
      '我有盲区吗？',
      '常规方法试过了吗？',
      '这个问题的本质是什么？'
    ];

    // 决策后复盘模板
    this.afterQuestions = [
      '这次我做得好的：',
      '这次我可以改进的：',
      '下次我要记住的：'
    ];

    // 假设检测关键词
    this.uncertainWords = [
      '大概', '可能', '应该', '估计', '不确定',
      'maybe', 'probably', 'might', 'perhaps',
      '我觉得', '我认为', '我猜测'
    ];

    // 确定性检测关键词
    this.certainWords = [
      '确定', '肯定', '绝对', '100%', '一定',
      'confirmed', 'definitely', 'certain', 'absolutely'
    ];

    // 复盘历史
    this.history = [];
  }

  /**
   * 决策前自问
   */
  beforeAsk(context = '') {
    return {
      questions: this.beforeQuestions.map((q) => ({
        question: q,
        hint: this.getQuestionHint(q, context)
      })),
      timestamp: Date.now()
    };
  }

  /**
   * 获取问题的提示
   */
  getQuestionHint(question, _context) {
    const hints = {
      '我真正理解这个问题了吗？': '尝试用自己的话复述问题',
      '我知道自己的判断依据吗？': '找到支撑判断的证据',
      '我有盲区吗？': '考虑是否有遗漏的信息',
      '常规方法试过了吗？': '搜索是否有现成方案',
      '这个问题的本质是什么？': '剥离表象，找到核心'
    };
    return hints[question] || '';
  }

  /**
   * 决策后复盘
   */
  afterReview(context, result) {
    const review = {
      questions: this.afterQuestions,
      context,
      result,
      timestamp: Date.now()
    };

    // 添加到历史
    this.history.push(review);
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }

    return review;
  }

  /**
   * 元认知检查：判断回答的确定性
   */
  check(text, _type = 'general') {
    if (!text) {return { status: 'unknown', confidence: 0 };}

    const textLower = text.toLowerCase();

    // 检测不确定表述
    const uncertainCount = this.uncertainWords.filter((w) =>
      textLower.includes(w.toLowerCase())
    ).length;

    // 检测确定性表述
    const certainCount = this.certainWords.filter((w) =>
      textLower.includes(w.toLowerCase())
    ).length;

    // 分析结果
    let status, confidence, warning;

    if (uncertainCount > certainCount && uncertainCount >= 2) {
      status = 'uncertain';
      confidence = 0.4;
      warning = '回答中存在较多不确定表述';
    } else if (certainCount > uncertainCount && certainCount >= 2) {
      status = 'confident';
      confidence = 0.85;
      warning = null;
    } else if (uncertainCount > 0) {
      status = 'partial';
      confidence = 0.6;
      warning = '回答可能存在不确定性';
    } else {
      status = 'neutral';
      confidence = 0.5;
      warning = null;
    }

    // 检测是否在"硬编"答案（没有依据的确定性表述）
    if (this.detectHypothesis(text)) {
      status = 'hypothesis';
      confidence = 0.3;
      warning = '可能在硬编答案，缺乏事实依据';
    }

    return {
      status,
      confidence,
      warning,
      uncertainCount,
      certainCount
    };
  }

  /**
   * 检测假设性回答（硬编）
   */
  detectHypothesis(text) {
    // 模式：确定性词汇 + 没有证据支持
    const hasCertainty = this.certainWords.some((w) =>
      text.toLowerCase().includes(w.toLowerCase())
    );

    const hasEvidence = [
      '根据', '因为', '所以', '数据显示',
      'based on', 'because', 'therefore', 'data shows'
    ].some((indicator) => text.toLowerCase().includes(indicator.toLowerCase()));

    // 有确定性但没有证据 = 可能是硬编
    return hasCertainty && !hasEvidence;
  }

  /**
   * 深度自问：追问更多细节
   */
  deepAsk(context, depth = 1) {
    if (depth <= 0) {return [];}

    const questions = [];

    // 基于上下文的深度追问
    if (context.includes('?')) {
      questions.push({
        question: '这个问题背后还有更深的问题吗？',
        depth: depth
      });
    }

    if (context.length < 50) {
      questions.push({
        question: '问题是否过于简化了？',
        depth: depth
      });
    }

    // 递归添加更多问题
    if (depth > 1) {
      questions.push(...this.deepAsk(context, depth - 1));
    }

    return questions;
  }

  /**
   * 获取复盘历史
   */
  getHistory(limit = 10) {
    return this.history.slice(-limit);
  }

  /**
   * 分析历史复盘模式
   */
  analyzeHistory() {
    if (this.history.length === 0) {
      return { message: '暂无复盘历史' };
    }

    const recent = this.history.slice(-10);
    const uncertainCount = recent.filter((h) =>
      h.result?.status === 'uncertain'
    ).length;

    return {
      totalReviews: this.history.length,
      recentReviews: recent.length,
      uncertainRate: uncertainCount / recent.length,
      pattern: uncertainCount > 5
        ? '近期不确定性较高，建议增加信息收集'
        : '复盘模式正常'
    };
  }

  /**
   * 知道自己不知道什么
   */
  知道自己不知道什么(context) {
    const unknowns = [];

    // 常见未知领域
    const unknownPatterns = [
      { pattern: '?', label: '问题可能不完整' },
      { pattern: '最新', label: '可能需要搜索最新信息' },
      { pattern: '具体', label: '需要更多具体信息' }
    ];

    for (const { pattern, label } of unknownPatterns) {
      if (context.includes(pattern)) {
        unknowns.push(label);
      }
    }

    return {
      hasUnknowns: unknowns.length > 0,
      unknowns,
      recommendation: unknowns.length > 2
        ? '建议先收集更多信息再回答'
        : '可以在有限信息下继续'
    };
  }
}

module.exports = MetaCognition;
