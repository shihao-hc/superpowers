const levels = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const currentLevel = levels[process.env.LOG_LEVEL?.toUpperCase()] ?? levels.INFO;

const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /key/i,
  /auth/i,
  /credential/i,
  /api[-_]?key/i,
  /bearer/i
];

const sanitize = (obj) => {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(obj)) {
        return '[REDACTED]';
      }
    }
    return obj;
  }
  
  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitize(value);
    }
    return sanitized;
  }
  
  return obj;
};

const formatMessage = (level, module, message, data) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    module,
    message,
    pid: process.pid
  };
  
  if (data !== undefined) {
    logEntry.data = sanitize(data);
  }
  
  return JSON.stringify(logEntry);
};

const createLogger = (moduleName) => {
  const log = (level, message, data) => {
    if (levels[level] <= currentLevel) {
      const formatted = formatMessage(level, moduleName, message, data);
      if (level === 'ERROR') {
        console.error(formatted);
      } else if (level === 'WARN') {
        console.warn(formatted);
      } else {
        console.log(formatted);
      }
    }
  };

  return {
    error: (message, data) => log('ERROR', message, data),
    warn: (message, data) => log('WARN', message, data),
    info: (message, data) => log('INFO', message, data),
    debug: (message, data) => log('DEBUG', message, data),
    audit: (action, user, details) => {
      if (levels.INFO <= currentLevel) {
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          type: 'AUDIT',
          action,
          user,
          details: sanitize(details),
          pid: process.pid
        }));
      }
    }
  };
};

module.exports = { createLogger, levels };
