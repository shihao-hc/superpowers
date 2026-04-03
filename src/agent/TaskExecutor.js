const { BrowserAgent } = require('./BrowserAgent');
const { AgentLoop } = require('./AgentLoop');
const { OnChainIdentity } = require('./OnChainIdentity');

class TaskExecutor {
  constructor(options = {}) {
    this.llmAdapter = options.llmAdapter || null;
    this.visionAgent = options.visionAgent || null;
    this.identity = options.identity || new OnChainIdentity();
    this.browser = null;
    this.agentLoop = null;
    this.tasks = new Map();
    this.results = new Map();
    this.maxTasks = options.maxTasks || 100;
    this.onProgress = options.onProgress || (() => {});
    this.onError = options.onError || ((e) => console.error('[TaskExecutor]', e));

    this.templates = new Map();
    this._registerDefaultTemplates();
  }

  _cleanupOldTasks() {
    if (this.tasks.size > this.maxTasks) {
      const entries = Array.from(this.tasks.entries())
        .sort((a, b) => a[1].startTime - b[1].startTime);
      const toRemove = entries.slice(0, entries.length - this.maxTasks);
      toRemove.forEach(([id]) => {
        this.tasks.delete(id);
        this.results.delete(id);
      });
    }
  }

  _registerDefaultTemplates() {
    this.templates.set('search', {
      name: '搜索信息',
      description: '在搜索引擎中搜索指定关键词',
      icon: '🔍',
      steps: [
        { action: 'navigate', params: { url: 'https://www.google.com' } },
        { action: 'type', params: { selector: '[name="q"]', text: '{{query}}' } },
        { action: 'click', params: { selector: '[name="btnK"]' } },
        { action: 'wait', params: { duration: 2000 } },
        { action: 'extract', params: { selector: '#search .g', attribute: 'textContent' } },
        { action: 'screenshot', params: {} },
        { action: 'complete', params: { result: '搜索完成' } }
      ],
      params: ['query']
    });

    this.templates.set('scrape', {
      name: '数据采集',
      description: '从网页提取指定数据',
      icon: '📊',
      steps: [
        { action: 'navigate', params: { url: '{{url}}' } },
        { action: 'wait', params: { duration: 2000 } },
        { action: 'extract', params: { selector: '{{selector}}', attribute: '{{attribute}}' } },
        { action: 'screenshot', params: {} },
        { action: 'complete', params: { result: '数据采集完成' } }
      ],
      params: ['url', 'selector', 'attribute']
    });

    this.templates.set('monitor', {
      name: '网页监控',
      description: '定期检查网页变化',
      icon: '👁️',
      steps: [
        { action: 'navigate', params: { url: '{{url}}' } },
        { action: 'wait', params: { duration: 1000 } },
        { action: 'screenshot', params: {} },
        { action: 'extract', params: { selector: '{{selector}}', attribute: 'textContent' } },
        { action: 'complete', params: { result: '监控快照完成' } }
      ],
      params: ['url', 'selector']
    });

    this.templates.set('form_fill', {
      name: '填写表单',
      description: '自动填写网页表单',
      icon: '📝',
      steps: [
        { action: 'navigate', params: { url: '{{url}}' } },
        { action: 'wait', params: { duration: 1000 } },
        { action: 'type', params: { selector: '{{username_selector}}', text: '{{username}}' } },
        { action: 'type', params: { selector: '{{password_selector}}', text: '{{password}}' } },
        { action: 'click', params: { selector: '{{submit_selector}}' } },
        { action: 'wait', params: { duration: 2000 } },
        { action: 'screenshot', params: {} },
        { action: 'complete', params: { result: '表单已提交' } }
      ],
      params: ['url', 'username_selector', 'username', 'password_selector', 'password', 'submit_selector']
    });

    this.templates.set('download', {
      name: '下载文件',
      description: '从网页下载指定文件',
      icon: '⬇️',
      steps: [
        { action: 'navigate', params: { url: '{{url}}' } },
        { action: 'wait', params: { duration: 1000 } },
        { action: 'click', params: { selector: '{{download_selector}}' } },
        { action: 'wait', params: { duration: 5000 } },
        { action: 'screenshot', params: {} },
        { action: 'complete', params: { result: '下载完成' } }
      ],
      params: ['url', 'download_selector']
    });

    this.templates.set('screenshot_page', {
      name: '页面截图',
      description: '截取指定网页的完整截图',
      icon: '📸',
      steps: [
        { action: 'navigate', params: { url: '{{url}}' } },
        { action: 'wait', params: { duration: 2000 } },
        { action: 'screenshot', params: { fullPage: true } },
        { action: 'complete', params: { result: '截图完成' } }
      ],
      params: ['url']
    });

    this.templates.set('extract_links', {
      name: '提取链接',
      description: '从网页提取所有链接',
      icon: '🔗',
      steps: [
        { action: 'navigate', params: { url: '{{url}}' } },
        { action: 'wait', params: { duration: 1000 } },
        { action: 'extract', params: { selector: 'a[href]', attribute: 'href' } },
        { action: 'complete', params: { result: '链接提取完成' } }
      ],
      params: ['url']
    });

    this.templates.set('price_check', {
      name: '价格监控',
      description: '监控商品价格变化',
      icon: '💰',
      steps: [
        { action: 'navigate', params: { url: '{{url}}' } },
        { action: 'wait', params: { duration: 2000 } },
        { action: 'extract', params: { selector: '{{price_selector}}', attribute: 'textContent' } },
        { action: 'screenshot', params: {} },
        { action: 'complete', params: { result: '价格获取完成' } }
      ],
      params: ['url', 'price_selector']
    });

    this.templates.set('social_post', {
      name: '社交媒体发布',
      description: '在社交媒体发布内容',
      icon: '📱',
      steps: [
        { action: 'navigate', params: { url: '{{url}}' } },
        { action: 'wait', params: { duration: 2000 } },
        { action: 'click', params: { selector: '{{compose_selector}}' } },
        { action: 'wait', params: { duration: 1000 } },
        { action: 'type', params: { selector: '{{input_selector}}', text: '{{content}}' } },
        { action: 'click', params: { selector: '{{submit_selector}}' } },
        { action: 'wait', params: { duration: 2000 } },
        { action: 'screenshot', params: {} },
        { action: 'complete', params: { result: '发布完成' } }
      ],
      params: ['url', 'compose_selector', 'input_selector', 'content', 'submit_selector']
    });

    this.templates.set('data_compare', {
      name: '数据对比',
      description: '对比两个网页的数据差异',
      icon: '⚖️',
      steps: [
        { action: 'navigate', params: { url: '{{url1}}' } },
        { action: 'wait', params: { duration: 2000 } },
        { action: 'extract', params: { selector: '{{selector1}}', attribute: 'textContent' } },
        { action: 'navigate', params: { url: '{{url2}}' } },
        { action: 'wait', params: { duration: 2000 } },
        { action: 'extract', params: { selector: '{{selector2}}', attribute: 'textContent' } },
        { action: 'screenshot', params: {} },
        { action: 'complete', params: { result: '数据对比完成' } }
      ],
      params: ['url1', 'selector1', 'url2', 'selector2']
    });

    this.templates.set('login_check', {
      name: '登录检测',
      description: '检测网站登录状态',
      icon: '🔐',
      steps: [
        { action: 'navigate', params: { url: '{{url}}' } },
        { action: 'wait', params: { duration: 2000 } },
        { action: 'extract', params: { selector: '{{status_selector}}', attribute: 'textContent' } },
        { action: 'screenshot', params: {} },
        { action: 'complete', params: { result: '登录状态检测完成' } }
      ],
      params: ['url', 'status_selector']
    });

    this.templates.set('content_crawl', {
      name: '内容抓取',
      description: '抓取网页正文内容',
      icon: '📰',
      steps: [
        { action: 'navigate', params: { url: '{{url}}' } },
        { action: 'wait', params: { duration: 2000 } },
        { action: 'extract', params: { selector: '{{content_selector}}', attribute: 'textContent' } },
        { action: 'screenshot', params: {} },
        { action: 'complete', params: { result: '内容抓取完成' } }
      ],
      params: ['url', 'content_selector']
    });

    this.templates.set('data_analysis', {
      name: '数据分析',
      description: '对提取的数据进行分析统计',
      icon: '📈',
      steps: [
        { action: 'navigate', params: { url: '{{url}}' } },
        { action: 'wait', params: { duration: 2000 } },
        { action: 'extract', params: { selector: '{{data_selector}}', attribute: 'textContent' } },
        { action: 'screenshot', params: {} },
        { action: 'complete', params: { result: '数据分析完成' } }
      ],
      params: ['url', 'data_selector']
    });

    this.templates.set('report_generate', {
      name: '报表生成',
      description: '从网页生成数据报表',
      icon: '📊',
      steps: [
        { action: 'navigate', params: { url: '{{url}}' } },
        { action: 'wait', params: { duration: 2000 } },
        { action: 'extract', params: { selector: '{{table_selector}}', attribute: 'textContent' } },
        { action: 'screenshot', params: {} },
        { action: 'complete', params: { result: '报表生成完成' } }
      ],
      params: ['url', 'table_selector']
    });

    this.templates.set('api_test', {
      name: 'API测试',
      description: '测试API接口响应',
      icon: '🔌',
      steps: [
        { action: 'navigate', params: { url: '{{url}}' } },
        { action: 'wait', params: { duration: 1000 } },
        { action: 'extract', params: { selector: 'body', attribute: 'textContent' } },
        { action: 'screenshot', params: {} },
        { action: 'complete', params: { result: 'API测试完成' } }
      ],
      params: ['url']
    });

    this.templates.set('seo_check', {
      name: 'SEO检测',
      description: '检查网页SEO元素',
      icon: '🔎',
      steps: [
        { action: 'navigate', params: { url: '{{url}}' } },
        { action: 'wait', params: { duration: 2000 } },
        { action: 'extract', params: { selector: 'title', attribute: 'textContent' } },
        { action: 'extract', params: { selector: 'meta[name="description"]', attribute: 'content' } },
        { action: 'extract', params: { selector: 'h1', attribute: 'textContent' } },
        { action: 'screenshot', params: {} },
        { action: 'complete', params: { result: 'SEO检测完成' } }
      ],
      params: ['url']
    });
  }

