const { AdvancedRateLimiter } = require('../../src/security/AdvancedRateLimiter');

describe('AdvancedRateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new AdvancedRateLimiter({
      defaultLimit: 5,
      defaultWindow: 10000,
      blockDuration: 5000
    });
  });

  afterEach(() => {
    limiter.store.clear();
    limiter.slidingWindows.clear();
    limiter.blockedIPs.clear();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const l = new AdvancedRateLimiter();
      expect(l.defaultLimit).toBe(100);
      expect(l.defaultWindow).toBe(60000);
      expect(l.blockDuration).toBe(300000);
      expect(l.store instanceof Map).toBe(true);
      expect(l.slidingWindows instanceof Map).toBe(true);
      expect(l.blockedIPs instanceof Map).toBe(true);
    });

    it('should apply custom options', () => {
      expect(limiter.defaultLimit).toBe(5);
      expect(limiter.defaultWindow).toBe(10000);
      expect(limiter.blockDuration).toBe(5000);
    });
  });

  describe('checkFixedWindow', () => {
    it('should allow requests within limit', () => {
      const result = limiter.checkFixedWindow('user:1', 5, 10000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.blocked).toBe(false);
      expect(result.resetAt).toBeGreaterThan(Date.now());
    });

    it('should block when limit exceeded', () => {
      for (let i = 0; i < 5; i++) {
        limiter.checkFixedWindow('user:1', 5, 10000);
      }
      const result = limiter.checkFixedWindow('user:1', 5, 10000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.blocked).toBe(true);
    });

    it('should use different windows for different keys', () => {
      for (let i = 0; i < 10; i++) {
        limiter.checkFixedWindow('user:A', 5, 10000);
      }
      const resultB = limiter.checkFixedWindow('user:B', 5, 10000);
      expect(resultB.allowed).toBe(true);
      expect(resultB.remaining).toBe(4);
    });
  });

  describe('checkSlidingWindow', () => {
    it('should allow requests within limit', () => {
      const result = limiter.checkSlidingWindow('sliding:1', 5, 10000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.blocked).toBe(false);
    });

    it('should block when window full', () => {
      for (let i = 0; i < 5; i++) {
        limiter.checkSlidingWindow('sliding:1', 5, 10000);
      }
      const result = limiter.checkSlidingWindow('sliding:1', 5, 10000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe('checkTokenBucket', () => {
    it('should allow requests while tokens remain', () => {
      const result = limiter.checkTokenBucket('bucket:1', 5, 10);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it('should block when out of tokens', () => {
      for (let i = 0; i < 5; i++) {
        limiter.checkTokenBucket('bucket:1', 5, 10);
      }
      const result = limiter.checkTokenBucket('bucket:1', 5, 10);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should use default capacity and refill rate', () => {
      const result = limiter.checkTokenBucket('bucket:2');
      expect(result.allowed).toBe(true);
    });
  });

  describe('blockKey / isBlocked', () => {
    it('should block and unblock a key', () => {
      limiter.blockKey('bad-actor', 100);
      expect(limiter.isBlocked('bad-actor')).toBe(true);
    });

    it('should expire block after duration', () => {
      limiter.blockKey('bad-actor', -1);
      expect(limiter.isBlocked('bad-actor')).toBe(false);
    });

    it('should increment block count on repeat blocking', () => {
      limiter.blockKey('repeat-actor', 10000);
      limiter.blockKey('repeat-actor', 10000);
      const entry = limiter.blockedIPs.get('repeat-actor');
      expect(entry.count).toBe(2);
    });

    it('should return false for unknown key', () => {
      expect(limiter.isBlocked('unknown')).toBe(false);
    });
  });

  describe('check', () => {
    it('should use sliding window by default', () => {
      const result = limiter.check('test:1');
      expect(result.allowed).toBe(true);
    });

    it('should return blocked if key is blocked', () => {
      limiter.blockKey('blocked:1', 10000);
      const result = limiter.check('blocked:1');
      expect(result.allowed).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('Rate limit exceeded');
    });

    it('should use fixed window strategy', () => {
      const result = limiter.check('fixed:1', 'fixed', { limit: 3, window: 5000 });
      expect(result.allowed).toBe(true);
    });

    it('should use token bucket strategy', () => {
      const result = limiter.check('token:1', 'token', { capacity: 3, refillRate: 1 });
      expect(result.allowed).toBe(true);
    });

    it('should fall back to fixed window for unknown strategy', () => {
      const result = limiter.check('unknown:1', 'unknown');
      expect(result.allowed).toBe(true);
    });
  });

  describe('createMiddleware', () => {
    it('should return a middleware function', () => {
      const middleware = limiter.createMiddleware();
      expect(typeof middleware).toBe('function');
    });

    it('should call next() when allowed', () => {
      const middleware = limiter.createMiddleware();
      const req = { ip: '127.0.0.1' };
      const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.set).toHaveBeenCalled();
    });

    it('should return 429 when blocked', () => {
      limiter.blockKey('127.0.0.1', 10000);
      const middleware = limiter.createMiddleware();
      const req = { ip: '127.0.0.1' };
      const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return cooldown response when limited but not blocked', () => {
      jest.spyOn(limiter, 'check').mockReturnValue({
        allowed: false, blocked: false, remaining: 0, resetAt: Date.now() + 1000
      });
      const middleware = limiter.createMiddleware();
      const req = { ip: '127.0.0.1' };
      const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'RATE_LIMIT_REACHED'
      }));
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should clean expired fixed windows', () => {
      limiter.store.set('expired-key:0', { count: 5, resetAt: Date.now() - 1000 });
      const cleaned = limiter.cleanup();
      expect(cleaned).toBeGreaterThanOrEqual(1);
      expect(limiter.store.has('expired-key:0')).toBe(false);
    });

    it('should clean expired sliding windows', () => {
      limiter.slidingWindows.set('old-sliding', { requests: [Date.now() - 7200000] });
      const cleaned = limiter.cleanup();
      expect(cleaned).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty sliding windows during cleanup', () => {
      limiter.slidingWindows.set('empty', { requests: [] });
      const cleaned = limiter.cleanup();
      expect(cleaned).toBe(0);
    });

    it('should keep partially expired sliding windows', () => {
      const now = Date.now();
      limiter.slidingWindows.set('partial', {
        requests: [now - 7200000, now - 7200000, now - 1000]
      });
      const cleaned = limiter.cleanup();
      expect(cleaned).toBe(0);
      expect(limiter.slidingWindows.has('partial')).toBe(true);
    });

    it('should not clean active windows', () => {
      limiter.store.set('active-key:0', { count: 1, resetAt: Date.now() + 50000 });
      const cleaned = limiter.cleanup();
      const entry = limiter.store.get('active-key:0');
      expect(entry).toBeDefined();
      expect(cleaned).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return stats about current state', () => {
      const stats = limiter.getStats();
      expect(stats).toHaveProperty('fixedWindows');
      expect(stats).toHaveProperty('slidingWindows');
      expect(stats).toHaveProperty('blockedKeys');
      expect(typeof stats.fixedWindows).toBe('number');
      expect(typeof stats.slidingWindows).toBe('number');
      expect(typeof stats.blockedKeys).toBe('number');
    });

    it('should reflect created windows', () => {
      limiter.checkFixedWindow('stat:1');
      limiter.checkSlidingWindow('stat:2');
      const stats = limiter.getStats();
      expect(stats.fixedWindows).toBeGreaterThanOrEqual(1);
      expect(stats.slidingWindows).toBeGreaterThanOrEqual(1);
    });
  });
});
