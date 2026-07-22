const { CollaborationOrchestrator } = require('../../src/agent/CollaborationOrchestrator');

describe('CollaborationOrchestrator', () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = new CollaborationOrchestrator({ maxHistory: 50 });
  });

  afterEach(() => {
    orchestrator.destroy();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const o = new CollaborationOrchestrator();
      expect(o.team).toBeNull();
      expect(o.workflows).toBeInstanceOf(Map);
      expect(o.activeExecutions).toBeInstanceOf(Map);
      expect(o.completedExecutions).toEqual([]);
      expect(o.maxHistory).toBe(100);
      expect(o.onStepComplete).toBeInstanceOf(Function);
      expect(o.onWorkflowComplete).toBeInstanceOf(Function);
      expect(o.onError).toBeInstanceOf(Function);
      o.destroy();
    });

    it('should accept custom options', () => {
      const onStep = jest.fn();
      const onComplete = jest.fn();
      const onErr = jest.fn();
      const o = new CollaborationOrchestrator({
        maxHistory: 10,
        onStepComplete: onStep,
        onWorkflowComplete: onComplete,
        onError: onErr
      });
      expect(o.maxHistory).toBe(10);
      expect(o.onStepComplete).toBe(onStep);
      expect(o.onWorkflowComplete).toBe(onComplete);
      expect(o.onError).toBe(onErr);
      o.destroy();
    });

    it('should register 5 default workflows', () => {
      expect(orchestrator.workflows.size).toBe(5);
      expect(orchestrator.workflows.has('collect_analyze_report')).toBe(true);
      expect(orchestrator.workflows.has('research_write_publish')).toBe(true);
      expect(orchestrator.workflows.has('monitor_alert_action')).toBe(true);
      expect(orchestrator.workflows.has('extract_transform_load')).toBe(true);
      expect(orchestrator.workflows.has('scrape_verify_store')).toBe(true);
    });
  });

  describe('registerWorkflow', () => {
    it('should register a new workflow', () => {
      orchestrator.registerWorkflow('custom_flow', {
        name: 'Custom',
        description: 'Custom workflow',
        steps: [
          { agent: 'a1', task: 'step1', output: 'out1' }
        ]
      });
      expect(orchestrator.workflows.size).toBe(6);
      const wf = orchestrator.workflows.get('custom_flow');
      expect(wf.name).toBe('Custom');
      expect(wf.steps).toHaveLength(1);
    });

    it('should use default icon when not provided', () => {
      orchestrator.registerWorkflow('no_icon', {
        name: 'No Icon',
        description: 'desc',
        steps: [{ agent: 'a1', task: 't1', output: 'o1' }]
      });
      expect(orchestrator.workflows.get('no_icon').icon).toBe('⚙️');
    });
  });

  describe('execute', () => {
    it('should throw for unknown workflow', async () => {
      await expect(orchestrator.execute('nonexistent', {})).rejects.toThrow('Workflow not found');
    });

    it('should execute a simple workflow successfully', async () => {
      orchestrator.registerWorkflow('simple_test', {
        name: 'Simple',
        description: 'A simple workflow',
        steps: [
          { agent: 'agent1', task: 'collect', output: 'collected' },
          { agent: 'agent2', task: 'analyze', input: 'collected', output: 'analyzed' }
        ]
      });

      const result = await orchestrator.execute('simple_test', { url: 'http://example.com' });
      expect(result.status).toBe('completed');
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].status).toBe('completed');
      expect(result.steps[1].status).toBe('completed');
      expect(result.results.collected).toBeDefined();
      expect(result.results.analyzed).toBeDefined();
      expect(result.startedAt).toBeLessThanOrEqual(Date.now());
      expect(result.completedAt).toBeGreaterThanOrEqual(result.startedAt);
    });

    it('should handle step failure', async () => {
      const errFn = jest.fn();
      const o = new CollaborationOrchestrator({
        onError: errFn,
        maxHistory: 50
      });

      o.registerWorkflow('failing_flow', {
        name: 'Failing',
        description: 'A workflow that fails',
        steps: [
          { agent: 'agent1', task: 'collect', output: 'data' },
          { agent: 'agent2', task: 'fail_step', input: 'data', output: 'result' }
        ]
      });

      const mockTeam = {
        getAgent: jest.fn((agentName) => {
          if (agentName === 'agent1') return null;
          throw new Error('Step execution failed');
        })
      };
      o.team = mockTeam;

      const result = await o.execute('failing_flow', {});
      expect(result.status).toBe('failed');
      expect(result.steps[1].status).toBe('failed');
      expect(result.steps[1].error).toMatch(/Step execution failed/);
      expect(errFn).toHaveBeenCalled();

      o.destroy();
    });

    it('should handle errors in outer loop gracefully', async () => {
      orchestrator.team = {
        getAgent: jest.fn().mockImplementation(() => {
          throw new Error('Team error');
        })
      };

      orchestrator.registerWorkflow('outer_error', {
        name: 'Outer Error',
        description: 'desc',
        steps: [{ agent: 'collector', task: 'collect', output: 'data' }]
      });

      const result = await orchestrator.execute('outer_error', {});
      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
    });

    it('should pass context to steps without input requirement', async () => {
      orchestrator.registerWorkflow('context_flow', {
        name: 'Context',
        description: 'desc',
        steps: [
          { agent: 'collector', task: 'collect', output: 'raw' }
        ]
      });

      const result = await orchestrator.execute('context_flow', { initial: 'value' });
      expect(result.status).toBe('completed');
      expect(result.context.initial).toBe('value');
    });

    it('should call onStepComplete after each step', async () => {
      const onStep = jest.fn();
      const o = new CollaborationOrchestrator({ onStepComplete: onStep });

      o.registerWorkflow('step_flow', {
        name: 'Step Flow',
        description: 'desc',
        steps: [
          { agent: 'a1', task: 'collect', output: 'd1' },
          { agent: 'a2', task: 'analyze', input: 'd1', output: 'd2' }
        ]
      });

      await o.execute('step_flow', { url: 'http://test.com' });
      expect(onStep).toHaveBeenCalledTimes(2);
      expect(onStep.mock.calls[0][0].step).toBe('collect');
      expect(onStep.mock.calls[1][0].step).toBe('analyze');

      o.destroy();
    });

    it('should call onWorkflowComplete after successful execution', async () => {
      const onComplete = jest.fn();
      const o = new CollaborationOrchestrator({ onWorkflowComplete: onComplete });

      o.registerWorkflow('complete_flow', {
        name: 'Complete',
        description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      await o.execute('complete_flow', {});
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete.mock.calls[0][0].status).toBe('completed');

      o.destroy();
    });
  });

  describe('_executeDefault', () => {
    it('should return default result after delay', async () => {
      const result = await orchestrator._executeDefault(
        { agent: 'worker', task: 'build' },
        { source: 'code' }
      );
      expect(result.type).toBe('build');
      expect(result.agent).toBe('worker');
      expect(result.result).toBe('completed');
      expect(result.input).toEqual({ source: 'code' });
    });
  });

  describe('_executeWithAgent', () => {
    it('should handle collect task with URL', async () => {
      const agent = { id: 'collector' };
      const result = await orchestrator._executeWithAgent(
        { agent: 'collector', task: 'collect' },
        { url: 'http://example.com' },
        agent
      );
      expect(result.type).toBe('collection');
      expect(result.data).toEqual(['data1', 'data2']);
    });

    it('should handle collect task without URL', async () => {
      const agent = { id: 'collector' };
      const result = await orchestrator._executeWithAgent(
        { agent: 'collector', task: 'collect' },
        {},
        agent
      );
      expect(result.data).toEqual([]);
    });

    it('should handle analyze task', async () => {
      const result = await orchestrator._executeWithAgent(
        { agent: 'analyst', task: 'analyze' },
        { data: [1, 2, 3] },
        { id: 'analyst' }
      );
      expect(result.type).toBe('analysis');
      expect(result.metrics.count).toBe(100);
    });

    it('should handle report task', async () => {
      const result = await orchestrator._executeWithAgent(
        { agent: 'reporter', task: 'report' },
        { summary: 'data' },
        { id: 'reporter' }
      );
      expect(result.type).toBe('report');
      expect(result.title).toBe('Generated Report');
    });

    it('should handle attest task', async () => {
      const result = await orchestrator._executeWithAgent(
        { agent: 'attester', task: 'attest' },
        { report: 'content' },
        { id: 'attester' }
      );
      expect(result.type).toBe('attestation');
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle unknown task type', async () => {
      const result = await orchestrator._executeWithAgent(
        { agent: 'generic', task: 'unknown_task' },
        { foo: 'bar' },
        { id: 'generic' }
      );
      expect(result.type).toBe('unknown_task');
      expect(result.result).toBe('completed');
    });
  });

  describe('cancelExecution', () => {
    it('should cancel an active execution', async () => {
      orchestrator.registerWorkflow('cancel_flow', {
        name: 'Cancel Flow',
        description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      const execPromise = orchestrator.execute('cancel_flow', {});
      const executions = orchestrator.getActiveExecutions();
      const execId = executions[0].id;

      const cancelled = await orchestrator.cancelExecution(execId);
      expect(cancelled).toBe(true);
      expect(orchestrator.getActiveExecutions()).toHaveLength(0);

      await execPromise;
    });

    it('should return false for non-existent execution', async () => {
      const result = await orchestrator.cancelExecution('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getExecution', () => {
    it('should return undefined for non-existent execution', () => {
      expect(orchestrator.getExecution('nonexistent')).toBeUndefined();
    });

    it('should find execution in active executions', async () => {
      orchestrator.registerWorkflow('get_active', {
        name: 'Get Active',
        description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      const runPromise = orchestrator.execute('get_active', {});
      const executions = orchestrator.getActiveExecutions();
      const execId = executions[0].id;
      const found = orchestrator.getExecution(execId);
      expect(found.id).toBe(execId);
      await runPromise;
    });

    it('should find execution in completed executions', async () => {
      orchestrator.registerWorkflow('get_done', {
        name: 'Get Done',
        description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      const result = await orchestrator.execute('get_done', {});
      const found = orchestrator.getExecution(result.id);
      expect(found).toBeDefined();
      expect(found.status).toBe('completed');
    });
  });

  describe('getActiveExecutions', () => {
    it('should return all active executions', async () => {
      orchestrator.registerWorkflow('active_flow', {
        name: 'Active Flow',
        description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      const runPromise = orchestrator.execute('active_flow', {});
      expect(orchestrator.getActiveExecutions()).toHaveLength(1);
      await runPromise;
    });
  });

  describe('getCompletedExecutions', () => {
    it('should respect limit parameter', async () => {
      orchestrator.registerWorkflow('wf', {
        name: 'WF', description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      for (let i = 0; i < 5; i++) {
        await orchestrator.execute('wf', {});
      }

      expect(orchestrator.getCompletedExecutions(3)).toHaveLength(3);
    });

    it('should return most recent executions', async () => {
      orchestrator.registerWorkflow('recent_wf', {
        name: 'Recent', description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      for (let i = 0; i < 3; i++) {
        await orchestrator.execute('recent_wf', {});
      }

      const recent = orchestrator.getCompletedExecutions(2);
      expect(recent).toHaveLength(2);
    });
  });

  describe('getWorkflow', () => {
    it('should return registered workflow', () => {
      const wf = orchestrator.getWorkflow('collect_analyze_report');
      expect(wf).toBeDefined();
      expect(wf.name).toBe('数据采集-分析-报告');
    });

    it('should return undefined for unknown workflow', () => {
      expect(orchestrator.getWorkflow('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllWorkflows', () => {
    it('should return all registered workflows', () => {
      const workflows = orchestrator.getAllWorkflows();
      expect(workflows).toHaveLength(5);
    });
  });

  describe('getStats', () => {
    it('should return zero stats initially', () => {
      const stats = orchestrator.getStats();
      expect(stats.workflows).toBe(5);
      expect(stats.activeExecutions).toBe(0);
      expect(stats.completedExecutions).toBe(0);
      expect(stats.successRate).toBe('0%');
      expect(stats.avgDuration).toBe('0ms');
    });

    it('should reflect completed executions', async () => {
      orchestrator.registerWorkflow('stats_wf', {
        name: 'Stats WF', description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      await orchestrator.execute('stats_wf', {});
      const stats = orchestrator.getStats();
      expect(stats.completedExecutions).toBe(1);
      expect(stats.successRate).toBe('100.00%');
      expect(stats.avgDuration).not.toBe('0ms');
    });

    it('should calculate success rate correctly with failures', async () => {
      const errFn = jest.fn();
      const o = new CollaborationOrchestrator({ onError: errFn, maxHistory: 50 });

      o.registerWorkflow('good_wf', {
        name: 'Good', description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      o.registerWorkflow('bad_wf', {
        name: 'Bad', description: 'desc',
        steps: [{ agent: 'a1', task: 'fail_step', input: 'd1', output: 'd2' }]
      });

      let callCount = 0;
      o.team = {
        getAgent: jest.fn(() => {
          callCount++;
          if (callCount <= 1) return null;
          throw new Error('fail');
        })
      };

      await o.execute('good_wf', {});
      await o.execute('bad_wf', {});

      const stats = o.getStats();
      expect(stats.completedExecutions).toBe(2);
      expect(stats.successRate).toBe('50.00%');

      o.destroy();
    });
  });

  describe('_archiveExecution', () => {
    it('should move execution from active to completed', async () => {
      orchestrator.registerWorkflow('archive_wf', {
        name: 'Archive', description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      await orchestrator.execute('archive_wf', {});
      expect(orchestrator.activeExecutions.size).toBe(0);
      expect(orchestrator.completedExecutions).toHaveLength(1);
    });

    it('should enforce maxHistory limit', async () => {
      const o = new CollaborationOrchestrator({ maxHistory: 3 });

      o.registerWorkflow('wf', {
        name: 'WF', description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      for (let i = 0; i < 10; i++) {
        await o.execute('wf', {});
      }

      expect(o.completedExecutions.length).toBeLessThanOrEqual(3);
      o.destroy();
    });
  });

  describe('destroy', () => {
    it('should cancel active executions and clear state', async () => {
      orchestrator.registerWorkflow('destroy_wf', {
        name: 'Destroy', description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      await orchestrator.execute('destroy_wf', {});
      orchestrator.destroy();

      expect(orchestrator.workflows.size).toBe(0);
      expect(orchestrator.activeExecutions.size).toBe(0);
      expect(orchestrator.completedExecutions).toEqual([]);
    });
  });

  describe('default workflows structure', () => {
    it('collect_analyze_report should have 4 steps', () => {
      const wf = orchestrator.getWorkflow('collect_analyze_report');
      expect(wf.steps).toHaveLength(4);
      expect(wf.steps[0].agent).toBe('collector');
      expect(wf.steps[3].agent).toBe('attester');
    });

    it('research_write_publish should have 4 steps', () => {
      const wf = orchestrator.getWorkflow('research_write_publish');
      expect(wf.steps).toHaveLength(4);
    });

    it('monitor_alert_action should have 3 steps', () => {
      const wf = orchestrator.getWorkflow('monitor_alert_action');
      expect(wf.steps).toHaveLength(3);
    });
  });

  describe('execute outer catch', () => {
    it('should handle onWorkflowComplete error via outer catch', async () => {
      const onComplete = jest.fn(() => { throw new Error('Callback crashed'); });
      const o = new CollaborationOrchestrator({ onWorkflowComplete: onComplete });

      o.registerWorkflow('outer_catch_wf', {
        name: 'Outer Catch',
        description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      await expect(o.execute('outer_catch_wf', {})).rejects.toThrow('Callback crashed');
      expect(o.completedExecutions).toHaveLength(1);
      expect(o.completedExecutions[0].status).toBe('failed');

      o.destroy();
    });
  });

  describe('_executeStep with agent', () => {
    it('should use agent from team when getAgent returns one', async () => {
      const mockAgent = { id: 'collector' };
      orchestrator.team = {
        getAgent: jest.fn().mockReturnValue(mockAgent)
      };

      orchestrator.registerWorkflow('agent_branch', {
        name: 'Agent Branch',
        description: 'desc',
        steps: [{ agent: 'collector', task: 'collect', output: 'd1' }]
      });

      const result = await orchestrator.execute('agent_branch', { url: 'http://test.com' });
      expect(result.status).toBe('completed');
      expect(result.results.d1.type).toBe('collection');
      expect(orchestrator.team.getAgent).toHaveBeenCalledWith('collector');
    });
  });

  describe('destroy with active executions', () => {
    it('should iterate active executions during destroy', () => {
      const o = new CollaborationOrchestrator({ maxHistory: 50 });

      o.registerWorkflow('active_destroy', {
        name: 'Active Destroy',
        description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      o.execute('active_destroy', {});
      o.destroy();

      expect(o.workflows.size).toBe(0);
      expect(o.activeExecutions.size).toBe(0);
      expect(o.completedExecutions).toEqual([]);
    });
  });

  describe('execute default context', () => {
    it('should use default empty context when not provided', async () => {
      orchestrator.registerWorkflow('noctx', {
        name: 'No Ctx',
        description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      const result = await orchestrator.execute('noctx');
      expect(result.status).toBe('completed');
      expect(result.context).toEqual({});
    });
  });

  describe('getCompletedExecutions default limit', () => {
    it('should use default limit of 50 when not specified', async () => {
      orchestrator.registerWorkflow('def_limit', {
        name: 'Default Limit',
        description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      for (let i = 0; i < 3; i++) {
        await orchestrator.execute('def_limit', {});
      }

      const result = orchestrator.getCompletedExecutions();
      expect(result).toHaveLength(3);
    });
  });

  describe('step without output', () => {
    it('should handle a step without output property', async () => {
      orchestrator.registerWorkflow('no_output', {
        name: 'No Output',
        description: 'desc',
        steps: [{ agent: 'a1', task: 'collect' }]
      });

      const result = await orchestrator.execute('no_output', {});
      expect(result.status).toBe('completed');
      expect(result.steps[0].status).toBe('completed');
    });
  });

  describe('cancel with invalid currentStep', () => {
    it('should not fail when currentStep is invalid', async () => {
      orchestrator.registerWorkflow('bad_cancel', {
        name: 'Bad Cancel',
        description: 'desc',
        steps: [{ agent: 'a1', task: 'collect', output: 'd1' }]
      });

      orchestrator.execute('bad_cancel', {});
      const exec = orchestrator.getActiveExecutions()[0];
      exec.currentStep = -1;
      const result = await orchestrator.cancelExecution(exec.id);
      expect(result).toBe(true);
    });
  });

  describe('avgDuration fallback', () => {
    it('should use Date.now() when completedAt is missing', () => {
      orchestrator.completedExecutions.push({
        id: 'corrupted',
        status: 'completed',
        startedAt: Date.now() - 5000,
        completedAt: null
      });
      const stats = orchestrator.getStats();
      expect(stats.avgDuration).not.toBe('0ms');
    });
  });
});
