/**
 * MCP Manager v2 - 增量更新 + 智能缓存
 * 借鉴 Claude Code MCP 动态管理设计
 *
 * v2 新增特性:
 * - 增量更新: diff 检测，只更新变化的服务器
 * - 智能缓存: LRU 缓存 + 配置哈希
 * - 配置比较: areConfigsEqual 深度比较
 * - 生命周期管理: add/remove/update/reconnect
 */

const { EventEmitter } = require('events');
const { safeSpawn } = require('../utils/SafeExec');

/**
 * MCP 服务器类型
 */
const ServerType = {
  STDIO: 'stdio',
  SSE: 'sse',
  HTTP: 'http',
  WEBSOCKET: 'websocket'
};

/**
 * 服务器连接状态
 */
const ConnectionStatus = {
  PENDING: 'pending',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  FAILED: 'failed',
  NEEDS_AUTH: 'needs-auth'
};

/**
 * 服务器配置
 */
class MCPServerConfig {
  constructor(config = {}) {
    this.type = config.type || ServerType.STDIO;
    this.command = config.command || null;
    this.args = config.args || [];
    this.env = config.env || {};
    this.url = config.url || null;
    this.timeout = config.timeout || 30000;
    this.disabled = config.disabled || false;
  }

  /**
   * 深度克隆配置
   */
  clone() {
    return new MCPServerConfig({
      type: this.type,
      command: this.command,
      args: [...this.args],
      env: { ...this.env },
      url: this.url,
      timeout: this.timeout,
      disabled: this.disabled
    });
  }
}

/**
 * LRU 缓存
 */
class LRUCache {
  constructor(maxSize = 20) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) {return undefined;}
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  has(key) {
    return this.cache.has(key);
  }

  get size() {
    return this.cache.size;
  }
}

/**
 * MCP 服务器客户端
 */
class MCPClient {
  constructor(name, config) {
    this.name = name;
    this.config = config instanceof MCPServerConfig ? config : new MCPServerConfig(config);
    this.status = ConnectionStatus.PENDING;
    this.tools = [];
    this.resources = [];
    this.commands = [];
    this.lastError = null;
    this.process = null;
    this.abortController = null;
  }

  async connect() {
    if (this.status === ConnectionStatus.CONNECTED) {return;}

    this.status = ConnectionStatus.CONNECTING;
    this.abortController = new AbortController();

    try {
      if (this.config.type === ServerType.STDIO) {
        await this._connectStdio();
      } else if (this.config.type === ServerType.SSE) {
        await this._connectSSE();
      } else if (this.config.type === ServerType.HTTP) {
        await this._connectHTTP();
      } else if (this.config.type === ServerType.WEBSOCKET) {
        await this._connectWebSocket();
      }

      this.status = ConnectionStatus.CONNECTED;
      this.lastError = null;
    } catch (error) {
      this.status = ConnectionStatus.FAILED;
      this.lastError = error.message;
      throw error;
    }
  }

  async _connectStdio() {
    return new Promise((resolve, reject) => {
      MCPManager.validateCommand(this.config.command);
      MCPManager.validateArgs(this.config.args);

      const env = { ...process.env, ...this.config.env };

      this.process = safeSpawn(this.config.command, this.config.args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';
      const MAX_STDERR_LENGTH = 65536;
      this.process.stderr.on('data', (data) => {
        if (stderr.length < MAX_STDERR_LENGTH) {
          stderr += data.toString().slice(0, MAX_STDERR_LENGTH - stderr.length);
        }
      });

      this.process.on('error', (error) => {
        this.status = ConnectionStatus.FAILED;
        reject(error);
      });

      this.process.on('exit', (code) => {
        if (code !== 0) {
          this.status = ConnectionStatus.FAILED;
          reject(new Error(`MCP server exited with code ${code}: ${stderr}`));
        }
      });

      setTimeout(() => resolve(), 100);
    });
  }

  async _connectSSE() {
    // SSE 连接简化实现
    this.status = ConnectionStatus.CONNECTED;
  }

  async _connectHTTP() {
    // HTTP 连接简化实现
    this.status = ConnectionStatus.CONNECTED;
  }

  async _connectWebSocket() {
    // WebSocket 连接简化实现
    this.status = ConnectionStatus.CONNECTED;
  }

  async disconnect() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.status = ConnectionStatus.DISCONNECTED;
  }

  async listTools() {
    // 简化实现：返回空列表
    return [];
  }

  async callTool(_name, _args) {
    // 简化实现
    return { content: [] };
  }
}

/**
 * MCP Manager - 增量更新核心
 */
