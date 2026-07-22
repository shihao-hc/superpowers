/**
 * Command Rate Limiter
 * 命令速率限制 - 防止资源滥用
 * @deprecated Use UnifiedRateLimiter.checkCommand() from src/rateLimiter/UnifiedRateLimiter.js instead.
 */

const _crypto = require('crypto');

class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 60; // 每窗口最大请求数
    this.windowMs = options.windowMs || 60000; // 窗口大小 (毫秒)
    this.keyPrefix = options.keyPrefix || 'cmd:';
    this.enabled = options.enabled !== false;

    this.requests = new Map();
    this.blocked = new Map();

    // 危险命令的特殊限制
    this.dangerousCommands = {
      'bash': { maxRequests: 10, windowMs: 60000 },
      'exec': { maxRequests: 5, windowMs: 60000 },
      'npm': { maxRequests: 20, windowMs: 60000 },
      'git': { maxRequests: 30, windowMs: 60000 },
      'docker': { maxRequests: 10, windowMs: 60000 }
    };

    // 清理过期记录
    this.cleanupInterval = setInterval(() => this._cleanup(), 60000);
  }

  _cleanup() {
    const now = Date.now();

    for (const [key, data] of this.requests.entries()) {
      if (now - data.windowStart > this.windowMs * 2) {
        this.requests.delete(key);
      }
    }

    for (const [key, expiry] of this.blocked.entries()) {
      if (now > expiry) {
        this.blocked.delete(key);
      }
    }
  }

  _getKey(userId, command) {
    return `${this.keyPrefix}${userId || 'anon'}:${command}`;
  }

  _getLimits(command) {
    const dangerous = this.dangerousCommands[command.toLowerCase()];
    if (dangerous) {
      return { maxRequests: dangerous.maxRequests, windowMs: dangerous.windowMs };
    }
    return { maxRequests: this.maxRequests, windowMs: this.windowMs };
  }

  // 检查是否允许请求
  check(userId, command) {
    if (!this.enabled) {
      return { allowed: true, remaining: Infinity, resetMs: 0 };
    }

    const key = this._getKey(userId, command);
    const limits = this._getLimits(command);
    const now = Date.now();

    // 检查是否被临时封禁
    const blockedUntil = this.blocked.get(key);
    if (blockedUntil && now < blockedUntil) {
      return {
        allowed: false,
        reason: 'temporarily_blocked',
        blockedUntil,
        resetMs: blockedUntil - now,
        retryAfter: Math.ceil((blockedUntil - now) / 1000)
      };
    }

    let data = this.requests.get(key);

    if (!data || now - data.windowStart > limits.windowMs) {
      // 新窗口
      data = {
        windowStart: now,
        count: 0,
        maxRequests: limits.maxRequests
      };
      this.requests.set(key, data);
    }

    if (data.count >= limits.maxRequests) {
      // 超过限制，封禁一段时间
      const blockDuration = Math.min(limits.windowMs, 30000); // 最多封禁30秒
      this.blocked.set(key, now + blockDuration);

      return {
        allowed: false,
        reason: 'rate_limit_exceeded',
        current: data.count,
        limit: limits.maxRequests,
        windowMs: limits.windowMs,
        blockedUntil: now + blockDuration,
        resetMs: blockDuration
      };
    }

    data.count++;

    return {
      allowed: true,
      remaining: limits.maxRequests - data.count,
      resetMs: limits.windowMs - (now - data.windowStart),
      current: data.count,
      limit: limits.maxRequests
    };
  }

  // 记录成功执行
  record(_userId, _command) {
    // 可以在这里记录成功执行以便将来分析
  }

  // 记录被阻止
  recordBlocked(userId, command, _reason) {
    const key = this._getKey(userId, command);
    const _limits = this._getLimits(command);

    // 连续被阻止多次后延长封禁时间
    const data = this.requests.get(key) || { blockedCount: 0 };
    data.blockedCount = (data.blockedCount || 0) + 1;

    if (data.blockedCount >= 5) {
      // 5次被阻止后封禁10分钟
      this.blocked.set(key, Date.now() + 600000);
      data.blockedCount = 0;
    }

    this.requests.set(key, data);
  }

  // 获取用户的所有限制状态
  getStatus(userId) {
    const status = {
      userId,
      commands: {},
      totalRemaining: 0,
      blocked: false
    };

    for (const [key, data] of this.requests.entries()) {
      if (!key.startsWith(`${this.keyPrefix}${userId}:`)) {continue;}

      const command = key.split(':')[2];
      const limits = this._getLimits(command);
      const now = Date.now();

      status.commands[command] = {
        current: data.count,
        limit: limits.maxRequests,
        remaining: Math.max(0, limits.maxRequests - data.count),
        windowMs: limits.windowMs,
        resetMs: Math.max(0, limits.windowMs - (now - data.windowStart))
      };

      status.totalRemaining += status.commands[command].remaining;
    }

    const _blockedKey = `${this.keyPrefix}${userId}:*`;
    for (const [key, blockedUntil] of this.blocked.entries()) {
      if (key.startsWith(`${this.keyPrefix}${userId}:`) && Date.now() < blockedUntil) {
        status.blocked = true;
        status.blockedUntil = blockedUntil;
        break;
      }
    }

    return status;
  }

  // 重置用户限制
  reset(userId) {
    for (const key of this.requests.keys()) {
      if (key.startsWith(`${this.keyPrefix}${userId}:`)) {
        this.requests.delete(key);
      }
    }

    for (const key of this.blocked.keys()) {
      if (key.startsWith(`${this.keyPrefix}${userId}:`)) {
        this.blocked.delete(key);
      }
    }
  }

  // 关闭
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.requests.clear();
    this.blocked.clear();
  }
}

// 全局限流器实例
let globalRateLimiter = null;

function getRateLimiter(options) {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter(options);
  }
  return globalRateLimiter;
}

module.exports = { RateLimiter, getRateLimiter };
