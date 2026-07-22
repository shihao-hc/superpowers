const fs = require('fs').promises;

const mockBridge = {
  call: jest.fn(),
  register: jest.fn(),
  unregister: jest.fn(),
  shutdown: jest.fn(),
  on: jest.fn(),
  getServerStatus: jest.fn().mockReturnValue({}),
  clients: new Map(),
  getCacheStats: jest.fn(),
  getMetrics: jest.fn(),
  restartServer: jest.fn()
};

const mockRegistry = {
  initialize: jest.fn(),
  refresh: jest.fn(),
  getTools: jest.fn().mockReturnValue([]),
  formatForLLM: jest.fn().mockReturnValue([]),
  formatForPrompt: jest.fn().mockReturnValue(''),
  destroy: jest.fn()
};

const mockNodeManager = {
  registerToEngine: jest.fn(),
  destroy: jest.fn(),
  registeredNodes: { size: 0 }
};

const mockPermissionManager = {
  checkToolAccess: jest.fn().mockReturnValue({ allowed: true }),
  getAuditLog: jest.fn().mockReturnValue([])
};

jest.mock('../../src/mcp/MCPBridge', () => ({ MCPBridge: jest.fn(() => mockBridge) }));
jest.mock('../../src/mcp/MCPToolRegistry', () => ({ MCPToolRegistry: jest.fn(() => mockRegistry) }));
jest.mock('../../src/mcp/MCPNodeManager', () => ({ MCPNodeManager: jest.fn(() => mockNodeManager) }));
jest.mock('../../src/mcp/MCPPermissionManager', () => ({ MCPPermissionManager: jest.fn(() => mockPermissionManager) }));
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      readFile: jest.fn()
    }
  };
});

const { MCPBridge } = require('../../src/mcp/MCPBridge');
const { MCPToolRegistry } = require('../../src/mcp/MCPToolRegistry');
const { MCPNodeManager } = require('../../src/mcp/MCPNodeManager');
const { MCPPermissionManager } = require('../../src/mcp/MCPPermissionManager');
const { MCPPlugin } = require('../../src/mcp/MCPPlugin');

