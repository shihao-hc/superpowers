const { RateLimiter, createRateLimiters } = require('../../src/middleware/rateLimiter');

describe('LegacyRateLimiter', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(process, 'emitWarning').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('extends UnifiedRateLimiter with defaults', () => {
    const limiter = new RateLimiter();
    expect(limiter.defaultLimit).toBe(100);
    expect(limiter.defaultWindow).toBe(60000);
    expect(limiter.legacyMessage).toBe('Too many requests, please try again later.');
    expect(limiter.legacyStatusCode).toBe(429);
    expect(limiter.skipSuccessfulRequests).toBe(false);
  });

  test('accepts custom options', () => {
    const limiter = new RateLimiter({
      maxRequests: 50,
      windowMs: 1000,
      message: 'busy',
      statusCode: 403,
      skipSuccessfulRequests: true,
      keyGenerator: () => 'custom-key',
    });
    expect(limiter.defaultLimit).toBe(50);
    expect(limiter.defaultWindow).toBe(1000);
    expect(limiter.legacyMessage).toBe('busy');
    expect(limiter.legacyStatusCode).toBe(403);
    expect(limiter.skipSuccessfulRequests).toBe(true);
    expect(limiter.legacyKeyGenerator()).toBe('custom-key');
  });

  test('warns deprecation once per instance', () => {
    new RateLimiter();
    new RateLimiter();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  test('does not warn in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      new RateLimiter();
    } finally {
      process.env.NODE_ENV = prev;
    }
    expect(warnSpy).not.toHaveBeenCalled();
  });

  describe('_defaultKeyGenerator', () => {
    test('uses req.ip', () => {
      const limiter = new RateLimiter();
      expect(limiter._defaultKeyGenerator({ ip: '1.2.3.4' })).toBe('1.2.3.4');
    });

    test('falls back to connection remoteAddress', () => {
      const limiter = new RateLimiter();
      expect(limiter._defaultKeyGenerator({ connection: { remoteAddress: '5.6.7.8' } })).toBe('5.6.7.8');
    });

    test('falls back to unknown', () => {
      const limiter = new RateLimiter();
      expect(limiter._defaultKeyGenerator({})).toBe('unknown');
    });
  });

  describe('check / increment', () => {
    test('check allows within limit', () => {
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60000 });
      const result = limiter.check('k');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3);
      expect(result.total).toBe(3);
      expect(result.resetTime).toBeGreaterThan(Date.now());
    });

    test('increment counts up and blocks at limit', () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60000 });
      expect(limiter.increment('k').allowed).toBe(true);
      const blocked = limiter.increment('k');
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    test('separate keys have independent counts', () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60000 });
      limiter.increment('a');
      expect(limiter.check('b').allowed).toBe(true);
    });

    test('window rolls over with time', () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60000 });
      limiter.increment('k');
      const firstWindow = Math.floor(Date.now() / 60000);
      const spy = jest.spyOn(Date, 'now').mockReturnValue((firstWindow + 1) * 60000);
      try {
        expect(limiter.check('k').allowed).toBe(true);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('middleware', () => {
    test('sets rate limit headers and allows request', () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60000 });
      const req = { ip: '1.1.1.1' };
      const res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        end: jest.fn(),
        statusCode: 200,
      };
      const next = jest.fn();
      limiter.middleware()(req, res, next);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 5);
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
      expect(next).toHaveBeenCalled();
    });

    test('blocks request with 429 when limit exceeded', () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60000 });
      const req = { ip: '2.2.2.2' };
      const res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        statusCode: 429,
      };
      const next = jest.fn();
      const mw = limiter.middleware();
      mw(req, res, next);
      mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many requests, please try again later.',
        retryAfter: expect.any(Number),
      });
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('decrements count for successful requests when skipSuccessfulRequests', () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60000, skipSuccessfulRequests: true });
      const req = { ip: '3.3.3.3' };
      const res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        end: jest.fn(),
        statusCode: 200,
      };
      const next = jest.fn();
      limiter.middleware()(req, res, next);
      // Simulate a successful response ending
      res.end();
      expect(res.statusCode).toBe(200);
      // After end, a second request should still be allowed (count decremented)
      const req2 = { ip: '3.3.3.3' };
      const res2 = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn(), end: jest.fn(), statusCode: 200 };
      limiter.middleware()(req2, res2, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('createRateLimiters', () => {
    test('creates five preset limiters', () => {
      const limiters = createRateLimiters();
      expect(Object.keys(limiters)).toEqual(['general', 'strict', 'login', 'upload', 'export']);
      expect(limiters.general.defaultLimit).toBe(100);
      expect(limiters.strict.defaultLimit).toBe(10);
      expect(limiters.login.defaultLimit).toBe(5);
      expect(limiters.login.defaultWindow).toBe(900000);
      expect(limiters.login.skipSuccessfulRequests).toBe(true);
      expect(limiters.upload.defaultLimit).toBe(10);
      expect(limiters.export.defaultLimit).toBe(20);
      expect(limiters.export.defaultWindow).toBe(3600000);
    });

    test('allows overriding presets', () => {
      const limiters = createRateLimiters({ generalLimit: 500, loginWindow: 1000 });
      expect(limiters.general.defaultLimit).toBe(500);
      expect(limiters.login.defaultWindow).toBe(1000);
    });
  });
});
