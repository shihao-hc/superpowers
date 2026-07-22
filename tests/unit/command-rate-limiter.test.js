const { RateLimiter, getRateLimiter } = require('../../src/security/CommandRateLimiter');

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new RateLimiter({ maxRequests: 5, windowMs: 10000 });
  });

  afterEach(() => {
    limiter.shutdown();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const l = new RateLimiter();
      expect(l.maxRequests).toBe(60);
      expect(l.windowMs).toBe(60000);
      expect(l.keyPrefix).toBe('cmd:');
      expect(l.enabled).toBe(true);
      expect(l.requests instanceof Map).toBe(true);
      expect(l.blocked instanceof Map).toBe(true);
      l.shutdown();
    });

    it('should apply custom options', () => {
      const l = new RateLimiter({ maxRequests: 10, windowMs: 30000, enabled: false });
      expect(l.maxRequests).toBe(10);
      expect(l.windowMs).toBe(30000);
      expect(l.enabled).toBe(false);
      l.shutdown();
    });

    it('should have dangerous commands configured', () => {
      expect(limiter.dangerousCommands.bash.maxRequests).toBe(10);
      expect(limiter.dangerousCommands.exec.maxRequests).toBe(5);
      expect(limiter.dangerousCommands.npm.maxRequests).toBe(20);
      expect(limiter.dangerousCommands.git.maxRequests).toBe(30);
      expect(limiter.dangerousCommands.docker.maxRequests).toBe(10);
    });
  });

  describe('_cleanup', () => {
    it('should remove expired request entries', () => {
      limiter.requests.set('old:key', { windowStart: Date.now() - 200000, count: 1 });
      limiter.requests.set('new:key', { windowStart: Date.now() - 1000, count: 1 });
      limiter._cleanup();
      expect(limiter.requests.has('old:key')).toBe(false);
      expect(limiter.requests.has('new:key')).toBe(true);
    });

    it('should remove expired blocked entries', () => {
      limiter.blocked.set('old:key', Date.now() - 1000);
      limiter.blocked.set('valid:key', Date.now() + 60000);
      limiter._cleanup();
      expect(limiter.blocked.has('old:key')).toBe(false);
      expect(limiter.blocked.has('valid:key')).toBe(true);
    });
  });

  describe('check', () => {
    it('should allow requests within limit', () => {
      const result = limiter.check('user1', 'ls');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.current).toBe(1);
      expect(result.limit).toBe(5);
      expect(result.resetMs).toBeGreaterThan(0);
    });

    it('should return remaining as Infinity when disabled', () => {
      limiter.enabled = false;
      const result = limiter.check('user1', 'ls');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(Infinity);
      expect(result.resetMs).toBe(0);
    });

    it('should block when limit exceeded', () => {
      for (let i = 0; i < 5; i++) {
        limiter.check('user1', 'ls');
      }
      const result = limiter.check('user1', 'ls');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('rate_limit_exceeded');
      expect(result.current).toBe(5);
      expect(result.limit).toBe(5);
    });

    it('should apply stricter limits for dangerous commands', () => {
      for (let i = 0; i < 5; i++) {
        limiter.check('user1', 'exec');
      }
      const result = limiter.check('user1', 'exec');
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(5);
    });

    it('should temporarily block after repeated violations', () => {
      for (let i = 0; i < 10; i++) {
        limiter.check('user2', 'ls');
      }
      const result = limiter.check('user2', 'ls');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('temporarily_blocked');
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.resetMs).toBeGreaterThan(0);
    });

    it('should use separate counters per user', () => {
      for (let i = 0; i < 5; i++) {
        limiter.check('userA', 'ls');
      }
      const resultA = limiter.check('userA', 'ls');
      expect(resultA.allowed).toBe(false);

      const resultB = limiter.check('userB', 'ls');
      expect(resultB.allowed).toBe(true);
    });

    it('should use separate counters per command', () => {
      for (let i = 0; i < 5; i++) {
        limiter.check('user1', 'ls');
      }
      const resultLs = limiter.check('user1', 'ls');
      expect(resultLs.allowed).toBe(false);

      const resultPs = limiter.check('user1', 'ps');
      expect(resultPs.allowed).toBe(true);
    });

    it('should handle anonymous userId (null/undefined)', () => {
      const r1 = limiter.check(null, 'ls');
      expect(r1.allowed).toBe(true);
      const r2 = limiter.check(undefined, 'ls');
      expect(r2.allowed).toBe(true); // same anon bucket: null/undefined both -> 'anon'
    });
  });

  describe('record / recordBlocked', () => {
    it('record should be a no-op', () => {
      expect(() => limiter.record('user1', 'ls')).not.toThrow();
    });

    it('recordBlocked should increment blocked count', () => {
      limiter.recordBlocked('user1', 'test-cmd', 'no_reason');
      const key = 'cmd:user1:test-cmd';
      const data = limiter.requests.get(key);
      expect(data.blockedCount).toBe(1);
    });

    it('should block for 10 minutes after 5 recordBlocked calls', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordBlocked('user1', 'spam', 'excessive');
      }
      const key = 'cmd:user1:spam';
      const blockedUntil = limiter.blocked.get(key);
      expect(blockedUntil).toBeGreaterThan(Date.now() + 590000);
    });
  });

  describe('getStatus', () => {
    it('should return empty status for new user', () => {
      const status = limiter.getStatus('new-user');
      expect(status.userId).toBe('new-user');
      expect(status.commands).toEqual({});
      expect(status.totalRemaining).toBe(0);
      expect(status.blocked).toBe(false);
    });

    it('should reflect usage data', () => {
      limiter.check('user1', 'ls');
      limiter.check('user1', 'ps');
      const status = limiter.getStatus('user1');
      expect(status.commands.ls).toBeDefined();
      expect(status.commands.ps).toBeDefined();
      expect(status.totalRemaining).toBeGreaterThan(0);
    });

    it('should detect blocked user', () => {
      for (let i = 0; i < 10; i++) {
        limiter.check('blocked-user', 'ls');
      }
      const status = limiter.getStatus('blocked-user');
      expect(status.blocked).toBe(true);
      expect(status.blockedUntil).toBeGreaterThan(Date.now());
    });
  });

  describe('reset', () => {
    it('should clear user data', () => {
      limiter.check('user1', 'ls');
      limiter.reset('user1');
      const status = limiter.getStatus('user1');
      expect(status.commands).toEqual({});
    });

    it('should not affect other users', () => {
      limiter.check('userA', 'ls');
      limiter.reset('userA');
      const result = limiter.check('userB', 'ls');
      expect(result.allowed).toBe(true);
    });

    it('should clear blocked entries for user', () => {
      for (let i = 0; i < 10; i++) {
        limiter.check('blocked-u', 'ls');
      }
      expect(limiter.getStatus('blocked-u').blocked).toBe(true);
      limiter.reset('blocked-u');
      expect(limiter.getStatus('blocked-u').blocked).toBe(false);
    });
  });

  describe('getRateLimiter', () => {
    it('should create and reuse singleton instance', () => {
      const a = getRateLimiter({ maxRequests: 10 });
      const b = getRateLimiter({ maxRequests: 20 });
      expect(a).toBeInstanceOf(RateLimiter);
      expect(b).toBe(a);
      expect(a.maxRequests).toBe(10);
      a.shutdown();
    });
  });

  describe('shutdown', () => {
    it('should clear all data', () => {
      limiter.check('user1', 'ls');
      limiter.shutdown();
      expect(limiter.requests.size).toBe(0);
      expect(limiter.blocked.size).toBe(0);
    });

    it('should not throw if called multiple times', () => {
      limiter.shutdown();
      expect(() => limiter.shutdown()).not.toThrow();
    });
  });

  describe('edge cases - branch coverage', () => {
    it('getStatus should skip other users entries', () => {
      limiter.check('user2', 'cat');
      limiter.check('user2', 'ls');
      const status = limiter.getStatus('user1');
      expect(status.commands).toEqual({});
      expect(status.totalRemaining).toBe(0);
    });

    it('getStatus should not detect other users as blocked', () => {
      limiter.blocked.set('cmd:user2:*', Date.now() + 60000);
      const status = limiter.getStatus('user1');
      expect(status.blocked).toBe(false);
    });

    it('reset should not delete other users request entries', () => {
      limiter.check('user1', 'ls');
      limiter.check('user2', 'cat');
      limiter.reset('user1');
      expect(limiter.requests.has('cmd:user2:cat')).toBe(true);
      expect(limiter.requests.has('cmd:user1:ls')).toBe(false);
    });

    it('reset should not delete other users blocked entries', () => {
      limiter.blocked.set('cmd:user2:*', Date.now() + 60000);
      limiter.reset('user1');
      expect(limiter.blocked.has('cmd:user2:*')).toBe(true);
    });
  });
});
