class WorkflowOptimizer {
  constructor(options = {}) {
    this.history = [];
    this.maxHistory = options.maxHistory || 1000;
    this.learningRate = options.learningRate || 0.1;
    this.discountFactor = options.discountFactor || 0.9;
    this.explorationRate = options.explorationRate || 0.2;
    this.minExploration = options.minExploration || 0.05;
    this.explorationDecay = options.explorationDecay || 0.995;
    this.qTable = new Map();
    this.stateActionPairs = new Map();
    this._totalEpisodes = 0;
  }

  recordExecution(execution) {
    const episode = {
      id: execution.id,
      workflowId: execution.workflowId,
      steps: execution.steps.map(s => ({
        agent: s.agent,
        task: s.task,
        status: s.status,
        duration: (s.endTime || Date.now()) - (s.startTime || Date.now())
      })),
      status: execution.status,
      totalDuration: (execution.completedAt || Date.now()) - execution.startedAt,
      timestamp: Date.now()
    };

    const reward = this._calculateReward(episode);
    episode.reward = reward;

    this.history.push(episode);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    this._updateQTable(episode);
    this._totalEpisodes++;

    this.explorationRate = Math.max(
      this.minExploration,
      this.explorationRate * this.explorationDecay
    );

    return { episode, reward };
  }

  _calculateReward(episode) {
    let reward = 0;

    if (episode.status === 'completed') {
      reward += 100;
    } else if (episode.status === 'failed') {
      reward -= 50;
    }

    if (episode.steps.length === 0) {
      return reward;
    }

    const avgDuration = episode.steps.reduce((s, step) => s + step.duration, 0) / episode.steps.length;
    if (avgDuration < 2000) {
      reward += 20;
    } else if (avgDuration > 10000) {
      reward -= 20;
    }

    const successRate = episode.steps.filter(s => s.status === 'completed').length / episode.steps.length;
    reward += successRate * 30;

    return reward;
  }

  _getStateKey(workflowId, stepIndex) {
    return `${workflowId}:${stepIndex}`;
  }

  _getActionKey(agent, task) {
    return `${agent}:${task}`;
  }

  _updateQTable(episode) {
    const steps = episode.steps;
    const reward = episode.reward;

    for (let i = 0; i < steps.length; i++) {
      const stateKey = this._getStateKey(episode.workflowId, i);
      const actionKey = this._getActionKey(steps[i].agent, steps[i].task);

      if (!this.qTable.has(stateKey)) {
        this.qTable.set(stateKey, new Map());
      }

      const stateQ = this.qTable.get(stateKey);
      const currentQ = stateQ.get(actionKey) || 0;

      const nextReward = i < steps.length - 1 ? 0 : reward;
      const nextMaxQ = this._getMaxQ(episode.workflowId, i + 1);

      const newQ = currentQ + this.learningRate * (
        nextReward + this.discountFactor * nextMaxQ - currentQ
      );

      stateQ.set(actionKey, newQ);

      const pairKey = `${stateKey}:${actionKey}`;
      if (!this.stateActionPairs.has(pairKey)) {
        this.stateActionPairs.set(pairKey, { count: 0, totalReward: 0 });
      }
      const pair = this.stateActionPairs.get(pairKey);
      pair.count++;
      pair.totalReward += reward;
    }
  }

  _getMaxQ(workflowId, stepIndex) {
    const stateKey = this._getStateKey(workflowId, stepIndex);
    const stateQ = this.qTable.get(stateKey);

    if (!stateQ || stateQ.size === 0) return 0;

    return Math.max(...stateQ.values());
  }

  getOptimalAction(workflowId, stepIndex, availableActions) {
    const stateKey = this._getStateKey(workflowId, stepIndex);
    const stateQ = this.qTable.get(stateKey);

    if (!stateQ || stateQ.size === 0 || Math.random() < this.explorationRate) {
      return availableActions[Math.floor(Math.random() * availableActions.length)];
    }

    let bestAction = null;
    let bestQ = -Infinity;

    for (const action of availableActions) {
      const actionKey = this._getActionKey(action.agent, action.task);
      const q = stateQ.get(actionKey) || 0;

      if (q > bestQ) {
        bestQ = q;
        bestAction = action;
      }
    }

    return bestAction || availableActions[0];
  }

