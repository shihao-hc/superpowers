/**
 * MCP 协议服务器
 * 为 OpenCode 提供 MCP 服务能力
 */

const { EventEmitter } = require('events');
const WebSocket = require('ws');

class MCPServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      port: options.port || 3100,
      host: options.host || 'localhost',
      ...options
    };

    this.wss = null;
    this.clients = new Map();
    this.capabilities = {
      tools: {},
      resources: {},
      prompts: {}
    };

    this.requestHandlers = new Map();
    this.notificationHandlers = new Map();

    this.setupDefaultHandlers();
  }

  /**
   * 设置默认处理器
   */
  setupDefaultHandlers() {
    // 初始化请求
    this.requestHandlers.set('initialize', this.handleInitialize.bind(this));
    this.requestHandlers.set('tools/list', this.handleToolsList.bind(this));
    this.requestHandlers.set('tools/call', this.handleToolsCall.bind(this));
    this.requestHandlers.set('resources/list', this.handleResourcesList.bind(this));
    this.requestHandlers.set('resources/read', this.handleResourcesRead.bind(this));
    this.requestHandlers.set('prompts/list', this.handlePromptsList.bind(this));
    this.requestHandlers.set('prompts/get', this.handlePromptsGet.bind(this));

    // 通知处理器
    this.notificationHandlers.set('initialized', () => {});
    this.notificationHandlers.set('ping', () => this.sendNotification('pong'));
  }

  /**
   * 启动服务器
   */
  start() {
    return new Promise((resolve) => {
      this.wss = new WebSocket.Server({
        port: this.options.port,
        host: this.options.host
      });

      this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
      this.wss.on('error', (error) => this.emit('error', error));

      console.log(`MCP Server started on ${this.options.host}:${this.options.port}`);
      resolve();
    });
  }

  /**
   * 处理新连接
   */
  handleConnection(ws, _req) {
    const clientId = this.generateId();
    const clientInfo = {
      id: clientId,
      ws,
      capabilities: {},
      connectedAt: Date.now()
    };

    this.clients.set(clientId, clientInfo);
    this.emit('clientConnected', clientInfo);

    ws.on('message', (data) => {
      this.handleMessage(clientId, JSON.parse(data.toString()));
    });

    ws.on('close', () => {
      this.clients.delete(clientId);
      this.emit('clientDisconnected', clientId);
    });

    ws.on('error', (error) => {
      this.emit('clientError', clientId, error);
    });
  }

  /**
   * 处理消息
   */
  async handleMessage(clientId, message) {
    const { id, method, params } = message;

    if (id !== undefined) {
      // 请求
      const handler = this.requestHandlers.get(method);
      if (handler) {
        try {
          const result = await handler(params);
          this.sendResponse(clientId, { jsonrpc: '2.0', id, result });
        } catch (error) {
          this.sendResponse(clientId, {
            jsonrpc: '2.0',
            id,
            error: { code: -32603, message: error.message }
          });
        }
      } else {
        this.sendResponse(clientId, {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: 'Method not found' }
        });
      }
    } else if (method) {
      // 通知
      const handler = this.notificationHandlers.get(method);
      if (handler) {
        await handler(params);
      }
      this.emit('notification', { method, params, clientId });
    }
  }

  /**
   * 发送响应
   */
  sendResponse(clientId, response) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(response));
    }
  }

  /**
   * 发送通知
   */
  sendNotification(method, params = {}) {
    const notification = { jsonrpc: '2.0', method, params };
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(notification));
      }
    }
  }

  /**
   * 请求处理器
   */
  async handleInitialize(params) {
    const client = Array.from(this.clients.values()).find((c) => c.capabilities && Object.keys(c.capabilities).length === 0);
    if (client) {
      client.capabilities = params.capabilities || {};
      client.clientInfo = params.clientInfo;
    }

    return {
      protocolVersion: '2024-11-05',
      capabilities: this.capabilities,
      serverInfo: {
        name: 'opencode-mcp-server',
        version: '1.0.0'
      }
    };
  }

  async handleToolsList() {
    const tools = Object.values(this.capabilities.tools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));

    return { tools };
  }

  async handleToolsCall(params) {
    const { name, arguments: args } = params;
    const tool = this.capabilities.tools[name];

    if (!tool) {
      throw new Error('Unknown tool');
    }

    if (tool.handler) {
      return await tool.handler(args);
    }

    throw new Error('Tool has no handler');
  }

  async handleResourcesList() {
    const resources = Object.values(this.capabilities.resources).map((resource) => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType
    }));

    return { resources };
  }

  async handleResourcesRead(params) {
    const { uri } = params;
    const resource = this.capabilities.resources[uri];

    if (!resource) {
      throw new Error('Resource not found');
    }

    if (resource.contents) {
      return { contents: resource.contents };
    }

    if (resource.readHandler) {
      return await resource.readHandler(params);
    }

    throw new Error('Resource has no contents or handler');
  }

  async handlePromptsList() {
    const prompts = Object.values(this.capabilities.prompts).map((prompt) => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments
    }));

    return { prompts };
  }

  async handlePromptsGet(params) {
    const { name, arguments: args } = params;
    const prompt = this.capabilities.prompts[name];

    if (!prompt) {
      throw new Error('Prompt not found');
    }

    if (prompt.handler) {
      return await prompt.handler(args);
    }

    throw new Error('Prompt has no handler');
  }

  /**
   * 注册工具
   */
  registerTool(tool) {
    this.capabilities.tools[tool.name] = tool;
    this.sendNotification('notifications/tools/list_changed');
  }

  /**
   * 注册资源
   */
  registerResource(resource) {
    this.capabilities.resources[resource.uri] = resource;
    this.sendNotification('notifications/resources/list_changed');
  }

  /**
   * 注册提示
   */
  registerPrompt(prompt) {
    this.capabilities.prompts[prompt.name] = prompt;
  }

  /**
   * 移除工具
   */
  unregisterTool(name) {
    delete this.capabilities.tools[name];
    this.sendNotification('notifications/tools/list_changed');
  }

  /**
   * 生成客户端ID
   */
  generateId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 停止服务器
   */
  stop() {
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    console.log('MCP Server stopped');
  }
}

module.exports = { MCPServer };
