const { MCPPermissionManager, TOOL_PERMISSION_LEVELS, DEFAULT_ROLE_TOOLS } = require('../../src/mcp/MCPPermissionManager');

describe('MCPPermissionManager', () => {
  let manager;

  beforeEach(() => {
    manager = new MCPPermissionManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(manager.toolPermissions).toBeInstanceOf(Map);
      expect(manager.toolPermissions.size).toBe(0);
      expect(manager.rolePermissions.size).toBe(3);
      expect(manager.auditLog).toEqual([]);
      expect(manager.maxAuditEntries).toBe(10000);
    });

    it('should load default roles (admin, operator, viewer)', () => {
      expect(manager.rolePermissions.has('admin')).toBe(true);
      expect(manager.rolePermissions.has('operator')).toBe(true);
      expect(manager.rolePermissions.has('viewer')).toBe(true);
    });

    it('should accept customRoles', () => {
      const m = new MCPPermissionManager({
        customRoles: {
          auditor: { allowedTools: ['audit:*'] }
        }
      });
      expect(m.rolePermissions.has('auditor')).toBe(true);
      expect(m.rolePermissions.get('auditor').allowedTools).toEqual(['audit:*']);
      m.destroy();
    });

    it('should accept toolPermissions', () => {
      const m = new MCPPermissionManager({
        toolPermissions: {
          'dangerous:tool': { allowed: false }
        }
      });
      const perm = m.toolPermissions.get('dangerous:tool');
      expect(perm).toBeDefined();
      expect(perm.allowed).toBe(false);
      m.destroy();
    });
  });

  describe('setToolPermission', () => {
    it('should block tool when permission is false', () => {
      manager.setToolPermission('dangerous:tool', false);
      const perm = manager.toolPermissions.get('dangerous:tool');
      expect(perm.allowed).toBe(false);
      expect(perm.reason).toBe('explicitly_blocked');
    });

    it('should block tool when permission is null', () => {
      manager.setToolPermission('dangerous:tool', null);
      const perm = manager.toolPermissions.get('dangerous:tool');
      expect(perm.allowed).toBe(false);
    });

    it('should set role requirement when permission is string', () => {
      manager.setToolPermission('sensitive:tool', 'admin');
      const perm = manager.toolPermissions.get('sensitive:tool');
      expect(perm.allowed).toBe(true);
      expect(perm.requiredRole).toBe('admin');
      expect(perm.reason).toBe('role_restricted');
    });

    it('should set custom config when permission is object', () => {
      manager.setToolPermission('custom:tool', {
        allowed: true,
        requiredRole: 'operator',
        customField: 'value'
      });
      const perm = manager.toolPermissions.get('custom:tool');
      expect(perm.allowed).toBe(true);
      expect(perm.requiredRole).toBe('operator');
      expect(perm.customField).toBe('value');
      expect(perm.reason).toBe('custom_config');
    });

    it('should normalize tool name to lowercase', () => {
      manager.setToolPermission('MIXED:CASE', false);
      expect(manager.toolPermissions.has('mixed:case')).toBe(true);
      expect(manager.toolPermissions.has('MIXED:CASE')).toBe(false);
    });
  });

  describe('setRolePermission', () => {
    it('should update existing role', () => {
      manager.setRolePermission('viewer', { allowedTools: ['*'] });
      const role = manager.rolePermissions.get('viewer');
      expect(role.allowedTools).toEqual(['*']);
    });

    it('should create new role from viewer defaults', () => {
      manager.setRolePermission('custom_role', { allowedTools: ['custom:*'] });
      const role = manager.rolePermissions.get('custom_role');
      expect(role.level).toBe('read');
      expect(role.allowedTools).toEqual(['custom:*']);
    });
  });

  describe('addCustomRole', () => {
    it('should add a new role', () => {
      const result = manager.addCustomRole('deployer', {
        level: 'write',
        allowedTools: ['deploy:*']
      });
      expect(result.success).toBe(true);
      expect(result.role).toBe('deployer');
    });

    it('should return error if role already exists', () => {
      const result = manager.addCustomRole('admin', {
        allowedTools: ['*']
      });
      expect(result.error).toContain('already exists');
    });
  });

  describe('checkToolAccess', () => {
    it('should deny wildcard tool names', () => {
      const result = manager.checkToolAccess('*:*', 'viewer');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('wildcard_tool_not_allowed');
    });

    it('should deny when tool is explicitly blocked', () => {
      manager.setToolPermission('dangerous:delete', false);
      const result = manager.checkToolAccess('dangerous:delete', 'admin');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('explicitly_blocked');
    });

    it('should deny when role is insufficient for tool requirement', () => {
      manager.setToolPermission('sensitive:tool', 'operator');
      const result = manager.checkToolAccess('sensitive:tool', 'viewer');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('insufficient_role');
      expect(result.requiredRole).toBe('operator');
    });

    it('should allow when matching admin role for admin-required tool', () => {
      manager.setToolPermission('sensitive:tool', 'admin');
      const result = manager.checkToolAccess('sensitive:tool', 'admin');
      expect(result.allowed).toBe(true);
    });

    it('should deny for unknown role', () => {
      const result = manager.checkToolAccess('filesystem:read_file', 'unknown_role');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('unknown_role');
    });

    it('should deny when tool matches denied pattern', () => {
      const result = manager.checkToolAccess('github:create_issue', 'operator');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('tool_denied_by_role');
    });

    it('should allow admin full access', () => {
      const result = manager.checkToolAccess('filesystem:read_file', 'admin');
      expect(result.allowed).toBe(true);
    });

    it('should allow viewer access to allowed tools', () => {
      const result = manager.checkToolAccess('filesystem:read_file', 'viewer');
      expect(result.allowed).toBe(true);
    });

    it('should deny viewer access to write tools', () => {
      const result = manager.checkToolAccess('filesystem:write_file', 'viewer');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('tool_denied_by_role');
    });

    it('should deny operator access to explicitly denied tools', () => {
      const result = manager.checkToolAccess('github:create_issue', 'operator');
      expect(result.allowed).toBe(false);
    });

    it('should allow operator access to non-denied tools', () => {
      const result = manager.checkToolAccess('filesystem:list_directory', 'operator');
      expect(result.allowed).toBe(true);
    });

    it('should deny tool not in any allowed list', () => {
      const result = manager.checkToolAccess('unknown:tool', 'viewer');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('tool_not_in_allowed_list');
    });

    it('should audit denied access', () => {
      manager.checkToolAccess('unknown:tool', 'viewer');
      expect(manager.auditLog).toHaveLength(1);
      expect(manager.auditLog[0].action).toBe('denied');
    });

    it('should audit allowed access', () => {
      manager.checkToolAccess('filesystem:read_file', 'admin');
      expect(manager.auditLog).toHaveLength(1);
      expect(manager.auditLog[0].action).toBe('allowed');
    });
  });

  describe('checkPermission', () => {
    it('should return true when no required permission', () => {
      expect(manager.checkPermission([], null)).toBe(true);
      expect(manager.checkPermission([], undefined)).toBe(true);
    });

    it('should return true for wildcard user permissions', () => {
      expect(manager.checkPermission(['*'], 'mcp:tool')).toBe(true);
    });

    it('should return true when permission matches exactly', () => {
      expect(manager.checkPermission(['mcp:tool'], 'mcp:tool')).toBe(true);
    });

    it('should return true when resource wildcard matches', () => {
      expect(manager.checkPermission(['*:tool'], 'mcp:tool')).toBe(true);
    });

    it('should return true when action wildcard matches', () => {
      expect(manager.checkPermission(['mcp:*'], 'mcp:tool')).toBe(true);
    });

    it('should return false when no match', () => {
      expect(manager.checkPermission(['other:action'], 'mcp:tool')).toBe(false);
    });
  });

  describe('_matchPattern', () => {
    it('should match wildcard', () => {
      expect(manager._matchPattern('anything', '*')).toBe(true);
    });

    it('should reject patterns longer than 100 chars', () => {
      const longPattern = 'a'.repeat(101);
      expect(manager._matchPattern('test', longPattern)).toBe(false);
    });

    it('should match exact strings', () => {
      expect(manager._matchPattern('filesystem:read_file', 'filesystem:read_file')).toBe(true);
    });

    it('should match glob-like wildcards', () => {
      expect(manager._matchPattern('filesystem:read_file', 'filesystem:*')).toBe(true);
      expect(manager._matchPattern('filesystem:write_file', 'filesystem:write*')).toBe(true);
      expect(manager._matchPattern('github:create_issue', '*create*')).toBe(true);
    });

    it('should not match different tools', () => {
      expect(manager._matchPattern('filesystem:read_file', 'github:*')).toBe(false);
    });

    it('should escape regex special characters', () => {
      expect(manager._matchPattern('file+system:read', 'file+system:read')).toBe(true);
    });

    it('should return false for invalid regex gracefully', () => {
      const spy = jest.spyOn(RegExp.prototype, 'test').mockImplementation(() => { throw new Error('bad regex'); });
      const result = manager._matchPattern('test', 'pattern');
      expect(result).toBe(false);
      spy.mockRestore();
    });
  });

  describe('getAuditLog', () => {
    beforeEach(() => {
      const _t = Date.now();
      manager.checkToolAccess('filesystem:read_file', 'admin');
      manager.checkToolAccess('unknown:tool', 'viewer');
      manager.checkToolAccess('filesystem:write_file', 'viewer');
      manager._audit('extra:tool', 'admin', 'allowed', 'test audit');
    });

    it('should return all logs', () => {
      expect(manager.getAuditLog()).toHaveLength(4);
    });

    it('should filter by toolName', () => {
      const logs = manager.getAuditLog({ toolName: 'unknown:tool' });
      expect(logs).toHaveLength(1);
    });

    it('should filter by role', () => {
      const logs = manager.getAuditLog({ role: 'viewer' });
      expect(logs).toHaveLength(2);
    });

    it('should filter by action', () => {
      const logs = manager.getAuditLog({ action: 'allowed' });
      expect(logs).toHaveLength(2);
    });

    it('should filter by since timestamp', () => {
      const logs = manager.getAuditLog({ since: Date.now() + 100000 });
      expect(logs).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('should return zero stats for fresh manager', () => {
      const stats = manager.getStats();
      expect(stats.roles).toBe(3);
      expect(stats.customToolPermissions).toBe(0);
      expect(stats.auditEntries).toBe(0);
    });

    it('should reflect added permissions and audit entries', () => {
      manager.setToolPermission('test:tool', 'admin');
      manager.checkToolAccess('test:tool', 'admin');
      const stats = manager.getStats();
      expect(stats.customToolPermissions).toBe(1);
      expect(stats.auditEntries).toBe(1);
    });
  });

  describe('exportConfig', () => {
    it('should export roles and toolPermissions', () => {
      manager.setToolPermission('custom:tool', 'admin');
      const config = manager.exportConfig();
      expect(config.roles).toBeDefined();
      expect(config.toolPermissions).toBeDefined();
      expect(Object.keys(config.roles)).toContain('admin');
      expect(Object.keys(config.toolPermissions)).toContain('custom:tool');
    });
  });

  describe('maxAuditEntries', () => {
    it('should trim audit log when exceeding max', () => {
      const m = new MCPPermissionManager();
      m.maxAuditEntries = 10;
      for (let i = 0; i < 25; i++) {
        m._audit(`tool${i}`, 'admin', 'allowed', 'test');
      }
      expect(m.auditLog.length).toBeLessThanOrEqual(10);
      m.destroy();
    });
  });

  describe('TOOL_PERMISSION_LEVELS', () => {
    it('should define read, write, admin levels', () => {
      expect(TOOL_PERMISSION_LEVELS).toEqual({ read: 1, write: 2, admin: 3 });
    });
  });

  describe('DEFAULT_ROLE_TOOLS', () => {
    it('should define admin, operator, viewer roles', () => {
      expect(DEFAULT_ROLE_TOOLS.admin.level).toBe('admin');
      expect(DEFAULT_ROLE_TOOLS.operator.level).toBe('write');
      expect(DEFAULT_ROLE_TOOLS.viewer.level).toBe('read');
    });

    it('admin should have full access', () => {
      expect(DEFAULT_ROLE_TOOLS.admin.allowedTools).toEqual(['*']);
    });
  });

  describe('destroy', () => {
    it('should clear all state', () => {
      manager.setToolPermission('test:tool', false);
      manager.checkToolAccess('test:tool', 'admin');
      manager.destroy();
      expect(manager.auditLog).toEqual([]);
      expect(manager.toolPermissions.size).toBe(0);
      expect(manager.rolePermissions.size).toBe(0);
    });
  });

  describe('checkToolAccess (additional branches)', () => {
    it('should deny tool with wildcard in tool component (server != *)', () => {
      const result = manager.checkToolAccess('something:*', 'viewer');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('wildcard_tool_not_allowed');
    });

    it('should skip role check when tool requires admin role (admin bypass)', () => {
      manager.setToolPermission('admin-bypass:tool', 'admin');
      const result = manager.checkToolAccess('admin-bypass:tool', 'viewer');
      expect(result.reason).toBe('tool_not_in_allowed_list');
    });

    it('should allow admin-bypass tool when role matches allowed list', () => {
      manager.setToolPermission('filesystem:search', 'admin');
      const result = manager.checkToolAccess('filesystem:search', 'operator');
      expect(result.allowed).toBe(true);
    });

    it('should skip permission role check when tool has no requiredRole', () => {
      manager.setToolPermission('no-restriction:tool', { allowed: true });
      const result = manager.checkToolAccess('no-restriction:tool', 'viewer');
      expect(result.reason).toBe('tool_not_in_allowed_list');
    });
  });

  describe('checkPermission (additional branches)', () => {
    it('should return false when resource matches via wildcard but action does not', () => {
      expect(manager.checkPermission(['*:other'], 'mcp:tool')).toBe(false);
    });
  });

  describe('middleware', () => {
    const mockReq = (overrides) => ({
      headers: {},
      body: {},
      method: 'GET',
      path: '/',
      ...overrides
    });

    const mockRes = () => {
      const res = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      return res;
    };

    it('should call next() for non-POST requests without JWT', async () => {
      const mw = manager.middleware();
      const req = mockReq({ method: 'GET', path: '/health' });
      const res = mockRes();
      const next = jest.fn();
      await mw(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should call next() for POST to non-/call path without JWT', async () => {
      const mw = manager.middleware();
      const req = mockReq({ method: 'POST', path: '/config' });
      const res = mockRes();
      const next = jest.fn();
      await mw(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should allow POST /call with allowed tool (no JWT)', async () => {
      const mw = manager.middleware();
      const req = mockReq({
        method: 'POST',
        path: '/call',
        body: { toolFullName: 'filesystem:read_file' }
      });
      const res = mockRes();
      const next = jest.fn();
      await mw(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should return 403 for POST /call with denied tool (no JWT)', async () => {
      const mw = manager.middleware();
      const req = mockReq({
        method: 'POST',
        path: '/call',
        body: { toolFullName: 'unknown:tool' }
      });
      const res = mockRes();
      const next = jest.fn();
      await mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Tool access denied'
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow POST /batch-call when all tools are allowed (no JWT)', async () => {
      const mw = manager.middleware();
      const req = mockReq({
        method: 'POST',
        path: '/batch-call',
        body: { calls: [{ toolFullName: 'filesystem:read_file' }, { toolFullName: 'filesystem:list_directory' }] }
      });
      const res = mockRes();
      const next = jest.fn();
      await mw(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should return 403 for POST /batch-call when a tool is denied (no JWT)', async () => {
      const mw = manager.middleware();
      const req = mockReq({
        method: 'POST',
        path: '/batch-call',
        body: { calls: [{ toolFullName: 'filesystem:read_file' }, { toolFullName: 'unknown:tool' }] }
      });
      const res = mockRes();
      const next = jest.fn();
      await mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Batch call contains unauthorized tool'
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when JWT auth is enabled but no auth header', async () => {
      const mockJwtAuth = { verify: jest.fn() };
      const mw = manager.middleware({ jwtAuth: mockJwtAuth });
      const req = mockReq({ method: 'POST', path: '/call' });
      const res = mockRes();
      const next = jest.fn();
      await mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 401 when auth header is not Bearer format', async () => {
      const mockJwtAuth = { verify: jest.fn() };
      const mw = manager.middleware({ jwtAuth: mockJwtAuth });
      const req = mockReq({
        method: 'POST',
        path: '/call',
        headers: { authorization: 'Basic somecreds' }
      });
      const res = mockRes();
      const next = jest.fn();
      await mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 401 when JWT token is invalid', async () => {
      const mockJwtAuth = {
        verify: jest.fn().mockReturnValue({ valid: false, error: 'Token expired' })
      };
      const mw = manager.middleware({ jwtAuth: mockJwtAuth });
      const req = mockReq({
        method: 'POST',
        path: '/call',
        headers: { authorization: 'Bearer bad-token' }
      });
      const res = mockRes();
      const next = jest.fn();
      await mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Token expired' });
    });

    it('should set req.user and proceed when JWT is valid and tool allowed', async () => {
      const mockJwtAuth = {
        verify: jest.fn().mockReturnValue({ valid: true, username: 'admin', role: 'admin' })
      };
      const mw = manager.middleware({ jwtAuth: mockJwtAuth });
      const req = mockReq({
        method: 'POST',
        path: '/call',
        headers: { authorization: 'Bearer valid-token' },
        body: { toolFullName: 'filesystem:read_file' }
      });
      const res = mockRes();
      const next = jest.fn();
      await mw(req, res, next);
      expect(req.user).toEqual({ username: 'admin', role: 'admin' });
      expect(next).toHaveBeenCalled();
    });

    it('should return 403 when required role does not match JWT role', async () => {
      const mockJwtAuth = {
        verify: jest.fn().mockReturnValue({ valid: true, username: 'viewer', role: 'viewer' })
      };
      const mw = manager.middleware({ jwtAuth: mockJwtAuth, requiredRole: 'admin' });
      const req = mockReq({
        method: 'GET',
        path: '/health',
        headers: { authorization: 'Bearer viewer-token' }
      });
      const res = mockRes();
      const next = jest.fn();
      await mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient role',
        required: 'admin',
        current: 'viewer'
      });
    });
  });
});
