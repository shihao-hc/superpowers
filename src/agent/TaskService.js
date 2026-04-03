/**
 * ShiHao Task Service
 * 基于 Claude Code 任务系统架构
 * 
 * Claude Code 特性:
 * - 多种任务类型: local_shell, local_agent, remote_agent, in_process_teammate
 * - 任务状态: pending, running, completed, failed, cancelled
 * - 任务状态转换验证
 * - 背景任务管理
 */

const EventEmitter = require('events');

const TASK_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled'];
const TASK_TYPES = ['local_shell', 'local_agent', 'remote_agent', 'in_process_teammate', 'local_workflow'];

class TaskService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.tasks = new Map();
    this.taskId = 0;
    
    // 最大并发任务数
    this.maxConcurrent = options.maxConcurrent || 10;
    
    // 任务状态验证
    this.stateMachine = {
      pending: ['running', 'cancelled'],
      running: ['completed', 'failed', 'cancelled'],
      completed: [],
      failed: ['running'], // 可以重试
      cancelled: []
    };
  }
  
  // 创建任务
  createTask(config) {
    const taskId = config.id || `task_${++this.taskId}`;
    
    const task = {
      id: taskId,
      type: config.type || 'local_shell',
      status: 'pending',
      name: config.name || taskId,
      description: config.description || '',
      createdAt: Date.now(),
      startTime: null,
      endTime: null,
      isBackgrounded: config.isBackgrounded || false,
      
      // 任务特定字段
      command: config.command || null,
      cwd: config.cwd || process.cwd(),
      agentId: config.agentId || null,
      remoteAgentId: config.remoteAgentId || null,
      messages: config.messages || [],
      input: config.input || {},
      output: null,
      error: null,
      exitCode: null,
      pid: null,
      
      // 元数据
      metadata: config.metadata || {},
      
      // 回调
      onProgress: config.onProgress || null,
      onComplete: config.onComplete || null,
      onError: config.onError || null
    };
    
    // 验证任务类型
    if (!TASK_TYPES.includes(task.type)) {
      throw new Error(`Invalid task type: ${task.type}`);
    }
    
    this.tasks.set(taskId, task);
    this.emit('taskCreated', { taskId, task });
    
    return task;
  }
  
  // 获取任务
  getTask(taskId) {
    return this.tasks.get(taskId);
  }
  
  // 获取所有任务
  getAllTasks() {
    return Array.from(this.tasks.values());
  }
  
  // 获取任务状态
  getTaskStatus(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    
    return {
      id: task.id,
      type: task.type,
      status: task.status,
      name: task.name,
      isBackgrounded: task.isBackgrounded,
      createdAt: task.createdAt,
      startTime: task.startTime,
      endTime: task.endTime,
      duration: task.startTime ? (task.endTime || Date.now()) - task.startTime : null
    };
  }
  
  // 验证状态转换
  _canTransition(currentStatus, newStatus) {
    const allowed = this.stateMachine[currentStatus] || [];
    return allowed.includes(newStatus);
  }
  
  // 更新任务状态
  updateTaskStatus(taskId, newStatus, data = {}) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    // 验证状态转换
    if (!this._canTransition(task.status, newStatus)) {
      throw new Error(`Invalid status transition: ${task.status} -> ${newStatus}`);
    }
    
    const oldStatus = task.status;
    task.status = newStatus;
    
    // 更新时间
    if (newStatus === 'running' && !task.startTime) {
      task.startTime = Date.now();
    }
    
    if (['completed', 'failed', 'cancelled'].includes(newStatus)) {
      task.endTime = Date.now();
    }
    
    // 更新额外数据
    if (data.output !== undefined) task.output = data.output;
    if (data.error !== undefined) task.error = data.error;
    if (data.exitCode !== undefined) task.exitCode = data.exitCode;
    if (data.pid !== undefined) task.pid = data.pid;
    
    this.emit('taskStatusChanged', { 
      taskId, 
      oldStatus, 
      newStatus,
      task 
    });
    
    return task;
  }
  
  // 启动任务
  async startTask(taskId, executor) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    if (task.status !== 'pending') {
      throw new Error(`Cannot start task in status: ${task.status}`);
    }
    
    // 检查并发限制
    const runningCount = this.getRunningTasks().length;
    if (runningCount >= this.maxConcurrent) {
      // 等待直到有槽位
      await new Promise(resolve => {
        const checkSlot = () => {
          if (this.getRunningTasks().length < this.maxConcurrent) {
            resolve();
          } else {
            setTimeout(checkSlot, 100);
          }
        };
        checkSlot();
      });
    }
    
    this.updateTaskStatus(taskId, 'running');
    
    try {
      const result = await executor(task);
      
      if (result !== undefined) {
        this.updateTaskStatus(taskId, 'completed', { output: result });
      } else {
        this.updateTaskStatus(taskId, 'completed');
      }
      
      if (task.onComplete) {
        task.onComplete(result);
      }
      
      return result;
      
    } catch (error) {
      this.updateTaskStatus(taskId, 'failed', { error: error.message });
      
      if (task.onError) {
        task.onError(error);
      }
      
      throw error;
    }
  }
  
  // 取消任务
  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    if (!['pending', 'running'].includes(task.status)) {
      throw new Error(`Cannot cancel task in status: ${task.status}`);
    }
    
    this.updateTaskStatus(taskId, 'cancelled');
    
    // 尝试终止进程
    if (task.pid) {
      try {
        process.kill(task.pid);
      } catch (e) {
        // 进程可能已结束
      }
    }
    
    this.emit('taskCancelled', { taskId });
    
    return task;
  }
  
  // 重试任务
  async retryTask(taskId, executor) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    if (task.status !== 'failed') {
      throw new Error(`Cannot retry task in status: ${task.status}`);
    }
    
    // 重置状态
    task.status = 'pending';
    task.startTime = null;
    task.endTime = null;
    task.output = null;
    task.error = null;
    task.exitCode = null;
    
    this.emit('taskRetried', { taskId });
    
    return this.startTask(taskId, executor);
  }
  
  // 获取运行中的任务
  getRunningTasks() {
    return this.getAllTasks().filter(t => t.status === 'running');
  }
  
  // 获取背景任务
  getBackgroundTasks() {
    return this.getAllTasks().filter(t => 
      t.isBackgrounded && 
      ['pending', 'running'].includes(t.status)
    );
  }
  
  // 检查是否是背景任务
  isBackgroundTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    
    if (task.status !== 'running' && task.status !== 'pending') {
      return false;
    }
    
    return task.isBackgrounded !== false;
  }
  
  // 移除任务
  removeTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    
    // 不能移除运行中的任务
    if (task.status === 'running') {
      throw new Error('Cannot remove running task');
    }
    
    this.tasks.delete(taskId);
    this.emit('taskRemoved', { taskId });
    
    return true;
  }
  
  // 清理已完成的任务
  cleanup(completed = true, failed = true, cancelled = true) {
    const toRemove = [];
    
    for (const [id, task] of this.tasks) {
      if (completed && task.status === 'completed') toRemove.push(id);
      if (failed && task.status === 'failed') toRemove.push(id);
      if (cancelled && task.status === 'cancelled') toRemove.push(id);
    }
    
    for (const id of toRemove) {
      this.tasks.delete(id);
    }
    
    this.emit('cleanup', { removed: toRemove.length });
    
    return toRemove.length;
  }
  
  // 获取统计
  getStats() {
    const tasks = this.getAllTasks();
    
    return {
      total: tasks.length,
      byStatus: tasks.reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      }, {}),
      byType: tasks.reduce((acc, t) => {
        acc[t.type] = (acc[t.type] || 0) + 1;
        return acc;
      }, {}),
      running: tasks.filter(t => t.status === 'running').length,
      background: this.getBackgroundTasks().length,
      concurrent: this.getRunningTasks().length
    };
  }
}

module.exports = { TaskService, TASK_STATUSES, TASK_TYPES };
