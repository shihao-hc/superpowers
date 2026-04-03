/**
 * SecureErrorHandler - 安全错误处理服务
 * 提供错误分类、敏感信息过滤、日志记录、安全响应
 */

class SecureErrorHandler {
  constructor() {
    // 错误分类
    this.errorTypes = {
      VALIDATION: { code: 'VALIDATION_ERROR', status: 400, expose: false },
      AUTHENTICATION: { code: 'AUTH_ERROR', status: 401, expose: false },
      AUTHORIZATION: { code: 'AUTHZ_ERROR', status: 403, expose: false },
      NOT_FOUND: { code: 'NOT_FOUND', status: 404, expose: true },
      RATE_LIMIT: { code: 'RATE_LIMIT', status: 429, expose: true },
      INTERNAL: { code: 'INTERNAL_ERROR', status: 500, expose: false },
      EXTERNAL: { code: 'EXTERNAL_ERROR', status: 502, expose: true },
      SERVICE_UNAVAILABLE: { code: 'SERVICE_UNAVAILABLE', status: 503, expose: true }
    };
    
    // 敏感字段
    this.sensitiveFields = new Set([
      'password', 'secret', 'token', 'key', 'apiKey', 'apikey',
      'authorization', 'cookie', 'session', 'credential',
      'privateKey', 'publicKey', 'cert', 'signature',
      'ssn', 'creditCard', 'cardNumber', 'cvv'
    ]);
    
    // 错误日志
    this.errorLog = [];
    this.maxLogSize = 1000;
  }
  
  // 处理错误
  handle(error, context = {}) {
    const errorInfo = this.classifyError(error);
    
    // 构建安全响应
    const response = {
      success: false,
      error: {
        code: errorInfo.code,
        message: errorInfo.expose ? error.message : errorInfo.message,
        ...(process.env.NODE_ENV === 'development' && { details: error.stack })
      },
      requestId: context.requestId || this.generateRequestId(),
      timestamp: new Date().toISOString()
    };
    
    // 记录错误
    this.logError(error, context, errorInfo);
    
    return {
      status: errorInfo.status,
      body: response
    };
  }
  
  // 分类错误
  classifyError(error) {
    const type = error.type || 'INTERNAL';
    const errorType = this.errorTypes[type] || this.errorTypes.INTERNAL;
    
    return {
      ...errorType,
      type
    };
  }
  
  // 过滤敏感数据
  filterSensitiveData(data, depth = 0) {
    if (depth > 5) return '[Max Depth]';
    
    if (data === null || data === undefined) return data;
    
    if (typeof data === 'string') {
      return this.maskSensitiveValue(data);
    }
    
    if (typeof data === 'object') {
      const filtered = {};
      for (const [key, value] of Object.entries(data)) {
        if (this.isSensitiveField(key)) {
          filtered[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
          filtered[key] = this.filterSensitiveData(value, depth + 1);
        } else {
          filtered[key] = value;
        }
      }
      return filtered;
    }
    
    return data;
  }
  
  // 检查敏感字段
  isSensitiveField(field) {
    const lower = field.toLowerCase();
    return this.sensitiveFields.has(lower) || 
           this.sensitiveFields.has(field) ||
           lower.includes('secret') ||
           lower.includes('password');
  }
  
  // 脱敏敏感值
  maskSensitiveValue(value) {
    if (typeof value !== 'string') return value;
    
    if (value.length <= 4) return '****';
    
    return value.substring(0, 2) + '*'.repeat(Math.min(value.length - 4, 20)) + value.substring(value.length - 2);
  }
  
  // 记录错误
  logError(error, context, errorInfo) {
    const logEntry = {
      id: this.generateRequestId(),
      timestamp: new Date().toISOString(),
      type: errorInfo.type,
      code: errorInfo.code,
      message: error.message,
      userId: context.userId || null,
      path: context.path || null,
      method: context.method || null,
      userAgent: context.userAgent || null,
      ip: this.maskIP(context.ip),
      stack: process.env.NODE_ENV === 'development' ? error.stack : null
    };
    
    this.errorLog.push(logEntry);
    
    // 限制日志大小
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }
    
    // 控制台输出
    const level = errorInfo.status >= 500 ? 'error' : 'warn';
    console[level](`[SecureError] ${errorInfo.code}: ${error.message}`);
  }
  
  // 脱敏 IP
  maskIP(ip) {
    if (!ip) return null;
    
    // IPv4 脱敏
    if (ip.includes('.')) {
      const parts = ip.split('.');
      return `${parts[0]}.xxx.xxx.${parts[3]}`;
    }
    
    // IPv6 简略
    if (ip.includes(':')) {
      return ip.substring(0, 8) + '...';
    }
    
    return 'xxx.xxx.xxx.xxx';
  }
  
  // 生成请求 ID
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // 获取错误日志
  getErrorLog(filter = {}) {
    let logs = [...this.errorLog];
    
    if (filter.type) {
      logs = logs.filter(l => l.type === filter.type);
    }
    
    if (filter.since) {
      logs = logs.filter(l => new Date(l.timestamp) > new Date(filter.since));
    }
    
    return logs;
  }
  
  // 获取错误统计
  getErrorStats() {
    const stats = {};
    
    for (const entry of this.errorLog) {
      stats[entry.type] = (stats[entry.type] || 0) + 1;
    }
    
    return stats;
  }
  
  // 创建错误中间件
  createMiddleware() {
    return (err, req, res, next) => {
      const { status, body } = this.handle(err, {
        requestId: req.id,
        userId: req.user?.id,
        path: req.path,
        method: req.method,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      });
      
      res.status(status).json(body);
    };
  }
  
  // 自定义错误类
  createError(type, message, details = {}) {
    const error = new Error(message);
    error.type = type;
    error.details = details;
    return error;
  }
}

// 预定义错误类型
const errors = {
  ValidationError: (message, details) => ({ type: 'VALIDATION', message, details }),
  AuthenticationError: (message) => ({ type: 'AUTHENTICATION', message }),
  AuthorizationError: (message) => ({ type: 'AUTHORIZATION', message }),
  NotFoundError: (resource) => ({ type: 'NOT_FOUND', message: `${resource} not found` }),
  RateLimitError: (message = 'Rate limit exceeded') => ({ type: 'RATE_LIMIT', message }),
  InternalError: (message) => ({ type: 'INTERNAL', message }),
  ExternalError: (message) => ({ type: 'EXTERNAL', message })
};

const errorHandler = new SecureErrorHandler();

module.exports = { SecureErrorHandler, errorHandler, errors };