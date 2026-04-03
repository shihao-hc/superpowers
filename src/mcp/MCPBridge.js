const { EventEmitter } = require('events');
const { MCPClient: DefaultMCPClient } = require('./MCPClient');

const READ_ONLY_TOOLS = [
  'read_file', 'list_directory', 'search', 'get_pull_request',
  'list_issues', 'search_repositories', 'think', 'get_file'
];

const CACHEABLE_METHODS = ['tools/call'];

class MCPBridge extends EventEmitter {
  static setMCPClient(clientClass) {
    MCPBridge._MCPClient = clientClass;
  }

  static get MCPClient() {
    return MCPBridge._MCPClient || DefaultMCPClient;
  }

  constructor(options = {}) {
    super();
    this.clients = new Map();
    this.toolToServer = new Map();
    this.serverToTools = new Map();
    this.options = {
      toolCacheTTL: options.toolCacheTTL || 300000,
      rateLimit: options.rateLimit || { enabled: false, maxRequestsPerSecond: 20 },
      enableCallCache: options.enableCallCache !== false,
      callCacheTTL: options.callCacheTTL || 60000,
      maxCacheSize: options.maxCacheSize || 1000,
      ...options
    };
    this.rateLimiter = new Map();
    this.requestQueue = new Map();
    this.circuitBreakers = new Map();
    this.callCache = new Map();
    this.cacheStats = { hits: 0, misses: 0, evictions: 0 };
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      callsByServer: new Map(),
      callsByTool: new Map(),
      callsByRole: new Map(),
      cacheHits: 0,
      cacheMisses: 0
    };
    
