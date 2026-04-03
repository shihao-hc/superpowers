const { maskEmail, maskPhone, maskIdCard, maskBankCard, maskIP, maskDeviceFingerprint, maskObject, reversibleMask, reversibleUnmask } = require('../../server/utils/dataMask');

describe('dataMask utilities', () => {
  describe('maskEmail', () => {
    it('should mask email correctly', () => {
      expect(maskEmail('user@example.com')).toBe('u***@example.com');
      expect(maskEmail('test@domain.org')).toBe('t***@domain.org');
    });
  });

  describe('maskPhone', () => {
    it('should mask phone correctly', () => {
      expect(maskPhone('13812345678')).toBe('138****5678');
      expect(maskPhone('15987654321')).toBe('159****4321');
    });
  });

  describe('maskIdCard', () => {
    it('should mask idCard correctly', () => {
      expect(maskIdCard('110101199001011234')).toBe('110101********1234');
    });
  });

  describe('maskBankCard', () => {
    it('should mask bankCard correctly', () => {
      expect(maskBankCard('6222021234567890123')).toBe('622202****90123');
    });
  });

  describe('maskIP', () => {
    it('should mask IP correctly', () => {
      expect(maskIP('192.168.1.100')).toBe('192.168.**.**');
      expect(maskIP('10.0.0.1')).toBe('10.0.**.**');
    });
  });

  describe('maskDeviceFingerprint', () => {
    it('should mask device fingerprint correctly', () => {
      expect(maskDeviceFingerprint('fp_a1b2c3d4e5f6')).toBe('fp_******e5f6');
      expect(maskDeviceFingerprint('dev_abc123def456')).toBe('dev******f456');
    });
  });

  describe('maskObject', () => {
    it('should mask multiple fields in object', () => {
      const obj = { email: 'user@test.com', phone: '13812345678' };
      const masked = maskObject(obj, ['email', 'phone']);
      expect(masked.email).toBe('u***@test.com');
      expect(masked.phone).toBe('138****5678');
    });
  });

  describe('reversibleMask & reversibleUnmask', () => {
    it('should reversible mask and unmask correctly', () => {
      const authKey = 'test-auth-key-256-bits-long!!';
      const original = '13812345678';
      const masked = reversibleMask(original, 'phone', authKey);
      const unmasked = reversibleUnmask(masked, 'phone', authKey);
      expect(unmasked).toBe(original);
    });
  });
});
