/**
 * SelfCheckEngine - 自检与状态报告引擎
 *
 * 日常自检、主动建议、改进计划、模式分析、状态报告
 */

class SelfCheckEngine {
  constructor(bs) {
    this.bs = bs;
  }

  _autoStartDailyCheck() {
    const bs = this.bs;
    bs.selfCheckInterval = setInterval(() => {
      bs._runDailyCheck();
    }, 5 * 60 * 1000);

    bs.monitoringInterval = setInterval(() => {
      bs._selfMonitor();
    }, 10 * 60 * 1000);

    bs.state.lastSelfCheck = Date.now();
    console.log('[BrainSystem] ✓ 日常自检闭环已启动 (自检5分钟 + 监控10分钟)');
  }

  _runDailyCheck() {
    const bs = this.bs;
    const now = Date.now();
    bs.state.lastSelfCheck = now;

    const lessonStats = bs.lessonLibrary.getStats();
    const applicationRate = lessonStats.applied / lessonStats.total;

    if (applicationRate < 0.3 && lessonStats.unapplied > 0) {
      console.log(`[BrainSystem] ⚠️ 教训应用率低: ${Math.round(applicationRate * 100)}%`);

      const highPriority = bs.lessonLibrary.lessons
        .filter((l) => l.priority === 'high' && !l.applied)
        .slice(0, 1);

      if (highPriority.length > 0) {
        bs.lessonLibrary.markApplied(highPriority[0].id);
        console.log(`[BrainSystem] ✓ 自动应用教训: ${highPriority[0].lesson.substring(0, 30)}...`);
      }
    }

    if (bs.comprehensiveChecker) {
      bs.state.selfCheckCount = (bs.state.selfCheckCount || 0) + 1;
      if (bs.state.selfCheckCount % 10 === 0) {
        console.log('[BrainSystem] 📋 定期全方面检查触发...');
        bs.comprehensiveChecker.run().then((report) => {
          if (report.stats?.failed > 0) {
            console.log(`[BrainSystem] ⚠️ 全方面检查发现问题: ${report.stats.failed}项`);
          } else {
            console.log('[BrainSystem] ✅ 全方面检查通过');
          }
        }).catch((e) => {
          console.log(`[BrainSystem] 全方面检查跳过: ${e.message}`);
        });
      }
    } else {
      bs.state.selfCheckCount = (bs.state.selfCheckCount || 0) + 1;
    }

    if (bs.state.decisionCount === 0) {
      console.log('[BrainSystem] 📝 今日尚未有决策记录');
    }
  }

  getActiveSuggestions() {
    const bs = this.bs;
    const suggestions = [];
    const stats = bs.lessonLibrary.getStats();

    if (stats.applied / stats.total < 0.5 && stats.total > 10) {
      suggestions.push({
        type: 'improvement',
        priority: 'high',
        message: '教训应用率偏低，建议多触发决策流程让教训被应用',
        action: '调用beforeDecision和afterDecision'
      });
    }

    if (bs.state.decisionCount < 5) {
      suggestions.push({
        type: 'usage',
        priority: 'medium',
        message: '决策次数较少，大脑系统未充分利用',
        action: '多进行实际任务让系统参与决策'
      });
    }

    const inactiveModules = [];
    if (!bs.controller) {inactiveModules.push('控制器');}
    if (!bs.introspection) {inactiveModules.push('内省');}
    if (inactiveModules.length > 0) {
      suggestions.push({
        type: 'module',
        priority: 'low',
        message: `可选模块未激活: ${inactiveModules.join(', ')}`,
        action: '如有需求可启用这些模块'
      });
    }

    return suggestions;
  }

  ['主动Learn']() {
    const bs = this.bs;
    const learnings = [];

    if (bs.state.decisionCount > 0) {
      learnings.push({
        type: 'pattern',
        message: `本会话已有 ${bs.state.decisionCount} 次决策记录`,
        source: 'decision-history'
      });
    }

    if (bs.state.selfCheckCount > 0) {
      learnings.push({
        type: 'self-check',
        message: `已完成 ${bs.state.selfCheckCount} 次自检`,
        source: 'self-check'
      });
    }

    return learnings;
  }

  generateImprovementPlan() {
    const bs = this.bs;
    const plan = {
      timestamp: Date.now(),
      actions: [],
      reason: ''
    };

    const stats = bs.lessonLibrary.getStats();
    const health = bs._calculateHealth();

    if (health.score < 40) {
      plan.actions.push({
        priority: 1,
        action: '多使用大脑系统进行决策',
        reason: '提高决策次数改善健康度'
      });
    }

    if (stats.applied / stats.total < 0.5) {
      plan.actions.push({
        priority: 2,
        action: '调用beforeDecision触发教训弹出',
        reason: '提高教训应用率'
      });
    }

    if (!bs.selfCheckInterval) {
      plan.actions.push({
        priority: 3,
        action: '调用startSelfMonitoring启用主动监控',
        reason: '启用自动监控'
      });
    }

    plan.reason = `当前健康度: ${health.score}/100`;
    return plan;
  }

  analyzePatterns() {
    const bs = this.bs;
    const patterns = {
      decisionTopics: [],
      commonActions: [],
      timePatterns: [],
      insights: []
    };

    if (bs.state.lastContext) {
      patterns.decisionTopics.push(bs.state.lastContext);
    }

    if (bs.memory) {
      try {
        const recentMemories = bs.memory.getRecent(5);
        patterns.insights.push(`有 ${recentMemories.length} 条近期记忆`);
      } catch (e) {
        console.warn('[BrainSystem] Memory system unavailable:', e.message);
      }
    }

    patterns.insights.push('定期分析决策模式可以帮助AI更好地理解自己的行为');
    return patterns;
  }

  generateStatusReport() {
    const bs = this.bs;
    const health = bs._calculateHealth();
    const lessonStats = bs.lessonLibrary.getStats();

    return {
      timestamp: Date.now(),
      health: {
        score: health.score,
        level: health.level,
        metrics: Object.keys(health.metrics).map((k) => ({
          name: k,
          score: `${Math.round(health.metrics[k].score * 100)}%`
        }))
      },
      activity: {
        decisions: bs.state.decisionCount,
        selfChecks: bs.state.selfCheckCount || 0
      },
      lessons: {
        total: lessonStats.total,
        applied: lessonStats.applied,
        rate: `${Math.round(lessonStats.applied / lessonStats.total * 100)}%`
      },
      capabilities: {
        selfMonitoring: !!bs.selfCheckInterval,
        autoCheck: !!bs.monitoringInterval
      }
    };
  }

  getQuickStatus() {
    const bs = this.bs;
    const health = bs._calculateHealth();
    const stats = bs.lessonLibrary.getStats();

    const statusParts = [];

    if (health.score >= 80) {
      statusParts.push('状态优秀');
    } else if (health.score >= 60) {
      statusParts.push('状态良好');
    } else if (health.score >= 40) {
      statusParts.push('状态一般');
    } else {
      statusParts.push('需要改进');
    }

    statusParts.push(`教训应用${Math.round(stats.applied/stats.total*100)}%`);
    statusParts.push(`决策${bs.state.decisionCount}次`);

    return statusParts.join(' | ');
  }
}

module.exports = SelfCheckEngine;
