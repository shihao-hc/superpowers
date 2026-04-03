/**
 * Rate Limiting Middleware
 * 防止API滥用，保护系统安全
 */

const crypto = require('crypto');

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.maxRequests = options.maxRequests || 100;
    this.message = options.message || 'Too many requests, please try again later.';
    this.statusCode = options.statusCode || 429;
    this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;
    this.keyGenerator = options.keyGenerator || this._defaultKeyGenerator;
    
    // 使用内存存储（生产环境应使用Redis）
    this.store = new Map();
    
    // 清理过期记录的定时器
    this.cleanupInterval = setInterval(() => {
      this._cleanup();
    }, this.windowMs);
    
    // 防止定时器阻止进程退出
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * 默认key生成器 - 使用IP地址
   */
  _defaultKeyGenerator(req) {
    return req.ip || req.connection.remoteAddress || 'unknown';
  }

  /**
   * 清理过期记录
   */
  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.resetTime > this.windowMs) {
        this.store.delete(key);
      }
    }
  }

  /**
   * 获取客户端的请求记录
   */
  _getClient(key) {
    const now = Date.now();
    let client = this.store.get(key);
    
    if (!client || now - client.resetTime >= this.windowMs) {
      client = {
        count: 0,
        resetTime: now
      };
      this.store.set(key, client);
    }
    
    return client;
  }

  /**
   * 检查是否超出限制
   */
  check(key) {
    const client = this._getClient(key);
    const remaining = Math.max(0, this.maxRequests - client.count);
    const resetTime = client.resetTime + this.windowMs;
    
    return {
      allowed: client.count < this.maxRequests,
      remaining,
      resetTime,
      total: this.maxRequests
    };
  }

  /**
   * 记录请求
   */
  increment(key) {
    const client = this._getClient(key);
    client.count++;
    return this.check(key);
  }

  /**
   * Express中间件
   */
  middleware() {
    return (req, res, next) => {
      const key = this.keyGenerator(req);
      const result = this.check(key);
      
      // 设置响应头
      res.setHeader('X-RateLimit-Limit', result.total);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));
      
      if (!result.allowed) {
        return res.status(this.statusCode).json({
          error: this.message,
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
        });
      }
      
      // 记录请求
      this.increment(key);
      
      // 如果跳过成功请求，监听响应完成事件
      if (this.skipSuccessfulRequests) {
        const originalEnd = res.end;
        res.end = function(...args) {
          if (res.statusCode < 400) {
            // 成功响应，减少计数
            const client = this._getClient(key);
            if (client.count > 0) client.count--;
          }
          return originalEnd.apply(res, args);
        }.bind(this);
      }
      
      next();
    };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalClients: this.store.size,
      windowMs: this.windowMs,
      maxRequests: this.maxRequests
    };
  }

  /**
   * 重置指定key的计数
   */
  reset(key) {
    this.store.delete(key);
  }

  /**
   * 重置所有计数
   */
  resetAll() {
    this.store.clear();
  }

  /**
   * 停止清理定时器
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * 创建不同类型的限流器
 */
function createRateLimiters() {
  // 通用API限流器 - 每分钟100次请求
  const generalLimiter = new RateLimiter({
    windowMs: 60000,
    maxRequests: 100,
    message: '请求过于频繁，请稍后再试'
  });

  // 严格限流器 - 每分钟10次请求（用于敏感操作）
  const strictLimiter = new RateLimiter({
    windowMs: 60000,
    maxRequests: 10,
    message: '敏感操作请求过于频繁，请稍后再试'
  });

  // 登录限流器 - 每15分钟5次尝试
  const loginLimiter = new RateLimiter({
    windowMs: 900000, // 15 minutes
    maxRequests: 5,
    message: '登录尝试次数过多，请15分钟后再试',
    skipSuccessfulRequests: true
  });

  // 上传限流器 - 每小时10次
  const uploadLimiter = new RateLimiter({
    windowMs: 3600000, // 1 hour
    maxRequests: 10,
    message: '上传次数过于频繁，请稍后再试'
  });

  // 导出限流器 - 每小时20次
  const exportLimiter = new RateLimiter({
    windowMs: 3600000, // 1 hour
    maxRequests: 20,
    message: '导出次数过于频繁，请稍后再试'
  });

  return {
    general: generalLimiter,
    strict: strictLimiter,
    login: loginLimiter,
    upload: uploadLimiter,
    export: exportLimiter
  };
}

module.exports = { RateLimiter, createRateLimiters };
