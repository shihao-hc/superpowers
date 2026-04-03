/**
 * MCP Permission Manager
 * Role-based access control for MCP tools
 */

const crypto = require('crypto');

const TOOL_PERMISSION_LEVELS = {
  read: 1,
  write: 2,
  admin: 3
};

const DEFAULT_ROLE_TOOLS = {
  admin: {
    level: 'admin',
    allowedTools: ['*'],
    deniedTools: []
  },
  operator: {
    level: 'write',
    allowedTools: ['filesystem:read*', 'filesystem:list_directory', 'filesystem:search', 'github:read*', 'github:search_repositories', 'brave-search:*', 'sequential-thinking:*', 'everything:search'],
    deniedTools: ['github:create_issue', 'github:create_release', 'github:delete_file', 'filesystem:write_file', 'filesystem:delete_file']
  },
  viewer: {
    level: 'read',
    allowedTools: ['filesystem:read_file', 'filesystem:list_directory', 'github:read*', 'brave-search:*', 'sequential-thinking:*', 'everything:search'],
    deniedTools: ['github:create*', 'github:delete*', 'filesystem:write*', 'filesystem:delete*', '*write*', '*delete*', '*create*']
  }
};

class MCPPermissionManager {
  constructor(options = {}) {
    this.toolPermissions = new Map();
    this.rolePermissions = new Map(Object.entries(DEFAULT_ROLE_TOOLS));
    this.auditLog = [];
    this.maxAuditEntries = 10000;
    
    if (options.customRoles) {
      for (const [name, config] of Object.entries(options.customRoles)) {
        this.rolePermissions.set(name, { ...DEFAULT_ROLE_TOOLS.viewer, ...config });
      }
    }
    
    if (options.toolPermissions) {
      for (const [tool, config] of Object.entries(options.toolPermissions)) {
        this.setToolPermission(tool, config);
      }
    }
  }

  setToolPermission(toolFullName, permission) {
    const normalized = toolFullName.toLowerCase();
    
    if (permission === false || permission === null) {
      this.toolPermissions.set(normalized, { allowed: false, reason: 'explicitly_blocked' });
      return;
    }
    
    if (typeof permission === 'string') {
      this.toolPermissions.set(normalized, { 
        allowed: true, 
        requiredRole: permission,
        reason: 'role_restricted'
      });
      return;
    }
    
    this.toolPermissions.set(normalized, { 
      allowed: true, 
      ...permission,
      reason: 'custom_config'
    });
  }

  setRolePermission(roleName, permission) {
    if (this.rolePermissions.has(roleName)) {
      const existing = this.rolePermissions.get(roleName);
      this.rolePermissions.set(roleName, { ...existing, ...permission });
    } else {
      this.rolePermissions.set(roleName, { ...DEFAULT_ROLE_TOOLS.viewer, ...permission });
    }
  }

  addCustomRole(roleName, config) {
    if (this.rolePermissions.has(roleName)) {
      return { error: `Role ${roleName} already exists` };
    }
    
    this.rolePermissions.set(roleName, { 
      ...DEFAULT_ROLE_TOOLS.viewer,
      ...config 
    });
    
    return { success: true, role: roleName };
  }

  checkToolAccess(toolFullName, userRole, userPermissions = []) {
    const normalized = toolFullName.toLowerCase();
    const [server, tool] = normalized.split(':');
    
    if (server === '*' || tool === '*') {
      return { allowed: false, reason: 'wildcard_tool_not_allowed' };
    }
    
    const toolConfig = this.toolPermissions.get(normalized);
    if (toolConfig) {
      if (!toolConfig.allowed) {
        this._audit(toolFullName, userRole, 'denied', `Tool explicitly blocked: ${toolConfig.reason}`);
        return { allowed: false, reason: toolConfig.reason };
      }
      
      if (toolConfig.requiredRole) {
        if (userRole !== toolConfig.requiredRole && toolConfig.requiredRole !== 'admin') {
          this._audit(toolFullName, userRole, 'denied', `Requires ${toolConfig.requiredRole} role`);
          return { 
            allowed: false, 
            reason: 'insufficient_role',
            requiredRole: toolConfig.requiredRole 
          };
        }
      }
    }
    
    const roleConfig = this.rolePermissions.get(userRole);
    if (!roleConfig) {
      this._audit(toolFullName, userRole, 'denied', 'Unknown role');
      return { allowed: false, reason: 'unknown_role' };
    }
    
    if (roleConfig.deniedTools.some(pattern => this._matchPattern(normalized, pattern))) {
      this._audit(toolFullName, userRole, 'denied', 'Tool matches denied pattern');
      return { allowed: false, reason: 'tool_denied_by_role' };
    }
    
    if (roleConfig.allowedTools.includes('*')) {
      this._audit(toolFullName, userRole, 'allowed', 'Full access');
      return { allowed: true };
    }
    
    if (roleConfig.allowedTools.some(pattern => this._matchPattern(normalized, pattern))) {
      this._audit(toolFullName, userRole, 'allowed', 'Tool matches allowed pattern');
      return { allowed: true };
    }
    
    this._audit(toolFullName, userRole, 'denied', 'Tool not in allowed list');
    return { allowed: false, reason: 'tool_not_in_allowed_list' };
  }

