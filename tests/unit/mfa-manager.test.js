const { MFAManager, getMFAManager } = require('../../src/auth/MFAManager');

describe('MFAManager', () => {
  let mfa;

  beforeEach(() => {
    mfa = new MFAManager();
  });

  describe('constructor', () => {
    it('applies default options', () => {
      expect(mfa.enabled).toBe(true);
      expect(mfa.issuer).toBe('UltraWork');
      expect(mfa.backupCodes).toBeInstanceOf(Map);
      expect(mfa.userSecrets).toBeInstanceOf(Map);
      expect(mfa.tempSecrets).toBeInstanceOf(Map);
    });

    it('accepts custom options', () => {
      const custom = new MFAManager({ enabled: false, issuer: 'CustomApp' });
      expect(custom.enabled).toBe(false);
      expect(custom.issuer).toBe('CustomApp');
    });
  });

  describe('generateSecret', () => {
    it('returns secret, tempId and otpauth URL', () => {
      const result = mfa.generateSecret('alice');

      expect(result.tempId).toMatch(/^[0-9a-f]{16}$/);
      expect(result.secret).toMatch(/^[0-9a-f]{40}$/);
      expect(result.otpauthUrl).toContain('alice');
      expect(result.otpauthUrl).toContain('UltraWork');
      expect(result.otpauthUrl).toContain('otpauth://totp/');
    });

    it('stores temp secret with expiry', () => {
      const before = Date.now();
      const result = mfa.generateSecret('bob');
      const stored = mfa.tempSecrets.get(result.tempId);

      expect(stored).toBeDefined();
      expect(stored.username).toBe('bob');
      expect(stored.secret).toBe(result.secret);
      expect(stored.createdAt).toBeGreaterThanOrEqual(before);
      expect(stored.expiresAt).toBeGreaterThanOrEqual(before + 300000);
    });
  });

  describe('verifyTempSecret', () => {
    it('rejects invalid tempId', () => {
      const result = mfa.verifyTempSecret('nonexistent', '123456');
      expect(result).toEqual({ valid: false, error: 'Invalid setup ID' });
    });

    it('rejects expired setup', () => {
      const gen = mfa.generateSecret('charlie');
      const stored = mfa.tempSecrets.get(gen.tempId);
      stored.expiresAt = Date.now() - 1000;

      const result = mfa.verifyTempSecret(gen.tempId, '123456');
      expect(result).toEqual({ valid: false, error: 'Setup expired' });
      expect(mfa.tempSecrets.has(gen.tempId)).toBe(false);
    });

    it('activates MFA on valid TOTP code', () => {
      const gen = mfa.generateSecret('dave');
      jest.spyOn(mfa, 'verifyTOTP').mockReturnValue(true);
      jest.spyOn(mfa, '_generateBackupCodes').mockImplementation(function (username) {
        return MFAManager.prototype._generateBackupCodes.call(this, username);
      });

      const result = mfa.verifyTempSecret(gen.tempId, '123456');

      expect(result.valid).toBe(true);
      expect(result.backupCodes).toBeDefined();
      expect(mfa.userSecrets.get('dave')).toEqual({
        secret: gen.secret,
        enabled: true,
        enabledAt: expect.any(Number)
      });
      expect(mfa.tempSecrets.has(gen.tempId)).toBe(false);
    });

    it('rejects invalid TOTP code', () => {
      const gen = mfa.generateSecret('eve');
      jest.spyOn(mfa, 'verifyTOTP').mockReturnValue(false);

      const result = mfa.verifyTempSecret(gen.tempId, '654321');
      expect(result).toEqual({ valid: false, error: 'Invalid code' });
      expect(mfa.userSecrets.has('eve')).toBe(false);
    });
  });

  describe('verifyTOTP', () => {
    it('rejects non-6-digit codes', () => {
      expect(mfa.verifyTOTP('secret', '')).toBe(false);
      expect(mfa.verifyTOTP('secret', null)).toBe(false);
      expect(mfa.verifyTOTP('secret', '12345')).toBe(false);
      expect(mfa.verifyTOTP('secret', '1234567')).toBe(false);
      expect(mfa.verifyTOTP('secret', 'abcdef')).toBe(false);
    });

    it('returns true when code matches within time window', () => {
      const spy = jest.spyOn(mfa, '_generateTOTP');
      spy.mockReturnValueOnce('111111').mockReturnValueOnce('222222');

      expect(mfa.verifyTOTP('some-secret', '222222')).toBe(true);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('returns false when no window matches', () => {
      const spy = jest.spyOn(mfa, '_generateTOTP');
      spy.mockReturnValue('000000');

      expect(mfa.verifyTOTP('secret', '999999')).toBe(false);
      expect(spy).toHaveBeenCalledTimes(3);
    });
  });

  describe('_generateTOTP', () => {
    it('produces a 6-digit zero-padded code', () => {
      const code = mfa._generateTOTP('abcdef1234567890abcdef12', 12345678);
      expect(code).toMatch(/^\d{6}$/);
    });
  });

  describe('_timingSafeEqual', () => {
    it('returns false for different lengths', () => {
      expect(mfa._timingSafeEqual('abc', 'abcd')).toBe(false);
    });

    it('returns false for different strings of same length', () => {
      expect(mfa._timingSafeEqual('abc', 'abd')).toBe(false);
    });

    it('returns true for identical strings', () => {
      expect(mfa._timingSafeEqual('abc', 'abc')).toBe(true);
    });
  });

  describe('verify', () => {
    it('returns not enabled for unknown user', () => {
      expect(mfa.verify('nobody', '123456')).toEqual({
        valid: false, error: 'MFA not enabled'
      });
    });

    it('returns not enabled when user MFA is disabled', () => {
      mfa.userSecrets.set('alice', { secret: 'abc', enabled: false });
      expect(mfa.verify('alice', '123456')).toEqual({
        valid: false, error: 'MFA not enabled'
      });
    });

    it('validates TOTP code for enabled user', () => {
      mfa.userSecrets.set('alice', {
        secret: 'abcdef1234567890abcdef12', enabled: true, enabledAt: Date.now()
      });
      jest.spyOn(mfa, 'verifyTOTP').mockReturnValue(true);

      expect(mfa.verify('alice', '123456')).toEqual({ valid: true });
    });

    it('rejects invalid TOTP code for enabled user', () => {
      mfa.userSecrets.set('bob', {
        secret: 'abcdef1234567890abcdef12', enabled: true, enabledAt: Date.now()
      });
      jest.spyOn(mfa, 'verifyTOTP').mockReturnValue(false);

      expect(mfa.verify('bob', '123456')).toEqual({
        valid: false, error: 'Invalid code'
      });
    });

    it('routes backup code format to backup verification', () => {
      mfa.userSecrets.set('carol', {
        secret: 'abc', enabled: true, enabledAt: Date.now()
      });
      jest.spyOn(mfa, '_verifyBackupCode').mockReturnValue({
        valid: true, remainingCodes: 9
      });

      const result = mfa.verify('carol', '12345678-12345678');

      expect(mfa._verifyBackupCode).toHaveBeenCalledWith('carol', '12345678-12345678');
      expect(result).toEqual({ valid: true, remainingCodes: 9 });
    });

    it('handles backup code verification failure', () => {
      mfa.userSecrets.set('dave', {
        secret: 'abc', enabled: true, enabledAt: Date.now()
      });
      jest.spyOn(mfa, '_verifyBackupCode').mockReturnValue({
        valid: false, error: 'Invalid backup code'
      });

      const result = mfa.verify('dave', '12345678-87654321');

      expect(result).toEqual({ valid: false, error: 'Invalid backup code' });
    });
  });

  describe('backup codes', () => {
    it('generates 10 backup codes with correct format', () => {
      const codes = mfa._generateBackupCodes('alice');

      expect(codes).toHaveLength(10);
      codes.forEach(function (c) {
        expect(c.code).toMatch(/^\d{8}-\d{8}$/);
        expect(c.used).toBe(false);
        expect(c.usedAt).toBeNull();
      });
    });

    it('getBackupCodes returns only unused codes', () => {
      mfa._generateBackupCodes('alice');
      const codes = mfa.getBackupCodes('alice');
      expect(codes).toHaveLength(10);
    });

    it('getBackupCodes returns empty array for unknown user', () => {
      expect(mfa.getBackupCodes('nobody')).toEqual([]);
    });
  });

  describe('_verifyBackupCode', () => {
    it('returns error when user has no backup codes', () => {
      const result = mfa._verifyBackupCode('nobody', '12345678-12345678');
      expect(result).toEqual({ valid: false, error: 'No backup codes' });
    });

    it('marks code as used on successful verification', () => {
      mfa._generateBackupCodes('alice');
      const stored = mfa.backupCodes.get('alice');
      const code = stored[0].code;

      const result = mfa._verifyBackupCode('alice', code);

      expect(result.valid).toBe(true);
      expect(result.remainingCodes).toBe(9);
      expect(stored[0].used).toBe(true);
      expect(stored[0].usedAt).toEqual(expect.any(Number));
    });

    it('rejects already used backup code', () => {
      mfa._generateBackupCodes('alice');
      const stored = mfa.backupCodes.get('alice');
      stored[0].used = true;

      const result = mfa._verifyBackupCode('alice', stored[0].code);

      expect(result).toEqual({ valid: false, error: 'Invalid backup code' });
    });
  });

  describe('isEnabled', () => {
    it('returns false for unknown user', () => {
      expect(mfa.isEnabled('nobody')).toBe(false);
    });

    it('returns true for user with MFA enabled', () => {
      mfa.userSecrets.set('alice', { enabled: true });
      expect(mfa.isEnabled('alice')).toBe(true);
    });
  });

  describe('disable', () => {
    it('removes user secret and backup codes', () => {
      mfa.userSecrets.set('alice', { secret: 'abc', enabled: true });
      mfa.backupCodes.set('alice', []);

      const result = mfa.disable('alice');

      expect(result).toEqual({ success: true });
      expect(mfa.userSecrets.has('alice')).toBe(false);
      expect(mfa.backupCodes.has('alice')).toBe(false);
    });

    it('succeeds for unknown user', () => {
      expect(mfa.disable('nobody')).toEqual({ success: true });
    });
  });

  describe('getStatus', () => {
    it('returns disabled status for unknown user', () => {
      expect(mfa.getStatus('nobody')).toEqual({
        enabled: false, enabledAt: null, backupCodesRemaining: 0
      });
    });

    it('returns enabled status with remaining backup codes', () => {
      mfa.userSecrets.set('alice', { enabled: true, enabledAt: 5000 });
      mfa._generateBackupCodes('alice');

      const status = mfa.getStatus('alice');

      expect(status.enabled).toBe(true);
      expect(status.enabledAt).toBe(5000);
      expect(status.backupCodesRemaining).toBe(10);
    });
  });

  describe('getMFAManager singleton', () => {
    it('returns the same instance on repeated calls', () => {
      const a = getMFAManager();
      const b = getMFAManager();
      expect(a).toBe(b);
    });

    it('returns an MFAManager instance', () => {
      const instance = getMFAManager();
      expect(instance).toBeInstanceOf(MFAManager);
    });
  });
});