describe('MCPPlugin', () => {
  let plugin;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBridge.register.mockReset();
    mockBridge.call.mockReset();
    mockBridge.clients = new Map();
    mockBridge.getServerStatus.mockReturnValue({});
    mockBridge.getCacheStats.mockReturnValue({});
    mockBridge.getMetrics.mockReturnValue({ totalCalls: 0, successfulCalls: 0 });
    mockRegistry.getTools.mockReturnValue([]);
    mockRegistry.formatForLLM.mockReturnValue([]);
    mockRegistry.formatForPrompt.mockReturnValue('');
    mockNodeManager.registeredNodes = { size: 0 };
    plugin = new MCPPlugin();
  });

  describe('constructor', () => {
    it('sets default config values', () => {
      expect(plugin.id).toBe('mcp-integration');
      expect(plugin.name).toBe('MCP Integration');
      expect(plugin.version).toBe('1.0.0');
      expect(plugin.config.configPath).toMatch(/config[\\/]mcp-servers\.json$/);
      expect(plugin.config.autoRefreshInterval).toBe(60000);
      expect(plugin.config.enableWorkflowIntegration).toBe(true);
      expect(plugin.config.enableAgentIntegration).toBe(true);
      expect(plugin.status).toBe('uninitialized');
    });

    it('accepts custom options', () => {
      const p = new MCPPlugin({ configPath: '/custom/path.json', autoRefreshInterval: 999, enableWorkflowIntegration: false });
      expect(p.config.configPath).toBe('/custom/path.json');
      expect(p.config.autoRefreshInterval).toBe(999);
      expect(p.config.enableWorkflowIntegration).toBe(false);
    });

    it('initializes core components as null', () => {
      expect(plugin.bridge).toBeNull();
      expect(plugin.registry).toBeNull();
      expect(plugin.nodeManager).toBeNull();
      expect(plugin.permissionManager).toBeNull();
    });
  });

  describe('nodeTypes', () => {
    it('returns empty array', () => {
      expect(plugin.nodeTypes).toEqual([]);
    });
  });

  describe('hooks', () => {
    it('returns hooks object with bound methods', () => {
      const hooks = plugin.hooks;
      expect(hooks.onLoad).toBeDefined();
      expect(hooks.onUnload).toBeDefined();
      expect(hooks.onServerStart).toBeDefined();
      expect(hooks.onServerStop).toBeDefined();
      expect(hooks.getBridge()).toBeNull();
      expect(hooks.getRegistry()).toBeNull();
      expect(hooks.getNodeManager()).toBeNull();
    });
  });

  describe('onLoad', () => {
    const validServers = [
      { name: 's1', enabled: true },
      { name: 's2', enabled: true },
      { name: 's3', enabled: false }
    ];

    it('loads config, creates components, registers servers, refreshes tools', async () => {
      fs.readFile.mockResolvedValue(JSON.stringify({ servers: validServers }));
      const result = await plugin.onLoad();
      expect(result).toEqual({ success: true });
      expect(plugin.status).toBe('loaded');
      expect(MCPBridge).toHaveBeenCalled();
      expect(MCPToolRegistry).toHaveBeenCalled();
      expect(MCPNodeManager).toHaveBeenCalled();
      expect(MCPPermissionManager).toHaveBeenCalled();
      expect(mockRegistry.initialize).toHaveBeenCalledWith(mockBridge);
      expect(mockBridge.register).toHaveBeenCalledTimes(2);
      expect(mockRegistry.refresh).toHaveBeenCalled();
    });

    it('merges plugin config with onLoad config', async () => {
      fs.readFile.mockResolvedValue(JSON.stringify({ servers: [] }));
      await plugin.onLoad({ autoRefreshInterval: 9999 });
      expect(MCPToolRegistry).toHaveBeenCalledWith(expect.objectContaining({
        refreshInterval: 9999
      }));
    });

    it('handles ENOENT by returning empty config', async () => {
      const err = new Error('not found');
      err.code = 'ENOENT';
      fs.readFile.mockRejectedValue(err);
      const result = await plugin.onLoad();
      expect(result).toEqual({ success: true });
      expect(mockBridge.register).not.toHaveBeenCalled();
    });

    it('re-throws non-ENOENT read errors', async () => {
      fs.readFile.mockRejectedValue(new Error('permission denied'));
      const result = await plugin.onLoad();
      expect(result.success).toBe(false);
      expect(plugin.status).toBe('error');
    });

    it('continues registering servers when one fails', async () => {
      fs.readFile.mockResolvedValue(JSON.stringify({ servers: [{ name: 's1' }, { name: 's2' }] }));
      mockBridge.register.mockRejectedValueOnce(new Error('connect failed'));
      await plugin.onLoad();
      expect(mockBridge.register).toHaveBeenCalledTimes(2);
    });

    it('handles server registration error gracefully', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation();
      fs.readFile.mockResolvedValue(JSON.stringify({ servers: validServers }));
      mockBridge.register.mockRejectedValue(new Error('fail'));
      await plugin.onLoad();
      expect(plugin.status).toBe('loaded');
      spy.mockRestore();
    });

    it('emits status-change and loaded events', async () => {
      const statusSpy = jest.spyOn(plugin, 'emit');
      fs.readFile.mockResolvedValue(JSON.stringify({ servers: [{ name: 's1' }] }));
      await plugin.onLoad();
      expect(statusSpy).toHaveBeenCalledWith('status-change', { status: 'loading' });
      expect(statusSpy).toHaveBeenCalledWith('status-change', { status: 'loaded' });
      expect(statusSpy).toHaveBeenCalledWith('loaded', expect.any(Object));
    });
  });

  describe('onUnload', () => {
    it('destroys all components on unload', async () => {
      plugin.bridge = mockBridge;
      plugin.registry = mockRegistry;
      plugin.nodeManager = mockNodeManager;
      const result = await plugin.onUnload();
      expect(result).toEqual({ success: true });
      expect(mockNodeManager.destroy).toHaveBeenCalled();
      expect(mockRegistry.destroy).toHaveBeenCalled();
      expect(mockBridge.shutdown).toHaveBeenCalled();
      expect(plugin.status).toBe('unloaded');
    });

    it('handles missing components', async () => {
      const result = await plugin.onUnload();
      expect(result).toEqual({ success: true });
    });

    it('catches errors and returns failure', async () => {
      plugin.bridge = { shutdown: jest.fn().mockRejectedValue(new Error('shutdown failed')) };
      const result = await plugin.onUnload();
      expect(result.success).toBe(false);
      expect(result.error).toBe('shutdown failed');
    });
  });

  describe('onServerStart', () => {
    it('registers server and refreshes', async () => {
      plugin.serverConfig = { servers: [{ name: 's1' }] };
      plugin.bridge = mockBridge;
      plugin.registry = mockRegistry;
      await plugin.onServerStart('s1');
      expect(mockBridge.register).toHaveBeenCalledWith({ name: 's1' });
      expect(mockRegistry.refresh).toHaveBeenCalled();
    });

    it('throws for unknown server', async () => {
      plugin.serverConfig = { servers: [] };
      await expect(plugin.onServerStart('unknown')).rejects.toThrow('not found');
    });
  });

  describe('onServerStop', () => {
    it('unregisters server and refreshes', async () => {
      plugin.bridge = mockBridge;
      plugin.registry = mockRegistry;
      await plugin.onServerStop('s1');
      expect(mockBridge.unregister).toHaveBeenCalledWith('s1');
      expect(mockRegistry.refresh).toHaveBeenCalled();
    });
  });

  describe('registerWorkflowEngine', () => {
    it('registers engine with nodeManager', () => {
      plugin.nodeManager = mockNodeManager;
      const engine = {};
      plugin.registerWorkflowEngine(engine);
      expect(mockNodeManager.registerToEngine).toHaveBeenCalledWith(engine);
    });

    it('throws if nodeManager is null', async () => {
      plugin.nodeManager = null;
      await expect(plugin.registerWorkflowEngine({})).rejects.toThrow('MCP plugin not loaded');
    });

    it('emits workflow-engine-connected when nodes exist', () => {
      const spy = jest.spyOn(plugin, 'emit');
      plugin.nodeManager = mockNodeManager;
      mockNodeManager.registeredNodes = { size: 3 };
      plugin.registerWorkflowEngine({});
      expect(spy).toHaveBeenCalledWith('workflow-engine-connected', { nodeCount: 3 });
    });
  });

  describe('registerAgentLoop', () => {
    it('registers action with agent loop', async () => {
      plugin.registry = mockRegistry;
      const agent = { registerAction: jest.fn() };
      await plugin.registerAgentLoop(agent);
      expect(agent.registerAction).toHaveBeenCalledWith('mcp_call', expect.any(Function));
    });

    it('throws if registry is null', async () => {
      plugin.registry = null;
      await expect(plugin.registerAgentLoop({})).rejects.toThrow('MCP plugin not loaded');
    });

    it('handles agent without registerAction', async () => {
      plugin.registry = mockRegistry;
      await expect(plugin.registerAgentLoop({})).resolves.not.toThrow();
    });

    it('executes executeTool when registered action is called', async () => {
      plugin.registry = mockRegistry;
      plugin.bridge = mockBridge;
      mockBridge.call.mockResolvedValue('called');
      const agent = { registerAction: jest.fn() };
      await plugin.registerAgentLoop(agent);
      const actionCallback = agent.registerAction.mock.calls[0][1];
      const result = await actionCallback({ toolFullName: 'srv:tool', params: { x: 1 } });
      expect(mockBridge.call).toHaveBeenCalledWith('srv:tool', { x: 1 }, expect.objectContaining({ traceId: expect.stringMatching(/^agent_/) }));
      expect(result).toBe('called');
    });
  });

  describe('executeTool', () => {
    it('calls bridge.call with traceId', async () => {
      plugin.bridge = mockBridge;
      mockBridge.call.mockResolvedValue('ok');
      const result = await plugin.executeTool('s/t', { x: 1 }, { traceId: 'abc' });
      expect(mockBridge.call).toHaveBeenCalledWith('s/t', { x: 1 }, { traceId: 'abc' });
      expect(result).toBe('ok');
    });

    it('generates traceId when not provided', async () => {
      plugin.bridge = mockBridge;
      mockBridge.call.mockResolvedValue('ok');
      await plugin.executeTool('s/t', {});
      expect(mockBridge.call).toHaveBeenCalledWith('s/t', {}, expect.objectContaining({ traceId: expect.stringMatching(/^agent_/) }));
    });

    it('throws if bridge is null', async () => {
      await expect(plugin.executeTool('s/t', {})).rejects.toThrow('MCP plugin not loaded');
    });
  });

  describe('_loadConfig', () => {
    it('reads and parses config file', async () => {
      fs.readFile.mockResolvedValue(JSON.stringify({ servers: [{ name: 's1' }] }));
      const config = await plugin._loadConfig('/path');
      expect(config.servers).toHaveLength(1);
    });

    it('returns empty config on ENOENT', async () => {
      const err = new Error('not found');
      err.code = 'ENOENT';
      fs.readFile.mockRejectedValue(err);
      const config = await plugin._loadConfig('/path');
      expect(config).toEqual({ servers: [], global: {} });
    });

    it('re-throws non-ENOENT errors', async () => {
      fs.readFile.mockRejectedValue(new Error('access denied'));
      await expect(plugin._loadConfig('/path')).rejects.toThrow('access denied');
    });
  });

  describe('_processConfig', () => {
    it('resolves env vars in server env', () => {
      process.env.MY_KEY = 'resolved';
      const config = plugin._processConfig({
        servers: [{ name: 's1', env: { KEY: '${MY_KEY}', STATIC: 'hello' } }]
      });
      expect(config.servers[0].env.KEY).toBe('resolved');
      delete process.env.MY_KEY;
    });

    it('keeps unresolvable env vars as-is', () => {
      const config = plugin._processConfig({
        servers: [{ name: 's1', env: { KEY: '${NOT_SET}' } }]
      });
      expect(config.servers[0].env.KEY).toBe('${NOT_SET}');
    });

    it('handles config without servers', () => {
      const config = plugin._processConfig({ global: { key: 'val' } });
      expect(config.global.key).toBe('val');
    });
  });

  describe('_registerServer', () => {
    it('calls bridge.register and emits event', async () => {
      const spy = jest.spyOn(plugin, 'emit');
      plugin.bridge = mockBridge;
      await plugin._registerServer({ name: 's1' });
      expect(mockBridge.register).toHaveBeenCalledWith({ name: 's1' });
      expect(spy).toHaveBeenCalledWith('server-registered', { name: 's1' });
    });

    it('emits error and re-throws on registration failure', async () => {
      const spy = jest.spyOn(plugin, 'emit');
      plugin.bridge = mockBridge;
      mockBridge.register.mockRejectedValue(new Error('fail'));
      await expect(plugin._registerServer({ name: 's1' })).rejects.toThrow('fail');
      expect(spy).toHaveBeenCalledWith('server-registration-error', { name: 's1', error: 'fail' });
    });
  });

  describe('_setupBridgeListeners', () => {
    it('forwards bridge events', () => {
      plugin.bridge = mockBridge;
      plugin._setupBridgeListeners();
      expect(mockBridge.on).toHaveBeenCalledWith('client-error', expect.any(Function));
      expect(mockBridge.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
      expect(mockBridge.on).toHaveBeenCalledWith('reconnected', expect.any(Function));
      expect(mockBridge.on).toHaveBeenCalledWith('circuit-breaker-opened', expect.any(Function));
      expect(mockBridge.on).toHaveBeenCalledWith('circuit-breaker-half-open', expect.any(Function));
    });

    it('emits client-error when bridge emits client-error', () => {
      const spy = jest.spyOn(plugin, 'emit');
      plugin.bridge = mockBridge;
      plugin._setupBridgeListeners();
      const handler = mockBridge.on.mock.calls.find(c => c[0] === 'client-error')[1];
      handler({ server: 's1', error: new Error('fail') });
      expect(spy).toHaveBeenCalledWith('client-error', { server: 's1', error: expect.any(Error) });
    });

    it('emits reconnecting when bridge emits reconnecting', () => {
      const spy = jest.spyOn(plugin, 'emit');
      plugin.bridge = mockBridge;
      plugin._setupBridgeListeners();
      const handler = mockBridge.on.mock.calls.find(c => c[0] === 'reconnecting')[1];
      handler({ server: 's1', attempt: 1, delay: 1000 });
      expect(spy).toHaveBeenCalledWith('reconnecting', { server: 's1', attempt: 1, delay: 1000 });
    });

    it('emits reconnected when bridge emits reconnected', () => {
      const spy = jest.spyOn(plugin, 'emit');
      plugin.bridge = mockBridge;
      plugin._setupBridgeListeners();
      const handler = mockBridge.on.mock.calls.find(c => c[0] === 'reconnected')[1];
      handler({ server: 's1' });
      expect(spy).toHaveBeenCalledWith('reconnected', { server: 's1' });
    });

    it('emits circuit-breaker-opened when bridge emits circuit-breaker-opened', () => {
      const spy = jest.spyOn(plugin, 'emit');
      plugin.bridge = mockBridge;
      plugin._setupBridgeListeners();
      const handler = mockBridge.on.mock.calls.find(c => c[0] === 'circuit-breaker-opened')[1];
      handler({ server: 's1' });
      expect(spy).toHaveBeenCalledWith('circuit-breaker-opened', { server: 's1' });
    });

    it('emits circuit-breaker-half-open when bridge emits circuit-breaker-half-open', () => {
      const spy = jest.spyOn(plugin, 'emit');
      plugin.bridge = mockBridge;
      plugin._setupBridgeListeners();
      const handler = mockBridge.on.mock.calls.find(c => c[0] === 'circuit-breaker-half-open')[1];
      handler({ server: 's1' });
      expect(spy).toHaveBeenCalledWith('circuit-breaker-half-open', { server: 's1' });
    });
  });

  describe('getStatus', () => {
    it('returns status with bridge servers when bridge exists', () => {
      plugin.bridge = mockBridge;
      mockBridge.getServerStatus.mockReturnValue({ s1: 'connected' });
      plugin.registry = mockRegistry;
      mockRegistry.getTools.mockReturnValue([1, 2, 3]);
      plugin.nodeManager = mockNodeManager;
      mockNodeManager.registeredNodes = { size: 5 };

      const status = plugin.getStatus();
      expect(status.status).toBe('uninitialized');
      expect(status.servers).toEqual({ s1: 'connected' });
      expect(status.tools).toBe(3);
      expect(status.nodes).toBe(5);
    });

    it('returns zero counts when components are null', () => {
      const status = plugin.getStatus();
      expect(status.servers).toEqual({});
      expect(status.tools).toBe(0);
      expect(status.nodes).toBe(0);
    });
  });

  describe('getDeepHealthCheck', () => {
    it('returns unhealthy when plugin in error state', async () => {
      plugin.status = 'error';
      const result = await plugin.getDeepHealthCheck();
      expect(result.overall).toBe('unhealthy');
      expect(result.checks.plugin.status).toBe('unhealthy');
    });

    it('returns healthy state with all components', async () => {
      plugin.status = 'loaded';
      plugin.bridge = mockBridge;
      plugin.registry = mockRegistry;
      plugin.nodeManager = mockNodeManager;
      mockRegistry.getTools.mockReturnValue([{ name: 't1' }]);
      mockRegistry._lastRefresh = 1000;
      const mockClient = { connected: true, ready: true, listTools: jest.fn().mockResolvedValue([]) };
      mockBridge.clients.set('s1', mockClient);

      const result = await plugin.getDeepHealthCheck();
      expect(result.overall).toBe('healthy');
      expect(result.checks.plugin.status).toBe('healthy');
      expect(result.checks.registry.status).toBe('healthy');
      expect(result.checks.registry.toolCount).toBe(1);
      expect(result.checks.nodeManager.status).toBe('healthy');
      expect(result.checks.servers.status).toBe('healthy');
    });

    it('shows unknown registry when no registry', async () => {
      plugin.status = 'loaded';
      const result = await plugin.getDeepHealthCheck();
      expect(result.checks.registry.status).toBe('unknown');
    });

    it('reports unhealthy servers', async () => {
      plugin.status = 'loaded';
      plugin.bridge = mockBridge;
      plugin.registry = mockRegistry;
      const mockClient = {
        connected: true,
        ready: true,
        listTools: jest.fn().mockRejectedValue(new Error('timeout'))
      };
      mockBridge.clients.set('s1', mockClient);
      mockBridge.getCacheStats = jest.fn().mockReturnValue({ hits: 10 });
      mockBridge.getMetrics = jest.fn().mockReturnValue({ totalCalls: 5, successfulCalls: 3 });

      const result = await plugin.getDeepHealthCheck();
      expect(result.checks.servers.status).toBe('degraded');
      expect(result.checks.servers.healthy).toBe(0);
      expect(result.checks.servers.unhealthy).toBe(1);
      expect(result.checks.cache).toEqual({ hits: 10 });
      expect(result.checks.metrics.totalCalls).toBe(5);
    });

    it('categorizes disconnected servers as unhealthy', async () => {
      plugin.status = 'loaded';
      plugin.bridge = mockBridge;
      plugin.registry = mockRegistry;
      const mockClient = { connected: false, ready: false, _lastError: 'fail' };
      mockBridge.clients.set('s1', mockClient);

      const result = await plugin.getDeepHealthCheck();
      expect(result.checks.servers.details.s1.status).toBe('unhealthy');
      expect(result.checks.servers.unhealthy).toBe(1);
    });

    it('sets overall to degraded when servers degraded', async () => {
      plugin.status = 'loaded';
      plugin.bridge = mockBridge;
      plugin.registry = mockRegistry;
      const mockClient = { connected: true, ready: true, listTools: jest.fn().mockRejectedValue(new Error('fail')) };
      mockBridge.clients.set('s1', mockClient);

      const result = await plugin.getDeepHealthCheck();
      expect(result.overall).toBe('degraded');
    });
  });

  describe('getAvailableTools', () => {
    it('returns formatted tools from registry', () => {
      plugin.registry = mockRegistry;
      mockRegistry.formatForLLM.mockReturnValue([{ name: 't1' }]);
      expect(plugin.getAvailableTools({})).toEqual([{ name: 't1' }]);
    });

    it('returns empty array when registry is null', () => {
      expect(plugin.getAvailableTools()).toEqual([]);
    });
  });

  describe('getToolsForPrompt', () => {
    it('returns formatted prompt from registry', () => {
      plugin.registry = mockRegistry;
      mockRegistry.formatForPrompt.mockReturnValue('tool list');
      expect(plugin.getToolsForPrompt()).toBe('tool list');
    });

    it('returns default message when registry is null', () => {
      expect(plugin.getToolsForPrompt()).toBe('No MCP tools available.');
    });
  });

  describe('getPermissionManager', () => {
    it('returns permissionManager', () => {
      plugin.permissionManager = 'pm';
      expect(plugin.getPermissionManager()).toBe('pm');
    });
  });

  describe('checkToolPermission', () => {
    it('returns allowed when permissionManager missing', () => {
      const result = plugin.checkToolPermission('t', 'admin');
      expect(result).toEqual({ allowed: true });
    });

    it('delegates to permissionManager', () => {
      plugin.permissionManager = mockPermissionManager;
      plugin.checkToolPermission('t', 'admin');
      expect(mockPermissionManager.checkToolAccess).toHaveBeenCalledWith('t', 'admin');
    });
  });

  describe('getPermissionAuditLog', () => {
    it('returns audit log from permissionManager', () => {
      plugin.permissionManager = mockPermissionManager;
      mockPermissionManager.getAuditLog.mockReturnValue([{ event: 'deny' }]);
      expect(plugin.getPermissionAuditLog({ role: 'user' })).toEqual([{ event: 'deny' }]);
    });

    it('returns empty array when permissionManager missing', () => {
      expect(plugin.getPermissionAuditLog()).toEqual([]);
    });
  });

  describe('addServer', () => {
    it('adds server config, registers, refreshes', async () => {
      plugin.registry = mockRegistry;
      plugin.bridge = mockBridge;
      await plugin.addServer({ name: 's1' });
      expect(plugin.serverConfig.servers).toContainEqual({ name: 's1' });
      expect(mockBridge.register).toHaveBeenCalledWith({ name: 's1' });
      expect(mockRegistry.refresh).toHaveBeenCalled();
    });

    it('initializes serverConfig if null', async () => {
      plugin.registry = mockRegistry;
      plugin.bridge = mockBridge;
      await plugin.addServer({ name: 's1' });
      expect(plugin.serverConfig).toEqual({ servers: [{ name: 's1' }], global: {} });
    });
  });

  describe('removeServer', () => {
    it('unregisters, removes from config, refreshes', async () => {
      plugin.serverConfig = { servers: [{ name: 's1' }, { name: 's2' }] };
      plugin.bridge = mockBridge;
      plugin.registry = mockRegistry;
      await plugin.removeServer('s1');
      expect(mockBridge.unregister).toHaveBeenCalledWith('s1');
      expect(plugin.serverConfig.servers).toHaveLength(1);
      expect(plugin.serverConfig.servers[0].name).toBe('s2');
      expect(mockRegistry.refresh).toHaveBeenCalled();
    });
  });

  describe('restartServer', () => {
    it('restarts server via bridge', async () => {
      plugin.bridge = mockBridge;
      plugin.registry = mockRegistry;
      await plugin.restartServer('s1');
      expect(mockBridge.restartServer).toHaveBeenCalledWith('s1');
      expect(mockRegistry.refresh).toHaveBeenCalled();
    });
  });

  describe('emit', () => {
    it('calls super.emit', () => {
      const spy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(plugin)), 'emit').mockImplementation();
      plugin.emit('test', {});
      expect(spy).toHaveBeenCalledWith('test', {});
      spy.mockRestore();
    });
  });
});