  checkPermission(userPermissions, requiredPermission) {
    if (!requiredPermission) return true;
    if (userPermissions.includes('*')) return true;
    
    return userPermissions.some(p => {
      const [resource, action] = p.split(':');
      const [reqResource, reqAction] = requiredPermission.split(':');
      return (resource === reqResource || resource === '*') &&
             (action === reqAction || action === '*');
    });
  }

  middleware(options = {}) {
    const jwtAuth = options.jwtAuth;
    const requireMcpPermission = options.requirePermission || 'mcp:tool';
    
    return async (req, res, next) => {
      const authHeader = req.headers.authorization;
      
      if (jwtAuth) {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        
        const token = authHeader.slice(7);
        const result = jwtAuth.verify(token);
        
        if (!result.valid) {
          return res.status(401).json({ error: result.error });
        }
        
        req.user = {
          username: result.username,
          role: result.role
        };
        
        if (options.requiredRole && result.role !== options.requiredRole) {
          return res.status(403).json({ 
            error: 'Insufficient role',
            required: options.requiredRole,
            current: result.role
          });
        }
      }
      
      if (req.method === 'POST' && (req.path === '/call' || req.path === '/batch-call')) {
        const userRole = req.user?.role || 'viewer';
        
        if (req.body.toolFullName) {
          const access = this.checkToolAccess(req.body.toolFullName, userRole);
          if (!access.allowed) {
            return res.status(403).json({ 
              error: 'Tool access denied',
              reason: access.reason,
              tool: req.body.toolFullName
            });
          }
        }
        
        if (req.body.calls && Array.isArray(req.body.calls)) {
          for (const call of req.body.calls) {
            const access = this.checkToolAccess(call.toolFullName, userRole);
            if (!access.allowed) {
              return res.status(403).json({ 
                error: 'Batch call contains unauthorized tool',
                reason: access.reason,
                tool: call.toolFullName
              });
            }
          }
        }
      }
      
      next();
    };
  }

  _matchPattern(toolName, pattern) {
    if (pattern === '*') return true;
    
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(toolName);
  }

  _audit(toolName, role, action, reason) {
    const entry = {
      timestamp: Date.now(),
      toolName,
      role,
      action,
      reason,
      traceId: crypto.randomBytes(8).toString('hex')
    };
    
    this.auditLog.push(entry);
    
    if (this.auditLog.length > this.maxAuditEntries) {
      this.auditLog = this.auditLog.slice(-this.maxAuditEntries / 2);
    }
  }

  getAuditLog(options = {}) {
    let logs = [...this.auditLog];
    
    if (options.toolName) {
      logs = logs.filter(e => e.toolName === options.toolName);
    }
    if (options.role) {
      logs = logs.filter(e => e.role === options.role);
    }
    if (options.action) {
      logs = logs.filter(e => e.action === options.action);
    }
    if (options.since) {
      logs = logs.filter(e => e.timestamp >= options.since);
    }
    
    return logs;
  }

  getStats() {
    return {
      roles: this.rolePermissions.size,
      customToolPermissions: this.toolPermissions.size,
      auditEntries: this.auditLog.length
    };
  }

  exportConfig() {
    return {
      roles: Object.fromEntries(this.rolePermissions),
      toolPermissions: Object.fromEntries(this.toolPermissions)
    };
  }

  destroy() {
    this.auditLog = [];
    this.toolPermissions.clear();
    this.rolePermissions.clear();
  }
}

module.exports = { 
  MCPPermissionManager,
  TOOL_PERMISSION_LEVELS,
  DEFAULT_ROLE_TOOLS
};
