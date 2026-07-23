/**
 * MCP 协议客户端
 * Model Context Protocol - 基于官方规范
 */

const { EventEmitter } = require('events');
const WebSocket = require('ws');
const http = require('http');
const https = require('https');

class MCPClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      protocolVersion: '2024-11-05',
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      ...options
    };

    this.ws = null;
    this.http = null;
    this.connected = false;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.capabilities = {};
    this.tools = new Map();
    this.resources = new Map();
    this.prompts = new Map();
  }

  /**
   * 连接到 MCP 服务器
   */
  async connect(url, transport = 'websocket') {
    if (url && typeof url === 'string') {
      const { validateURL } = require('../utils/SSRFValidator');
      const result = validateURL(url, { allowPrivate: true, allowLoopback: true });
      if (!result.allowed) {
        throw new Error(`SSRF blocked: ${result.reason}`);
      }
    }

    const attempts = this.options.retryAttempts;

    for (let i = 0; i < attempts; i++) {
      try {
        if (transport === 'websocket') {
          await this.connectWebSocket(url);
        } else {
          await this.connectHTTP(url);
        }
        this.connected = true;
        this.emit('connected');
        return true;
      } catch (error) {
        if (i === attempts - 1) {throw error;}
        await this.delay(this.options.retryDelay * (i + 1));
      }
    }
  }

  /**
   * WebSocket 连接
   */
  async connectWebSocket(url) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      const timeout = setTimeout(() => reject(new Error('Connection timeout')), this.options.timeout);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.shortcuts.initialize();
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(JSON.parse(data.toString()));
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      this.ws.on('close', () => {
        this.connected = false;
        this.emit('disconnected');
      });
    });
  }

  /**
   * HTTP 连接 (SSE)
   */
  async connectHTTP(url) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {reject(new Error('HTTP connection timeout'));}
      }, this.options.timeout);

      this.http = client.request(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        }
      }, (res) => {
        res.on('data', (chunk) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              this.handleMessage(JSON.parse(line.substring(6)));
            }
          }
        });

        res.on('end', () => {
          this.connected = false;
          this.emit('disconnected');
        });

        resolved = true;
        clearTimeout(timeout);
        resolve();
      });

      this.http.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      this.http.end();
    });
  }

  /**
   * 处理收到的消息
   */
  handleMessage(message) {
    const { id, method, params, result, error } = message;

    if (id !== undefined) {
      // 响应消息
      const pending = this.pendingRequests.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(id);
        if (error) {
          pending.reject(new Error(error.message));
        } else {
          pending.resolve(result);
        }
      }
    } else if (method) {
      // 请求消息 (服务器推送)
      this.handleRequest(method, params);
    }

    // 处理结果
    if (result) {
      if (result.capabilities) {
        this.capabilities = result.capabilities;
      }
    }
  }

  /**
   * 处理服务器请求
   */
  handleRequest(method, _params) {
    switch (method) {
    case 'notifications/initialized':
      this.emit('initialized');
      break;
    case 'notifications/tools/list_changed':
      this.emit('toolsChanged');
      break;
    case 'notifications/resources/list_changed':
      this.emit('resourcesChanged');
      break;
    case 'ping':
      this.shortcuts.pong();
      break;
    }
  }

  /**
   * 发送 JSON-RPC 请求
   */
  async sendRequest(method, params = {}) {
    const id = ++this.requestId;

    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${id} timed out`));
        }
      }, this.options.timeout);
      this.pendingRequests.set(id, { resolve, reject, timer });
    });

    this.send(method, { id, method, params });
    return promise;
  }

  /**
   * 发送消息
   */
  send(method, payload = {}) {
    const message = {
      jsonrpc: '2.0',
      ...payload
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * 快捷发送方法
   */
  shortcuts = {
    initialize: () => this.send(null, {
      method: 'initialize',
      params: {
        protocolVersion: this.options.protocolVersion,
        capabilities: this.options.capabilities || {},
        clientInfo: this.options.clientInfo || {
          name: 'opencode',
          version: '1.0.0'
        }
      }
    }),

    ping: () => this.send(null, { method: 'ping' }),
    pong: () => this.send(null, { method: 'pong' }),

    tools: {
      list: () => this.sendRequest('tools/list'),
      call: (name, args) => this.sendRequest('tools/call', { name, arguments: args })
    },

    resources: {
      list: () => this.sendRequest('resources/list'),
      read: (uri) => this.sendRequest('resources/read', { uri }),
      subscribe: (uri) => this.sendRequest('resources/subscribe', { uri }),
      unsubscribe: (uri) => this.sendRequest('resources/unsubscribe', { uri })
    },

    prompts: {
      list: () => this.sendRequest('prompts/list'),
      get: (name, args) => this.sendRequest('prompts/get', { name, arguments: args })
    }
  };

  /**
   * 获取工具列表
   */
  async listTools() {
    const result = await this.shortcuts.tools.list();
    if (result?.tools) {
      this.tools.clear();
      for (const tool of result.tools) {
        this.tools.set(tool.name, tool);
      }
    }
    return result;
  }

  /**
   * 调用工具
   */
  async callTool(name, args = {}) {
    return this.shortcuts.tools.call(name, args);
  }

  /**
   * 获取资源列表
   */
  async listResources() {
    const result = await this.shortcuts.resources.list();
    if (result?.resources) {
      this.resources.clear();
      for (const resource of result.resources) {
        this.resources.set(resource.uri, resource);
      }
    }
    return result;
  }

  /**
   * 读取资源
   */
  async readResource(uri) {
    return this.shortcuts.resources.read(uri);
  }

  /**
   * 获取提示列表
   */
  async listPrompts() {
    const result = await this.shortcuts.prompts.list();
    if (result?.prompts) {
      this.prompts.clear();
      for (const prompt of result.prompts) {
        this.prompts.set(prompt.name, prompt);
      }
    }
    return result;
  }

  /**
   * 获取提示
   */
  async getPrompt(name, args = {}) {
    return this.shortcuts.prompts.get(name, args);
  }

  /**
   * 延迟
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.http) {
      this.http.destroy();
      this.http = null;
    }
    this.connected = false;
    this.pendingRequests.clear();
    this.emit('disconnected');
  }
}

module.exports = { MCPClient };
