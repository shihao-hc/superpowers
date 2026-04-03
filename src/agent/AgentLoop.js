/**
 * AgentLoop - 感知-思考-行动 循环
 * 借鉴 ocbot 的 AI Agent 浏览循环设计
 * 
 * 循环流程:
 * 1. 感知 (Perceive) - 观察当前环境状态
 * 2. 思考 (Think) - 分析情况并制定计划
 * 3. 行动 (Act) - 执行操作
 * 4. 反馈 (Feedback) - 验证结果并调整
 * 
 * MCP 集成:
 * - 支持通过 mcpCall 操作调用 MCP 工具
 * - 在系统提示词中注入 MCP 工具列表
 * 
 * Skill 集成:
 * - 支持通过 skillCall 操作调用技能
 * - 在系统提示词中注入技能工具列表
 */
class AgentLoop {
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || 10;
    this.timeout = options.timeout || 60000;
    this.onStep = options.onStep || (() => {});
    this.onError = options.onError || ((e) => console.error('[AgentLoop]', e));
    this.llmAdapter = options.llmAdapter || null;
    this.browser = options.browser || null;
    this.visionAgent = options.visionAgent || null;
    this.mcpBridge = options.mcpBridge || null;
    this.mcpRegistry = options.mcpRegistry || null;
    this.mcpTools = options.mcpTools || [];
    this.mcpToolCache = new Map();
    this.mcpToolCacheTTL = options.mcpToolCacheTTL || 300000;
    this.skillDiscovery = options.skillDiscovery || null;
    this.skillManager = options.skillManager || null;
    this.skillTools = [];
    this.skillToolCache = new Map();
    this.skillToolCacheTTL = options.skillToolCacheTTL || 300000;
    this.actions = new Map();
    this.history = [];
    this.isRunning = false;
    this._abortController = null;
    this._allowedActions = new Set([
      'navigate', 'click', 'type', 'extract', 'screenshot', 'analyze', 
      'wait', 'scroll', 'back', 'complete', 'mcpCall', 'batchMCPCall',
      'skillCall', 'batchSkillCall', 'skillAnalysis'
    ]);
    this._state = {
      page: null,
      pageUrl: '',
      pageTitle: '',
      screenshot: null,
      extractedData: {},
      error: null,
      mcpResults: {},
      skillResults: {}
    };

    this._registerDefaultActions();
    this._registerMCPActions();
    this._registerSkillActions();
  }

  setMCPServices(bridge, registry) {
    this.mcpBridge = bridge;
    this.mcpRegistry = registry;
    this._refreshMCPTools();
  }

  async _refreshMCPTools() {
    if (!this.mcpRegistry) return;

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
          successCount: results.filter(r => r.success).length,
          errorCount: results.filter(r => !r.success).length
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    });
  }

  setSkillServices(skillDiscovery, skillManager) {
    this.skillDiscovery = skillDiscovery;
    this.skillManager = skillManager;
    this._refreshSkillTools();
  }

  async _refreshSkillTools() {
    if (!this.skillDiscovery) return;

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
          successCount: results.filter(r => r.success).length,
          errorCount: results.filter(r => !r.success).length
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

    section += '\n\n使用 mcpCall 操作调用 MCP 工具，格式:\n';
    section += '{\n  "type": "mcpCall",\n  "params": {\n    "toolFullName": "服务器名:工具名",\n    "arguments": { ...参数 }\n  }\n}';

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
      
      if (func.metadata) {
        section += `类别: ${func.metadata.category || 'general'}\n`;
        if (func.metadata.riskLevel === 'high') {
          section += '⚠️ 此技能需要确认才能执行（高风险操作）\n';
        }
      }
      
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

    section += '\n\n使用 skillCall 操作调用技能，格式:\n';
    section += '{\n  "type": "skillCall",\n  "params": {\n    "skillName": "技能名称",\n    "parameters": { ...参数 }\n  }\n}';

    return section;
  }

  _validateUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
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

    this.registerAction('screenshot', async (params) => {
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
      await new Promise(r => setTimeout(r, params.duration || 1000));
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

  async run(goal, context = {}) {
    if (this.isRunning) {
      throw new Error('Agent loop is already running');
    }

    this.isRunning = true;
    this._abortController = new AbortController();
    this.history = [];
    this._state.extractedData = {};
    this._state.screenshot = null;
    this._state.error = null;

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

        this.onStep({ type: 'iteration', iteration, maxIterations: this.maxIterations, goal });

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
        const result = await this._executeAction(action);
        this.history.push({ type: 'result', data: result, iteration, timestamp: Date.now() });

        this.onStep({ type: 'step', iteration, observation, thought, action, result });
      }

      return {
        success: taskComplete,
        result: finalResult,
        iterations: iteration,
        history: this.history,
        duration: Date.now() - startTime
      };

    } catch (error) {
      this.onError(error);
      return {
        success: false,
        error: error.message,
        iterations: iteration,
        history: this.history,
        duration: Date.now() - startTime
      };
    } finally {
      this.isRunning = false;
      this._abortController = null;
      if (this.history.length > 200) {
        this.history = this.history.slice(-100);
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
      } catch (e) {}
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

    const recentHistory = history.slice(-6).map(h =>
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

    const prompt = `你是一个AI代理。你的目标是: ${goal}

当前状态:
- URL: ${observation.pageUrl || 'N/A'}
- 标题: ${observation.pageTitle || 'N/A'}
- 已提取数据: ${JSON.stringify(this._state.extractedData).substring(0, 200)}${mcpResultsSection}${skillResultsSection}

最近操作历史:
${recentHistory || '无'}

可用操作: ${Array.from(this.actions.keys()).join(', ')}
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
        return JSON.parse(jsonMatch[0]);
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

  abort() {
    if (this._abortController) {
      this._abortController.abort();
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AgentLoop;
}

if (typeof window !== 'undefined') {
  window.AgentLoop = AgentLoop;
}