  optimizeWorkflow(workflowId, steps) {
    const optimized = [];

    for (let i = 0; i < steps.length; i++) {
      const alternatives = this._getAlternatives(workflowId, i, steps[i]);

      if (alternatives.length > 1) {
        const best = this.getOptimalAction(workflowId, i, alternatives);
        optimized.push(best);
      } else {
        optimized.push(steps[i]);
      }
    }

    return optimized;
  }

  _getAlternatives(workflowId, stepIndex, currentStep) {
    const alternatives = [currentStep];

    for (const [pairKey, stats] of this.stateActionPairs) {
      const [wfId, idx, agent, task] = pairKey.split(':');

      if (wfId === workflowId && parseInt(idx) === stepIndex) {
        if (agent !== currentStep.agent || task !== currentStep.task) {
          alternatives.push({ agent, task, avgReward: stats.totalReward / stats.count });
        }
      }
    }

    alternatives.sort((a, b) => (b.avgReward || 0) - (a.avgReward || 0));

    return alternatives.slice(0, 5);
  }

  getWorkflowInsights(workflowId) {
    const episodes = this.history.filter(e => e.workflowId === workflowId);

    if (episodes.length === 0) {
      return { workflowId, episodes: 0, insights: [] };
    }

    const completed = episodes.filter(e => e.status === 'completed');
    const avgDuration = episodes.reduce((s, e) => s + e.totalDuration, 0) / episodes.length;
    const avgReward = episodes.reduce((s, e) => s + e.reward, 0) / episodes.length;

    const bottlenecks = [];
    const stepStats = {};

    for (const episode of episodes) {
      for (const step of episode.steps) {
        const key = `${step.agent}:${step.task}`;
        if (!stepStats[key]) {
          stepStats[key] = { count: 0, totalDuration: 0, successes: 0 };
        }
        stepStats[key].count++;
        stepStats[key].totalDuration += step.duration;
        if (step.status === 'completed') stepStats[key].successes++;
      }
    }

    for (const [key, stats] of Object.entries(stepStats)) {
      const avgDur = stats.totalDuration / stats.count;
      const successRate = stats.successes / stats.count;

      if (avgDur > 5000 || successRate < 0.8) {
        bottlenecks.push({
          step: key,
          avgDuration: avgDur.toFixed(0) + 'ms',
          successRate: (successRate * 100).toFixed(1) + '%'
        });
      }
    }

    return {
      workflowId,
      episodes: episodes.length,
      completed: completed.length,
      successRate: (completed.length / episodes.length * 100).toFixed(1) + '%',
      avgDuration: avgDuration.toFixed(0) + 'ms',
      avgReward: avgReward.toFixed(2),
      explorationRate: (this.explorationRate * 100).toFixed(1) + '%',
      bottlenecks,
      qTableSize: this.qTable.size
    };
  }

  getRecommendations(workflowId) {
    const insights = this.getWorkflowInsights(workflowId);
    const recommendations = [];

    if (insights.bottlenecks.length > 0) {
      for (const bottleneck of insights.bottlenecks) {
        recommendations.push({
          type: 'bottleneck',
          step: bottleneck.step,
          suggestion: `步骤 ${bottleneck.step} 是瓶颈 (平均 ${bottleneck.avgDuration})，考虑并行化或替换Agent`
        });
      }
    }

    if (parseFloat(insights.successRate) < 90) {
      recommendations.push({
        type: 'reliability',
        suggestion: `成功率较低 (${insights.successRate})，建议增加重试机制或检查失败原因`
      });
    }

    const optimalSteps = this.optimizeWorkflow(workflowId, []);
    if (optimalSteps.length > 0) {
      recommendations.push({
        type: 'optimization',
        suggestion: '根据历史数据，以下Agent组合表现更好：' +
          optimalSteps.map(s => `${s.agent}(${s.task})`).join(' → ')
      });
    }

    return recommendations;
  }

  getStats() {
    return {
      episodes: this._totalEpisodes,
      historySize: this.history.length,
      qTableSize: this.qTable.size,
      stateActionPairs: this.stateActionPairs.size,
      explorationRate: this.explorationRate,
      avgReward: this.history.length > 0
        ? (this.history.reduce((s, e) => s + e.reward, 0) / this.history.length).toFixed(2)
        : '0'
    };
  }

  destroy() {
    this.history = [];
    this.qTable.clear();
    this.stateActionPairs.clear();
  }
}

module.exports = { WorkflowOptimizer };
