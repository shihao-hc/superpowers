const jwt = require('jsonwebtoken');
const { EnhancedAuthService } = require('../../src/security/EnhancedAuthService');

jest.mock('jsonwebtoken');

describe('EnhancedAuthService', () => {
  let auth;
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    jest.spyOn(process, 'emitWarning').mockImplementation(() => {});
    auth = new EnhancedAuthService({ jwtSecret: 'test-secret-key-for-unit-tests' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const a = new EnhancedAuthService({ jwtSecret: 'test-secret' });
      expect(a.jwtExpiry).toBe('24h');
      expect(a.refreshExpiry).toBe('7d');
      expect(a.maxLoginAttempts).toBe(5);
      expect(a.lockoutDuration).toBe(15 * 60 * 1000);
      expect(a.loginAttempts instanceof Map).toBe(true);
      expect(a.activeSessions instanceof Map).toBe(true);
      expect(a.tokenBlacklist instanceof Set).toBe(true);
      expect(a.totpSecrets instanceof Map).toBe(true);
    });

    it('should throw in production without JWT_SECRET', () => {
      process.env.NODE_ENV = 'production';
      expect(() => new EnhancedAuthService()).toThrow('SECURITY ERROR');
    });

    it('should auto-generate secret in non-production', () => {
      const a = new EnhancedAuthService();
      expect(a.jwtSecret).toBeTruthy();
      expect(a.jwtSecret.length).toBeGreaterThan(0);
    });
  });

  describe('password hashing', () => {
    it('should hash and verify password', () => {
      const { hash, salt } = auth.hashPassword('my-password');
      expect(hash).toBeTruthy();
      expect(salt).toBeTruthy();
      expect(auth.verifyPassword('my-password', hash, salt)).toBe(true);
    });

    it('should reject wrong password', () => {
      const { hash, salt } = auth.hashPassword('correct-pw');
      expect(auth.verifyPassword('wrong-pw', hash, salt)).toBe(false);
    });

    it('should generate different hashes for same password', () => {
      const a = auth.hashPassword('same-pw');
      const b = auth.hashPassword('same-pw');
      expect(a.hash).not.toBe(b.hash);
    });

    it('should produce deterministic hash with provided salt', () => {
      const a = auth.hashPassword('pw', 'fixed-salt-1234567890123456');
      const b = auth.hashPassword('pw', 'fixed-salt-1234567890123456');
      expect(a.hash).toBe(b.hash);
    });
  });

  describe('TOTP', () => {
    it('should generate a TOTP secret', () => {
      const secret = auth.generateTOTPSecret();
      expect(secret).toBeTruthy();
      expect(typeof secret).toBe('string');
      expect(secret.length).toBe(40);
    });

    it('should generate and verify TOTP code', () => {
      const secret = auth.generateTOTPSecret();
      const code = auth.generateTOTPCode(secret);
      expect(code).toMatch(/^\d{6}$/);
      expect(auth.verifyTOTP(secret, code)).toBe(true);
    });

    it('should accept TOTP code from previous window', () => {
      const secret = auth.generateTOTPSecret();
      const prevCode = auth.generateTOTPCode(secret, -1);
      expect(auth.verifyTOTP(secret, prevCode)).toBe(true);
    });

    it('should reject invalid TOTP code', () => {
      const secret = auth.generateTOTPSecret();
      expect(auth.verifyTOTP(secret, '000000')).toBe(false);
    });
  });

  describe('JWT tokens', () => {
    it('should generate token', () => {
      jwt.sign.mockReturnValue('mock-jwt-token');
      const token = auth.generateToken({ userId: 'u1' });
      expect(token).toBe('mock-jwt-token');
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'u1' },
        'test-secret-key-for-unit-tests',
        expect.objectContaining({ expiresIn: '24h', issuer: 'ultrawork-ai' })
      );
    });

    it('should generate refresh token when refresh option set', () => {
      jwt.sign.mockReturnValue('mock-refresh-token');
      auth.generateToken({ userId: 'u1' }, { refresh: true });
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'u1' },
        expect.any(String),
        expect.objectContaining({ expiresIn: '7d' })
      );
    });

    it('should verify valid token', () => {
      jwt.verify.mockReturnValue({ userId: 'u1', iat: 123 });
      const result = auth.verifyToken('valid-token');
      expect(result.valid).toBe(true);
      expect(result.payload.userId).toBe('u1');
    });

    it('should reject revoked token', () => {
      auth.revokeToken('revoked-token-123');
      const result = auth.verifyToken('revoked-token-123');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token has been revoked');
    });

    it('should handle verification errors', () => {
      jwt.verify.mockImplementation(() => { throw new Error('jwt expired'); });
      const result = auth.verifyToken('expired-token');
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should revoke token by adding to blacklist', () => {
      const result = auth.revokeToken('token-to-revoke');
      expect(result).toBe(true);
      expect(auth.tokenBlacklist.has('token-to-revoke')).toBe(true);
    });
  });

  describe('refreshToken', () => {
    it('should refresh valid refresh token', () => {
      jwt.verify.mockReturnValue({ userId: 'u1', refresh: true });
      jwt.sign.mockReturnValueOnce('new-access-token').mockReturnValueOnce('new-refresh-token');
      const result = auth.refreshToken('valid-refresh-token');
      expect(result.success).toBe(true);
      expect(result.token).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('should reject non-refresh tokens', () => {
      jwt.verify.mockReturnValue({ userId: 'u1' });
      const result = auth.refreshToken('access-token');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not a refresh token');
    });

    it('should handle invalid refresh token', () => {
      jwt.verify.mockImplementation(() => { throw new Error('invalid signature'); });
      const result = auth.refreshToken('bad-token');
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('login attempt tracking', () => {
    it('should track login attempts', () => {
      const result = auth.trackLoginAttempt('user1');
      expect(result.attempts).toBe(1);
      expect(result.remaining).toBe(4);
      expect(result.locked).toBe(false);
    });

    it('should lock after max attempts', () => {
      for (let i = 0; i < 5; i++) {
        auth.trackLoginAttempt('user1');
      }
      const result = auth.trackLoginAttempt('user1');
      expect(result.attempts).toBe(6);
      expect(result.remaining).toBe(0);
      expect(result.locked).toBe(true);
    });

    it('should check login lock', () => {
      expect(auth.checkLoginLock('user1').locked).toBe(false);
      for (let i = 0; i < 5; i++) {
        auth.trackLoginAttempt('user1');
      }
      const check = auth.checkLoginLock('user1');
      expect(check.locked).toBe(true);
      expect(check.remaining).toBeGreaterThan(0);
    });

    it('should unlock after lockout period expires', () => {
      for (let i = 0; i < 6; i++) {
        auth.trackLoginAttempt('user1');
      }
      expect(auth.checkLoginLock('user1').locked).toBe(true);
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60 * 1000);
      expect(auth.checkLoginLock('user1').locked).toBe(false);
    });

    it('should clear login attempts', () => {
      auth.trackLoginAttempt('user1');
      auth.clearLoginAttempts('user1');
      expect(auth.checkLoginLock('user1').locked).toBe(false);
    });
  });

  describe('session management', () => {
    it('should create session', () => {
      const session = auth.createSession('u1', { ip: '127.0.0.1' });
      expect(session.id).toBeTruthy();
      expect(session.userId).toBe('u1');
      expect(session.metadata.ip).toBe('127.0.0.1');
      expect(session.createdAt).toBeGreaterThan(0);
    });

    it('should get session by id', () => {
      const session = auth.createSession('u1');
      const retrieved = auth.getSession(session.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved.userId).toBe('u1');
    });

    it('should return null for non-existent session', () => {
      expect(auth.getSession('non-existent')).toBeNull();
    });

    it('should return null for expired session', () => {
      const session = auth.createSession('u1');
      session.expiresAt = Date.now() - 1;
      expect(auth.getSession(session.id)).toBeNull();
    });

    it('should destroy session', () => {
      const session = auth.createSession('u1');
      expect(auth.destroySession(session.id)).toBe(true);
      expect(auth.getSession(session.id)).toBeNull();
    });

    it('should return false when destroying non-existent session', () => {
      expect(auth.destroySession('non-existent')).toBe(false);
    });

    it('should get user sessions', () => {
      auth.createSession('u1');
      auth.createSession('u1');
      auth.createSession('u2');
      const sessions = auth.getUserSessions('u1');
      expect(sessions.length).toBe(2);
    });

    it('should clean up expired sessions', () => {
      const session = auth.createSession('u1');
      session.expiresAt = Date.now() - 1000;
      auth.cleanupSessions();
      expect(auth.getUserSessions('u1').length).toBe(0);
    });

    it('should keep non-expired sessions during cleanup', () => {
      const session = auth.createSession('u1');
      auth.cleanupSessions();
      expect(auth.getSession(session.id)).not.toBeNull();
    });
  });

  describe('secure tokens and API keys', () => {
    it('should generate secure token', () => {
      const token = auth.generateSecureToken(16);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
    });

    it('should generate secure token with default length', () => {
      const token = auth.generateSecureToken();
      expect(token.length).toBe(64);
    });

    it('should generate API key', () => {
      const apiKey = auth.generateAPIKey('u1', 'test-key');
      expect(apiKey.key).toMatch(/^uw_/);
      expect(apiKey.userId).toBe('u1');
      expect(apiKey.name).toBe('test-key');
      expect(apiKey.createdAt).toBeGreaterThan(0);
      expect(apiKey.expiresAt).toBeGreaterThan(0);
    });

    it('should verify valid API key', () => {
      const apiKey = auth.generateAPIKey('u1', 'test');
      const result = auth.verifyAPIKey(apiKey.key, [apiKey]);
      expect(result.valid).toBe(true);
      expect(result.userId).toBe('u1');
    });

    it('should reject unknown API key', () => {
      const result = auth.verifyAPIKey('unknown-key', []);
      expect(result.valid).toBe(false);
    });

    it('should reject expired API key', () => {
      const apiKey = auth.generateAPIKey('u1', 'old');
      apiKey.expiresAt = Date.now() - 1000;
      const result = auth.verifyAPIKey(apiKey.key, [apiKey]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('API key expired');
    });
  });
});
