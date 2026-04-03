class AutomationEngine {
  constructor(options = {}) {
    this.llmAdapter = options.llmAdapter || null;
    this.agentLoop = options.agentLoop || null;
    this.taskQueue = [];
    this.activeTasks = new Map();
    this.completedTasks = [];
    this.maxConcurrent = options.maxConcurrent || 3;
    this.onTaskStart = options.onTaskStart || (() => {});
    this.onTaskComplete = options.onTaskComplete || (() => {});
    this.onTaskError = options.onTaskError || ((e) => console.error('[Automation]', e));
    this._isProcessing = false;

    this.taskTemplates = new Map();
    this._registerTemplates();
  }

  _registerTemplates() {
    this.taskTemplates.set('download', {
      description: '下载文件或数据',
      steps: ['navigate', 'extract', 'download', 'save'],
      parse: (command) => {
        const urlMatch = command.match(/https?:\/\/[^\s]+/);
        return { url: urlMatch?.[0], action: 'download' };
      }
    });

    this.taskTemplates.set('search', {
      description: '搜索信息',
      steps: ['navigate', 'type', 'extract', 'summarize'],
      parse: (command) => {
        const queryMatch = command.match(/搜索[：:]\s*(.+)/);
        return { query: queryMatch?.[1] || command, action: 'search' };
      }
    });

    this.taskTemplates.set('monitor', {
      description: '监控网页变化',
      steps: ['navigate', 'extract', 'compare', 'notify'],
      parse: (command) => {
        const urlMatch = command.match(/https?:\/\/[^\s]+/);
        const intervalMatch = command.match(/每(\d+)(分钟|小时|秒)/);
        return {
          url: urlMatch?.[0],
          interval: intervalMatch ? this._parseInterval(intervalMatch) : 60000,
          action: 'monitor'
        };
      }
    });

    this.taskTemplates.set('extract', {
      description: '提取数据',
      steps: ['navigate', 'extract', 'format', 'save'],
      parse: (command) => {
        const selectorMatch = command.match(/选择器[：:]\s*([^\s]+)/);
        return { selector: selectorMatch?.[1], action: 'extract' };
      }
    });

    this.taskTemplates.set('fill', {
      description: '填写表单',
      steps: ['navigate', 'fill', 'submit', 'verify'],
      parse: (command) => {
        const dataMatch = command.match(/数据[：:]\s*(.+)/);
        return { data: dataMatch?.[1], action: 'fill' };
      }
    });
  }

  _parseInterval(match) {
    const value = parseInt(match[1]);
    const unit = match[2];
    switch (unit) {
      case '秒': return value * 1000;
      case '分钟': return value * 60000;
      case '小时': return value * 3600000;
      default: return 60000;
    }
  }

  async parseCommand(naturalLanguage) {
    if (!this.llmAdapter) {
      return this._fallbackParse(naturalLanguage);
    }

    const prompt = `你是一个浏览器自动化助手。将用户的自然语言指令解析为结构化任务。

用户指令: "${naturalLanguage}"

可用操作类型:
- download: 下载文件
- search: 搜索信息
- monitor: 监控网页
- extract: 提取数据
- fill: 填写表单
- navigate: 浏览网页
- click: 点击元素
- type: 输入文本

请返回JSON格式:
{
  "action": "操作类型",
  "params": {
    "url": "目标URL",
    "selector": "CSS选择器",
    "text": "输入文本",
    "query": "搜索词"
  },
  "steps": ["步骤1", "步骤2", ...]
}`;

    try {
      const response = await this.llmAdapter.generate(prompt, {
        temperature: 0.2,
        maxTokens: 500
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return this._fallbackParse(naturalLanguage);
    } catch (error) {
      return this._fallbackParse(naturalLanguage);
    }
  }

  _fallbackParse(command) {
    const lower = command.toLowerCase();

    if (lower.includes('下载') || lower.includes('download')) {
      const template = this.taskTemplates.get('download');
      return { ...template.parse(command), steps: template.steps };
    }

    if (lower.includes('搜索') || lower.includes('search')) {
      const template = this.taskTemplates.get('search');
      return { ...template.parse(command), steps: template.steps };
    }

    if (lower.includes('监控') || lower.includes('monitor')) {
      const template = this.taskTemplates.get('monitor');
      return { ...template.parse(command), steps: template.steps };
    }

    if (lower.includes('提取') || lower.includes('extract')) {
      const template = this.taskTemplates.get('extract');
      return { ...template.parse(command), steps: template.steps };
    }

    return { action: 'navigate', params: { text: command }, steps: ['navigate'] };
  }

  async execute(command, context = {}) {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    const parsed = await this.parseCommand(command);

    const task = {
      id: taskId,
      command,
      parsed,
      status: 'pending',
      startTime: Date.now(),
      steps: [],
      result: null,
      error: null
    };

    this.activeTasks.set(taskId, task);
    this.onTaskStart(task);

    try {
      if (this.agentLoop) {
        const result = await this.agentLoop.run(command, {
          initialObservation: JSON.stringify(parsed),
          pageUrl: parsed.params?.url,
          observe: context.observe
        });

        task.result = result;
        task.status = result.success ? 'completed' : 'failed';
        task.steps = result.history || [];
      } else {
        task.status = 'completed';
        task.result = { message: 'Parsed but no agent loop configured', parsed };
      }

      this.onTaskComplete(task);
      this.completedTasks.push(task);

    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      this.onTaskError(error);
    }

    this.activeTasks.delete(taskId);
    return task;
  }

  async executeBatch(commands, context = {}) {
    const results = [];

    for (const command of commands) {
      if (this.activeTasks.size >= this.maxConcurrent) {
        await new Promise(r => setTimeout(r, 1000));
      }

      const result = await this.execute(command, context);
      results.push(result);
    }

    return results;
  }

  getTaskStatus(taskId) {
    return this.activeTasks.get(taskId) ||
      this.completedTasks.find(t => t.id === taskId);
  }

  getActiveTasks() {
    return Array.from(this.activeTasks.values());
  }

  getCompletedTasks(limit = 50) {
    return this.completedTasks.slice(-limit);
  }

  cancelTask(taskId) {
    const task = this.activeTasks.get(taskId);
    if (task) {
      task.status = 'cancelled';
      if (this.agentLoop) {
        this.agentLoop.abort();
      }
      this.activeTasks.delete(taskId);
      return true;
    }
    return false;
  }

  cancelAll() {
    for (const [taskId] of this.activeTasks) {
      this.cancelTask(taskId);
    }
  }

  getStats() {
    return {
      active: this.activeTasks.size,
      completed: this.completedTasks.length,
      successRate: this.completedTasks.length > 0
        ? (this.completedTasks.filter(t => t.status === 'completed').length / this.completedTasks.length * 100).toFixed(2) + '%'
        : '0%',
      templates: Array.from(this.taskTemplates.keys())
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AutomationEngine;
}
