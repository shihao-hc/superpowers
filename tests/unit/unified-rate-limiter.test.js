const { UnifiedRateLimiter, MemoryStore, RateLimitError, createRateLimiters } = require('../../src/rateLimiter/UnifiedRateLimiter');

describe('RateLimitError', () => {
  it('creates error with message and retryAfter', () => {
    const err = new RateLimitError('too fast', 30);
    expect(err.message).toBe('too fast');
    expect(err.retryAfter).toBe(30);
    expect(err.statusCode).toBe(429);
    expect(err.name).toBe('RateLimitError');
  });
});

describe('MemoryStore', () => {
  let store;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('set/get/delete operations', () => {
    store.set('key1', 'val1');
    expect(store.get('key1')).toBe('val1');
    store.delete('key1');
    expect(store.get('key1')).toBeUndefined();
  });

  it('clear removes all', () => {
    store.set('a', 1);
    store.set('b', 2);
    store.clear();
    expect(store.size).toBe(0);
  });

  it('entries yields all pairs', () => {
    store.set('x', 10);
    store.set('y', 20);
    const result = Array.from(store.entries());
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(['x', 10]);
  });

  it('size returns count', () => {
    store.set('a', 1);
    store.set('b', 2);
    expect(store.size).toBe(2);
  });
});

