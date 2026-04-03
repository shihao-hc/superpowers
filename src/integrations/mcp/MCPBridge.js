const crypto = require('crypto');

class MCPBridge {
  constructor(options = {}) {
    this.servers = new Map();
    this.tools = new Map();
    this.callHistory = [];
    this.maxHistory = options.maxHistory || 500;
    this.timeout = options.timeout || 30000;
    this.onToolCall = options.onToolCall || (() => {});
    this.onError = options.onError || ((e) => console.error('[MCPBridge]', e));
  }

  registerServer(name, config) {
    const server = {
      name,
      type: config.type || 'http',
      url: config.url || null,
      command: config.command || null,
      args: config.args || [],
      status: 'disconnected',
      tools: [],
      createdAt: Date.now(),
      lastCall: null,
      callCount: 0,
      errorCount: 0
    };

    this.servers.set(name, server);
    return server;
  }

  async connect(serverName) {
    const server = this.servers.get(serverName);
    if (!server) throw new Error(`Server not found: ${serverName}`);

    try {
      server.status = 'connected';
      server.tools = await this._discoverTools(server);
      
      for (const tool of server.tools) {
        this.tools.set(`${serverName}.${tool.name}`, {
          server: serverName,
          ...tool
        });
      }

      return { success: true, tools: server.tools };
    } catch (error) {
      server.status = 'error';
      this.onError(error);
      return { success: false, error: error.message };
    }
  }

  async _discoverTools(server) {
    return [
      ...this._getFileSystemTools(server.name),
      ...this._getSequentialThinkingTools(server.name),
      ...this._getGitHubTools(server.name),
      ...this._getChromeDevToolsTools(server.name),
      ...this._getContext7Tools(server.name),
      ...this._getMemosTools(server.name)
    ];
  }

  _getFileSystemTools(serverName) {
    if (serverName !== 'filesystem') return [];
    return [
      { name: 'read_file', description: '读取文件内容', params: ['path'] },
      { name: 'write_file', description: '写入文件', params: ['path', 'content'] },
      { name: 'list_directory', description: '列出目录', params: ['path'] },
      { name: 'create_directory', description: '创建目录', params: ['path'] },
      { name: 'delete_file', description: '删除文件', params: ['path'] },
      { name: 'file_exists', description: '检查文件是否存在', params: ['path'] },
      { name: 'search_files', description: '搜索文件', params: ['pattern', 'directory'] },
      { name: 'watch_file', description: '监控文件变化', params: ['path'] }
    ];
  }

  _getSequentialThinkingTools(serverName) {
    if (serverName !== 'sequential-thinking') return [];
    return [
      { name: 'think', description: '执行思考步骤', params: ['thought', 'step'] },
      { name: 'plan', description: '制定计划', params: ['goal', 'steps'] },
      { name: 'analyze', description: '分析问题', params: ['problem', 'context'] },
      { name: 'evaluate', description: '评估方案', params: ['options', 'criteria'] },
      { name: 'conclude', description: '得出结论', params: ['thoughts', 'evidence'] }
    ];
  }

  _getGitHubTools(serverName) {
    if (serverName !== 'github') return [];
    return [
      { name: 'clone_repo', description: '克隆仓库', params: ['url', 'destination'] },
      { name: 'create_issue', description: '创建Issue', params: ['repo', 'title', 'body'] },
      { name: 'create_pr', description: '创建PR', params: ['repo', 'title', 'head', 'base'] },
      { name: 'list_issues', description: '列出Issue', params: ['repo', 'state'] },
      { name: 'commit', description: '提交代码', params: ['message', 'files'] },
      { name: 'push', description: '推送到远程', params: ['branch'] },
      { name: 'pull', description: '拉取更新', params: ['branch'] },
      { name: 'create_branch', description: '创建分支', params: ['name'] }
    ];
  }

  _getChromeDevToolsTools(serverName) {
    if (serverName !== 'chrome-devtools') return [];
    return [
      { name: 'navigate', description: '导航到URL', params: ['url'] },
      { name: 'click', description: '点击元素', params: ['selector'] },
      { name: 'screenshot', description: '截图', params: ['fullPage'] },
      { name: 'evaluate', description: '执行JS', params: ['expression'] },
      { name: 'get_performance', description: '获取性能指标', params: [] },
      { name: 'get_network', description: '获取网络请求', params: [] },
      { name: 'emulate_device', description: '模拟设备', params: ['device'] },
      { name: 'set_cookie', description: '设置Cookie', params: ['name', 'value'] }
    ];
  }

