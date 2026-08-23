const { WorkflowOptimizer } = require('../../src/performance/WorkflowOptimizer');

function makeEngine() {
  return {
    compileExecutionPlan: jest.fn((id) => ({
      id,
      sortedNodes: ['node1', 'node2', 'node3'],
      parallelGroups: [
        { nodes: ['node1'] },
        { nodes: ['node2'] },
        { nodes: ['node3'] }
      ]
    })),
    getNode: jest.fn((nodeId) => ({ type: nodeId === 'node1' ? 'http_post' : 'compute' }))
  };
}

describe('WorkflowOptimizer (performance)', () => {
  let optimizer;
  let engine;

  beforeEach(() => {
    engine = makeEngine();
    optimizer = new WorkflowOptimizer();
    optimizer.setWorkflowEngine(engine);
  });

  describe('constructor', () => {
    it('sets defaults', () => {
      const opt = new WorkflowOptimizer();
      expect(opt.workflowEngine).toBeNull();
      expect(opt.compiledPlans.size).toBe(0);
      expect(opt.maxHistorySize).toBe(100);
      expect(opt.enablePreheating).toBe(true);
      expect(opt.maxCachedPlans).toBe(50);
      expect(opt.stats).toMatchObject({
        totalOptimizations: 0, cacheHits: 0, preheatCount: 0, avgCompilationTime: 0
      });
    });

    it('honors custom options', () => {
      const opt = new WorkflowOptimizer({ maxHistorySize: 5, enablePreheating: false, maxCachedPlans: 3 });
      expect(opt.maxHistorySize).toBe(5);
      expect(opt.enablePreheating).toBe(false);
      expect(opt.maxCachedPlans).toBe(3);
    });
  });

  describe('compileWorkflow', () => {
    it('throws when engine not set', () => {
      const opt = new WorkflowOptimizer();
      expect(() => opt.compileWorkflow('wf')).toThrow('Workflow engine not set');
    });

    it('throws for non-string workflowId', () => {
      expect(() => optimizer.compileWorkflow(123)).toThrow('workflowId must be a string or null');
    });

    it('throws for invalid workflowId characters', () => {
      expect(() => optimizer.compileWorkflow('bad id!')).toThrow('Invalid workflowId');
    });

    it('compiles a workflow and caches it', () => {
      const plan = optimizer.compileWorkflow('wf1');
      expect(plan.id).toBe('wf1');
      expect(plan.optimizationHints).toBeDefined();
      expect(plan.compilationTime).toBeGreaterThanOrEqual(0);
      expect(optimizer.compiledPlans.has('wf1')).toBe(true);
      expect(optimizer.stats.totalOptimizations).toBe(1);
    });

    it('uses default id when workflowId is null', () => {
      const plan = optimizer.compileWorkflow(null);
      expect(plan.id).toMatch(/^default_/);
    });

    it('returns cached plan on preheat hit', () => {
      optimizer.compileWorkflow('wf1');
      const second = optimizer.compileWorkflow('wf1');
      expect(second.id).toBe('wf1');
      expect(optimizer.stats.cacheHits).toBe(1);
    });

    it('evicts oldest plan when cache is full', () => {
      const opt = new WorkflowOptimizer({ maxCachedPlans: 2 });
      opt.setWorkflowEngine(engine);
      opt.compileWorkflow('a');
      opt.compileWorkflow('b');
      opt.compileWorkflow('c');
      expect(opt.compiledPlans.size).toBe(2);
      expect(opt.compiledPlans.has('a')).toBe(false);
    });

    it('does not evict hot workflows when cache is full', () => {
      const opt = new WorkflowOptimizer({ maxCachedPlans: 2 });
      opt.setWorkflowEngine(engine);
      opt.preheat(['a', 'b']);
      opt.compileWorkflow('c');
      expect(opt.compiledPlans.has('a')).toBe(true);
      expect(opt.compiledPlans.has('b')).toBe(true);
      expect(opt.compiledPlans.has('c')).toBe(true);
      expect(opt.compiledPlans.size).toBe(3);
    });

    it('emits workflow-compiled event', () => {
      const listener = jest.fn();
      optimizer.on('workflow-compiled', listener);
      optimizer.compileWorkflow('wf1');
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ workflowId: 'wf1' }));
    });
  });

  describe('_analyzeWorkflow', () => {
    it('marks canParallelize false for limited parallelism', () => {
      const opt = new WorkflowOptimizer();
      opt.setWorkflowEngine(makeEngine());
      const plan = opt.compileWorkflow('wf');
      expect(plan.optimizationHints.canParallelize).toBe(false);
      expect(plan.optimizationHints.recommendations.length).toBeGreaterThan(0);
    });

    it('marks canParallelize false for side-effect nodes', () => {
      const opt = new WorkflowOptimizer();
      opt.setWorkflowEngine({
        compileExecutionPlan: jest.fn(() => ({
          sortedNodes: ['node1', 'node2'],
          parallelGroups: [{ nodes: ['node1', 'node2'] }]
        })),
        getNode: jest.fn((nodeId) => ({ type: nodeId === 'node1' ? 'file_write' : 'compute' }))
      });
      const plan = opt.compileWorkflow('wf');
      expect(plan.optimizationHints.canParallelize).toBe(false);
      expect(plan.optimizationHints.recommendations.some((r) => r.includes('side-effect'))).toBe(true);
    });

    it('adds recommendation for large workflow', () => {
      const opt = new WorkflowOptimizer();
      opt.setWorkflowEngine({
        compileExecutionPlan: jest.fn(() => ({
          sortedNodes: Array.from({ length: 51 }, (_, i) => `n${i}`),
          parallelGroups: [{ nodes: ['n1'] }]
        })),
        getNode: jest.fn(() => ({ type: 'compute' }))
      });
      const plan = opt.compileWorkflow('wf');
      expect(plan.optimizationHints.recommendations.some((r) => r.includes('Large workflow'))).toBe(true);
    });
  });

  describe('preheat / hot / cold', () => {
    it('preheats workflows and returns hot count', () => {
      const result = optimizer.preheat(['wf1', 'wf2']);
      expect(result).toBe(2);
      expect(optimizer.hotWorkflows.has('wf1')).toBe(true);
      expect(optimizer.stats.preheatCount).toBe(2);
    });

    it('skips already-hot workflows on preheat', () => {
      optimizer.preheat(['wf1']);
      optimizer.preheat(['wf1', 'wf2']);
      expect(optimizer.stats.preheatCount).toBe(2);
    });

    it('markHot/markCold manage hot set', () => {
      optimizer.markHot('wf');
      expect(optimizer.hotWorkflows.has('wf')).toBe(true);
      optimizer.markCold('wf');
      expect(optimizer.hotWorkflows.has('wf')).toBe(false);
    });

    it('emits preheat-complete', () => {
      const listener = jest.fn();
      optimizer.on('preheat-complete', listener);
      optimizer.preheat(['wf1']);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
    });
  });

  describe('recordExecution / getExecutionStats', () => {
    it('records execution and computes stats', () => {
      optimizer.recordExecution('wf1', {
        startedAt: 1000, completedAt: 2000, status: 'completed',
        nodeResults: { a: 1, b: 2 }
      });
      optimizer.recordExecution('wf1', {
        startedAt: 1000, completedAt: 1500, status: 'completed',
        nodeResults: { a: 1 }
      });
      const stats = optimizer.getExecutionStats('wf1');
      expect(stats.totalExecutions).toBe(2);
      expect(stats.successRate).toBe(1);
      expect(stats.avgDuration).toBe(750);
      expect(stats.min).toBe(500);
      expect(stats.max).toBe(1000);
    });

    it('returns null when no history', () => {
      expect(optimizer.getExecutionStats('nonexistent')).toBeNull();
    });

    it('trims history beyond maxHistorySize', () => {
      const opt = new WorkflowOptimizer({ maxHistorySize: 2 });
      opt.recordExecution('wf', { startedAt: 1, completedAt: 2, status: 'completed' });
      opt.recordExecution('wf', { startedAt: 1, completedAt: 2, status: 'completed' });
      opt.recordExecution('wf', { startedAt: 1, completedAt: 2, status: 'completed' });
      expect(opt.getExecutionStats('wf').totalExecutions).toBe(2);
    });

    it('counts failed executions in success rate', () => {
      optimizer.recordExecution('wf', { startedAt: 1, completedAt: 2, status: 'completed' });
      optimizer.recordExecution('wf', { startedAt: 1, completedAt: 2, status: 'failed' });
      expect(optimizer.getExecutionStats('wf').successRate).toBe(0.5);
    });
  });

  describe('getRecommendations', () => {
    it('returns empty when no plan and no stats', () => {
      expect(optimizer.getRecommendations('nonexistent')).toEqual([]);
    });

    it('recommends performance when p95 exceeds threshold', () => {
      for (let i = 0; i < 20; i++) {
        optimizer.recordExecution('wf', {
          startedAt: 1, completedAt: 10000, status: 'completed'
        });
      }
      const recs = optimizer.getRecommendations('wf');
      expect(recs.some((r) => r.type === 'PERFORMANCE')).toBe(true);
    });

    it('recommends reliability when success rate low', () => {
      optimizer.recordExecution('wf', { startedAt: 1, completedAt: 2, status: 'completed' });
      optimizer.recordExecution('wf', { startedAt: 1, completedAt: 2, status: 'failed' });
      const recs = optimizer.getRecommendations('wf');
      expect(recs.some((r) => r.type === 'RELIABILITY')).toBe(true);
    });

    it('includes optimization hints from plan', () => {
      optimizer.compileWorkflow('wf');
      const recs = optimizer.getRecommendations('wf');
      expect(recs.some((r) => r.type === 'OPTIMIZATION')).toBe(true);
    });
  });

  describe('accessors and lifecycle', () => {
    it('getCompiledPlan returns plan', () => {
      optimizer.compileWorkflow('wf1');
      expect(optimizer.getCompiledPlan('wf1').id).toBe('wf1');
      expect(optimizer.getCompiledPlan('nope')).toBeUndefined();
    });

    it('getAllCompiledPlans returns summaries', () => {
      optimizer.compileWorkflow('wf1');
      optimizer.compileWorkflow('wf2');
      const plans = optimizer.getAllCompiledPlans();
      expect(plans).toHaveLength(2);
      expect(plans[0]).toHaveProperty('workflowId');
      expect(plans[0]).toHaveProperty('nodeCount', 3);
    });

    it('getStats reports cumulative metrics', () => {
      optimizer.compileWorkflow('wf1');
      optimizer.markHot('wf1');
      const stats = optimizer.getStats();
      expect(stats.totalOptimizations).toBe(1);
      expect(stats.compiledPlans).toBe(1);
      expect(stats.hotWorkflows).toBe(1);
      expect(stats.maxCachedPlans).toBe(50);
    });

    it('clearCache clears and emits event', () => {
      optimizer.compileWorkflow('wf1');
      const listener = jest.fn();
      optimizer.on('cache-cleared', listener);
      const count = optimizer.clearCache();
      expect(count).toBe(1);
      expect(optimizer.compiledPlans.size).toBe(0);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
    });

    it('destroy clears all state and listeners', () => {
      optimizer.compileWorkflow('wf1');
      optimizer.recordExecution('wf1', { startedAt: 1, completedAt: 2, status: 'completed' });
      optimizer.markHot('wf1');
      optimizer.destroy();
      expect(optimizer.compiledPlans.size).toBe(0);
      expect(optimizer.executionHistory.size).toBe(0);
      expect(optimizer.hotWorkflows.size).toBe(0);
    });
  });
});