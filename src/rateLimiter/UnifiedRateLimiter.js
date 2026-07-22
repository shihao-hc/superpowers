

class RateLimitError extends Error {
  constructor(message, retryAfter) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = 429;
    this.retryAfter = retryAfter;
  }
}

class MemoryStore {
  constructor() {
    this.data = new Map();
  }
  get(key) { return this.data.get(key); }
  set(key, value) { this.data.set(key, value); }
  delete(key) { this.data.delete(key); }
  clear() { this.data.clear(); }
  get size() { return this.data.size; }
  entries() { return this.data.entries(); }
}

class UnifiedRateLimiter {
  constructor(options = {}) {
    this.store = options.store || new MemoryStore();
    this.defaultLimit = options.defaultLimit || 100;
    this.defaultWindow = options.defaultWindow || 60000;
    this.blockDuration = options.blockDuration || 300000;
    this.keyPrefix = options.keyPrefix || '';

    this.dangerousCommands = {
      'bash': { maxRequests: 10, windowMs: 60000 },
      'exec': { maxRequests: 5, windowMs: 60000 },
      'npm': { maxRequests: 20, windowMs: 60000 },
      'git': { maxRequests: 30, windowMs: 60000 },
      'docker': { maxRequests: 10, windowMs: 60000 }
    };

    this.cleanupInterval = setInterval(() => this._cleanup(), 60000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  _makeKey(...parts) {
    return `${this.keyPrefix}${parts.filter(Boolean).join(':')}`;
  }

  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry._ttl && now > entry._ttl) {
        this.store.delete(key);
      }
    }
  }

  _ttl(windowMs) {
    return Date.now() + windowMs * 2;
  }

  isBlocked(key) {
    const block = this.store.get(this._makeKey('blocked', key));
    if (!block) { return false; }
    if (Date.now() > block.until) {
      this.store.delete(this._makeKey('blocked', key));
      return false;
    }
    return true;
  }

  blockKey(key, duration) {
    const dur = duration || this.blockDuration;
    const existing = this.store.get(this._makeKey('blocked', key));
    this.store.set(this._makeKey('blocked', key), {
      until: Date.now() + dur,
      count: (existing?.count || 0) + 1,
      _ttl: this._ttl(dur)
    });
  }

  checkFixedWindow(key, limit, windowMs) {
    limit = limit || this.defaultLimit;
    windowMs = windowMs || this.defaultWindow;

    if (this.isBlocked(key)) {
      return { allowed: false, remaining: 0, resetAt: Date.now() + this.blockDuration, blocked: true };
    }

    const windowKey = this._makeKey('fixed', key, Math.floor(Date.now() / windowMs));
    const record = this.store.get(windowKey) || { count: 0, resetAt: Date.now() + windowMs, _ttl: this._ttl(windowMs) };

    record.count++;

    if (record.count > limit) {
      this.blockKey(key);
      return { allowed: false, remaining: 0, resetAt: record.resetAt, blocked: true };
    }

    this.store.set(windowKey, record);
    return { allowed: true, remaining: Math.max(0, limit - record.count), resetAt: record.resetAt, blocked: false };
  }

  checkSlidingWindow(key, limit, windowMs) {
    limit = limit || this.defaultLimit;
    windowMs = windowMs || this.defaultWindow;

    if (this.isBlocked(key)) {
      return { allowed: false, remaining: 0, resetAt: Date.now() + this.blockDuration, blocked: true };
    }

    const slidingKey = this._makeKey('sliding', key);
    const now = Date.now();
    const windowStart = now - windowMs;
    const sliding = this.store.get(slidingKey) || { requests: [] };

    sliding.requests = sliding.requests.filter((t) => t > windowStart);

    if (sliding.requests.length >= limit) {
      const oldest = sliding.requests[0];
      return { allowed: false, remaining: 0, resetAt: oldest + windowMs, blocked: false };
    }

    sliding.requests.push(now);
    sliding._ttl = this._ttl(windowMs);
    this.store.set(slidingKey, sliding);

    return { allowed: true, remaining: limit - sliding.requests.length, resetAt: now + windowMs, blocked: false };
  }

  checkTokenBucket(key, capacity, refillRate) {
    capacity = capacity || this.defaultLimit;
    refillRate = refillRate || 1;

    if (this.isBlocked(key)) {
      return { allowed: false, remaining: 0, resetAt: Date.now() + this.blockDuration, blocked: true };
    }

    const bucketKey = this._makeKey('token', key);
    const now = Date.now();
    const bucket = this.store.get(bucketKey) || { tokens: capacity, lastRefill: now };

    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(elapsed / 1000) * refillRate;
    bucket.tokens = Math.min(capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      bucket._ttl = this._ttl(60000);
      this.store.set(bucketKey, bucket);
      return { allowed: true, remaining: Math.floor(bucket.tokens), resetAt: now + (1000 / refillRate), blocked: false };
    }

    return { allowed: false, remaining: 0, resetAt: bucket.lastRefill + (1000 / refillRate), blocked: false };
  }

  checkCommand(userId, command) {
    const cmd = command.toLowerCase();
    const limits = this.dangerousCommands[cmd] || { maxRequests: this.defaultLimit, windowMs: this.defaultWindow };
    const key = this._makeKey('cmd', userId || 'anon', cmd);
    return this.checkFixedWindow(key, limits.maxRequests, limits.windowMs);
  }

  check(key, strategy = 'sliding', options = {}) {
    if (this.isBlocked(key)) {
      return { allowed: false, remaining: 0, resetAt: Date.now() + this.blockDuration, blocked: true, reason: 'Rate limit exceeded' };
    }
    switch (strategy) {
    case 'fixed': return this.checkFixedWindow(key, options.limit, options.window);
    case 'sliding': return this.checkSlidingWindow(key, options.limit, options.window);
    case 'token': return this.checkTokenBucket(key, options.capacity, options.refillRate);
    default: return this.checkFixedWindow(key, options.limit, options.window);
    }
  }

  reset(key) {
    const patterns = [
      this._makeKey('blocked', key),
      this._makeKey('fixed', key),
      this._makeKey('sliding', key),
      this._makeKey('token', key)
    ];
    for (const [storeKey] of this.store.entries()) {
      for (const pattern of patterns) {
        if (storeKey === pattern || storeKey.startsWith(pattern + ':')) {
          this.store.delete(storeKey);
          break;
        }
      }
    }
  }

  resetAll() {
    this.store.clear();
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }

  getStats() {
    return {
      totalKeys: this.store.size,
      defaultLimit: this.defaultLimit,
      defaultWindow: this.defaultWindow,
      blockDuration: this.blockDuration
    };
  }

  middleware(options = {}) {
    const {
      strategy = 'sliding',
      limit = this.defaultLimit,
      window = this.defaultWindow,
      keyGenerator = (req) => req.ip || req.connection?.remoteAddress || 'unknown',
      statusCode = 429,
      message = 'Too many requests, please try again later.',
      skipSuccessful = false
    } = options;

    return (req, res, next) => {
      const key = keyGenerator(req);
      const result = this.check(key, strategy, { limit, window });

      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil((result.resetAt || Date.now() + window) / 1000));

      if (!result.allowed) {
        return res.status(statusCode).json({
          error: message,
          retryAfter: Math.ceil(((result.resetAt || Date.now() + window) - Date.now()) / 1000)
        });
      }

      if (skipSuccessful) {
        const originalEnd = res.end;
        res.end = function(...args) {
          if (res.statusCode < 400) {
            this.store.delete(this._makeKey('fixed', key, Math.floor(Date.now() / window)));
          }
          return originalEnd.apply(res, args);
        }.bind(this);
      }

      next();
    };
  }
}

function createRateLimiters() {
  const general = new UnifiedRateLimiter({
    defaultLimit: 100,
    defaultWindow: 60000
  });
  const strict = new UnifiedRateLimiter({
    defaultLimit: 10,
    defaultWindow: 60000
  });
  const login = new UnifiedRateLimiter({
    defaultLimit: 5,
    defaultWindow: 900000,
    blockDuration: 900000
  });
  const upload = new UnifiedRateLimiter({
    defaultLimit: 10,
    defaultWindow: 3600000
  });
  const exportLimiter = new UnifiedRateLimiter({
    defaultLimit: 20,
    defaultWindow: 3600000
  });

  return { general, strict, login, upload, export: exportLimiter };
}

module.exports = {
  UnifiedRateLimiter,
  MemoryStore,
  RateLimitError,
  createRateLimiters
};