describe('UnifiedRateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new UnifiedRateLimiter({ defaultLimit: 5, defaultWindow: 10000, blockDuration: 5000 });
  });

  afterEach(() => {
    limiter.destroy();
  });

  describe('constructor', () => {
    it('sets default options', () => {
      const l = new UnifiedRateLimiter();
      expect(l.defaultLimit).toBe(100);
      expect(l.defaultWindow).toBe(60000);
      expect(l.blockDuration).toBe(300000);
      expect(l.keyPrefix).toBe('');
      expect(l.store).toBeInstanceOf(MemoryStore);
      l.destroy();
    });

    it('applies custom options', () => {
      expect(limiter.defaultLimit).toBe(5);
      expect(limiter.defaultWindow).toBe(10000);
      expect(limiter.blockDuration).toBe(5000);
    });

    it('creates cleanup interval', () => {
      expect(limiter.cleanupInterval).toBeDefined();
      expect(typeof limiter.cleanupInterval).toBe('object');
    });

    it('configures dangerous commands', () => {
      expect(limiter.dangerousCommands.bash.maxRequests).toBe(10);
      expect(limiter.dangerousCommands.exec.maxRequests).toBe(5);
    });

    it('handles setInterval without unref', () => {
      const spy = jest.spyOn(global, 'setInterval').mockReturnValue({});
      const l = new UnifiedRateLimiter();
      expect(l.cleanupInterval).toEqual({});
      l.destroy();
      spy.mockRestore();
    });
  });

  describe('_makeKey', () => {
    it('joins parts with colon', () => {
      const key = limiter._makeKey('fixed', 'user1', 'api');
      expect(key).toBe('fixed:user1:api');
    });

    it('includes prefix when set', () => {
      const l = new UnifiedRateLimiter({ keyPrefix: 'app:' });
      expect(l._makeKey('fixed', 'x')).toBe('app:fixed:x');
      l.destroy();
    });

    it('filters falsy parts', () => {
      const key = limiter._makeKey('fixed', null, 'api', undefined, 'v1');
      expect(key).toBe('fixed:api:v1');
    });
  });

  describe('_ttl', () => {
    it('returns future timestamp', () => {
      const ttl = limiter._ttl(10000);
      expect(ttl).toBeGreaterThan(Date.now());
      expect(ttl).toBeLessThan(Date.now() + 25000);
    });
  });

  describe('_cleanup', () => {
    it('removes expired entries', () => {
      limiter.store.set('old', { value: 1, _ttl: Date.now() - 1000 });
      limiter.store.set('fresh', { value: 2, _ttl: Date.now() + 60000 });
      limiter._cleanup();
      expect(limiter.store.get('old')).toBeUndefined();
      expect(limiter.store.get('fresh')).toBeDefined();
    });

    it('skips entries without _ttl', () => {
      limiter.store.set('no-ttl', { value: 1 });
      limiter._cleanup();
      expect(limiter.store.get('no-ttl')).toBeDefined();
    });
  });

  describe('blockKey / isBlocked', () => {
    it('blocks and detects blocked key', () => {
      limiter.blockKey('user1');
      expect(limiter.isBlocked('user1')).toBe(true);
    });

    it('allows non-blocked key', () => {
      expect(limiter.isBlocked('unknown')).toBe(false);
    });

    it('blocks with custom duration', () => {
      limiter.blockKey('user2', 100);
      expect(limiter.isBlocked('user2')).toBe(true);
    });

    it('auto-expires block', () => {
      limiter.blockKey('temp', -1000);
      expect(limiter.isBlocked('temp')).toBe(false);
    });

    it('increments block count', () => {
      limiter.blockKey('user');
      limiter.blockKey('user');
      const entry = limiter.store.get('blocked:user');
      expect(entry.count).toBe(2);
    });
  });

  describe('checkFixedWindow', () => {
    it('allows requests within limit', () => {
      const r = limiter.checkFixedWindow('api-key', 5, 10000);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4);
      expect(r.blocked).toBe(false);
    });

    it('blocks when limit exceeded', () => {
      for (let i = 0; i < 5; i++) {
        limiter.checkFixedWindow('api-key', 5, 10000);
      }
      const r = limiter.checkFixedWindow('api-key', 5, 10000);
      expect(r.allowed).toBe(false);
      expect(r.blocked).toBe(true);
    });

    it('uses default limit when not specified', () => {
      const l = new UnifiedRateLimiter({ defaultLimit: 3, defaultWindow: 10000 });
      for (let i = 0; i < 3; i++) {
        l.checkFixedWindow('key');
      }
      expect(l.checkFixedWindow('key').allowed).toBe(false);
      l.destroy();
    });

    it('respects separate keys independently', () => {
      for (let i = 0; i < 5; i++) {
        limiter.checkFixedWindow('key-a', 5, 10000);
      }
      expect(limiter.checkFixedWindow('key-a', 5, 10000).allowed).toBe(false);
      expect(limiter.checkFixedWindow('key-b', 5, 10000).allowed).toBe(true);
    });

    it('returns resetAt timestamp', () => {
      const r = limiter.checkFixedWindow('k', 5, 10000);
      expect(r.resetAt).toBeGreaterThan(Date.now());
    });

    it('returns blocked for blocked key', () => {
      limiter.blockKey('blocked-fixed');
      const r = limiter.checkFixedWindow('blocked-fixed', 5, 10000);
      expect(r.allowed).toBe(false);
      expect(r.blocked).toBe(true);
    });
  });

  describe('checkSlidingWindow', () => {
    it('allows requests within limit', () => {
      const r = limiter.checkSlidingWindow('k', 5, 10000);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4);
    });

    it('blocks when limit reached', () => {
      for (let i = 0; i < 5; i++) {
        limiter.checkSlidingWindow('k', 5, 10000);
      }
      const r = limiter.checkSlidingWindow('k', 5, 10000);
      expect(r.allowed).toBe(false);
    });

    it('discards expired timestamps', () => {
      const slidingKey = 'sliding:k';
      limiter.store.set(slidingKey, { requests: [Date.now() - 20000, Date.now() - 15000] });
      const r = limiter.checkSlidingWindow('k', 5, 10000);
      expect(r.allowed).toBe(true);
    });

    it('returns resetAt from oldest request when blocked', () => {
      for (let i = 0; i < 5; i++) {
        limiter.checkSlidingWindow('k', 5, 10000);
      }
      const r = limiter.checkSlidingWindow('k', 5, 10000);
      expect(r.resetAt).toBeGreaterThan(Date.now());
    });

    it('returns blocked for blocked key', () => {
      limiter.blockKey('blocked-sliding');
      const r = limiter.checkSlidingWindow('blocked-sliding', 5, 10000);
      expect(r.allowed).toBe(false);
      expect(r.blocked).toBe(true);
    });
  });

  describe('checkTokenBucket', () => {
    it('allows request when tokens available', () => {
      const r = limiter.checkTokenBucket('k', 5, 1);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4);
    });

    it('denies when tokens exhausted', () => {
      for (let i = 0; i < 5; i++) {
        limiter.checkTokenBucket('k', 5, 1);
      }
      const r = limiter.checkTokenBucket('k', 5, 1);
      expect(r.allowed).toBe(false);
      expect(r.remaining).toBe(0);
    });

    it('refills tokens over time', () => {
      const bucketKey = 'token:k';
      limiter.store.set(bucketKey, { tokens: 0, lastRefill: Date.now() - 3000 });
      const r = limiter.checkTokenBucket('k', 5, 1);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBeGreaterThanOrEqual(0);
    });

    it('caps tokens at capacity', () => {
      const bucketKey = 'token:k';
      limiter.store.set(bucketKey, { tokens: 10, lastRefill: Date.now() - 5000 });
      const r = limiter.checkTokenBucket('k', 5, 1);
      expect(r.remaining).toBeLessThanOrEqual(4);
    });

    it('uses default capacity when not specified', () => {
      const l = new UnifiedRateLimiter({ defaultLimit: 3 });
      for (let i = 0; i < 3; i++) {
        l.checkTokenBucket('k');
      }
      const r = l.checkTokenBucket('k');
      expect(r.allowed).toBe(false);
      l.destroy();
    });

    it('returns blocked for blocked key', () => {
      limiter.blockKey('blocked-token');
      const r = limiter.checkTokenBucket('blocked-token', 5, 1);
      expect(r.allowed).toBe(false);
      expect(r.blocked).toBe(true);
    });
  });

  describe('checkCommand', () => {
    it('applies dangerous command limits', () => {
      for (let i = 0; i < 5; i++) {
        limiter.checkCommand('user1', 'exec');
      }
      const r = limiter.checkCommand('user1', 'exec');
      expect(r.allowed).toBe(false);
    });

    it('uses default limit for non-dangerous commands', () => {
      for (let i = 0; i < 5; i++) {
        limiter.checkCommand('user1', 'echo');
      }
      const r = limiter.checkCommand('user1', 'echo');
      expect(r.allowed).toBe(false);
    });

    it('is case insensitive', () => {
      expect(limiter.checkCommand('u', 'BASH').allowed).toBe(true);
    });

    it('handles anonymous user', () => {
      const r = limiter.checkCommand(null, 'ls');
      expect(r.allowed).toBe(true);
    });
  });

  describe('check (unified)', () => {
    it('uses sliding window by default', () => {
      const r = limiter.check('key');
      expect(r.allowed).toBe(true);
    });

    it('uses fixed window strategy', () => {
      const r = limiter.check('key', 'fixed', { limit: 5, window: 10000 });
      expect(r.allowed).toBe(true);
    });

    it('uses token bucket strategy', () => {
      const r = limiter.check('key', 'token', { capacity: 5, refillRate: 1 });
      expect(r.allowed).toBe(true);
    });

    it('falls back to fixed for unknown strategy', () => {
      const r = limiter.check('key', 'unknown', { limit: 5 });
      expect(r.allowed).toBe(true);
    });

    it('detects blocked keys', () => {
      limiter.blockKey('blocked-key');
      const r = limiter.check('blocked-key');
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('Rate limit exceeded');
    });
  });

  describe('reset', () => {
    it('clears blocked entry', () => {
      limiter.blockKey('user1');
      limiter.reset('user1');
      expect(limiter.isBlocked('user1')).toBe(false);
    });

    it('clears fixed window entry', () => {
      limiter.checkFixedWindow('user1', 5, 10000);
      limiter.reset('user1');
      expect(limiter.checkFixedWindow('user1', 5, 10000).remaining).toBe(4);
    });
  });

  describe('resetAll', () => {
    it('clears all data', () => {
      limiter.blockKey('u1');
      limiter.checkFixedWindow('u2', 5, 10000);
      limiter.resetAll();
      expect(limiter.store.size).toBe(0);
    });
  });

  describe('destroy', () => {
    it('clears interval and data', () => {
      limiter.destroy();
      expect(limiter.cleanupInterval).toBeNull();
      expect(limiter.store.size).toBe(0);
    });
  });

  describe('getStats', () => {
    it('returns current stats', () => {
      limiter.blockKey('u');
      const stats = limiter.getStats();
      expect(stats.totalKeys).toBe(1);
      expect(stats.defaultLimit).toBe(5);
      expect(stats.defaultWindow).toBe(10000);
      expect(stats.blockDuration).toBe(5000);
    });
  });

  describe('middleware', () => {
    it('returns middleware function', () => {
      const mw = limiter.middleware();
      expect(mw).toBeInstanceOf(Function);
      expect(mw.length).toBe(3);
    });

    it('sets rate limit headers and calls next when allowed', () => {
      const mw = limiter.middleware({ limit: 5, window: 10000 });
      const req = { ip: '127.0.0.1' };
      const res = { setHeader: jest.fn(), end: jest.fn() };
      const next = jest.fn();
      mw(req, res, next);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(Number));
      expect(next).toHaveBeenCalled();
    });

    it('returns 429 when rate limited', () => {
      limiter.blockKey('127.0.0.1');
      const mw = limiter.middleware({ strategy: 'fixed', limit: 5, window: 10000 });
      const req = { ip: '127.0.0.1' };
      const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(next).not.toHaveBeenCalled();
    });

    it('uses custom key generator', () => {
      const mw = limiter.middleware({ keyGenerator: (req) => req.customId });
      const req = { customId: 'custom-key' };
      const res = { setHeader: jest.fn(), end: jest.fn() };
      const next = jest.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('uses custom status code and message', () => {
      limiter.blockKey('127.0.0.1');
      const mw = limiter.middleware({ statusCode: 403, message: 'blocked' });
      const req = { ip: '127.0.0.1' };
      const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'blocked' }));
    });

    it('uses unknown for missing IP', () => {
      const mw = limiter.middleware();
      const req = { };
      const res = { setHeader: jest.fn(), end: jest.fn() };
      const next = jest.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('handles skipSuccessful option', () => {
      const mw = limiter.middleware({ skipSuccessful: true, strategy: 'fixed', limit: 5, window: 10000 });
      const req = { ip: '127.0.0.1' };
      const res = { setHeader: jest.fn(), statusCode: 200, end: jest.fn() };
      const next = jest.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('skipSuccessful removes rate limit data on success response', () => {
      const mw = limiter.middleware({ skipSuccessful: true, strategy: 'fixed', limit: 5, window: 10000 });
      const req = { ip: '127.0.0.1' };
      const res = { setHeader: jest.fn(), statusCode: 200, end: jest.fn() };
      const next = jest.fn();
      const deleteSpy = jest.spyOn(limiter.store, 'delete');
      mw(req, res, next);
      res.end();
      expect(deleteSpy).toHaveBeenCalled();
      deleteSpy.mockRestore();
    });

    it('skipSuccessful preserves rate limit data on error response', () => {
      const mw = limiter.middleware({ skipSuccessful: true, strategy: 'fixed', limit: 5, window: 10000 });
      const req = { ip: '127.0.0.1' };
      const res = { setHeader: jest.fn(), statusCode: 500, end: jest.fn() };
      const next = jest.fn();
      const deleteSpy = jest.spyOn(limiter.store, 'delete');
      mw(req, res, next);
      res.end();
      expect(deleteSpy).not.toHaveBeenCalled();
      deleteSpy.mockRestore();
    });

    it('uses fallback for missing resetAt in headers', () => {
      const spy = jest.spyOn(limiter, 'check').mockReturnValue({ allowed: true, remaining: 5 });
      const mw = limiter.middleware({ limit: 5, window: 10000 });
      const req = { ip: '127.0.0.1' };
      const res = { setHeader: jest.fn(), statusCode: 200, end: jest.fn() };
      const next = jest.fn();
      mw(req, res, next);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
      expect(next).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('uses fallback for missing resetAt in error response', () => {
      const spy = jest.spyOn(limiter, 'check').mockReturnValue({ allowed: false, remaining: 0 });
      const mw = limiter.middleware({ limit: 5, window: 10000 });
      const req = { ip: '127.0.0.1' };
      const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ retryAfter: expect.any(Number) })
      );
      spy.mockRestore();
    });
  });
});

describe('createRateLimiters', () => {
  it('returns five named limiters', () => {
    const limiters = createRateLimiters();
    expect(limiters.general).toBeInstanceOf(UnifiedRateLimiter);
    expect(limiters.strict).toBeInstanceOf(UnifiedRateLimiter);
    expect(limiters.login).toBeInstanceOf(UnifiedRateLimiter);
    expect(limiters.upload).toBeInstanceOf(UnifiedRateLimiter);
    expect(limiters.export).toBeInstanceOf(UnifiedRateLimiter);
    Object.values(limiters).forEach((l) => l.destroy());
  });

  it('applies correct defaults per limiter', () => {
    const limiters = createRateLimiters();
    expect(limiters.general.defaultLimit).toBe(100);
    expect(limiters.strict.defaultLimit).toBe(10);
    expect(limiters.login.defaultLimit).toBe(5);
    expect(limiters.upload.defaultLimit).toBe(10);
    expect(limiters.export.defaultLimit).toBe(20);
    Object.values(limiters).forEach((l) => l.destroy());
  });

  it('login has longer block duration', () => {
    const limiters = createRateLimiters();
    expect(limiters.login.blockDuration).toBe(900000);
    Object.values(limiters).forEach((l) => l.destroy());
  });
});
