const { JWTAuth } = require('../../src/auth/JWTAuth');

describe('JWTAuth', () => {
  let auth;

  beforeEach(() => {
    auth = new JWTAuth({ secret: 'test-secret-thirty-two-chars-min!!', expiresIn: 3600000 });
  });

  afterEach(() => {
    auth.destroy();
  });

  describe('constructor', () => {
    test('creates with default values', () => {
      const a = new JWTAuth({ secret: 'test-secret-thirty-two-chars-min!!' });
      expect(a.expiresIn).toBe(86400000);
      expect(a.refreshExpiresIn).toBe(7 * 86400000);
      expect(a.issuer).toBe('ultrawork');
      expect(a.tokens.size).toBe(0);
      expect(a.users.size).toBe(0);
      expect(a.roles.size).toBe(3);
      a.destroy();
    });

    test('uses provided options', () => {
      const a = new JWTAuth({
        secret: 'custom-secret-thirty-two-chars-min!!',
        expiresIn: 5000,
        refreshExpiresIn: 10000,
        issuer: 'custom'
      });
      expect(a.expiresIn).toBe(5000);
      expect(a.refreshExpiresIn).toBe(10000);
      expect(a.issuer).toBe('custom');
      a.destroy();
    });

    test('generates random secret if none provided in dev', () => {
      const a = new JWTAuth();
      expect(a.secret).toBeTruthy();
      expect(a.secret.length).toBe(64);
      a.destroy();
    });

    test('throws in production without secret', () => {
      const orig = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      expect(() => new JWTAuth()).toThrow('JWT_SECRET must be set');
      process.env.NODE_ENV = orig;
    });
  });

  describe('createUser', () => {
    test('creates a user with viewer role by default', () => {
      const result = auth.createUser('alice', 'password123');
      expect(result).toEqual({ username: 'alice', role: 'viewer' });
    });

    test('creates a user with specified role', () => {
      const result = auth.createUser('admin1', 'pass123', 'admin');
      expect(result.role).toBe('admin');
    });

    test('returns error for duplicate username', () => {
      auth.createUser('alice', 'pass123');
      const result = auth.createUser('alice', 'pass456');
      expect(result).toEqual({ error: 'User already exists' });
    });

    test('falls back to viewer for invalid role', () => {
      const result = auth.createUser('user1', 'pass123', 'superadmin');
      expect(result.role).toBe('viewer');
    });

    test('stores hashed password', () => {
      auth.createUser('alice', 'mypassword');
      const user = auth.users.get('alice');
      expect(user.hash).toBeTruthy();
      expect(user.hash).not.toBe('mypassword');
      expect(user.salt).toBeTruthy();
    });
  });

  describe('verifyPassword', () => {
    test('returns true for correct password', () => {
      auth.createUser('alice', 'correct');
      expect(auth.verifyPassword('alice', 'correct')).toBe(true);
    });

    test('returns false for wrong password', () => {
      auth.createUser('alice', 'correct');
      expect(auth.verifyPassword('alice', 'wrong')).toBe(false);
    });

    test('returns false for nonexistent user', () => {
      expect(auth.verifyPassword('ghost', 'any')).toBe(false);
    });

    test('returns false for inactive user', () => {
      auth.createUser('alice', 'pass');
      auth.users.get('alice').active = false;
      expect(auth.verifyPassword('alice', 'pass')).toBe(false);
    });

    test('catch block on corrupted hash', () => {
      auth.createUser('alice', 'pass');
      auth.users.get('alice').hash = new Array(128).fill(0);
      expect(auth.verifyPassword('alice', 'pass')).toBe(false);
    });

    test('returns false for hash length mismatch', () => {
      auth.createUser('bob', 'pass');
      auth.users.get('bob').hash = 'short';
      expect(auth.verifyPassword('bob', 'pass')).toBe(false);
    });
  });

  describe('login', () => {
    test('returns tokens on success', () => {
      auth.createUser('alice', 'pass123');
      const result = auth.login('alice', 'pass123');
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.expiresIn).toBe(3600);
      expect(result.user).toEqual({ username: 'alice', role: 'viewer' });
    });

    test('returns error for invalid credentials', () => {
      const result = auth.login('alice', 'wrong');
      expect(result).toEqual({ error: 'Invalid credentials' });
    });

    test('updates lastLogin', () => {
      auth.createUser('alice', 'pass');
      const before = Date.now();
      auth.login('alice', 'pass');
      expect(auth.users.get('alice').lastLogin).toBeGreaterThanOrEqual(before);
    });
  });

  describe('verify', () => {
    test('returns valid for access token', () => {
      auth.createUser('alice', 'pass');
      const { accessToken } = auth.login('alice', 'pass');
      const result = auth.verify(accessToken);
      expect(result.valid).toBe(true);
      expect(result.username).toBe('alice');
      expect(result.role).toBe('viewer');
      expect(result.payload.type).toBe('access');
    });

    test('returns error for no token', () => {
      const result = auth.verify(null);
      expect(result).toEqual({ valid: false, error: 'No token provided' });
    });

    test('returns error for invalid token', () => {
      const result = auth.verify('invalid.token.here');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    test('returns error for refresh token used as access', () => {
      auth.createUser('alice', 'pass');
      const { refreshToken } = auth.login('alice', 'pass');
      const result = auth.verify(refreshToken);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token type');
    });

    test('returns error for expired token', () => {
      jest.useFakeTimers();
      const a = new JWTAuth({ secret: 'test-secret-thirty-two-chars-min!!', expiresIn: 1000 });
      a.createUser('alice', 'pass');
      const { accessToken } = a.login('alice', 'pass');
      jest.advanceTimersByTime(2000);
      const result = a.verify(accessToken);
      expect(result.valid).toBe(false);
      a.destroy();
      jest.useRealTimers();
    });
  });

  describe('verifySocketToken', () => {
    test('validates socket token (any type)', () => {
      auth.createUser('alice', 'pass');
      const { accessToken } = auth.login('alice', 'pass');
      const result = auth.verifySocketToken(accessToken);
      expect(result.valid).toBe(true);
    });

    test('returns error for invalid token', () => {
      const result = auth.verifySocketToken('bad');
      expect(result.valid).toBe(false);
    });

    test('returns error for null token', () => {
      const result = auth.verifySocketToken(null);
      expect(result.valid).toBe(false);
    });
  });

  describe('refresh', () => {
    test('returns new tokens for valid refresh token', () => {
      auth.createUser('alice', 'pass');
      const { refreshToken } = auth.login('alice', 'pass');
      const result = auth.refresh(refreshToken);
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.accessToken).not.toBe(refreshToken);
      expect(result.refreshToken).not.toBe(refreshToken);
    });

    test('invalidates old refresh token', () => {
      auth.createUser('alice', 'pass');
      const { refreshToken } = auth.login('alice', 'pass');
      auth.refresh(refreshToken);
      const result = auth.refresh(refreshToken);
      expect(result).toEqual({ error: 'Invalid refresh token' });
    });

    test('returns error for invalid token', () => {
      const result = auth.refresh('bad');
      expect(result).toEqual({ error: 'Invalid refresh token' });
    });

    test('returns error for access token', () => {
      auth.createUser('alice', 'pass');
      const { accessToken } = auth.login('alice', 'pass');
      const result = auth.refresh(accessToken);
      expect(result).toEqual({ error: 'Invalid refresh token' });
    });

    test('returns error when user deleted', () => {
      auth.createUser('alice', 'pass');
      const { refreshToken } = auth.login('alice', 'pass');
      auth.users.delete('alice');
      const result = auth.refresh(refreshToken);
      expect(result).toEqual({ error: 'User not found' });
    });
  });

  describe('logout', () => {
    test('removes token', () => {
      auth.createUser('alice', 'pass');
      const { accessToken } = auth.login('alice', 'pass');
      expect(auth.tokens.has(accessToken)).toBe(true);
      auth.logout(accessToken);
      expect(auth.tokens.has(accessToken)).toBe(false);
    });

    test('returns success', () => {
      expect(auth.logout('anything')).toEqual({ success: true });
    });
  });

  describe('logoutAll', () => {
    test('removes all tokens for user', () => {
      auth.createUser('alice', 'pass');
      auth.login('alice', 'pass');
      auth.login('alice', 'pass');
      expect(auth.tokens.size).toBe(2);
      auth.logoutAll('alice');
      expect(auth.tokens.size).toBe(0);
    });

    test('only removes tokens for specified user', () => {
      auth.createUser('alice', 'pass');
      auth.createUser('bob', 'pass');
      auth.login('alice', 'pass');
      auth.login('bob', 'pass');
      auth.logoutAll('alice');
      const bobTokens = Array.from(auth.tokens.values()).filter((t) => t.username === 'bob');
      expect(bobTokens.length).toBe(1);
    });
  });

  describe('middleware', () => {
    function createReq(headers = {}) {
      return { headers };
    }
    function createRes() {
      const res = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      return res;
    }

    test('passes with valid token', () => {
      auth.createUser('alice', 'pass');
      const { accessToken } = auth.login('alice', 'pass');
      const req = createReq({ authorization: `Bearer ${accessToken}` });
      const res = createRes();
      const next = jest.fn();

      auth.middleware()(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user.username).toBe('alice');
    });

    test('401 without token', () => {
      const req = createReq({});
      const res = createRes();
      const next = jest.fn();

      auth.middleware()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
      expect(next).not.toHaveBeenCalled();
    });

    test('401 with invalid token', () => {
      const req = createReq({ authorization: 'Bearer bad' });
      const res = createRes();
      const next = jest.fn();

      auth.middleware()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('403 for insufficient role', () => {
      auth.createUser('alice', 'pass');
      const { accessToken } = auth.login('alice', 'pass');
      const req = createReq({ authorization: `Bearer ${accessToken}` });
      const res = createRes();
      const next = jest.fn();

      auth.middleware({ role: 'admin' })(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    test('403 for insufficient permission', () => {
      auth.createUser('alice', 'pass', 'viewer');
      const { accessToken } = auth.login('alice', 'pass');
      const req = createReq({ authorization: `Bearer ${accessToken}` });
      const res = createRes();
      const next = jest.fn();

      auth.middleware({ permission: 'workflow:write' })(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    test('403 for unknown role', () => {
      auth.createUser('alice', 'pass', 'viewer');
      auth.users.get('alice').role = 'nonexistent';
      const { accessToken } = auth.login('alice', 'pass');
      const req = createReq({ authorization: `Bearer ${accessToken}` });
      const res = createRes();
      const next = jest.fn();

      auth.middleware({ permission: 'workflow:read' })(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unknown role' });
    });

    test('passes with sufficient permission', () => {
      auth.createUser('alice', 'pass', 'admin');
      const { accessToken } = auth.login('alice', 'pass');
      const req = createReq({ authorization: `Bearer ${accessToken}` });
      const res = createRes();
      const next = jest.fn();

      auth.middleware({ permission: 'workflow:write' })(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('passes with wildcard permission', () => {
      auth.createUser('alice', 'pass', 'admin');
      const { accessToken } = auth.login('alice', 'pass');
      const req = createReq({ authorization: `Bearer ${accessToken}` });
      const res = createRes();
      const next = jest.fn();

      auth.middleware({ permission: 'anything:any' })(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('adminMiddleware', () => {
    test('returns middleware that checks admin role', () => {
      const mw = auth.adminMiddleware();
      expect(mw).toBeInstanceOf(Function);
    });
  });

  describe('getStats', () => {
    test('returns correct counts', () => {
      auth.createUser('alice', 'pass');
      auth.login('alice', 'pass');
      const stats = auth.getStats();
      expect(stats.users).toBe(1);
      expect(stats.activeTokens).toBe(1);
      expect(stats.refreshTokens).toBe(1);
      expect(stats.roles).toBe(3);
    });
  });

  describe('destroy', () => {
    test('clears all data and timers', () => {
      auth.createUser('alice', 'pass');
      auth.destroy();
      expect(auth.tokens.size).toBe(0);
      expect(auth.users.size).toBe(0);
      expect(auth._cleanupTimer).toBeNull();
    });
  });

  describe('cleanup timer', () => {
    test('removes expired tokens on interval', () => {
      const a = new JWTAuth({ secret: 'test-secret-thirty-two-chars-min!!', expiresIn: 1000, refreshExpiresIn: 1000, cleanupInterval: 10 });
      a.createUser('alice', 'pass');
      a.login('alice', 'pass');
      expect(a.tokens.size).toBe(1);
      expect(a.refreshTokens.size).toBe(1);
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(a.tokens.size).toBe(0);
          expect(a.refreshTokens.size).toBe(0);
          a.destroy();
          resolve();
        }, 2500);
      });
    }, 15000);
  });

  describe('verify non-standard error', () => {
    test('catch fallback for NotBeforeError', () => {
      const jwt = require('jsonwebtoken');
      const futureNbf = Math.floor(Date.now() / 1000) + 3600;
      const token = jwt.sign(
        { sub: 'test', role: 'viewer', type: 'access', nbf: futureNbf },
        'test-secret-thirty-two-chars-min!!'
      );
      const result = auth.verify(token);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not active');
    });
  });
});
