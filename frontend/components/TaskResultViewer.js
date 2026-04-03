class TaskResultViewer {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = null;
    this.tasks = [];
    this.templates = [];
    this.onTaskSelect = options.onTaskSelect || (() => {});
    this.refreshInterval = options.refreshInterval || 5000;
    this._refreshTimer = null;
  }

  async init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) return;

    await this.loadTemplates();
    this.render();
    this.startAutoRefresh();
  }

  async loadTemplates() {
    try {
      const response = await fetch('/api/agent/templates');
      if (response.ok) {
        this.templates = await response.json();
      }
    } catch (e) {
      console.warn('[TaskViewer] Failed to load templates:', e);
    }
  }

  async loadTasks() {
    try {
      const response = await fetch('/api/agent/tasks');
      if (response.ok) {
        this.tasks = await response.json();
      }
    } catch (e) {
      console.warn('[TaskViewer] Failed to load tasks:', e);
    }
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="task-viewer">
        <div class="task-header">
          <h4>🤖 Agent 任务</h4>
          <div class="task-stats">
            <span class="stat" id="task-stat-total">总计: 0</span>
            <span class="stat success" id="task-stat-completed">完成: 0</span>
            <span class="stat error" id="task-stat-failed">失败: 0</span>
          </div>
        </div>
        <div class="task-templates" id="task-templates"></div>
        <div class="task-list" id="task-list-content"></div>
      </div>
    `;

    this.renderTemplates();
    this.renderTasks();
  }

  renderTemplates() {
    const container = document.getElementById('task-templates');
    if (!container) return;

    container.innerHTML = '';

    this.templates.forEach(template => {
      const btn = document.createElement('button');
      btn.className = 'template-btn';
      btn.innerHTML = `
        <span class="template-icon">${this.escapeHtml(template.icon || '📋')}</span>
        <span class="template-name">${this.escapeHtml(template.name)}</span>
      `;
      btn.title = template.description;
      btn.addEventListener('click', () => this.onTemplateSelect(template));
      container.appendChild(btn);
    });
  }

  renderTasks() {
    const container = document.getElementById('task-list-content');
    if (!container) return;

    container.innerHTML = '';

    if (this.tasks.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无任务，点击上方模板创建</div>';
      return;
    }

    this.tasks.slice().reverse().forEach(task => {
      const card = this.createTaskCard(task);
      container.appendChild(card);
    });

    this.updateStats();
  }

  createTaskCard(task) {
    const card = document.createElement('div');
    card.className = `task-card status-${task.status}`;

    const statusIcons = {
      pending: '⏳',
      running: '🔄',
      completed: '✅',
      failed: '❌',
      cancelled: '🚫'
    };

    const statusText = {
      pending: '等待中',
      running: '执行中',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消'
    };

    const duration = task.duration
      ? `${(task.duration / 1000).toFixed(1)}秒`
      : task.endTime ? '-' : '进行中';

    card.innerHTML = `
      <div class="task-card-header">
        <span class="task-status-icon">${statusIcons[task.status] || '❓'}</span>
        <span class="task-title">${this.escapeHtml(task.config?.goal || task.config?.template || '未知任务')}</span>
        <span class="task-time">${new Date(task.startTime).toLocaleTimeString()}</span>
      </div>
      <div class="task-card-body">
        <div class="task-meta">
          <span class="meta-item">状态: ${statusText[task.status]}</span>
          <span class="meta-item">耗时: ${duration}</span>
          <span class="meta-item">步骤: ${task.steps?.length || 0}</span>
        </div>
        ${task.result ? `<div class="task-result">${this.escapeHtml(String(task.result).substring(0, 200))}</div>` : ''}
        ${task.error ? `<div class="task-error">错误: ${this.escapeHtml(task.error)}</div>` : ''}
        ${task.screenshots?.length > 0 ? `
          <div class="task-screenshots">
            <div class="screenshot-preview">
              <img src="data:image/png;base64,${task.screenshots[task.screenshots.length - 1].data}" alt="截图" />
            </div>
          </div>
        ` : ''}
        ${task.extractedData?.length > 0 ? `
          <div class="task-data">
            <div class="data-header">提取数据 (${task.extractedData.length}项)</div>
            <div class="data-content">
              ${task.extractedData.slice(0, 3).map(d => `
                <div class="data-item">${this.escapeHtml(String(d.data).substring(0, 100))}</div>
              `).join('')}
              ${task.extractedData.length > 3 ? `<div class="data-more">...还有 ${task.extractedData.length - 3} 项</div>` : ''}
            </div>
          </div>
        ` : ''}
      </div>
      <div class="task-card-actions">
        <button class="task-action" data-action="details" data-id="${task.id}">详情</button>
        ${task.status === 'running' ? `<button class="task-action danger" data-action="cancel" data-id="${task.id}">取消</button>` : ''}
      </div>
    `;

    card.querySelectorAll('.task-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        const id = e.target.dataset.id;
        this.handleAction(action, id);
      });
    });

    return card;
  }

  async handleAction(action, taskId) {
    switch (action) {
      case 'details':
        this.showTaskDetails(taskId);
        break;
      case 'cancel':
        await this.cancelTask(taskId);
        break;
    }
  }

  showTaskDetails(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    this.onTaskSelect(task);
  }

  async cancelTask(taskId) {
    try {
      await fetch(`/api/agent/tasks/${taskId}/cancel`, { method: 'POST' });
      await this.loadTasks();
      this.renderTasks();
    } catch (e) {
      console.error('[TaskViewer] Cancel failed:', e);
    }
  }

  updateStats() {
    const total = this.tasks.length;
    const completed = this.tasks.filter(t => t.status === 'completed').length;
    const failed = this.tasks.filter(t => t.status === 'failed').length;

    const totalEl = document.getElementById('task-stat-total');
    const completedEl = document.getElementById('task-stat-completed');
    const failedEl = document.getElementById('task-stat-failed');

    if (totalEl) totalEl.textContent = `总计: ${total}`;
    if (completedEl) completedEl.textContent = `完成: ${completed}`;
    if (failedEl) failedEl.textContent = `失败: ${failed}`;
  }

  onTemplateSelect(template) {
    const modal = document.getElementById('task-modal');
    const commandInput = document.getElementById('task-command');

    if (commandInput) {
      const paramStr = template.params.map(p => `[${p}]`).join(' ');
      commandInput.value = `${template.name}: ${paramStr}`;
      commandInput.placeholder = template.description;
    }

    if (modal) {
      modal.classList.add('show');
    }
  }

  startAutoRefresh() {
    this._refreshTimer = setInterval(async () => {
      await this.loadTasks();
      this.renderTasks();
    }, this.refreshInterval);
  }

  stopAutoRefresh() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
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
  window.TaskResultViewer = TaskResultViewer;
}
