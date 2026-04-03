const crypto = require('crypto');

class StructuredLogger {
  constructor(options = {}) {
    this.service = options.service || 'ultrawork';
    this.level = options.level || 'info';
    this.output = options.output || 'console';
    this.levels = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
    this.logs = [];
    this.maxLogs = options.maxLogs || 10000;
    this._buffer = [];
    this._flushInterval = options.flushInterval || 1000;
    this._timer = null;
  }

  start() {
    if (this.output === 'buffer' && !this._timer) {
      this._timer = setInterval(() => this._flush(), this._flushInterval);
    }
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      this._flush();
    }
  }

  _shouldLog(level) {
    return this.levels[level] <= this.levels[this.level];
  }

  _createEntry(level, message, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      traceId: data.traceId || crypto.randomBytes(8).toString('hex'),
      pid: process.pid,
      ...data
    };

    delete entry.traceId;
    if (data.traceId) entry.traceId = data.traceId;

    return entry;
  }

  _output(entry) {
    const line = JSON.stringify(entry);

    switch (this.output) {
      case 'console':
        if (entry.level === 'error') {
          console.error(line);
        } else if (entry.level === 'warn') {
          console.warn(line);
        } else {
          console.log(line);
        }
        break;

      case 'buffer':
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) {
          this.logs = this.logs.slice(-this.maxLogs / 2);
        }
        break;

      default:
        console.log(line);
    }
  }

  _flush() {
    if (this._buffer.length === 0) return;
    this._buffer = [];
  }

  error(message, data = {}) {
    if (!this._shouldLog('error')) return;
    
    const safeData = { ...data };
    if (safeData.stack) {
      safeData.stack = safeData.stack
        .replace(/\/Users\/[^/]+/g, '/[user]')
        .replace(/\/home\/[^/]+/g, '/[user]')
        .replace(/\\\\Users\\\\[^\\]+/g, '\\\\[user]');
    }
    delete safeData.password;
    delete safeData.token;
    delete safeData.secret;
    delete safeData.apiKey;
    
    this._output(this._createEntry('error', message, safeData));
  }

  warn(message, data = {}) {
    if (!this._shouldLog('warn')) return;
    this._output(this._createEntry('warn', message, data));
  }

  info(message, data = {}) {
    if (!this._shouldLog('info')) return;
    this._output(this._createEntry('info', message, data));
  }

  debug(message, data = {}) {
    if (!this._shouldLog('debug')) return;
    this._output(this._createEntry('debug', message, data));
  }

  trace(message, data = {}) {
    if (!this._shouldLog('trace')) return;
    this._output(this._createEntry('trace', message, data));
  }

  request(req, res, duration) {
    this.info('HTTP Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.headers?.['user-agent']?.substring(0, 100)
    });
  }

  workflow(workflowId, event, data = {}) {
    this.info('Workflow Event', {
      workflowId,
      event,
      ...data
    });
  }

  agent(agentId, event, data = {}) {
    this.info('Agent Event', {
      agentId,
      event,
      ...data
    });
  }

  security(event, data = {}) {
    this.warn('Security Event', {
      event,
      ...data
    });
  }

  getLogs(options = {}) {
    let logs = [...this.logs];

    if (options.level) {
      logs = logs.filter(l => l.level === options.level);
    }
    if (options.since) {
      logs = logs.filter(l => new Date(l.timestamp) >= new Date(options.since));
    }
    if (options.service) {
      logs = logs.filter(l => l.service === options.service);
    }

    return logs.slice(-(options.limit || 100));
  }

  getStats() {
    const levelCounts = {};
    for (const log of this.logs) {
      levelCounts[log.level] = (levelCounts[log.level] || 0) + 1;
    }

    return {
      total: this.logs.length,
      levelCounts,
      service: this.service,
      level: this.level
    };
  }

  destroy() {
    this.stop();
    this.logs = [];
    this._buffer = [];
  }
}

module.exports = { StructuredLogger };
