/**
 * AdvancedRateLimiter - 高级速率限制服务
 * 支持滑动窗口、令牌桶、分布式限制、自定义策略
 */

const crypto = require('crypto');

class AdvancedRateLimiter {
  constructor(options = {}) {
    this.store = new Map();
    this.defaultLimit = options.defaultLimit || 100;
    this.defaultWindow = options.defaultWindow || 60000; // 1分钟
    this.blockDuration = options.blockDuration || 300000; // 5分钟
    
    // 滑动窗口配置
    this.slidingWindows = new Map();
    
    // IP 黑名单
    this.blockedIPs = new Set();
  }
  
  // 简单固定窗口
  checkFixedWindow(key, limit = this.defaultLimit, window = this.defaultWindow) {
    const now = Date.now();
    const windowKey = `${key}:${Math.floor(now / window)}`;
    
    const record = this.store.get(windowKey) || { count: 0, resetAt: now + window };
    
    record.count++;
    
    if (record.count > limit) {
      // 阻止请求
      this.blockKey(key);
      return { allowed: false, remaining: 0, resetAt: record.resetAt, blocked: true };
    }
    
    this.store.set(windowKey, record);
    
    return {
      allowed: true,
      remaining: Math.max(0, limit - record.count),
      resetAt: record.resetAt,
      blocked: false
    };
  }
  
  // 滑动窗口
  checkSlidingWindow(key, limit = this.defaultLimit, window = this.defaultWindow) {
    const now = Date.now();
    const windowStart = now - window;
    
    // 获取或创建滑动窗口
    let sliding = this.slidingWindows.get(key) || { requests: [] };
    
    // 清理过期请求
    sliding.requests = sliding.requests.filter(t => t > windowStart);
    
    // 检查限制
    if (sliding.requests.length >= limit) {
      const oldest = sliding.requests[0];
      const resetAt = oldest + window;
      
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        blocked: false
      };
    }
    
    // 添加新请求
    sliding.requests.push(now);
    this.slidingWindows.set(key, sliding);
    
    return {
      allowed: true,
      remaining: limit - sliding.requests.length,
      resetAt: now + window,
      blocked: false
    };
  }
  
  // 令牌桶
  checkTokenBucket(key, capacity = this.defaultLimit, refillRate = 1) {
    const now = Date.now();
    let bucket = this.store.get(key) || { tokens: capacity, lastRefill: now };
    
    // 计算补充的令牌
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(elapsed / 1000) * refillRate;
    bucket.tokens = Math.min(capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
    
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.store.set(key, bucket);
      
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetAt: now + (1000 / refillRate),
        blocked: false
      };
    }
    
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.lastRefill + (1000 / refillRate),
      blocked: false
    };
  }
  
  // 阻止 key
  blockKey(key, duration = this.blockDuration) {
    const blocked = this.blockedIPs.has(key) || { key, until: 0, count: 0 };
    blocked.until = Date.now() + duration;
    blocked.count++;
    this.blockedIPs.set(key, blocked);
  }
  
  // 检查是否被阻止
  isBlocked(key) {
    const blocked = this.blockedIPs.get(key);
    if (!blocked) return false;
    
    if (Date.now() > blocked.until) {
      this.blockedIPs.delete(key);
      return false;
    }
    
    return true;
  }
  
  // 自定义检查
  check(key, strategy = 'sliding', options = {}) {
    // 检查阻止
    if (this.isBlocked(key)) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + this.blockDuration,
        blocked: true,
        reason: 'Rate limit exceeded'
      };
    }
    
    switch (strategy) {
      case 'fixed':
        return this.checkFixedWindow(key, options.limit, options.window);
      case 'sliding':
        return this.checkSlidingWindow(key, options.limit, options.window);
      case 'token':
        return this.checkTokenBucket(key, options.capacity, options.refillRate);
      default:
        return this.checkFixedWindow(key, options.limit, options.window);
    }
  }
  
  // 创建 Express 中间件
  createMiddleware(options = {}) {
    const {
      strategy = 'sliding',
      limit = options.limit || 100,
      window = options.window || 60000,
      keyGenerator = (req) => req.ip,
      blockDuration = this.blockDuration
    } = options;
    
    return (req, res, next) => {
      const key = keyGenerator(req);
      const result = this.check(key, strategy, { limit, window });
      
      // 设置速率限制头
      res.set({
        'X-RateLimit-Limit': limit,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000)
      });
      
      if (!result.allowed) {
        if (result.blocked) {
          // 超出限制，阻止
          return res.status(429).json({
            error: 'Too many requests',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000)
          });
        }
        
        // 需要冷却
        return res.status(429).json({
          error: 'Rate limit reached, please slow down',
          code: 'RATE_LIMIT_REACHED',
          retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000)
        });
      }
      
      next();
    };
  }
  
  // 清理过期记录
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    // 清理固定窗口
    for (const [key, record] of this.store) {
      if (record.resetAt && now > record.resetAt) {
        this.store.delete(key);
        cleaned++;
      }
    }
    
    // 清理滑动窗口
    for (const [key, sliding] of this.slidingWindows) {
      if (sliding.requests.length > 0 && sliding.requests[0] < now - 3600000) {
        sliding.requests = sliding.requests.filter(t => t > now - 3600000);
        if (sliding.requests.length === 0) {
          this.slidingWindows.delete(key);
          cleaned++;
        }
      }
    }
    
    return cleaned;
  }
  
  // 获取统计
  getStats() {
    return {
      fixedWindows: this.store.size,
      slidingWindows: this.slidingWindows.size,
      blockedKeys: this.blockedIPs.size
    };
  }
}

const rateLimiter = new AdvancedRateLimiter();

module.exports = { AdvancedRateLimiter, rateLimiter };