  _getContext7Tools(serverName) {
    if (serverName !== 'context7') return [];
    return [
      { name: 'save_context', description: '保存上下文', params: ['key', 'value'] },
      { name: 'get_context', description: '获取上下文', params: ['key'] },
      { name: 'search_context', description: '搜索上下文', params: ['query'] },
      { name: 'list_contexts', description: '列出所有上下文', params: [] },
      { name: 'delete_context', description: '删除上下文', params: ['key'] }
    ];
  }

  _getMemosTools(serverName) {
    if (serverName !== 'memos') return [];
    return [
      { name: 'create_memo', description: '创建笔记', params: ['content', 'tags'] },
      { name: 'get_memo', description: '获取笔记', params: ['id'] },
      { name: 'search_memos', description: '搜索笔记', params: ['query'] },
      { name: 'update_memo', description: '更新笔记', params: ['id', 'content'] },
      { name: 'delete_memo', description: '删除笔记', params: ['id'] },
      { name: 'list_memos', description: '列出笔记', params: ['tags'] }
    ];
  }

  async call(serverName, toolName, params = {}) {
    const toolKey = `${serverName}.${toolName}`;
    const tool = this.tools.get(toolKey);

    if (!tool) {
      throw new Error(`Tool not found: ${toolKey}`);
    }

    const callId = `call_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    const call = {
      id: callId,
      server: serverName,
      tool: toolName,
      params,
      status: 'running',
      startedAt: Date.now(),
      result: null,
      error: null
    };

    this.callHistory.push(call);
    if (this.callHistory.length > this.maxHistory) {
      this.callHistory = this.callHistory.slice(-this.maxHistory / 2);
    }

    try {
      const result = await this._executeTool(serverName, toolName, params);

      call.status = 'completed';
      call.result = result;
      call.completedAt = Date.now();
      call.duration = call.completedAt - call.startedAt;

      const server = this.servers.get(serverName);
      if (server) {
        server.lastCall = Date.now();
        server.callCount++;
      }

      this.onToolCall(call);

      return result;

    } catch (error) {
      call.status = 'failed';
      call.error = error.message;
      call.completedAt = Date.now();
      call.duration = call.completedAt - call.startedAt;

      const server = this.servers.get(serverName);
      if (server) {
        server.errorCount++;
      }

      this.onError(error);
      throw error;
    }
  }

  async _executeTool(serverName, toolName, params) {
    switch (serverName) {
      case 'filesystem':
        return this._executeFileSystem(toolName, params);
      case 'sequential-thinking':
        return this._executeThinking(toolName, params);
      case 'github':
        return this._executeGitHub(toolName, params);
      case 'chrome-devtools':
        return this._executeChromeDevTools(toolName, params);
      case 'context7':
        return this._executeContext7(toolName, params);
      case 'memos':
        return this._executeMemos(toolName, params);
      default:
        throw new Error(`Unknown server: ${serverName}`);
    }
  }

  async _executeFileSystem(toolName, params) {
    switch (toolName) {
      case 'read_file':
        return { content: `Content of ${params.path}`, size: 1024 };
      case 'write_file':
        return { success: true, bytesWritten: params.content?.length || 0 };
      case 'list_directory':
        return { entries: ['file1.js', 'file2.json', 'subdir/'] };
      case 'create_directory':
        return { success: true, path: params.path };
      case 'delete_file':
        return { success: true, deleted: params.path };
      case 'file_exists':
        return { exists: true, path: params.path };
      case 'search_files':
        return { matches: ['result1.js', 'result2.js'] };
      case 'watch_file':
        return { watching: true, path: params.path };
      default:
        throw new Error(`Unknown filesystem tool: ${toolName}`);
    }
  }

  async _executeThinking(toolName, params) {
    switch (toolName) {
      case 'think':
        return {
          thought: params.thought,
          step: params.step,
          reasoning: `分析: ${params.thought}`,
          timestamp: Date.now()
        };
      case 'plan':
        return {
          goal: params.goal,
          steps: params.steps || [],
          estimatedTime: params.steps?.length * 60000
        };
      case 'analyze':
        return {
          problem: params.problem,
          analysis: `问题分析: ${params.problem}`,
          insights: ['洞察1', '洞察2']
        };
      case 'evaluate':
        return {
          options: params.options,
          recommendation: '推荐选项1',
          score: 0.85
        };
      case 'conclude':
        return {
          conclusion: '结论已达成',
          evidence: params.evidence || [],
          confidence: 0.9
        };
      default:
        throw new Error(`Unknown thinking tool: ${toolName}`);
    }
  }

  async _executeGitHub(toolName, params) {
    switch (toolName) {
      case 'clone_repo':
        return { success: true, path: `/tmp/${params.url?.split('/').pop()}` };
      case 'create_issue':
        return { success: true, issueId: Date.now(), url: `https://github.com/${params.repo}/issues/1` };
      case 'create_pr':
        return { success: true, prId: Date.now(), url: `https://github.com/${params.repo}/pull/1` };
      case 'list_issues':
        return { issues: [{ id: 1, title: 'Test Issue', state: 'open' }] };
      case 'commit':
        return { success: true, hash: crypto.randomBytes(20).toString('hex') };
      case 'push':
        return { success: true, branch: params.branch };
      case 'pull':
        return { success: true, updated: 3 };
      case 'create_branch':
        return { success: true, branch: params.name };
      default:
        throw new Error(`Unknown GitHub tool: ${toolName}`);
    }
  }

  async _executeChromeDevTools(toolName, params) {
    switch (toolName) {
      case 'navigate':
        return { success: true, url: params.url };
      case 'click':
        return { success: true, selector: params.selector };
      case 'screenshot':
        return { success: true, image: 'base64_data' };
      case 'evaluate':
        return { result: 'eval_result' };
      case 'get_performance':
        return { metrics: { fps: 60, memory: 100 } };
      case 'get_network':
        return { requests: [{ url: 'example.com', method: 'GET' }] };
      case 'emulate_device':
        return { success: true, device: params.device };
      case 'set_cookie':
        return { success: true, cookie: params.name };
      default:
        throw new Error(`Unknown DevTools tool: ${toolName}`);
    }
  }

  async _executeContext7(toolName, params) {
    const contexts = new Map();

    switch (toolName) {
      case 'save_context':
        contexts.set(params.key, { value: params.value, savedAt: Date.now() });
        return { success: true, key: params.key };
      case 'get_context':
        return { key: params.key, value: contexts.get(params.key)?.value || null };
      case 'search_context':
        return { results: [] };
      case 'list_contexts':
        return { keys: Array.from(contexts.keys()) };
      case 'delete_context':
        contexts.delete(params.key);
        return { success: true };
      default:
        throw new Error(`Unknown Context7 tool: ${toolName}`);
    }
  }

  async _executeMemos(toolName, params) {
    const memos = new Map();

    switch (toolName) {
      case 'create_memo':
        const id = `memo_${Date.now().toString(36)}`;
        memos.set(id, { id, content: params.content, tags: params.tags, createdAt: Date.now() });
        return { success: true, id };
      case 'get_memo':
        return memos.get(params.id) || { error: 'Not found' };
      case 'search_memos':
        return { results: Array.from(memos.values()).filter(m => m.content?.includes(params.query)) };
      case 'update_memo':
        if (memos.has(params.id)) {
          memos.get(params.id).content = params.content;
          return { success: true };
        }
        return { error: 'Not found' };
      case 'delete_memo':
        memos.delete(params.id);
        return { success: true };
      case 'list_memos':
        return { memos: Array.from(memos.values()) };
      default:
        throw new Error(`Unknown Memos tool: ${toolName}`);
    }
  }

  getServer(serverName) {
    return this.servers.get(serverName);
  }

  getAllServers() {
    return Array.from(this.servers.values());
  }

  getConnectedServers() {
    return Array.from(this.servers.values()).filter(s => s.status === 'connected');
  }

  getTools(serverName = null) {
    if (serverName) {
      return Array.from(this.tools.values()).filter(t => t.server === serverName);
    }
    return Array.from(this.tools.values());
  }

  getCallHistory(limit = 50) {
    return this.callHistory.slice(-limit);
  }

  getStats() {
    const servers = Array.from(this.servers.values());
    return {
      servers: {
        total: servers.length,
        connected: servers.filter(s => s.status === 'connected').length
      },
      tools: this.tools.size,
      calls: {
        total: this.callHistory.length,
        completed: this.callHistory.filter(c => c.status === 'completed').length,
        failed: this.callHistory.filter(c => c.status === 'failed').length
      }
    };
  }

  destroy() {
    this.servers.clear();
    this.tools.clear();
    this.callHistory = [];
  }
}

module.exports = { MCPBridge };