    if (this.options.enableCallCache) {
      this._startCacheCleanup();
    }
  }

  _startCacheCleanup() {
    this._cacheCleanupInterval = setInterval(() => {
      this._cleanupCache();
    }, Math.min(this.options.callCacheTTL, 60000));
  }

  _cleanupCache() {
    const now = Date.now();
    let evicted = 0;
    
    for (const [key, entry] of this.callCache.entries()) {
      if (now - entry.timestamp > this.options.callCacheTTL) {
        this.callCache.delete(key);
        evicted++;
      }
    }
    
    if (evicted > 0) {
      this.cacheStats.evictions += evicted;
    }
    
    if (this.callCache.size > this.options.maxCacheSize) {
      const toDelete = Math.ceil(this.options.maxCacheSize * 0.2);
      let count = 0;
      for (const key of this.callCache.keys()) {
        if (count >= toDelete) break;
        this.callCache.delete(key);
        count++;
      }
      this.cacheStats.evictions += count;
    }
  }

  _getCacheKey(toolFullName, params) {
    const normalized = JSON.stringify({ t: toolFullName, p: params });
    return normalized;
  }

  _isCacheable(server, tool) {
    return READ_ONLY_TOOLS.some(t => 
      tool.toLowerCase().includes(t.toLowerCase())
    ) || server.toLowerCase().includes('filesystem');
  }

  _getCachedResult(key) {
    if (!this.options.enableCallCache) return null;
    
    const cached = this.callCache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.options.callCacheTTL) {
      this.callCache.delete(key);
      return null;
    }
    
    this.cacheStats.hits++;
    this.metrics.cacheHits++;
    return cached.result;
  }

  _setCachedResult(key, result) {
    if (!this.options.enableCallCache) return;
    
    if (this.callCache.size >= this.options.maxCacheSize) {
      const firstKey = this.callCache.keys().next().value;
      this.callCache.delete(firstKey);
    }
    
    this.callCache.set(key, {
      result,
      timestamp: Date.now()
    });
  }

  getCacheStats() {
    return {
      size: this.callCache.size,
      maxSize: this.options.maxCacheSize,
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses,
      evictions: this.cacheStats.evictions,
      hitRate: this.cacheStats.hits + this.cacheStats.misses > 0
        ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  clearCache() {
    this.callCache.clear();
    return { success: true, message: 'Cache cleared' };
  }

  async register(config) {
    if (this.clients.has(config.name)) {
      throw new Error(`MCP server ${config.name} is already registered`);
    }

    const clientOptions = {
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      heartbeatInterval: config.heartbeatInterval || 30000,
      maxReconnectAttempts: config.maxReconnectAttempts || 5
    };

    const client = new MCPBridge.MCPClient(
      config.name,
      config.command,
      config.args || [],
      config.env || {},
      clientOptions
    );

    client.on('error', (error) => this.emit('client-error', { server: config.name, error }));
    client.on('reconnecting', (info) => this.emit('reconnecting', { server: config.name, ...info }));
    client.on('reconnected', () => this.emit('reconnected', { server: config.name }));
    client.on('disconnected', () => this.emit('disconnected', { server: config.name }));

    await client.start();

    this.clients.set(config.name, client);
    this.serverToTools.set(config.name, []);
    this._initCircuitBreaker(config.name);

    const tools = await client.listTools();
    for (const tool of tools) {
      const fullName = `${config.name}:${tool.name}`;
      this.toolToServer.set(fullName, config.name);
      this.serverToTools.get(config.name).push({
        ...tool,
        fullName,
        serverName: config.name
      });
    }

    this.emit('server-registered', {
      name: config.name,
      toolsCount: tools.length
    });

    return { name: config.name, toolsCount: tools.length };
  }

  async unregister(serverName) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server ${serverName} is not registered`);
    }

    await client.stop();
    this.clients.delete(serverName);

    for (const [toolFullName, name] of this.toolToServer.entries()) {
      if (name === serverName) {
        this.toolToServer.delete(toolFullName);
      }
    }
    this.serverToTools.delete(serverName);

    this.emit('server-unregistered', { name: serverName });
  }

  async stop() {
    const promises = [];
    for (const [name, client] of this.clients.entries()) {
      promises.push(client.stop().catch(err => {
        console.error(`[MCPBridge] Error stopping ${name}:`, err.message);
      }));
    }
    await Promise.all(promises);
    this.clients.clear();
    this.toolToServer.clear();
    this.serverToTools.clear();
    this.callCache.clear();
    this.emit('stopped');
  }

  async call(toolFullName, params = {}, context = {}) {
    const toolNamePattern = /^[a-zA-Z0-9_-]+:[a-zA-Z0-9_]+$/;
    if (!toolFullName || !toolNamePattern.test(toolFullName)) {
      throw new Error(`Invalid tool name format: ${toolFullName}. Expected format: server:tool`);
    }

    const [serverName, toolName] = toolFullName.split(':');
    if (!serverName || !toolName) {
      throw new Error(`Invalid tool name format: ${toolFullName}. Expected format: server:tool`);
    }

    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server not found: ${serverName}`);
    }

    if (!client.ready) {
      throw new Error(`MCP server ${serverName} is not ready`);
    }

    const skipCache = context.skipCache || false;
    const cacheKey = this._getCacheKey(toolFullName, params);
    
    if (!skipCache && this._isCacheable(serverName, toolName)) {
      const cached = this._getCachedResult(cacheKey);
      if (cached !== null) {
        if (context.traceId) {
          this.emit('call-cached', {
            server: serverName,
            tool: toolName,
            fullName: toolFullName,
            traceId: context.traceId
          });
        }
        return cached;
      }
      this.cacheStats.misses++;
      this.metrics.cacheMisses++;
    }

    this._checkCircuitBreaker(serverName);
    await this._checkRateLimit(serverName);

    const startTime = Date.now();
    this.metrics.totalCalls++;

    if (!this.metrics.callsByServer.has(serverName)) {
      this.metrics.callsByServer.set(serverName, { total: 0, success: 0, failed: 0 });
    }
    const serverMetrics = this.metrics.callsByServer.get(serverName);
    serverMetrics.total++;

    if (!this.metrics.callsByTool.has(toolFullName)) {
      this.metrics.callsByTool.set(toolFullName, { total: 0, success: 0, failed: 0 });
    }
    const toolMetrics = this.metrics.callsByTool.get(toolFullName);
    toolMetrics.total++;

    try {
      const result = await client.callTool(toolName, params);

      this.metrics.successfulCalls++;
      serverMetrics.success++;
      toolMetrics.success++;

      if (this._isCacheable(serverName, toolName)) {
        this._setCachedResult(cacheKey, result);
      }

      this._recordLatency(serverName, toolFullName, Date.now() - startTime);

      if (context.traceId) {
        this.emit('call-success', {
          server: serverName,
          tool: toolName,
          fullName: toolFullName,
          duration: Date.now() - startTime,
          traceId: context.traceId
        });
      }

      this._resetCircuitBreaker(serverName);

      return result;
    } catch (error) {
      this.metrics.failedCalls++;
      serverMetrics.failed++;
      toolMetrics.failed++;

      this._recordLatency(serverName, toolFullName, Date.now() - startTime);
      this._tripCircuitBreaker(serverName);

      if (context.traceId) {
        this.emit('call-error', {
          server: serverName,
          tool: toolName,
          fullName: toolFullName,
          error: error.message,
          traceId: context.traceId
        });
      }

      throw error;
    }
  }

  async batchCall(calls, context = {}) {
    const MAX_BATCH_SIZE = 100;
    if (!calls || !Array.isArray(calls) || calls.length > MAX_BATCH_SIZE) {
      throw new Error(`Batch size must be between 1 and ${MAX_BATCH_SIZE}`);
    }

    const validatedCalls = calls.filter(c => 
      c && 
      typeof c.toolFullName === 'string' && 
      /^[a-zA-Z0-9_-]+:[a-zA-Z0-9_]+$/.test(c.toolFullName)
    );

    const results = await Promise.allSettled(
      calls.map(call => this.call(call.toolFullName, call.params, context))
    );

    return results.map((result, index) => ({
      index,
      toolFullName: calls[index].toolFullName,
      success: result.status === 'fulfilled',
      result: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason.message : null
    }));
  }

  getAvailableTools(serverName = null) {
    if (serverName) {
      return this.serverToTools.get(serverName) || [];
    }

    const allTools = [];
    for (const [name, tools] of this.serverToTools.entries()) {
      allTools.push(...tools);
    }
    return allTools;
  }

  getToolMetadata(toolFullName) {
    const [serverName, toolName] = toolFullName.split(':');
    const client = this.clients.get(serverName);
    if (!client) return null;

    const tools = this.serverToTools.get(serverName) || [];
    return tools.find(t => t.name === toolName) || null;
  }

  getServerStatus(serverName = null) {
    if (serverName) {
      const client = this.clients.get(serverName);
      if (!client) return null;

      return {
        ...client.getStatus(),
        circuitBreaker: this.getCircuitBreakerStatus(serverName),
        tools: this.serverToTools.get(serverName)?.length || 0
      };
    }

    const status = {};
    for (const [name] of this.clients) {
      status[name] = this.getServerStatus(name);
    }
    return status;
  }

  async shutdown() {
    this.emit('shutdown-started');

    const shutdownPromises = [];
    for (const [name, client] of this.clients) {
      shutdownPromises.push(
        client.stop().catch(err => {
          this.emit('shutdown-error', { server: name, error: err.message });
        })
      );
    }

    await Promise.all(shutdownPromises);

    this.clients.clear();
    this.toolToServer.clear();
    this.serverToTools.clear();
    this.circuitBreakers.clear();
    this.rateLimiter.clear();

    this.emit('shutdown-completed');
  }

  _checkRateLimit(serverName) {
    if (!this.options.rateLimit.enabled) return;

    const now = Date.now();
    if (!this.rateLimiter.has(serverName)) {
      this.rateLimiter.set(serverName, []);
    }

    const requests = this.rateLimiter.get(serverName);
    const windowStart = now - 1000;
    const recentRequests = requests.filter(time => time > windowStart);

    if (recentRequests.length >= this.options.rateLimit.maxRequestsPerSecond) {
      const waitTime = Math.ceil((recentRequests[0] + 1000 - now) / 1000) * 1000;
      throw new Error(`Rate limit exceeded for ${serverName}. Retry after ${waitTime}ms`);
    }

    recentRequests.push(now);
    this.rateLimiter.set(serverName, recentRequests);
  }

  _initCircuitBreaker(serverName) {
    this.circuitBreakers.set(serverName, {
      failures: 0,
      lastFailure: null,
      state: 'closed',
      threshold: 5,
      timeout: 30000
    });
  }

  _checkCircuitBreaker(serverName) {
    const cb = this.circuitBreakers.get(serverName);
    if (!cb) return;

    if (cb.state === 'open') {
      const timeSinceFailure = Date.now() - cb.lastFailure;
      if (timeSinceFailure >= cb.timeout) {
        cb.state = 'half-open';
        this.emit('circuit-breaker-half-open', { server: serverName });
      } else {
        throw new Error(`Circuit breaker is open for ${serverName}. Retry after ${cb.timeout - timeSinceFailure}ms`);
      }
    }
  }

  _tripCircuitBreaker(serverName) {
    const cb = this.circuitBreakers.get(serverName);
    if (!cb) return;

    cb.failures++;
    cb.lastFailure = Date.now();

    if (cb.failures >= cb.threshold) {
      cb.state = 'open';
      this.emit('circuit-breaker-opened', { server: serverName });
    }
  }

  _resetCircuitBreaker(serverName) {
    const cb = this.circuitBreakers.get(serverName);
    if (!cb) return;

    cb.failures = 0;
    cb.state = 'closed';
  }

  getCircuitBreakerStatus(serverName) {
    return this.circuitBreakers.get(serverName) || null;
  }

  _recordLatency(serverName, toolFullName, latency) {
    this.emit('latency', { server: serverName, tool: toolFullName, latency });
  }

  getMetrics() {
    return {
      ...this.metrics,
      callsByServer: Object.fromEntries(this.metrics.callsByServer),
      callsByTool: Object.fromEntries(this.metrics.callsByTool),
      callsByRole: Object.fromEntries(this.metrics.callsByRole),
      cacheStats: this.getCacheStats()
    };
  }

  getRegisteredServers() {
    return Array.from(this.clients.keys());
  }

  isServerReady(serverName) {
    const client = this.clients.get(serverName);
    return client?.ready || false;
  }

  async restartServer(serverName) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server ${serverName} is not registered`);
    }

    await client.restart();
    this.emit('server-restarted', { name: serverName });
  }
}

module.exports = { MCPBridge };
