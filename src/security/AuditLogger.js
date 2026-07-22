/**
 * Security Audit Logger
 * 审计日志 - 记录危险命令执行和安全事件
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { splitLines } = require('../utils/UltraWorkUtils');

const LOG_LEVELS = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL'
};

const AUDIT_EVENTS = {
  COMMAND_EXEC: 'COMMAND_EXEC',
  COMMAND_BLOCKED: 'COMMAND_BLOCKED',
  SHELL_INJECTION_DETECTED: 'SHELL_INJECTION_DETECTED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  AUTH_FAILURE: 'AUTH_FAILURE',
  SESSION_START: 'SESSION_START',
  SESSION_END: 'SESSION_END'
};

class AuditLogger {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(process.cwd(), '.opencode', 'logs');
    this.maxLogSize = options.maxLogSize || 10 * 1024 * 1024; // 10MB
    this.retentionDays = options.retentionDays || 30;
    this.enabled = options.enabled !== false;

    this.pendingLogs = [];
    this.flushInterval = null;
    this.sessionId = crypto.randomBytes(16).toString('hex');

    if (this.enabled) {
      this._ensureLogDir();
      this._startFlushInterval();
      this._cleanupOldLogs();
    }
  }

  _ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  _getLogFilePath() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `audit-${date}.json`);
  }

  _formatLog(entry) {
    return {
      ...entry,
      id: crypto.randomBytes(8).toString('hex'),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      hostname: require('os').hostname(),
      pid: process.pid
    };
  }

  _writeLog(entry) {
    if (!this.enabled) {return;}

    const formatted = this._formatLog(entry);
    this.pendingLogs.push(formatted);

    // 如果超过阈值，立即刷新
    if (this.pendingLogs.length >= 100) {
      this._flush();
    }
  }

  _startFlushInterval() {
    this.flushInterval = setInterval(() => {
      this._flush();
    }, 5000);
  }

  _flush() {
    if (this.pendingLogs.length === 0) {return;}

    const logs = this.pendingLogs.splice(0);
    const logFile = this._getLogFilePath();

    try {
      const content = `${logs.map((l) => JSON.stringify(l)).join('\n')}\n`;

      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > this.maxLogSize) {
          // 轮转日志
          const archivePath = logFile.replace('.json', `-${Date.now()}.json`);
          fs.renameSync(logFile, archivePath);
        }
      }

      fs.appendFileSync(logFile, content, 'utf8');
    } catch (error) {
      console.error('[AuditLogger] Failed to write logs:', error.message);
    }
  }

  _cleanupOldLogs() {
    const now = Date.now();
    const cutoff = now - (this.retentionDays * 24 * 60 * 60 * 1000);

    try {
      const files = fs.readdirSync(this.logDir);
      for (const file of files) {
        if (!file.startsWith('audit-')) {continue;}
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      console.warn('[AuditLogger] Cleanup failed:', error.message);
    }
  }

  // 记录命令执行
  logCommandExec(command, args, user, success, duration, metadata = {}) {
    this._writeLog({
      event: AUDIT_EVENTS.COMMAND_EXEC,
      level: success ? LOG_LEVELS.INFO : LOG_LEVELS.WARNING,
      command,
      args: args?.slice(0, 10), // 限制参数数量
      user,
      success,
      duration,
      blocked: false,
      ...metadata
    });
  }

  // 记录命令被阻止
  logCommandBlocked(command, reason, user, metadata = {}) {
    this._writeLog({
      event: AUDIT_EVENTS.COMMAND_BLOCKED,
      level: LOG_LEVELS.WARNING,
      command,
      reason,
      user,
      success: false,
      blocked: true,
      ...metadata
    });
  }

  // 记录 shell 注入检测
  logShellInjectionDetected(command, pattern, user, metadata = {}) {
    this._writeLog({
      event: AUDIT_EVENTS.SHELL_INJECTION_DETECTED,
      level: LOG_LEVELS.ERROR,
      command: command?.substring(0, 200),
      pattern,
      user,
      success: false,
      blocked: true,
      severity: 'HIGH',
      ...metadata
    });
  }

  // 记录权限拒绝
  logPermissionDenied(tool, user, reason, metadata = {}) {
    this._writeLog({
      event: AUDIT_EVENTS.PERMISSION_DENIED,
      level: LOG_LEVELS.WARNING,
      tool,
      user,
      reason,
      ...metadata
    });
  }

  // 记录速率限制
  logRateLimitExceeded(user, command, currentCount, limit, metadata = {}) {
    this._writeLog({
      event: AUDIT_EVENTS.RATE_LIMIT_EXCEEDED,
      level: LOG_LEVELS.WARNING,
      user,
      command,
      currentCount,
      limit,
      ...metadata
    });
  }

  // 记录认证失败
  logAuthFailure(user, reason, metadata = {}) {
    this._writeLog({
      event: AUDIT_EVENTS.AUTH_FAILURE,
      level: LOG_LEVELS.WARNING,
      user,
      reason,
      ...metadata
    });
  }

  // 记录会话开始
  logSessionStart(userId, metadata = {}) {
    this._writeLog({
      event: AUDIT_EVENTS.SESSION_START,
      level: LOG_LEVELS.INFO,
      userId,
      ...metadata
    });
  }

  // 记录会话结束
  logSessionEnd(userId, duration, metadata = {}) {
    this._writeLog({
      event: AUDIT_EVENTS.SESSION_END,
      level: LOG_LEVELS.INFO,
      userId,
      duration,
      ...metadata
    });
  }

  // 查询日志
  queryLogs(filter = {}) {
    const logs = [];
    const files = fs.readdirSync(this.logDir).filter((f) => f.startsWith('audit-'));

    for (const file of files) {
      const filePath = path.join(this.logDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = splitLines(content).filter((l) => l.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          // 应用过滤
          if (filter.event && entry.event !== filter.event) {continue;}
          if (filter.level && entry.level !== filter.level) {continue;}
          if (filter.user && entry.user !== filter.user) {continue;}
          if (filter.command && !entry.command?.includes(filter.command)) {continue;}
          if (filter.blocked !== undefined && entry.blocked !== filter.blocked) {continue;}

          if (filter.startTime && new Date(entry.timestamp) < filter.startTime) {continue;}
          if (filter.endTime && new Date(entry.timestamp) > filter.endTime) {continue;}

          logs.push(entry);
        } catch {
          // 忽略解析错误
        }
      }
    }

    return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // 获取统计摘要
  getStats(days = 7) {
    const logs = this.queryLogs({
      startTime: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    });

    const stats = {
      total: logs.length,
      byLevel: {},
      byEvent: {},
      blocked: logs.filter((l) => l.blocked).length,
      shellInjectionAttempts: logs.filter((l) => l.event === AUDIT_EVENTS.SHELL_INJECTION_DETECTED).length
    };

    for (const log of logs) {
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
      stats.byEvent[log.event] = (stats.byEvent[log.event] || 0) + 1;
    }

    return stats;
  }

  // 关闭审计日志
  shutdown() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this._flush();
  }
}

// 全局审计日志实例
let globalAuditLogger = null;

function getAuditLogger(options) {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger(options);
  }
  return globalAuditLogger;
}

module.exports = {
  AuditLogger,
  getAuditLogger,
  AUDIT_EVENTS,
  LOG_LEVELS
};
