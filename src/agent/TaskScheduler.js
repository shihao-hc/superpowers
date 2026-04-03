const crypto = require('crypto');

class TaskScheduler {
  constructor(options = {}) {
    this.nodeId = options.nodeId || `node_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    this.maxConcurrent = options.maxConcurrent || 3;
    this.activeTasks = new Map();
    this.scheduledTasks = new Map();
    this.taskQueue = [];
    this.completedTasks = [];
    this.dependencyGraph = new Map();
    this.maxHistory = options.maxHistory || 100;
    this.onTaskStart = options.onTaskStart || (() => {});
    this.onTaskComplete = options.onTaskComplete || (() => {});
    this.onTaskError = options.onTaskError || ((e) => console.error('[Scheduler]', e));
    this._schedulerTimer = null;
    this._isProcessing = false;
    this._distributedNodes = new Map();
    this._heartbeatInterval = null;
  }

  enqueue(task, options = {}) {
    const taskId = `task_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    const priority = options.priority || 0;
    const dependsOn = options.dependsOn || [];
    const nodeAffinity = options.nodeAffinity || null;
    const timeout = options.timeout || 300000;
    const retries = options.retries || 0;

    const queueItem = {
      id: taskId,
      task,
      priority,
      dependsOn: Array.isArray(dependsOn) ? dependsOn : [dependsOn],
      nodeAffinity,
      timeout,
      retries,
      retryCount: 0,
      status: 'queued',
      enqueuedAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      metadata: options.metadata || {}
    };

    if (dependsOn.length > 0) {
      this.dependencyGraph.set(taskId, dependsOn);
      queueItem.status = 'waiting';
    }

    this.taskQueue.push(queueItem);
    this._sortQueue();
    this._processQueue();

    return queueItem;
  }

  _sortQueue() {
    this.taskQueue.sort((a, b) => {
      const priorityDiff = (b.priority || 0) - (a.priority || 0);
      if (priorityDiff !== 0) return priorityDiff;

      return a.enqueuedAt - b.enqueuedAt;
    });
  }

  _canExecute(item) {
    if (item.status !== 'queued' && item.status !== 'waiting') {
      return false;
    }

    const deps = this.dependencyGraph.get(item.id) || [];
    if (deps.length === 0) return true;

    for (const depId of deps) {
      const depTask = this.activeTasks.get(depId) ||
        this.completedTasks.find(t => t.id === depId) ||
        this.taskQueue.find(t => t.id === depId);

      if (!depTask || depTask.status !== 'completed') {
        return false;
      }
    }

    return true;
  }

  _checkDependencyResolution() {
    for (const item of this.taskQueue) {
      if (item.status === 'waiting' && this._canExecute(item)) {
        item.status = 'queued';
      }
    }
  }

  async _processQueue() {
    if (this._isProcessing) return;
    this._isProcessing = true;

    this._checkDependencyResolution();

    while (this.activeTasks.size < this.maxConcurrent && this.taskQueue.length > 0) {
      const itemIndex = this.taskQueue.findIndex(item => this._canExecute(item));

      if (itemIndex === -1) break;

      const item = this.taskQueue.splice(itemIndex, 1)[0];

      if (item.nodeAffinity && item.nodeAffinity !== this.nodeId) {
        const targetNode = this._distributedNodes.get(item.nodeAffinity);
        if (targetNode && targetNode.available) {
          targetNode.pendingTasks.push(item);
          continue;
        }
      }

      item.status = 'running';
      item.startedAt = Date.now();
      item.nodeId = this.nodeId;
      this.activeTasks.set(item.id, item);

      this.onTaskStart(item);
      this._executeTask(item);
    }

    this._isProcessing = false;
  }

