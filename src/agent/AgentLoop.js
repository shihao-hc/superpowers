/**
 * AgentLoop v2 - 感知-思考-行动 循环 (增强版)
 * 借鉴 Claude Code Agent 循环设计
 *
 * v2 新增特性 (来自 Claude Code):
 * - Background Task Tracking: 后台任务状态机
 * - Result Holdback: 等待后台任务完成后发送结果
 * - 命令批处理: 合并连续同类型命令
 * - 任务优先级: 支持优先级队列
 * - 生命周期钩子: onTaskStart, onTaskComplete, onBackgroundTask 等
 */

const EventEmitter = require('events');

// BrainFlow 集成
let BrainFlow;
try { BrainFlow = require('../core/BrainFlow'); } catch (e) {}

let brainFlow = null;

/**
 * 获取 BrainFlow 实例
 */
function getBrainFlow() {
  if (!brainFlow && BrainFlow) {
    brainFlow = new BrainFlow();
  }
  return brainFlow;
}

/**
 * 后台任务状态
 */
const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * 后台任务类
 */
class BackgroundTask {
  constructor(options = {}) {
    this.id = options.id || this._generateId();
    this.name = options.name || 'unnamed';
    this.type = options.type || 'generic';
    this.status = TaskStatus.PENDING;
    this.priority = options.priority || 0;
    this.startTime = null;
    this.endTime = null;
    this.result = null;
    this.error = null;
    this.metadata = options.metadata || {};
    this.abortController = new AbortController();
    this.listeners = new Map();
  }