  registerIndustryTemplates(industry, templates) {
    for (const template of templates) {
      const templateId = `${industry}_${template.id}`;
      this.templates.set(templateId, {
        name: template.name,
        description: template.description,
        icon: template.icon,
        industry: template.industry || industry,
        steps: template.steps || [],
        params: template.params || []
      });
    }
    console.log(`[TaskExecutor] Registered ${templates.length} ${industry} templates`);
  }

  getTemplatesByIndustry(industry) {
    const result = [];
    for (const [key, template] of this.templates) {
      if (template.industry === industry) {
        result.push({ key, ...template });
      }
    }
    return result;
  }

  async init() {
    this.browser = new BrowserAgent({
      headless: true,
      screenshotDir: './screenshots'
    });

    this.agentLoop = new AgentLoop({
      llmAdapter: this.llmAdapter,
      browser: this.browser,
      visionAgent: this.visionAgent,
      maxIterations: 20,
      timeout: 120000,
      onStep: (step) => this.onProgress(step)
    });

    return this;
  }

  async executeTask(taskConfig) {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    const task = {
      id: taskId,
      config: taskConfig,
      status: 'running',
      startTime: Date.now(),
      steps: [],
      result: null,
      screenshots: [],
      extractedData: [],
      error: null
    };

    this.tasks.set(taskId, task);
    this._cleanupOldTasks();

    try {
      if (!this.browser || !this.browser.isConnected()) {
        await this.init();
        await this.browser.init();
      }

      if (taskConfig.template) {
        const template = this.templates.get(taskConfig.template);
        if (!template) {
          throw new Error(`Unknown template: ${taskConfig.template}`);
        }
        return await this._executeTemplate(taskId, template, taskConfig.params || {});
      }

      if (taskConfig.goal) {
        return await this._executeGoal(taskId, taskConfig.goal, taskConfig);
      }

      throw new Error('Task must specify template or goal');

    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.endTime = Date.now();
      this.onError(error);
      return task;
    }
  }

