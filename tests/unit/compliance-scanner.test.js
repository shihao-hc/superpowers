const { ComplianceScanner } = require('../../src/compliance/ComplianceScanner');

describe('ComplianceScanner', () => {
  let scanner;

  beforeEach(() => {
    jest.useFakeTimers();
    scanner = new ComplianceScanner();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes empty scan results', () => {
      expect(scanner.scanResults).toEqual([]);
    });

    it('initializes lastScan as null', () => {
      expect(scanner.lastScan).toBeNull();
    });

    it('initializes scheduledScans as empty Map', () => {
      expect(scanner.scheduledScans instanceof Map).toBe(true);
      expect(scanner.scheduledScans.size).toBe(0);
    });

    it('initializes remediations as empty Map', () => {
      expect(scanner.remediations instanceof Map).toBe(true);
      expect(scanner.remediations.size).toBe(0);
    });

    it('loads check definitions for all frameworks', () => {
      const frameworks = Object.keys(scanner.checkDefinitions);
      expect(frameworks).toEqual(expect.arrayContaining(['gdpr', 'ccpa', 'hipaa', 'lgpd', 'pipeda', 'au_privacy']));
    });
  });

  describe('checkDefinitions structure', () => {
    it('gdpr has 10 checks', () => {
      expect(scanner.checkDefinitions.gdpr).toHaveLength(10);
    });

    it('ccpa has 4 checks', () => {
      expect(scanner.checkDefinitions.ccpa).toHaveLength(4);
    });

    it('hipaa has 5 checks', () => {
      expect(scanner.checkDefinitions.hipaa).toHaveLength(5);
    });

    it('lgpd has 3 checks', () => {
      expect(scanner.checkDefinitions.lgpd).toHaveLength(3);
    });

    it('pipeda has 2 checks', () => {
      expect(scanner.checkDefinitions.pipeda).toHaveLength(2);
    });

    it('au_privacy has 3 checks', () => {
      expect(scanner.checkDefinitions.au_privacy).toHaveLength(3);
    });

    it('each check has required fields', () => {
      const allChecks = Object.values(scanner.checkDefinitions).flat();
      for (const check of allChecks) {
        expect(check).toHaveProperty('id');
        expect(check).toHaveProperty('category');
        expect(check).toHaveProperty('title');
        expect(check).toHaveProperty('description');
        expect(check).toHaveProperty('severity');
        expect(check).toHaveProperty('check');
        expect(typeof check.check).toBe('function');
      }
    });

    it('check IDs are unique across all frameworks', () => {
      const allIds = Object.values(scanner.checkDefinitions).flat().map((c) => c.id);
      expect(new Set(allIds).size).toBe(allIds.length);
    });
  });

  describe('individual check methods', () => {
    const checksToTest = [
      '_checkConsentCollection',
      '_checkPrivacyNotice',
      '_checkDataPortability',
      '_checkBreachNotification',
      '_checkDPOAppointment',
      '_checkDataRetention',
      '_checkEncryptionAtRest',
      '_checkAccessControls',
      '_checkPIA',
      '_checkDPA',
      '_checkCCPAPrivacyPolicy',
      '_checkDoNotSell',
      '_checkDataCategoriesDisclosure',
      '_checkRequestVerification',
      '_checkPHIEncryption',
      '_checkHIPAAccessControl',
      '_checkAuditTrails',
      '_checkBAA',
      '_checkIncidentResponsePlan',
      '_checkLGPDConsent',
      '_checkLGPDLegalBasis',
      '_checkInternationalTransferSafeguards',
      '_checkPIPEDANotice',
      '_checkPIPEDASafeguards',
      '_checkAUPrivacyPolicy',
      '_checkAUCollectionNotice',
      '_checkDataQuality'
    ];

    for (const method of checksToTest) {
      it(`${method} returns the correct shape`, async () => {
        const result = await scanner[method]();
        expect(result).toHaveProperty('passed');
        expect(result).toHaveProperty('details');
        expect(result).toHaveProperty('evidence');
        expect(result).toHaveProperty('remediation');
      });
    }

    it('_checkPIA returns warning: true', async () => {
      const result = await scanner._checkPIA();
      expect(result.warning).toBe(true);
      expect(result.passed).toBe(true);
      expect(result.remediation).toBeTruthy();
    });

    it('all non-PIA checks return passed: true with null remediation', async () => {
      const allChecks = Object.values(scanner.checkDefinitions).flat();
      for (const check of allChecks) {
        if (check.id === 'gdpr_pia') continue;
        const result = await check.check();
        expect(result.passed).toBe(true);
        expect(result.remediation).toBeNull();
        expect(result.details).toBeTruthy();
        expect(Array.isArray(result.evidence)).toBe(true);
      }
    });
  });

  describe('_getComplianceLevel', () => {
    it('returns excellent for score >= 95', () => {
      expect(scanner._getComplianceLevel(95)).toBe('excellent');
      expect(scanner._getComplianceLevel(100)).toBe('excellent');
    });

    it('returns good for 85-94', () => {
      expect(scanner._getComplianceLevel(85)).toBe('good');
      expect(scanner._getComplianceLevel(90)).toBe('good');
      expect(scanner._getComplianceLevel(94)).toBe('good');
    });

    it('returns fair for 70-84', () => {
      expect(scanner._getComplianceLevel(70)).toBe('fair');
      expect(scanner._getComplianceLevel(80)).toBe('fair');
      expect(scanner._getComplianceLevel(84)).toBe('fair');
    });

    it('returns poor for 50-69', () => {
      expect(scanner._getComplianceLevel(50)).toBe('poor');
      expect(scanner._getComplianceLevel(60)).toBe('poor');
      expect(scanner._getComplianceLevel(69)).toBe('poor');
    });

    it('returns critical for < 50', () => {
      expect(scanner._getComplianceLevel(0)).toBe('critical');
      expect(scanner._getComplianceLevel(49)).toBe('critical');
    });
  });

  describe('runFullScan', () => {
    it('scans all regulations by default', async () => {
      const result = await scanner.runFullScan();
      expect(result.id).toMatch(/^scan_/);
      expect(result.regulations).toHaveLength(6);
      expect(result.regulations.map((r) => r.regulation)).toEqual([
        'gdpr', 'ccpa', 'hipaa', 'lgpd', 'pipeda', 'au_privacy'
      ]);
    });

    it('scans specified regulations only', async () => {
      const result = await scanner.runFullScan({ regulations: ['gdpr', 'hipaa'] });
      expect(result.regulations).toHaveLength(2);
      expect(result.regulations[0].regulation).toBe('gdpr');
      expect(result.regulations[1].regulation).toBe('hipaa');
    });

    it('scans unknown regulation with empty checks', async () => {
      const result = await scanner.runFullScan({ regulations: ['unknown_reg'] });
      expect(result.regulations).toHaveLength(1);
      expect(result.regulations[0].regulation).toBe('unknown_reg');
      expect(result.regulations[0].results).toEqual([]);
    });

    it('computes summary correctly', async () => {
      const result = await scanner.runFullScan();
      const totalChecks = 10 + 4 + 5 + 3 + 2 + 3;
      expect(result.summary.totalChecks).toBe(totalChecks);
      expect(result.summary.passed).toBe(totalChecks);
      expect(result.summary.failed).toBe(0);
      expect(result.summary.warnings).toBe(0);
    });

    it('computes complianceScore as 100 when all pass', async () => {
      const result = await scanner.runFullScan();
      expect(result.complianceScore).toBe(100);
    });

    it('sets complianceLevel to excellent for score 100', async () => {
      const result = await scanner.runFullScan();
      expect(result.complianceLevel).toBe('excellent');
    });

    it('stores scan result in scanResults array', async () => {
      const result = await scanner.runFullScan();
      expect(scanner.scanResults).toHaveLength(1);
      expect(scanner.scanResults[0].id).toBe(result.id);
    });

    it('updates lastScan', async () => {
      const result = await scanner.runFullScan();
      expect(scanner.lastScan.id).toBe(result.id);
    });

    it('generates no issues when all checks pass', async () => {
      const result = await scanner.runFullScan();
      expect(result.issues).toHaveLength(0);
    });

    it('generates no recommendations when all checks pass', async () => {
      const result = await scanner.runFullScan();
      expect(result.recommendations).toHaveLength(0);
    });

    it('runs multiple scans sequentially', async () => {
      const r1 = await scanner.runFullScan();
      jest.advanceTimersByTime(1);
      const r2 = await scanner.runFullScan();
      expect(scanner.scanResults).toHaveLength(2);
      expect(scanner.lastScan.id).toBe(r2.id);
      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe('_scanRegulation', () => {
    it('returns regulation name and results', async () => {
      const checks = scanner.checkDefinitions.gdpr;
      const result = await scanner._scanRegulation('gdpr', checks);
      expect(result.regulation).toBe('gdpr');
      expect(result.results).toHaveLength(10);
    });

    it('returns score of 100 when all pass', async () => {
      const result = await scanner._scanRegulation('gdpr', scanner.checkDefinitions.gdpr);
      expect(result.score).toBe(100);
    });

    it('maps check result status correctly', async () => {
      const result = await scanner._scanRegulation('gdpr', scanner.checkDefinitions.gdpr);
      const consentResult = result.results.find((r) => r.checkId === 'gdpr_consent_collect');
      expect(consentResult.status).toBe('pass');
      expect(consentResult.severity).toBe('critical');
      expect(consentResult.title).toBe('Consent Collection');
      expect(consentResult.evidence).toBeDefined();
    });
  });

  describe('scheduleScan', () => {
    it('schedules a scan task', () => {
      const schedule = scanner.scheduleScan('gdpr', 'daily');
      expect(schedule.regulation).toBe('gdpr');
      expect(schedule.interval).toBe('daily');
      expect(schedule.nextRun).toBeGreaterThan(0);
      expect(scanner.scheduledScans.has('gdpr')).toBe(true);
    });

    it('uses weekly as default interval', () => {
      scanner.scheduleScan('hipaa');
      expect(scanner.scheduledScans.has('hipaa')).toBe(true);
    });
  });

  describe('generateGapReport', () => {
    it('returns error when no scan results', () => {
      const report = scanner.generateGapReport();
      expect(report).toEqual({ error: 'No scan results available. Run a scan first.' });
    });

    it('returns gap report after scan', async () => {
      await scanner.runFullScan();
      const report = scanner.generateGapReport();
      expect(report.reportId).toBe(scanner.lastScan.id);
      expect(report.timestamp).toBe(scanner.lastScan.timestamp);
      expect(report.complianceScore).toBe(100);
      expect(report.complianceLevel).toBe('excellent');
    });

    it('reports gap summary with zero counts when all pass', async () => {
      await scanner.runFullScan();
      const report = scanner.generateGapReport();
      expect(report.gapSummary).toEqual({
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      });
    });

    it('groups gaps by regulation (empty when all pass)', async () => {
      await scanner.runFullScan();
      const report = scanner.generateGapReport();
      expect(report.gapsByRegulation).toEqual({});
    });

    it('generates remediation roadmap with empty phases when all pass', async () => {
      await scanner.runFullScan();
      const report = scanner.generateGapReport();
      expect(report.remediationRoadmap).toHaveProperty('immediate');
      expect(report.remediationRoadmap).toHaveProperty('shortTerm');
      expect(report.remediationRoadmap).toHaveProperty('mediumTerm');
      expect(report.remediationRoadmap.mediumTerm).toHaveLength(0);
    });

    it('estimates effort with zero total hours when all pass', async () => {
      await scanner.runFullScan();
      const report = scanner.generateGapReport();
      expect(report.estimatedEffort).toHaveProperty('totalHours');
      expect(report.estimatedEffort).toHaveProperty('breakdown');
      expect(report.estimatedEffort).toHaveProperty('recommendedTimeline');
      expect(report.estimatedEffort.totalHours).toBe(0);
      expect(report.estimatedEffort.recommendedTimeline).toBe('2-4 weeks');
    });
  });

  describe('_groupGapsByRegulation', () => {
    it('groups gaps by regulation field', () => {
      const gaps = {
        critical: [{ regulation: 'gdpr', title: 'A' }, { regulation: 'ccpa', title: 'B' }],
        high: [{ regulation: 'gdpr', title: 'C' }],
        medium: [],
        low: []
      };
      const grouped = scanner._groupGapsByRegulation(gaps);
      expect(grouped.gdpr).toHaveLength(2);
      expect(grouped.ccpa).toHaveLength(1);
    });

    it('returns empty object when no gaps', () => {
      const gaps = { critical: [], high: [], medium: [], low: [] };
      const grouped = scanner._groupGapsByRegulation(gaps);
      expect(grouped).toEqual({});
    });
  });

  describe('_generateRemediationRoadmap', () => {
    it('maps critical gaps to immediate', () => {
      const gaps = {
        critical: [{ title: 'Critical Issue', description: 'Fix immediately' }],
        high: [],
        medium: []
      };
      const roadmap = scanner._generateRemediationRoadmap(gaps);
      expect(roadmap.immediate).toHaveLength(1);
      expect(roadmap.immediate[0].issue).toBe('Critical Issue');
    });

    it('maps high gaps to shortTerm', () => {
      const gaps = {
        critical: [],
        high: [{ title: 'High Issue', description: 'Fix soon' }],
        medium: []
      };
      const roadmap = scanner._generateRemediationRoadmap(gaps);
      expect(roadmap.shortTerm).toHaveLength(1);
    });

    it('maps medium gaps to mediumTerm', () => {
      const gaps = {
        critical: [],
        high: [],
        medium: [{ title: 'Medium Issue', description: 'Fix later' }]
      };
      const roadmap = scanner._generateRemediationRoadmap(gaps);
      expect(roadmap.mediumTerm).toHaveLength(1);
    });
  });

  describe('_estimateEffort', () => {
    it('calculates totalHours correctly', () => {
      const gaps = {
        critical: [{}, {}],
        high: [{}, {}],
        medium: [{}],
        low: [{}]
      };
      const effort = scanner._estimateEffort(gaps);
      expect(effort.totalHours).toBe(16 + 8 + 2 + 1);
      expect(effort.breakdown.critical).toBe(16);
      expect(effort.breakdown.high).toBe(8);
      expect(effort.breakdown.medium).toBe(2);
      expect(effort.breakdown.low).toBe(1);
    });

    it('recommends immediate timeline when critical gaps exist', () => {
      const effort = scanner._estimateEffort({
        critical: [{}], high: [], medium: [], low: []
      });
      expect(effort.recommendedTimeline).toBe('Immediate');
    });

    it('recommends 2-4 weeks when no critical gaps', () => {
      const effort = scanner._estimateEffort({
        critical: [], high: [{}], medium: [], low: []
      });
      expect(effort.recommendedTimeline).toBe('2-4 weeks');
    });

    it('returns zero hours for no gaps', () => {
      const effort = scanner._estimateEffort({
        critical: [], high: [], medium: [], low: []
      });
      expect(effort.totalHours).toBe(0);
    });
  });

  describe('exportScanResults', () => {
    it('returns error when no scan results', () => {
      expect(scanner.exportScanResults()).toEqual({ error: 'No scan results to export' });
    });

    it('returns latest scan as JSON by default', async () => {
      const scan = await scanner.runFullScan();
      const exported = scanner.exportScanResults();
      expect(exported.id).toBe(scan.id);
      expect(exported.regulations).toBeDefined();
    });

    it('exports as CSV', async () => {
      await scanner.runFullScan();
      const csv = scanner.exportScanResults('csv');
      expect(typeof csv).toBe('string');
      expect(csv).toContain('Regulation,Check ID,Title,Severity,Status,Details');
      expect(csv).toContain('gdpr_consent_collect');
    });

    it('exports as PDF', async () => {
      await scanner.runFullScan();
      const pdf = scanner.exportScanResults('pdf');
      expect(pdf.format).toBe('pdf');
      expect(pdf.content).toContain('COMPLIANCE SCAN REPORT');
      expect(pdf.content).toContain('Compliance Score: 100%');
    });
  });

  describe('_exportToCSV', () => {
    it('has header row', async () => {
      const scan = await scanner.runFullScan();
      const csv = scanner._exportToCSV(scan);
      const lines = csv.split('\n');
      expect(lines[0]).toBe('Regulation,Check ID,Title,Severity,Status,Details');
    });

    it('includes all regulation results', async () => {
      const scan = await scanner.runFullScan();
      const csv = scanner._exportToCSV(scan);
      const lines = csv.split('\n');
      expect(lines.length - 1).toBe(scan.summary.totalChecks);
    });
  });

  describe('_exportToPDF / _generatePDFContent', () => {
    it('contains executive summary section', async () => {
      const scan = await scanner.runFullScan();
      const content = scanner._generatePDFContent(scan);
      expect(content).toContain('EXECUTIVE SUMMARY');
      expect(content).toContain('CHECK RESULTS');
      expect(content).toContain('ISSUES SUMMARY');
      expect(content).toContain('RECOMMENDATIONS');
    });

    it('includes compliance score and level', async () => {
      const scan = await scanner.runFullScan();
      const content = scanner._generatePDFContent(scan);
      expect(content).toContain('Compliance Score: 100%');
      expect(content).toContain('Compliance Level: excellent');
    });

    it('includes scan count details', async () => {
      const scan = await scanner.runFullScan();
      const content = scanner._generatePDFContent(scan);
      expect(content).toContain(`Total Checks: ${scan.summary.totalChecks}`);
      expect(content).toContain(`Passed: ${scan.summary.passed}`);
    });
  });

  describe('getScanHistory', () => {
    it('returns empty array when no scans', () => {
      expect(scanner.getScanHistory()).toEqual([]);
    });

    it('returns scan summary after scans', async () => {
      await scanner.runFullScan();
      const history = scanner.getScanHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toHaveProperty('id');
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('score');
      expect(history[0]).toHaveProperty('level');
      expect(history[0]).toHaveProperty('issues');
      expect(history[0].score).toBe(100);
      expect(history[0].level).toBe('excellent');
    });

    it('includes correct number of issues', async () => {
      await scanner.runFullScan();
      const history = scanner.getScanHistory();
      expect(history[0].issues).toBe(0);
    });

    it('returns history for multiple scans', async () => {
      await scanner.runFullScan();
      await scanner.runFullScan();
      await scanner.runFullScan();
      expect(scanner.getScanHistory()).toHaveLength(3);
    });
  });

  describe('failing checks', () => {
    it('generates issues and recommendations when check fails with remediation', async () => {
      scanner.checkDefinitions.gdpr[0].check = () => Promise.resolve({
        passed: false,
        details: 'Consent mechanism not implemented',
        evidence: [],
        remediation: 'Implement consent mechanism'
      });
      const result = await scanner.runFullScan({ regulations: ['gdpr'] });
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].checkId).toBe('gdpr_consent_collect');
      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].priority).toBe('critical');
      expect(result.recommendations[0].action).toBe('Implement consent mechanism');
    });

    it('generates issues but no recommendations when remediation is null', async () => {
      scanner.checkDefinitions.gdpr[0].check = () => Promise.resolve({
        passed: false,
        details: 'Consent mechanism not implemented',
        evidence: [],
        remediation: null
      });
      const result = await scanner.runFullScan({ regulations: ['gdpr'] });
      expect(result.issues).toHaveLength(1);
      expect(result.recommendations).toHaveLength(0);
    });

    it('updates summary counts and compliance score', async () => {
      scanner.checkDefinitions.gdpr[0].check = () => Promise.resolve({
        passed: false,
        details: 'Fail',
        evidence: [],
        remediation: null
      });
      const result = await scanner.runFullScan({ regulations: ['gdpr'] });
      expect(result.summary.totalChecks).toBe(10);
      expect(result.summary.passed).toBe(9);
      expect(result.summary.failed).toBe(1);
      expect(result.complianceScore).toBe(90);
      expect(result.complianceLevel).toBe('good');
    });
  });

  describe('gap report with failing checks', () => {
    it('classifies issues into severity buckets', async () => {
      const severities = ['low', 'medium', 'high', 'critical'];
      for (let i = 0; i < 4; i++) {
        scanner.checkDefinitions.gdpr[i].severity = severities[i];
        scanner.checkDefinitions.gdpr[i].check = () => Promise.resolve({
          passed: false, details: 'test', evidence: [], remediation: null
        });
      }
      await scanner.runFullScan({ regulations: ['gdpr'] });
      const report = scanner.generateGapReport();
      expect(report.gapSummary.low).toBe(1);
      expect(report.gapSummary.medium).toBe(1);
      expect(report.gapSummary.high).toBe(1);
      expect(report.gapSummary.critical).toBe(1);
      expect(report.estimatedEffort.totalHours).toBeGreaterThan(0);
      expect(report.estimatedEffort.recommendedTimeline).toBe('Immediate');
      expect(report.remediationRoadmap.immediate).toHaveLength(1);
    });

    it('groups gaps by regulation', async () => {
      scanner.checkDefinitions.gdpr[0].check = () => Promise.resolve({
        passed: false, details: 'Fail', evidence: [], remediation: null
      });
      scanner.checkDefinitions.ccpa[0].check = () => Promise.resolve({
        passed: false, details: 'Fail', evidence: [], remediation: null
      });
      await scanner.runFullScan();
      const report = scanner.generateGapReport();
      expect(report.gapsByRegulation.gdpr).toHaveLength(1);
      expect(report.gapsByRegulation.ccpa).toHaveLength(1);
    });
  });

  describe('_generatePDFContent with recommendations', () => {
    it('renders recommendation lines', async () => {
      scanner.checkDefinitions.gdpr[0].check = () => Promise.resolve({
        passed: false,
        details: 'Fail',
        evidence: [],
        remediation: 'Fix the consent mechanism'
      });
      const scan = await scanner.runFullScan({ regulations: ['gdpr'] });
      const content = scanner._generatePDFContent(scan);
      expect(content).toContain('gdpr_consent_collect');
      expect(content).toContain('Fix the consent mechanism');
    });

    it('includes issues filter counts', async () => {
      scanner.checkDefinitions.gdpr[0].check = () => Promise.resolve({
        passed: false, details: 'Fail', evidence: [], remediation: 'Fix'
      });
      const scan = await scanner.runFullScan({ regulations: ['gdpr'] });
      const content = scanner._generatePDFContent(scan);
      expect(content).toContain('Critical: 0');
      expect(content).toContain('High: 0');
    });
  });

  describe('status mapping', () => {
    it('maps failing check with warning to warning status', async () => {
      scanner.checkDefinitions.gdpr[0].check = () => Promise.resolve({
        passed: false,
        warning: true,
        details: 'Needs review',
        evidence: [],
        remediation: null
      });
      const result = await scanner.runFullScan({ regulations: ['gdpr'] });
      const consentResult = result.regulations[0].results.find((r) => r.checkId === 'gdpr_consent_collect');
      expect(consentResult.status).toBe('warning');
    });
  });

  describe('scheduleScan edge cases', () => {
    it('uses weekly fallback for unknown interval', () => {
      scanner.scheduleScan('lgpd', 'hourly');
      expect(scanner.scheduledScans.has('lgpd')).toBe(true);
    });

    it('logs and runs scan on interval', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      scanner.scheduleScan('gdpr', 'daily');
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
      expect(consoleSpy).toHaveBeenCalledWith('[ComplianceScanner] Running scheduled scan for gdpr');
      consoleSpy.mockRestore();
    });
  });
});
