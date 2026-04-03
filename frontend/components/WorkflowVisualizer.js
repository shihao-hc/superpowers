class WorkflowVisualizer {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = null;
    this.workflows = [];
    this.executions = [];
    this.selectedWorkflow = null;
    this.refreshInterval = options.refreshInterval || 5000;
    this._refreshTimer = null;
    this.onExecute = options.onExecute || (() => {});
  }

  async init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) return;

    await this.loadData();
    this.render();
    this.startAutoRefresh();
  }

  async loadData() {
    try {
      const [wfRes, execRes] = await Promise.all([
        fetch('/api/workflows'),
        fetch('/api/executions')
      ]);

      if (wfRes.ok) this.workflows = await wfRes.json();
      if (execRes.ok) this.executions = await execRes.json();
    } catch (e) {
      console.warn('[WorkflowVisualizer] Load failed:', e);
    }
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="workflow-visualizer">
        <div class="workflow-header">
          <h4>🔄 Agent 工作流</h4>
          <div class="workflow-stats">
            <span class="stat">流程: ${this.workflows.length}</span>
            <span class="stat success">完成: ${this.executions.filter(e => e.status === 'completed').length}</span>
          </div>
        </div>
        <div class="workflow-grid" id="workflow-grid"></div>
        <div class="execution-list" id="execution-list"></div>
      </div>
    `;

    this.renderWorkflows();
    this.renderExecutions();
  }

  renderWorkflows() {
    const grid = document.getElementById('workflow-grid');
    if (!grid) return;

    grid.innerHTML = '';

    this.workflows.forEach(wf => {
      const card = document.createElement('div');
      card.className = `workflow-card ${this.selectedWorkflow === wf.id ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="wf-icon">${wf.icon || '⚙️'}</div>
        <div class="wf-info">
          <div class="wf-name">${this.escapeHtml(wf.name)}</div>
          <div class="wf-desc">${this.escapeHtml(wf.description)}</div>
          <div class="wf-steps">
            ${(wf.steps || []).map((s, i) => `
              <span class="step-badge ${i > 0 ? 'connected' : ''}">${this.escapeHtml(s.agent || s.task || '')}</span>
            `).join('')}
          </div>
        </div>
        <button class="wf-run-btn" data-id="${wf.id}">▶ 运行</button>
      `;

      card.querySelector('.wf-run-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.executeWorkflow(wf.id);
      });

      card.addEventListener('click', () => {
        this.selectedWorkflow = wf.id;
        this.renderWorkflows();
      });

      grid.appendChild(card);
    });
  }

  renderExecutions() {
    const list = document.getElementById('execution-list');
    if (!list) return;

    list.innerHTML = '';

    if (this.executions.length === 0) {
      list.innerHTML = '<div class="empty-state">暂无执行记录</div>';
      return;
    }

    this.executions.slice().reverse().forEach(exec => {
      const card = this.createExecutionCard(exec);
      list.appendChild(card);
    });
  }

  createExecutionCard(exec) {
    const card = document.createElement('div');
    card.className = `execution-card status-${exec.status}`;

    const statusIcons = {
      running: '🔄',
      completed: '✅',
      failed: '❌',
      cancelled: '🚫'
    };

    const statusText = {
      running: '执行中',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消'
    };

    const duration = exec.completedAt
      ? `${((exec.completedAt - exec.startedAt) / 1000).toFixed(1)}秒`
      : '进行中';

    const progress = exec.steps
      ? `${exec.steps.filter(s => s.status === 'completed').length}/${exec.steps.length}`
      : '-';

    card.innerHTML = `
      <div class="exec-header">
        <span class="exec-status">${statusIcons[exec.status] || '❓'}</span>
        <span class="exec-name">${this.escapeHtml(exec.workflowName || exec.workflowId)}</span>
        <span class="exec-time">${new Date(exec.startedAt).toLocaleTimeString()}</span>
      </div>
      <div class="exec-body">
        <div class="exec-steps-visual">
          ${(exec.steps || []).map((step, i) => `
            <div class="step-node status-${step.status}">
              <div class="step-circle">${i + 1}</div>
              <div class="step-label">${step.agent || step.task}</div>
              ${i < exec.steps.length - 1 ? '<div class="step-line"></div>' : ''}
            </div>
          `).join('')}
        </div>
        <div class="exec-meta">
          <span>进度: ${progress}</span>
          <span>耗时: ${duration}</span>
          <span>状态: ${statusText[exec.status]}</span>
        </div>
        ${exec.error ? `<div class="exec-error">错误: ${this.escapeHtml(exec.error)}</div>` : ''}
      </div>
      ${exec.status === 'running' ? `
        <div class="exec-actions">
          <button class="btn-cancel" data-id="${exec.id}">取消</button>
        </div>
      ` : ''}
    `;

    card.querySelector('.btn-cancel')?.addEventListener('click', async () => {
      await fetch(`/api/executions/${exec.id}/cancel`, { method: 'POST' });
      await this.loadData();
      this.render();
    });

    return card;
  }

  async executeWorkflow(workflowId) {
    try {
      const response = await fetch('/api/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId })
      });

      const result = await response.json();
      this.onExecute(result);

      await this.loadData();
      this.render();
    } catch (e) {
      console.error('[WorkflowVisualizer] Execute failed:', e);
    }
  }

  startAutoRefresh() {
    this._refreshTimer = setInterval(async () => {
      await this.loadData();
      this.renderExecutions();
    }, this.refreshInterval);
  }

  stopAutoRefresh() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  destroy() {
    this.stopAutoRefresh();
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

if (typeof window !== 'undefined') {
  window.WorkflowVisualizer = WorkflowVisualizer;
}
