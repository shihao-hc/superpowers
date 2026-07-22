/**
 * Unit Tests for DataMaskingEngine
 */

const crypto = require('crypto');
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

    it('should have minimal template', () => {
      expect(MASKING_TEMPLATES.minimal).toBeDefined();
      expect(MASKING_TEMPLATES.minimal.rules).toContain('pii-email');
      expect(MASKING_TEMPLATES.minimal.rules).toContain('pii-phone');
    });
  });

  describe('mask - additional types', () => {
    it('should mask id-card', () => {
      const result = masker.mask('ID: 110101199001011234');
      expect(result.masked).not.toContain('110101199001011234');
      expect(result.masked).toContain('********');
    });

    it('should mask SSN', () => {
      const result = masker.mask('SSN: 123-45-6789');
      expect(result.masked).not.toContain('123-45-6789');
      expect(result.masked).toContain('6789');
    });

    it('should have IP address pattern defined', () => {
      expect(masker.patterns.has('ip-address')).toBe(true);
    });

    it('should mask API key', () => {
      const result = masker.mask('api_key=abcdefghijklmnopqrstuvwxyz');
      expect(result.masked).toContain('[API_KEY_REDACTED]');
    });

    it('should pass through non-string non-object', () => {
      expect(masker.mask(42)).toBe(42);
      expect(masker.mask(null)).toBeNull();
      expect(masker.mask(undefined)).toBeUndefined();
    });
  });

  describe('mask with specific rules', () => {
    it('should apply only specified rules', () => {
      const result = masker.mask('Email: a@b.com Phone: 13812345678', { rules: ['pii-email'] });
      expect(result.masked).not.toContain('a@b.com');
      expect(result.masked).toContain('13812345678');
    });

    it('should preserve original when requested', () => {
      const result = masker.mask('Email: a@b.com', { preserveOriginal: true });
      expect(result.masks[0].original).toBe('a@b.com');
    });
  });

  describe('maskWithContext - advanced', () => {
    it('should apply medical data source rules', () => {
      const result = masker.maskWithContext('ID: 110101199001011234', {
        userRole: 'analyst', dataSource: 'medical'
      });
      expect(result.masked).not.toContain('110101199001011234');
    });

    it('should apply HIPAA regulation rules', () => {
      const result = masker.maskWithContext('SSN: 123-45-6789', {
        userRole: 'analyst', regulation: ['HIPAA']
      });
      expect(result.masks.length).toBeGreaterThan(0);
    });

    it('should apply GDPR regulation rules', () => {
      const result = masker.maskWithContext('Email: user@example.com', {
        userRole: 'analyst', regulation: ['GDPR']
      });
      expect(result.masked).not.toContain('user@example.com');
    });

    it('should apply default role rules when no role matches', () => {
      const result = masker.maskWithContext('Email: user@example.com', {
        userRole: 'viewer'
      });
      expect(result.masked).not.toContain('user@example.com');
    });
  });

  describe('validateMasking', () => {
    it('should compute score', () => {
      const result = masker.validateMasking('test@test.com', 'original');
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data', () => {
      const key = crypto.randomBytes(32).toString('hex');
      const data = 'sensitive data';
      const encrypted = masker.encrypt(data, key);
      expect(encrypted.encrypted).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.authTag).toBeTruthy();

      const decrypted = masker.decrypt(encrypted, key);
      expect(decrypted).toBe(data);
    });

    it('should produce different ciphertexts for same input', () => {
      const key = crypto.randomBytes(32).toString('hex');
      const data = 'same data';
      const enc1 = masker.encrypt(data, key);
      const enc2 = masker.encrypt(data, key);
      expect(enc1.encrypted).not.toBe(enc2.encrypted);
    });
  });

  describe('addRule', () => {
    it('should add custom rule', () => {
      masker.addRule({
        id: 'custom-test',
        name: 'Custom test',
        pattern: 'email',
        type: 'partial',
        replacement: () => '[CUSTOM]'
      });
      expect(masker.rules.has('custom-test')).toBe(true);
    });

    it('should apply custom rule', () => {
      masker.addRule({
        id: 'custom-censor',
        name: 'Custom censor',
        pattern: 'email',
        type: 'full',
        replacement: () => '[CENSORED]'
      });
      const result = masker.mask('Email: a@b.com', { rules: ['custom-censor'] });
      expect(result.masked).toContain('[CENSORED]');
    });
  });

  describe('generateReport', () => {
    it('should generate report with masks', () => {
      const report = masker.generateReport('Email: a@b.com Phone: 13812345678');
      expect(report.totalMasks).toBeGreaterThan(0);
      expect(report.byRule.length).toBeGreaterThan(0);
      expect(report.validation).toBeDefined();
    });

    it('should include samples when requested', () => {
      const report = masker.generateReport('a@b.com', { includeSamples: true });
      expect(report.totalMasks).toBeGreaterThan(0);
    });
  });

  describe('nested object masking', () => {
    it('should mask nested values', () => {
      const data = { user: { email: 'test@test.com', profile: { phone: '13812345678' } } };
      const result = masker.mask(data);
      expect(result.masked.user.email).toContain('***@');
      expect(result.masked.user.profile.phone).toContain('*');
    });

    it('should include field info in masks', () => {
      const data = { contact: 'user@example.com' };
      const result = masker.mask(data);
      expect(result.masks[0].field).toBe('contact');
    });
  });
});
