/**
 * UltraWork AI 中间件模块
 */

const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const config = require('../config');

// Claude Code 风格的权限服务
const { PermissionService } = require('../../src/agent/PermissionService');
const permissionService = new PermissionService();

// ============ 认证中间件 ============

/**
 * JWT认证中间件
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: '未提供认证令牌',
      code: 'AUTH_REQUIRED'
    });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, config.get('security.jwtSecret'));
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: '令牌已过期',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    return res.status(401).json({ 
      error: '无效的令牌',
      code: 'INVALID_TOKEN'
    });
  }
}

/**
 * 可选认证中间件
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, config.get('security.jwtSecret'));
      req.user = decoded;
    } catch (error) {
      // Token无效但不阻止请求
    }
  }
  
  next();
}

/**
 * 生成JWT令牌
 */
function generateToken(payload, expiresIn = null) {
  return jwt.sign(
    payload,
    config.get('security.jwtSecret'),
    { expiresIn: expiresIn || config.get('security.jwtExpiresIn') }
  );
}

/**
 * 生成刷新令牌
 */
function generateRefreshToken(payload) {
  return jwt.sign(
    payload,
    config.get('security.jwtSecret'),
    { expiresIn: config.get('security.jwtRefreshExpiresIn') }
  );
}

// ============ 速率限制中间件 ============

/**
 * 通用速率限制
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = config.get('rateLimit.windowMs'),
    max = 100,
    message = '请求过于频繁，请稍后再试',
    keyGenerator = null
  } = options;
  
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyGenerator || ((req) => {
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) {
        return forwarded.split(',')[0].trim();
      }
      return req.ip;
    })
  });
}

// 预定义的速率限制器
const apiLimiter = createRateLimiter({ 
  max: config.get('rateLimit.max.api'),
  message: 'API请求过于频繁，请稍后再试'
});

const chatLimiter = createRateLimiter({ 
  max: config.get('rateLimit.max.chat'),
  message: '聊天请求过于频繁，请稍后再试'
});

const memoryLimiter = createRateLimiter({ 
  max: config.get('rateLimit.max.memory'),
  message: '记忆操作过于频繁，请稍后再试'
});

const authLimiter = createRateLimiter({ 
  max: config.get('rateLimit.max.auth'),
  message: '认证请求过于频繁，请稍后再试'
});

const sensitiveLimiter = createRateLimiter({ 
  max: config.get('rateLimit.max.sensitive'),
  message: '操作过于频繁，请稍后再试'
});

// ============ 错误处理中间件 ============

/**
 * 全局错误处理中间件
 */
function errorHandler(err, req, res, next) {
  // 记录错误
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  // 确定状态码
  const statusCode = err.statusCode || 500;
  
  // 返回错误响应
  res.status(statusCode).json({
    error: process.env.NODE_ENV === 'production' ? 
      '服务器内部错误' : 
      err.message,
    code: err.code || 'INTERNAL_ERROR'
  });
}

/**
 * 404处理中间件
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: '未找到请求的资源',
    path: req.path,
    method: req.method,
    code: 'NOT_FOUND'
  });
}

// ============ 请求日志中间件 ============

/**
 * 请求日志
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  
  // 记录请求
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  
  // 响应完成后记录
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    };
    
    // 慢请求警告
    if (duration > 1000) {
      console.warn('Slow request:', log);
    }
    
    // 错误请求警告
    if (res.statusCode >= 400) {
      console.warn('Error request:', log);
    }
  });
  
  next();
}

// ============ 安全中间件 ============

/**
 * API版本中间件
 */
function apiVersion(req, res, next) {
  res.setHeader('X-API-Version', 'v1');
  res.setHeader('X-Request-ID', Date.now().toString(36) + Math.random().toString(36).substr(2, 5));
  next();
}

/**
 * CORS中间件
 */
function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  const allowedOrigins = config.get('security.corsOrigins');
  
  if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
}

/**
 * 输入验证中间件
 */
function validateInput(schema) {
  return (req, res, next) => {
    // 简单的输入验证
    if (req.body && typeof req.body === 'object') {
      // 防止原型污染
      if (Object.prototype.hasOwnProperty.call(req.body, '__proto__') ||
          Object.prototype.hasOwnProperty.call(req.body, 'constructor') ||
          Object.prototype.hasOwnProperty.call(req.body, 'prototype')) {
        return res.status(400).json({ 
          error: '无效的输入数据',
          code: 'INVALID_INPUT'
        });
      }
    }
    
    next();
  };
}

// ============ 导出 ============

module.exports = {
  // 认证
  authMiddleware,
  optionalAuth,
  generateToken,
  generateRefreshToken,
  
  // 速率限制
  createRateLimiter,
  apiLimiter,
  chatLimiter,
  memoryLimiter,
  authLimiter,
  sensitiveLimiter,
  
  // 错误处理
  errorHandler,
  notFoundHandler,
  
  // 日志和安全
  requestLogger,
  apiVersion,
  corsMiddleware,
  validateInput,
  
  // Claude Code 权限服务
  permissionService
};