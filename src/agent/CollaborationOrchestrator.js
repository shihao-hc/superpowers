const crypto = require('crypto');

class CollaborationOrchestrator {
  constructor(options = {}) {
    this.team = options.team || null;
    this.workflows = new Map();
    this.activeExecutions = new Map();
    this.completedExecutions = [];
    this.maxHistory = options.maxHistory || 100;
    this.onStepComplete = options.onStepComplete || (() => {});
    this.onWorkflowComplete = options.onWorkflowComplete || (() => {});
    this.onError = options.onError || ((e) => console.error('[Orchestrator]', e));

    this._registerDefaultWorkflows();
  }

  _registerDefaultWorkflows() {
    this.registerWorkflow('collect_analyze_report', {
      name: '数据采集-分析-报告',
      description: '端到端数据分析流程',
      icon: '📊',
      steps: [
        { agent: 'collector', task: 'collect', output: 'rawData' },
        { agent: 'analyzer', task: 'analyze', input: 'rawData', output: 'analysis' },
        { agent: 'reporter', task: 'report', input: 'analysis', output: 'report' },
        { agent: 'attester', task: 'attest', input: 'report', output: 'attestation' }
      ]
    });

    this.registerWorkflow('research_write_publish', {
      name: '研究-写作-发布',
      description: '内容创作全流程',
      icon: '📝',
      steps: [
        { agent: 'researcher', task: 'research', output: 'research' },
        { agent: 'writer', task: 'write', input: 'research', output: 'draft' },
        { agent: 'reviewer', task: 'review', input: 'draft', output: 'review' },
        { agent: 'publisher', task: 'publish', input: 'review', output: 'published' }
      ]
    });

    this.registerWorkflow('monitor_alert_action', {
      name: '监控-告警-执行',
      description: '自动化运维流程',
      icon: '🔔',
      steps: [
        { agent: 'monitor', task: 'monitor', output: 'metrics' },
        { agent: 'alertor', task: 'analyze', input: 'metrics', output: 'alerts' },
        { agent: 'executor', task: 'execute', input: 'alerts', output: 'actions' }
      ]
    });

    this.registerWorkflow('extract_transform_load', {
      name: 'ETL数据管道',
      description: '数据抽取-转换-加载',
      icon: '🔄',
      steps: [
        { agent: 'extractor', task: 'extract', output: 'raw' },
        { agent: 'transformer', task: 'transform', input: 'raw', output: 'transformed' },
        { agent: 'loader', task: 'load', input: 'transformed', output: 'loaded' }
      ]
    });

    this.registerWorkflow('scrape_verify_store', {
      name: '采集-验证-存储',
      description: '数据采集并上链存证',
      icon: '🔗',
      steps: [
        { agent: 'scraper', task: 'scrape', output: 'data' },
        { agent: 'verifier', task: 'verify', input: 'data', output: 'verified' },
        { agent: 'attester', task: 'attest', input: 'verified', output: 'attestation' }
      ]
    });
  }

  registerWorkflow(workflowId, config) {
    this.workflows.set(workflowId, {
      id: workflowId,
      name: config.name,
      description: config.description,
      icon: config.icon || '⚙️',
      steps: config.steps,
      createdAt: Date.now()
    });
  }

