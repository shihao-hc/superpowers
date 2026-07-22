const { AdditionalPrivacyRegulations } = require('../../src/compliance/AdditionalPrivacyRegulations');

function createMockPrivacy() {
  const dataRequests = [];
  const breachLog = [];
  const dataStore = new Map();

  return {
    dataRequests,
    breachLog,
    dataStore,
    _logAudit: jest.fn(),
    _getUserPersonalData: jest.fn((userId) => ({
      id: userId,
      profile: { name: 'Test User', email: 'test@example.com' },
      preferences: { theme: 'dark' },
      createdAt: Date.now() - 86400000
    })),
    encrypt: jest.fn((data) => `encrypted:${JSON.stringify(data)}`),
    recordConsent: jest.fn((userId, consentType, granted, data) => ({
      id: `consent_${userId}_${consentType}`,
      userId,
      consentType,
      granted,
      data,
      timestamp: Date.now()
    })),
    generateComplianceReport: jest.fn((regulation) => ({
      regulation,
      status: 'compliant',
      generatedAt: Date.now()
    }))
  };
}

describe('AdditionalPrivacyRegulations', () => {
  let privacy;
  let regulations;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    privacy = createMockPrivacy();
    regulations = new AdditionalPrivacyRegulations(privacy);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('stores privacy compliance reference', () => {
      expect(regulations.privacy).toBe(privacy);
    });
  });

  describe('LGPD - Brazil', () => {
    describe('processLGPDRequest', () => {
      it('creates a request with correct properties', () => {
        regulations.processLGPDRequest('user1', 'access', {});

        expect(privacy.dataRequests).toHaveLength(1);
        expect(privacy.dataRequests[0]).toMatchObject({
          userId: 'user1',
          type: 'access',
          regulation: 'LGPD',
          data: {}
        });
        expect(privacy.dataRequests[0].id).toMatch(/^lgpd_/);
        expect(privacy.dataRequests[0].receivedAt).toBeDefined();
        expect(privacy.dataRequests[0].completedAt).toBeDefined();
        expect(privacy._logAudit).toHaveBeenCalledWith('lgpd_request', 'received', 'user1', { requestType: 'access' });
      });

      it('handles access request type', () => {
        const result = regulations.processLGPDRequest('user1', 'access', {});

        expect(result).toMatchObject({
          status: 'completed',
          controller: 'UltraWork AI Brazil',
          dpo: 'dpo@ultrawork.ai'
        });
        expect(result.data).toEqual(privacy._getUserPersonalData('user1'));
        expect(privacy._logAudit).toHaveBeenCalledWith('lgpd_request', 'completed', 'user1', { type: 'access' });
      });

      it('handles correction request type', () => {
        privacy.dataStore.set('user1', {
          profile: { name: 'Old Name', email: 'test@example.com' },
          lastUpdated: Date.now() - 86400000
        });

        const result = regulations.processLGPDRequest('user1', 'correction', {
          corrections: { name: 'New Name' }
        });

        expect(result.status).toBe('completed');
        expect(result.correctionsApplied).toEqual({ name: 'New Name' });
        expect(privacy.dataStore.get('user1').profile.name).toBe('New Name');
      });

      it('handles correction when userData not in store', () => {
        const result = regulations.processLGPDRequest('newuser', 'correction', {
          corrections: { name: 'Test' }
        });

        expect(result.status).toBe('completed');
        expect(result.correctionsApplied).toEqual({ name: 'Test' });
      });

      it('handles deletion request type', () => {
        privacy.dataStore.set('user1', {
          profile: { name: 'Test User' },
          lastUpdated: Date.now()
        });

        const result = regulations.processLGPDRequest('user1', 'deletion', {
          legalBasis: 'consent_withdrawn'
        });

        expect(result.status).toBe('completed');
        expect(result.notice).toContain('15 days');
        expect(privacy.dataStore.has('user1')).toBe(false);
        expect(privacy._logAudit).toHaveBeenCalledWith('lgpd_request', 'completed', 'user1', {
          type: 'deletion',
          legalBasis: 'consent_withdrawn'
        });
      });

      it('handles deletion when userData not in store', () => {
        const result = regulations.processLGPDRequest('unknownuser', 'deletion', {
          legalBasis: 'consent_withdrawn'
        });

        expect(result.status).toBe('completed');
        expect(result.notice).toContain('15 days');
      });

      it('handles portability request type', () => {
        const userData = { id: 'user1', profile: { name: 'Test' } };
        privacy._getUserPersonalData.mockReturnValue(userData);
        privacy.encrypt.mockReturnValue('encrypted-data');

        const result = regulations.processLGPDRequest('user1', 'portability', {});

        expect(result.status).toBe('completed');
        expect(result.format).toBe('json');
        expect(result.interoperableFormat).toBe(true);
        expect(privacy._getUserPersonalData).toHaveBeenCalledWith('user1');
        expect(privacy.encrypt).toHaveBeenCalledWith(userData);
      });

      it('handles information request type', () => {
        const result = regulations.processLGPDRequest('user1', 'information', {});

        expect(result.status).toBe('completed');
        expect(result.information.sharedWith).toEqual(expect.arrayContaining(['Third-party analytics']));
        expect(result.information.legalBasis).toContain('Consent');
        expect(result.information.internationalTransfer.transferred).toBe(true);
        expect(result.information.retention).toContain('5 years');
      });

      it('handles consent request type', () => {
        const result = regulations.processLGPDRequest('user1', 'consent', {
          consentType: 'marketing',
          granted: true,
          purpose: 'Email marketing'
        });

        expect(result.status).toBe('completed');
        expect(result.consent).toBeDefined();
        expect(result.notice).toContain('withdrawn at any time');
        expect(privacy.recordConsent).toHaveBeenCalledWith('user1', 'marketing', true, {
          consentType: 'marketing',
          granted: true,
          purpose: 'Email marketing',
          regulation: 'LGPD'
        });
      });

      it('returns error for unknown request type', () => {
        const result = regulations.processLGPDRequest('user1', 'unknown_type', {});

        expect(result).toEqual({ error: 'Unknown request type' });
      });
    });

    describe('getLGPDReport', () => {
      it('returns report with zeros when no requests exist', () => {
        const report = regulations.getLGPDReport();

        expect(report.regulation).toBe('LGPD');
        expect(report.name).toBe('Lei Geral de Proteção de Dados');
        expect(report.jurisdiction).toBe('Brazil');
        expect(report.summary.totalRequests).toBe(0);
        expect(report.summary.completedOnTime).toBe(0);
        expect(report.summary.averageResponseTime).toBe(0);
        expect(report.summary.dataBreaches).toBe(0);
        expect(report.summary.consentWithdrawals).toBe(0);
      });

      it('calculates summary from LGPD requests', () => {
        jest.setSystemTime(new Date('2026-06-01T00:00:00Z'));
        regulations.processLGPDRequest('user1', 'access', {});
        jest.setSystemTime(new Date('2026-06-10T00:00:00Z'));
        regulations.processLGPDRequest('user2', 'consent', { granted: false, consentType: 'marketing', purpose: 'test' });

        jest.setSystemTime(new Date('2026-07-01T00:00:00Z'));
        regulations.processLGPDRequest('user3', 'access', {});

        const report = regulations.getLGPDReport();

        expect(report.summary.totalRequests).toBe(3);
        expect(report.summary.completedOnTime).toBe(3);
        expect(report.summary.dataBreaches).toBe(0);
        expect(report.summary.consentWithdrawals).toBe(1);
      });

      it('excludes non-LGPD requests from summary', () => {
        regulations.processLGPDRequest('user1', 'access', {});
        regulations.processPIPEDARequest('user2', 'access', {});

        const report = regulations.getLGPDReport();

        expect(report.summary.totalRequests).toBe(1);
      });

      it('includes compliance status assessment', () => {
        const report = regulations.getLGPDReport();

        expect(report.complianceStatus).toBeDefined();
        expect(report.complianceStatus.articlesImplemented).toMatchObject({
          'Article 6 - Processing Principles': true,
          'Article 7 - Legal Basis': true,
          'Article 8 - Consent': true
        });
        expect(report.complianceStatus.riskLevel).toBe('low');
      });
    });
  });

  describe('PIPEDA - Canada', () => {
    describe('processPIPEDARequest', () => {
      it('creates a request with correct properties', () => {
        regulations.processPIPEDARequest('user1', 'access', {});

        expect(privacy.dataRequests).toHaveLength(1);
        expect(privacy.dataRequests[0]).toMatchObject({
          userId: 'user1',
          type: 'access',
          regulation: 'PIPEDA'
        });
        expect(privacy.dataRequests[0].id).toMatch(/^pipeda_/);
        expect(privacy._logAudit).toHaveBeenCalledWith('pipeda_request', 'received', 'user1', { requestType: 'access' });
      });

      it('handles access request type', () => {
        const result = regulations.processPIPEDARequest('user1', 'access', {});

        expect(result.status).toBe('completed');
        expect(result.organization).toBe('UltraWork AI Canada');
        expect(result.accessPrinciples).toBeDefined();
        expect(result.accessPrinciples.purpose).toContain('Identifying purposes');
        expect(privacy._getUserPersonalData).toHaveBeenCalledWith('user1');
        expect(privacy._logAudit).toHaveBeenCalledWith('pipeda_request', 'completed', 'user1', { type: 'access' });
      });

      it('handles correction request type', () => {
        privacy.dataStore.set('user1', {
          profile: { name: 'Old Name' },
          lastUpdated: Date.now() - 86400000
        });

        const result = regulations.processPIPEDARequest('user1', 'correction', {
          corrections: { name: 'New Name' }
        });

        expect(result.status).toBe('completed');
        expect(result.correctionsApplied).toEqual({ name: 'New Name' });
        expect(result.note).toContain('third parties');
        expect(privacy.dataStore.get('user1').profile.name).toBe('New Name');
      });

      it('handles withdraw request type', () => {
        const result = regulations.processPIPEDARequest('user1', 'withdraw', {
          withdrawalType: 'marketing'
        });

        expect(result.status).toBe('completed');
        expect(result.withdrawalType).toBe('marketing');
        expect(result.impact).toBe('You will no longer receive marketing communications');
      });

      it('assesses withdrawal impact for different types', () => {
        const r1 = regulations.processPIPEDARequest('user1', 'withdraw', { withdrawalType: 'marketing' });
        expect(r1.impact).toContain('no longer receive marketing communications');

        const r2 = regulations.processPIPEDARequest('user2', 'withdraw', { withdrawalType: 'analytics' });
        expect(r2.impact).toContain('Limited analytics');

        const r3 = regulations.processPIPEDARequest('user3', 'withdraw', { withdrawalType: 'personalization' });
        expect(r3.impact).toContain('less personalized');

        const r4 = regulations.processPIPEDARequest('user4', 'withdraw', { withdrawalType: 'account' });
        expect(r4.impact).toContain('Account deletion');

        const r5 = regulations.processPIPEDARequest('user5', 'withdraw', { withdrawalType: 'unknown' });
        expect(r5.impact).toBe('Impact will be assessed');
      });

      it('handles sensitivity request type', () => {
        const result = regulations.processPIPEDARequest('user1', 'sensitivity', {});

        expect(result.status).toBe('completed');
        expect(result.sensitivityInfo.sensitiveDataCollected).toContain('Financial information');
        expect(result.sensitivityInfo.safeguards).toContain('Encryption at rest');
        expect(result.sensitivityInfo.accountability).toBe('Chief Privacy Officer designated');
      });

      it('returns error for unknown request type', () => {
        const result = regulations.processPIPEDARequest('user1', 'unknown', {});

        expect(result).toEqual({ error: 'Unknown request type' });
      });
    });

    describe('getPIPEDAReport', () => {
      it('returns report with zeros when no PIPEDA requests', () => {
        const report = regulations.getPIPEDAReport();

        expect(report.regulation).toBe('PIPEDA');
        expect(report.jurisdiction).toBe('Canada');
        expect(report.summary.totalRequests).toBe(0);
        expect(report.summary.accessRequests).toBe(0);
        expect(report.summary.correctionRequests).toBe(0);
        expect(report.summary.breachNotifications).toBe(0);
      });

      it('counts requests by type', () => {
        regulations.processPIPEDARequest('user1', 'access', {});
        regulations.processPIPEDARequest('user2', 'correction', { corrections: { name: 'N' } });
        regulations.processPIPEDARequest('user3', 'access', {});

        const report = regulations.getPIPEDAReport();

        expect(report.summary.totalRequests).toBe(3);
        expect(report.summary.accessRequests).toBe(2);
        expect(report.summary.correctionRequests).toBe(1);
      });

      it('includes principles compliance', () => {
        const report = regulations.getPIPEDAReport();

        expect(report.principlesCompliance).toBeDefined();
        expect(report.principlesCompliance.accountability.status).toBe('compliant');
        expect(report.principlesCompliance.consent.status).toBe('compliant');
        expect(report.principlesCompliance.safeguards.status).toBe('compliant');
      });
    });
  });

  describe('Australia Privacy Act', () => {
    describe('processPrivacyActRequest', () => {
      it('creates a request with correct properties', () => {
        regulations.processPrivacyActRequest('user1', 'access', {});

        expect(privacy.dataRequests).toHaveLength(1);
        expect(privacy.dataRequests[0]).toMatchObject({
          userId: 'user1',
          type: 'access',
          regulation: 'AU_PRIVACY'
        });
        expect(privacy.dataRequests[0].id).toMatch(/^au_priv_/);
        expect(privacy._logAudit).toHaveBeenCalledWith('au_privacy_request', 'received', 'user1', { requestType: 'access' });
      });

      it('handles access request type', () => {
        const result = regulations.processPrivacyActRequest('user1', 'access', {});

        expect(result.status).toBe('completed');
        expect(result.notice).toContain('30 days');
        expect(result.oaicGuidance).toContain('oaic.gov.au');
        expect(privacy._getUserPersonalData).toHaveBeenCalledWith('user1');
      });

      it('handles correction request type', () => {
        privacy.dataStore.set('user1', {
          profile: { name: 'Old Name' },
          lastUpdated: Date.now() - 86400000
        });

        const result = regulations.processPrivacyActRequest('user1', 'correction', {
          corrections: { name: 'New Name' },
          reason: 'Incorrect entry'
        });

        expect(result.status).toBe('completed');
        expect(result.correctionsApplied).toEqual({ name: 'New Name' });
        expect(result.reason).toBe('Incorrect entry');
        expect(result.notice).toContain('overseas recipients');
        expect(privacy.dataStore.get('user1').profile.name).toBe('New Name');
      });

      it('handles correction when userData not in store', () => {
        const result = regulations.processPrivacyActRequest('newuser', 'correction', {
          corrections: { email: 'new@test.com' },
          reason: 'Typo'
        });

        expect(result.status).toBe('completed');
        expect(result.correctionsApplied).toEqual({ email: 'new@test.com' });
        expect(result.reason).toBe('Typo');
      });

      it('handles anon request type', () => {
        const result = regulations.processPrivacyActRequest('user1', 'anon', {});

        expect(result.status).toBe('completed');
        expect(result.options.anonymization).toContain('anonymized for research');
        expect(result.options.deidentification).toContain('Pseudonymity');
      });

      it('handles complaint request type', () => {
        const result = regulations.processPrivacyActRequest('user1', 'complaint', {
          complaintDetails: 'Data shared without consent'
        });

        expect(result.status).toBe('acknowledged');
        expect(result.complaintDetails).toBe('Data shared without consent');
        expect(result.nextSteps).toHaveLength(4);
        expect(result.nextSteps[0]).toBe('Complaint received and acknowledged');
        expect(result.oaicContact).toContain('oaic.gov.au');
      });

      it('returns error for unknown request type', () => {
        const result = regulations.processPrivacyActRequest('user1', 'unknown', {});

        expect(result).toEqual({ error: 'Unknown request type' });
      });
    });

    describe('getAustraliaPrivacyReport', () => {
      it('returns report with zeros when no AU requests', () => {
        const report = regulations.getAustraliaPrivacyReport();

        expect(report.regulation).toBe('AU_PRIVACY');
        expect(report.jurisdiction).toBe('Australia');
        expect(report.summary.totalRequests).toBe(0);
        expect(report.summary.appsProcessed).toBe(0);
        expect(report.summary.notifiableBreaches).toBe(0);
        expect(report.summary.eligibleDataBrokers).toBe(0);
      });

      it('counts AU requests', () => {
        regulations.processPrivacyActRequest('user1', 'access', {});
        regulations.processPrivacyActRequest('user2', 'complaint', { complaintDetails: 'test' });

        const report = regulations.getAustraliaPrivacyReport();

        expect(report.summary.totalRequests).toBe(2);
        expect(report.summary.appsProcessed).toBe(2);
      });

      it('includes app compliance status', () => {
        const report = regulations.getAustraliaPrivacyReport();

        expect(report.appCompliance).toBeDefined();
        expect(report.appCompliance.appName).toBe('UltraWork AI');
        expect(report.appCompliance.smallBusiness).toBe(false);
      });

      it('includes APP compliance', () => {
        const report = regulations.getAustraliaPrivacyReport();

        expect(report.australianPrivacyPrinciples).toBeDefined();
        expect(report.australianPrivacyPrinciples.APP1).toEqual({
          name: 'Open and transparent management',
          status: 'compliant'
        });
        expect(report.australianPrivacyPrinciples.APP13).toEqual({
          name: 'Correction rights',
          status: 'compliant'
        });
      });
    });
  });

  describe('Utility methods', () => {
    describe('_calculateAvgResponseTime', () => {
      it('returns 0 for empty requests array', () => {
        expect(regulations._calculateAvgResponseTime([])).toBe(0);
      });

      it('returns 0 when no requests are completed', () => {
        const requests = [
          { completedAt: null, receivedAt: 1000 },
          { completedAt: null, receivedAt: 2000 }
        ];
        expect(regulations._calculateAvgResponseTime(requests)).toBe(0);
      });

      it('calculates average response time in days', () => {
        const now = Date.now();
        const day = 24 * 60 * 60 * 1000;

        const requests = [
          { completedAt: now, receivedAt: now - 2 * day },
          { completedAt: now, receivedAt: now - 4 * day }
        ];

        expect(regulations._calculateAvgResponseTime(requests)).toBe(3);
      });

      it('handles single completed request', () => {
        const now = Date.now();
        const day = 24 * 60 * 60 * 1000;

        const requests = [
          { completedAt: now, receivedAt: now - 5 * day }
        ];

        expect(regulations._calculateAvgResponseTime(requests)).toBe(5);
      });
    });

    describe('generateAllRegulationsReport', () => {
      it('combines all regulation reports', () => {
        regulations.processLGPDRequest('user1', 'access', {});
        regulations.processPIPEDARequest('user2', 'access', {});
        regulations.processPrivacyActRequest('user3', 'access', {});

        const report = regulations.generateAllRegulationsReport();

        expect(report.gdpr).toEqual({
          regulation: 'GDPR',
          status: 'compliant',
          generatedAt: Date.now()
        });
        expect(report.lgpd.regulation).toBe('LGPD');
        expect(report.lgpd.summary.totalRequests).toBe(1);
        expect(report.pipeda.regulation).toBe('PIPEDA');
        expect(report.pipeda.summary.totalRequests).toBe(1);
        expect(report.auPrivacy.regulation).toBe('AU_PRIVACY');
        expect(report.auPrivacy.summary.totalRequests).toBe(1);
      });
    });
  });
});