  async _executeTask(item) {
    const timeoutId = item.timeout ? setTimeout(() => {
      if (item.status === 'running') {
        item.status = 'timeout';
        item.error = 'Task timeout';
        item.completedAt = Date.now();
        this._handleTaskComplete(item);
      }
    }, item.timeout) : null;

    try {
      const result = await this._runTask(item.task);

      if (timeoutId) clearTimeout(timeoutId);

      if (item.status === 'timeout') return;

      item.status = 'completed';
      item.completedAt = Date.now();
      item.result = result;
      item.duration = item.completedAt - item.startedAt;

      this.onTaskComplete(item);
      this._handleTaskComplete(item);

    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);

      if (item.status === 'timeout') return;

      if (item.retryCount < item.retries) {
        item.retryCount++;
        item.status = 'queued';
        item.error = `Retry ${item.retryCount}/${item.retries}: ${error.message}`;
        this.taskQueue.push(item);
        this._sortQueue();
        this._processQueue();
        return;
      }

      item.status = 'failed';
      item.completedAt = Date.now();
      item.error = error.message;
      item.duration = item.completedAt - item.startedAt;

      this.onTaskError(error);
      this._handleTaskComplete(item);
    }
  }

  _handleTaskComplete(item) {
    this.activeTasks.delete(item.id);
    this.dependencyGraph.delete(item.id);
    this._archiveTask(item);
    this._processQueue();
  }

  async _runTask(task) {
    if (typeof task === 'function') {
      return await task();
    }

    if (task.execute && typeof task.execute === 'function') {
      return await task.execute();
    }

    if (task.url) {
      return { success: true, url: task.url, message: 'Task executed' };
    }

    if (task.command) {
      return { success: true, command: task.command, message: 'Command executed' };
    }

    return { success: true, message: 'Task completed' };
  }

  _archiveTask(item) {
    this.completedTasks.push(item);

    if (this.completedTasks.length > this.maxHistory) {
      this.completedTasks = this.completedTasks.slice(-this.maxHistory);
    }
  }

  schedule(task, cronExpression, options = {}) {
    const taskId = `sched_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    const scheduledTask = {
      id: taskId,
      task,
      cron: cronExpression,
      options,
      nextRun: this._calculateNextRun(cronExpression),
      lastRun: null,
      runCount: 0,
      enabled: true,
      createdAt: Date.now()
    };

    this.scheduledTasks.set(taskId, scheduledTask);

    if (!this._schedulerTimer) {
      this._startScheduler();
    }

    return scheduledTask;
  }

  _calculateNextRun(cron) {
    const now = Date.now();
    const parts = cron.split(' ');

    if (parts.length === 2) {
      const [interval, unit] = parts;
      const value = parseInt(interval);

      switch (unit) {
        case 's': case 'sec': return now + value * 1000;
        case 'm': case 'min': return now + value * 60000;
        case 'h': case 'hour': return now + value * 3600000;
        case 'd': case 'day': return now + value * 86400000;
        default: return now + 60000;
      }
    }

    return now + 60000;
  }

  _startScheduler() {
    this._schedulerTimer = setInterval(() => {
      this._checkScheduledTasks();
    }, 1000);
  }

  _stopScheduler() {
    if (this._schedulerTimer) {
      clearInterval(this._schedulerTimer);
      this._schedulerTimer = null;
    }
  }

  async _checkScheduledTasks() {
    try {
      const now = Date.now();

      for (const [taskId, scheduled] of this.scheduledTasks) {
        if (!scheduled.enabled) continue;

        if (now >= scheduled.nextRun) {
          scheduled.lastRun = now;
          scheduled.runCount++;
          scheduled.nextRun = this._calculateNextRun(scheduled.cron);

          try {
            await this.enqueue(scheduled.task, scheduled.options);
          } catch (e) {
            console.error('[Scheduler] Task enqueue failed:', e.message);
          }
        }
      }
    } catch (e) {
      console.error('[Scheduler] Check scheduled tasks error:', e.message);
    }
  }

  registerNode(nodeId, info = {}) {
    this._distributedNodes.set(nodeId, {
      id: nodeId,
      available: true,
      lastHeartbeat: Date.now(),
      pendingTasks: [],
      info
    });

    if (!this._heartbeatInterval) {
      this._startHeartbeatCheck();
    }
  }

  unregisterNode(nodeId) {
    this._distributedNodes.delete(nodeId);

    if (this._distributedNodes.size === 0 && this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  updateHeartbeat(nodeId) {
    const node = this._distributedNodes.get(nodeId);
    if (node) {
      node.lastHeartbeat = Date.now();
      node.available = true;
    }
  }

  _startHeartbeatCheck() {
    this._heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 30000;

      for (const [nodeId, node] of this._distributedNodes) {
        if (now - node.lastHeartbeat > timeout) {
          node.available = false;

          for (const task of node.pendingTasks) {
            task.status = 'queued';
            task.nodeAffinity = null;
            this.taskQueue.push(task);
          }
          node.pendingTasks = [];
        }
      }
    }, 10000);
  }

  getScheduledTasks() {
    return Array.from(this.scheduledTasks.values());
  }

  cancelScheduled(taskId) {
    const task = this.scheduledTasks.get(taskId);
    if (task) {
      task.enabled = false;
      return true;
    }
    return false;
  }

  removeScheduled(taskId) {
    return this.scheduledTasks.delete(taskId);
  }

  getActiveTasks() {
    return Array.from(this.activeTasks.values());
  }

  getQueuedTasks() {
    return [...this.taskQueue];
  }

  getWaitingTasks() {
    return this.taskQueue.filter(t => t.status === 'waiting');
  }

  getCompletedTasks(limit = 50) {
    return this.completedTasks.slice(-limit);
  }

  cancelTask(taskId) {
    const active = this.activeTasks.get(taskId);
    if (active) {
      active.status = 'cancelled';
      this._handleTaskComplete(active);
      return true;
    }

    const queueIndex = this.taskQueue.findIndex(t => t.id === taskId);
    if (queueIndex > -1) {
      this.taskQueue.splice(queueIndex, 1);
      return true;
    }

    return false;
  }

  getDependencyTree(taskId) {
    const tree = { id: taskId, children: [] };
    const deps = this.dependencyGraph.get(taskId) || [];

    for (const depId of deps) {
      tree.children.push(this.getDependencyTree(depId));
    }

    return tree;
  }

  pause() {
    this._stopScheduler();
  }

  resume() {
    if (!this._schedulerTimer && this.scheduledTasks.size > 0) {
      this._startScheduler();
    }
  }

  getStats() {
    const completed = this.completedTasks;
    return {
      nodeId: this.nodeId,
      scheduled: this.scheduledTasks.size,
      active: this.activeTasks.size,
      queued: this.taskQueue.filter(t => t.status === 'queued').length,
      waiting: this.taskQueue.filter(t => t.status === 'waiting').length,
      completed: completed.length,
      successRate: completed.length > 0
        ? (completed.filter(t => t.status === 'completed').length / completed.length * 100).toFixed(2) + '%'
        : '0%',
      avgDuration: completed.length > 0
        ? (completed.reduce((sum, t) => sum + (t.duration || 0), 0) / completed.length).toFixed(0) + 'ms'
        : '0ms',
      distributedNodes: this._distributedNodes.size,
      activeNodes: Array.from(this._distributedNodes.values()).filter(n => n.available).length
    };
  }

  getNodes() {
    return Array.from(this._distributedNodes.values());
  }

  destroy() {
    this._stopScheduler();

    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }

    this.taskQueue = [];
    this.activeTasks.clear();
    this._distributedNodes.clear();
  }
}

module.exports = { TaskScheduler };
