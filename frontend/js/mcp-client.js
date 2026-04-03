/**
 * MCP Client Library - 统一 MCP 协议客户端
 * 基于 MCP 规范实现工具调用、资源访问、Roots 管理
 * 包含性能优化：缓存、去抖动、懒加载
 */

class MCPClient {
  constructor(baseUrl = '/api/mcp') {
    this.baseUrl = baseUrl;
    this.tools = [];
    this.resources = [];
    this.roots = [];
    
    // 性能优化：缓存配置
    this.cache = {
      tools: { data: null, timestamp: 0, ttl: 60000 }, // 1分钟缓存
      annotations: { data: null, timestamp: 0, ttl: 300000 }, // 5分钟缓存
      roots: { data: null, timestamp: 0, ttl: 30000 }, // 30秒缓存
    };
    
    // 性能优化：去抖动
    this.debounceTimers = {};
  }

  /**
   * 通用请求方法
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      
      return data;
    } catch (error) {
      console.error(`MCP Request Error: ${endpoint}`, error);
      throw error;
    }
  }

  // ==================== 性能优化方法 ====================

  /**
   * 缓存获取
   */
  getCached(key) {
    const cache = this.cache[key];
    if (!cache || !cache.data) return null;
    if (Date.now() - cache.timestamp > cache.ttl) return null;
    return cache.data;
  }

  /**
   * 缓存设置
   */
  setCached(key, data) {
    if (this.cache[key]) {
      this.cache[key].data = data;
      this.cache[key].timestamp = Date.now();
    }
  }

  /**
   * 缓存清除
   */
  clearCache(key = null) {
    if (key) {
      this.cache[key] = { data: null, timestamp: 0 };
    } else {
      Object.keys(this.cache).forEach(k => {
        this.cache[k] = { data: null, timestamp: 0 };
      });
    }
  }

  /**
   * 去抖动方法
   */
  debounce(key, fn, delay = 300) {
    return (...args) => {
      if (this.debounceTimers[key]) {
        clearTimeout(this.debounceTimers[key]);
      }
      this.debounceTimers[key] = setTimeout(() => {
        fn(...args);
        delete this.debounceTimers[key];
      }, delay);
    };
  }

