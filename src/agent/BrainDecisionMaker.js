/**
 * BrainDecisionMaker - 业务决策大脑
 *
 * 将 AI 大脑集成到具体业务逻辑中
 * 支持量化交易系统的决策场景
 *
 * @version 1.0.0
 * @license MIT
 * @copyright 2026 AI Brain System
 */
const BrainAgent = require('./BrainAgent');

const VERSION = '1.0.0';

/**
 * 交易决策场景
 */
class TradingDecisionMaker {
  constructor(brain = null) {
    this.brain = brain || new BrainAgent({ verbose: false });
    this.decisions = [];
    this.version = VERSION;
  }

  /**
   * 买入决策
   */
  async shouldBuy(ticker, signal, confidence) {
    const context = `股票 ${ticker} 出现买入信号，置信度 ${confidence}`;

    // 决策前大脑分析
    const preDecision = this.brain.thinkComplete(context);

    // 生成决策
    const decision = {
      action: 'buy',
      ticker,
      signal,
      confidence,
      preAnalysis: preDecision,
      decision: this.makeDecision(preDecision, confidence),
      timestamp: Date.now()
    };

    // 学习
    this.brain.learnFromResult(
      context,
      'shouldBuy',
      decision.decision.recommendation,
      decision.decision.approved
    );

    this.decisions.push(decision);
    return decision;
  }

  /**
   * 卖出决策
   */
  async shouldSell(ticker, position, reason) {
    const context = `股票 ${ticker} 持仓 ${position} 需要考虑卖出，原因: ${reason}`;

    const preDecision = this.brain.thinkComplete(context);

    const decision = {
      action: 'sell',
      ticker,
      position,
      reason,
      preAnalysis: preDecision,
      decision: this.makeDecision(preDecision, 0.5),
      timestamp: Date.now()
    };

    this.brain.learnFromResult(context, 'shouldSell', decision.decision.recommendation, decision.decision.approved);
    this.decisions.push(decision);
    return decision;
  }

  /**
   * 风险评估
   */
  async assessRisk(portfolio, marketCondition) {
    const context = `投资组合面临风险: ${portfolio}, 市场状态: ${marketCondition}`;

    const analysis = this.brain.thinkComplete(context);

    // 逆向思维分析风险
    const riskAnalysis = this.brain.reverseThink(context);

    return {
      riskLevel: this.calculateRiskLevel(portfolio),
      brainAnalysis: analysis,
      reverseAnalysis: riskAnalysis,
      recommendations: this.extractRecommendations(analysis)
    };
  }

  /**
   * 生成决策
   */
  makeDecision(analysis, confidence) {
    const perspectives = analysis?.perspectives || {};
    const metaQuestions = analysis?.metaQuestions?.questions?.questions || [];

    // 检查风险视角
    const riskView = perspectives.risk || '';
    const hasHighRisk = String(riskView).includes('高风险') || String(riskView).includes('亏损');

    // 检查元认知警告
    const warnings = metaQuestions.filter((q) =>
      String(q).includes('盲区') || String(q).includes('证据')
    );

    const recommendation = hasHighRisk ? '观望' : (confidence > 0.7 ? '建议执行' : '谨慎执行');
    const approved = !hasHighRisk && confidence > 0.6 && warnings.length < 2;

    return {
      recommendation,
      approved,
      confidence,
      warnings: warnings.length,
      reasoning: this.generateReasoning(analysis)
    };
  }

  /**
   * 计算风险等级
   */
  calculateRiskLevel(portfolio) {
    if (!portfolio) {return 'unknown';}

    const loss = portfolio.dailyLoss || 0;
    const exposure = portfolio.maxExposure || 0;

    if (loss > 0.05 || exposure > 0.9) {return 'critical';}
    if (loss > 0.03 || exposure > 0.7) {return 'high';}
    if (loss > 0.01 || exposure > 0.5) {return 'medium';}
    return 'low';
  }

  /**
   * 提取建议
   */
  extractRecommendations(analysis) {
    const recs = [];

    // 从多角度提取
    const perspectives = analysis?.perspectives || {};
    for (const [key, value] of Object.entries(perspectives)) {
      if (String(value).length > 10) {
        recs.push({ source: key, recommendation: String(value).substring(0, 100) });
      }
    }

    // 从教训提取
    const lessons = analysis?.lessons || [];
    for (const lesson of lessons.slice(0, 2)) {
      recs.push({ source: 'lesson', recommendation: lesson.lesson || lesson.problem });
    }

    return recs;
  }

  /**
   * 生成推理
   */
  generateReasoning(analysis) {
    const parts = [];

    if (analysis?.perspectives?.technical) {
      parts.push('技术视角支持此决策');
    }

    if (analysis?.perspectives?.risk) {
      parts.push('风险需关注');
    }

    return parts.join('；') || '基于综合分析';
  }

  /**
   * 获取决策历史
   */
  getHistory() {
    return this.decisions;
  }

