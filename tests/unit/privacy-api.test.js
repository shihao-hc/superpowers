const express = require('express');

const mockPrivacyInstance = {
  getConsentStatus: jest.fn(),
  recordConsent: jest.fn(),
  withdrawConsent: jest.fn(),
  processGDPRRequest: jest.fn(),
  processCCPARequest: jest.fn(),
  processHIPAARecord: jest.fn(),
  getPHIAccessLog: jest.fn(),
  generateComplianceReport: jest.fn(),
  getAuditRecords: jest.fn(),
  logBreach: jest.fn(),
  assessBreachRisk: jest.fn(),
  applyRetentionPolicy: jest.fn(),
  dataRequests: [],
  breachLog: [],
  auditRecords: [],
  dataStore: new Map()
};

const mockI18nInstance = {
  getAvailableLocales: jest.fn(),
  getLocale: jest.fn(),
  setLocale: jest.fn(),
  getUITranslations: jest.fn()
};

jest.mock('express', () => {
  const mockRouter = {
    get: jest.fn().mockReturnThis(),
    post: jest.fn().mockReturnThis(),
    put: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis()
  };
  return { Router: jest.fn(() => mockRouter) };
});

jest.mock('../../src/compliance/PrivacyCompliance', () => ({
  PrivacyCompliance: jest.fn(() => mockPrivacyInstance)
}));

jest.mock('../../i18n/I18n', () => ({ I18n: jest.fn(() => mockI18nInstance) }), { virtual: true });