  async _executeTemplate(taskId, template, params) {
    const task = this.tasks.get(taskId);

    try {
      await this.browser.init();

      const steps = template.steps.map(step => {
        const resolvedParams = {};
        for (const [key, value] of Object.entries(step.params)) {
          resolvedParams[key] = typeof value === 'string' && value.startsWith('{{')
            ? params[value.replace(/[{}]/g, '')] || value
            : value;
        }
        return { ...step, params: resolvedParams };
      });

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        this.onProgress({ type: 'step', step: i + 1, total: steps.length, action: step.action });

        const result = await this.agentLoop._executeAction(step);
        task.steps.push({ ...step, result, timestamp: Date.now() });

        if (result.hasImage) {
          const screenshot = await this.browser.screenshot();
          task.screenshots.push({ data: screenshot, timestamp: Date.now() });
        }

        if (result.data) {
          task.extractedData.push({ data: result.data, timestamp: Date.now() });
        }

        if (step.action === 'complete') {
          task.status = 'completed';
          task.result = step.params.result || result.result;
          break;
        }
      }

      task.endTime = Date.now();
      task.duration = task.endTime - task.startTime;

      this.results.set(taskId, task);
      return task;

    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.endTime = Date.now();
      throw error;
    } finally {
      await this.browser.close();
    }
  }

  async _executeGoal(taskId, goal, options) {
    const task = this.tasks.get(taskId);

    try {
      await this.browser.init();

      const result = await this.agentLoop.run(goal, {
        pageUrl: options.startUrl,
        observe: async () => {
          const screenshot = await this.browser.screenshot();
          task.screenshots.push({ data: screenshot, timestamp: Date.now() });
          return { screenshot };
        }
      });

      task.status = result.success ? 'completed' : 'failed';
      task.result = result.result;
      task.steps = result.history || [];
      task.endTime = Date.now();
      task.duration = task.endTime - task.startTime;

      if (!result.success && result.error) {
        task.error = result.error;
      }

      this.results.set(taskId, task);
      return task;

    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.endTime = Date.now();
      throw error;
    } finally {
      await this.browser.close();
    }
  }

  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  getTaskResult(taskId) {
    return this.results.get(taskId);
  }

  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  getTemplates() {
    const result = [];
    for (const [key, template] of this.templates) {
      result.push({
        key,
        name: template.name,
        description: template.description,
        icon: template.icon,
        params: template.params
      });
    }
    return result;
  }

  registerTemplate(name, template) {
    this.templates.set(name, template);
  }

  async cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'running') {
      if (this.agentLoop) {
        this.agentLoop.abort();
      }
      task.status = 'cancelled';
      task.endTime = Date.now();
      return true;
    }
    return false;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.agentLoop = null;
  }

  getStats() {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      running: tasks.filter(t => t.status === 'running').length,
      templates: this.templates.size
    };
  }
}

module.exports = { TaskExecutor };
