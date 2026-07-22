/**
 * SecurityManager - 安全增强模块 v1.0
 *
 * 提供权限控制、审计日志、行为限制
 *
 * @version 1.0.0
 * @license MIT
 */

const fs = require('fs');
const path = require('path');

class PermissionControl {
  constructor() {
    this.permissions = new Map();
    this.rolePermissions = new Map();
    this.defaultRoles = {
      admin: ['*'],
      agent: ['read', 'write', 'execute', 'delegate'],
      observer: ['read'],
      restricted: []
    };
    this._initDefaultRoles();
  }

  _initDefaultRoles() {
    for (const [role, perms] of Object.entries(this.defaultRoles)) {
      this.rolePermissions.set(role, new Set(perms));
    }
  }

  grant(agentId, permission) {
    if (!this.permissions.has(agentId)) {
      this.permissions.set(agentId, new Set());
    }
    this.permissions.get(agentId).add(permission);
  }

  revoke(agentId, permission) {
    const perms = this.permissions.get(agentId);
    if (perms) {
      perms.delete(permission);
    }
  }

  hasPermission(agentId, permission) {
    const agentPerms = this.permissions.get(agentId);
    if (agentPerms && agentPerms.has('*')) {return true;}
    return agentPerms ? agentPerms.has(permission) : false;
  }

  setRole(agentId, role) {
    const rolePerms = this.rolePermissions.get(role);
    if (rolePerms) {
      this.permissions.set(agentId, new Set(rolePerms));
    }
  }
}

class AuditLog {
  constructor(options = {}) {
    this.logPath = options.logPath || './logs/audit.log';
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024;
    this.entries = [];
    this.maxEntries = options.maxEntries || 10000;
    this._ensureLogDir();
  }

  _ensureLogDir() {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  log(event) {
    const entry = {
      timestamp: new Date().toISOString(),
      ...event
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
    this._writeToFile(entry);
  }

  _writeToFile(entry) {
    try {
      const data = `${JSON.stringify(entry)}\n`;
      if (fs.existsSync(this.logPath)) {
        const stats = fs.statSync(this.logPath);
        if (stats.size > this.maxFileSize) {
          this._rotateLog();
        }
      }
      fs.appendFileSync(this.logPath, data);
    } catch (e) {
      console.error('[AuditLog] 写入失败:', e.message);
    }
  }

  _rotateLog() {
    const backup = `${this.logPath}.bak`;
    try { fs.unlinkSync(backup); } catch {}
    fs.renameSync(this.logPath, backup);
  }

  query(filter = {}, limit = 100) {
    let results = this.entries;
    if (filter.agentId) {
      results = results.filter((e) => e.agentId === filter.agentId);
    }
    if (filter.action) {
      results = results.filter((e) => e.action === filter.action);
    }
    if (filter.from) {
      results = results.filter((e) => new Date(e.timestamp) >= new Date(filter.from));
    }
    if (filter.to) {
      results = results.filter((e) => new Date(e.timestamp) <= new Date(filter.to));
    }
    return results.slice(-limit);
  }
}

class BehaviorLimits {
  constructor(options = {}) {
    this.limits = {
      maxRequestsPerMinute: options.maxRequestsPerMinute || 60,
      maxDataSize: options.maxDataSize || 1024 * 1024,
      maxFileOps: options.maxFileOps || 100,
      maxNetworkCalls: options.maxNetworkCalls || 30
    };
    this.counters = new Map();
    this.blocked = new Set();
  }

  check(agentId, operation) {
    if (this.blocked.has(agentId)) {
      throw new Error(`Agent ${agentId} 已受限`);
    }

    const key = `${agentId}:${operation}`;
    const now = Date.now();
    const window = 60000;

    if (!this.counters.has(key)) {
      this.counters.set(key, { count: 0, resetAt: now + window });
    }

    const counter = this.counters.get(key);
    if (now > counter.resetAt) {
      counter.count = 0;
      counter.resetAt = now + window;
    }

    const limitKey = operation === 'file' ? 'maxFileOps' :
      operation === 'network' ? 'maxNetworkCalls' : 'maxRequestsPerMinute';
    const limit = this.limits[limitKey];

    if (counter.count >= limit) {
      this.blocked.add(agentId);
      throw new Error(`${operation} 超出限制 ${limit}/分钟`);
    }

    counter.count++;
    return true;
  }

  reset(agentId) {
    this.blocked.delete(agentId);
    for (const [key, counter] of this.counters) {
      if (key.startsWith(`${agentId}:`)) {
        counter.count = 0;
      }
    }
  }
}

class SecurityManager {
  constructor(options = {}) {
    this.permission = new PermissionControl();
    this.audit = new AuditLog(options.audit);
    this.limits = new BehaviorLimits(options.limits);
    this.enabled = options.enabled !== false;
  }

  authorize(agentId, action) {
    if (!this.enabled) {return true;}
    return this.permission.hasPermission(agentId, action);
  }

  async withAudit(agentId, action, fn) {
    if (!this.enabled) {return fn();}

    this.audit.log({
      agentId,
      action,
      status: 'started'
    });

    try {
      const result = await fn();
      this.audit.log({
        agentId,
        action,
        status: 'success'
      });
      return result;
    } catch (e) {
      this.audit.log({
        agentId,
        action,
        status: 'error',
        error: e.message
      });
      throw e;
    }
  }

  checkLimit(agentId, operation) {
    if (!this.enabled) {return true;}
    return this.limits.check(agentId, operation);
  }

  getStats() {
    return {
      permissions: this.permission.permissions.size,
      auditEntries: this.audit.entries.length,
      blockedAgents: this.limits.blocked.size,
      enabled: this.enabled
    };
  }
}

module.exports = SecurityManager;