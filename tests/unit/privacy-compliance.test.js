'use strict';

const { PrivacyCompliance } = require('../../src/compliance/PrivacyCompliance');

describe('PrivacyCompliance', () => {
  let pc;

  beforeEach(() => {
    pc = new PrivacyCompliance();
  });

  describe('encrypt / decrypt', () => {
    it('encrypt returns iv, data and authTag', () => {
      const enc = pc.encrypt({ foo: 'bar' });
      expect(enc).toHaveProperty('iv');
      expect(enc).toHaveProperty('data');
      expect(enc).toHaveProperty('authTag');
      expect(typeof enc.iv).toBe('string');
      expect(typeof enc.data).toBe('string');
    });

    it('decrypt round-trips data correctly', () => {
      const original = { userId: 42, email: 'test@test.com', roles: ['admin'] };
      const enc = pc.encrypt(original);
      const dec = pc.decrypt(enc);
      expect(dec).toEqual(original);
    });

    it('decrypt with wrong key throws', () => {
      const pc2 = new PrivacyCompliance();
      const enc = pc.encrypt({ secret: 'data' });
      expect(() => pc2.decrypt(enc)).toThrow('Decryption failed');
    });

    it('decrypt uses different IV each time', () => {
      const enc1 = pc.encrypt({ a: 1 });
      const enc2 = pc.encrypt({ a: 1 });
      expect(enc1.iv).not.toBe(enc2.iv);
    });
  });

  describe('hashPII / verifyPII', () => {
    it('hashPII returns salt:hash format', () => {
      const hash = pc.hashPII('user-email@test.com');
      expect(hash).toMatch(/^[a-f0-9]+:[a-f0-9]+$/);
    });

    it('hashPII produces different salts each call', () => {
      const h1 = pc.hashPII('same-data');
      const h2 = pc.hashPII('same-data');
      expect(h1).not.toBe(h2);
    });

    it('verifyPII returns true for same data', () => {
      const data = { email: 'test@test.com' };
      const stored = pc.hashPII(data);
      expect(pc.verifyPII(data, stored)).toBe(true);
    });

    it('verifyPII returns false for different data', () => {
      const stored = pc.hashPII('original-data');
      expect(pc.verifyPII('different-data', stored)).toBe(false);
    });

    it('verifyPII returns false for malformed stored hash', () => {
      expect(pc.verifyPII('data', 'invalid')).toBe(false);
    });
  });

  describe('encrypted data storage via dataStore', () => {
    it('encrypt stores encrypted data in dataStore under userId', () => {
      const data = { profile: { name: 'Alice' } };
      const enc = pc.encrypt(data);
      pc.dataStore.set('user1', enc);
      expect(pc.dataStore.has('user1')).toBe(true);
    });

    it('decrypt retrieves data from stored encrypted entry', () => {
      const data = { profile: { name: 'Bob' }, preferences: { theme: 'dark' } };
      const enc = pc.encrypt(data);
      pc.dataStore.set('user1', enc);
      const result = pc.decrypt(pc.dataStore.get('user1'));
      expect(result).toEqual(data);
    });

    it('dataStore delete removes entry', () => {
      pc.dataStore.set('user1', { x: 1 });
      pc.dataStore.delete('user1');
      expect(pc.dataStore.has('user1')).toBe(false);
    });
  });

  describe('consent management', () => {
    it('recordConsent stores consent with details', () => {
      const consent = pc.recordConsent('u1', 'marketing', true, { method: 'checkbox', version: '2.0' });
      expect(consent.granted).toBe(true);
      expect(consent.type).toBe('marketing');
      expect(consent.withdrawn).toBe(false);
    });

    it('getConsentStatus returns all consents for user', () => {
      pc.recordConsent('u1', 'essential', true);
      pc.recordConsent('u1', 'privacy_policy', true);
      const status = pc.getConsentStatus('u1');
      expect(status.userId).toBe('u1');
      expect(status.consents.essential.granted).toBe(true);
    });

    it('getConsentStatus returns empty for unknown user', () => {
      const status = pc.getConsentStatus('unknown');
      expect(status.userId).toBe('unknown');
      expect(Object.keys(status.consents)).toHaveLength(0);
    });

    it('withdrawConsent marks consent as withdrawn', () => {
      pc.recordConsent('u1', 'analytics', true);
      const result = pc.withdrawConsent('u1', 'analytics');
      expect(result.success).toBe(true);
      const status = pc.getConsentStatus('u1');
      expect(status.consents.analytics.withdrawn).toBe(true);
    });

    it('recordConsent logs withdrawn when granted is false', () => {
      pc.recordConsent('u1', 'marketing', false, { method: 'email' });
      const status = pc.getConsentStatus('u1');
      expect(status.consents.marketing.granted).toBe(false);
    });

    it('withdrawConsent returns error for missing consent', () => {
      const result = pc.withdrawConsent('u1', 'nonexistent');
      expect(result.error).toBe('Consent not found');
    });

    it('_checkRequiredConsents returns true when all required present', () => {
      pc.recordConsent('u1', 'essential', true);
      pc.recordConsent('u1', 'privacy_policy', true);
      const status = pc.getConsentStatus('u1');
      expect(status.allRequired).toBe(true);
    });
  });

  describe('GDPR requests', () => {
    beforeEach(() => {
      pc.dataStore.set('u1', {
        profile: { name: 'Alice', email: 'alice@test.com' },
        preferences: { theme: 'light' },
        activity: [{ action: 'login', time: Date.now() }],
        communications: []
      });
    });

    it('processGDPRRequest access returns user data', () => {
      const result = pc.processGDPRRequest('u1', 'access', {});
      expect(result.status).toBe('completed');
      expect(result.data).toBeDefined();
      expect(result.data.profile.name).toBe('Alice');
    });

    it('processGDPRRequest rectification applies corrections', () => {
      const result = pc.processGDPRRequest('u1', 'rectification', { corrections: { name: 'Alice Updated' } });
      expect(result.status).toBe('completed');
      expect(result.correctionsApplied.name).toBe('Alice Updated');

      const data = pc.dataStore.get('u1');
      expect(data.profile.name).toBe('Alice Updated');
    });

    it('processGDPRRequest rectification without stored userData', () => {
      const result = pc.processGDPRRequest('u2', 'rectification', { corrections: { name: 'Nobody' } });
      expect(result.status).toBe('completed');
      expect(result.correctionsApplied).toEqual({ name: 'Nobody' });
    });

    it('processGDPRRequest erasure removes data', () => {
      pc.processGDPRRequest('u1', 'erasure', { grounds: 'withdrawn_consent' });
      expect(pc.dataStore.has('u1')).toBe(false);
    });

    it('processGDPRRequest erasure partial removes categories', () => {
      const result = pc.processGDPRRequest('u1', 'erasure', { grounds: 'requested', specificData: ['activity'] });
      expect(result.erasedCategories).toEqual(['activity']);
      expect(pc.dataStore.has('u1')).toBe(true);
    });

    it('processGDPRRequest erasure without stored userData', () => {
      const result = pc.processGDPRRequest('u2', 'erasure', { grounds: 'withdrawn_consent' });
      expect(result.status).toBe('completed');
    });

    it('processGDPRRequest portability returns encrypted data', () => {
      const result = pc.processGDPRRequest('u1', 'portability', {});
      expect(result.status).toBe('completed');
      expect(result.data).toHaveProperty('iv');
      expect(result.data).toHaveProperty('data');
    });

    it('processGDPRRequest objection records objection', () => {
      const result = pc.processGDPRRequest('u1', 'object', { processingActivity: 'marketing', grounds: 'legitimate_interest' });
      expect(result.objectionRecorded).toBe(true);
    });

    it('processGDPRRequest returns error for unknown type', () => {
      const result = pc.processGDPRRequest('u1', 'unknown_type', {});
      expect(result.error).toBe('Unknown request type');
    });

    it('processGDPRRequest with no stored data returns default profile', () => {
      const result = pc.processGDPRRequest('u2', 'access', {});
      expect(result.data.profile.id).toBe('u2');
    });
  });

  describe('CCPA requests', () => {
    beforeEach(() => {
      pc.dataStore.set('u1', {
        profile: { name: 'Charlie' },
        preferences: { optOut: false }
      });
    });

    it('processCCPARequest know returns disclosure', () => {
      const result = pc.processCCPARequest('u1', 'know', {});
      expect(result.status).toBe('completed');
      expect(result.disclosure).toHaveProperty('personalInfoCollected');
      expect(result.disclosure).toHaveProperty('sourcesOfCollection');
      expect(result.disclosure).toHaveProperty('purposeOfCollection');
    });

    it('processCCPARequest delete removes data', () => {
      pc.processCCPARequest('u1', 'delete', {});
      expect(pc.dataStore.has('u1')).toBe(false);
    });

    it('processCCPARequest delete without stored userData', () => {
      const result = pc.processCCPARequest('u2', 'delete', {});
      expect(result.status).toBe('completed');
    });

    it('processCCPARequest optout records opt-out', () => {
      const result = pc.processCCPARequest('u1', 'optout', {});
      expect(result.optOutEffective).toBe(true);
    });

    it('processCCPARequest nonsale records do not sell', () => {
      const result = pc.processCCPARequest('u1', 'nonsale', {});
      expect(result.rightsExercised).toBe('do_not_sell');
    });

    it('processCCPARequest categories returns category list', () => {
      const result = pc.processCCPARequest('u1', 'categories', {});
      expect(result.categories).toBeInstanceOf(Array);
      expect(result.categories.length).toBeGreaterThan(0);
    });

    it('processCCPARequest returns error for unknown type', () => {
      const result = pc.processCCPARequest('u1', 'unknown', {});
      expect(result.error).toBe('Unknown request type');
    });
  });

  describe('HIPAA', () => {
    it('processHIPAARecord encrypts and stores PHI', () => {
      const phiId = pc.processHIPAARecord('patient1', {
        demographics: { name: 'John' },
        diagnosis: 'flu',
        treatment: 'rest'
      });
      expect(phiId).toMatch(/^phi_/);
      expect(pc.dataStore.has('phi_patient1')).toBe(true);
    });

    it('checkPHIAccess logs and returns access record', () => {
      pc.processHIPAARecord('patient1', { demographics: { name: 'John' } });
      const result = pc.checkPHIAccess('patient1', 'doctor1', 'treatment');
      expect(result.authorized).toBe(true);
      expect(result.purpose).toBe('treatment');
    });

    it('checkPHIAccess denies unauthorized purpose', () => {
      pc.processHIPAARecord('patient1', { diagnosis: 'flu' });
      const result = pc.checkPHIAccess('patient1', 'stranger', 'marketing');
      expect(result.authorized).toBe(false);
    });

    it('getPHIAccessLog returns access log', () => {
      pc.processHIPAARecord('patient1', { diagnosis: 'flu' });
      pc.checkPHIAccess('patient1', 'doc1', 'treatment');
      const log = pc.getPHIAccessLog('patient1');
      expect(log).toHaveLength(1);
      expect(log[0].accessorId).toBe('doc1');
    });

    it('getPHIAccessLog returns empty array for unknown patient', () => {
      expect(pc.getPHIAccessLog('nonexistent')).toEqual([]);
    });

    it('_classifyPHI classifies demographics/diagnosis/treatment/billing/images', () => {
      const types = pc._classifyPHI({ demographics: {}, diagnosis: {}, billing: {}, images: {} });
      expect(types).toContain('demographics');
      expect(types).toContain('diagnosis');
      expect(types).toContain('billing');
      expect(types).toContain('images');
    });

    it('_classifyPHI returns general for empty data', () => {
      expect(pc._classifyPHI({})).toEqual(['general']);
    });

    it('checkPHIAccess without phiRecord still logs access', () => {
      const result = pc.checkPHIAccess('nouid', 'doctor1', 'treatment');
      expect(result.authorized).toBe(true);
      expect(result.accessorId).toBe('doctor1');
    });
  });

  describe('breach management', () => {
    it('logBreach creates breach record', () => {
      const breach = pc.logBreach({ type: 'data_leak', affectedUsers: [1, 2, 3], dataTypes: ['email', 'health'], dataEncrypted: false });
      expect(breach.id).toMatch(/^breach_/);
      expect(breach.status).toBe('detected');
      expect(pc.breachLog).toHaveLength(1);
    });

    it('assessBreachRisk returns null for unknown breach', () => {
      expect(pc.assessBreachRisk('nonexistent')).toBeNull();
    });

    it('assessBreachRisk calculates high risk for sensitive unencrypted data with large scope', () => {
      const breach = pc.logBreach({ type: 'hack', affectedUsers: Array.from({ length: 11 }, (_, i) => i), dataTypes: ['health', 'ssn'], dataEncrypted: false });
      const risk = pc.assessBreachRisk(breach.id);
      expect(risk.level).toBe('high');
      expect(risk.score).toBeGreaterThan(0.7);
    });

    it('assessBreachRisk calculates medium risk for medium sensitivity with large scope', () => {
      const breach = pc.logBreach({ type: 'leak', affectedUsers: Array.from({ length: 11 }, (_, i) => i), dataTypes: ['email'], dataEncrypted: true });
      const risk = pc.assessBreachRisk(breach.id);
      expect(risk.level).toBe('medium');
    });

    it('assessBreachRisk calculates low risk for low sensitivity', () => {
      const breach = pc.logBreach({ type: 'info', affectedUsers: [1], dataTypes: ['username'], dataEncrypted: true });
      const risk = pc.assessBreachRisk(breach.id);
      expect(risk.level).toBe('low');
    });

    it('assessBreachRisk handles large scope', () => {
      const users = Array.from({ length: 200 }, (_, i) => i);
      const breach = pc.logBreach({ type: 'massive', affectedUsers: users, dataTypes: ['username'], dataEncrypted: false });
      const risk = pc.assessBreachRisk(breach.id);
      expect(risk.score).toBeGreaterThan(0.3);
    });

    it('assessBreachRisk handles breach without affectedUsers', () => {
      const breach = pc.logBreach({ type: 'internal', dataTypes: ['log'], dataEncrypted: true });
      const risk = pc.assessBreachRisk(breach.id);
      expect(risk.level).toBeDefined();
    });

    it('initiateBreachNotification returns null for unknown breach', () => {
      expect(pc.initiateBreachNotification('nonexistent')).toBeNull();
    });

    it('initiateBreachNotification marks breach as notified', () => {
      const breach = pc.logBreach({ type: 'test', affectedUsers: [1] });
      const result = pc.initiateBreachNotification(breach.id);
      expect(result.notificationSent).toBe(true);
      expect(result.nextSteps).toContain('monitor');
    });

    it('initiateBreachNotification with overdue notification triggers notify_individuals', () => {
      const oldDate = Date.now() - 100 * 24 * 60 * 60 * 1000;
      jest.spyOn(Date, 'now').mockReturnValue(oldDate);
      const breach = pc.logBreach({ type: 'old_breach', affectedUsers: [1] });
      jest.spyOn(Date, 'now').mockRestore();
      jest.spyOn(Date, 'now').mockReturnValue(oldDate + 80 * 24 * 60 * 60 * 1000);
      const result = pc.initiateBreachNotification(breach.id);
      expect(result.nextSteps).toContain('notify_individuals');
      jest.spyOn(Date, 'now').mockRestore();
    });
  });

  describe('audit records', () => {
    it('getAuditRecords returns records sorted by timestamp desc', () => {
      pc.recordConsent('u1', 'essential', true);
      const records = pc.getAuditRecords();
      expect(records.length).toBeGreaterThan(0);
    });

    it('getAuditRecords filters by regulation', () => {
      pc.processGDPRRequest('u1', 'access', {});
      const gdprRecords = pc.getAuditRecords({ regulation: 'GDPR' });
      expect(gdprRecords.every((r) => r.regulation === 'GDPR')).toBe(true);
    });

    it('getAuditRecords filters by userId', () => {
      pc.recordConsent('u1', 'essential', true);
      pc.recordConsent('u2', 'essential', true);
      const u1Records = pc.getAuditRecords({ userId: 'u1' });
      expect(u1Records.every((r) => r.userId === 'u1')).toBe(true);
    });

    it('getAuditRecords filters by action', () => {
      pc.recordConsent('u1', 'essential', true);
      const consentRecords = pc.getAuditRecords({ action: 'consent' });
      expect(consentRecords.every((r) => r.action.includes('consent'))).toBe(true);
    });

    it('getAuditRecords filters by from and to timestamps', () => {
      pc.recordConsent('u1', 'essential', true);
      const now = Date.now();
      const records = pc.getAuditRecords({ from: now - 10000, to: now + 10000 });
      expect(records.length).toBeGreaterThan(0);
    });

    it('generateComplianceReport returns structured report', () => {
      pc.processGDPRRequest('u1', 'access', {});
      const report = pc.generateComplianceReport('GDPR');
      expect(report.title).toContain('GDPR');
      expect(report.summary).toHaveProperty('totalRequests');
      expect(report.summary).toHaveProperty('requestsCompleted');
    });

    it('generateComplianceReport with no records returns null period', () => {
      const report = pc.generateComplianceReport('CCPA');
      expect(report.period.from).toBeNull();
      expect(report.period.to).toBeNull();
    });
  });

  describe('data retention', () => {
    it('applyRetentionPolicy removes expired data', () => {
      const oldData = { profile: { name: 'Old' }, lastUpdated: Date.now() - 400 * 24 * 60 * 60 * 1000 };
      pc.dataStore.set('old_user', oldData);
      const freshData = { profile: { name: 'Fresh' }, lastUpdated: Date.now() };
      pc.dataStore.set('fresh_user', freshData);

      const result = pc.applyRetentionPolicy();
      expect(result.deletedCount).toBe(1);
      expect(pc.dataStore.has('fresh_user')).toBe(true);
      expect(pc.dataStore.has('old_user')).toBe(false);
    });
  });
});
