const { EventEmitter } = require('events');

class WorkflowOptimizer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.workflowEngine = null;
    this.compiledPlans = new Map();
    this.executionHistory = new Map();
    this.maxHistorySize = options.maxHistorySize || 100;
    this.enablePreheating = options.enablePreheating !== false;
    this.maxCachedPlans = options.maxCachedPlans || 50;
    this.hotWorkflows = new Set();
    this.stats = {
      totalOptimizations: 0,
      cacheHits: 0,
      preheatCount: 0,
      avgCompilationTime: 0,
      totalCompilationTime: 0
    };
  }

  setWorkflowEngine(engine) {
    this.workflowEngine = engine;
  }

  compileWorkflow(workflowId = null, options = {}) {
    if (!this.workflowEngine) {
      throw new Error('Workflow engine not set');
    }

    if (workflowId !== null && typeof workflowId !== 'string') {
      throw new Error('workflowId must be a string or null');
    }

    if (workflowId && !/^[a-zA-Z0-9_-]+$/.test(workflowId)) {
      throw new Error('Invalid workflowId: must contain only alphanumeric characters, hyphens, and underscores');
    }

    const startTime = Date.now();
    const normalizedId = workflowId || `default_${Date.now()}`;
    
    if (this.enablePreheating && this.compiledPlans.has(normalizedId)) {
      const cached = this.compiledPlans.get(normalizedId);
      this.stats.cacheHits++;
      return cached;
    }

    const plan = this.workflowEngine.compileExecutionPlan(normalizedId);

    plan.optimizationHints = this._analyzeWorkflow(plan);
    plan.compilationTime = Date.now() - startTime;
    plan.lastUsed = Date.now();

    if (this.compiledPlans.size >= this.maxCachedPlans) {
      this._evictOldestPlan();
    }

    this.compiledPlans.set(normalizedId, plan);
    
    this.stats.totalOptimizations++;
    this.stats.totalCompilationTime += plan.compilationTime;
    this.stats.avgCompilationTime = this.stats.totalCompilationTime / this.stats.totalOptimizations;

    this.emit('workflow-compiled', { workflowId, plan });

    return plan;
  }

  _analyzeWorkflow(plan) {
    const hints = {
      canParallelize: true,
      estimatedNodes: plan.sortedNodes.length,
      criticalPathLength: 0,
      parallelGroups: plan.parallelGroups.length,
      recommendations: []
    };

    for (const group of plan.parallelGroups) {
      if (group.nodes.length > 1) {
        hints.criticalPathLength++;
      } else {
        hints.criticalPathLength++;
      }
    }

    if (plan.parallelGroups.length > 1) {
      const avgParallel = plan.parallelGroups.reduce((sum, g) => sum + g.nodes.length, 0) / plan.parallelGroups.length;
      if (avgParallel < 1.5) {
        hints.canParallelize = false;
        hints.recommendations.push('Workflow has limited parallelism. Consider restructuring nodes.');
      }
    }

    const hasSideEffect = plan.sortedNodes.some(nodeId => {
      const node = this.workflowEngine.getNode(nodeId);
      return node && (
        node.type.startsWith('mcp_write') ||
        node.type.startsWith('http_post') ||
        node.type.startsWith('file_write')
      );
    });

    if (hasSideEffect) {
      hints.canParallelize = false;
      hints.recommendations.push('Workflow contains side-effect nodes. Disable parallel execution for consistency.');
    }

    if (hints.estimatedNodes > 50) {
      hints.recommendations.push('Large workflow detected. Consider splitting into sub-workflows.');
    }

    return hints;
  }

  _evictOldestPlan() {
    let oldest = null;
    let oldestTime = Infinity;

    for (const [workflowId, plan] of this.compiledPlans) {
      if (plan.lastUsed < oldestTime && !this.hotWorkflows.has(workflowId)) {
        oldest = workflowId;
        oldestTime = plan.lastUsed;
      }
    }

    if (oldest) {
      this.compiledPlans.delete(oldest);
      this.emit('plan-evicted', { workflowId: oldest });
    }
  }

  preheat(workflows = []) {
    for (const workflowId of workflows) {
      if (!this.hotWorkflows.has(workflowId)) {
        this.hotWorkflows.add(workflowId);
        this.compileWorkflow(workflowId);
        this.stats.preheatCount++;
      }
    }

    this.emit('preheat-complete', { count: this.stats.preheatCount });
    
    return this.hotWorkflows.size;
  }

  markHot(workflowId) {
    this.hotWorkflows.add(workflowId);
  }

  markCold(workflowId) {
    this.hotWorkflows.delete(workflowId);
  }

  recordExecution(workflowId, execution) {
    if (!this.executionHistory.has(workflowId)) {
      this.executionHistory.set(workflowId, []);
    }

    const history = this.executionHistory.get(workflowId);
    history.push({
      timestamp: Date.now(),
      duration: execution.completedAt - execution.startedAt,
      status: execution.status,
      nodeCount: execution.nodeResults ? Object.keys(execution.nodeResults).length : 0
    });

    if (history.length > this.maxHistorySize) {
      history.shift();
    }

    const plan = this.compiledPlans.get(workflowId);
    if (plan) {
      plan.lastUsed = Date.now();
    }
  }

  getExecutionStats(workflowId) {
    const history = this.executionHistory.get(workflowId) || [];
    
    if (history.length === 0) {
      return null;
    }

    const durations = history.map(h => h.duration).sort((a, b) => a - b);
    const successCount = history.filter(h => h.status === 'completed').length;

    return {
      totalExecutions: history.length,
      successRate: successCount / history.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      p50: durations[Math.floor(durations.length * 0.5)] || 0,
      p95: durations[Math.floor(durations.length * 0.95)] || 0,
      p99: durations[Math.floor(durations.length * 0.99)] || 0,
      min: durations[0] || 0,
      max: durations[durations.length - 1] || 0
    };
  }

  getRecommendations(workflowId) {
    const plan = this.compiledPlans.get(workflowId);
    const stats = this.getExecutionStats(workflowId);
    
    if (!plan && !stats) {
      return [];
    }

    const recommendations = [];

    if (stats && stats.p95 > 5000) {
      recommendations.push({
        type: 'PERFORMANCE',
        priority: 'HIGH',
        message: `P95 latency (${stats.p95}ms) exceeds 5s threshold. Consider enabling parallel execution.`
      });
    }

    if (plan?.optimizationHints?.recommendations) {
      for (const rec of plan.optimizationHints.recommendations) {
        recommendations.push({
          type: 'OPTIMIZATION',
          priority: 'MEDIUM',
          message: rec
        });
      }
    }

    if (stats && stats.successRate < 0.99) {
      recommendations.push({
        type: 'RELIABILITY',
        priority: 'HIGH',
        message: `Success rate (${(stats.successRate * 100).toFixed(1)}%) below 99%. Check for failing nodes.`
      });
    }

    return recommendations;
  }

  getCompiledPlan(workflowId) {
    return this.compiledPlans.get(workflowId);
  }

  getAllCompiledPlans() {
    return Array.from(this.compiledPlans.entries()).map(([id, plan]) => ({
      workflowId: id,
      nodeCount: plan.sortedNodes.length,
      parallelGroups: plan.parallelGroups.length,
      canParallelize: plan.optimizationHints?.canParallelize || false,
      lastUsed: plan.lastUsed,
      compilationTime: plan.compilationTime
    }));
  }

  getStats() {
    return {
      ...this.stats,
      compiledPlans: this.compiledPlans.size,
      hotWorkflows: this.hotWorkflows.size,
      maxCachedPlans: this.maxCachedPlans
    };
  }

  clearCache() {
    const count = this.compiledPlans.size;
    this.compiledPlans.clear();
    this.emit('cache-cleared', { count });
    return count;
  }

  destroy() {
    this.compiledPlans.clear();
    this.executionHistory.clear();
    this.hotWorkflows.clear();
    this.removeAllListeners();
  }
}

module.exports = { WorkflowOptimizer };
