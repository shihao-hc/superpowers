/**
 * Data Masking Integration Tests
 * Tests for data masking service and endpoints
 */

process.env.NODE_ENV = 'test';
process.env.MASK_ENABLED = 'true';

const dataMaskService = require('../../server/services/dataMaskService');

describe('Data Masking Integration', () => {
  describe('DataMaskService', () => {

    it('should mask user data correctly', () => {
      const user = {
        id: 1,
        email: 'user@test.com',
        phone: '13812345678',
        idCard: '110101199001011234',
        bankCard: '6222021234567890',
        ip: '192.168.1.100'
      };
      
      const masked = dataMaskService.maskUserData(user);
      
      expect(masked.email).toBe('u***@test.com');
      expect(masked.phone).toBe('138****5678');
      expect(masked.idCard).toBe('110101********1234');
      expect(masked.bankCard).toBe('622202****67890');
      expect(masked.ip).toBe('192.168.**.**');
      expect(masked.id).toBe(1);
    });

    it('should handle null input', () => {
      const masked = dataMaskService.maskUserData(null);
      expect(masked).toBeNull();
    });

    it('should handle missing fields', () => {
      const user = { id: 1, name: 'John' };
      const masked = dataMaskService.maskUserData(user);
      expect(masked.id).toBe(1);
      expect(masked.name).toBe('John');
    });

    it('should batch mask array of users', () => {
      const users = [
        { id: 1, email: 'user1@test.com', phone: '13812345678' },
        { id: 2, email: 'user2@test.com', phone: '13912345678' }
      ];
      
      const masked = dataMaskService.batchMask(users, ['email', 'phone']);
      
      expect(masked[0].email).toBe('u***@test.com');
      expect(masked[0].phone).toBe('138****5678');
      expect(masked[1].email).toBe('u***@test.com');
      expect(masked[1].phone).toBe('139****5678');
    });

    it('should return original array when not an array', () => {
      const notArray = { id: 1, email: 'test@test.com' };
      const result = dataMaskService.batchMask(notArray, ['email']);
      expect(result).toEqual(notArray);
    });

    it('should mask log entries correctly', () => {
      const log = {
        level: 'info',
        message: 'User login',
        email: 'admin@company.com',
        ip: '10.0.0.1',
        deviceFingerprint: 'abc123def456'
      };
      
      const masked = dataMaskService.getMaskedLogEntry(log);
      
      expect(masked.email).toBe('a***@company.com');
      expect(masked.ip).toBe('10.0.**.**');
      expect(masked.deviceFingerprint).toBe('abc******123d');
      expect(masked.level).toBe('info');
      expect(masked.message).toBe('User login');
    });
  });

  describe('Data masking with config enabled', () => {
    beforeAll(() => {
      process.env.MASK_ENABLED = 'true';
    });

    it('should mask sensitive fields when enabled', () => {
      const user = {
        id: 1,
        email: 'sensitive@company.com',
        phone: '13900001111',
        idCard: '110101199001011234',
        bankCard: '6217002345678901',
        ip: '192.168.1.50',
        deviceFingerprint: 'device123456789'
      };
      
      const masked = dataMaskService.maskUserData(user);
      
      expect(masked.email).toBe('s***@company.com');
      expect(masked.phone).toBe('139****1111');
      expect(masked.idCard).toBe('110101********1234');
      expect(masked.bankCard).toBe('621700****78901');
      expect(masked.ip).toBe('192.168.**.**');
      expect(masked.deviceFingerprint).toBe('dev******ice1');
    });

    it('should not mask non-sensitive fields', () => {
      const user = {
        id: 1,
        username: 'john_doe',
        name: 'John Doe',
        age: 30,
        email: 'john@test.com'
      };
      
      const masked = dataMaskService.maskUserData(user);
      
      expect(masked.username).toBe('john_doe');
      expect(masked.name).toBe('John Doe');
      expect(masked.age).toBe(30);
      expect(masked.email).toBe('j***@test.com');
    });
  });
});
