class EvolutionCycle {
  predictIssues(bs) {
    const predictions = {
      risks: [],
      opportunities: []
    };

    const stats = bs.lessonLibrary.getStats();
    if (stats.total > 10 && stats.applied / stats.total < 0.3) {
      predictions.risks.push({
        type: 'low-lesson-usage',
        probability: 0.7,
        message: '教训应用率低可能导致重复犯错',
        suggestion: '增强教训调用频率或在决策前强制查询'
      });
    }

    if (bs.state.decisionCount > 20) {
      predictions.opportunities.push({
        type: 'pattern-extraction',
        probability: 0.8,
        message: '决策次数足够，可提取通用模式',
        suggestion: '调用 crossTaskLearning 分析近期决策'
      });
    }

    const evolutionStats = bs.evolution.getStats();
    if (evolutionStats?.recentLearnings?.length === 0) {
      predictions.risks.push({
        type: 'no-learning',
        probability: 0.6,
        message: '近期无学习记录，可能错失改进机会',
        suggestion: '触发一次深度复盘'
      });
    }

    return predictions;
  }

  startEvolutionLoop(bs, intervalMs = 300000) {
    if (bs.evolutionLoop) {
      console.log('[BrainSystem] 进化循环已在运行');
      return;
    }

    bs.evolutionLoop = setInterval(() => {
      bs._runEvolutionCycle();
    }, intervalMs);

    console.log(`[BrainSystem] 自我进化循环已启动 (间隔: ${intervalMs}ms)`);
    bs._runEvolutionCycle();
  }

  stopEvolutionLoop(bs) {
    if (bs.evolutionLoop) {
      clearInterval(bs.evolutionLoop);
      bs.evolutionLoop = null;
      console.log('[BrainSystem] 进化循环已停止');
    }
  }

  _runEvolutionCycle(bs) {
    const cycle = {
      startTime: Date.now(),
      steps: []
    };

    console.log('[BrainSystem] ═══ 进化周期开始 ═══');

    const monitorResult = bs._selfMonitor();
    cycle.steps.push({ step: 'monitor', result: monitorResult.summary });

    const predictions = bs.predictIssues();
    cycle.steps.push({ step: 'predict', result: `${predictions.risks.length}风险, ${predictions.opportunities.length}机会` });

    const actionPlan = bs.generateActionPlan();
    cycle.steps.push({ step: 'plan', result: `${actionPlan.actions.length}行动, ${actionPlan.autoExecuted.length}已执行` });

    for (const executed of actionPlan.autoExecuted) {
      console.log(`  ✓ ${executed.action}: ${executed.result.success ? '成功' : '失败'}`);
    }

    bs.evolution.learn('evolution-cycle', 'complete', {
      monitor: monitorResult.summary,
      predictions: predictions.risks.length,
      actionsExecuted: actionPlan.autoExecuted.length
    });

    cycle.endTime = Date.now();
    cycle.duration = cycle.endTime - cycle.startTime;
    cycle.steps.push({ step: 'complete', result: `${cycle.duration}ms` });

    console.log(`[BrainSystem] ═══ 进化周期完成 (${cycle.duration}ms) ═══`);

    return cycle;
  }
}

module.exports = new EvolutionCycle();
