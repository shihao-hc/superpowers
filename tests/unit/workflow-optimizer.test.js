const { WorkflowOptimizer } = require('../../src/agent/WorkflowOptimizer');

describe('WorkflowOptimizer', () => {
  let opt;

  beforeEach(() => {
    opt = new WorkflowOptimizer({ explorationRate: 0, learningRate: 0.1, discountFactor: 0.9, minExploration: 0 });
  });

  const makeStep = (agent, task, status = 'completed', duration = 500) => ({
    agent, task, status, startTime: 1000, endTime: 1000 + duration
  });

  const makeExecution = (id, workflowId, steps, execStatus = 'completed') => ({
    id, workflowId, steps, status: execStatus,
    startedAt: 1000,
    completedAt: 1000 + steps.reduce((s, st) => s + ((st.endTime || 1000) - (st.startTime || 1000)), 0)
  });

  describe('constructor', () => {
    it('sets default values', () => {
      const d = new WorkflowOptimizer();
      expect(d.maxHistory).toBe(1000);
      expect(d.learningRate).toBe(0.1);
      expect(d.discountFactor).toBe(0.9);
      expect(d.explorationRate).toBe(0.2);
      expect(d.minExploration).toBe(0.05);
      expect(d.explorationDecay).toBe(0.995);
      expect(d.history).toEqual([]);
      expect(d.qTable).toBeInstanceOf(Map);
      expect(d.stateActionPairs).toBeInstanceOf(Map);
      expect(d._totalEpisodes).toBe(0);
    });

    it('accepts custom options', () => {
      const w = new WorkflowOptimizer({ maxHistory: 100, learningRate: 0.2, explorationRate: 0.3 });
      expect(w.maxHistory).toBe(100);
      expect(w.learningRate).toBe(0.2);
      expect(w.explorationRate).toBe(0.3);
    });

    it('accepts all custom options', () => {
      const w = new WorkflowOptimizer({ maxHistory: 50, learningRate: 0.3, discountFactor: 0.8, explorationRate: 0.5, minExploration: 0.1, explorationDecay: 0.99 });
      expect(w.discountFactor).toBe(0.8);
      expect(w.minExploration).toBe(0.1);
      expect(w.explorationDecay).toBe(0.99);
    });
  });

  describe('_calculateReward', () => {
    it('gives +100 for completed status', () => {
      const r = opt._calculateReward({ status: 'completed', steps: [] });
      expect(r).toBe(100);
    });

    it('gives -50 for failed status', () => {
      const r = opt._calculateReward({ status: 'failed', steps: [] });
      expect(r).toBe(-50);
    });

    it('adds +20 for fast average duration (< 2000ms)', () => {
      const r = opt._calculateReward({ status: 'completed', steps: [{ status: 'completed', duration: 500 }, { status: 'completed', duration: 1000 }] });
      expect(r).toBe(100 + 20 + 30);
    });

    it('subtracts 20 for slow average duration (> 10000ms)', () => {
      const r = opt._calculateReward({ status: 'completed', steps: [{ status: 'completed', duration: 15000 }, { status: 'completed', duration: 12000 }] });
      expect(r).toBe(100 - 20 + 30);
    });

    it('adds reward proportional to success rate', () => {
      const r = opt._calculateReward({ status: 'completed', steps: [{ status: 'completed', duration: 500 }, { status: 'failed', duration: 1000 }] });
      expect(r).toBe(100 + 20 + 15);
    });

    it('handles other statuses', () => {
      const r = opt._calculateReward({ status: 'running', steps: [makeStep('a', 't')] });
      expect(r).toBeGreaterThan(-50);
      expect(r).toBeLessThan(100);
    });

    it('handles empty steps', () => {
      const r = opt._calculateReward({ status: 'completed', steps: [] });
      expect(r).toBe(100);
    });
  });

  describe('_getStateKey / _getActionKey', () => {
    it('generates correct keys', () => {
      expect(opt._getStateKey('wf1', 0)).toBe('wf1:0');
      expect(opt._getActionKey('agentA', 'task1')).toBe('agentA:task1');
    });
  });

  describe('recordExecution', () => {
    it('creates episode and updates Q-table', () => {
      const steps = [makeStep('agentA', 'task1'), makeStep('agentB', 'task2')];
      const exec = makeExecution('e1', 'wf1', steps);
      const result = opt.recordExecution(exec);
      expect(result.episode).toBeDefined();
      expect(result.episode.id).toBe('e1');
      expect(result.reward).toBeGreaterThan(0);
      expect(opt.history).toHaveLength(1);
      expect(opt._totalEpisodes).toBe(1);
      expect(opt.qTable.size).toBe(2);
    });

    it('decays exploration rate', () => {
      opt.explorationRate = 0.2;
      opt.recordExecution(makeExecution('e1', 'wf1', [makeStep('a', 't')]));
      expect(opt.explorationRate).toBeGreaterThan(0.05);
      expect(opt.explorationRate).toBeLessThan(0.2);
    });

    it('clamps exploration rate to minExploration', () => {
      opt.explorationRate = 0.051;
      opt.minExploration = 0.05;
      for (let i = 0; i < 100; i++) {
        opt.recordExecution(makeExecution(`e${i}`, 'wf1', [makeStep('a', 't')]));
      }
      expect(opt.explorationRate).toBe(0.05);
    });

    it('trims history when over maxHistory', () => {
      opt.maxHistory = 3;
      for (let i = 0; i < 5; i++) {
        opt.recordExecution(makeExecution(`e${i}`, 'wf1', [makeStep('a', 't')]));
      }
      expect(opt.history).toHaveLength(3);
    });

    it('handles execution without timestamps', () => {
      const exec = { id: 'e1', workflowId: 'wf', steps: [{ agent: 'a', task: 't', status: 'completed' }], status: 'completed', startedAt: 100 };
      const result = opt.recordExecution(exec);
      expect(result.episode).toBeDefined();
      expect(result.episode.totalDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('_updateQTable', () => {
    it('updates Q values for each step', () => {
      const steps = [makeStep('a', 't1'), makeStep('b', 't2')];
      opt.recordExecution(makeExecution('e1', 'wf1', steps));
      const state0 = opt.qTable.get('wf1:0');
      expect(state0).toBeInstanceOf(Map);
      const state1 = opt.qTable.get('wf1:1');
      expect(state1).toBeInstanceOf(Map);
      expect(state1.get('b:t2')).toBeGreaterThan(0);
    });

    it('tracks state-action pair counts', () => {
      opt.recordExecution(makeExecution('e1', 'wf1', [makeStep('a', 't')]));
      const pairKey = 'wf1:0:a:t';
      const pair = opt.stateActionPairs.get(pairKey);
      expect(pair).toBeDefined();
      expect(pair.count).toBe(1);
      expect(pair.totalReward).toBeGreaterThan(0);
    });

    it('increments state-action pair count on repeated visits', () => {
      opt.recordExecution(makeExecution('e1', 'wf1', [makeStep('a', 't')]));
      opt.recordExecution(makeExecution('e1', 'wf1', [makeStep('a', 't')]));
      expect(opt.stateActionPairs.get('wf1:0:a:t').count).toBe(2);
    });
  });

  describe('_getMaxQ', () => {
    it('returns 0 when state has no Q values', () => {
      expect(opt._getMaxQ('unknown', 0)).toBe(0);
    });

    it('returns max Q value for known state', () => {
      opt.recordExecution(makeExecution('e1', 'wf', [makeStep('a', 't')]));
      const maxQ = opt._getMaxQ('wf', 0);
      expect(maxQ).toBeGreaterThan(0);
    });
  });

  describe('getOptimalAction', () => {
    beforeEach(() => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('returns random action when exploring', () => {
      opt.explorationRate = 1;
      const actions = [{ agent: 'a', task: 't1' }, { agent: 'b', task: 't2' }];
      jest.spyOn(Math, 'random').mockReturnValue(0);
      const chosen = opt.getOptimalAction('wf', 0, actions);
      expect(actions).toContainEqual(chosen);
    });

    it('returns best action when exploiting', () => {
      opt.explorationRate = 0;
      opt.recordExecution(makeExecution('e1', 'wf', [makeStep('good', 'task')]));
      opt.recordExecution(makeExecution('e2', 'wf', [makeStep('bad', 'task')]));
      const actions = [{ agent: 'good', task: 'task' }, { agent: 'bad', task: 'task' }];
      const chosen = opt.getOptimalAction('wf', 0, actions);
      expect(chosen.agent).toBe('good');
    });

    it('returns first available action when state is unknown', () => {
      opt.explorationRate = 0;
      const actions = [{ agent: 'a', task: 't' }];
      expect(opt.getOptimalAction('unknown', 0, actions)).toEqual(actions[0]);
    });

    it('returns undefined with empty available actions', () => {
      opt.explorationRate = 0;
      opt.qTable.set('wf:0', new Map([['a:t', 10]]));
      expect(opt.getOptimalAction('wf', 0, [])).toBeUndefined();
    });
  });

  describe('optimizeWorkflow', () => {
    it('returns same steps when no alternatives exist', () => {
      const steps = [{ agent: 'a', task: 't' }];
      const result = opt.optimizeWorkflow('wf', steps);
      expect(result).toEqual(steps);
    });

    it('selects best alternative when multiple options exist', () => {
      opt.recordExecution(makeExecution('e1', 'wf', [makeStep('better', 'task')]));
      opt.stateActionPairs.set('wf:0:worse:task', { count: 10, totalReward: 100 });
      const steps = [{ agent: 'worse', task: 'task' }];
      const result = opt.optimizeWorkflow('wf', steps);
      expect(result[0].agent).toBe('better');
    });
  });

  describe('_getAlternatives', () => {
    it('returns current step as default', () => {
      const alts = opt._getAlternatives('wf', 0, { agent: 'a', task: 't' });
      expect(alts).toHaveLength(1);
      expect(alts[0].agent).toBe('a');
    });

    it('includes alternatives from stateActionPairs', () => {
      opt.stateActionPairs.set('wf:0:b:t2', { count: 5, totalReward: 100 });
      const alts = opt._getAlternatives('wf', 0, { agent: 'a', task: 't1' });
      expect(alts.length).toBeGreaterThanOrEqual(2);
      expect(alts.some(a => a.agent === 'b')).toBe(true);
    });

    it('ignores pairs from unrelated workflows', () => {
      opt.stateActionPairs.set('other:0:b:t2', { count: 5, totalReward: 100 });
      opt.stateActionPairs.set('wf:1:b:t2', { count: 5, totalReward: 100 });
      const alts = opt._getAlternatives('wf', 0, { agent: 'a', task: 't1' });
      expect(alts).toHaveLength(1);
    });

    it('sorts alternatives by avgReward descending', () => {
      opt.stateActionPairs.set('wf:0:b:t2', { count: 5, totalReward: 400 });
      opt.stateActionPairs.set('wf:0:c:t3', { count: 5, totalReward: 100 });
      const alts = opt._getAlternatives('wf', 0, { agent: 'a', task: 't1' });
      const bIdx = alts.findIndex(a => a.agent === 'b');
      const cIdx = alts.findIndex(a => a.agent === 'c');
      expect(bIdx).toBeLessThan(cIdx);
    });

    it('limits alternatives to 5', () => {
      for (let i = 0; i < 10; i++) {
        opt.stateActionPairs.set(`wf:0:agent${i}:task`, { count: 1, totalReward: 50 });
      }
      const alts = opt._getAlternatives('wf', 0, { agent: 'a', task: 't' });
      expect(alts.length).toBeLessThanOrEqual(5);
    });

    it('sorts alternatives with undefined avgReward', () => {
      opt.stateActionPairs.set('wf:0:b:t2', { count: 1, totalReward: 0 });
      const alts = opt._getAlternatives('wf', 0, { agent: 'a', task: 't1' });
      expect(alts[0].agent).toBe('a');
    });
  });

  describe('getWorkflowInsights', () => {
    it('returns empty insights when no episodes', () => {
      const insights = opt.getWorkflowInsights('unknown');
      expect(insights.episodes).toBe(0);
      expect(insights.insights).toEqual([]);
    });

    it('returns workflow metrics with bottlenecks', () => {
      opt.recordExecution(makeExecution('e1', 'wf', [makeStep('slow', 'task', 'completed', 10000)]));
      opt.recordExecution(makeExecution('e1', 'wf', [makeStep('slow', 'task', 'completed', 10000)]));
      const insights = opt.getWorkflowInsights('wf');
      expect(insights.episodes).toBe(2);
      expect(insights.completed).toBe(2);
      expect(insights.bottlenecks.length).toBeGreaterThan(0);
      expect(insights.bottlenecks[0].step).toBe('slow:task');
    });

    it('identifies bottlenecks by low success rate', () => {
      opt.recordExecution(makeExecution('e1', 'wf', [makeStep('fragile', 'task', 'failed')]));
      opt.recordExecution(makeExecution('e2', 'wf', [makeStep('fragile', 'task', 'completed')]));
      const insights = opt.getWorkflowInsights('wf');
      const bottle = insights.bottlenecks.find(b => b.step === 'fragile:task');
      expect(bottle).toBeDefined();
      expect(bottle.successRate).toBe('50.0%');
    });

    it('handles workflows with varying success', () => {
      opt.recordExecution(makeExecution('e1', 'wf', [makeStep('a', 't', 'completed')], 'completed'));
      opt.recordExecution(makeExecution('e2', 'wf', [makeStep('a', 't', 'failed')], 'failed'));
      const insights = opt.getWorkflowInsights('wf');
      expect(insights.successRate).toBe('50.0%');
    });
  });

  describe('getRecommendations', () => {
    it('returns bottleneck recommendations', () => {
      opt.recordExecution(makeExecution('e1', 'wf', [makeStep('slow', 'task', 'completed', 10000)]));
      const recs = opt.getRecommendations('wf');
      expect(recs.some(r => r.type === 'bottleneck')).toBe(true);
    });

    it('returns reliability recommendation when success rate < 90%', () => {
      for (let i = 0; i < 5; i++) {
        const execStatus = i < 2 ? 'completed' : 'failed';
        opt.recordExecution(makeExecution(`e${i}`, 'wf', [makeStep('a', 't', execStatus)], execStatus));
      }
      const recs = opt.getRecommendations('wf');
      expect(recs.some(r => r.type === 'reliability')).toBe(true);
    });

    it('returns optimization recommendation when alternatives exist', () => {
      opt.recordExecution(makeExecution('e1', 'wf', [makeStep('a', 'task')]));
      opt.stateActionPairs.set('wf:0:b:task', { count: 5, totalReward: 500 });
      const recs = opt.getRecommendations('wf');
      expect(recs.some(r => r.type === 'optimization')).toBe(true);
    });

    it('returns empty when workflow has no history', () => {
      const recs = opt.getRecommendations('empty');
      expect(recs).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('returns all stats fields', () => {
      opt.explorationRate = 0.2;
      opt.recordExecution(makeExecution('e1', 'wf', [makeStep('a', 't')]));
      const stats = opt.getStats();
      expect(stats.episodes).toBe(1);
      expect(stats.historySize).toBe(1);
      expect(stats.qTableSize).toBe(1);
      expect(stats.stateActionPairs).toBe(1);
      expect(stats.explorationRate).toBeGreaterThan(0);
      expect(stats.avgReward).not.toBe('0');
    });

    it('returns 0 avg reward when no history', () => {
      const stats = opt.getStats();
      expect(stats.avgReward).toBe('0');
    });
  });

  describe('destroy', () => {
    it('clears all data', () => {
      opt.recordExecution(makeExecution('e1', 'wf', [makeStep('a', 't')]));
      opt.destroy();
      expect(opt.history).toEqual([]);
      expect(opt.qTable.size).toBe(0);
      expect(opt.stateActionPairs.size).toBe(0);
    });
  });
});
