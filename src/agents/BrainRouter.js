/**
 * BrainRouter - RouterAgent + AI大脑
 *
 * 在消息路由决策时集成大脑的逆向思维和多角度分析能力
 */
const _path = require('path');

class BrainRouter {
  constructor(routerAgent) {
    this.router = routerAgent;

    // 尝试加载 BrainAgent
    try {
      const BrainAgent = require('../agent/BrainAgent');
      this.brain = new BrainAgent({
        enabled: true,
        verbose: false
      });
      console.log('[BrainRouter] AI大脑已初始化');
    } catch (error) {
      console.warn('[BrainRouter] BrainAgent 加载失败:', error.message);
      this.brain = null;
    }

    // 大脑统计
    this._stats = {
      totalDecisions: 0,
      brainActivations: 0,
      reverseThinkCount: 0
    };
  }

  /**
   * 路由消息（增强版）
   */
  async routeMessage(message, contextHistory = []) {
    this._stats.totalDecisions++;

    // ========== 决策前大脑激活 ==========
    let brainAnalysis = null;
    if (this.brain) {
      brainAnalysis = await this._preRouteAnalysis(message);
    }

    // ========== 执行原有路由 ==========
    const result = await this.router.routeMessage(message, contextHistory);

    // ========== 添加大脑分析到结果 ==========
    if (brainAnalysis) {
      result.brain = brainAnalysis;
      result.routing.brainEnhanced = true;
    }

    return result;
  }

  /**
   * 路由前的大脑分析
   */
  async _preRouteAnalysis(message) {
    try {
      this._stats.brainActivations++;

      // 1. 元认知自问
      const metaQuestions = this.brain.beforeDecision(message);

      // 2. 多角度分析
      const perspectives = this.brain.analyze(message);

      // 3. 质疑（这是路由决策吗？）
      const questioning = this.brain.question(message);

      // 4. 工具推荐
      const tools = this.brain.suggestTools(message);

      return {
        metaQuestions: metaQuestions?.questions?.questions || [],
        perspectives: perspectives,
        questioning: questioning,
        tools: tools,
        timestamp: Date.now()
      };
    } catch (error) {
      console.warn('[BrainRouter] Pre-route analysis error:', error.message);
      return null;
    }
  }

  /**
   * 逆向思考 - 分析为什么某种路由可能是错误的
   */
  async reverseThinkRouting(currentRoute, message) {
    if (!this.brain) {
      return { error: 'Brain not enabled' };
    }

    this._stats.reverseThinkCount++;

    const analysis = this.brain.reverseThink(
      `将消息路由到 ${currentRoute}: "${message}"`
    );

    return {
      currentRoute,
      reverseAnalysis: analysis,
      alternativeRoutes: this._suggestAlternatives(analysis)
    };
  }

  /**
   * 建议替代路由
   */
  _suggestAlternatives(reverseAnalysis) {
    const alternatives = [];

    if (reverseAnalysis?.reversePerspective) {
      // 基于逆向分析建议替代方案
      if (reverseAnalysis.reversePerspective.includes('search')) {
        alternatives.push('search');
      }
      if (reverseAnalysis.reversePerspective.includes('memory')) {
        alternatives.push('memory');
      }
    }

    return alternatives;
  }

  /**
   * 从结果学习
   */
  learnFromResult(message, route, success, response) {
    if (!this.brain) {return;}

    this.brain.learnFromResult(
      message,
      `route:${route}`,
      response,
      success
    );
  }

  /**
   * 获取大脑统计
   */
  getStats() {
    return {
      ...this._stats,
      brainEnabled: !!this.brain
    };
  }

  /**
   * 获取教训建议
   */
  getLessonSuggestions(context) {
    if (!this.brain) {return [];}
    return this.brain.getLessonSuggestions(context);
  }

  /**
   * 完整思考 - 手动触发
   */
  async thinkComplete(problem) {
    if (!this.brain) {
      return { error: 'Brain not enabled' };
    }

    return this.brain.thinkComplete(problem);
  }

  /**
   * 获取状态报告
   */
  getReport() {
    const report = {
      stats: this.getStats()
    };

    if (this.brain) {
      report.brain = this.brain.exportReport();
    }

    return report;
  }
}

module.exports = BrainRouter;