  /**
   * 获取大脑状态
   */
  getBrainStatus() {
    return this.brain.getStatus();
  }
}

/**
 * 股票分析决策场景
 */
class StockAnalysisDecisionMaker {
  constructor(brain = null) {
    this.brain = brain || new BrainAgent({ verbose: false });
  }

  /**
   * 分析股票选择决策
   */
  async analyzeStockSelection(candidates, criteria) {
    const context = `从 ${candidates.length} 只候选股票中选择最佳标的，标准: ${criteria}`;

    // 决策前分析
    const analysis = this.brain.thinkComplete(context);

    // 多角度分析候选股票
    const stockAnalysis = {};
    for (const ticker of candidates.slice(0, 5)) {
      stockAnalysis[ticker] = this.brain.analyze(`股票 ${ticker} 的投资价值`);
    }

    // 逆向思维：为什么这些股票可能不是最佳选择
    const reverseAnalysis = {};
    for (const ticker of candidates.slice(0, 3)) {
      reverseAnalysis[ticker] = this.brain.reverseThink(`不选择 ${ticker} 的理由`);
    }

    // 综合决策
    const recommendation = this.selectBest(stockAnalysis, criteria);

    return {
      context,
      analysis,
      stockAnalysis,
      reverseAnalysis,
      recommendation,
      brainStats: this.brain.getStatus()
    };
  }

  /**
   * 选择最佳股票
   */
  selectBest(stockAnalysis, _criteria) {
    const scores = [];

    for (const [ticker, analysis] of Object.entries(stockAnalysis)) {
      const score = this.calculateScore(analysis);
      scores.push({ ticker, score, analysis });
    }

    scores.sort((a, b) => b.score - a.score);

    return {
      best: scores[0]?.ticker,
      alternatives: scores.slice(1, 4).map((s) => s.ticker),
      ranking: scores
    };
  }

  /**
   * 计算分数
   */
  calculateScore(analysis) {
    let score = 0.5;

    // 基于逆向思维结论调整
    if (analysis?.conclusion?.includes('正向')) {score += 0.2;}
    if (analysis?.conclusion?.includes('风险')) {score -= 0.1;}

    return Math.max(0, Math.min(1, score));
  }
}

/**
 * 回测决策场景
 */
class BacktestDecisionMaker {
  constructor(brain = null) {
    this.brain = brain || new BrainAgent({ verbose: false });
  }

  /**
   * 回测结果分析决策
   */
  async analyzeBacktestResult(result, strategy) {
    const context = `策略 ${strategy} 回测结果: 收益 ${result.return}%, 最大回撤 ${result.maxDrawdown}%`;

    // 深度分析
    const analysis = this.brain.thinkComplete(context);

    // 预演分析：如果上线会怎样
    const premortem = this.brain.brain.reverseThinking.premortem(context);

    // 五问法分析
    const fiveWhys = this.brain.brain.reverseThinking.fiveWhys(context);

    // 生成建议
    const recommendations = this.generateRecommendations(result, analysis);

    // 决策：是否应该上线
    const decision = this.makeDeploymentDecision(result, analysis);

    return {
      result,
      strategy,
      analysis,
      premortem,
      fiveWhys,
      recommendations,
      decision,
      timestamp: Date.now()
    };
  }

  /**
   * 生成建议
   */
  generateRecommendations(result, _analysis) {
    const recs = [];

    // 收益分析
    if (result.return > 0) {
      recs.push({ type: 'positive', text: '策略收益为正，具备盈利潜力' });
    } else {
      recs.push({ type: 'negative', text: '策略亏损，需要调整参数或逻辑' });
    }

    // 回撤分析
    if (result.maxDrawdown > 0.2) {
      recs.push({ type: 'risk', text: '最大回撤超过20%，风险较高' });
    }

    // 从教训库提取
    const lessons = this.brain.getLessonSuggestions('回测');
    if (lessons.length > 0) {
      recs.push({ type: 'lesson', text: lessons[0].lesson || lessons[0].problem });
    }

    return recs;
  }

  /**
   * 做出部署决策
   */
  makeDeploymentDecision(result, _analysis) {
    const riskScore = result.maxDrawdown / 0.3; // 回撤占30%上限的比例
    const returnScore = result.return / 0.5; // 收益占50%目标的比例

    const totalScore = returnScore * 0.6 - riskScore * 0.4;

    let decision = 'review';
    let reason = '需要更多分析';

    if (totalScore > 0.3 && result.maxDrawdown < 0.15) {
      decision = 'deploy';
      reason = '风险收益比良好，可以小资金试运行';
    } else if (totalScore < -0.2 || result.maxDrawdown > 0.3) {
      decision = 'reject';
      reason = '风险过高或收益不足，暂不推荐';
    }

    return {
      decision,
      reason,
      scores: { riskScore, returnScore, totalScore }
    };
  }
}

module.exports = {
  TradingDecisionMaker,
  StockAnalysisDecisionMaker,
  BacktestDecisionMaker,
  BrainAgent
};
