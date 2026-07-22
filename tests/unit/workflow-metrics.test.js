'use strict';

const { WorkflowMetrics } = require('../../src/monitoring/WorkflowMetrics');

describe('WorkflowMetrics', () => {
  let wm;

  beforeEach(() => {
    wm = new WorkflowMetrics();
  });

  describe('constructor', () => {
    it('initializes with default options', () => {
      expect(wm.metrics.workflow).toBeInstanceOf(Map);
      expect(wm.metrics.agent).toBeInstanceOf(Map);
      expect(wm.metrics.task).toBeInstanceOf(Map);
      expect(wm.metrics.system.totalRequests).toBe(0);
      expect(wm.metrics.system.totalErrors).toBe(0);
      expect(wm.histogramBuckets).toEqual([100, 500, 1000, 2000, 5000, 10000, 30000, 60000]);
      expect(wm.retentionPeriod).toBe(86400000);
      expect(wm._cleanupTimer).toBeNull();
    });

    it('accepts custom options', () => {
      const custom = new WorkflowMetrics({
        histogramBuckets: [1000, 5000],
        retentionPeriod: 3600000
      });
      expect(custom.histogramBuckets).toEqual([1000, 5000]);
      expect(custom.retentionPeriod).toBe(3600000);
    });
  });

  describe('start / stop', () => {
    it('start sets cleanup timer', () => {
      wm.start();
      expect(wm._cleanupTimer).not.toBeNull();
      wm.stop();
    });

    it('stop clears cleanup timer', () => {
      wm.start();
      wm.stop();
      expect(wm._cleanupTimer).toBeNull();
    });

    it('stop is safe when no timer running', () => {
      expect(() => wm.stop()).not.toThrow();
    });
  });

  describe('recordWorkflowExecution', () => {
    it('records first execution for a workflow', () => {
      wm.recordWorkflowExecution('wf1', 500, 'completed');
      const wf = wm.metrics.workflow.get('wf1');
      expect(wf.executions).toBe(1);
      expect(wf.successes).toBe(1);
      expect(wf.failures).toBe(0);
      expect(wf.minDuration).toBe(500);
      expect(wf.maxDuration).toBe(500);
      expect(wf.durations).toHaveLength(1);
    });

    it('aggregates multiple executions', () => {
      wm.recordWorkflowExecution('wf1', 100, 'completed');
      wm.recordWorkflowExecution('wf1', 200, 'completed');
      wm.recordWorkflowExecution('wf1', 300, 'failed');
      const wf = wm.metrics.workflow.get('wf1');
      expect(wf.executions).toBe(3);
      expect(wf.successes).toBe(2);
      expect(wf.failures).toBe(1);
      expect(wf.totalDuration).toBe(600);
      expect(wf.minDuration).toBe(100);
      expect(wf.maxDuration).toBe(300);
    });

    it('updates system totals', () => {
      wm.recordWorkflowExecution('wf1', 100, 'completed');
      wm.recordWorkflowExecution('wf2', 200, 'failed');
      expect(wm.metrics.system.totalRequests).toBe(2);
      expect(wm.metrics.system.totalErrors).toBe(1);
      expect(wm.metrics.system.totalLatency).toBe(300);
    });

    it('trims durations array at 1000 entries', () => {
      for (let i = 0; i < 1001; i++) {
        wm.recordWorkflowExecution('wf1', i, 'completed');
      }
      const wf = wm.metrics.workflow.get('wf1');
      expect(wf.durations.length).toBeLessThanOrEqual(500);
    });
  });

  describe('recordAgentExecution', () => {
    it('records first agent execution', () => {
      wm.recordAgentExecution('agent1', 'analysis', 150, 'completed');
      const key = 'agent1:analysis';
      const agent = wm.metrics.agent.get(key);
      expect(agent.executions).toBe(1);
      expect(agent.successes).toBe(1);
      expect(agent.avgDuration).toBe(150);
    });

    it('aggregates agent executions', () => {
      wm.recordAgentExecution('agent1', 'analysis', 100, 'completed');
      wm.recordAgentExecution('agent1', 'analysis', 300, 'failed');
      const key = 'agent1:analysis';
      const agent = wm.metrics.agent.get(key);
      expect(agent.executions).toBe(2);
      expect(agent.successes).toBe(1);
      expect(agent.failures).toBe(1);
      expect(agent.avgDuration).toBe(200);
    });
  });

  describe('recordTaskExecution', () => {
    it('records task with all fields', () => {
      wm.recordTaskExecution('task1', 'wf1', 'agent1', 500, 'completed', 1);
      const task = wm.metrics.task.get('task1');
      expect(task.workflowId).toBe('wf1');
      expect(task.agentId).toBe('agent1');
      expect(task.duration).toBe(500);
      expect(task.status).toBe('completed');
      expect(task.stepIndex).toBe(1);
    });

    it('trims tasks map at 10000 entries', () => {
      for (let i = 0; i < 10001; i++) {
        wm.recordTaskExecution(`task${i}`, 'wf1', 'agent1', i, 'completed', i);
      }
      expect(wm.metrics.task.size).toBeLessThanOrEqual(5000);
    });
  });

  describe('getWorkflowMetrics', () => {
    it('returns metrics for existing workflow', () => {
      wm.recordWorkflowExecution('wf1', 300, 'completed');
      const metrics = wm.getWorkflowMetrics('wf1');
      expect(metrics).not.toBeNull();
      expect(metrics.executions).toBe(1);
    });

    it('returns null for unknown workflow', () => {
      expect(wm.getWorkflowMetrics('unknown')).toBeNull();
    });
  });

  describe('getAllWorkflowMetrics', () => {
    it('returns array with formatted metrics', () => {
      wm.recordWorkflowExecution('wf1', 500, 'completed');
      wm.recordWorkflowExecution('wf1', 1500, 'completed');
      wm.recordWorkflowExecution('wf1', 200, 'failed');

      const all = wm.getAllWorkflowMetrics();
      expect(all).toHaveLength(1);
      const wf = all[0];

      expect(wf.id).toBe('wf1');
      expect(wf.executions).toBe(3);
      expect(wf.successRate).toContain('66.67');
      expect(wf.minDuration).not.toBe('N/A');
      expect(wf.p50).toBeDefined();
      expect(wf.p90).toBeDefined();
      expect(wf.p99).toBeDefined();
    });

    it('handles zero executions gracefully', () => {
      wm.metrics.workflow.set('empty', {
        id: 'empty',
        executions: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        durations: [],
        lastExecution: null
      });

      const all = wm.getAllWorkflowMetrics();
      const empty = all.find((w) => w.id === 'empty');
      expect(empty.successRate).toBe('0%');
      expect(empty.minDuration).toBe('N/A');
    });
  });

  describe('getAgentMetrics', () => {
    it('returns all agent metrics', () => {
      wm.recordAgentExecution('agent1', 'typeA', 100, 'completed');
      wm.recordAgentExecution('agent2', 'typeB', 200, 'completed');
      const all = wm.getAgentMetrics();
      expect(all).toHaveLength(2);
    });

    it('filters by agentId when provided', () => {
      wm.recordAgentExecution('agent1', 'typeA', 100, 'completed');
      wm.recordAgentExecution('agent2', 'typeB', 200, 'completed');
      const filtered = wm.getAgentMetrics('agent1');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].agentId).toBe('agent1');
    });

    it('includes success rate', () => {
      wm.recordAgentExecution('agent1', 'test', 100, 'completed');
      wm.recordAgentExecution('agent1', 'test', 100, 'failed');
      const all = wm.getAgentMetrics('agent1');
      expect(all[0].successRate).toBe('50.00%');
    });
  });

  describe('getSlowWorkflows', () => {
    it('returns workflows above threshold sorted by duration', () => {
      wm.recordWorkflowExecution('fast', 100, 'completed');
      wm.recordWorkflowExecution('slow', 10000, 'completed');
      wm.recordWorkflowExecution('slower', 20000, 'completed');

      const slow = wm.getSlowWorkflows(5000);
      expect(slow).toHaveLength(2);
      expect(slow[0].id).toBe('slower');
      expect(slow[1].id).toBe('slow');
    });

    it('returns empty array when no workflow exceeds threshold', () => {
      wm.recordWorkflowExecution('wf1', 100, 'completed');
      expect(wm.getSlowWorkflows(5000)).toHaveLength(0);
    });
  });

  describe('getDashboard', () => {
    it('returns summary, workflows, slow and agents', () => {
      wm.recordWorkflowExecution('wf1', 100, 'completed');
      wm.recordAgentExecution('a1', 'type1', 50, 'completed');

      const dash = wm.getDashboard();
      expect(dash.summary.totalRequests).toBe(1);
      expect(dash.summary.errorRate).toBe('0.00%');
      expect(dash.summary.avgLatency).toMatch(/^\d+ms$/);
      expect(dash.summary.uptime).toMatch(/^\d+s$/);
      expect(dash.workflows).toHaveLength(1);
      expect(dash.agents).toHaveLength(1);
      expect(dash.slowWorkflows).toHaveLength(0);
    });

    it('handles zero requests gracefully', () => {
      const dash = wm.getDashboard();
      expect(dash.summary.errorRate).toBe('0%');
      expect(dash.summary.avgLatency).toBe('0ms');
    });
  });

  describe('toPrometheusFormat', () => {
    it('generates valid prometheus output', () => {
      wm.recordWorkflowExecution('wf1', 500, 'completed');
      wm.recordAgentExecution('a1', 't1', 100, 'completed');

      const output = wm.toPrometheusFormat();
      expect(output).toContain('# HELP ultrawork_workflow_executions_total');
      expect(output).toContain('ultrawork_workflow_executions_total{workflow="wf1"} 1');
      expect(output).toContain('# HELP ultrawork_system_uptime_seconds');
      expect(output).toContain('ultrawork_system_requests_total 1');
    });
  });

  describe('getStats', () => {
    it('returns counts of workflows, agents, tasks', () => {
      wm.recordWorkflowExecution('wf1', 100, 'completed');
      wm.recordAgentExecution('a1', 't1', 50, 'completed');
      const stats = wm.getStats();
      expect(stats.workflows).toBe(1);
      expect(stats.agents).toBe(1);
      expect(stats.tasks).toBe(0);
      expect(stats.totalRequests).toBe(1);
      expect(stats.totalErrors).toBe(0);
    });
  });

  describe('_cleanup', () => {
    it('removes expired duration entries', () => {
      wm.recordWorkflowExecution('wf1', 100, 'completed');
      const wf = wm.metrics.workflow.get('wf1');
      const oldTimestamp = Date.now() - wm.retentionPeriod - 10000;
      wf.durations[0].timestamp = oldTimestamp;

      wm._cleanup();
      expect(wf.durations).toHaveLength(0);
    });

    it('removes expired task entries', () => {
      const oldTimestamp = Date.now() - wm.retentionPeriod - 10000;
      wm.metrics.task.set('old_task', {
        taskId: 'old_task',
        workflowId: 'wf1',
        timestamp: oldTimestamp
      });

      wm._cleanup();
      expect(wm.metrics.task.has('old_task')).toBe(false);
    });

    it('keeps recent entries', () => {
      wm.recordWorkflowExecution('wf1', 100, 'completed');
      wm.recordTaskExecution('task1', 'wf1', 'a1', 100, 'completed', 1);

      wm._cleanup();
      expect(wm.metrics.workflow.get('wf1').durations).toHaveLength(1);
      expect(wm.metrics.task.has('task1')).toBe(true);
    });
  });

  describe('destroy', () => {
    it('stops timer and clears all metrics', () => {
      wm.start();
      wm.recordWorkflowExecution('wf1', 100, 'completed');
      wm.destroy();

      expect(wm._cleanupTimer).toBeNull();
      expect(wm.metrics.workflow.size).toBe(0);
      expect(wm.metrics.agent.size).toBe(0);
      expect(wm.metrics.task.size).toBe(0);
    });
  });

  describe('start cleanup callback', () => {
    it('triggers cleanup via setInterval', () => {
      jest.useFakeTimers({ doNotFake: ['Date'] });
      const wm2 = new WorkflowMetrics();
      wm2.recordWorkflowExecution('wf1', 100, 'completed');
      const wf = wm2.metrics.workflow.get('wf1');
      wf.durations[0].timestamp = Date.now() - wm2.retentionPeriod - 10000;

      wm2.start();
      jest.advanceTimersByTime(300000);

      expect(wf.durations).toHaveLength(0);
      wm2.stop();
      jest.useRealTimers();
    });
  });

  describe('_findBottleneck (via getSlowWorkflows)', () => {
    it('returns bottleneck when tasks match workflow and skips non-matching tasks', () => {
      wm.recordWorkflowExecution('slow-wf', 10000, 'completed');
      wm.recordTaskExecution('task-match', 'slow-wf', 'agent-bot', 9000, 'completed', 2);
      wm.recordTaskExecution('task-other', 'other-wf', 'agent-x', 100, 'completed', 1);

      const slow = wm.getSlowWorkflows(1000);
      expect(slow).toHaveLength(1);
      expect(slow[0].bottleneck).toEqual({
        agent: 'agent-bot',
        duration: '9000ms',
        step: 2
      });
    });
  });

  describe('zero edge cases', () => {
    it('handles agent with zero executions in success rate', () => {
      wm.metrics.agent.set('a0:t0', {
        agentId: 'a0',
        taskType: 't0',
        executions: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
        avgDuration: 0
      });
      const all = wm.getAgentMetrics();
      const agent = all.find(a => a.agentId === 'a0');
      expect(agent.successRate).toBe('0%');
    });

    it('handles workflow with zero executions in getSlowWorkflows', () => {
      wm.metrics.workflow.set('empty', {
        id: 'empty',
        executions: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        durations: [],
        lastExecution: null
      });
      expect(wm.getSlowWorkflows()).toHaveLength(0);
    });

    it('handles zero executions in prometheus format', () => {
      wm.metrics.workflow.set('empty-wf', {
        id: 'empty-wf',
        executions: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        durations: [],
        lastExecution: null
      });
      wm.metrics.agent.set('empty-agent:t1', {
        agentId: 'empty-agent',
        taskType: 't1',
        executions: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
        avgDuration: 0
      });
      const output = wm.toPrometheusFormat();
      expect(output).toContain('ultrawork_workflow_duration_avg_ms{workflow="empty-wf"} 0.00');
      expect(output).toContain('ultrawork_agent_success_rate{agent="empty-agent",task="t1"} 0.0000');
    });
  });
});