class MCPManager extends EventEmitter {
  static ALLOWED_COMMANDS = new Set(['node', 'python', 'python3']);
  static DANGEROUS_PATTERNS = [/\|\|/, /&&/, /;/, />/, /</, /\$\(/, /`/];

  constructor(options = {}) {
    super();

    this.clients = new Map();
    this.serverConfigs = new Map();
    this.toolCache = new LRUCache(options.cacheSize || 20);
    this.configCache = new LRUCache(options.cacheSize || 20);

    this.maxConcurrent = options.maxConcurrent || 5;
    this.defaultTimeout = options.timeout || 30000;

    this._connectionQueue = [];
    this._activeConnections = 0;
  }

  static validateCommand(command) {
    if (!MCPManager.ALLOWED_COMMANDS.has(command)) {
      throw new Error(`Command not allowed: ${command}. Allowed: ${[...MCPManager.ALLOWED_COMMANDS].join(', ')}`);
    }
  }

  static validateArgs(args) {
    if (!args || !Array.isArray(args)) {return;}
    for (const arg of args) {
      if (typeof arg !== 'string') {continue;}
      for (const pattern of MCPManager.DANGEROUS_PATTERNS) {
        if (pattern.test(arg)) {
          throw new Error(`Dangerous argument pattern: ${arg}`);
        }
      }
    }
  }

  /**
   * 生成服务器缓存键
   */
  _getCacheKey(name, config) {
    const normalized = JSON.stringify({
      type: config.type,
      command: config.command,
      args: config.args,
      url: config.url
    });
    return `${name}:${normalized}`;
  }

  /**
   * 深度比较两个配置是否相等
   * 借鉴 Claude Code areMcpConfigsEqual
   */
  areConfigsEqual(a, b) {
    if (!a || !b) {return false;}
    if (a.type !== b.type) {return false;}

    const normalize = (config) => {
      const { disabled: _d, timeout: _t, ...rest } = config;
      return JSON.stringify(rest);
    };

    return normalize(a) === normalize(b);
  }

  /**
   * 计算配置变更 diff
   * 返回 { added, removed, changed, unchanged }
   * 支持 currentConfigs 为 Map 或普通对象
   */
  computeConfigDiff(currentConfigs, newConfigs) {
    // 统一转换为对象格式
    const current = currentConfigs instanceof Map
      ? Object.fromEntries(currentConfigs)
      : currentConfigs;
    const _currentNames = new Set(Object.keys(current));
    const _newNames = new Set(Object.keys(newConfigs));

    const added = [];
    const removed = [];
    const changed = [];
    const unchanged = [];

    // 检测新增和变更
    for (const [name, config] of Object.entries(newConfigs)) {
      if (!Object.hasOwn(current, name)) {
        added.push(name);
      } else if (!this.areConfigsEqual(current[name], config)) {
        changed.push(name);
      } else {
        unchanged.push(name);
      }
    }

    // 检测移除
    for (const name of Object.keys(current)) {
      if (!Object.hasOwn(newConfigs, name)) {
        removed.push(name);
      }
    }

    return { added, removed, changed, unchanged };
  }

  /**
   * 增量更新服务器配置
   * 借鉴 Claude Code updateMCPServers 模式
   */
  async updateServers(newConfigs) {
    const diff = this.computeConfigDiff(this.serverConfigs, newConfigs);

    // 无变更检查
    if (diff.added.length === 0 &&
        diff.removed.length === 0 &&
        diff.changed.length === 0) {
      return { updated: false, diff };
    }

    this.emit('configChange', { diff });

    // 1. 清理已移除的服务器
    for (const name of diff.removed) {
      await this.removeServer(name);
    }

    // 2. 更新已变更的服务器
    for (const name of diff.changed) {
      await this.updateServer(name, newConfigs[name]);
    }

    // 3. 添加新服务器
    for (const name of diff.added) {
      await this.addServer(name, newConfigs[name]);
    }

    // 4. 更新配置缓存
    this.serverConfigs = new Map(Object.entries(newConfigs));

    return { updated: true, diff };
  }

  /**
   * 添加服务器
   */
  async addServer(name, config) {
    if (this.clients.has(name)) {
      throw new Error(`Server "${name}" already exists`);
    }

    const serverConfig = config instanceof MCPServerConfig
      ? config
      : new MCPServerConfig(config);

    if (serverConfig.disabled) {
      this.emit('serverSkipped', { name, reason: 'disabled' });
      return null;
    }

    const client = new MCPClient(name, serverConfig);
    this.clients.set(name, client);
    this.serverConfigs.set(name, serverConfig);

    // 清除相关缓存
    this._clearCachesForServer(name);

    try {
      await this._connectWithQueue(client);
      this.emit('serverAdded', { name, status: client.status });
      return client;
    } catch (error) {
      this.emit('serverError', { name, error: error.message });
      return client;
    }
  }

  /**
   * 移除服务器
   */
  async removeServer(name) {
    const client = this.clients.get(name);
    if (!client) {return false;}

    try {
      await client.disconnect();
    } catch (error) {
      this.logger?.warn(`Disconnect error for ${name}: ${error.message}`);
    }

    this.clients.delete(name);
    this.serverConfigs.delete(name);
    this._clearCachesForServer(name);

    this.emit('serverRemoved', { name });
    return true;
  }

  /**
   * 更新服务器配置
   */
  async updateServer(name, config) {
    const client = this.clients.get(name);
    const serverConfig = config instanceof MCPServerConfig
      ? config
      : new MCPServerConfig(config);

    if (client) {
      // 断开旧连接
      try {
        await client.disconnect();
      } catch (error) {
        this.logger?.warn(`Update server disconnect error: ${error.message}`);
      }

      // 更新配置
      client.config = serverConfig;
    } else {
      // 创建新客户端
      const newClient = new MCPClient(name, serverConfig);
      this.clients.set(name, newClient);
    }

    this.serverConfigs.set(name, serverConfig);
    this._clearCachesForServer(name);

    if (!serverConfig.disabled) {
      try {
        await this._connectWithQueue(this.clients.get(name));
        this.emit('serverUpdated', { name, status: this.clients.get(name)?.status });
      } catch (error) {
        this.emit('serverError', { name, error: error.message });
      }
    }

    return this.clients.get(name);
  }

  /**
   * 清除服务器相关的所有缓存
   */
  _clearCachesForServer(name) {
    // 清除工具缓存
    this.toolCache.delete(name);

    // 清除配置缓存
    const config = this.serverConfigs.get(name);
    if (config) {
      const key = this._getCacheKey(name, config);
      this.configCache.delete(key);
    }
  }

  /**
   * 带并发控制的连接
   */
  async _connectWithQueue(client) {
    if (this._activeConnections >= this.maxConcurrent) {
      await new Promise((resolve) => {
        this._connectionQueue.push(resolve);
      });
    }

    this._activeConnections++;
    try {
      await client.connect();
    } finally {
      this._activeConnections--;

      // 启动下一个排队的连接
      if (this._connectionQueue.length > 0) {
        const next = this._connectionQueue.shift();
        next();
      }
    }
  }

  /**
   * 重新连接服务器
   */
  async reconnectServer(name) {
    const client = this.clients.get(name);
    if (!client) {
      throw new Error(`Server "${name}" not found`);
    }

    try {
      await client.disconnect();
    } catch (error) {
      this.logger?.warn(`Disconnect error for ${name}: ${error.message}`);
    }

    this._clearCachesForServer(name);
    await this._connectWithQueue(client);

    this.emit('serverReconnected', { name });
    return client;
  }

  /**
   * 清除服务器缓存（不删除服务器）
   * 借鉴 Claude Code clearServerCache
   */
  async clearServerCache(name) {
    const client = this.clients.get(name);
    if (!client) {return;}

    try {
      if (client.status === ConnectionStatus.CONNECTED) {
        await client.disconnect();
      }
    } catch (error) {
      this.logger?.warn(`Cache clear disconnect error for ${name}: ${error.message}`);
    }

    // 清除所有相关缓存
    this._clearCachesForServer(name);

    // 重新连接
    try {
      await this._connectWithQueue(client);
    } catch (error) {
      this.emit('serverError', { name, error: error.message });
    }
  }

  /**
   * 获取服务器
   */
  getServer(name) {
    return this.clients.get(name);
  }

  /**
   * 获取所有服务器
   */
  getAllServers() {
    return Array.from(this.clients.values());
  }

  /**
   * 获取已连接服务器
   */
  getConnectedServers() {
    return this.getAllServers().filter((s) => s.status === ConnectionStatus.CONNECTED);
  }

  /**
   * 获取工具列表（带缓存）
   */
  async getTools(name) {
    const cached = this.toolCache.get(name);
    if (cached) {return cached;}

    const client = this.clients.get(name);
    if (!client || client.status !== ConnectionStatus.CONNECTED) {
      return [];
    }

    const tools = await client.listTools();
    this.toolCache.set(name, tools);
    return tools;
  }

  /**
   * 调用工具
   */
  async callTool(name, toolName, args = {}) {
    const client = this.clients.get(name);
    if (!client || client.status !== ConnectionStatus.CONNECTED) {
      throw new Error(`Server "${name}" is not connected`);
    }

    return client.callTool(toolName, args);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const servers = this.getAllServers();
    return {
      total: servers.length,
      connected: servers.filter((s) => s.status === ConnectionStatus.CONNECTED).length,
      failed: servers.filter((s) => s.status === ConnectionStatus.FAILED).length,
      pending: servers.filter((s) => s.status === ConnectionStatus.PENDING).length,
      byType: servers.reduce((acc, s) => {
        acc[s.config.type] = (acc[s.config.type] || 0) + 1;
        return acc;
      }, {})
    };
  }

  /**
   * 清理所有连接
   */
  async cleanup() {
    const disconnectPromises = [];
    for (const client of this.clients.values()) {
      disconnectPromises.push(
        client.disconnect().catch((error) => {
          this.logger?.debug(`Cleanup disconnect error: ${error.message}`);
        })
      );
    }
    await Promise.all(disconnectPromises);

    this.clients.clear();
    this.serverConfigs.clear();
    this.toolCache.clear();
    this.configCache.clear();
    this._connectionQueue = [];
    this._activeConnections = 0;
  }
}

module.exports = {
  MCPManager,
  MCPClient,
  MCPServerConfig,
  LRUCache,
  ServerType,
  ConnectionStatus
};
