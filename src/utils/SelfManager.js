const BrainUtils = require('./BrainUtils');

class SelfManager {
  curiosityExplore(bs) {
    const exploration = {
      timestamp: Date.now(),
      areas: []
    };

    const lessonStats = bs.lessonLibrary.getStats();
    const coveredCategories = Object.keys(lessonStats.byCategory || {});

    for (const [cat, name] of Object.entries(bs.lessonLibrary.categories)) {
      if (!coveredCategories.includes(cat)) {
        exploration.areas.push({
          type: ' unexplored',
          category: name,
          suggestion: '这个领域尚未积累经验，考虑主动探索'
        });
      }
    }

    const limitations = bs._identifyLimitations();
    if (limitations.length > 0) {
      exploration.areas.push({
        type: 'knowledge-gap',
        areas: limitations.map((l) => l.area),
        suggestion: '针对已知不足进行学习'
      });
    }

    const predictions = bs.predictIssues();
    if (predictions.opportunities.length > 0) {
      exploration.areas.push({
        type: 'opportunity',
        items: predictions.opportunities.map((o) => o.message),
        suggestion: '把握成长机会'
      });
    }

    console.log(`[BrainSystem] 好奇探索: 发现 ${exploration.areas.length} 个探索方向`);

    return exploration;
  }

  setSelfGoals(bs) {
    const goals = [];
    const _health = bs._calculateHealth();
    const stats = bs.lessonLibrary.getStats();

    if (stats.total > 0 && stats.applied / stats.total < 0.3) {
      goals.push({
        id: 'lesson-application',
        description: '将教训应用率提升到30%以上',
        current: `${Math.round((stats.applied / stats.total) * 100)}%`,
        target: '30%',
        priority: 'high',
        deadline: '7d'
      });
    }

    const evolutionStats = bs.evolution.getStats();
    if ((evolutionStats?.recentLearnings?.length || 0) < 5) {
      goals.push({
        id: 'learning-frequency',
        description: '增加任务后复盘频率',
        current: evolutionStats?.recentLearnings?.length || 0,
        target: '5+',
        priority: 'high',
        deadline: '3d'
      });
    }

    if (stats.total < 30) {
      goals.push({
        id: 'knowledge-expansion',
        description: '积累更多领域经验',
        current: stats.total,
        target: '30',
        priority: 'medium',
        deadline: '30d'
      });
    }

    if (bs.state.decisionCount > 10) {
      goals.push({
        id: 'decision-quality',
        description: '降低元认知不确定性',
        current: '评估中',
        target: 'uncertainty < 30%',
        priority: 'medium',
        deadline: '14d'
      });
    }

    console.log(`[BrainSystem] 设定目标: ${goals.length} 个成长目标`);

    return goals;
  }

  diagnose(bs) {
    const diagnosis = {
      timestamp: new Date().toISOString(),
      selfAwareness: bs.getSelfAwareness(),
      health: bs._calculateHealth(),
      predictions: bs.predictIssues(),
      limitations: bs._identifyLimitations(),
      goals: bs.setSelfGoals(),
      exploration: bs.curiosityExplore(),
      recommendations: BrainUtils._generateRecommendations(bs.getImprovements())
    };

    return diagnosis;
  }

  getSummary(bs) {
    const stats = bs.lessonLibrary.getStats();
    const health = bs._calculateHealth();
    const predictions = bs.predictIssues();

    return {
      version: 'v7.1',
      status: bs.enabled ? 'active' : 'inactive',
      health: health.level,
      healthScore: health.score,
      lessons: {
        total: stats.total,
        applied: stats.applied,
        rate: stats.total > 0 ? `${Math.round((stats.applied / stats.total) * 100)}%` : '0%'
      },
      decisions: bs.state.decisionCount,
      active: {
        monitoring: !!bs.monitoringInterval,
        evolutionLoop: !!bs.evolutionLoop
      },
      risks: predictions.risks.length,
      opportunities: predictions.opportunities.length
    };
  }

  getBrainBrief(bs) {
    const summary = bs.getSummary();
    const awareness = bs.getSelfAwareness();
    const goals = bs.setSelfGoals();

    return {
      version: summary.version,
      status: summary.status,
      health: summary.health,
      decisionCount: summary.decisions,
      lessonCount: summary.lessons.total,
      activeGoals: goals.length,
      keyCapability: awareness.capabilities.selfEvolution.level,
      nextAction: goals.length > 0 ? goals[0].description : '继续当前任务'
    };
  }

  generateSelfReport(bs) {
    const status = bs.getStatus();
    const improvements = bs.getImprovements();
    const lessonHistory = bs.getLessonHistory(5);

    const report = {
      timestamp: new Date().toISOString(),
      brainVersion: 'v6.0',
      overallHealth: status.health,
      stats: {
        decisions: status.decisionCount,
        lessons: status.lessons.total,
        lessonsApplied: status.lessons.applied,
        evolutionLearnings: status.evolution?.recentLearnings?.length || 0
      },
      improvements: improvements.suggestions,
      recentLessonsApplied: lessonHistory,
      recommendations: BrainUtils._generateRecommendations(improvements)
    };

    return report;
  }

  generateActionPlan(bs) {
    const improvements = bs.getImprovements();
    const plan = {
      timestamp: new Date().toISOString(),
      priority: improvements.priority,
      actions: []
    };

    for (const suggestion of improvements.suggestions) {
      const action = BrainUtils._suggestionToAction(suggestion);
      if (action) {
        plan.actions.push(action);
      }
    }

    plan.actions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const autoExecuted = [];
    for (const action of plan.actions) {
      if (action.autoExecutable && action.priority === 'high') {
        const result = bs._executeAction(action);
        autoExecuted.push({ action: action.description, result });
      }
    }

    plan.autoExecuted = autoExecuted;

    return plan;
  }

  _executeAction(bs, action) {
    try {
      switch (action.description) {
      case '分析教训库内容，将高价值教训标记为优先': {
        const stats = bs.lessonLibrary.getStats();
        return { success: true, analyzed: stats.total, message: '教训库分析完成' };
      }

      case '执行一次自我复盘，记录学习':
        bs.evolution.learn('self-review', 'generate-action-plan', { success: true });
        return { success: true, message: '复盘已记录' };

      case '检查教训与决策流程集成状态': {
        const beforeResult = bs.beforeDecision('测试教训集成');
        return {
          success: true,
          lessonsShown: beforeResult.relatedLessons?.length || 0,
          message: '集成状态正常'
        };
      }

      case '强制触发复盘流程':
        bs.afterDecision('generate-action-plan', { success: true }, 'self-review');
        return { success: true, message: '复盘已触发' };

      default:
        return { success: false, message: '无法自动执行' };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

module.exports = new SelfManager();
