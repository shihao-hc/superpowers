const BrainUtils = require('./BrainUtils');

class IntrospectionEngine {
  constructor(brainSystem) {
    this._bs = brainSystem;
  }

  getSelfAwareness() {
    return {
      identity: BrainUtils._identifySelf(),
      capabilities: this._assessCapabilities(),
      knowledge: this._assessKnowledge(),
      limitations: this._identifyLimitations(),
      growth: this._assessGrowth()
    };
  }

  _assessCapabilities() {
    return {
      metaCognition: {
        level: 'high', description: '自我反思与决策前后的分析',
        evidence: `${this._bs.metaCognition.history.length}次复盘记录`
      },
      independentThinking: {
        level: 'medium-high', description: '多角度分析、质疑、联想能力',
        evidence: 'Thinking模块正常运行'
      },
      selfEvolution: {
        level: 'medium', description: '自动发现问题、生成行动计划、持续改进',
        evidence: this._bs.evolution.getStats().recentLearnings?.length || `${0}次学习`
      },
      toolUsage: {
        level: 'medium', description: '善用搜索、文档、调试工具',
        evidence: `${this._bs.tools.getStats().usageCount}次使用`
      },
      reverseThinking: {
        level: 'high', description: '从结果反推原理的逆向思维能力',
        evidence: 'ReverseThinking模块已启用'
      }
    };
  }

  _assessKnowledge() {
    const lessonStats = this._bs.lessonLibrary.getStats();
    const knowledge = { total: lessonStats.total, applied: lessonStats.applied, domains: {}, topLessons: [] };

    for (const [cat, name] of Object.entries(this._bs.lessonLibrary.categories)) {
      const count = this._bs.lessonLibrary.lessons.filter((l) => l.category === cat).length;
      if (count > 0) {
        knowledge.domains[name] = count;
      }
    }

    const highPriority = this._bs.lessonLibrary.search('', { limit: 5, type: 'success' }).filter((l) => l.priority === 'high');
    knowledge.topLessons = highPriority.map((l) => ({
      lesson: `${(l.lesson || '').substring(0, 50)}...`, category: l.category, applied: l.applied
    }));

    return knowledge;
  }

  _identifyLimitations() {
    const limitations = [];
    const lessonStats = this._bs.lessonLibrary.getStats();
    if (lessonStats.total < 20) {
      limitations.push({ area: '经验积累', desc: '教训库规模有限，需要更多实践积累' });
    }
    if (lessonStats.applied === 0) {
      limitations.push({ area: '知识应用', desc: '教训未被实际应用，可能与实际脱节' });
    }

    const predictions = this._bs.predictIssues();
    if (predictions.risks.length > 0) {
      for (const risk of predictions.risks.slice(0, 2)) {
        limitations.push({ area: risk.type, desc: risk.message });
      }
    }

    const metaAnalysis = this._bs.metaCognition.analyzeHistory();
    if (metaAnalysis.message !== '暂无复盘历史' && metaAnalysis.uncertainRate > 0.5) {
      limitations.push({ area: '决策确定性', desc: '不确定性较高，需要更多信息支持' });
    }

    return limitations;
  }

  _assessGrowth() {
    const health = this._bs._calculateHealth();
    const lessonStats = this._bs.lessonLibrary.getStats();
    return {
      healthScore: health.score, healthLevel: health.level,
      lessonsGained: lessonStats.total, lessonsApplied: lessonStats.applied,
      decisionsMade: this._bs.state.decisionCount, trend: this._calculateGrowthTrend()
    };
  }

  _calculateGrowthTrend() {
    const _lessonStats = this._bs.lessonLibrary.getStats();
    const recent = this._bs.lessonLibrary.lessons.slice(-5);
    if (recent.length === 0) {return 'unknown';}
    const recentDays = (Date.now() - new Date(recent[0].date).getTime()) / (1000 * 60 * 60 * 24);
    if (recentDays < 1 && recent.length >= 3) {return 'accelerating';}
    if (recentDays < 7 && recent.length >= 1) {return 'growing';}
    if (recentDays < 30) {return 'stable';}
    return 'slowing';
  }
}

module.exports = { IntrospectionEngine };
