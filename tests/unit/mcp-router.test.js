jest.mock('../../src/mcp/metrics', () => ({
  logMCPCall: jest.fn(),
  getMCPAuditStats: jest.fn(() => ({ total: 0, byRole: {}, avgDuration: 0 })),
  logMCPAuditStats: jest.fn(() => ({})),
  getMCPAuditEntries: jest.fn(() => []),
  getMCPAuditLogger: jest.fn(() => ({
    export: jest.fn((fmt) => fmt === 'csv' ? 'csv,data' : '{}'),
    clear: jest.fn(() => ({ success: true })),
  })),
}));

jest.mock('../../src/mcp/engines/ToolAnnotations', () => ({
  ANNOTATIONS: {
    'filesystem:read_file': { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    'filesystem:write_file': { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
  getAnnotation: jest.fn((tool) => {
    const map = { 'filesystem:read_file': { readOnlyHint: true } };
    return map[tool] || null;
  }),
  getRiskLevel: jest.fn((tool) => {
    const map = { 'filesystem:read_file': 'safe', 'filesystem:write_file': 'medium' };
    return map[tool] || 'low';
  }),
}));

const mockHistory = [];
jest.mock('../../src/mcp/engines/DryRunEngine', () => {
  const DryRunEngineMock = jest.fn().mockImplementation(() => ({
    previewWrite: jest.fn((p, c) => ({ _meta: { tool: 'write_file' }, path: p, contentLength: c.length })),
    previewEdit: jest.fn((p, edits, _cc) => ({ _meta: { tool: 'edit_file' }, path: p, edits })),
    previewDelete: jest.fn((p) => ({ _meta: { tool: 'delete_file' }, path: p })),
    previewMove: jest.fn((s, d) => ({ _meta: { tool: 'move_file' }, source: s, dest: d })),
    previewMkdir: jest.fn((p) => ({ _meta: { tool: 'create_directory' }, path: p })),
    previewGeneric: jest.fn((t, p) => ({ _meta: { tool: t }, params: p })),
  }));
  return {
    DryRunEngine: DryRunEngineMock,
    dryRunEngine: { getHistory: jest.fn(() => mockHistory) },
  };
});

jest.mock('../../src/mcp/engines/ThinkingChain', () => {
  const chain = { id: 'chain-1', thoughts: [] };
  return {
    thinkingChain: {
      createChain: jest.fn((thought, meta) => ({ id: 'chain-1', initialThought: thought, metadata: meta })),
      getAllChains: jest.fn(() => [chain]),
      getChain: jest.fn((id) => id === 'chain-1' ? chain : null),
      addThought: jest.fn((chainId, thought, opts) => ({ id: chainId, thoughts: [...chain.thoughts, { thought, ...opts }] })),
      createBranch: jest.fn((chainId, from, label) => ({ chainId, branchFrom: from, label })),
      addReflection: jest.fn((chainId, stepId, criticism) => ({ id: chainId, stepId, criticism })),
      backtrack: jest.fn((chainId, toStep) => ({ id: chainId, backtrackedTo: toStep })),
    },
  };
});

jest.mock('../../src/mcp/engines/RootsManager', () => ({
  rootsManager: {
    getRoots: jest.fn(() => ['/workspace', '/data']),
    addRoot: jest.fn((_p, _perms) => ['/workspace', '/data', _p]),
    removeRoot: jest.fn((_p) => ['/workspace']),
    createTemporaryRoot: jest.fn((prefix) => ({ id: 'sandbox-1', path: `/tmp/${prefix}_abc` })),
    removeTemporaryRoot: jest.fn((id) => id === 'sandbox-1'),
    validatePath: jest.fn((p) => ({ valid: !p.includes('..'), path: p })),
  },
}));

jest.mock('../../src/mcp/MCPAlertManager', () => {
  const alertManager = {
    registerAlertChannel: jest.fn(),
    exportConfig: jest.fn(() => ({ rules: [] })),
    getStats: jest.fn(() => ({ totalAlerts: 0 })),
    getAlertHistory: jest.fn((_opts) => []),
  };
  return { getMCPAlertManager: jest.fn(() => alertManager) };
});

const request = require('supertest');
const express = require('express');

let ipCounter = 0;

function auth() {
  return { Authorization: 'Bearer valid-token' };
}

function api(method, url) {
  return request(app)[method](url).set('X-Forwarded-For', `10.0.0.${ipCounter++}`);
}

const metrics = require('../../src/mcp/metrics');
const _TA = require('../../src/mcp/engines/ToolAnnotations');
const { dryRunEngine } = require('../../src/mcp/engines/DryRunEngine');
const { thinkingChain } = require('../../src/mcp/engines/ThinkingChain');
const { rootsManager } = require('../../src/mcp/engines/RootsManager');
const { getMCPAlertManager } = require('../../src/mcp/MCPAlertManager');

let app;
let mockAuth;
let mockPlugin;

function createApp() {
  const a = express();
  a.set('trust proxy', true);
  a.use(express.json());
  a.use(router);
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHistory.length = 0;
  dryRunEngine.getHistory.mockImplementation(() => mockHistory);

  mockAuth = jest.fn();
  mockAuth.mockReturnValue({ valid: true, username: 'testuser', role: 'admin' });

  mockPlugin = {
    getStatus: jest.fn(() => ({ status: 'loaded', servers: { 'fs-server': { connected: true, ready: true } }, tools: 5 })),
    getDeepHealthCheck: jest.fn(() => Promise.resolve({ overall: 'healthy', servers: {} })),
    bridge: {
      clients: new Map(),
      getRegisteredServers: jest.fn(() => ['fs-server', 'gh-server']),
      getServerStatus: jest.fn((name) => name === 'fs-server' ? { connected: true, ready: true } : null),
      batchCall: jest.fn((calls, _opts) => calls.map(() => ({ result: 'ok' }))),
      getMetrics: jest.fn(() => ({
        totalCalls: 100, successfulCalls: 90, failedCalls: 10,
        callsByServer: {}, callsByTool: {}, callsByRole: {},
      })),
    },
    getAvailableTools: jest.fn((opts) => {
      if (opts && opts.serverName) return opts.serverName === 'fs-server' ? [{ name: 'read_file' }] : [];
      return [{ name: 'read_file' }, { name: 'write_file' }];
    }),
    getToolsForPrompt: jest.fn(() => 'Tool: read_file\nTool: write_file'),
    restartServer: jest.fn(),
    addServer: jest.fn(),
    removeServer: jest.fn(),
    registry: { refresh: jest.fn() },
    executeTool: jest.fn((_tool, _params, _opts) => ({ output: 'done' })),
    permissionManager: {
      checkToolAccess: jest.fn(() => ({ allowed: true })),
      setToolPermission: jest.fn(),
      exportConfig: jest.fn(() => ({ roles: {} })),
      addCustomRole: jest.fn((name, config) => ({ role: { name, ...config } })),
    },
  };

  setAuthMiddleware(mockAuth);
  setMCPPlugin(mockPlugin);
  setPermissionManager(mockPlugin.permissionManager);
  app = createApp();
});

let router, setMCPPlugin, setAuthMiddleware, setPermissionManager, MCPPermissionManager, cleanupRouter;
beforeAll(() => {
  const mod = require('../../src/mcp/router');
  router = mod.router;
  setMCPPlugin = mod.setMCPPlugin;
  setAuthMiddleware = mod.setAuthMiddleware;
  setPermissionManager = mod.setPermissionManager;
  MCPPermissionManager = mod.MCPPermissionManager;
  cleanupRouter = mod._cleanup;
});

afterAll(() => {
  jest.restoreAllMocks();
  if (cleanupRouter) cleanupRouter();
});

describe('MCP Router', () => {
  describe('exports', () => {
    it('should export setMCPPlugin and setAuthMiddleware', () => {
      expect(setMCPPlugin).toBeDefined();
      expect(setAuthMiddleware).toBeDefined();
    });

    it('should export MCPPermissionManager', () => {
      expect(MCPPermissionManager).toBeDefined();
    });
  });

  describe('Authentication', () => {
    it('returns 401 without auth header on POST', async () => {
      const res = await api('post', '/call').send({ toolFullName: 'fs:read' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    it('returns 401 with invalid auth header', async () => {
      mockAuth.mockReturnValue({ valid: false, error: 'Invalid token' });
      const res = await api('get', '/permissions').set('Authorization', 'Bearer bad-token');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });

    it('returns 401 with generic error when auth result lacks error message', async () => {
      mockAuth.mockReturnValue({ valid: false });
      const res = await api('get', '/permissions').set('Authorization', 'Bearer bad-token');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });

    it('returns 500 when authMiddleware is not configured', async () => {
      setAuthMiddleware(null);
      const res = await api('post', '/call').set(auth()).send({ toolFullName: 'fs:read' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Authentication not configured');
    });

    it('allows public GET paths without auth', async () => {
      const res = await request(app).get('/status');
      expect(res.status).toBe(200);
    });

    it('requires auth for non-public GET paths', async () => {
      const res = await request(app).get('/permissions');
      expect(res.status).toBe(401);
    });

    it('allows public GET with sub-path matching', async () => {
      dryRunEngine.getHistory.mockReturnValue([{ id: 'some-id' }]);
      const res = await request(app).get('/dryrun/diff/some-id');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /status', () => {
    it('returns status when plugin loaded', async () => {
      const res = await request(app).get('/status');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('loaded');
    });

    it('returns 503 when plugin not loaded', async () => {
      setMCPPlugin(null);
      const res = await request(app).get('/status');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('MCP plugin not loaded');
    });
  });

  describe('GET /health', () => {
    it('returns healthy status without deep query', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });

    it('returns deep health check when deep=true', async () => {
      const res = await request(app).get('/health?deep=true');
      expect(res.status).toBe(200);
      expect(res.body.overall).toBe('healthy');
      expect(mockPlugin.getDeepHealthCheck).toHaveBeenCalled();
    });

    it('returns degraded deep health status with 200', async () => {
      mockPlugin.getDeepHealthCheck.mockResolvedValue({ overall: 'degraded', servers: {} });
      const res = await request(app).get('/health?deep=true');
      expect(res.status).toBe(200);
      expect(res.body.overall).toBe('degraded');
    });

    it('returns 503 for unhealthy deep health', async () => {
      mockPlugin.getDeepHealthCheck.mockResolvedValue({ overall: 'unhealthy', servers: {} });
      const res = await request(app).get('/health?deep=true');
      expect(res.status).toBe(503);
    });

    it('returns 503 when plugin not loaded', async () => {
      setMCPPlugin(null);
      const res = await request(app).get('/health');
      expect(res.status).toBe(503);
    });

    it('reports unhealthy status and zero servers when getStatus lacks fields', async () => {
      mockPlugin.getStatus.mockReturnValue({ status: 'not-loaded' });
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('unhealthy');
      expect(res.body.servers).toBe(0);
    });
  });

  describe('GET /health/:serverName', () => {
    beforeEach(() => {
      mockPlugin.bridge.clients.set('fs-server', {
        connected: true, ready: true, tools: [{ name: 'read' }],
        listTools: jest.fn().mockResolvedValue({ tools: [] }),
      });
    });

    it('returns healthy for connected server', async () => {
      const res = await request(app).get('/health/fs-server');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });

    it('returns 404 for unknown server', async () => {
      const res = await request(app).get('/health/unknown-server');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('returns 503 for server with error', async () => {
      mockPlugin.bridge.clients.set('bad-server', {
        connected: false, ready: false, tools: [],
        listTools: jest.fn().mockRejectedValue(new Error('Timeout')),
      });
      const res = await request(app).get('/health/bad-server');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('unhealthy');
    });

    it('returns 503 when plugin not loaded', async () => {
      setMCPPlugin(null);
      const res = await request(app).get('/health/fs-server');
      expect(res.status).toBe(503);
    });

    it('reports toolsCount 0 when client has no tools field', async () => {
      mockPlugin.bridge.clients.set('toolsless-server', {
        connected: true, ready: true,
        listTools: jest.fn().mockResolvedValue({ tools: [] }),
      });
      const res = await request(app).get('/health/toolsless-server');
      expect(res.status).toBe(200);
      expect(res.body.toolsCount).toBe(0);
    });

    it('returns 503 when health check times out', async () => {
      mockPlugin.bridge.clients.set('slow-server', {
        connected: false, ready: false, tools: [],
        listTools: jest.fn(() => new Promise(() => {})),
      });
      const res = await request(app).get('/health/slow-server');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('unhealthy');
      expect(res.body.error).toBe('Timeout');
    }, 15000);
  });

  describe('GET /tools', () => {
    it('returns tools list', async () => {
      const res = await request(app).get('/tools');
      expect(res.status).toBe(200);
      expect(res.body.tools).toHaveLength(2);
    });

    it('filters by server name', async () => {
      await request(app).get('/tools?server=fs-server');
      expect(mockPlugin.getAvailableTools).toHaveBeenCalledWith(expect.objectContaining({ serverName: 'fs-server' }));
    });

    it('rejects invalid server name', async () => {
      await request(app).get('/tools?server=invalid!name');
      expect(mockPlugin.getAvailableTools).toHaveBeenCalledWith(expect.not.objectContaining({ serverName: expect.anything() }));
    });

    it('filters by tags', async () => {
      await request(app).get('/tools?tags=file,system');
      expect(mockPlugin.getAvailableTools).toHaveBeenCalledWith(expect.objectContaining({ tags: ['file', 'system'] }));
    });

    it('ignores invalid tags', async () => {
      await request(app).get('/tools?tags=valid,invalid!tag');
      expect(mockPlugin.getAvailableTools).toHaveBeenCalledWith(expect.objectContaining({ tags: ['valid'] }));
    });

    it('filters by short search term', async () => {
      await request(app).get('/tools?search=read');
      expect(mockPlugin.getAvailableTools).toHaveBeenCalledWith(expect.objectContaining({ search: 'read' }));
    });

    it('ignores too long search term', async () => {
      await request(app).get('/tools?search=' + 'x'.repeat(101));
      expect(mockPlugin.getAvailableTools).toHaveBeenCalledWith(expect.not.objectContaining({ search: expect.anything() }));
    });

    it('returns 503 when plugin not loaded', async () => {
      setMCPPlugin(null);
      const res = await request(app).get('/tools');
      expect(res.status).toBe(503);
    });
  });

  describe('GET /tools/prompt', () => {
    it('returns text/plain prompt', async () => {
      const res = await request(app).get('/tools/prompt');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Tool:');
      expect(res.headers['content-type']).toContain('text/plain');
    });

    it('returns 503 when plugin not loaded', async () => {
      setMCPPlugin(null);
      const res = await request(app).get('/tools/prompt');
      expect(res.status).toBe(503);
    });
  });

  describe('GET /servers', () => {
    it('returns servers list', async () => {
      const res = await request(app).get('/servers');
      expect(res.status).toBe(200);
      expect(res.body.servers).toHaveLength(2);
    });

    it('returns 503 when plugin not loaded', async () => {
      setMCPPlugin(null);
      const res = await request(app).get('/servers');
      expect(res.status).toBe(503);
    });

    it('returns empty servers when bridge and status servers are missing', async () => {
      delete mockPlugin.bridge;
      mockPlugin.getStatus.mockReturnValue({ status: 'loaded' });
      const res = await request(app).get('/servers');
      expect(res.status).toBe(200);
      expect(res.body.servers).toEqual([]);
    });
  });

  describe('GET /servers/:name', () => {
    it('returns server details', async () => {
      const res = await request(app).get('/servers/fs-server');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('fs-server');
    });

    it('returns 400 for invalid server name', async () => {
      const res = await request(app).get('/servers/invalid!');
      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown server', async () => {
      const res = await request(app).get('/servers/unknown');
      expect(res.status).toBe(404);
    });

    it('returns 503 when plugin not loaded', async () => {
      setMCPPlugin(null);
      const res = await request(app).get('/servers/fs-server');
      expect(res.status).toBe(503);
    });
  });

  describe('POST /servers/:name/restart', () => {
    it('restarts server successfully', async () => {
      const res = await api('post', '/servers/fs-server/restart').set(auth());
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 for invalid name', async () => {
      const res = await api('post', '/servers/bad!/restart').set(auth());
      expect(res.status).toBe(400);
    });

    it('handles restart error', async () => {
      mockPlugin.restartServer.mockRejectedValue(new Error('fail'));
      const res = await api('post', '/servers/fs-server/restart').set(auth());
      expect(res.status).toBe(500);
    });

    it('returns 503 when plugin not loaded', async () => {
      setMCPPlugin(null);
      const res = await api('post', '/servers/fs-server/restart').set(auth());
      expect(res.status).toBe(503);
    });
  });

  describe('POST /servers (add)', () => {
    it('adds server with valid config', async () => {
      const res = await api('post', '/servers').set(auth()).send({
        name: 'new-server', command: 'node', args: ['server.js'],
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockPlugin.addServer).toHaveBeenCalledWith(expect.objectContaining({ name: 'new-server' }));
    });

    it('returns 400 for invalid config', async () => {
      const res = await api('post', '/servers').set(auth()).send({ name: '', command: '' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid server configuration');
    });

    it('returns 400 when command is not a string', async () => {
      const res = await api('post', '/servers').set(auth()).send({ name: 'ns', command: 123, args: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid server configuration');
    });

    it('returns 400 when args is not an array', async () => {
      const res = await api('post', '/servers').set(auth()).send({ name: 'ns', command: 'node', args: 'not-array' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid server configuration');
    });

    it('handles add error', async () => {
      mockPlugin.addServer.mockRejectedValue(new Error('fail'));
      const res = await api('post', '/servers').set(auth()).send({ name: 'ns', command: 'node', args: [] });
      expect(res.status).toBe(500);
    });

    it('returns 503 when plugin not loaded', async () => {
      setMCPPlugin(null);
      const res = await api('post', '/servers').set(auth()).send({ name: 'x', command: 'y', args: [] });
      expect(res.status).toBe(503);
    });
  });

  describe('DELETE /servers/:name', () => {
    it('removes server', async () => {
      const res = await api('delete', '/servers/fs-server').set(auth());
      expect(res.status).toBe(200);
      expect(mockPlugin.removeServer).toHaveBeenCalledWith('fs-server');
    });

    it('returns 400 for invalid name', async () => {
      const res = await api('delete', '/servers/bad!').set(auth());
      expect(res.status).toBe(400);
    });

    it('handles remove error', async () => {
      mockPlugin.removeServer.mockRejectedValue(new Error('fail'));
      const res = await api('delete', '/servers/fs-server').set(auth());
      expect(res.status).toBe(500);
    });

    it('returns 503 when plugin not loaded', async () => {
      setMCPPlugin(null);
      const res = await api('delete', '/servers/fs-server').set(auth());
      expect(res.status).toBe(503);
    });
  });

  describe('POST /tools/refresh', () => {
    it('refreshes tool registry', async () => {
      const res = await api('post', '/tools/refresh').set(auth());
      expect(res.status).toBe(200);
      expect(mockPlugin.registry.refresh).toHaveBeenCalled();
    });

    it('returns 503 when registry not available', async () => {
      delete mockPlugin.registry;
      const res = await api('post', '/tools/refresh').set(auth());
      expect(res.status).toBe(503);
    });

    it('handles refresh error', async () => {
      mockPlugin.registry.refresh.mockRejectedValue(new Error('fail'));
      const res = await api('post', '/tools/refresh').set(auth());
      expect(res.status).toBe(500);
    });

    it('returns 503 when plugin not loaded', async () => {
      setMCPPlugin(null);
      const res = await api('post', '/tools/refresh').set(auth());
      expect(res.status).toBe(503);
    });
  });

  describe('POST /call', () => {
    it('executes tool successfully', async () => {
      const res = await api('post', '/call').set(auth()).send({
        toolFullName: 'filesystem:read_file', params: { path: '/etc/hosts' },
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.result).toEqual({ output: 'done' });
    });

    it('returns 400 for invalid tool name', async () => {
      const res = await api('post', '/call').set(auth()).send({ toolFullName: 'invalid', params: {} });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid tool name format');
    });

    it('returns 400 for non-object params', async () => {
      const res = await api('post', '/call').set(auth()).send({
        toolFullName: 'filesystem:read_file', params: 'not-an-object',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Params must be an object');
    });

    it('returns 403 when permission denied', async () => {
      mockPlugin.permissionManager.checkToolAccess.mockReturnValue({ allowed: false, reason: 'restricted' });
      const res = await api('post', '/call').set(auth()).send({
        toolFullName: 'filesystem:write_file', params: {},
      });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Tool access denied');
    });

    it('handles execution error', async () => {
      mockPlugin.executeTool.mockRejectedValue(new Error('execution failed'));
      const res = await api('post', '/call').set(auth()).send({
        toolFullName: 'filesystem:read_file', params: {},
      });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });

    it('returns 503 when plugin not loaded', async () => {
      setMCPPlugin(null);
      const res = await api('post', '/call').set(auth()).send({ toolFullName: 'fs:read' });
      expect(res.status).toBe(503);
    });

    it('returns 429 when rate limited', async () => {
      const sameIp = '10.0.0.999';
      for (let i = 0; i < 61; i++) {
        await request(app)
          .post('/call')
          .set('Authorization', 'Bearer valid-token')
          .set('X-Forwarded-For', sameIp)
          .send({ toolFullName: 'filesystem:read_file', params: {} });
      }
      const res = await request(app)
        .post('/call')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Forwarded-For', sameIp)
        .send({ toolFullName: 'filesystem:read_file', params: {} });
      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too many requests');
    });

    it('returns 400 for non-string tool name', async () => {
      const res = await api('post', '/call').set(auth()).send({ toolFullName: 123, params: {} });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid tool name format');
    });

    it('executes tool with missing params and user info', async () => {
      mockAuth.mockReturnValue({ valid: true });
      const res = await api('post', '/call').set(auth()).send({ toolFullName: 'filesystem:read_file' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockPlugin.executeTool).toHaveBeenCalledWith('filesystem:read_file', {}, expect.any(Object));
    });

    it('uses viewer/anonymous fallbacks in denied log when user info missing', async () => {
      mockAuth.mockReturnValue({ valid: true });
      mockPlugin.permissionManager.checkToolAccess.mockReturnValue({ allowed: false, reason: 'restricted' });
      const res = await api('post', '/call').set(auth()).send({ toolFullName: 'filesystem:write_file' });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Tool access denied');
      expect(metrics.logMCPCall).toHaveBeenCalledWith(expect.objectContaining({
        params: {}, username: 'anonymous', role: 'viewer',
      }));
    });

    it('allows tool call when permission manager is not configured', async () => {
      setPermissionManager(null);
      const res = await api('post', '/call').set(auth()).send({ toolFullName: 'filesystem:read_file' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /batch-call', () => {
    it('executes batch calls successfully', async () => {
      const res = await api('post', '/batch-call').set(auth()).send({
        calls: [
          { toolFullName: 'filesystem:read_file', params: {} },
          { toolFullName: 'filesystem:write_file', params: {} },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.results).toHaveLength(2);
    });

    it('returns 400 without calls array', async () => {
      const res = await api('post', '/batch-call').set(auth()).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('calls array is required');
    });

    it('returns 400 for empty calls array', async () => {
      const res = await api('post', '/batch-call').set(auth()).send({ calls: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No valid calls provided');
    });

    it('returns 400 for calls with invalid tool names', async () => {
      const res = await api('post', '/batch-call').set(auth()).send({
        calls: [{ toolFullName: 'invalid' }],
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for more than 100 calls', async () => {
      const calls = Array.from({ length: 101 }, (_, i) => ({ toolFullName: `fs:tool${i}`, params: {} }));
      const res = await api('post', '/batch-call').set(auth()).send({ calls });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Maximum 100 calls per batch');
    });

    it('filters out invalid call objects', async () => {
      mockPlugin.bridge.batchCall.mockImplementation((calls) => calls.map(() => ({ result: 'ok' })));
      const res = await api('post', '/batch-call').set(auth()).send({
        calls: [
          { toolFullName: 'filesystem:read_file', params: {} },
          null,
          { toolFullName: 'invalid' },
          { toolFullName: 'filesystem:write_file', params: {} },
        ],
      });
      expect(res.status).toBe(200);
      const callsArg = mockPlugin.bridge.batchCall.mock.calls[0][0];
      expect(callsArg).toHaveLength(2);
    });

    it('returns 403 when a call is unauthorized', async () => {
      mockPlugin.permissionManager.checkToolAccess
        .mockReturnValueOnce({ allowed: true })
        .mockReturnValueOnce({ allowed: false, reason: 'restricted' });
      const res = await api('post', '/batch-call').set(auth()).send({
        calls: [
          { toolFullName: 'filesystem:read_file', params: {} },
          { toolFullName: 'filesystem:write_file', params: {} },
        ],
      });
      expect(res.status).toBe(403);
    });

    it('handles batch execution error', async () => {
      mockPlugin.bridge.batchCall.mockRejectedValue(new Error('batch failed'));
      const res = await api('post', '/batch-call').set(auth()).send({
        calls: [{ toolFullName: 'filesystem:read_file', params: {} }],
      });
      expect(res.status).toBe(500);
    });

    it('returns 503 when bridge not available', async () => {
      delete mockPlugin.bridge;
      const res = await api('post', '/batch-call').set(auth()).send({
        calls: [{ toolFullName: 'filesystem:read_file', params: {} }],
      });
      expect(res.status).toBe(503);
    });

    it('returns 503 when plugin not loaded', async () => {
      setMCPPlugin(null);
      const res = await api('post', '/batch-call').set(auth()).send({
        calls: [{ toolFullName: 'fs:read', params: {} }],
      });
      expect(res.status).toBe(503);
    });

    it('executes batch calls without per-call params', async () => {
      const res = await api('post', '/batch-call').set(auth()).send({
        calls: [{ toolFullName: 'filesystem:read_file' }],
      });
      expect(res.status).toBe(200);
      const callsArg = mockPlugin.bridge.batchCall.mock.calls[0][0];
      expect(callsArg).toEqual([{ toolFullName: 'filesystem:read_file', params: {} }]);
    });

    it('uses viewer/anonymous fallbacks when batch denied and user info missing', async () => {
      mockAuth.mockReturnValue({ valid: true });
      mockPlugin.permissionManager.checkToolAccess.mockReturnValue({ allowed: false, reason: 'restricted' });
      const res = await api('post', '/batch-call').set(auth()).send({
        calls: [{ toolFullName: 'filesystem:write_file' }],
      });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Batch call contains unauthorized tool');
    });

    it('allows batch call when permission manager is not configured', async () => {
      setPermissionManager(null);
      const res = await api('post', '/batch-call').set(auth()).send({
        calls: [{ toolFullName: 'filesystem:read_file', params: {} }],
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('uses viewer/anonymous fallbacks when batch user info missing', async () => {
      mockAuth.mockReturnValue({ valid: true });
      const res = await api('post', '/batch-call').set(auth()).send({
        calls: [{ toolFullName: 'filesystem:read_file', params: {} }],
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /metrics', () => {
    it('returns metrics', async () => {
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.body.totalCalls).toBe(100);
      expect(res.body.successRate).toBe('90.00%');
    });

    it('returns N/A for success rate when no calls', async () => {
      mockPlugin.bridge.getMetrics.mockReturnValue({
        totalCalls: 0, successfulCalls: 0, failedCalls: 0,
        callsByServer: {}, callsByTool: {}, callsByRole: {},
      });
      const res = await request(app).get('/metrics');
      expect(res.body.successRate).toBe('N/A');
    });

    it('returns 503 when bridge not available', async () => {
      delete mockPlugin.bridge;
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(503);
    });

    it('returns 503 when plugin not loaded', async () => {
      setMCPPlugin(null);
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(503);
    });
  });

  describe('GET /audit/stats', () => {
    it('returns audit stats', async () => {
      const res = await api('get', '/audit/stats').set(auth());
      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
    });

    it('passes since query param', async () => {
      await api('get', '/audit/stats?since=3600000').set(auth());
      expect(metrics.logMCPAuditStats).toHaveBeenCalledWith(expect.objectContaining({ since: '3600000' }));
    });
  });

  describe('GET /audit/logs', () => {
    it('returns audit logs', async () => {
      const res = await api('get', '/audit/logs').set(auth());
      expect(res.status).toBe(200);
      expect(res.body.logs).toEqual([]);
    });

    it('filters by query params', async () => {
      await api('get', '/audit/logs?tool=fs:read&server=fs&role=admin&username=user&success=true&limit=10').set(auth());
      expect(metrics.getMCPAuditEntries).toHaveBeenCalledWith(expect.objectContaining({
        toolFullName: 'fs:read', server: 'fs', role: 'admin', username: 'user', success: true, limit: 10,
      }));
    });

    it('parses success as string comparison', async () => {
      await api('get', '/audit/logs?success=false').set(auth());
      expect(metrics.getMCPAuditEntries).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });

  describe('GET /audit/export', () => {
    it('exports JSON by default', async () => {
      const res = await api('get', '/audit/export').set(auth());
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
    });

    it('exports CSV when format=csv', async () => {
      const res = await api('get', '/audit/export?format=csv').set(auth());
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
    });
  });

  describe('DELETE /audit/logs', () => {
    it('clears audit logs', async () => {
      const res = await api('delete', '/audit/logs').set(auth());
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /permissions', () => {
    it('sets permissions', async () => {
      const res = await api('post', '/permissions').set(auth()).send({
        permissions: { 'filesystem:read_file': { read: true, write: false } },
      });
      expect(res.status).toBe(200);
      expect(mockPlugin.permissionManager.setToolPermission).toHaveBeenCalled();
    });

    it('rejects non-admin user (requireAdmin gate)', async () => {
      mockAuth.mockReturnValue({ valid: true, username: 'viewer1', role: 'viewer' });
      const res = await api('post', '/permissions').set(auth()).send({
        permissions: { 'filesystem:read_file': { read: true } },
      });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Admin role required');
    });

    it('sets admin permission for admin role entry', async () => {
      await api('post', '/permissions').set(auth()).send({
        permissions: { 'filesystem:admin_tool': { admin: 'admin' } },
      });
      expect(mockPlugin.permissionManager.setToolPermission).toHaveBeenCalledWith('filesystem:admin_tool', 'admin');
    });

    it('sets admin permission for operator role entry', async () => {
      await api('post', '/permissions').set(auth()).send({
        permissions: { 'filesystem:op_tool': { operator: 'admin' } },
      });
      expect(mockPlugin.permissionManager.setToolPermission).toHaveBeenCalledWith('filesystem:op_tool', 'admin');
    });

    it('returns 400 for invalid permissions object', async () => {
      const res = await api('post', '/permissions').set(auth()).send({ permissions: 'invalid' });
      expect(res.status).toBe(400);
    });

    it('handles error', async () => {
      mockPlugin.permissionManager.setToolPermission.mockImplementation(() => { throw new Error('fail'); });
      const res = await api('post', '/permissions').set(auth()).send({
        permissions: { 'filesystem:read_file': { read: true } },
      });
      expect(res.status).toBe(500);
    });

    it('returns 503 when permission manager not available', async () => {
      delete mockPlugin.permissionManager;
      const res = await api('post', '/permissions').set(auth()).send({
        permissions: { 'filesystem:read_file': { read: true } },
      });
      expect(res.status).toBe(503);
    });
  });

  describe('GET /permissions', () => {
    it('returns permission config', async () => {
      const res = await api('get', '/permissions').set(auth());
      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
    });

    it('returns 503 when permission manager not available', async () => {
      delete mockPlugin.permissionManager;
      const res = await api('get', '/permissions').set(auth());
      expect(res.status).toBe(503);
    });
  });

  describe('GET /annotations', () => {
    it('returns all annotations', async () => {
      const res = await request(app).get('/annotations');
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
    });

    it('returns annotation for specific tool', async () => {
      const res = await request(app).get('/annotations?tool=filesystem:read_file');
      expect(res.status).toBe(200);
      expect(res.body.tool).toBe('filesystem:read_file');
    });
  });

  describe('GET /annotations/summary', () => {
    it('returns annotation summary', async () => {
      const res = await request(app).get('/annotations/summary');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
    });
  });

  describe('GET /annotations/risk-level', () => {
    it('returns risk levels for tools', async () => {
      const res = await request(app).get('/annotations/risk-level?tools=filesystem:read_file,filesystem:write_file');
      expect(res.status).toBe(200);
      expect(res.body.riskLevels).toHaveLength(2);
    });

    it('returns 400 without tools param', async () => {
      const res = await request(app).get('/annotations/risk-level');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /dryrun/preview', () => {
    it('previews write_file', async () => {
      const res = await api('post', '/dryrun/preview').set(auth()).send({
        tool: 'write_file', params: { path: '/tmp/test', content: 'hello' },
      });
      expect(res.status).toBe(200);
      expect(res.body._meta.tool).toBe('write_file');
    });

    it('previews edit_file', async () => {
      const res = await api('post', '/dryrun/preview').set(auth()).send({
        tool: 'edit_file', params: { path: '/tmp/test', edits: [], currentContent: 'old' },
      });
      expect(res.status).toBe(200);
      expect(res.body._meta.tool).toBe('edit_file');
    });

    it('previews delete_file', async () => {
      const res = await api('post', '/dryrun/preview').set(auth()).send({
        tool: 'delete_file', params: { path: '/tmp/test' },
      });
      expect(res.status).toBe(200);
      expect(res.body._meta.tool).toBe('delete_file');
    });

    it('previews move_file', async () => {
      const res = await api('post', '/dryrun/preview').set(auth()).send({
        tool: 'move_file', params: { source: '/src', destination: '/dst' },
      });
      expect(res.status).toBe(200);
      expect(res.body._meta.tool).toBe('move_file');
    });

    it('previews create_directory', async () => {
      const res = await api('post', '/dryrun/preview').set(auth()).send({
        tool: 'create_directory', params: { path: '/tmp/newdir' },
      });
      expect(res.status).toBe(200);
      expect(res.body._meta.tool).toBe('create_directory');
    });

    it('previews generic tool', async () => {
      const res = await api('post', '/dryrun/preview').set(auth()).send({
        tool: 'custom_tool', params: { key: 'value' },
      });
      expect(res.status).toBe(200);
      expect(res.body._meta.tool).toBe('custom_tool');
    });

    it('returns 400 without tool and params', async () => {
      const res = await api('post', '/dryrun/preview').set(auth()).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tool and params required');
    });

    it('handles preview error', async () => {
      const DryRunEngineMock = require('../../src/mcp/engines/DryRunEngine').DryRunEngine;
      DryRunEngineMock.mockImplementationOnce(() => ({
        previewWrite: jest.fn(() => { throw new Error('preview error'); }),
      }));
      const res = await api('post', '/dryrun/preview').set(auth()).send({
        tool: 'write_file', params: { path: '/test', content: 'x' },
      });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /dryrun/history', () => {
    it('returns dry-run history', async () => {
      const res = await request(app).get('/dryrun/history');
      expect(res.status).toBe(200);
      expect(res.body.history).toEqual([]);
    });
  });

  describe('GET /dryrun/diff/:id', () => {
    it('returns diff by id', async () => {
      dryRunEngine.getHistory.mockReturnValue([{ id: 'diff-1', content: 'changes' }]);
      const res = await request(app).get('/dryrun/diff/diff-1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('diff-1');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/dryrun/diff/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Diff not found');
    });
  });

  describe('Thinking Chains', () => {
    it('POST /thinking/chains creates chain', async () => {
      const res = await api('post', '/thinking/chains').set(auth()).send({
        initialThought: 'I think...', metadata: { context: 'test' },
      });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('chain-1');
    });

    it('POST /thinking/chains defaults metadata', async () => {
      await api('post', '/thinking/chains').set(auth()).send({ initialThought: 'test' });
      expect(thinkingChain.createChain).toHaveBeenCalledWith('test', {});
    });

    it('POST /thinking/chains returns 400 without initialThought', async () => {
      const res = await api('post', '/thinking/chains').set(auth()).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('initialThought required');
    });

    it('GET /thinking/chains returns all chains', async () => {
      const res = await request(app).get('/thinking/chains');
      expect(res.status).toBe(200);
      expect(res.body.chains).toHaveLength(1);
    });

    it('GET /thinking/chains/:chainId returns chain', async () => {
      const res = await request(app).get('/thinking/chains/chain-1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('chain-1');
    });

    it('GET /thinking/chains/:chainId returns 404', async () => {
      const res = await request(app).get('/thinking/chains/unknown');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Chain not found');
    });

    it('POST /thinking/chains/:chainId/thoughts adds thought', async () => {
      const res = await api('post', '/thinking/chains/chain-1/thoughts').set(auth()).send({
        thought: 'new thought', options: { tags: ['analysis'] },
      });
      expect(res.status).toBe(200);
    });

    it('POST /thinking/chains/:chainId/thoughts defaults options', async () => {
      await api('post', '/thinking/chains/chain-1/thoughts').set(auth()).send({ thought: 'test' });
      expect(thinkingChain.addThought).toHaveBeenCalledWith('chain-1', 'test', {});
    });

    it('POST /thinking/chains/:chainId/thoughts returns 400 without thought', async () => {
      const res = await api('post', '/thinking/chains/chain-1/thoughts').set(auth()).send({});
      expect(res.status).toBe(400);
    });

    it('POST /thinking/chains/:chainId/thoughts handles error', async () => {
      thinkingChain.addThought.mockImplementation(() => { throw new Error('not found'); });
      const res = await api('post', '/thinking/chains/chain-1/thoughts').set(auth()).send({ thought: 'test' });
      expect(res.status).toBe(500);
    });

    it('POST /thinking/chains/:chainId/branches creates branch', async () => {
      const res = await api('post', '/thinking/chains/chain-1/branches').set(auth()).send({
        fromStep: 2, label: 'alt',
      });
      expect(res.status).toBe(200);
    });

    it('POST /thinking/chains/:chainId/branches handles error', async () => {
      thinkingChain.createBranch.mockImplementation(() => { throw new Error('fail'); });
      const res = await api('post', '/thinking/chains/chain-1/branches').set(auth()).send({ fromStep: 1, label: 'x' });
      expect(res.status).toBe(500);
    });

    it('POST /thinking/chains/:chainId/reflect adds reflection', async () => {
      const res = await api('post', '/thinking/chains/chain-1/reflect').set(auth()).send({
        stepId: 's1', criticism: 'needs work',
      });
      expect(res.status).toBe(200);
    });

    it('POST /thinking/chains/:chainId/reflect returns 400 without stepId', async () => {
      const res = await api('post', '/thinking/chains/chain-1/reflect').set(auth()).send({ criticism: 'bad' });
      expect(res.status).toBe(400);
    });

    it('POST /thinking/chains/:chainId/reflect returns 400 without criticism', async () => {
      const res = await api('post', '/thinking/chains/chain-1/reflect').set(auth()).send({ stepId: 's1' });
      expect(res.status).toBe(400);
    });

    it('POST /thinking/chains/:chainId/reflect handles error', async () => {
      thinkingChain.addReflection.mockImplementation(() => { throw new Error('fail'); });
      const res = await api('post', '/thinking/chains/chain-1/reflect').set(auth()).send({ stepId: 's1', criticism: 'bad' });
      expect(res.status).toBe(500);
    });

    it('POST /thinking/chains/:chainId/backtrack backtracks', async () => {
      const res = await api('post', '/thinking/chains/chain-1/backtrack').set(auth()).send({ toStep: 0 });
      expect(res.status).toBe(200);
    });

    it('POST /thinking/chains/:chainId/backtrack returns 400 without toStep', async () => {
      const res = await api('post', '/thinking/chains/chain-1/backtrack').set(auth()).send({});
      expect(res.status).toBe(400);
    });

    it('POST /thinking/chains/:chainId/backtrack handles error', async () => {
      thinkingChain.backtrack.mockImplementation(() => { throw new Error('fail'); });
      const res = await api('post', '/thinking/chains/chain-1/backtrack').set(auth()).send({ toStep: 0 });
      expect(res.status).toBe(500);
    });
  });

  describe('Roots', () => {
    it('GET /roots returns roots', async () => {
      const res = await request(app).get('/roots');
      expect(res.status).toBe(200);
      expect(res.body.roots).toEqual(['/workspace', '/data']);
    });

    it('POST /roots adds root', async () => {
      const res = await api('post', '/roots').set(auth()).send({ path: '/new/root', permissions: ['read'] });
      expect(res.status).toBe(200);
      expect(res.body.added).toBe('/new/root');
    });

    it('POST /roots defaults permissions', async () => {
      await api('post', '/roots').set(auth()).send({ path: '/new' });
      expect(rootsManager.addRoot).toHaveBeenCalledWith('/new', ['read', 'write']);
    });

    it('POST /roots returns 400 without path', async () => {
      const res = await api('post', '/roots').set(auth()).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('path required');
    });

    it('DELETE /roots/:path removes root', async () => {
      const res = await api('delete', '/roots/' + encodeURIComponent('/workspace')).set(auth());
      expect(res.status).toBe(200);
      expect(res.body.removed).toBe('/workspace');
    });

    it('DELETE /roots/:path blocks traversal', async () => {
      const res = await api('delete', '/roots/' + encodeURIComponent('../etc')).set(auth());
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('path traversal');
    });

    it('DELETE /roots/:path blocks control chars', async () => {
      const res = await api('delete', '/roots/' + encodeURIComponent('bad\x00path')).set(auth());
      expect(res.status).toBe(400);
    });

    it('POST /roots/sandbox creates temporary root', async () => {
      const res = await api('post', '/roots/sandbox').set(auth()).send({ prefix: 'test' });
      expect(res.status).toBe(200);
    });

    it('POST /roots/sandbox uses default prefix', async () => {
      await api('post', '/roots/sandbox').set(auth()).send({});
      expect(rootsManager.createTemporaryRoot).toHaveBeenCalledWith('mcp-sandbox');
    });

    it('DELETE /roots/sandbox/:id removes temporary root', async () => {
      const res = await api('delete', '/roots/sandbox/sandbox-1').set(auth());
      expect(res.status).toBe(200);
      expect(res.body.removed).toBe(true);
    });

    it('GET /roots/validate validates path', async () => {
      const res = await request(app).get('/roots/validate?path=/workspace/file.txt');
      expect(res.status).toBe(200);
    });

    it('GET /roots/validate returns 400 without path param', async () => {
      const res = await request(app).get('/roots/validate');
      expect(res.status).toBe(400);
    });

    it('GET /roots/validate returns 400 for empty path', async () => {
      const res = await request(app).get('/roots/validate?path=');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('path query parameter required');
    });

    it('GET /roots/validate blocks traversal', async () => {
      const res = await request(app).get('/roots/validate?path=../secret');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('path traversal');
    });

    it('GET /roots/validate blocks control chars', async () => {
      const res = await request(app).get('/roots/validate?path=%00inject');
      expect(res.status).toBe(400);
    });

    it('GET /roots/validate returns 400 for whitespace-only path', async () => {
      const res = await request(app).get('/roots/validate?path=%20%20');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid path format');
    });
  });

  describe('Roles', () => {
    it('POST /roles creates role with default level', async () => {
      const res = await api('post', '/roles').set(auth()).send({ name: 'editor' });
      expect(res.status).toBe(200);
      expect(mockPlugin.permissionManager.addCustomRole).toHaveBeenCalledWith('editor', expect.objectContaining({ level: 'read' }));
    });

    it('POST /roles creates role with specific level', async () => {
      const res = await api('post', '/roles').set(auth()).send({ name: 'admin-role', level: 'admin' });
      expect(res.status).toBe(200);
    });

    it('POST /roles creates role with write level', async () => {
      const res = await api('post', '/roles').set(auth()).send({ name: 'writer', level: 'write' });
      expect(res.status).toBe(200);
      expect(mockPlugin.permissionManager.addCustomRole).toHaveBeenCalledWith('writer', expect.objectContaining({
        level: 'write',
        allowedTools: ['filesystem:read*', 'github:read*', 'brave-search:*'],
      }));
    });

    it('POST /roles defaults invalid level to read', async () => {
      await api('post', '/roles').set(auth()).send({ name: 'custom', level: 'superadmin' });
      expect(mockPlugin.permissionManager.addCustomRole).toHaveBeenCalledWith('custom', expect.objectContaining({ level: 'read' }));
    });

    it('POST /roles returns 400 without name', async () => {
      const res = await api('post', '/roles').set(auth()).send({ level: 'admin' });
      expect(res.status).toBe(400);
    });

    it('POST /roles returns 400 for non-string name', async () => {
      const res = await api('post', '/roles').set(auth()).send({ name: 123 });
      expect(res.status).toBe(400);
    });

    it('POST /roles returns error from permission manager', async () => {
      mockPlugin.permissionManager.addCustomRole.mockReturnValue({ error: 'Role exists' });
      const res = await api('post', '/roles').set(auth()).send({ name: 'existing' });
      expect(res.status).toBe(400);
    });

    it('POST /roles returns 503 when permission manager missing', async () => {
      delete mockPlugin.permissionManager;
      const res = await api('post', '/roles').set(auth()).send({ name: 'editor' });
      expect(res.status).toBe(503);
    });
  });

  describe('Alerts', () => {
    it('POST /alerts/channels registers channel', async () => {
      const res = await api('post', '/alerts/channels').set(auth()).send({
        type: 'slack', name: 'ch', token: 'xoxb-token',
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /alerts/channels returns 400 without type', async () => {
      const res = await api('post', '/alerts/channels').set(auth()).send({ name: 'ch' });
      expect(res.status).toBe(400);
    });

    it('POST /alerts/channels returns 400 without name', async () => {
      const res = await api('post', '/alerts/channels').set(auth()).send({ type: 'email' });
      expect(res.status).toBe(400);
    });

    it('GET /alerts/rules returns rules', async () => {
      const res = await request(app).get('/alerts/rules');
      expect(res.status).toBe(200);
    });

    it('GET /alerts/stats returns stats', async () => {
      const res = await request(app).get('/alerts/stats');
      expect(res.status).toBe(200);
    });

    it('GET /alerts/history returns history', async () => {
      const res = await request(app).get('/alerts/history');
      expect(res.status).toBe(200);
      expect(res.body.history).toEqual([]);
    });

    it('GET /alerts/history filters by params', async () => {
      await request(app).get('/alerts/history?since=1000&severity=high&username=admin');
      expect(getMCPAlertManager().getAlertHistory).toHaveBeenCalledWith(
        expect.objectContaining({ since: 1000, severity: 'high', username: 'admin' })
      );
    });
  });

  describe('rate limiter periodic cleanup', () => {
    afterAll(() => {
      jest.useRealTimers();
    });

    it('should clean up stale entries after 60s interval', async () => {
      jest.useFakeTimers();
      try {
        let isolatedSetAuth, isolatedSetPlugin, isolatedSetPerm, isolatedCleanup, isolatedRouterVal;
        jest.isolateModules(() => {
          const mod = require('../../src/mcp/router');
          isolatedSetAuth = mod.setAuthMiddleware;
          isolatedSetPlugin = mod.setMCPPlugin;
          isolatedSetPerm = mod.setPermissionManager;
          isolatedCleanup = mod._cleanup;
          isolatedRouterVal = mod.router;
        });

        isolatedSetAuth(mockAuth);
        isolatedSetPlugin(mockPlugin);
        isolatedSetPerm(mockPlugin.permissionManager);

        const app2 = express();
        app2.set('trust proxy', true);
        app2.use(express.json());
        app2.use(isolatedRouterVal);

        jest.advanceTimersByTime(1);
        for (let i = 0; i < 5; i++) {
          await request(app2)
            .post('/call')
            .set('X-Forwarded-For', `10.0.0.${i}`)
            .send({ toolFullName: 'filesystem:read_file' });
        }

        jest.advanceTimersByTime(120000);
        isolatedCleanup();
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
