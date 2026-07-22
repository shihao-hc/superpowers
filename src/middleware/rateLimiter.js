const { UnifiedRateLimiter, createRateLimiters: _createRateLimiters } = require('../rateLimiter/UnifiedRateLimiter');

class LegacyRateLimiter extends UnifiedRateLimiter {
  constructor(options = {}) {
    super({
      defaultLimit: options.maxRequests || 100,
      defaultWindow: options.windowMs || 60000,
      keyPrefix: options.keyPrefix || ''
    });
    this.legacyMessage = options.message || 'Too many requests, please try again later.';
    this.legacyStatusCode = options.statusCode || 429;
    this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;
    this.legacyKeyGenerator = options.keyGenerator || this._defaultKeyGenerator;
    this._warnDeprecated();
  }

  _warnDeprecated() {
    if (!this._warned) {
      this._warned = true;
      if (process.env.NODE_ENV !== 'production') {
        process.emitWarning('[DEPRECATED] RateLimiter from src/middleware/rateLimiter.js is deprecated. Use UnifiedRateLimiter from src/rateLimiter/UnifiedRateLimiter.js instead.');
      }
    }
  }

  _defaultKeyGenerator(req) {
    return req.ip || req.connection?.remoteAddress || 'unknown';
  }

  check(key) {
    this._warnDeprecated();
    const client = this._getFixedWindowRecord(key);
    return {
      allowed: client.count < this.defaultLimit,
      remaining: Math.max(0, this.defaultLimit - client.count),
      resetTime: client.resetAt,
      total: this.defaultLimit
    };
  }

  increment(key) {
    this._warnDeprecated();
    const client = this._getFixedWindowRecord(key);
    client.count++;
    return this.check(key);
  }

  _getFixedWindowRecord(key) {
    const storeKey = `${this.keyPrefix}fixed:${key}:${Math.floor(Date.now() / this.defaultWindow)}`;
    let client = this.store.get(storeKey);
    if (!client) {
      client = { count: 0, resetAt: Date.now() + this.defaultWindow, _ttl: Date.now() + this.defaultWindow * 2 };
      this.store.set(storeKey, client);
    }
    return client;
  }

  middleware() {
    this._warnDeprecated();
    return (req, res, next) => {
      const key = this.legacyKeyGenerator(req);
      const result = this.check(key);

      res.setHeader('X-RateLimit-Limit', result.total);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

      if (!result.allowed) {
        return res.status(this.legacyStatusCode).json({
          error: this.legacyMessage,
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
        });
      }

      this.increment(key);

      if (this.skipSuccessfulRequests) {
        const originalEnd = res.end;
        res.end = function(...args) {
          if (res.statusCode < 400) {
            const storeKey = `${this.keyPrefix}fixed:${key}:${Math.floor(Date.now() / this.defaultWindow)}`;
            const client = this.store.get(storeKey);
            if (client && client.count > 0) {client.count--;}
          }
          return originalEnd.apply(res, args);
        }.bind(this);
      }

      next();
    };
  }
}

function createRateLimiters(options = {}) {
  const {
    generalLimit = 100,
    generalWindow = 60000,
    strictLimit = 10,
    strictWindow = 60000,
    loginLimit = 5,
    loginWindow = 900000,
    uploadLimit = 10,
    uploadWindow = 3600000,
    exportLimit = 20,
    exportWindow = 3600000
  } = options;

  return {
    general: new LegacyRateLimiter({
      maxRequests: generalLimit,
      windowMs: generalWindow,
      message: '请求过于频繁，请稍后再试'
    }),
    strict: new LegacyRateLimiter({
      maxRequests: strictLimit,
      windowMs: strictWindow,
      message: '敏感操作请求过于频繁，请稍后再试'
    }),
    login: new LegacyRateLimiter({
      maxRequests: loginLimit,
      windowMs: loginWindow,
      message: '登录尝试次数过多，请15分钟后再试',
      skipSuccessfulRequests: true
    }),
    upload: new LegacyRateLimiter({
      maxRequests: uploadLimit,
      windowMs: uploadWindow,
      message: '上传次数过于频繁，请稍后再试'
    }),
    export: new LegacyRateLimiter({
      maxRequests: exportLimit,
      windowMs: exportWindow,
      message: '导出次数过于频繁，请稍后再试'
    })
  };
}

module.exports = { RateLimiter: LegacyRateLimiter, createRateLimiters };
