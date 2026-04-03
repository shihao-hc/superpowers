/**
 * Unit Tests for DataMaskingEngine
 */

const { DataMaskingEngine, MASKING_TEMPLATES } = require('../../src/security/zerotrust/DataMaskingEngine');

describe('DataMaskingEngine', () => {
  let masker;

  beforeEach(() => {
    masker = new DataMaskingEngine();
  });

  describe('mask - string input', () => {
    it('should mask email addresses', () => {
      const result = masker.mask('Contact: john@example.com');
      expect(result.masked).toContain('***@example.com');
      expect(result.masks.length).toBeGreaterThan(0);
    });

    it('should mask phone numbers', () => {
      const result = masker.mask('Phone: 13812345678');
      expect(result.masked).toContain('*');
      expect(result.masked).not.toContain('13812345678');
    });

    it('should mask credit card numbers', () => {
      const result = masker.mask('Card: 4111-1111-1111-1111');
      expect(result.masked).not.toContain('4111-1111-1111-1111');
      expect(result.masked).toContain('****');
    });

    it('should mask passwords', () => {
      const result = masker.mask('password=secret123');
      expect(result.masked).toContain('[REDACTED]');
      expect(result.masked).not.toContain('secret123');
    });
  });

  describe('mask - object input', () => {
    it('should mask all fields in object', () => {
      const data = {
        email: 'user@example.com',
        phone: '13812345678',
        name: 'John Doe'
      };
      
      const result = masker.mask(data);
      expect(result.masked.email).toContain('***@');
      expect(result.masked.phone).toContain('*');
      expect(result.masks.length).toBeGreaterThan(0);
    });

    it('should preserve non-sensitive fields', () => {
      const data = {
        id: '12345',
        status: 'active',
        email: 'test@test.com'
      };
      
      const result = masker.mask(data);
      expect(result.masked.id).toBe('12345');
      expect(result.masked.status).toBe('active');
    });
  });

  describe('context-aware masking', () => {
    it('should allow admin to see full data', () => {
      const result = masker.maskWithContext('test@example.com', {
        userRole: 'admin'
      });
      expect(result.masked).toBe('test@example.com');
    });

    it('should mask for analyst role', () => {
      const result = masker.maskWithContext('test@example.com', {
        userRole: 'analyst'
      });
      expect(result.masked).not.toContain('test@example.com');
    });
  });

  describe('validateMasking', () => {
    it('should detect remaining sensitive data', () => {
      const result = masker.validateMasking(
        'Email: test@test.com',
        'Email: test@test.com'
      );
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should pass for fully masked data', () => {
      const result = masker.validateMasking(
        'Email: t***@t***m',
        'Email: test@test.com'
      );
      expect(result.issues.length).toBe(0);
    });
  });

  describe('MASKING_TEMPLATES', () => {
    it('should have HIPAA template', () => {
      expect(MASKING_TEMPLATES.hipaa).toBeDefined();
      expect(MASKING_TEMPLATES.hipaa.rules).toContain('pii-id-card');
    });

    it('should have GDPR template', () => {
      expect(MASKING_TEMPLATES.gdpr).toBeDefined();
      expect(MASKING_TEMPLATES.gdpr.rules).toContain('pii-email');
    });

    it('should have financial template', () => {
      expect(MASKING_TEMPLATES.financial).toBeDefined();
      expect(MASKING_TEMPLATES.financial.rules).toContain('pii-credit-card');
    });
  });
});
