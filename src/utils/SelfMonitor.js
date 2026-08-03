const BrainUtils = require('./BrainUtils');

class SelfMonitor {
  constructor(brainSystem) {
    this._bs = brainSystem;
  }

  _lesson() { return this._bs.lessonLibrary; }
  _evolution() { return this._bs.evolution; }
  _tools() { return this._bs.tools; }
  _meta() { return this._bs.metaCognition; }
  _state() { return this._bs.state; }

  get selfCheckInterval() { return this._bs.selfCheckInterval; }
  set selfCheckInterval(v) { this._bs.selfCheckInterval = v; }
  get monitoringInterval() { return this._bs.monitoringInterval; }
  set monitoringInterval(v) { this._bs.monitoringInterval = v; }

  _calculateHealth() {
    const health = {
      score: 0, level: 'unknown', metrics: {}, improvements: []
    };

    const lessonStats = this._lesson().getStats();
    const lessonAvailable = lessonStats.total > 0 ? 1 : 0;
    const lessonRate = lessonStats.total > 0 ? lessonStats.applied / lessonStats.total : 0;
    const lessonScore = lessonAvailable * 0.5 + lessonRate * 0.5;
    health.metrics.lessonLibrary = {
      score: lessonScore, total: lessonStats.total, applied: lessonStats.applied,
      rate: `${Math.round(lessonRate * 100)}%`, hasSystem: lessonAvailable === 1
    };

    if (lessonRate < 0.3 && lessonStats.total > 5) {
      health.improvements.push('教训应用率过低，建议检查教训是否与实际工作脱节');
    }

    const coreModules = ['metaCognition', 'thinking', 'evolution', 'tools', 'reverseThinking', 'lessonLibrary'];
    const activeModules = coreModules.filter((m) => this._bs[m]).length;
    const systemScore = activeModules / coreModules.length;
    health.metrics.systemReady = {
      score: systemScore, activeModules, totalModules: coreModules.length
    };

    let proactiveScore = 0;
    if (this.selfCheckInterval) {proactiveScore += 0.5;}
    if (this.monitoringInterval) {proactiveScore += 0.5;}
    health.metrics.proactive = {
      score: proactiveScore, selfCheck: !!this.selfCheckInterval, monitoring: !!this.monitoringInterval
    };

    const evolutionStats = this._evolution().getStats();
    const recentEvolution = evolutionStats?.recentLearnings?.length || 0;
    health.metrics.evolution = { score: Math.min(recentEvolution / 10, 1), recentLearnings: recentEvolution };

    const decisionCount = this._state().decisionCount;
    health.metrics.decisionDiversity = { score: Math.min(decisionCount / 20, 1), count: decisionCount };

    const weightedScore =
      health.metrics.lessonLibrary.score * 0.20 +
      health.metrics.systemReady.score * 0.20 +
      health.metrics.proactive.score * 0.20 +
      health.metrics.evolution.score * 0.20 +
      health.metrics.decisionDiversity.score * 0.20;

    health.score = Math.round(30 + weightedScore * 70);

    if (health.score >= 80) {health.level = 'excellent';}
    else if (health.score >= 60) {health.level = 'good';}
    else if (health.score >= 40) {health.level = 'fair';}
    else if (health.score >= 20) {health.level = 'needs-improvement';}
    else {health.level = 'critical';}

    return health;
  }

  startSelfMonitoring(intervalMs = 60000) {
    if (this.monitoringInterval) {
      console.log('[BrainSystem] 监控已启动');
      return;
    }
    this.monitoringInterval = setInterval(() => {
      this._selfMonitor();
    }, intervalMs);
    console.log(`[BrainSystem] 主动监控已启动 (间隔: ${intervalMs}ms)`);
    this._selfMonitor();
  }

  stopSelfMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('[BrainSystem] 监控已停止');
    }
  }

  _selfMonitor() {
    const monitor = { timestamp: Date.now(), checks: [] };

    const lessonStats = this._lesson().getStats();
    monitor.checks.push(BrainUtils._checkLessonHealth(lessonStats));
    monitor.checks.push(this._checkDecisionQuality());
    monitor.checks.push(this._checkEvolutionActivity());
    monitor.checks.push(this._checkToolEfficiency());
    monitor.checks.push(this._checkMetaCognitionStatus());

    const issues = monitor.checks.filter((c) => c.status === 'warning' || c.status === 'critical');
    if (issues.length > 0) {
      console.log(`[BrainSystem] 主动监控: 发现 ${issues.length} 个问题`);
      for (const issue of issues) {
        console.log(`  - ${issue.check}: ${issue.message}`);
      }
      this._autoFixIssues(issues);
    }

    monitor.issueCount = issues.length;
    monitor.summary = issues.length === 0 ? '正常' : `${issues.length}个问题待处理`;
    return monitor;
  }

  _checkDecisionQuality() {
    const check = { check: 'decision-quality', status: 'ok', score: 100, message: '正常', issues: [] };
    const decisionCount = this._state().decisionCount;
    const metaAnalysis = this._meta().analyzeHistory();
    if (decisionCount === 0) {
      check.status = 'warning'; check.score = 50; check.message = '尚无决策记录';
    } else if (metaAnalysis.uncertainRate > 0.6) {
      check.status = 'warning'; check.score = 40; check.message = '不确定性过高';
      check.issues.push('增加信息收集后再决策');
    }
    return check;
  }

  _checkEvolutionActivity() {
    const check = { check: 'evolution-activity', status: 'ok', score: 100, message: '正常', issues: [] };
    const evolutionStats = this._evolution().getStats();
    const recentCount = evolutionStats?.recentLearnings?.length || 0;
    if (recentCount === 0) {
      check.status = 'warning'; check.score = 30; check.message = '无近期学习';
      check.issues.push('建议增加任务后的复盘');
    } else if (recentCount < 3 && this._state().decisionCount > 10) {
      check.status = 'warning'; check.score = 50; check.message = '学习频率偏低';
      check.issues.push('决策多但学习少，注意提取经验');
    }
    return check;
  }

  _checkToolEfficiency() {
    const check = { check: 'tool-efficiency', status: 'ok', score: 100, message: '正常', issues: [] };
    const toolStats = this._tools().getStats();
    if (toolStats.usageCount === 0 && this._state().decisionCount > 5) {
      check.status = 'warning'; check.score = 40; check.message = '未使用工具';
      check.issues.push('考虑使用工具辅助决策');
    }
    return check;
  }

  _checkMetaCognitionStatus() {
    const check = { check: 'meta-status', status: 'ok', score: 100, message: '正常', issues: [] };
    const history = this._meta().history;
    if (history.length > 50) {
      check.status = 'warning'; check.score = 70; check.message = '复盘历史较长';
      check.issues.push('考虑压缩历史记录');
    }
    return check;
  }

  _autoFixIssues(issues) {
    for (const issue of issues) {
      try {
        switch (issue.check) {
        case 'lesson-health':
          if (issue.status === 'critical' && issue.issues.includes('教训未被使用，需要检查集成')) {
            this._bs.beforeDecision('health-check');
            console.log('[BrainSystem] 已尝试修复教训集成');
          }
          break;
        case 'evolution-activity':
          if (issue.issues.includes('建议增加任务后的复盘')) {
            this._bs.afterDecision('auto-monitor', { success: true }, 'self-check');
            console.log('[BrainSystem] 已触发自动复盘');
          }
          break;
        case 'meta-status':
          if (issue.issues.includes('考虑压缩历史记录')) {
            this._meta().history = this._meta().history.slice(-30);
            console.log('[BrainSystem] 已压缩复盘历史');
          }
          break;
        }
      } catch (e) {
        console.log(`[BrainSystem] 自动修复失败: ${e.message}`);
      }
    }
  }
}

module.exports = { SelfMonitor };
