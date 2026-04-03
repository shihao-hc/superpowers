class SecurityMiddleware {
  constructor(options = {}) {
    this.blockedIPs = new Set();
    this.suspiciousAttempts = new Map();
    this.maxAttempts = options.maxAttempts || 10;
    this.blockDuration = options.blockDuration || 3600000;
    this.auditLog = [];
    this.maxAuditLog = options.maxAuditLog || 1000;
    this.onBlock = options.onBlock || (() => {});
    this._cleanupTimer = null;
  }

  start() {
    this._cleanupTimer = setInterval(() => {
      this._cleanup();
    }, 60000);
  }

  stop() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  blockIP(ip, reason) {
    this.blockedIPs.add(ip);
    this.auditLog.push({
      type: 'ip_blocked',
      ip,
      reason,
      timestamp: Date.now()
    });
    this.onBlock({ ip, reason });
  }

  unblockIP(ip) {
    this.blockedIPs.delete(ip);
    this.suspiciousAttempts.delete(ip);
  }

  isBlocked(ip) {
    return this.blockedIPs.has(ip);
  }

  recordSuspicious(ip, action) {
    if (!this.suspiciousAttempts.has(ip)) {
      this.suspiciousAttempts.set(ip, {
        count: 0,
        actions: [],
        firstSeen: Date.now(),
        lastSeen: Date.now()
      });
    }

    const record = this.suspiciousAttempts.get(ip);
    record.count++;
    record.actions.push({ action, timestamp: Date.now() });
    record.lastSeen = Date.now();

    if (record.actions.length > 50) {
      record.actions = record.actions.slice(-25);
    }

    if (record.count >= this.maxAttempts) {
      this.blockIP(ip, `Too many suspicious attempts (${record.count})`);
      return true;
    }

    return false;
  }

  auditRequest(req, action, result) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    const entry = {
      type: 'request',
      ip,
      method: req.method,
      path: req.path,
      action,
      result,
      userAgent: req.headers?.['user-agent']?.substring(0, 200),
      timestamp: Date.now()
    };

    this.auditLog.push(entry);

    if (this.auditLog.length > this.maxAuditLog) {
      this.auditLog = this.auditLog.slice(-this.maxAuditLog / 2);
    }

    if (result === 'blocked' || result === 'rejected') {
      this.recordSuspicious(ip, action);
    }
  }

  wafMiddleware() {
    return (req, res, next) => {
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';

      if (this.isBlocked(ip)) {
        this.auditRequest(req, 'access', 'blocked');
        return res.status(403).json({ error: 'Access denied' });
      }

      const url = req.url || '';
      const suspiciousPatterns = [
        /\.\.\//,
        /\0/,
        /<script/i,
        /javascript:/i,
        /union\s+select/i,
        /\/etc\/passwd/i,
        /cmd\.exe/i
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(url)) {
          this.recordSuspicious(ip, `Suspicious URL: ${url.substring(0, 100)}`);
          this.auditRequest(req, 'waf_block', 'blocked');
          return res.status(403).json({ error: 'Forbidden' });
        }
      }

      next();
    };
  }

  authAuditMiddleware() {
    return (req, res, next) => {
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';
      const originalJson = res.json.bind(res);

      res.json = (data) => {
        if (res.statusCode === 401) {
          this.recordSuspicious(ip, 'Failed auth attempt');
          this.auditRequest(req, 'auth_failed', 'rejected');
        } else if (res.statusCode === 200 && req.path.includes('auth')) {
          this.auditRequest(req, 'auth_success', 'success');
        }
        return originalJson(data);
      };

      next();
    };
  }

  getAuditLog(options = {}) {
    let logs = [...this.auditLog];

    if (options.ip) {
      logs = logs.filter(l => l.ip === options.ip);
    }
    if (options.type) {
      logs = logs.filter(l => l.type === options.type);
    }
    if (options.since) {
      logs = logs.filter(l => l.timestamp >= options.since);
    }

    return logs.slice(-(options.limit || 50));
  }

  getBlockedIPs() {
    return Array.from(this.blockedIPs);
  }

  getSuspiciousIPs() {
    const result = [];
    for (const [ip, record] of this.suspiciousAttempts) {
      result.push({
        ip,
        count: record.count,
        firstSeen: record.firstSeen,
        lastSeen: record.lastSeen
      });
    }
    return result.sort((a, b) => b.count - a.count);
  }

  _cleanup() {
    const now = Date.now();

    for (const [ip, record] of this.suspiciousAttempts) {
      if (now - record.lastSeen > this.blockDuration) {
        this.suspiciousAttempts.delete(ip);
      }
    }
  }

  getStats() {
    return {
      blockedIPs: this.blockedIPs.size,
      suspiciousIPs: this.suspiciousAttempts.size,
      auditLogSize: this.auditLog.length
    };
  }

  destroy() {
    this.stop();
    this.blockedIPs.clear();
    this.suspiciousAttempts.clear();
    this.auditLog = [];
  }
}

module.exports = { SecurityMiddleware };
