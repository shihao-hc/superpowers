/**
 * StatusReporter - 状态报告引擎
 *
 * 系统状态查询和自我改进建议生成
 */

class StatusReporter {
  constructor(bs) {
    this.bs = bs;
  }

  getStatus() {
    const bs = this.bs;
    const lessonStats = bs.lessonLibrary.getStats();
    const evolutionStats = bs.evolution.getStats();

    return {
      enabled: bs.enabled,
      decisionCount: bs.state.decisionCount,
      capabilities: {
        metaCognition: bs.config.enableMetaCognition,
        reverseThinking: bs.config.enableReverseThinking,
        autoEvolution: bs.config.enableAutoEvolution
      },
      evolution: evolutionStats,
      tools: bs.tools.getStats(),
      lessons: lessonStats,
      health: bs._calculateHealth()
    };
  }

  getImprovements() {
    const bs = this.bs;
    const health = bs._calculateHealth();
    const suggestions = [...health.improvements];

    const lessonStats = bs.lessonLibrary.getStats();
    if (lessonStats.unapplied > lessonStats.total * 0.7) {
      suggestions.push('教训积累过多但应用率低，可能缺乏与决策流程的结合');
    }

    const metaAnalysis = bs.metaCognition.analyzeHistory();
    if (metaAnalysis.uncertainRate > 0.5) {
      suggestions.push('元认知不确定性较高，建议增加信息收集');
    }

    if (bs.state.decisionCount > 50 && health.metrics.evolution.recentLearnings < 5) {
      suggestions.push('决策频繁但学习记录少，建议增加复盘频率');
    }

    return {
      health,
      suggestions,
      priority: health.level === 'critical' ? 'high'
        : health.level === 'needs-improvement' ? 'medium'
          : 'low'
    };
  }
}

module.exports = StatusReporter;