  /**
   * 节流方法
   */
  throttle(fn, limit = 100) {
    let inThrottle = false;
    return (...args) => {
      if (!inThrottle) {
        fn(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  // ==================== 工具相关 ====================

  /**
   * 列出所有可用工具 (MCP Protocol: tools/list)
   * 使用缓存优化性能
   */
  async listTools(options = {}) {
    // 性能优化：检查缓存
    const cacheKey = `tools_${options.server || 'all'}`;
    const cached = this.getCached(cacheKey);
    if (cached && !options.forceRefresh) {
      return cached;
    }

    const params = new URLSearchParams();
    if (options.server) params.set('server', options.server);
    if (options.tags) params.set('tags', options.tags.join(','));
    if (options.search) params.set('search', options.search);
    
    const query = params.toString();
    const data = await this.request(`/tools${query ? '?' + query : ''}`);
    this.tools = data.tools || [];
    
    // 更新缓存
    this.setCached(cacheKey, this.tools);
    return this.tools;
  }

  /**
   * 获取工具定义 (MCP Protocol: tools/get)
   */
  async getTool(toolName) {
    const tool = this.tools.find(t => t.name === toolName);
    if (tool) return tool;
    
    await this.listTools();
    return this.tools.find(t => t.name === toolName);
  }

  /**
   * 执行工具 (MCP Protocol: tools/call)
   */
  async callTool(toolName, params = {}, options = {}) {
    const request = {
      toolFullName: toolName,
      params: {
        ...params,
        ...(options.dryRun ? { dry_run: true } : {})
      }
    };

    const result = await this.request('/call', {
      method: 'POST',
      body: request
    });

    return result;
  }

  /**
   * 批量执行工具 (MCP Protocol: tools/batch)
   */
  async batchCall(calls = [], options = {}) {
    const requests = calls.map(call => ({
      toolFullName: call.name,
      params: {
        ...call.params,
        ...(options.dryRun ? { dry_run: true } : {})
      }
    }));

    return this.request('/batch-call', {
      method: 'POST',
      body: { calls: requests }
    });
  }

  /**
   * 获取工具提示 (MCP Protocol: tools/prompt)
   */
  async getToolPrompt() {
    return this.request('/tools/prompt');
  }

  // ==================== 资源相关 ====================

  /**
   * 列出所有资源 (MCP Protocol: resources/list)
   */
  async listResources() {
    const data = await this.request('/resources');
    this.resources = data.resources || [];
    return this.resources;
  }

  /**
   * 读取资源 (MCP Protocol: resources/read)
   * @param {string} uri - 资源 URI，格式: protocol://path
   */
  async readResource(uri) {
    const encodedUri = encodeURIComponent(uri);
    return this.request(`/resources/${encodedUri}`);
  }

  /**
   * 订阅资源更新 (模拟 MCP subscriptions)
   */
  subscribeResource(uri, callback) {
    const poll = async () => {
      try {
        const data = await this.readResource(uri);
        callback(data);
      } catch (e) {
        console.warn(`Resource poll error for ${uri}:`, e);
      }
    };

    const intervalId = setInterval(poll, 5000);
    return () => clearInterval(intervalId);
  }

  // ==================== Roots 管理 ====================

  /**
   * 列出所有 Roots (MCP Protocol: roots/list)
   */
  async listRoots() {
    const data = await this.request('/roots');
    this.roots = data.roots || [];
    return this.roots;
  }

  /**
   * 添加 Root (MCP Protocol: roots/add)
   */
  async addRoot(path, permissions = ['read', 'write']) {
    return this.request('/roots', {
      method: 'POST',
      body: { path, permissions }
    });
  }

  /**
   * 删除 Root (MCP Protocol: roots/remove)
   */
  async removeRoot(path) {
    const encodedPath = encodeURIComponent(path);
    return this.request(`/roots/${encodedPath}`, {
      method: 'DELETE'
    });
  }

  /**
   * 验证路径 (MCP Protocol: roots/validate)
   */
  async validatePath(path) {
    return this.request(`/roots/validate?path=${encodeURIComponent(path)}`);
  }

  /**
   * 创建临时沙箱 (MCP Protocol: roots/sandbox)
   */
  async createSandbox(prefix = 'mcp-sandbox') {
    return this.request('/roots/sandbox', {
      method: 'POST',
      body: { prefix }
    });
  }

  /**
   * 删除沙箱 (MCP Protocol: roots/sandbox/remove)
   */
  async removeSandbox(sandboxId) {
    return this.request(`/roots/sandbox/${sandboxId}`, {
      method: 'DELETE'
    });
  }

  // ==================== 思维链 ====================

  /**
   * 创建思维链
   */
  async createThinkingChain(initialThought, metadata = {}) {
    return this.request('/thinking/chains', {
      method: 'POST',
      body: { initialThought, metadata }
    });
  }

  /**
   * 列出思维链 (MCP Protocol: resources/list with thinking://)
   */
  async listThinkingChains() {
    return this.request('/thinking/chains');
  }

  /**
   * 获取思维链详情 (MCP Protocol: resources/read with thinking://)
   */
  async getThinkingChain(chainId) {
    return this.request(`/thinking/chains/${chainId}`);
  }

  /**
   * 添加思维步骤
   */
  async addThought(chainId, thought, options = {}) {
    return this.request(`/thinking/chains/${chainId}/thoughts`, {
      method: 'POST',
      body: { thought, options }
    });
  }

  /**
   * 创建分支
   */
  async createBranch(chainId, fromStep, label = '') {
    return this.request(`/thinking/chains/${chainId}/branches`, {
      method: 'POST',
      body: { fromStep, label }
    });
  }

  /**
   * 添加反思
   */
  async addReflection(chainId, stepId, criticism) {
    return this.request(`/thinking/chains/${chainId}/reflect`, {
      method: 'POST',
      body: { stepId, criticism }
    });
  }

  /**
   * 回溯
   */
  async backtrack(chainId, toStep) {
    return this.request(`/thinking/chains/${chainId}/backtrack`, {
      method: 'POST',
      body: { toStep }
    });
  }

  /**
   * 获取思维链资源 URI
   */
  getThinkingChainURI(chainId) {
    return `thinking://${chainId}`;
  }

  // ==================== 注解相关 ====================

  /**
   * 获取工具注解 (MCP Protocol: annotations/get)
   */
  async getAnnotations(toolName = null) {
    if (toolName) {
      return this.request(`/annotations?tool=${toolName}`);
    }
    return this.request('/annotations');
  }

  /**
   * 获取注解摘要
   */
  async getAnnotationSummary() {
    return this.request('/annotations/summary');
  }

  /**
   * 获取风险等级
   */
  async getRiskLevels(tools) {
    const toolList = Array.isArray(tools) ? tools.join(',') : tools;
    return this.request(`/annotations/risk-level?tools=${toolList}`);
  }

  /**
   * 解析工具注解
   */
  parseAnnotations(tool) {
    const annotations = tool.annotations || {};
    return {
      readOnlyHint: annotations.readOnlyHint ?? true,
      destructiveHint: annotations.destructiveHint ?? false,
      idempotentHint: annotations.idempotentHint ?? true,
      riskLevel: this.getRiskLevel(annotations)
    };
  }

  /**
   * 计算风险等级
   */
  getRiskLevel(annotations) {
    if (annotations.readOnlyHint) return 'safe';
    if (annotations.destructiveHint) return 'critical';
    if (!annotations.idempotentHint) return 'medium';
    return 'low';
  }

  // ==================== Dry-run ====================

  /**
   * 执行 Dry-run 预览 (MCP Protocol: tools/call with dry_run: true)
   */
  async dryRunPreview(tool, params) {
    return this.callTool(tool, params, { dryRun: true });
  }

  /**
   * 确认执行 (dry_run: false)
   */
  async confirmExecution(tool, params) {
    return this.callTool(tool, params, { dryRun: false });
  }

  /**
   * 获取 Dry-run 历史
   */
  async getDryRunHistory(limit = 50) {
    return this.request(`/dryrun/history?limit=${limit}`);
  }

  /**
   * 获取 Dry-run 差异详情
   */
  async getDryRunDiff(id) {
    return this.request(`/dryrun/diff/${id}`);
  }

  /**
   * 解析预览结果
   */
  parsePreview(result) {
    const meta = result._meta || {};
    const content = result.content?.[0]?.text || '';
    
    return {
      isPreview: meta.dryRun || meta.preview,
      tool: meta.tool,
      file: meta.file,
      preview: {
        type: meta.previewType || 'generic',
        diff: result.diff,
        oldContent: result.existingContent,
        newContent: result.preview,
        lineCount: meta.lineCount,
        size: meta.size,
        willCreate: meta.willCreate,
        willOverwrite: meta.willOverwrite,
        warning: result.warning
      },
      confirmationNeeded: meta.confirmationNeeded || false,
      raw: result
    };
  }

  // ==================== 服务器管理 ====================

  /**
   * 获取 MCP 状态 (MCP Protocol: ping)
   */
  async getStatus() {
    return this.request('/status');
  }

  /**
   * 健康检查 (MCP Protocol: tools/health)
   */
  async healthCheck(deep = false) {
    return this.request(`/health${deep ? '?deep=true' : ''}`);
  }

  /**
   * 获取服务器列表
   */
  async listServers() {
    return this.request('/servers');
  }

  /**
   * 获取服务器状态
   */
  async getServerStatus(serverName) {
    return this.request(`/servers/${serverName}`);
  }

  /**
   * 重启服务器
   */
  async restartServer(serverName) {
    return this.request(`/servers/${serverName}/restart`, {
      method: 'POST'
    });
  }

  // ==================== 工具辅助方法 ====================

  /**
   * 根据标签筛选工具
   */
  filterByTags(tags) {
    return this.tools.filter(tool => {
      const toolTags = tool.tags || [];
      return tags.some(tag => toolTags.includes(tag));
    });
  }

  /**
   * 搜索工具
   */
  searchTools(query) {
    const lowerQuery = query.toLowerCase();
    return this.tools.filter(tool => 
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.description?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * 获取只读工具
   */
  getReadOnlyTools() {
    return this.tools.filter(tool => {
      const ann = this.parseAnnotations(tool);
      return ann.readOnlyHint;
    });
  }

  /**
   * 获取可写工具
   */
  getWritableTools() {
    return this.tools.filter(tool => {
      const ann = this.parseAnnotations(tool);
      return !ann.readOnlyHint;
    });
  }

  /**
   * 获取破坏性工具
   */
  getDestructiveTools() {
    return this.tools.filter(tool => {
      const ann = this.parseAnnotations(tool);
      return ann.destructiveHint;
    });
  }

  /**
   * 按服务器分组工具
   */
  getToolsByServer() {
    const groups = {};
    this.tools.forEach(tool => {
      const server = tool.server || 'unknown';
      if (!groups[server]) groups[server] = [];
      groups[server].push(tool);
    });
    return groups;
  }
}

/**
 * MCP UI 组件类 - 提供常用 UI 组件逻辑
 */
class MCPUIComponents {
  constructor(mcpClient) {
    this.client = mcpClient;
  }

  /**
   * 渲染工具卡片
   */
  renderToolCard(tool, callbacks = {}) {
    const ann = this.client.parseAnnotations(tool);
    const riskColors = {
      safe: '#4ade80',
      low: '#60a5fa',
      medium: '#fbbf24',
      critical: '#f87171'
    };

    return {
      tool,
      annotations: ann,
      canExecute: !ann.readOnlyHint,
      canRetry: ann.idempotentHint,
      needsConfirmation: ann.destructiveHint,
      riskColor: riskColors[ann.riskLevel],
      riskLabel: { safe: '安全', low: '低风险', medium: '中风险', critical: '高危' }[ann.riskLevel],
      onExecute: callbacks.onExecute || (() => {}),
      onRetry: callbacks.onRetry || (() => {}),
      onViewDetails: callbacks.onViewDetails || (() => {})
    };
  }

  /**
   * 渲染差异视图数据
   */
  renderDiffView(previewResult) {
    const parsed = this.client.parsePreview(previewResult);
    const { preview } = parsed;

    if (preview.type === 'file_diff') {
      return {
        leftTitle: '原始内容',
        rightTitle: '修改后',
        leftContent: preview.oldContent || '',
        rightContent: preview.newContent || '',
        stats: {
          additions: (preview.diff?.lines || []).filter(l => l.type === 'added').length,
          deletions: (preview.diff?.lines || []).filter(l => l.type === 'removed').length
        }
      };
    }

    return {
      leftTitle: '当前状态',
      rightTitle: '预览状态',
      leftContent: JSON.stringify(preview.oldContent, null, 2),
      rightContent: JSON.stringify(preview.newContent, null, 2),
      stats: null
    };
  }

  /**
   * 渲染思维链树
   */
  renderThinkingChainTree(chain) {
    const nodes = [];
    
    const traverse = (thoughts, parentId = null, depth = 0) => {
      thoughts.forEach(thought => {
        nodes.push({
          id: thought.id,
          thought: thought.thought,
          depth,
          parentId,
          isReflection: thought.reflectionOf !== null,
          isBranch: thought.branchId !== null,
          reflection: thought.criticism,
          reasoning: thought.reasoning,
          branchId: thought.branchId,
          children: []
        });
      });
    };

    traverse(chain.thoughts);
    return nodes;
  }
}

/**
 * MCP 表单生成器 - 根据 inputSchema 动态生成表单
 */
class MCPFormGenerator {
  /**
   * 根据 JSON Schema 生成表单 HTML
   */
  static generateFormHTML(schema, namePrefix = '') {
    if (!schema || !schema.properties) {
      return '<p>无可用参数</p>';
    }

    let html = '';
    const properties = schema.properties;
    const required = schema.required || [];

    for (const [key, prop] of Object.entries(properties)) {
      const isRequired = required.includes(key);
      const fieldName = namePrefix ? `${namePrefix}[${key}]` : key;
      const label = prop.title || prop.description || key;
      const description = prop.description !== label ? prop.description : '';

      html += `<div class="form-group">`;
      html += `<label for="${key}">${label}${isRequired ? ' <span style="color:#f87171">*</span>' : ''}</label>`;
      
      if (description) {
        html += `<small style="color:#888;display:block;margin-bottom:0.25rem;">${description}</small>`;
      }

      switch (prop.type) {
        case 'string':
          if (prop.enum) {
            html += `<select class="form-input" name="${fieldName}" id="${key}">`;
            prop.enum.forEach(opt => {
              html += `<option value="${opt}">${opt}</option>`;
            });
            html += `</select>`;
          } else if (prop.maxLength > 100) {
            html += `<textarea class="form-input" name="${fieldName}" id="${key}" 
                     rows="${Math.min(10, Math.ceil(prop.maxLength / 50))}"></textarea>`;
          } else {
            html += `<input type="text" class="form-input" name="${fieldName}" id="${key}">`;
          }
          break;
        case 'number':
        case 'integer':
          html += `<input type="number" class="form-input" name="${fieldName}" id="${key}"
                   ${prop.min !== undefined ? `min="${prop.min}"` : ''}
                   ${prop.max !== undefined ? `max="${prop.max}"` : ''}>`;
          break;
        case 'boolean':
          html += `<input type="checkbox" name="${fieldName}" id="${key}" value="true">`;
          break;
        case 'array':
          html += `<textarea class="form-input" name="${fieldName}" id="${key}" 
                   placeholder="JSON array, e.g. [1, 2, 3]" rows="3"></textarea>`;
          break;
        case 'object':
          html += `<textarea class="form-input" name="${fieldName}" id="${key}" 
                   placeholder="JSON object" rows="3"></textarea>`;
          break;
        default:
          html += `<input type="text" class="form-input" name="${fieldName}" id="${key}">`;
      }

      html += `</div>`;
    }

    return html;
  }

  /**
   * 解析表单数据为工具参数
   */
  static parseFormData(form, schema) {
    const formData = new FormData(form);
    const params = {};
    const properties = schema?.properties || {};

    for (const [key, prop] of Object.entries(properties)) {
      const value = formData.get(key);
      if (value === null || value === '') continue;

      switch (prop.type) {
        case 'number':
        case 'integer':
          params[key] = parseFloat(value);
          break;
        case 'boolean':
          params[key] = value === 'true';
          break;
        case 'array':
        case 'object':
          try {
            params[key] = JSON.parse(value);
          } catch (e) {
            params[key] = value;
          }
          break;
        default:
          params[key] = value;
      }
    }

    return params;
  }
}

// 导出到全局
window.MCPClient = MCPClient;
window.MCPUIComponents = MCPUIComponents;
window.MCPFormGenerator = MCPFormGenerator;