describe('PrivacyAPI', () => {
  let mockRouter;

  beforeAll(() => {
    mockRouter = express.Router();
    require('../../src/api/PrivacyAPI');
  });

  beforeEach(() => {
    Object.values(mockPrivacyInstance).filter(jest.isMockFunction).forEach(fn => fn.mockClear());
    Object.values(mockI18nInstance).filter(jest.isMockFunction).forEach(fn => fn.mockClear());

    mockPrivacyInstance.getConsentStatus.mockReturnValue({ granted: ['essential'] });
    mockPrivacyInstance.recordConsent.mockImplementation((userId, type, granted) => ({
      id: 'c1', userId, type, granted, timestamp: Date.now()
    }));
    mockPrivacyInstance.withdrawConsent.mockReturnValue({ success: true });
    mockPrivacyInstance.processGDPRRequest.mockReturnValue({ requestId: 'r1', status: 'submitted' });
    mockPrivacyInstance.processCCPARequest.mockReturnValue({ requestId: 'r2', status: 'submitted' });
    mockPrivacyInstance.processHIPAARecord.mockReturnValue('phi-1');
    mockPrivacyInstance.getPHIAccessLog.mockReturnValue([]);
    mockPrivacyInstance.generateComplianceReport.mockReturnValue({ regulation: 'GDPR', status: 'compliant' });
    mockPrivacyInstance.getAuditRecords.mockReturnValue([]);
    mockPrivacyInstance.logBreach.mockImplementation(data => ({ id: 'b1', ...data }));
    mockPrivacyInstance.assessBreachRisk.mockReturnValue({ level: 'low', score: 0.2 });
    mockPrivacyInstance.applyRetentionPolicy.mockReturnValue({ deletedRecords: 0 });
    mockPrivacyInstance.dataRequests = [];
    mockPrivacyInstance.breachLog = [];
    mockPrivacyInstance.auditRecords = [];
    mockPrivacyInstance.dataStore = new Map();

    mockI18nInstance.getAvailableLocales.mockReturnValue(['zh-CN', 'en', 'ja', 'de', 'fr', 'es', 'ar']);
    mockI18nInstance.getLocale.mockReturnValue('zh-CN');
    mockI18nInstance.setLocale.mockReturnValue(true);
    mockI18nInstance.getUITranslations.mockReturnValue({ welcome: '欢迎' });
  });

  function invokeRoute(method, path, req, res) {
    const call = mockRouter[method].mock.calls.find(c => c[0] === path);
    const handlers = call.slice(1);
    let idx = 0;
    const next = () => { if (idx < handlers.length) handlers[idx++](req, res, next); };
    next();
  }

  function makeRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn(), setHeader: jest.fn() };
  }

  function makeAuthReq(overrides = {}) {
    return { headers: { authorization: 'Bearer test-token' }, user: null, body: {}, query: {}, params: {}, ...overrides };
  }

  describe('requireAuth middleware', () => {
    it('returns 401 when no auth header and no user', () => {
      const res = makeRes();
      invokeRoute('get', '/privacy', { headers: {} }, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('sets privacyUserId from token substring', () => {
      const req = makeAuthReq({ headers: { authorization: 'Bearer abc123def456' }, user: null });
      const res = makeRes();
      invokeRoute('get', '/privacy', req, res);
      expect(req.privacyUserId).toBe('user_abc123def456');
    });

    it('uses user.id over token', () => {
      const req = makeAuthReq({ headers: { authorization: 'Bearer token' }, user: { id: 'uid-42' } });
      const res = makeRes();
      invokeRoute('get', '/privacy', req, res);
      expect(req.privacyUserId).toBe('uid-42');
    });
  });

  describe('GET /privacy', () => {
    it('returns consent status for authenticated user', () => {
      mockPrivacyInstance.getConsentStatus.mockReturnValue({ granted: ['essential', 'analytics'] });
      const res = makeRes();
      invokeRoute('get', '/privacy', makeAuthReq(), res);
      expect(mockPrivacyInstance.getConsentStatus).toHaveBeenCalledWith('user_test-token');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user_test-token',
        consentStatus: { granted: ['essential', 'analytics'] }
      }));
    });
  });

  describe('POST /consent', () => {
    it('returns 400 when consentType missing', () => {
      const res = makeRes();
      invokeRoute('post', '/consent', makeAuthReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'consentType required and must be string' });
    });

    it('returns 400 when consentType not a string', () => {
      const res = makeRes();
      invokeRoute('post', '/consent', makeAuthReq({ body: { consentType: 123 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for invalid consent type value', () => {
      const res = makeRes();
      invokeRoute('post', '/consent', makeAuthReq({ body: { consentType: 'invalid_type' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid consentType' });
    });

    it('records consent for valid types', () => {
      const res = makeRes();
      invokeRoute('post', '/consent', makeAuthReq({ body: { consentType: 'marketing', granted: true, details: 'v1' } }), res);
      expect(mockPrivacyInstance.recordConsent).toHaveBeenCalledWith('user_test-token', 'marketing', true, 'v1');
      expect(res.json).toHaveBeenCalledWith({ success: true, consent: expect.any(Object) });
    });

    it('records consent with granted=false when not provided', () => {
      const res = makeRes();
      invokeRoute('post', '/consent', makeAuthReq({ body: { consentType: 'analytics' } }), res);
      expect(mockPrivacyInstance.recordConsent).toHaveBeenCalledWith('user_test-token', 'analytics', false, undefined);
    });
  });

  describe('POST /consent/withdraw', () => {
    it('returns 400 when consentType missing', () => {
      const res = makeRes();
      invokeRoute('post', '/consent/withdraw', makeAuthReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('withdraws consent and returns result', () => {
      mockPrivacyInstance.withdrawConsent.mockReturnValue({ success: true });
      const res = makeRes();
      invokeRoute('post', '/consent/withdraw', makeAuthReq({ body: { consentType: 'marketing' } }), res);
      expect(mockPrivacyInstance.withdrawConsent).toHaveBeenCalledWith('user_test-token', 'marketing');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('POST /gdpr/request', () => {
    it('returns 400 when requestType missing', () => {
      const res = makeRes();
      invokeRoute('post', '/gdpr/request', makeAuthReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('processes GDPR request', () => {
      const res = makeRes();
      invokeRoute('post', '/gdpr/request', makeAuthReq({ body: { requestType: 'access', data: { scope: 'all' } } }), res);
      expect(mockPrivacyInstance.processGDPRRequest).toHaveBeenCalledWith('user_test-token', 'access', { scope: 'all' });
      expect(res.json).toHaveBeenCalledWith({ requestId: 'r1', status: 'submitted' });
    });
  });

  describe('POST /ccpa/request', () => {
    it('uses anonymous when no user and no auth', () => {
      const res = makeRes();
      invokeRoute('post', '/ccpa/request', { headers: {}, body: { requestType: 'know' } }, res);
      expect(mockPrivacyInstance.processCCPARequest).toHaveBeenCalledWith('anonymous', 'know', undefined);
    });

    it('uses user.id when available', () => {
      const res = makeRes();
      invokeRoute('post', '/ccpa/request', { user: { id: 'uid-7' }, body: { requestType: 'delete' } }, res);
      expect(mockPrivacyInstance.processCCPARequest).toHaveBeenCalledWith('uid-7', 'delete', undefined);
    });

    it('returns 400 when requestType missing', () => {
      const res = makeRes();
      invokeRoute('post', '/ccpa/request', { body: {} }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /hipaa/phi', () => {
    it('returns 400 when phiData missing', () => {
      const res = makeRes();
      invokeRoute('post', '/hipaa/phi', makeAuthReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'phiData required and must be object' });
    });

    it('returns 400 for invalid phiData structure', () => {
      const res = makeRes();
      invokeRoute('post', '/hipaa/phi', makeAuthReq({ body: { phiData: { foo: 'bar' } } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid phiData structure' });
    });

    it('processes valid PHI record', () => {
      const phiData = { demographics: { name: 'Test' }, diagnosis: 'A1', treatment: 'Rx' };
      const res = makeRes();
      invokeRoute('post', '/hipaa/phi', makeAuthReq({ body: { phiData } }), res);
      expect(mockPrivacyInstance.processHIPAARecord).toHaveBeenCalledWith('user_test-token', phiData);
      expect(res.json).toHaveBeenCalledWith({ success: true, recordId: 'phi-1' });
    });
  });

  describe('GET /hipaa/access-log', () => {
    it('returns PHI access log for authenticated user', () => {
      const logEntry = { action: 'VIEW', userId: 'user_test-token', timestamp: Date.now() };
      mockPrivacyInstance.getPHIAccessLog.mockReturnValue([logEntry]);
      const res = makeRes();
      invokeRoute('get', '/hipaa/access-log', makeAuthReq(), res);
      expect(mockPrivacyInstance.getPHIAccessLog).toHaveBeenCalledWith('user_test-token');
      expect(res.json).toHaveBeenCalledWith({ accessLog: [logEntry] });
    });
  });

  describe('GET /i18n/locales', () => {
    it('returns current locale and available locales', () => {
      const res = makeRes();
      invokeRoute('get', '/i18n/locales', {}, res);
      expect(mockI18nInstance.getAvailableLocales).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        currentLocale: 'zh-CN',
        availableLocales: ['zh-CN', 'en', 'ja', 'de', 'fr', 'es', 'ar']
      });
    });
  });

  describe('POST /i18n/locale', () => {
    it('returns 400 when locale missing', () => {
      const res = makeRes();
      invokeRoute('post', '/i18n/locale', { body: {} }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for unsupported locale', () => {
      const res = makeRes();
      invokeRoute('post', '/i18n/locale', { body: { locale: 'xx' } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('sets locale and returns translations on success', () => {
      const res = makeRes();
      invokeRoute('post', '/i18n/locale', { body: { locale: 'en' } }, res);
      expect(mockI18nInstance.setLocale).toHaveBeenCalledWith('en');
      expect(res.json).toHaveBeenCalledWith({
        success: true, locale: 'zh-CN', translations: { welcome: '欢迎' }
      });
    });

    it('returns 400 when setLocale returns false', () => {
      mockI18nInstance.setLocale.mockReturnValue(false);
      const res = makeRes();
      invokeRoute('post', '/i18n/locale', { body: { locale: 'zh-CN' } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('GET /i18n/translations', () => {
    it('returns translations without locale param', () => {
      const res = makeRes();
      invokeRoute('get', '/i18n/translations', { query: {} }, res);
      expect(res.json).toHaveBeenCalledWith({
        locale: 'zh-CN', translations: { welcome: '欢迎' }
      });
    });

    it('returns 400 for unsupported locale', () => {
      const res = makeRes();
      invokeRoute('get', '/i18n/translations', { query: { locale: 'xx' } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns translations for valid locale param', () => {
      const res = makeRes();
      invokeRoute('get', '/i18n/translations', { query: { locale: 'en' } }, res);
      expect(mockI18nInstance.setLocale).toHaveBeenCalledWith('en');
      expect(res.json).toHaveBeenCalledWith({
        locale: 'zh-CN', translations: { welcome: '欢迎' }
      });
    });
  });

  describe('GET /dashboard', () => {
    it('returns dashboard summary from privacy data', () => {
      mockPrivacyInstance.dataRequests = [
        { regulation: 'GDPR', status: 'pending' },
        { regulation: 'GDPR', status: 'completed' },
        { regulation: 'CCPA', status: 'completed' }
      ];
      mockPrivacyInstance.breachLog = [{ id: 'b1', type: 'exposure' }];
      mockPrivacyInstance.auditRecords = [{ action: 'ACCESS', timestamp: Date.now() }];
      const res = makeRes();
      invokeRoute('get', '/dashboard', {}, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        summary: expect.objectContaining({
          gdprRequests: 2,
          ccpaRequests: 1,
          pendingRequests: 1,
          completedRequests: 2,
          breachCount: 1,
          consentRate: 0.85
        }),
        regulations: expect.arrayContaining([
          expect.objectContaining({ id: 'gdpr' }),
          expect.objectContaining({ id: 'ccpa' }),
          expect.objectContaining({ id: 'hipaa' })
        ]),
        recentActivity: expect.any(Array)
      }));
    });
  });

  describe('GET /compliance/report/:regulation', () => {
    it('returns 400 for invalid regulation', () => {
      const res = makeRes();
      invokeRoute('get', '/compliance/report/:regulation', { params: { regulation: 'PCI' } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid regulation' });
    });

    it('generates report for valid regulation case-insensitively', () => {
      const res = makeRes();
      invokeRoute('get', '/compliance/report/:regulation', { params: { regulation: 'gdpr' } }, res);
      expect(mockPrivacyInstance.generateComplianceReport).toHaveBeenCalledWith('GDPR');
      expect(res.json).toHaveBeenCalledWith({ regulation: 'GDPR', status: 'compliant' });
    });
  });

  describe('GET /audit/export', () => {
    const records = [
      { timestamp: 1700000000000, action: 'ACCESS', result: 'GRANTED', userId: 'u1', regulation: 'GDPR' },
      { timestamp: 1700000001000, action: 'DELETE', result: 'DENIED', userId: 'u2', regulation: null }
    ];

    it('returns records as JSON by default', () => {
      mockPrivacyInstance.getAuditRecords.mockReturnValue(records);
      const res = makeRes();
      invokeRoute('get', '/audit/export', { query: {} }, res);
      expect(res.json).toHaveBeenCalledWith({ records, count: 2 });
    });

    it('returns CSV when format=csv', () => {
      mockPrivacyInstance.getAuditRecords.mockReturnValue(records);
      const res = makeRes();
      invokeRoute('get', '/audit/export', { query: { format: 'csv' } }, res);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename=audit_log.csv');
      expect(res.send).toHaveBeenCalled();
      const csv = res.send.mock.calls[0][0];
      expect(csv).toContain('Timestamp,Action,Result,User,Regulation');
      expect(csv).toContain('GRANTED,u1,GDPR');
      expect(csv).toContain('DENIED,u2,N/A');
    });

    it('passes filter params to getAuditRecords', () => {
      const res = makeRes();
      invokeRoute('get', '/audit/export', { query: { regulation: 'HIPAA', from: '2024-01-01', to: '2024-12-31' } }, res);
      expect(mockPrivacyInstance.getAuditRecords).toHaveBeenCalledWith({
        regulation: 'HIPAA',
        from: new Date('2024-01-01').getTime(),
        to: new Date('2024-12-31').getTime()
      });
    });
  });

  describe('POST /breach/report', () => {
    it('reports breach and returns risk assessment', () => {
      mockPrivacyInstance.logBreach.mockImplementation(data => ({ id: 'b1', ...data }));
      mockPrivacyInstance.assessBreachRisk.mockReturnValue({ level: 'high', score: 0.9 });
      const body = { type: 'data_exposure', description: 'Leak', affectedUsers: 100, dataTypes: ['email'], dataEncrypted: false };
      const res = makeRes();
      invokeRoute('post', '/breach/report', { body }, res);
      expect(mockPrivacyInstance.logBreach).toHaveBeenCalledWith(body);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        breachId: 'b1',
        riskAssessment: { level: 'high', score: 0.9 },
        nextSteps: ['notify_authority', 'notify_individuals', 'document_breach']
      }));
    });

    it('returns low-risk next steps for low-level breach', () => {
      mockPrivacyInstance.logBreach.mockImplementation(data => ({ id: 'b2', ...data }));
      mockPrivacyInstance.assessBreachRisk.mockReturnValue({ level: 'low', score: 0.2 });
      const res = makeRes();
      invokeRoute('post', '/breach/report', { body: { type: 'minor', description: 'Small', affectedUsers: 1 } }, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        nextSteps: ['document_breach', 'review_controls']
      }));
    });
  });

  describe('GET /breach/:id', () => {
    it('returns 404 when breach not found', () => {
      const res = makeRes();
      invokeRoute('get', '/breach/:id', { params: { id: 'nonexistent' } }, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Breach not found' });
    });

    it('returns breach when found', () => {
      const breach = { id: 'b1', type: 'exposure', timestamp: Date.now() };
      mockPrivacyInstance.breachLog = [breach];
      const res = makeRes();
      invokeRoute('get', '/breach/:id', { params: { id: 'b1' } }, res);
      expect(res.json).toHaveBeenCalledWith(breach);
    });
  });

  describe('POST /retention/apply', () => {
    it('applies retention policy and returns result', () => {
      mockPrivacyInstance.applyRetentionPolicy.mockReturnValue({ deletedRecords: 10, archivedRecords: 3 });
      const res = makeRes();
      invokeRoute('post', '/retention/apply', {}, res);
      expect(mockPrivacyInstance.applyRetentionPolicy).toHaveBeenCalledWith();
      expect(res.json).toHaveBeenCalledWith({ success: true, deletedRecords: 10, archivedRecords: 3 });
    });
  });

  describe('GET /retention/status', () => {
    it('returns retention status from dataStore', () => {
      const now = Date.now();
      mockPrivacyInstance.dataStore = new Map([
        ['k1', { lastUpdated: now - 100000 }],
        ['k2', { lastUpdated: now - 200000 }]
      ]);
      const res = makeRes();
      invokeRoute('get', '/retention/status', {}, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        totalRecords: 2,
        retentionPeriod: '365 days'
      }));
    });

    it('handles empty dataStore', () => {
      mockPrivacyInstance.dataStore = new Map();
      const res = makeRes();
      invokeRoute('get', '/retention/status', {}, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        totalRecords: 0,
        oldestRecord: null,
        retentionPeriod: '365 days'
      }));
    });
  });

  describe('route registration', () => {
    it('registers all expected routes', () => {
      const registeredGets = mockRouter.get.mock.calls.map(c => c[0]).sort();
      const registeredPosts = mockRouter.post.mock.calls.map(c => c[0]).sort();

      expect(registeredGets).toEqual([
        '/audit/export',
        '/breach/:id',
        '/compliance/report/:regulation',
        '/dashboard',
        '/hipaa/access-log',
        '/i18n/locales',
        '/i18n/translations',
        '/privacy',
        '/retention/status'
      ]);

      expect(registeredPosts).toEqual([
        '/breach/report',
        '/ccpa/request',
        '/consent',
        '/consent/withdraw',
        '/gdpr/request',
        '/hipaa/phi',
        '/i18n/locale',
        '/retention/apply'
      ]);

      expect(mockRouter.put).not.toHaveBeenCalled();
      expect(mockRouter.delete).not.toHaveBeenCalled();
    });
  });
});