  async execute(workflowId, context = {}) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const executionId = `exec_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    const execution = {
      id: executionId,
      workflowId,
      workflowName: workflow.name,
      status: 'running',
      steps: workflow.steps.map((step, i) => ({
        ...step,
        index: i,
        status: 'pending',
        result: null,
        error: null,
        startTime: null,
        endTime: null
      })),
      context: { ...context },
      results: {},
      startedAt: Date.now(),
      completedAt: null,
      currentStep: 0
    };

    this.activeExecutions.set(executionId, execution);

    try {
      for (let i = 0; i < execution.steps.length; i++) {
        const step = execution.steps[i];
        execution.currentStep = i;
        step.status = 'running';
        step.startTime = Date.now();

        const input = step.input ? execution.results[step.input] : context;

        try {
          const result = await this._executeStep(step, input);

          step.status = 'completed';
          step.endTime = Date.now();
          step.result = result;

          if (step.output) {
            execution.results[step.output] = result;
          }

          this.onStepComplete({
            executionId,
            stepIndex: i,
            step: step.task,
            result,
            duration: step.endTime - step.startTime
          });

        } catch (error) {
          step.status = 'failed';
          step.endTime = Date.now();
          step.error = error.message;

          execution.status = 'failed';
          execution.completedAt = Date.now();
          execution.error = `Step ${i} (${step.task}) failed: ${error.message}`;

          this.onError(error);
          this._archiveExecution(execution);

          return execution;
        }
      }

      execution.status = 'completed';
      execution.completedAt = Date.now();

      this.onWorkflowComplete(execution);
      this._archiveExecution(execution);

      return execution;

    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;
      execution.completedAt = Date.now();

      this._archiveExecution(execution);
      throw error;
    }
  }

  async _executeStep(step, input) {
    if (this.team) {
      const agent = this.team.getAgent(step.agent);
      if (agent) {
        return await this._executeWithAgent(step, input, agent);
      }
    }

    return await this._executeDefault(step, input);
  }

  async _executeWithAgent(step, input, agent) {
    const task = {
      type: step.task,
      input,
      agentId: agent.id
    };

    if (step.task === 'collect') {
      return { type: 'collection', data: input?.url ? ['data1', 'data2'] : [], timestamp: Date.now() };
    }

    if (step.task === 'analyze') {
      return { type: 'analysis', summary: 'Analysis complete', metrics: { count: 100 }, timestamp: Date.now() };
    }

    if (step.task === 'report') {
      return { type: 'report', title: 'Generated Report', content: 'Report content', timestamp: Date.now() };
    }

    if (step.task === 'attest') {
      return { type: 'attestation', hash: crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex'), timestamp: Date.now() };
    }

    return { type: step.task, result: 'completed', input, timestamp: Date.now() };
  }

  async _executeDefault(step, input) {
    await new Promise(r => setTimeout(r, 100));

    return {
      type: step.task,
      agent: step.agent,
      result: 'completed',
      input,
      timestamp: Date.now()
    };
  }

  _archiveExecution(execution) {
    this.activeExecutions.delete(execution.id);
    this.completedExecutions.push(execution);

    if (this.completedExecutions.length > this.maxHistory) {
      this.completedExecutions = this.completedExecutions.slice(-this.maxHistory);
    }
  }

  getExecution(executionId) {
    return this.activeExecutions.get(executionId) ||
      this.completedExecutions.find(e => e.id === executionId);
  }

  getActiveExecutions() {
    return Array.from(this.activeExecutions.values());
  }

  getCompletedExecutions(limit = 50) {
    return this.completedExecutions.slice(-limit);
  }

  getWorkflow(workflowId) {
    return this.workflows.get(workflowId);
  }

  getAllWorkflows() {
    return Array.from(this.workflows.values());
  }

  async cancelExecution(executionId) {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return false;

    execution.status = 'cancelled';
    execution.completedAt = Date.now();

    const currentStep = execution.steps[execution.currentStep];
    if (currentStep) {
      currentStep.status = 'cancelled';
      currentStep.endTime = Date.now();
    }

    this._archiveExecution(execution);
    return true;
  }

  getStats() {
    const completed = this.completedExecutions;
    return {
      workflows: this.workflows.size,
      activeExecutions: this.activeExecutions.size,
      completedExecutions: completed.length,
      successRate: completed.length > 0
        ? (completed.filter(e => e.status === 'completed').length / completed.length * 100).toFixed(2) + '%'
        : '0%',
      avgDuration: completed.length > 0
        ? (completed.reduce((sum, e) => sum + ((e.completedAt || Date.now()) - e.startedAt), 0) / completed.length).toFixed(0) + 'ms'
        : '0ms'
    };
  }

  destroy() {
    for (const [execId] of this.activeExecutions) {
      this.cancelExecution(execId);
    }
    this.workflows.clear();
    this.activeExecutions.clear();
    this.completedExecutions = [];
  }
}

module.exports = { CollaborationOrchestrator };
