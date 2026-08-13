const jwt = require('jsonwebtoken');

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('../../server/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
}));

const bcrypt = require('bcrypt');
const { error: errorLog, warn: warnLog } = require('../../server/utils/logger');

describe('middleware/auth', () => {
  let auth;
  const SECRET = 'test-secret-thirty-two-chars-min!!';

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = SECRET;
    auth = require('../../src/middleware/auth');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ROLES and PERMISSIONS', () => {
    test('defines all roles', () => {
      expect(auth.ROLES).toEqual({
        ADMIN: 'admin', DEVELOPER: 'developer', PUBLISHER: 'publisher',
        USER: 'user', GUEST: 'guest',
      });
    });

    test('admin has all permissions', () => {
      expect(auth.PERMISSIONS[auth.ROLES.ADMIN]).toContain('users:manage');
      expect(auth.PERMISSIONS[auth.ROLES.ADMIN]).toContain('skills:delete');
    });

    test('guest has read-only permissions', () => {
      const guest = auth.PERMISSIONS[auth.ROLES.GUEST];
      expect(guest).toEqual(['skills:read', 'templates:read']);
    });
  });

  describe('JWTManager', () => {
    let manager;
    beforeEach(() => {
      manager = new auth.JWTManager({ secret: SECRET });
    });

    test('constructor uses env defaults', () => {
      expect(manager.expiresIn).toBe(3600);
      expect(manager.refreshExpiresIn).toBe(86400 * 7);
      expect(manager.issuer).toBe('ultrawork-ai');
      expect(manager.algorithm).toBe('HS256');
    });

    test('constructor falls back to env secret when not provided', () => {
      const m = new auth.JWTManager();
      expect(m.secret).toBeDefined();
      expect(m.secret.length).toBeGreaterThanOrEqual(32);
    });

    test('sign and verify roundtrip', () => {
      const token = manager.sign({ sub: 'u1', username: 'alice', role: 'admin' });
      const payload = manager.verify(token);
      expect(payload.username).toBe('alice');
      expect(payload.role).toBe('admin');
      expect(payload.iss).toBe('ultrawork-ai');
    });

    test('sign with refresh uses longer expiry', () => {
      const token = manager.sign({ sub: 'u1' }, { refresh: true });
      const payload = manager.verify(token);
      expect(payload).toBeDefined();
    });

    test('verify throws Token expired', () => {
      const token = jwt.sign({ sub: 'u1' }, SECRET, { expiresIn: -1 });
      expect(() => manager.verify(token)).toThrow('Token expired');
    });

    test('verify throws Invalid token', () => {
      expect(() => manager.verify('not-a-jwt')).toThrow('Invalid token');
    });

    test('verify throws on wrong secret', () => {
      const token = jwt.sign({ sub: 'u1' }, 'different-secret-value-12345678901234');
      expect(() => manager.verify(token)).toThrow('Invalid token');
    });

    test('verify falls through to generic error on unexpected error', () => {
      const spy = jest.spyOn(jwt, 'verify').mockImplementation(() => {
        throw new Error('boom');
      });
      expect(() => manager.verify('x')).toThrow('Token verification failed: boom');
      spy.mockRestore();
    });

    test('refresh signs new token from payload', () => {
      const token = manager.sign({ sub: 'u1', username: 'alice', role: 'user' });
      const refreshed = manager.refresh(token);
      const payload = manager.verify(refreshed);
      expect(payload.username).toBe('alice');
    });

    test('generateRefreshToken stores token', () => {
      const rt = manager.generateRefreshToken('alice');
      expect(manager.refreshTokens.has(rt)).toBe(true);
      expect(manager.refreshTokens.get(rt).username).toBe('alice');
    });

    test('verifyRefreshToken accepts valid refresh token', () => {
      const rt = manager.generateRefreshToken('alice');
      const payload = manager.verifyRefreshToken(rt);
      expect(payload.type).toBe('refresh');
      expect(payload.sub).toBe('alice');
    });

    test('verifyRefreshToken rejects non-refresh token', () => {
      const token = manager.sign({ sub: 'alice' });
      expect(() => manager.verifyRefreshToken(token)).toThrow('Refresh token verification failed');
    });

    test('verifyRefreshToken rejects revoked token', () => {
      const rt = manager.generateRefreshToken('alice');
      manager.revokeRefreshToken(rt);
      expect(() => manager.verifyRefreshToken(rt)).toThrow('Refresh token expired or revoked');
    });

    test('revokeRefreshToken removes token', () => {
      const rt = manager.generateRefreshToken('alice');
      manager.revokeRefreshToken(rt);
      expect(manager.refreshTokens.has(rt)).toBe(false);
    });
  });

  describe('getJWTSecret', () => {
    test('throws in production without secret', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'production';
      try {
        let caught;
        jest.isolateModules(() => {
          try {
            require('../../src/middleware/auth');
          } catch (e) {
            caught = e;
          }
        });
        expect(caught.message).toContain('JWT_SECRET environment variable');
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.JWT_SECRET = prevSecret;
      }
    });

    test('throws for short secret', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevSecret = process.env.JWT_SECRET;
      process.env.NODE_ENV = 'test';
      process.env.JWT_SECRET = 'short';
      try {
        let caught;
        jest.isolateModules(() => {
          try {
            require('../../src/middleware/auth');
          } catch (e) {
            caught = e;
          }
        });
        expect(caught.message).toContain('at least 32 characters');
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.JWT_SECRET = prevSecret;
      }
    });

    test('falls back to random key in dev without secret', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'test';
      try {
        let loaded;
        expect(() => {
          jest.isolateModules(() => {
            loaded = require('../../src/middleware/auth');
          });
        }).not.toThrow();
        expect(loaded.JWTManager).toBeDefined();
        expect(loaded.JWTManager.name).toBe('JWTManager');
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.JWT_SECRET = prevSecret;
      }
    });

    test('second getJWTSecret call skips re-warning', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'test';
      try {
        let loaded;
        jest.isolateModules(() => {
          loaded = require('../../src/middleware/auth');
        });
        const callsAfterLoad = warnLog.mock.calls.length;
        const m = new loaded.JWTManager();
        expect(m.secret.length).toBeGreaterThanOrEqual(32);
        expect(warnLog.mock.calls.length).toBe(callsAfterLoad);
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.JWT_SECRET = prevSecret;
      }
    });
  });

  describe('createAuthMiddleware', () => {
    let ctx;
    beforeEach(() => {
      ctx = auth.createAuthMiddleware({ secret: SECRET, excludePaths: ['/api/health'] });
    });

    const mockRes = () => ({
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    });

    test('createAuthMiddleware works without options', () => {
      const c = auth.createAuthMiddleware();
      expect(c.jwtManager).toBeDefined();
    });

    test('authenticate uses payload.id when sub missing', () => {
      const token = ctx.jwtManager.sign({ id: 'custom-id', username: 'alice', role: 'user' });
      const req = { path: '/api/skills', headers: { authorization: `Bearer ${token}` }, cookies: {} };
      const next = jest.fn();
      ctx.authenticate(req, mockRes(), next);
      expect(req.user.id).toBe('custom-id');
    });

    test('authenticate skips excluded paths', () => {
      const req = { path: '/api/health', headers: {}, cookies: {} };
      const next = jest.fn();
      ctx.authenticate(req, mockRes(), next);
      expect(next).toHaveBeenCalled();
    });

    test('authenticate sets guest when no token', () => {
      const req = { path: '/api/skills', headers: {}, cookies: {} };
      const next = jest.fn();
      ctx.authenticate(req, mockRes(), next);
      expect(req.user.role).toBe('guest');
      expect(req.user.permissions).toEqual(['skills:read', 'templates:read']);
      expect(next).toHaveBeenCalled();
    });

    test('authenticate reads token from authorization header', () => {
      const token = ctx.jwtManager.sign({ sub: 'u1', username: 'alice', role: 'admin' });
      const req = { path: '/api/skills', headers: { authorization: `Bearer ${token}` }, cookies: {} };
      const next = jest.fn();
      ctx.authenticate(req, mockRes(), next);
      expect(req.user.username).toBe('alice');
      expect(req.user.role).toBe('admin');
      expect(req.user.permissions).toContain('users:manage');
      expect(next).toHaveBeenCalled();
    });

    test('authenticate reads token from cookie', () => {
      const token = ctx.jwtManager.sign({ sub: 'u1', username: 'bob', role: 'user' });
      const req = { path: '/api/skills', headers: {}, cookies: { token } };
      const next = jest.fn();
      ctx.authenticate(req, mockRes(), next);
      expect(req.user.username).toBe('bob');
    });

    test('authenticate rejects invalid token', () => {
      const req = { path: '/api/skills', headers: { authorization: 'Bearer bad.token.here' }, cookies: {} };
      const res = mockRes();
      ctx.authenticate(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Authentication failed' }));
    });

    test('authenticate defaults role to user when missing', () => {
      const token = ctx.jwtManager.sign({ sub: 'u1', username: 'alice' });
      const req = { path: '/api/skills', headers: { authorization: `Bearer ${token}` }, cookies: {} };
      const next = jest.fn();
      ctx.authenticate(req, mockRes(), next);
      expect(req.user.role).toBe('user');
    });

    test('requireRole allows matching role', () => {
      const req = { user: { role: 'admin' } };
      const next = jest.fn();
      ctx.requireRole('admin')(req, mockRes(), next);
      expect(next).toHaveBeenCalled();
    });

    test('requireRole rejects no user', () => {
      const res = mockRes();
      ctx.requireRole('admin')({}, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test('requireRole rejects wrong role', () => {
      const req = { user: { role: 'guest' } };
      const res = mockRes();
      ctx.requireRole('admin')(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ current: 'guest' }));
    });

    test('requirePermission allows when all permissions present', () => {
      const req = { user: { permissions: ['skills:create', 'skills:read'] } };
      const next = jest.fn();
      ctx.requirePermission('skills:create', 'skills:read')(req, mockRes(), next);
      expect(next).toHaveBeenCalled();
    });

    test('requirePermission rejects missing permission', () => {
      const req = { user: { permissions: ['skills:read'] } };
      const res = mockRes();
      ctx.requirePermission('skills:delete')(req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('requirePermission rejects no user', () => {
      const res = mockRes();
      ctx.requirePermission('skills:read')({}, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test('generateToken creates token with user role', () => {
      const token = ctx.generateToken({ id: 'u1', username: 'alice', role: 'admin' });
      const payload = ctx.jwtManager.verify(token);
      expect(payload.sub).toBe('u1');
      expect(payload.role).toBe('admin');
    });

    test('verifyHandler returns req.user', () => {
      const req = { user: { id: 'u1', role: 'admin' } };
      const res = { json: jest.fn() };
      ctx.verifyHandler(req, res);
      expect(res.json).toHaveBeenCalledWith({ ok: true, user: req.user });
    });

    describe('loginHandler', () => {
      test('rejects missing credentials', async () => {
        const res = mockRes();
        await ctx.loginHandler({ body: {} }, res);
        expect(res.status).toHaveBeenCalledWith(400);
      });

      test('rejects unknown user', async () => {
        const res = mockRes();
        await ctx.loginHandler({ body: { username: 'nobody', password: 'x' } }, res);
        expect(res.status).toHaveBeenCalledWith(401);
      });

      test('accepts valid env user with bcrypt hash', async () => {
        bcrypt.compare.mockResolvedValue(true);
        process.env.JWT_USERS = JSON.stringify([
          { id: 'u1', username: 'alice', role: 'admin', bcryptHash: 'hash' },
        ]);
        const res = { json: jest.fn() };
        await ctx.loginHandler({ body: { username: 'alice', password: 'pw' } }, res);
        expect(bcrypt.compare).toHaveBeenCalledWith('pw', 'hash');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
          ok: true,
          user: { id: 'u1', username: 'alice', role: 'admin' },
        }));
      });

      test('rejects wrong password', async () => {
        bcrypt.compare.mockResolvedValue(false);
        process.env.JWT_USERS = JSON.stringify([
          { id: 'u1', username: 'alice', role: 'admin', bcryptHash: 'hash' },
        ]);
        const res = mockRes();
        await ctx.loginHandler({ body: { username: 'alice', password: 'wrong' } }, res);
        expect(res.status).toHaveBeenCalledWith(401);
      });

      test('accepts legacy SHA-256 password', async () => {
        process.env.JWT_USERS = JSON.stringify([
          { id: 'u1', username: 'bob', role: 'user', passwordHash: require('crypto').createHash('sha256').update('pass').digest('hex') },
        ]);
        const res = { json: jest.fn() };
        await ctx.loginHandler({ body: { username: 'bob', password: 'pass' } }, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
        expect(warnLog).toHaveBeenCalledWith(expect.stringContaining('Legacy SHA-256'));
      });

      test('accepts scrypt salt/hash password', async () => {
        const crypto = require('crypto');
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync('pass', salt, 64).toString('hex');
        process.env.JWT_USERS = JSON.stringify([
          { id: 'u1', username: 'carol', role: 'user', salt, hash },
        ]);
        const res = { json: jest.fn() };
        await ctx.loginHandler({ body: { username: 'carol', password: 'pass' } }, res);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
      });

      test('returns false when no hash variant matches', async () => {
        process.env.JWT_USERS = JSON.stringify([
          { id: 'u1', username: 'dave', role: 'user' },
        ]);
        const res = mockRes();
        await ctx.loginHandler({ body: { username: 'dave', password: 'pass' } }, res);
        expect(res.status).toHaveBeenCalledWith(401);
      });

      test('handles missing JWT_USERS env', async () => {
        delete process.env.JWT_USERS;
        const res = mockRes();
        await ctx.loginHandler({ body: { username: 'alice', password: 'pw' } }, res);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(warnLog).toHaveBeenCalledWith(expect.stringContaining('No JWT_USERS'));
      });

      test('handles malformed JWT_USERS env', async () => {
        process.env.JWT_USERS = '{not-json';
        const res = mockRes();
        await ctx.loginHandler({ body: { username: 'alice', password: 'pw' } }, res);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(errorLog).toHaveBeenCalled();
      });

      test('bcrypt compare throws -> 401 and errorLog', async () => {
        bcrypt.compare.mockRejectedValueOnce(new Error('boom'));
        process.env.JWT_USERS = JSON.stringify([
          { id: 'u1', username: 'alice', role: 'admin', bcryptHash: 'hash' },
        ]);
        const res = mockRes();
        await ctx.loginHandler({ body: { username: 'alice', password: 'pw' } }, res);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(errorLog).toHaveBeenCalledWith('[Auth] bcrypt compare failed:', { error: 'boom' });
      });

      test('generateToken defaults role to user', () => {
        const token = ctx.generateToken({ id: 'u1', username: 'alice' });
        const payload = ctx.jwtManager.verify(token);
        expect(payload.role).toBe('user');
      });
    });
  });
});