  _generateId() {
    return `bg_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  start() {
    this.status = TaskStatus.RUNNING;
    this.startTime = Date.now();
    this._emit('start', { task: this });
  }

  complete(result) {
    this.status = TaskStatus.COMPLETED;
    this.endTime = Date.now();
    this.result = result;
    this._emit('complete', { task: this, result });
  }

  fail(error) {
    this.status = TaskStatus.FAILED;
    this.endTime = Date.now();
    this.error = error instanceof Error ? error.message : error;
    this._emit('fail', { task: this, error: this.error });
  }

  cancel() {
    if (this.status === TaskStatus.PENDING || this.status === TaskStatus.RUNNING) {
      this.status = TaskStatus.CANCELLED;
      this.endTime = Date.now();
      this.abortController.abort();
      this._emit('cancel', { task: this });
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  removeAllListeners(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  _emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    for (const cb of callbacks) {
      try {
        cb(data);
      } catch (error) {
        this.logger?.error(`Event callback error for ${event}: ${error.message}`);
      }
    }
  }

  getDuration() {
    if (!this.startTime) {return 0;}
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: this.status,
      priority: this.priority,
      duration: this.getDuration(),
      result: this.result,
      error: this.error,
      metadata: this.metadata
    };
  }
}

/**
 * 后台任务管理器
 */
class BackgroundTaskManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.tasks = new Map();
    this.maxConcurrent = options.maxConcurrent || 5;
    this.defaultTimeout = options.defaultTimeout || 60000;
  }

  /**
   * 创建后台任务
   */
  create(options = {}) {
    const task = new BackgroundTask({
      name: options.name,
      type: options.type,
      priority: options.priority || 0,
      metadata: options.metadata
    });

    task.on('complete', () => this._onTaskComplete(task));
    task.on('fail', () => this._onTaskComplete(task));
    task.on('cancel', () => this._onTaskComplete(task));

    this.tasks.set(task.id, task);
    this.emit('taskCreated', { task });
    return task;
  }

  /**
   * 启动任务
   */
  async start(taskId, fn) {
    const task = this.tasks.get(taskId);
    if (!task) {throw new Error(`Task ${taskId} not found`);}

    if (this.getRunningCount() >= this.maxConcurrent) {
      task.status = TaskStatus.PENDING;
      this.emit('taskQueued', { task, position: this.getQueuePosition(task) });
    }

    task.start();
    this.emit('taskStarted', { task });

    const timeout = new Promise((_, reject) => {
      task._timeoutId = setTimeout(() => reject(new Error('Task timeout')), this.defaultTimeout);
    });

    try {
      const result = await Promise.race([fn(task.abortController.signal), timeout]);
      clearTimeout(task._timeoutId);
      task.complete(result);
      return result;
    } catch (error) {
      clearTimeout(task._timeoutId);
      if (task.status !== TaskStatus.CANCELLED) {
        task.fail(error);
      }
      throw error;
    }
  }

  /**
   * 取消任务
   */
  cancel(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {return false;}
    clearTimeout(task._timeoutId);
    task.cancel();
    return true;
  }

  cancelAll() {
    for (const [, task] of this.tasks) {
      clearTimeout(task._timeoutId);
      task.cancel();
    }
  }

  /**
   * 获取任务
   */
  get(taskId) {
    return this.tasks.get(taskId);
  }

  /**
   * 获取所有任务
   */
  getAll() {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取运行中的任务
   */
  getRunning() {
    return this.getAll().filter((t) => t.status === TaskStatus.RUNNING);
  }

  /**
   * 获取运行中的任务数
   */
  getRunningCount() {
    return Array.from(this.tasks.values()).filter((t) => t.status === TaskStatus.RUNNING).length;
  }

  /**
   * 获取队列位置
   */
  getQueuePosition(task) {
    const pending = this.getAll()
      .filter((t) => t.status === TaskStatus.PENDING)
      .sort((a, b) => b.priority - a.priority);
    return pending.indexOf(task) + 1;
  }

  /**
   * 检查是否有任务在运行
   */
  hasRunning() {
    return this.getRunningCount() > 0;
  }

  /**
   * 等待所有任务完成
   */
  async waitForAll(timeout) {
    const startTime = Date.now();
    while (this.hasRunning()) {
      if (timeout && Date.now() - startTime > timeout) {
        throw new Error('Wait timeout');
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  _onTaskComplete(task) {
    this.emit('taskCompleted', { task });
  }

  /**
   * 清理已完成的任务
   */
  cleanup(completedOnly = true) {
    for (const [id, task] of this.tasks) {
      if (!completedOnly ||
          task.status === TaskStatus.COMPLETED ||
          task.status === TaskStatus.FAILED ||
          task.status === TaskStatus.CANCELLED) {
        this.tasks.delete(id);
      }
    }
  }

  /**
   * 获取统计
   */
  getStats() {
    const tasks = this.getAll();
    return {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === TaskStatus.PENDING).length,
      running: tasks.filter((t) => t.status === TaskStatus.RUNNING).length,
      completed: tasks.filter((t) => t.status === TaskStatus.COMPLETED).length,
      failed: tasks.filter((t) => t.status === TaskStatus.FAILED).length,
      cancelled: tasks.filter((t) => t.status === TaskStatus.CANCELLED).length
    };
  }
}

/**
 * AgentLoop v2
 */
class AgentLoop extends EventEmitter {
  constructor(options = {}) {
    super();

    // 基础配置
    this.maxIterations = options.maxIterations || 10;
    this.timeout = options.timeout || 60000;
    this.onStep = options.onStep || (() => {});
    this.onError = options.onError || ((e) => console.error('[AgentLoop]', e));

    // v2: LLM Adapter
    this.llmAdapter = options.llmAdapter || null;

    // v2: 后台任务管理器
    this.backgroundTasks = new BackgroundTaskManager({
      maxConcurrent: options.maxConcurrentTasks || 3,
      defaultTimeout: options.taskTimeout || 120000
    });

    // v2: 监听后台任务
    this.backgroundTasks.on('taskCompleted', (data) => {
      this.emit('backgroundTaskCompleted', data);
    });

    // v2: Result Holdback
    this._heldBackResult = null;

    // v2: 命令批处理
    this._commandQueue = [];
    this._commandBatchWindow = options.commandBatchWindow || 100; // ms

    // 浏览器/视觉
    this.browser = options.browser || null;
    this.visionAgent = options.visionAgent || null;

    // MCP
    this.mcpBridge = options.mcpBridge || null;
    this.mcpRegistry = options.mcpRegistry || null;
    this.mcpTools = options.mcpTools || [];
    this.mcpToolCache = new Map();
    this.mcpToolCacheTTL = options.mcpToolCacheTTL || 300000;

    // Skills
    this.skillDiscovery = options.skillDiscovery || null;
    this.skillManager = options.skillManager || null;
    this.skillTools = [];
    this.skillToolCache = new Map();
    this.skillToolCacheTTL = options.skillToolCacheTTL || 300000;

    // Actions
    this.actions = new Map();
    this.history = [];
    this.isRunning = false;
    this._abortController = null;

    this._allowedActions = new Set([
      'navigate', 'click', 'type', 'extract', 'screenshot', 'analyze',
      'wait', 'scroll', 'back', 'complete', 'mcpCall', 'batchMCPCall',
      'skillCall', 'batchSkillCall', 'skillAnalysis',
      // v2 新增
      'spawnTask', 'waitForTask', 'backgroundTask'
    ]);

    this._state = {
      page: null,
      pageUrl: '',
      pageTitle: '',
      screenshot: null,
      extractedData: {},
      error: null,
      mcpResults: {},
      skillResults: {},
      backgroundTaskResults: {}
    };

    // v2: 统计
    this._stats = {
      iterations: 0,
      actionsExecuted: 0,
      backgroundTasksSpawned: 0,
      totalActionDuration: 0
    };

    this._registerDefaultActions();
    this._registerMCPActions();
    this._registerSkillActions();
    this._registerV2Actions();
  }

  // ========== v2: 后台任务方法 ==========

  /**
   * 创建后台任务
   */
  createBackgroundTask(name, type = 'generic', priority = 0) {
    return this.backgroundTasks.create({ name, type, priority });
  }

  /**
   * 获取后台任务
   */
  getBackgroundTask(taskId) {
    return this.backgroundTasks.get(taskId);
  }

  /**
   * 获取所有后台任务
   */
  getBackgroundTasks() {
    return this.backgroundTasks.getAll();
  }

  /**
   * 取消后台任务
   */
  cancelBackgroundTask(taskId) {
    return this.backgroundTasks.cancel(taskId);
  }

  /**
   * 等待后台任务
   */
  async waitForBackgroundTasks(timeout) {
    await this.backgroundTasks.waitForAll(timeout);
  }

  /**
   * 检查是否有运行中的后台任务
   */
  hasRunningBackgroundTasks() {
    return this.backgroundTasks.hasRunning();
  }

  // ========== v2: Result Holdback ==========

  /**
   * 挂起结果
   */
  holdResult(result) {
    this._heldBackResult = result;
    this.emit('resultHeld', { result });
  }

  /**
   * 获取挂起的结果
   */
  getHeldResult() {
    return this._heldBackResult;
  }

  /**
   * 释放挂起的结果
   */
  releaseHeldResult() {
    const result = this._heldBackResult;
    this._heldBackResult = null;
    if (result) {
      this.emit('resultReleased', { result });
    }
    return result;
  }

  /**
   * 检查是否有挂起的结果
   */
  hasHeldResult() {
    return this._heldBackResult !== null;
  }

  // ========== v2: 命令批处理 ==========

  /**
   * 入队命令
   */
  enqueueCommand(command) {
    const now = Date.now();

    // 检查是否与上一个命令可以合并
    const last = this._commandQueue[this._commandQueue.length - 1];
    if (last && this._canBatchCommands(last, command)) {
      // 合并命令
      if (Array.isArray(last.value) && Array.isArray(command.value)) {
        last.value = [...last.value, ...command.value];
      } else {
        last.value = `${last.value}\n${command.value}`;
      }
      last.count = (last.count || 1) + 1;
      last.lastEnqueuedAt = now;
      return false; // 已合并
    }

    // 新命令
    this._commandQueue.push({
      ...command,
      count: 1,
      enqueuedAt: now,
      lastEnqueuedAt: now
    });
    return true; // 新增
  }

  /**
   * 检查两个命令是否可以合并
   */
  _canBatchCommands(a, b) {
    if (!a || !b) {return false;}
    return (
      a.type === b.type &&
      a.isMeta === b.isMeta &&
      (Date.now() - a.lastEnqueuedAt) < this._commandBatchWindow
    );
  }

  /**
   * 获取队列中的命令
   */
  getCommands() {
    return [...this._commandQueue];
  }

  /**
   * 清空命令队列
   */
  clearCommands() {
    const commands = [...this._commandQueue];
    this._commandQueue = [];
    return commands;
  }

  // ========== v2 Actions ==========

  _registerV2Actions() {
    // v2: 后台任务动作
    this.registerAction('spawnTask', async (params) => {
      const { name, taskType, priority = 0, taskFn } = params;

      if (typeof taskFn !== 'function') {
        return { success: false, error: 'taskFn is required' };
      }

      const task = this.createBackgroundTask(name, taskType, priority);
      this._stats.backgroundTasksSpawned++;

      // 异步启动，不等待完成
      this.backgroundTasks.start(task.id, taskFn).catch((error) => {
        this.logger?.error(`Background task failed: ${error.message}`);
      });

      return {
        success: true,
        taskId: task.id,
        status: task.status
      };
    });

    this.registerAction('waitForTask', async (params) => {
      const { taskId, timeout } = params;

      const task = this.getBackgroundTask(taskId);
      if (!task) {
        return { success: false, error: 'Task not found' };
      }

      if (task.status === TaskStatus.COMPLETED) {
        return { success: true, result: task.result, status: task.status };
      }

      if (task.status === TaskStatus.FAILED) {
        return { success: false, error: task.error, status: task.status };
      }

      // 等待完成
      return new Promise((resolve) => {
        task.on('complete', () => {
          resolve({ success: true, result: task.result, status: task.status });
        });
        task.on('fail', () => {
          resolve({ success: false, error: task.error, status: task.status });
        });

        // 超时
        setTimeout(() => {
          resolve({ success: false, error: 'Wait timeout', status: task.status });
        }, timeout || 30000);
      });
    });

    this.registerAction('backgroundTask', async (params) => {
      const { name, taskType, action, actionParams } = params;

      const task = this.createBackgroundTask(name, taskType, 0);
      this._stats.backgroundTasksSpawned++;

      // 包装动作到后台执行
      const taskFn = async (_signal) => {
        const handler = this.actions.get(action);
        if (!handler) {throw new Error(`Unknown action: ${action}`);}
        return handler(actionParams || {});
      };

      this.backgroundTasks.start(task.id, taskFn).catch((error) => {
        this.logger?.error(`Background task failed to start: ${error.message}`);
      });

      return {
        success: true,
        taskId: task.id,
        message: `Background task ${name} started`
      };
    });
  }

  // ========== 原有方法保持兼容 ==========

  setMCPServices(bridge, registry) {
    this.mcpBridge = bridge;
    this.mcpRegistry = registry;
    this._refreshMCPTools();
  }

  async _refreshMCPTools() {
    if (!this.mcpRegistry) {return;}

    try {
      await this.mcpRegistry.refresh();
      this.mcpTools = this.mcpRegistry.formatForLLM({ includeSchema: true });
      this.mcpToolCache.set('tools', {
        data: this.mcpTools,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[AgentLoop] Failed to refresh MCP tools:', error.message);
    }
  }

  _getMCPTools() {
    const cached = this.mcpToolCache.get('tools');
    if (cached && Date.now() - cached.timestamp < this.mcpToolCacheTTL) {
      return cached.data;
    }

    if (this.mcpRegistry) {
      this.mcpTools = this.mcpRegistry.formatForLLM({ includeSchema: true });
      this.mcpToolCache.set('tools', {
        data: this.mcpTools,
        timestamp: Date.now()
      });
    }

    return this.mcpTools;
  }

  setSkillServices(skillDiscovery, skillManager) {
    this.skillDiscovery = skillDiscovery;
    this.skillManager = skillManager;
    this._refreshSkillTools();
  }

  async _refreshSkillTools() {
    if (!this.skillDiscovery) {return;}

    try {
      const { tools } = this.skillDiscovery.getSkillsForLLM({ maxSkills: 20 });
      this.skillTools = tools;
      this.skillToolCache.set('tools', {
        data: this.skillTools,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[AgentLoop] Failed to refresh skill tools:', error.message);
    }
  }

  _getSkillTools() {
    const cached = this.skillToolCache.get('tools');
    if (cached && Date.now() - cached.timestamp < this.skillToolCacheTTL) {
      return cached.data;
    }

    if (this.skillDiscovery) {
      const { tools } = this.skillDiscovery.getSkillsForLLM({ maxSkills: 20 });
      this.skillTools = tools;
      this.skillToolCache.set('tools', {
        data: this.skillTools,
        timestamp: Date.now()
      });
    }

    return this.skillTools;
  }

  _registerMCPActions() {
    this.registerAction('mcpCall', async (params) => {
      const { toolFullName, arguments: args = {} } = params;

      if (!this.mcpBridge) {
        return { success: false, error: 'MCP bridge not configured' };
      }

      try {
        const traceId = `agent_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
        const result = await this.mcpBridge.call(toolFullName, args, { traceId });

        this._state.mcpResults[toolFullName] = result;

        return {
          success: true,
          result,
          toolFullName,
          traceId
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          toolFullName
        };
      }
    });

    this.registerAction('batchMCPCall', async (params) => {
      const { calls = [] } = params;

      if (!this.mcpBridge) {
        return { success: false, error: 'MCP bridge not configured' };
      }

      try {
        const results = await this.mcpBridge.batchCall(calls);

        return {
          success: true,
          results,
          successCount: results.filter((r) => r.success).length,
          errorCount: results.filter((r) => !r.success).length
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });
  }

  _registerSkillActions() {
    this.registerAction('skillCall', async (params) => {
      const { skillName, parameters = {} } = params;

      if (!this.skillManager) {
        return { success: false, error: 'Skill manager not configured' };
      }

      try {
        const executionId = `skill_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();

        const result = await this.skillManager.executeSkill(skillName, parameters, {
          executionId,
          sessionId: this.sessionId,
          conversationHistory: this.history.slice(-10)
        });

        const duration = Date.now() - startTime;

        this._state.skillResults[skillName] = {
          ...result,
          executionId,
          duration
        };

        return {
          success: true,
          result,
          skillName,
          executionId,
          duration
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          skillName
        };
      }
    });

    this.registerAction('batchSkillCall', async (params) => {
      const { calls = [] } = params;

      if (!this.skillManager) {
        return { success: false, error: 'Skill manager not configured' };
      }

      try {
        const results = await Promise.all(calls.map(async (call) => {
          const { skillName, parameters = {} } = call;
          const executionId = `skill_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;

          try {
            const result = await this.skillManager.executeSkill(skillName, parameters, {
              executionId,
              sessionId: this.sessionId,
              conversationHistory: this.history.slice(-10)
            });

            return {
              success: true,
              skillName,
              result,
              executionId
            };
          } catch (error) {
            return {
              success: false,
              skillName,
              error: error.message
            };
          }
        }));

        return {
          success: true,
          results,
          successCount: results.filter((r) => r.success).length,
          errorCount: results.filter((r) => !r.success).length
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });

    this.registerAction('skillAnalysis', async (params) => {
      const { userInput, conversationHistory = [] } = params;

      if (!this.skillDiscovery) {
        return { success: false, error: 'Skill discovery not configured' };
      }

      try {
        const analysis = this.skillDiscovery.analyzeInput(userInput, conversationHistory);

        return {
          success: true,
          analysis,
          hasMatch: analysis.hasMatch,
          confidence: analysis.confidence,
          matchedSkills: analysis.matchedSkills
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });
  }

  _getMCPToolsSection() {
    const tools = this._getMCPTools();

    if (tools.length === 0) {
      return '';
    }

    let section = '\n\nMCP 工具列表 (当需要时使用 mcpCall 操作调用):\n';

    for (const tool of tools.slice(0, 20)) {
      section += `\n## ${tool.name}\n`;
      section += `${tool.description || '无描述'}\n`;

      if (tool.parameters && tool.parameters.properties) {
        section += '参数:\n';
        const required = tool.parameters.required || [];
        for (const [paramName, paramDef] of Object.entries(tool.parameters.properties)) {
          const requiredMark = required.includes(paramName) ? ' [必填]' : ' [可选]';
          const typeInfo = paramDef.type || 'any';
          const desc = paramDef.description || '';
          section += `  - ${paramName}${requiredMark} (${typeInfo}): ${desc}\n`;
        }
      }
    }

    if (tools.length > 20) {
      section += `\n... 还有 ${tools.length - 20} 个工具`;
    }

    return section;
  }

  _getSkillToolsSection() {
    const tools = this._getSkillTools();

    if (tools.length === 0) {
      return '';
    }

    let section = '\n\n技能工具列表 (当需要时使用 skillCall 操作调用):\n';

    for (const tool of tools.slice(0, 15)) {
      const func = tool.function;
      section += `\n## ${func.name}\n`;
      section += `${func.description || '无描述'}\n`;

      if (func.parameters && func.parameters.properties) {
        section += '参数:\n';
        const required = func.parameters.required || [];
        for (const [paramName, paramDef] of Object.entries(func.parameters.properties)) {
          const requiredMark = required.includes(paramName) ? ' [必填]' : ' [可选]';
          const typeInfo = paramDef.type || 'string';
          const desc = paramDef.description || '';
          section += `  - ${paramName}${requiredMark} (${typeInfo}): ${desc}\n`;
        }
      }
    }

    if (tools.length > 15) {
      section += `\n... 还有 ${tools.length - 15} 个技能`;
    }

    return section;
  }

  _validateUrl(url) {
    const { validateURL } = require('../utils/SSRFValidator');
    const result = validateURL(url);
    return result.allowed;
  }

  _registerDefaultActions() {
    this.registerAction('navigate', async (params) => {
      if (!this._validateUrl(params.url)) {
        return { type: 'navigate', success: false, error: 'Invalid URL' };
      }
      if (this.browser) {
        await this.browser.goto(params.url);
        this._state.pageUrl = params.url;
      }
      return { type: 'navigate', url: params.url, success: true };
    });

    this.registerAction('click', async (params) => {
      if (this.browser) {
        try {
          await this.browser.click(params.selector);
          return { type: 'click', selector: params.selector, success: true };
        } catch (e) {
          return { type: 'click', selector: params.selector, success: false, error: e.message };
        }
      }
      return { type: 'click', selector: params.selector, success: true };
    });

    this.registerAction('type', async (params) => {
      if (this.browser) {
        try {
          await this.browser.type(params.selector, params.text);
          return { type: 'type', selector: params.selector, text: params.text, success: true };
        } catch (e) {
          return { type: 'type', success: false, error: e.message };
        }
      }
      return { type: 'type', selector: params.selector, text: params.text, success: true };
    });

    this.registerAction('extract', async (params) => {
      if (this.browser) {
        try {
          const data = await this.browser.extract(params.selector, params.attribute);
          this._state.extractedData[params.selector] = data;
          return { type: 'extract', selector: params.selector, data, success: true };
        } catch (e) {
          return { type: 'extract', success: false, error: e.message };
        }
      }
      return { type: 'extract', selector: params.selector, data: [], success: true };
    });

    this.registerAction('screenshot', async (_params) => {
      if (this.browser) {
        const screenshot = await this.browser.screenshot();
        this._state.screenshot = screenshot;
        return { type: 'screenshot', success: true, hasImage: true };
      }
      return { type: 'screenshot', success: true };
    });

    this.registerAction('analyze', async (params) => {
      if (this.visionAgent && this._state.screenshot) {
        const result = await this.visionAgent.analyze(this._state.screenshot, params.prompt);
        return { type: 'analyze', result: result.description, success: result.ok };
      }
      return { type: 'analyze', success: false, error: 'No vision agent' };
    });

    this.registerAction('wait', async (params) => {
      await new Promise((r) => setTimeout(r, params.duration || 1000));
      return { type: 'wait', duration: params.duration, success: true };
    });

    this.registerAction('scroll', async (params) => {
      if (this.browser) {
        await this.browser.scroll(params.direction || 'down', params.amount || 500);
      }
      return { type: 'scroll', direction: params.direction, success: true };
    });

    this.registerAction('back', async () => {
      if (this.browser) {
        await this.browser.back();
      }
      return { type: 'back', success: true };
    });

    this.registerAction('complete', async (params) => {
      return { type: 'complete', result: params.result, success: true };
    });
  }

  registerAction(name, handler) {
    this.actions.set(name, handler);
  }

  // ========== 增强的 run 方法 ==========

  async run(goal, context = {}) {
    // BrainFlow 任务开始
    const brain = getBrainFlow();
    if (brain) {
      brain.onTaskStart(goal, context);
    }

    if (this.isRunning) {
      throw new Error('Agent loop is already running');
    }

    this.isRunning = true;
    this._abortController = new AbortController();
    this.history = [];
    this._state.extractedData = {};
    this._state.screenshot = null;
    this._state.error = null;
    this._heldBackResult = null;
    this._stats = {
      iterations: 0,
      actionsExecuted: 0,
      backgroundTasksSpawned: 0,
      totalActionDuration: 0
    };

    const startTime = Date.now();
    let iteration = 0;
    let taskComplete = false;
    let finalResult = null;

    try {
      while (iteration < this.maxIterations && !taskComplete) {
        if (this._abortController.signal.aborted) {
          throw new Error('Agent loop aborted');
        }

        if (Date.now() - startTime > this.timeout) {
          throw new Error('Agent loop timeout');
        }

        iteration++;
        this._stats.iterations++;

        this.onStep({ type: 'iteration', iteration, maxIterations: this.maxIterations, goal });
        this.emit('iterationStart', { iteration, goal });

        // 1. 感知 (Perceive)
        const observation = await this._perceive(context);
        this.history.push({ type: 'observation', data: observation, iteration, timestamp: Date.now() });

        // 2. 思考 (Think)
        const thought = await this._think(goal, observation, this.history);
        this.history.push({ type: 'thought', data: thought, iteration, timestamp: Date.now() });

        // 3. 决策 (Decide)
        const action = await this._decideAction(thought);
        this.history.push({ type: 'action', data: action, iteration, timestamp: Date.now() });

        // 检查是否完成
        if (action.type === 'complete') {
          taskComplete = true;
          finalResult = action.params?.result || thought.analysis;
          break;
        }

        // 4. 执行 (Act)
        const actionStart = Date.now();
        const result = await this._executeAction(action);
        const actionDuration = Date.now() - actionStart;

        this._stats.actionsExecuted++;
        this._stats.totalActionDuration += actionDuration;

        this.history.push({ type: 'result', data: result, iteration, timestamp: Date.now(), duration: actionDuration });

        // v2: 检查后台任务
        if (this.hasRunningBackgroundTasks()) {
          // 挂起结果，等待后台任务
          this.holdResult(result);
          this.emit('resultHeldForBackgroundTasks', { result });

          // 等待所有后台任务完成
          await this.waitForBackgroundTasks(this.timeout);

          // v2: 释放挂起的结果
          const releasedResult = this.releaseHeldResult();
          this.emit('step', { iteration, observation, thought, action, result: releasedResult });
        } else {
          this.onStep({ type: 'step', iteration, observation, thought, action, result });
        }

        this.emit('iterationEnd', { iteration });
      }

      return {
        success: taskComplete,
        result: finalResult,
        iterations: iteration,
        history: this.history,
        duration: Date.now() - startTime,
        stats: this.getStats()
      };
    } catch (error) {
      this.onError(error);
      this.emit('error', { error });

      // BrainFlow 任务失败结束
      const brain = getBrainFlow();
      if (brain) {
        brain.onTaskEnd(goal, { success: false, error: error.message }, 'run');
      }

      return {
        success: false,
        error: error.message,
        iterations: iteration,
        history: this.history,
        duration: Date.now() - startTime,
        stats: this.getStats()
      };
    } finally {
      this.isRunning = false;
      this._abortController = null;
      if (this.history.length > 200) {
        this.history = this.history.slice(-100);
      }
      this.emit('loopEnd');

      // BrainFlow 任务成功结束
      const brain = getBrainFlow();
      if (brain) {
        brain.onTaskEnd(goal, { success: taskComplete }, 'run');
      }
    }
  }

  async _perceive(context) {
    const observation = {
      pageUrl: this._state.pageUrl,
      pageTitle: this._state.pageTitle,
      timestamp: Date.now()
    };

    if (this.browser) {
      try {
        observation.pageUrl = await this.browser.url() || this._state.pageUrl;
        observation.pageTitle = await this.browser.title() || '';
        this._state.pageUrl = observation.pageUrl;
        this._state.pageTitle = observation.pageTitle;
      } catch (e) {
        this.logger?.debug(`Browser observation failed: ${e.message}`);
      }
    }

    if (typeof context.observe === 'function') {
      const customObs = await context.observe(observation);
      Object.assign(observation, customObs);
    }

    return observation;
  }

  async _think(goal, observation, history) {
    if (!this.llmAdapter) {
      return {
        analysis: 'No LLM adapter configured',
        plan: ['complete'],
        reasoning: 'Default fallback'
      };
    }

    const recentHistory = history.slice(-6).map((h) =>
      `- [${h.type}] ${JSON.stringify(h.data).substring(0, 150)}`
    ).join('\n');

    const mcpToolsSection = this._getMCPToolsSection();
    const skillToolsSection = this._getSkillToolsSection();
    const mcpResultsSection = Object.keys(this._state.mcpResults).length > 0
      ? `\nMCP 调用结果:\n${JSON.stringify(this._state.mcpResults, null, 2).substring(0, 500)}`
      : '';
    const skillResultsSection = Object.keys(this._state.skillResults).length > 0
      ? `\n技能调用结果:\n${JSON.stringify(this._state.skillResults, null, 2).substring(0, 500)}`
      : '';

    // v2: 后台任务结果
    const bgTaskResultsSection = Object.keys(this._state.backgroundTaskResults).length > 0
      ? `\n后台任务结果:\n${JSON.stringify(this._state.backgroundTaskResults, null, 2).substring(0, 500)}`
      : '';

    const prompt = `你是一个AI代理。你的目标是: ${goal}

当前状态:
- URL: ${observation.pageUrl || 'N/A'}
- 标题: ${observation.pageTitle || 'N/A'}
- 已提取数据: ${JSON.stringify(this._state.extractedData).substring(0, 200)}${mcpResultsSection}${skillResultsSection}${bgTaskResultsSection}

最近操作历史:
${recentHistory || '无'}

可用操作: ${Array.from(this.actions.keys()).join(', ')}

v2 新增操作:
- spawnTask: 启动后台任务
- waitForTask: 等待后台任务完成
- backgroundTask: 在后台执行动作

${mcpToolsSection}${skillToolsSection}

请分析当前情况并决定下一步操作。返回JSON格式:
{
  "analysis": "对当前状态的分析",
  "plan": ["步骤1", "步骤2", ...],
  "reasoning": "决策理由",
  "nextAction": {
    "type": "操作类型",
    "params": { ... }
  }
}`;

    try {
      const response = await this.llmAdapter.generate(prompt, {
        temperature: 0.3,
        maxTokens: 500
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (parseError) {
          this.logger?.debug(`JSON parse failed: ${parseError.message}`);
          return { analysis: response, plan: ['complete'], reasoning: 'Parse failed' };
        }
      }

      return { analysis: response, plan: ['complete'], reasoning: 'Parse fallback' };
    } catch (error) {
      return { analysis: error.message, plan: ['complete'], reasoning: 'Error fallback' };
    }
  }

  async _decideAction(thought) {
    if (thought.nextAction && thought.nextAction.type) {
      const actionType = thought.nextAction.type;
      if (!this._allowedActions.has(actionType)) {
        return { type: 'complete', params: { result: `Blocked unknown action: ${actionType}` } };
      }
      return { type: actionType, params: thought.nextAction.params || {} };
    }

    if (thought.plan && thought.plan.length > 0) {
      const planAction = thought.plan[0];
      if (!this._allowedActions.has(planAction)) {
        return { type: 'complete', params: { result: `Blocked unknown action: ${planAction}` } };
      }
      return { type: planAction, params: {} };
    }

    return { type: 'complete', params: { result: thought.analysis } };
  }

  async _executeAction(action) {
    const handler = this.actions.get(action.type);

    if (!handler) {
      return { success: false, error: `Unknown action: ${action.type}` };
    }

    try {
      return await handler(action.params || {});
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ========== v2: 统计方法 ==========

  getStats() {
    return {
      ...this._stats,
      backgroundTasks: this.backgroundTasks.getStats(),
      avgActionDuration: this._stats.actionsExecuted > 0
        ? this._stats.totalActionDuration / this._stats.actionsExecuted
        : 0
    };
  }

  /**
   * 获取 BrainFlow 实例
   */
  getBrainFlow() {
    return getBrainFlow();
  }

  abort() {
    if (this._abortController) {
      this._abortController.abort();
    }
    // 取消所有后台任务
    for (const task of this.backgroundTasks.getRunning()) {
      task.cancel();
    }
  }

  getState() {
    return { ...this._state };
  }

  getHistory() {
    return [...this.history];
  }

  clearHistory() {
    this.history = [];
  }
}

module.exports = {
  AgentLoop,
  BackgroundTask,
  BackgroundTaskManager,
  TaskStatus
};
