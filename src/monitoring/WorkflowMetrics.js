class WorkflowMetrics {
  constructor(options = {}) {
    this.metrics = {
      workflow: new Map(),
      agent: new Map(),
      task: new Map(),
      system: {
        startTime: Date.now(),
        totalRequests: 0,
        totalErrors: 0,
        totalLatency: 0
      }
    };

    this.histogramBuckets = options.histogramBuckets || [100, 500, 1000, 2000, 5000, 10000, 30000, 60000];
    this.retentionPeriod = options.retentionPeriod || 86400000;
    this._cleanupTimer = null;
  }

  start() {
    this._cleanupTimer = setInterval(() => {
      this._cleanup();
    }, 300000);
  }

  stop() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  recordWorkflowExecution(workflowId, duration, status, metadata = {}) {
    if (!this.metrics.workflow.has(workflowId)) {
      this.metrics.workflow.set(workflowId, {
        id: workflowId,
        executions: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        durations: [],
        lastExecution: null
      });
    }

    const wf = this.metrics.workflow.get(workflowId);
    wf.executions++;
    wf.totalDuration += duration;
    wf.durations.push({ duration, status, timestamp: Date.now() });

    if (duration < wf.minDuration) wf.minDuration = duration;
    if (duration > wf.maxDuration) wf.maxDuration = duration;

    if (status === 'completed') {
      wf.successes++;
    } else {
      wf.failures++;
    }

    wf.lastExecution = Date.now();

    if (wf.durations.length > 1000) {
      wf.durations = wf.durations.slice(-500);
    }

    this.metrics.system.totalRequests++;
    this.metrics.system.totalLatency += duration;
    if (status !== 'completed') {
      this.metrics.system.totalErrors++;
    }
  }

  recordAgentExecution(agentId, taskType, duration, status) {
    const key = `${agentId}:${taskType}`;

    if (!this.metrics.agent.has(key)) {
      this.metrics.agent.set(key, {
        agentId,
        taskType,
        executions: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
        avgDuration: 0
      });
    }

    const agent = this.metrics.agent.get(key);
    agent.executions++;
    agent.totalDuration += duration;
    agent.avgDuration = agent.totalDuration / agent.executions;

    if (status === 'completed') {
      agent.successes++;
    } else {
      agent.failures++;
    }
  }

  recordTaskExecution(taskId, workflowId, agentId, duration, status, stepIndex) {
    this.metrics.task.set(taskId, {
      taskId,
      workflowId,
      agentId,
      duration,
      status,
      stepIndex,
      timestamp: Date.now()
    });

    if (this.metrics.task.size > 10000) {
      const entries = Array.from(this.metrics.task.entries());
      const toRemove = entries.slice(0, entries.length - 5000);
      toRemove.forEach(([key]) => this.metrics.task.delete(key));
    }
  }

  getWorkflowMetrics(workflowId) {
    return this.metrics.workflow.get(workflowId) || null;
  }

  getAllWorkflowMetrics() {
    const result = [];

    for (const [id, wf] of this.metrics.workflow) {
      const successRate = wf.executions > 0
        ? (wf.successes / wf.executions * 100).toFixed(2)
        : '0';

      const avgDuration = wf.executions > 0
        ? (wf.totalDuration / wf.executions).toFixed(0)
        : '0';

      const p50 = this._percentile(wf.durations.map(d => d.duration), 50);
      const p90 = this._percentile(wf.durations.map(d => d.duration), 90);
      const p99 = this._percentile(wf.durations.map(d => d.duration), 99);

      result.push({
        id,
        executions: wf.executions,
        successes: wf.successes,
        failures: wf.failures,
        successRate: successRate + '%',
        avgDuration: avgDuration + 'ms',
        minDuration: wf.minDuration === Infinity ? 'N/A' : wf.minDuration + 'ms',
        maxDuration: wf.maxDuration + 'ms',
        p50: p50 + 'ms',
        p90: p90 + 'ms',
        p99: p99 + 'ms',
        lastExecution: wf.lastExecution
      });
    }

    return result;
  }

  getAgentMetrics(agentId = null) {
    const result = [];

    for (const [key, agent] of this.metrics.agent) {
      if (agentId && agent.agentId !== agentId) continue;

      result.push({
        ...agent,
        successRate: agent.executions > 0
          ? (agent.successes / agent.executions * 100).toFixed(2) + '%'
          : '0%'
      });
    }

    return result;
  }

  getSlowWorkflows(threshold = 5000) {
    const result = [];

    for (const [id, wf] of this.metrics.workflow) {
      const avgDuration = wf.executions > 0 ? wf.totalDuration / wf.executions : 0;

      if (avgDuration > threshold) {
        result.push({
          id,
          avgDuration: avgDuration.toFixed(0) + 'ms',
          executions: wf.executions,
          bottleneck: this._findBottleneck(id)
        });
      }
    }

    return result.sort((a, b) => parseFloat(b.avgDuration) - parseFloat(a.avgDuration));
  }

  _findBottleneck(workflowId) {
    const tasks = [];

    for (const [taskId, task] of this.metrics.task) {
      if (task.workflowId === workflowId) {
        tasks.push(task);
      }
    }

    if (tasks.length === 0) return null;

    tasks.sort((a, b) => b.duration - a.duration);

    return {
      agent: tasks[0].agentId,
      duration: tasks[0].duration + 'ms',
      step: tasks[0].stepIndex
    };
  }

  _percentile(arr, p) {
    if (arr.length === 0) return 0;

    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;

    return sorted[Math.max(0, index)];
  }

  toPrometheusFormat() {
    let output = '';

    output += '# HELP ultrawork_workflow_executions_total Total workflow executions\n';
    output += '# TYPE ultrawork_workflow_executions_total counter\n';

    for (const [id, wf] of this.metrics.workflow) {
      output += `ultrawork_workflow_executions_total{workflow="${id}"} ${wf.executions}\n`;
    }

    output += '\n# HELP ultrawork_workflow_successes_total Successful workflow executions\n';
    output += '# TYPE ultrawork_workflow_successes_total counter\n';

    for (const [id, wf] of this.metrics.workflow) {
      output += `ultrawork_workflow_successes_total{workflow="${id}"} ${wf.successes}\n`;
    }

    output += '\n# HELP ultrawork_workflow_failures_total Failed workflow executions\n';
    output += '# TYPE ultrawork_workflow_failures_total counter\n';

    for (const [id, wf] of this.metrics.workflow) {
      output += `ultrawork_workflow_failures_total{workflow="${id}"} ${wf.failures}\n`;
    }

    output += '\n# HELP ultrawork_workflow_duration_avg_ms Average workflow duration in ms\n';
    output += '# TYPE ultrawork_workflow_duration_avg_ms gauge\n';

    for (const [id, wf] of this.metrics.workflow) {
      const avg = wf.executions > 0 ? wf.totalDuration / wf.executions : 0;
      output += `ultrawork_workflow_duration_avg_ms{workflow="${id}"} ${avg.toFixed(2)}\n`;
    }

    output += '\n# HELP ultrawork_agent_executions_total Total agent executions\n';
    output += '# TYPE ultrawork_agent_executions_total counter\n';

    for (const [key, agent] of this.metrics.agent) {
      output += `ultrawork_agent_executions_total{agent="${agent.agentId}",task="${agent.taskType}"} ${agent.executions}\n`;
    }

    output += '\n# HELP ultrawork_agent_success_rate Agent success rate\n';
    output += '# TYPE ultrawork_agent_success_rate gauge\n';

    for (const [key, agent] of this.metrics.agent) {
      const rate = agent.executions > 0 ? agent.successes / agent.executions : 0;
      output += `ultrawork_agent_success_rate{agent="${agent.agentId}",task="${agent.taskType}"} ${rate.toFixed(4)}\n`;
    }

    output += '\n# HELP ultrawork_system_requests_total Total system requests\n';
    output += '# TYPE ultrawork_system_requests_total counter\n';
    output += `ultrawork_system_requests_total ${this.metrics.system.totalRequests}\n`;

    output += '\n# HELP ultrawork_system_errors_total Total system errors\n';
    output += '# TYPE ultrawork_system_errors_total counter\n';
    output += `ultrawork_system_errors_total ${this.metrics.system.totalErrors}\n`;

    output += '\n# HELP ultrawork_system_uptime_seconds System uptime in seconds\n';
    output += '# TYPE ultrawork_system_uptime_seconds gauge\n';
    output += `ultrawork_system_uptime_seconds ${((Date.now() - this.metrics.system.startTime) / 1000).toFixed(0)}\n`;

    return output;
  }

  getDashboard() {
    const workflows = this.getAllWorkflowMetrics();
    const slowWorkflows = this.getSlowWorkflows();
    const agents = this.getAgentMetrics();

    return {
      summary: {
        totalRequests: this.metrics.system.totalRequests,
        totalErrors: this.metrics.system.totalErrors,
        errorRate: this.metrics.system.totalRequests > 0
          ? (this.metrics.system.totalErrors / this.metrics.system.totalRequests * 100).toFixed(2) + '%'
          : '0%',
        avgLatency: this.metrics.system.totalRequests > 0
          ? (this.metrics.system.totalLatency / this.metrics.system.totalRequests).toFixed(0) + 'ms'
          : '0ms',
        uptime: ((Date.now() - this.metrics.system.startTime) / 1000).toFixed(0) + 's'
      },
      workflows: workflows.slice(0, 10),
      slowWorkflows: slowWorkflows.slice(0, 5),
      agents: agents.slice(0, 10)
    };
  }

  _cleanup() {
    const now = Date.now();

    for (const [id, wf] of this.metrics.workflow) {
      wf.durations = wf.durations.filter(d => now - d.timestamp < this.retentionPeriod);
    }

    for (const [id, task] of this.metrics.task) {
      if (now - task.timestamp > this.retentionPeriod) {
        this.metrics.task.delete(id);
      }
    }
  }

  getStats() {
    return {
      workflows: this.metrics.workflow.size,
      agents: this.metrics.agent.size,
      tasks: this.metrics.task.size,
      totalRequests: this.metrics.system.totalRequests,
      totalErrors: this.metrics.system.totalErrors
    };
  }

  destroy() {
    this.stop();
    this.metrics.workflow.clear();
    this.metrics.agent.clear();
    this.metrics.task.clear();
  }
}

module.exports = { WorkflowMetrics };
