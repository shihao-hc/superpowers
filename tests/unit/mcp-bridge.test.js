const { MCPBridge } = require('../../src/mcp/MCPBridge');
const { EventEmitter } = require('events');

class MockMCPClient extends EventEmitter {
  constructor(name, command, args, env, options) {
    super();
    this.name = name;
    this.command = command;
    this.args = args;
    this.env = env;
    this.options = options;
    this.ready = false;
    this._started = false;
    this._stopped = false;
    this._restarted = false;
  }

  async start() {
    this._started = true;
    this.ready = true;
  }

  async stop() {
    this._stopped = true;
    this.ready = false;
  }

  async restart() {
    this._restarted = true;
  }

  async listTools() {
    return [
      { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      { name: 'write_file', description: 'Write a file', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } }
    ];
  }

  async callTool(toolName, params) {
    if (toolName === 'fail_tool') throw new Error('Tool execution failed');
    return { result: `${toolName} called with ${JSON.stringify(params)}` };
  }

  getStatus() {
    return { name: this.name, ready: this.ready, connected: this.ready };
  }
}

const MOCK_CONFIG = {
  name: 'test-server',
  command: 'node',
  args: ['server.js'],
  env: { NODE_ENV: 'test' }
};

describe('MCPBridge', () => {
  let bridge;

  beforeEach(() => {
    MCPBridge.setMCPClient(MockMCPClient);
    bridge = new MCPBridge({ enableCallCache: true, callCacheTTL: 5000, maxCacheSize: 10 });
  });

  afterEach(async () => {
    jest.useRealTimers();
    try { await bridge.stop(); } catch (e) { /* ignore */ }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const b = new MCPBridge();
      expect(b.clients).toBeInstanceOf(Map);
      expect(b.toolToServer).toBeInstanceOf(Map);
      expect(b.serverToTools).toBeInstanceOf(Map);
      expect(b.options.toolCacheTTL).toBe(300000);
      expect(b.options.rateLimit.enabled).toBe(false);
      expect(b.options.enableCallCache).toBe(true);
      expect(b.options.callCacheTTL).toBe(60000);
      expect(b.options.maxCacheSize).toBe(1000);
      expect(b.rateLimiter).toBeInstanceOf(Map);
      expect(b.circuitBreakers).toBeInstanceOf(Map);
      expect(b.callCache).toBeInstanceOf(Map);
      expect(b.metrics.totalCalls).toBe(0);
      expect(b.metrics.successfulCalls).toBe(0);
      expect(b.metrics.failedCalls).toBe(0);
      clearInterval(b._cacheCleanupInterval);
    });

    it('should start cache cleanup when enabled', () => {
      const b = new MCPBridge({ enableCallCache: true, callCacheTTL: 100 });
      expect(b._cacheCleanupInterval).toBeDefined();
      clearInterval(b._cacheCleanupInterval);
    });

    it('should not start cache cleanup when disabled', () => {
      const b = new MCPBridge({ enableCallCache: false });
      expect(b._cacheCleanupInterval).toBeUndefined();
    });

    it('should merge provided options with defaults', () => {
      const b = new MCPBridge({ callCacheTTL: 999, maxCacheSize: 5, rateLimit: { enabled: true, maxRequestsPerSecond: 10 } });
      expect(b.options.callCacheTTL).toBe(999);
      expect(b.options.maxCacheSize).toBe(5);
      expect(b.options.rateLimit.enabled).toBe(true);
      expect(b.options.rateLimit.maxRequestsPerSecond).toBe(10);
      expect(b.options.toolCacheTTL).toBe(300000);
      clearInterval(b._cacheCleanupInterval);
    });
  });

  describe('register', () => {
    it('should register a server and its tools', async () => {
      const result = await bridge.register(MOCK_CONFIG);
      expect(result.name).toBe('test-server');
      expect(result.toolsCount).toBe(2);
      expect(bridge.clients.has('test-server')).toBe(true);
      expect(bridge.serverToTools.has('test-server')).toBe(true);
    });

    it('should throw if server already registered', async () => {
      await bridge.register(MOCK_CONFIG);
      await expect(bridge.register(MOCK_CONFIG)).rejects.toThrow('already registered');
    });

    it('should create tool mappings on register', async () => {
      await bridge.register(MOCK_CONFIG);
      expect(bridge.toolToServer.get('test-server:read_file')).toBe('test-server');
      expect(bridge.toolToServer.get('test-server:write_file')).toBe('test-server');
    });

    it('should store enriched tool metadata', async () => {
      await bridge.register(MOCK_CONFIG);
      const tools = bridge.serverToTools.get('test-server');
      expect(tools).toHaveLength(2);
      expect(tools[0].fullName).toBe('test-server:read_file');
      expect(tools[0].serverName).toBe('test-server');
    });

    it('should init circuit breaker for new server', async () => {
      await bridge.register(MOCK_CONFIG);
      const cb = bridge.getCircuitBreakerStatus('test-server');
      expect(cb).toBeDefined();
      expect(cb.state).toBe('closed');
      expect(cb.failures).toBe(0);
      expect(cb.threshold).toBe(5);
      expect(cb.timeout).toBe(30000);
    });

    it('should emit server-registered event', async () => {
      const handler = jest.fn();
      bridge.on('server-registered', handler);
      await bridge.register(MOCK_CONFIG);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ name: 'test-server', toolsCount: 2 }));
    });

    it('should wire client error events to bridge', async () => {
      await bridge.register(MOCK_CONFIG);
      const errHandler = jest.fn();
      bridge.on('client-error', errHandler);
      const client = bridge.clients.get('test-server');
      client.emit('error', new Error('conn failed'));
      expect(errHandler).toHaveBeenCalledWith(expect.objectContaining({ server: 'test-server', error: expect.any(Error) }));
    });

    it('should wire reconnecting events', async () => {
      await bridge.register(MOCK_CONFIG);
      const handler = jest.fn();
      bridge.on('reconnecting', handler);
      const client = bridge.clients.get('test-server');
      client.emit('reconnecting', { attempt: 1 });
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ server: 'test-server', attempt: 1 }));
    });

    it('should wire reconnected events', async () => {
      await bridge.register(MOCK_CONFIG);
      const handler = jest.fn();
      bridge.on('reconnected', handler);
      const client = bridge.clients.get('test-server');
      client.emit('reconnected');
      expect(handler).toHaveBeenCalledWith({ server: 'test-server' });
    });

    it('should wire disconnected events', async () => {
      await bridge.register(MOCK_CONFIG);
      const handler = jest.fn();
      bridge.on('disconnected', handler);
      const client = bridge.clients.get('test-server');
      client.emit('disconnected');
      expect(handler).toHaveBeenCalledWith({ server: 'test-server' });
    });
  });

  describe('unregister', () => {
    it('should unregister a server and clean up mappings', async () => {
      await bridge.register(MOCK_CONFIG);
      await bridge.unregister('test-server');
      expect(bridge.clients.has('test-server')).toBe(false);
      expect(bridge.toolToServer.has('test-server:read_file')).toBe(false);
      expect(bridge.serverToTools.has('test-server')).toBe(false);
    });

    it('should throw if server not registered', async () => {
      await expect(bridge.unregister('nonexistent')).rejects.toThrow('is not registered');
    });

    it('should stop the client', async () => {
      await bridge.register(MOCK_CONFIG);
      const client = bridge.clients.get('test-server');
      await bridge.unregister('test-server');
      expect(client._stopped).toBe(true);
    });

    it('should emit server-unregistered event', async () => {
      await bridge.register(MOCK_CONFIG);
      const handler = jest.fn();
      bridge.on('server-unregistered', handler);
      await bridge.unregister('test-server');
      expect(handler).toHaveBeenCalledWith({ name: 'test-server' });
    });
  });

  describe('call', () => {
    beforeEach(async () => {
      await bridge.register(MOCK_CONFIG);
    });

    it('should call a tool and return result', async () => {
      const result = await bridge.call('test-server:read_file', { path: '/test.txt' });
      expect(result).toEqual({ result: 'read_file called with {"path":"/test.txt"}' });
    });

    it('should throw on invalid tool name format', async () => {
      await expect(bridge.call('invalid')).rejects.toThrow('Invalid tool name format');
    });

    it('should throw on missing server name in split', async () => {
      await expect(bridge.call(':tool')).rejects.toThrow('Invalid tool name format');
    });

    it('should throw on server not found', async () => {
      await expect(bridge.call('unknown:tool')).rejects.toThrow('MCP server not found');
    });

    it('should throw if server is not ready', async () => {
      bridge.clients.get('test-server').ready = false;
      await expect(bridge.call('test-server:read_file')).rejects.toThrow('is not ready');
    });

    it('should cache results for read-only tools', async () => {
      const r1 = await bridge.call('test-server:read_file', { path: '/a.txt' });
      const r2 = await bridge.call('test-server:read_file', { path: '/a.txt' });
      expect(r1).toEqual(r2);
    });

    it('should fire PRE_TOOL_USE and POST_TOOL_USE hooks on successful call', async () => {
      const hooks = require('../../src/hooks');
      const triggerSpy = jest.spyOn(hooks, 'triggerHook');
      await bridge.call('test-server:read_file', { path: '/hook.txt' });
      expect(triggerSpy).toHaveBeenCalledWith('BeforeTool', expect.objectContaining({
        toolName: 'test-server:read_file',
        args: { path: '/hook.txt' }
      }));
      expect(triggerSpy).toHaveBeenCalledWith('AfterTool', expect.objectContaining({
        toolName: 'test-server:read_file'
      }));
      triggerSpy.mockRestore();
    });

    it('should fire TOOL_ERROR hook when tool call fails', async () => {
      const hooks = require('../../src/hooks');
      const triggerSpy = jest.spyOn(hooks, 'triggerHook');
      await expect(bridge.call('test-server:fail_tool', {})).rejects.toThrow('Tool execution failed');
      expect(triggerSpy).toHaveBeenCalledWith('OnError', expect.objectContaining({
        toolName: 'test-server:fail_tool',
        error: 'Tool execution failed'
      }));
      triggerSpy.mockRestore();
    });

    it('should reject tool call when PRE_TOOL_USE analysis returns BLOCK', async () => {
      const hooks = require('../../src/hooks');
      const realTrigger = hooks.triggerHook;
      hooks.triggerHook = async (event, ctx) => {
        if (event === 'BeforeTool') {
          ctx._riskAnalysis = { action: 'BLOCK', reason: 'forbidden shell exec' };
        }
        return [];
      };
      try {
        await expect(bridge.call('test-server:write_file', { path: '/x' }))
          .rejects.toThrow(/Blocked by risk analysis/);
      } finally {
        hooks.triggerHook = realTrigger;
      }
    });

    it('should execute tool when PRE_TOOL_USE analysis is not BLOCK', async () => {
      const hooks = require('../../src/hooks');
      const realTrigger = hooks.triggerHook;
      hooks.triggerHook = async (event, ctx) => {
        if (event === 'BeforeTool') {
          ctx._riskAnalysis = { action: 'ALLOW', reason: 'ok' };
        }
        return [];
      };
      try {
        const result = await bridge.call('test-server:write_file', { path: '/x', content: 'y' });
        expect(result).toEqual({ result: 'write_file called with {"path":"/x","content":"y"}' });
      } finally {
        hooks.triggerHook = realTrigger;
      }
    });

    it('should not break tool call when hooks module is unavailable', async () => {
      const realRequire = module.constructor.prototype.require;
      module.constructor.prototype.require = function (id) {
        if (id.includes('hooks/index')) {throw new Error('hooks unavailable');}
        return realRequire.call(this, id);
      };
      try {
        const result = await bridge.call('test-server:read_file', { path: '/no-hook.txt' });
        expect(result).toEqual({ result: 'read_file called with {"path":"/no-hook.txt"}' });
      } finally {
        module.constructor.prototype.require = realRequire;
      }
    });

    it('should skip cache when skipCache is true', async () => {
      const callToolSpy = jest.spyOn(bridge.clients.get('test-server'), 'callTool');
      await bridge.call('test-server:read_file', { path: '/a.txt' }, { skipCache: true });
      await bridge.call('test-server:read_file', { path: '/a.txt' }, { skipCache: true });
      expect(callToolSpy).toHaveBeenCalledTimes(2);
    });

    it('should emit call-cached event on cache hit with traceId', async () => {
      const handler = jest.fn();
      bridge.on('call-cached', handler);
      await bridge.call('test-server:read_file', { path: '/a.txt' }, { traceId: 't1' });
      await bridge.call('test-server:read_file', { path: '/a.txt' }, { traceId: 't1' });
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ server: 'test-server', tool: 'read_file', traceId: 't1' }));
    });

    it('should NOT cache non-read-only tools', async () => {
      const spy = jest.spyOn(bridge.clients.get('test-server'), 'callTool');
      await bridge.call('test-server:write_file', { path: '/a.txt', content: 'x' });
      await bridge.call('test-server:write_file', { path: '/a.txt', content: 'x' });
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('should emit call-success event on success with traceId', async () => {
      const handler = jest.fn();
      bridge.on('call-success', handler);
      await bridge.call('test-server:read_file', { path: '/a.txt' }, { traceId: 't1' });
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ server: 'test-server', tool: 'read_file', traceId: 't1' }));
    });

    it('should emit call-error event on failure with traceId', async () => {
      const handler = jest.fn();
      bridge.on('call-error', handler);
      await expect(bridge.call('test-server:fail_tool', {}, { traceId: 't1' })).rejects.toThrow();
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ server: 'test-server', tool: 'fail_tool', traceId: 't1' }));
    });

    it('should increment metrics on success', async () => {
      await bridge.call('test-server:read_file', { path: '/a.txt' });
      const m = bridge.getMetrics();
      expect(m.totalCalls).toBe(1);
      expect(m.successfulCalls).toBe(1);
      expect(m.failedCalls).toBe(0);
    });

    it('should increment metrics on failure', async () => {
      await expect(bridge.call('test-server:fail_tool', {})).rejects.toThrow();
      const m = bridge.getMetrics();
      expect(m.totalCalls).toBe(1);
      expect(m.successfulCalls).toBe(0);
      expect(m.failedCalls).toBe(1);
    });

    it('should record server-level metrics', async () => {
      await bridge.call('test-server:read_file', { path: '/a.txt' });
      await expect(bridge.call('test-server:fail_tool', {})).rejects.toThrow();
      const m = bridge.getMetrics();
      const sm = m.callsByServer['test-server'];
      expect(sm.total).toBe(2);
      expect(sm.success).toBe(1);
      expect(sm.failed).toBe(1);
    });

    it('should record tool-level metrics', async () => {
      await bridge.call('test-server:read_file', { path: '/a.txt' });
      const m = bridge.getMetrics();
      const tm = m.callsByTool['test-server:read_file'];
      expect(tm.total).toBe(1);
      expect(tm.success).toBe(1);
    });

    it('should respect rate limit when enabled', async () => {
      bridge.options.rateLimit.enabled = true;
      bridge.options.rateLimit.maxRequestsPerSecond = 1;
      await bridge.call('test-server:read_file', { path: '/a.txt' });
      await expect(bridge.call('test-server:read_file', { path: '/b.txt' })).rejects.toThrow('Rate limit exceeded');
    });

    it('should trip circuit breaker on failures', async () => {
      for (let i = 0; i < 5; i++) {
        await expect(bridge.call('test-server:fail_tool', {})).rejects.toThrow();
      }
      const cb = bridge.getCircuitBreakerStatus('test-server');
      expect(cb.state).toBe('open');
    });

    it('should block calls when circuit breaker is open', async () => {
      for (let i = 0; i < 5; i++) {
        await expect(bridge.call('test-server:fail_tool', {})).rejects.toThrow();
      }
      await expect(bridge.call('test-server:read_file', { path: '/a.txt' })).rejects.toThrow('Circuit breaker is open');
    });

    it('should emit circuit-breaker-opened event', async () => {
      const handler = jest.fn();
      bridge.on('circuit-breaker-opened', handler);
      for (let i = 0; i < 5; i++) {
        await expect(bridge.call('test-server:fail_tool', {})).rejects.toThrow();
      }
      expect(handler).toHaveBeenCalledWith({ server: 'test-server' });
    });

    it('should emit latency event', async () => {
      const handler = jest.fn();
      bridge.on('latency', handler);
      await bridge.call('test-server:read_file', { path: '/a.txt' });
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ server: 'test-server', tool: 'test-server:read_file' }));
    });
  });

  describe('batchCall', () => {
    beforeEach(async () => {
      await bridge.register(MOCK_CONFIG);
    });

    it('should execute multiple calls and return results', async () => {
      const results = await bridge.batchCall([
        { toolFullName: 'test-server:read_file', params: { path: '/a.txt' } },
        { toolFullName: 'test-server:write_file', params: { path: '/b.txt', content: 'x' } }
      ]);
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should return error entry for failed calls', async () => {
      const results = await bridge.batchCall([
        { toolFullName: 'test-server:fail_tool', params: {} }
      ]);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Tool execution failed');
    });

    it('should return empty array for empty batch', async () => {
      const result = await bridge.batchCall([]);
      expect(result).toEqual([]);
    });

    it('should throw on batch exceeding limit', async () => {
      const many = new Array(101).fill({ toolFullName: 'test-server:read_file', params: {} });
      await expect(bridge.batchCall(many)).rejects.toThrow('Batch size');
    });

    it('should throw on non-array input', async () => {
      await expect(bridge.batchCall(null)).rejects.toThrow('Batch size');
    });
  });

  describe('getAvailableTools', () => {
    it('should return all tools when no server specified', async () => {
      await bridge.register(MOCK_CONFIG);
      const tools = bridge.getAvailableTools();
      expect(tools).toHaveLength(2);
    });

    it('should return tools for specific server', async () => {
      await bridge.register(MOCK_CONFIG);
      const tools = bridge.getAvailableTools('test-server');
      expect(tools).toHaveLength(2);
    });

    it('should return empty array for unknown server', async () => {
      const tools = bridge.getAvailableTools('unknown');
      expect(tools).toEqual([]);
    });
  });

  describe('getToolMetadata', () => {
    it('should return metadata for a tool', async () => {
      await bridge.register(MOCK_CONFIG);
      const meta = bridge.getToolMetadata('test-server:read_file');
      expect(meta).toBeDefined();
      expect(meta.name).toBe('read_file');
    });

    it('should return null for unknown server', async () => {
      const meta = bridge.getToolMetadata('unknown:tool');
      expect(meta).toBeNull();
    });

    it('should return null for unknown tool', async () => {
      await bridge.register(MOCK_CONFIG);
      const meta = bridge.getToolMetadata('test-server:nonexistent');
      expect(meta).toBeNull();
    });
  });

  describe('getServerStatus', () => {
    it('should return status for a specific server', async () => {
      await bridge.register(MOCK_CONFIG);
      const status = bridge.getServerStatus('test-server');
      expect(status).toBeDefined();
      expect(status.name).toBe('test-server');
      expect(status.ready).toBe(true);
      expect(status.circuitBreaker).toBeDefined();
      expect(status.tools).toBe(2);
    });

    it('should return null for unknown server', () => {
      expect(bridge.getServerStatus('unknown')).toBeNull();
    });

    it('should return all statuses when no server specified', async () => {
      await bridge.register(MOCK_CONFIG);
      const all = bridge.getServerStatus();
      expect(all['test-server']).toBeDefined();
    });
  });

  describe('stop', () => {
    it('should stop all clients and clear data', async () => {
      await bridge.register(MOCK_CONFIG);
      await bridge.stop();
      expect(bridge.clients.size).toBe(0);
      expect(bridge.toolToServer.size).toBe(0);
      expect(bridge.serverToTools.size).toBe(0);
    });

    it('should emit stopped event', async () => {
      const handler = jest.fn();
      bridge.on('stopped', handler);
      await bridge.stop();
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should stop all clients and clear all stores', async () => {
      await bridge.register(MOCK_CONFIG);
      await bridge.shutdown();
      expect(bridge.clients.size).toBe(0);
      expect(bridge.toolToServer.size).toBe(0);
      expect(bridge.serverToTools.size).toBe(0);
      expect(bridge.circuitBreakers.size).toBe(0);
    });

    it('should emit shutdown-started and shutdown-completed', async () => {
      const started = jest.fn();
      const completed = jest.fn();
      bridge.on('shutdown-started', started);
      bridge.on('shutdown-completed', completed);
      await bridge.shutdown();
      expect(started).toHaveBeenCalled();
      expect(completed).toHaveBeenCalled();
    });
  });

  describe('restartServer', () => {
    it('should restart a registered server', async () => {
      await bridge.register(MOCK_CONFIG);
      const handler = jest.fn();
      bridge.on('server-restarted', handler);
      await bridge.restartServer('test-server');
      const client = bridge.clients.get('test-server');
      expect(client._restarted).toBe(true);
      expect(handler).toHaveBeenCalledWith({ name: 'test-server' });
    });

    it('should throw if server not registered', async () => {
      await expect(bridge.restartServer('unknown')).rejects.toThrow('is not registered');
    });
  });

  describe('getRegisteredServers', () => {
    it('should return list of server names', async () => {
      await bridge.register(MOCK_CONFIG);
      expect(bridge.getRegisteredServers()).toEqual(['test-server']);
    });

    it('should return empty list when no servers', () => {
      expect(bridge.getRegisteredServers()).toEqual([]);
    });
  });

  describe('isServerReady', () => {
    it('should return true for ready server', async () => {
      await bridge.register(MOCK_CONFIG);
      expect(bridge.isServerReady('test-server')).toBe(true);
    });

    it('should return false for unregistered server', () => {
      expect(bridge.isServerReady('unknown')).toBe(false);
    });
  });

  describe('cache management', () => {
    it('should get cache stats', async () => {
      await bridge.register(MOCK_CONFIG);
      const stats = bridge.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBe(10);
      expect(stats.hitRate).toBe('0%');
    });

    it('should clear cache', async () => {
      bridge.callCache.set('k', 'v');
      const result = bridge.clearCache();
      expect(bridge.callCache.size).toBe(0);
      expect(result.success).toBe(true);
    });

    it('should compute hit rate correctly', async () => {
      await bridge.register(MOCK_CONFIG);
      await bridge.call('test-server:read_file', { path: '/a.txt' });
      await bridge.call('test-server:read_file', { path: '/a.txt' });
      const stats = bridge.getCacheStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe('50.00%');
    });

    it('should evict old cache entries on cleanup', () => {
      jest.useFakeTimers();
      const b = new MCPBridge({ enableCallCache: true, callCacheTTL: 100, maxCacheSize: 100 });
      b.callCache.set('old1', { result: 'x', timestamp: Date.now() - 200 });
      b.callCache.set('old2', { result: 'y', timestamp: Date.now() - 200 });
      b.callCache.set('fresh', { result: 'z', timestamp: Date.now() });
      b._cleanupCache();
      expect(b.callCache.has('old1')).toBe(false);
      expect(b.callCache.has('old2')).toBe(false);
      expect(b.callCache.has('fresh')).toBe(true);
      expect(b.cacheStats.evictions).toBe(2);
      jest.useRealTimers();
      clearInterval(b._cacheCleanupInterval);
    });

    it('should evict when exceeding maxCacheSize', () => {
      const b = new MCPBridge({ enableCallCache: true, maxCacheSize: 5 });
      for (let i = 0; i < 5; i++) {
        b.callCache.set(`k${i}`, { result: i, timestamp: Date.now() });
      }
      b._cleanupCache();
      expect(b.callCache.size).toBeLessThanOrEqual(5);
      clearInterval(b._cacheCleanupInterval);
    });

    it('should set cache result and evict oldest when full', () => {
      const b = new MCPBridge({ enableCallCache: true, maxCacheSize: 2 });
      b._setCachedResult('k1', 'v1');
      b._setCachedResult('k2', 'v2');
      b._setCachedResult('k3', 'v3');
      expect(b.callCache.has('k1')).toBe(false);
      expect(b.callCache.has('k2')).toBe(true);
      expect(b.callCache.has('k3')).toBe(true);
      clearInterval(b._cacheCleanupInterval);
    });
  });

  describe('_isCacheable', () => {
    it('should return true for read-only tools', () => {
      expect(bridge._isCacheable('any', 'read_file')).toBe(true);
      expect(bridge._isCacheable('any', 'list_directory')).toBe(true);
      expect(bridge._isCacheable('any', 'search')).toBe(true);
      expect(bridge._isCacheable('any', 'get_pull_request')).toBe(true);
    });

    it('should return true for filesystem server', () => {
      expect(bridge._isCacheable('filesystem', 'any')).toBe(true);
    });

    it('should return false for non-read-only tools on non-filesystem', () => {
      expect(bridge._isCacheable('test-server', 'write_file')).toBe(false);
    });
  });

  describe('static setMCPClient', () => {
    it('should allow setting custom MCPClient class', () => {
      class CustomClient {}
      MCPBridge.setMCPClient(CustomClient);
      expect(MCPBridge.MCPClient).toBe(CustomClient);
    });

    it('should return default MCPClient when none set', () => {
      MCPBridge.setMCPClient(null);
      const Default = require('../../src/mcp/MCPClient').MCPClient;
      expect(MCPBridge.MCPClient).toBe(Default);
    });
  });

  describe('circuit breaker', () => {
    it('should transition to half-open after timeout', () => {
      jest.useFakeTimers();
      bridge._initCircuitBreaker('test');
      const cb = bridge.circuitBreakers.get('test');
      cb.state = 'open';
      cb.lastFailure = Date.now() - 31000;
      const handler = jest.fn();
      bridge.on('circuit-breaker-half-open', handler);
      bridge._checkCircuitBreaker('test');
      expect(cb.state).toBe('half-open');
      expect(handler).toHaveBeenCalledWith({ server: 'test' });
      jest.useRealTimers();
    });

    it('should throw when circuit breaker is open and not timed out', () => {
      bridge._initCircuitBreaker('test');
      const cb = bridge.circuitBreakers.get('test');
      cb.state = 'open';
      cb.lastFailure = Date.now();
      expect(() => bridge._checkCircuitBreaker('test')).toThrow('Circuit breaker is open');
    });

    it('should reset circuit breaker on success', () => {
      bridge._initCircuitBreaker('test');
      const cb = bridge.circuitBreakers.get('test');
      cb.failures = 3;
      cb.state = 'half-open';
      bridge._resetCircuitBreaker('test');
      expect(cb.failures).toBe(0);
      expect(cb.state).toBe('closed');
    });

    it('should not throw if no circuit breaker for server', () => {
      expect(() => bridge._checkCircuitBreaker('nonexistent')).not.toThrow();
    });
  });

  describe('edge case coverage', () => {
    it('should handle expired cache entry in _getCachedResult', () => {
      jest.useFakeTimers();
      const b = new MCPBridge({ enableCallCache: true, callCacheTTL: 500, maxCacheSize: 100 });
      b.callCache.set('test-key', { result: 'old-value', timestamp: Date.now() - 1000 });
      const result = b._getCachedResult('test-key');
      expect(result).toBeNull();
      expect(b.callCache.has('test-key')).toBe(false);
      jest.useRealTimers();
      clearInterval(b._cacheCleanupInterval);
    });

    it('should evict overflow entries when cache exceeds maxCacheSize in _cleanupCache', () => {
      const b = new MCPBridge({ enableCallCache: true, maxCacheSize: 5 });
      for (let i = 0; i < 10; i++) {
        b.callCache.set(`k${i}`, { result: i, timestamp: Date.now() });
      }
      expect(b.callCache.size).toBe(10);
      b._cleanupCache();
      expect(b.callCache.size).toBe(9);
      expect(b.cacheStats.evictions).toBe(1);
      clearInterval(b._cacheCleanupInterval);
    });

    it('should run cleanup via interval timer', () => {
      jest.useFakeTimers();
      const b = new MCPBridge({ enableCallCache: true, callCacheTTL: 100, maxCacheSize: 100 });
      b.callCache.set('expired', { result: 'x', timestamp: Date.now() - 200 });
      jest.advanceTimersByTime(150);
      expect(b.callCache.has('expired')).toBe(false);
      jest.useRealTimers();
      clearInterval(b._cacheCleanupInterval);
    });

    it('should handle client stop error gracefully in stop()', async () => {
      class FailingStopClient extends MockMCPClient {
        async stop() { throw new Error('Stop failed'); }
      }
      MCPBridge.setMCPClient(FailingStopClient);
      const b = new MCPBridge();
      await b.register(MOCK_CONFIG);
      await expect(b.stop()).resolves.not.toThrow();
      MCPBridge.setMCPClient(MockMCPClient);
    });

    it('should emit shutdown-error when client stop fails', async () => {
      class FailingStopClient extends MockMCPClient {
        async stop() { throw new Error('Shutdown failed'); }
      }
      MCPBridge.setMCPClient(FailingStopClient);
      const b = new MCPBridge();
      await b.register(MOCK_CONFIG);
      const handler = jest.fn();
      b.on('shutdown-error', handler);
      await b.shutdown();
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ server: 'test-server' }));
      MCPBridge.setMCPClient(MockMCPClient);
    });
  });

  describe('100% branch coverage', () => {
    it('should handle _getCachedResult/_setCachedResult when cache disabled and config without args/env', async () => {
      MCPBridge.setMCPClient(MockMCPClient);
      const b = new MCPBridge({ enableCallCache: false });
      await b.register({ name: 'minimal-cfg', command: 'node' });
      const result = await b.call('minimal-cfg:read_file', { path: '/test.txt' });
      expect(result).toBeDefined();
      expect(b.callCache.size).toBe(0);
      await b.stop();
    });

    it('should handle unregister false branch with multiple servers', async () => {
      await bridge.register(MOCK_CONFIG);
      await bridge.register({ name: 'second-server', command: 'node', args: [], env: {} });
      await bridge.unregister('test-server');
      expect(bridge.toolToServer.has('second-server:read_file')).toBe(true);
      expect(bridge.toolToServer.has('test-server:read_file')).toBe(false);
    });

    it('should return null from getCircuitBreakerStatus for unknown server', () => {
      expect(bridge.getCircuitBreakerStatus('nonexistent')).toBeNull();
    });
  });
});
