/**
 * MCP Prometheus 指标端点
 * 包含用户角色审计、结构化日志、Prometheus 指标
 * 支持日志轮转、加密存储、缓存统计
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function createMCPMetricsHandler(mcpPlugin) {
  return (req, res) => {
    if (!mcpPlugin || !mcpPlugin.bridge) {
      res.status(503).send('# MCP not available\n');
      return;
    }

    const metrics = mcpPlugin.bridge.getMetrics();
    const status = mcpPlugin.getStatus();

    const lines = [];

    lines.push('# HELP mcp_calls_total Total number of MCP calls');
    lines.push('# TYPE mcp_calls_total counter');
    lines.push(`mcp_calls_total ${metrics.totalCalls}`);
    
    if (metrics.callsByServer) {
      for (const [server, data] of Object.entries(metrics.callsByServer)) {
        lines.push(`mcp_calls_total{server="${server}"} ${data.total}`);
      }
    }

    lines.push('');
    lines.push('# HELP mcp_calls_success_total Successful MCP calls');
    lines.push('# TYPE mcp_calls_success_total counter');
    lines.push(`mcp_calls_success_total ${metrics.successfulCalls}`);

    lines.push('');
    lines.push('# HELP mcp_calls_failed_total Failed MCP calls');
    lines.push('# TYPE mcp_calls_failed_total counter');
    lines.push(`mcp_calls_failed_total ${metrics.failedCalls}`);

    lines.push('');
    lines.push('# HELP mcp_servers_connected Number of connected MCP servers');
    lines.push('# TYPE mcp_servers_connected gauge');
    const connectedServers = status.servers ? 
      Object.values(status.servers).filter(s => s.connected).length : 0;
    lines.push(`mcp_servers_connected ${connectedServers}`);

    lines.push('');
    lines.push('# HELP mcp_tools_available Number of available MCP tools');
    lines.push('# TYPE mcp_tools_available gauge');
    lines.push(`mcp_tools_available ${status.tools || 0}`);

    lines.push('');
    lines.push('# HELP mcp_workflow_nodes Number of workflow nodes');
    lines.push('# TYPE mcp_workflow_nodes gauge');
    lines.push(`mcp_workflow_nodes ${status.nodes || 0}`);

    if (metrics.callsByRole) {
      lines.push('');
      lines.push('# HELP mcp_calls_by_role MCP calls grouped by user role');
      lines.push('# TYPE mcp_calls_by_role counter');
      for (const [role, count] of Object.entries(metrics.callsByRole)) {
        lines.push(`mcp_calls_by_role{role="${role}"} ${count}`);
      }
    }

    if (metrics.callsByTool) {
      lines.push('');
      lines.push('# HELP mcp_tool_usage_total Tool usage by specific tool');
      lines.push('# TYPE mcp_tool_usage_total counter');
      for (const [tool, count] of Object.entries(metrics.callsByTool)) {
        const safeTool = tool.replace(/[^a-zA-Z0-9_]/g, '_');
        lines.push(`mcp_tool_usage_total{tool="${safeTool}"} ${count}`);
      }
    }

    if (metrics.cacheStats) {
      lines.push('');
      lines.push('# HELP mcp_cache_hits_total Cache hits');
      lines.push('# TYPE mcp_cache_hits_total counter');
      lines.push(`mcp_cache_hits_total ${metrics.cacheStats.hits}`);

      lines.push('');
      lines.push('# HELP mcp_cache_misses_total Cache misses');
      lines.push('# TYPE mcp_cache_misses_total counter');
      lines.push(`mcp_cache_misses_total ${metrics.cacheStats.misses}`);

      lines.push('');
      lines.push('# HELP mcp_cache_size Current cache size');
      lines.push('# TYPE mcp_cache_size gauge');
      lines.push(`mcp_cache_size ${metrics.cacheStats.size}`);
    }

    lines.push('');
    lines.push('# HELP mcp_call_duration_seconds MCP call duration');
    lines.push('# TYPE mcp_call_duration_seconds histogram');
    lines.push('mcp_call_duration_seconds_bucket{le="0.1"} 0');
    lines.push('mcp_call_duration_seconds_bucket{le="0.5"} 0');
    lines.push('mcp_call_duration_seconds_bucket{le="1"} 0');
    lines.push('mcp_call_duration_seconds_bucket{le="+Inf"} 0');
    lines.push('mcp_call_duration_seconds_sum 0');
    lines.push('mcp_call_duration_seconds_count 0');

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(lines.join('\n'));
  };
}

class MCPAuditLogger {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 10000;
    this.entries = [];
    this.writeStream = null;
    this.enableFileLogging = options.enableFileLogging || false;
    this.logPath = options.logPath || 'logs/mcp-audit';
    this.rotationConfig = {
      enabled: options.rotationEnabled !== false,
      maxSize: options.maxFileSize || 10 * 1024 * 1024,
      maxAge: options.maxAge || 30 * 24 * 60 * 60 * 1000,
      maxFiles: options.maxFiles || 30,
      compress: options.compress || true
    };
    this.currentFileSize = 0;
    this.currentDate = this._getDateStr();
    this.encryptionKey = options.encryptionKey || null;
    this.enableEncryption = options.enableEncryption || false;
    
    if (this.enableFileLogging) {
      this._initFileLogging();
    }
    
    if (this.rotationConfig.enabled) {
      this._startRotationCheck();
    }
    
    if (this.enableEncryption && !this.encryptionKey) {
      this.encryptionKey = process.env.MCP_AUDIT_KEY || crypto.randomBytes(32).toString('hex');
      console.warn('[MCPAudit] Using auto-generated encryption key. Set MCP_AUDIT_KEY env var for persistence.');
    }
  }

  _getDateStr() {
    return new Date().toISOString().substring(0, 10);
  }

  _initFileLogging() {
    try {
      const fs = require('fs');
      const dir = path.dirname(this.logPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this._openNewLogFile();
    } catch (e) {
      console.warn('[MCPAudit] File logging disabled:', e.message);
      this.enableFileLogging = false;
    }
  }

  _openNewLogFile() {
    const dateStr = this._getDateStr();
    const logFile = `${this.logPath}-${dateStr}.jsonl`;
    
    try {
      if (this.writeStream) {
        this.writeStream.end();
      }
      
      const fs = require('fs');
      this.writeStream = fs.createWriteStream(logFile, { flags: 'a', encoding: 'utf8' });
      this.currentFileSize = 0;
      this.currentDate = dateStr;
      
      this.writeStream.on('error', (err) => {
        console.error('[MCPAudit] Write error:', err.message);
      });
      
      console.log(`[MCPAudit] Rotated to new log file: ${logFile}`);
    } catch (e) {
      console.warn('[MCPAudit] Failed to open log file:', e.message);
    }
  }

  _startRotationCheck() {
    this._rotationInterval = setInterval(() => {
      this._checkRotation();
    }, 60000);
  }

  _checkRotation() {
    const now = new Date();
    const dateStr = this._getDateStr();
    
    if (dateStr !== this.currentDate) {
      this._openNewLogFile();
    }
    
    if (this.currentFileSize >= this.rotationConfig.maxSize) {
      this._openNewLogFile();
    }
    
    this._cleanupOldFiles();
  }

  _cleanupOldFiles() {
    try {
      const fs = require('fs');
      const dir = path.dirname(this.logPath);
      const baseName = path.basename(this.logPath);
      
      if (!fs.existsSync(dir)) return;
      
      const files = fs.readdirSync(dir)
        .filter(f => f.startsWith(baseName) && f.endsWith('.jsonl'))
        .map(f => ({
          name: f,
          path: path.join(dir, f),
          mtime: fs.statSync(path.join(dir, f)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);
      
      const maxAge = Date.now() - this.rotationConfig.maxAge;
      
      for (let i = this.rotationConfig.maxFiles; i < files.length; i++) {
        fs.unlinkSync(files[i].path);
        console.log(`[MCPAudit] Deleted old log file: ${files[i].name}`);
      }
      
      for (const file of files) {
        if (file.mtime.getTime() < maxAge) {
          fs.unlinkSync(file.path);
          console.log(`[MCPAudit] Deleted expired log file: ${file.name}`);
        }
      }
    } catch (e) {
      console.warn('[MCPAudit] Cleanup error:', e.message);
    }
  }

  _encrypt(data) {
    if (!this.enableEncryption || !this.encryptionKey) return data;
    
    const iv = crypto.randomBytes(16);
    const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      iv: iv.toString('hex'),
      data: encrypted,
      tag: cipher.getAuthTag().toString('hex')
    };
  }

  _decrypt(record) {
    if (!record.iv || !record.data || !record.tag) return record;
    
    try {
      const iv = Buffer.from(record.iv, 'hex');
      const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      decipher.setAuthTag(Buffer.from(record.tag, 'hex'));
      
      let decrypted = decipher.update(record.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (e) {
      return record;
    }
  }

  log(callData) {
    const entry = {
      timestamp: Date.now(),
      iso: new Date().toISOString(),
      traceId: callData.traceId || this._generateTraceId(),
      toolFullName: callData.toolFullName,
      server: callData.server,
      tool: callData.tool,
      params: this._sanitizeParams(callData.params),
      user: {
        username: callData.username || 'anonymous',
        role: callData.role || 'unknown',
        ip: callData.ip || 'unknown'
      },
      result: {
        success: callData.success,
        duration: callData.duration,
        error: callData.error || null,
        cached: callData.cached || false
      },
      context: {
        source: callData.source || 'api',
        workflowId: callData.workflowId || null,
        nodeId: callData.nodeId || null
      }
    };

    this.entries.push(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries / 2);
    }

    if (this.writeStream) {
      try {
        const record = this.enableEncryption ? this._encrypt(entry) : entry;
        const line = JSON.stringify(record) + '\n';
        this.writeStream.write(line);
        this.currentFileSize += Buffer.byteLength(line, 'utf8');
      } catch (e) {
        console.warn('[MCPAudit] Write failed:', e.message);
      }
    }

    if (process.env.NODE_ENV === 'development' || process.env.MCP_DEBUG) {
      this._logStructured(entry);
    }

    return entry;
  }

  _generateTraceId() {
    return `mcp_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  _sanitizeParams(params) {
    if (!params) return {};
    const sanitized = {};
    const sensitive = ['password', 'token', 'secret', 'key', 'auth', 'credential', 'authorization'];
    
    for (const [key, value] of Object.entries(params)) {
      const lowerKey = key.toLowerCase();
      if (sensitive.some(s => lowerKey.includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 1000) {
        sanitized[key] = value.substring(0, 1000) + '...[truncated]';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  _logStructured(entry) {
    const logLevel = entry.result.success ? 'info' : 'error';
    const logEntry = {
      level: logLevel,
      msg: `MCP Call: ${entry.toolFullName}`,
      ...entry
    };
    
    if (logLevel === 'error') {
      console.error(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }

  getEntries(options = {}) {
    let entries = [...this.entries];
    
    if (options.since) {
      const sinceTs = typeof options.since === 'string' ? new Date(options.since).getTime() : options.since;
      entries = entries.filter(e => e.timestamp >= sinceTs);
    }
    
    if (options.until) {
      const untilTs = typeof options.until === 'string' ? new Date(options.until).getTime() : options.until;
      entries = entries.filter(e => e.timestamp <= untilTs);
    }
    
    if (options.toolFullName) {
      entries = entries.filter(e => e.toolFullName === options.toolFullName);
    }
    
    if (options.server) {
      entries = entries.filter(e => e.server === options.server);
    }
    
    if (options.role) {
      entries = entries.filter(e => e.user.role === options.role);
    }
    
    if (options.username) {
      entries = entries.filter(e => e.user.username === options.username);
    }
    
    if (options.success !== undefined) {
      entries = entries.filter(e => e.result.success === options.success);
    }
    
    if (options.traceId) {
      entries = entries.filter(e => e.traceId === options.traceId);
    }
    
    if (options.limit) {
      entries = entries.slice(-options.limit);
    }
    
    return entries;
  }

  getStats(options = {}) {
    const entries = options.since ? this.getEntries({ since: options.since }) : this.entries;
    
    const byRole = {};
    const byTool = {};
    const byServer = {};
    const byHour = {};
    let successCount = 0;
    let failedCount = 0;
    let totalDuration = 0;
    let cachedCount = 0;
    
    for (const entry of entries) {
      if (entry.result.success) {
        successCount++;
      } else {
        failedCount++;
      }
      
      if (entry.result.cached) {
        cachedCount++;
      }
      
      totalDuration += entry.result.duration || 0;
      
      byRole[entry.user.role] = (byRole[entry.user.role] || 0) + 1;
      byTool[entry.toolFullName] = (byTool[entry.toolFullName] || 0) + 1;
      byServer[entry.server] = (byServer[entry.server] || 0) + 1;
      
      const hour = new Date(entry.timestamp).toISOString().substring(0, 13);
      byHour[hour] = (byHour[hour] || 0) + 1;
    }
    
    return {
      total: entries.length,
      success: successCount,
      failed: failedCount,
      cached: cachedCount,
      cacheRate: entries.length > 0 ? ((cachedCount / entries.length) * 100).toFixed(2) + '%' : '0%',
      avgDuration: entries.length > 0 ? Math.round(totalDuration / entries.length) : 0,
      byRole,
      byTool,
      byServer,
      byHour,
      timeRange: {
        from: entries.length > 0 ? entries[0].iso : null,
        to: entries.length > 0 ? entries[entries.length - 1].iso : null
      }
    };
  }

  export(format = 'json', options = {}) {
    let entries = this.getEntries(options);
    
    if (format === 'csv') {
      const headers = ['timestamp', 'iso', 'traceId', 'toolFullName', 'server', 'user.role', 'user.username', 'result.success', 'result.duration', 'result.cached', 'result.error'];
      const rows = entries.map(e => [
        e.timestamp,
        e.iso,
        e.traceId,
        e.toolFullName,
        e.server,
        e.user.role,
        e.user.username,
        e.result.success,
        e.result.duration,
        e.result.cached || false,
        e.result.error || ''
      ].join(','));
      return [headers.join(','), ...rows].join('\n');
    }
    
    return JSON.stringify(entries, null, 2);
  }

  clear() {
    this.entries = [];
    return { success: true, message: 'Audit log cleared' };
  }

  destroy() {
    if (this._rotationInterval) {
      clearInterval(this._rotationInterval);
    }
    if (this.writeStream) {
      try {
        this.writeStream.end();
      } catch (e) {}
      this.writeStream = null;
    }
    this.entries = [];
  }
}

let globalAuditLogger = null;

function getMCPAuditLogger(options = {}) {
  if (!globalAuditLogger) {
    globalAuditLogger = new MCPAuditLogger({
      enableFileLogging: process.env.MCP_AUDIT_FILE_ENABLED === 'true',
      rotationEnabled: process.env.MCP_AUDIT_ROTATION !== 'false',
      maxFiles: parseInt(process.env.MCP_AUDIT_MAX_FILES || '30'),
      maxAge: parseInt(process.env.MCP_AUDIT_MAX_AGE || String(30 * 24 * 60 * 60 * 1000)),
      enableEncryption: process.env.MCP_AUDIT_ENCRYPT === 'true',
      encryptionKey: process.env.MCP_AUDIT_KEY,
      ...options
    });
  }
  return globalAuditLogger;
}

function logMCPCall(callData) {
  const logger = getMCPAuditLogger();
  return logger.log(callData);
}

function getMCPAuditStats(options = {}) {
  const logger = getMCPAuditLogger();
  return logger.getStats(options);
}

function getMCPAuditEntries(options = {}) {
  const logger = getMCPAuditLogger();
  return logger.getEntries(options);
}

module.exports = {
  createMCPMetricsHandler,
  MCPAuditLogger,
  getMCPAuditLogger,
  logMCPCall,
  getMCPAuditStats,
  getMCPAuditEntries
};
