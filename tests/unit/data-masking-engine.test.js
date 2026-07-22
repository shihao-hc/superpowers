const crypto = require('crypto');
const { DataMaskingEngine, MASKING_TEMPLATES } = require('../../src/security/zerotrust/DataMaskingEngine');

describe('DataMaskingEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new DataMaskingEngine();
  });

  describe('constructor', () => {
    test('initializes with default patterns and rules', () => {
      expect(engine.patterns.size).toBeGreaterThan(0);
      expect(engine.rules.size).toBeGreaterThan(0);
    });

    test('has expected default patterns', () => {
      expect(engine.patterns.has('email')).toBe(true);
      expect(engine.patterns.has('phone')).toBe(true);
      expect(engine.patterns.has('id-card')).toBe(true);
      expect(engine.patterns.has('credit-card')).toBe(true);
      expect(engine.patterns.has('ssn')).toBe(true);
    });
  });

  describe('mask string', () => {
    test('masks email', () => {
      const result = engine.mask('Contact: user@example.com');
      expect(result.masked).toContain('u***@example.com');
      expect(result.masks.length).toBe(1);
      expect(result.masks[0].rule).toBe('pii-email');
    });

    test('masks phone number', () => {
      const result = engine.mask('Phone: 13800138000');
      expect(result.masked).toContain('*******8000');
      expect(result.masks.length).toBe(1);
    });

    test('masks Chinese ID card', () => {
      const result = engine.mask('ID: 110101199001011234');
      expect(result.masked).toContain('********');
      expect(result.masks.length).toBe(1);
    });

    test('masks credit card', () => {
      const result = engine.mask('Card: 4111-1111-1111-1111');
      expect(result.masked).toContain('**** **** **** 1111');
      expect(result.masks.length).toBe(1);
    });

    test('masks SSN', () => {
      const result = engine.mask('SSN: 123-45-6789');
      expect(result.masked).toContain('***-**-6789');
    });

    test('masks password in text', () => {
      const result = engine.mask('password = secret123');
      expect(result.masked).toContain('[REDACTED]');
    });

    test('masks api key', () => {
      const result = engine.mask('api_key = skabcdefghijklmnopqrstuvwxyz');
      expect(result.masked).toContain('[API_KEY_REDACTED]');
    });

    test('returns non-string data unchanged', () => {
      expect(engine.mask(42)).toBe(42);
      expect(engine.mask(null)).toBe(null);
      expect(engine.mask(undefined)).toBe(undefined);
    });

    test('returns empty for empty string', () => {
      const result = engine.mask('');
      expect(result.masked).toBe('');
      expect(result.masks).toEqual([]);
    });

    test('masks multiple patterns in one string', () => {
      const result = engine.mask('Email: a@b.com, Phone: 13800138000');
      expect(result.masks.length).toBe(2);
    });

    test('handles overlapping patterns by favoring longer match', () => {
      engine.patterns.set('short', /foo/g);
      engine.patterns.set('long', /foobar/g);
      engine.addRule({ id: 'short-rule', name: 'short', pattern: 'short', type: 'full', replacement: () => '***' });
      engine.addRule({ id: 'long-rule', name: 'long', pattern: 'long', type: 'full', replacement: () => '******' });
      const result = engine.mask('foobar');
      expect(result.masks).toHaveLength(1);
      expect(result.masks[0].rule).toBe('long-rule');
    });

    test('skips shorter overlapping match', () => {
      engine.patterns.set('long', /foobar/g);
      engine.patterns.set('short', /foo/g);
      engine.addRule({ id: 'long-rule', name: 'long', pattern: 'long', type: 'full', replacement: () => '******' });
      engine.addRule({ id: 'short-rule', name: 'short', pattern: 'short', type: 'full', replacement: () => '***' });
      const result = engine.mask('foobar');
      expect(result.masks).toHaveLength(1);
      expect(result.masks[0].rule).toBe('long-rule');
    });

    test('masks email with long local part', () => {
      const result = engine.mask('Contact: longlocalpart@test.com');
      expect(result.masks[0].masked).toContain('***rt');
    });

    test('skips rule with missing pattern', () => {
      engine.addRule({ id: 'missing', name: 'missing', pattern: 'does-not-exist', type: 'full', replacement: () => '' });
      const result = engine.mask('test');
      expect(result.masks).toHaveLength(0);
    });

    test('uses non-global regex', () => {
      engine.patterns.set('first', /^foo/);
      engine.addRule({ id: 'first-rule', name: 'first', pattern: 'first', type: 'full', replacement: () => '[F]' });
      const result = engine.mask('foo foo');
      expect(result.masks).toHaveLength(1);
    });

    test('applies specific rules when specified', () => {
      const result = engine.mask('Email: a@b.com, Phone: 13800138000', { rules: ['pii-email'] });
      expect(result.masks.length).toBe(1);
      expect(result.masks[0].rule).toBe('pii-email');
    });

    test('preserves original when requested', () => {
      const result = engine.mask('Email: a@b.com', { preserveOriginal: true });
      expect(result.masks[0].original).toBe('a@b.com');
    });
  });

  describe('mask object', () => {
    test('masks string fields', () => {
      const result = engine.mask({ email: 'user@test.com', name: 'Alice' });
      expect(result.masked.email).toContain('@test.com');
      expect(result.masks.length).toBeGreaterThanOrEqual(1);
    });

    test('masks nested objects', () => {
      const result = engine.mask({ profile: { email: 'user@test.com' } });
      expect(result.masked.profile.email).toContain('@test.com');
    });

    test('leaves non-string fields unchanged', () => {
      const result = engine.mask({ age: 30, active: true, email: 'a@b.com' });
      expect(result.masked.age).toBe(30);
      expect(result.masked.active).toBe(true);
    });

    test('masks array-like objects recursively', () => {
      const result = engine.mask({ users: [{ email: 'a@b.com' }, { email: 'c@d.com' }] });
      expect(result.masked.users[0].email).toContain('@b.com');
      expect(result.masked.users[1].email).toContain('@d.com');
    });
  });

  describe('addRule', () => {
    test('adds custom rule', () => {
      engine.addRule({
        id: 'custom-ip',
        name: 'IP masking',
        pattern: 'ip-address',
        type: 'full',
        replacement: () => '[IP]'
      });
      expect(engine.rules.has('custom-ip')).toBe(true);
    });

    test('custom rule is applied', () => {
      engine.addRule({
        id: 'custom-ip',
        name: 'IP masking',
        pattern: 'ip-address',
        type: 'full',
        replacement: () => '[IP]'
      });
      const result = engine.mask('IP: 192.168.1.1', { rules: ['custom-ip'] });
      expect(result.masked).toContain('[IP]');
    });
  });

  describe('maskWithContext', () => {
    test('admin sees full data', () => {
      const result = engine.maskWithContext('user@test.com', { userRole: 'admin' });
      expect(result.masked).toBe('user@test.com');
      expect(result.rulesApplied).toEqual([]);
    });

    test('analyst has email and phone masked', () => {
      const result = engine.maskWithContext('Contact: user@test.com, 13800138000', {
        userRole: 'analyst'
      });
      expect(result.masked).not.toBe('Contact: user@test.com, 13800138000');
    });

    test('medical data source adds id-card and medical-record', () => {
      const result = engine.maskWithContext('ID: 110101199001011234', {
        userRole: 'analyst',
        dataSource: 'medical'
      });
      expect(result.rulesApplied).toContain('pii-id-card');
    });

    test('viewer role does not add analyst rules', () => {
      const result = engine.maskWithContext('Contact: user@test.com, 13800138000', {
        userRole: 'viewer'
      });
      expect(result.rulesApplied).toEqual([]);
    });

    test('HIPAA regulation adds relevant rules', () => {
      const result = engine.maskWithContext('test data', {
        userRole: 'analyst',
        dataSource: 'generic',
        regulation: ['HIPAA']
      });
      expect(result.rulesApplied).toContain('pii-ssn');
    });

    test('GDPR regulation adds relevant rules', () => {
      const result = engine.maskWithContext('test data', {
        userRole: 'analyst',
        dataSource: 'generic',
        regulation: ['GDPR']
      });
      expect(result.rulesApplied).toContain('pii-email');
    });
  });

  describe('validateMasking', () => {
    test('returns valid for clean data', () => {
      const result = engine.validateMasking('no sensitive data here');
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
    });

    test('detects exposed emails', () => {
      const result = engine.validateMasking('user@test.com exposed');
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
      expect(result.issues[0].type).toBe('sensitive_data_exposure');
    });

    test('detects exposed phone numbers', () => {
      const result = engine.validateMasking('13800138000');
      expect(result.valid).toBe(false);
    });

    test('score decreases with more issues', () => {
      const result = engine.validateMasking('user@test.com, 13800138000, 4111-1111-1111-1111');
      expect(result.score).toBeLessThan(100);
    });
  });

  describe('encrypt/decrypt', () => {
    test('encrypts and decrypts data', () => {
      const key = crypto.randomBytes(32).toString('hex');
      // We'll use node's crypto
      const encrypted = engine.encrypt('sensitive data', key);
      expect(encrypted.encrypted).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.authTag).toBeTruthy();

      const decrypted = engine.decrypt(encrypted, key);
      expect(decrypted).toBe('sensitive data');
    });

    test('encrypt produces different output each time', () => {
      const key = crypto.randomBytes(32).toString('hex');
      const e1 = engine.encrypt('test', key);
      const e2 = engine.encrypt('test', key);
      expect(e1.encrypted).not.toBe(e2.encrypted);
    });
  });

  describe('generateReport', () => {
    test('returns mask summary', () => {
      const report = engine.generateReport('Email: a@b.com');
      expect(report.totalMasks).toBeGreaterThanOrEqual(1);
      expect(report.byRule.length).toBeGreaterThanOrEqual(1);
      expect(report.byRule[0]).toHaveProperty('rule');
      expect(report.byRule[0]).toHaveProperty('count');
      expect(report.byRule[0]).toHaveProperty('positions');
      expect(report.validation).toBeDefined();
    });

    test('includes samples when requested', () => {
      const report = engine.generateReport('Email: a@b.com', { includeSamples: true });
      expect(report.totalMasks).toBeGreaterThanOrEqual(1);
    });

    test('aggregates multiple matches of same rule', () => {
      const report = engine.generateReport('Emails: a@b.com, c@d.com', { includeSamples: true });
      expect(report.byRule[0].count).toBe(2);
    });
  });

  describe('MASKING_TEMPLATES', () => {
    test('has hipaa template', () => {
      expect(MASKING_TEMPLATES.hipaa).toBeDefined();
      expect(MASKING_TEMPLATES.hipaa.rules).toContain('pii-id-card');
    });

    test('has gdpr template', () => {
      expect(MASKING_TEMPLATES.gdpr).toBeDefined();
      expect(MASKING_TEMPLATES.gdpr.rules).toContain('pii-email');
    });

    test('has financial template', () => {
      expect(MASKING_TEMPLATES.financial).toBeDefined();
      expect(MASKING_TEMPLATES.financial.rules).toContain('pii-credit-card');
    });

    test('has minimal template', () => {
      expect(MASKING_TEMPLATES.minimal).toBeDefined();
      expect(MASKING_TEMPLATES.minimal.rules).toContain('pii-email');
    });
  });
});
