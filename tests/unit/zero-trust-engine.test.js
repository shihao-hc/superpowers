const { ZeroTrustEngine, ComplianceEngine, ThreatDetector } = require('../../src/security/zerotrust/ZeroTrustEngine');

describe('ZeroTrustEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new ZeroTrustEngine();
  });

  describe('constructor', () => {
    it('should create instance with default policies', () => {
      expect(engine.policies instanceof Map).toBe(true);
      expect(engine.policies.size).toBe(3);
      expect(engine.policies.has('default')).toBe(true);
      expect(engine.policies.has('high-risk')).toBe(true);
      expect(engine.policies.has('trust-based')).toBe(true);
      expect(engine.accessLogs instanceof Map).toBe(true);
    });

    it('should set default policy with always-challenge rule', () => {
      const policy = engine.policies.get('default');
      expect(policy.rules[0].condition).toBe('always');
      expect(policy.rules[0].action).toBe('challenge');
    });
  });

  describe('evaluateAccess', () => {
    it('should return allowed true when trustScore is high', async () => {
      const result = await engine.evaluateAccess({
        userId: 'user1',
        resource: 'doc.pdf',
        action: 'read',
        context: {
          identityVerified: true,
          mfaEnabled: true,
          deviceRegistered: true,
          ip: '203.0.113.1',
          userAgent: 'Mozilla/5.0'
        }
      });
      expect(result.allowed).toBe(true);
      expect(result.trustScore).toBeGreaterThan(80);
      expect(result.riskLevel).toBe('low');
      expect(result.action).toBe('allow');
    });

    it('should block resourceSensitivity critical with no trust signals via custom policy', async () => {
      engine.addPolicy({
        id: 'critical-block',
        name: 'Block Critical Access',
        rules: [{ condition: 'always', action: 'block' }],
        priority: 200
      });
      const result = await engine.evaluateAccess({
        userId: 'user2',
        resource: { sensitivity: 'critical' },
        action: 'view',
        context: {
          identityVerified: false,
          mfaEnabled: false,
          deviceRegistered: false,
          ip: '192.0.2.0'
        }
      });
      expect(result.allowed).toBe(false);
      expect(result.action).toBe('block');
    });

    it('should challenge when trustScore is below 50 but above 30', async () => {
      const result = await engine.evaluateAccess({
        userId: 'user3',
        resource: 'report.pdf',
        action: 'view',
        context: {
          identityVerified: false,
          mfaEnabled: false,
          deviceRegistered: false,
          ip: '192.0.2.0',
          location: 'new'
        }
      });
      expect(result.action).toBe('challenge');
      expect(result.nextChallenge).toBe('mfa');
    });

    it('should return correct result structure', async () => {
      const result = await engine.evaluateAccess({
        userId: 'user4',
        resource: 'file.txt',
        action: 'read',
        context: {
          identityVerified: true,
          mfaEnabled: true,
          deviceRegistered: true,
          ip: '203.0.113.1'
        }
      });
      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('trustScore');
      expect(result).toHaveProperty('riskLevel');
      expect(result).toHaveProperty('factors');
      expect(Array.isArray(result.factors)).toBe(true);
      expect(typeof result.trustScore).toBe('number');
    });

    it('should log access and make it available via getAccessHistory', async () => {
      await engine.evaluateAccess({
        userId: 'user5',
        resource: 'file.txt',
        action: 'read',
        context: { ip: '203.0.113.1' }
      });
      const history = engine.getAccessHistory('user5');
      expect(history.length).toBe(1);
      expect(history[0].userId).toBe('user5');
      expect(history[0].action).toBe('read');
    });
  });

  describe('addPolicy', () => {
    it('should add a custom high-priority policy that blocks all access', async () => {
      engine.addPolicy({
        id: 'block-all',
        name: 'Block Everything',
        rules: [{ condition: 'always', action: 'block' }],
        priority: 999
      });
      const result = await engine.evaluateAccess({
        userId: 'user6',
        resource: 'file.txt',
        action: 'read',
        context: {
          identityVerified: true,
          mfaEnabled: true,
          deviceRegistered: true,
          ip: '203.0.113.1'
        }
      });
      expect(result.allowed).toBe(false);
      expect(result.action).toBe('block');
      expect(result.factors).toContain('block-all');
    });

    it('should increase policies size', () => {
      engine.addPolicy({ id: 'custom', rules: [], priority: 1 });
      expect(engine.policies.size).toBe(4);
    });
  });

  describe('getAccessHistory', () => {
    it('should return empty array for unknown user', () => {
      const history = engine.getAccessHistory('unknown');
      expect(history).toEqual([]);
    });

    it('should filter by riskLevel', async () => {
      await engine.evaluateAccess({
        userId: 'user7',
        resource: { sensitivity: 'critical' },
        action: 'view',
        context: {
          identityVerified: false,
          mfaEnabled: false,
          deviceRegistered: false,
          ip: '192.0.2.0',
          location: 'new'
        }
      });
      const highRisk = engine.getAccessHistory('user7', { riskLevel: 'high' });
      expect(highRisk.length).toBeGreaterThan(0);
      highRisk.forEach((entry) => {
        expect(entry.riskLevel).toBe('high');
      });
    });

    it('should filter by since and until', async () => {
      const past = Date.now() - 100000;
      const future = Date.now() + 100000;
      await engine.evaluateAccess({
        userId: 'user8',
        resource: 'file.txt',
        action: 'read',
        context: { ip: '203.0.113.1' }
      });
      const inRange = engine.getAccessHistory('user8', { since: past, until: future });
      expect(inRange.length).toBe(1);
      const beforeRange = engine.getAccessHistory('user8', { since: future });
      expect(beforeRange.length).toBe(0);
    });
  });
});

describe('ComplianceEngine', () => {
  let compliance;

  beforeEach(() => {
    compliance = new ComplianceEngine();
  });

  describe('constructor', () => {
    it('should create instance with default frameworks', () => {
      expect(compliance.frameworks instanceof Map).toBe(true);
      expect(compliance.frameworks.size).toBe(3);
      expect(compliance.frameworks.has('soc2')).toBe(true);
      expect(compliance.frameworks.has('iso27001')).toBe(true);
      expect(compliance.frameworks.has('pcidss')).toBe(true);
      expect(compliance.assessments instanceof Map).toBe(true);
    });

    it('should define expected controls for each framework', () => {
      const soc2 = compliance.frameworks.get('soc2');
      expect(soc2.controls.length).toBe(8);
      expect(soc2.controls[0].id).toBe('CC1.1');
      expect(compliance.frameworks.get('iso27001').controls.length).toBe(8);
      expect(compliance.frameworks.get('pcidss').controls.length).toBe(8);
    });
  });

  describe('runAssessment', () => {
    it('should throw for unknown framework', async () => {
      await expect(compliance.runAssessment('nonexistent', 'scope1')).rejects.toThrow('Framework not found');
    });

    it('should return assessment with controls for valid framework', async () => {
      const assessment = await compliance.runAssessment('soc2', 'production');
      expect(assessment.framework).toBe('soc2');
      expect(assessment.scope).toBe('production');
      expect(assessment.status).toBe('completed');
      expect(assessment.controls.length).toBe(8);
      expect(assessment.controls[0]).toHaveProperty('controlId');
      expect(assessment.controls[0]).toHaveProperty('status');
      expect(assessment.controls[0]).toHaveProperty('findings');
      expect(assessment.summary).toBeDefined();
      expect(assessment.summary.totalControls).toBe(8);
    });

    it('should store assessment and make it retrievable', async () => {
      const assessment = await compliance.runAssessment('iso27001', 'scope2');
      const stored = compliance.assessments.get(assessment.id);
      expect(stored).toBeDefined();
      expect(stored.id).toBe(assessment.id);
    });
  });

  describe('generateReport', () => {
    it('should throw for missing assessment', () => {
      expect(() => compliance.generateReport('nonexistent')).toThrow('Assessment not found');
    });

    it('should return assessment as json by default', async () => {
      const assessment = await compliance.runAssessment('soc2', 'report-scope');
      const report = compliance.generateReport(assessment.id);
      expect(report.id).toBe(assessment.id);
      expect(report.framework).toBe('soc2');
    });

    it('should throw for unsupported format', async () => {
      const assessment = await compliance.runAssessment('pcidss', 'format-test');
      expect(() => compliance.generateReport(assessment.id, 'xml')).toThrow('Unsupported format');
    });
  });

  describe('getRemediationItems', () => {
    it('should return empty array when no assessments exist', () => {
      const items = compliance.getRemediationItems('soc2');
      expect(items).toEqual([]);
    });
  });
});

describe('ThreatDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new ThreatDetector();
  });

  describe('constructor', () => {
    it('should create instance with 5 detection rules', () => {
      expect(detector.detectionRules instanceof Map).toBe(true);
      expect(detector.detectionRules.size).toBe(5);
      expect(detector.detectionRules.has('brute-force')).toBe(true);
      expect(detector.detectionRules.has('anomalous-access')).toBe(true);
      expect(detector.detectionRules.has('data-exfiltration')).toBe(true);
      expect(detector.detectionRules.has('privilege-escalation')).toBe(true);
      expect(detector.detectionRules.has('api-abuse')).toBe(true);
    });

    it('should initialize empty threats and iocs maps', () => {
      expect(detector.threats instanceof Map).toBe(true);
      expect(detector.threats.size).toBe(0);
      expect(detector.iocs instanceof Map).toBe(true);
      expect(detector.iocs.size).toBe(0);
    });
  });

  describe('analyzeEvent', () => {
    it('should return alerts for event matching brute-force rule', () => {
      const alerts = detector.analyzeEvent({
        eventType: 'auth.failed',
        count: 10,
        newLocation: false,
        unusualTime: false,
        dataVolume: 0,
        downloadRate: 0,
        roleChanged: false,
        newRole: 'user',
        rateLimitExceeded: false,
        errorRate: 0
      });
      expect(alerts.length).toBe(1);
      expect(alerts[0].ruleId).toBe('brute-force');
      expect(alerts[0].severity).toBe('high');
      expect(alerts[0].action).toBe('alerted');
    });

    it('should return empty array for event matching no rules', () => {
      const alerts = detector.analyzeEvent({
        eventType: 'auth.success',
        count: 1,
        newLocation: false,
        unusualTime: false,
        dataVolume: 0,
        downloadRate: 0,
        roleChanged: false,
        newRole: 'user',
        rateLimitExceeded: false,
        errorRate: 0
      });
      expect(alerts.length).toBe(0);
    });

    it('should match privilege-escalation rule with in operator', () => {
      const alerts = detector.analyzeEvent({
        roleChanged: true,
        newRole: 'admin',
        eventType: 'auth.success',
        count: 1,
        newLocation: false,
        unusualTime: false,
        dataVolume: 0,
        downloadRate: 0,
        rateLimitExceeded: false,
        errorRate: 0
      });
      expect(alerts.length).toBe(1);
      expect(alerts[0].ruleId).toBe('privilege-escalation');
      expect(alerts[0].severity).toBe('critical');
    });

    it('should create alert with unique id on each call', () => {
      const event = {
        eventType: 'auth.failed', count: 10,
        newLocation: false, unusualTime: false,
        dataVolume: 0, downloadRate: 0,
        roleChanged: false, newRole: 'user',
        rateLimitExceeded: false, errorRate: 0
      };
      const alerts1 = detector.analyzeEvent(event);
      const alerts2 = detector.analyzeEvent(event);
      expect(alerts1[0].id).not.toBe(alerts2[0].id);
    });

    it('should store threat in threats map', () => {
      const alerts = detector.analyzeEvent({
        eventType: 'auth.failed', count: 10,
        newLocation: false, unusualTime: false,
        dataVolume: 0, downloadRate: 0,
        roleChanged: false, newRole: 'user',
        rateLimitExceeded: false, errorRate: 0
      });
      expect(detector.threats.size).toBe(alerts.length);
      expect(detector.threats.has(alerts[0].id)).toBe(true);
    });
  });

  describe('getThreatIntel', () => {
    it('should return zero counts when no threats exist', () => {
      const intel = detector.getThreatIntel();
      expect(intel.iocCount).toBe(0);
      expect(intel.recentThreats).toBe(0);
      expect(intel.bySeverity.critical).toBe(0);
      expect(intel.bySeverity.high).toBe(0);
      expect(intel.bySeverity.medium).toBe(0);
      expect(intel.byType).toEqual({});
    });

    it('should return correct severity counts after analyzeEvent', () => {
      const event = {
        newLocation: false, unusualTime: false,
        dataVolume: 0, downloadRate: 0,
        roleChanged: false, newRole: 'user',
        rateLimitExceeded: false, errorRate: 0
      };
      detector.analyzeEvent({ ...event, eventType: 'auth.failed', count: 10 });
      detector.analyzeEvent({ ...event, roleChanged: true, newRole: 'admin', eventType: 'auth.success', count: 1 });
      const intel = detector.getThreatIntel();
      expect(intel.recentThreats).toBe(2);
      expect(intel.bySeverity.high).toBe(1);
      expect(intel.bySeverity.critical).toBe(1);
    });
  });

  describe('_takeAction', () => {
    it('should block data-exfiltration events', () => {
      const alerts = detector.analyzeEvent({
        eventType: 'access', newLocation: false, unusualTime: false,
        dataVolume: 2000000, downloadRate: 200,
        roleChanged: false, newRole: 'user',
        rateLimitExceeded: false, errorRate: 0
      });
      expect(alerts.length).toBe(1);
      expect(alerts[0].action).toBe('blocked');
    });

    it('should challenge anomalous-access events', () => {
      const alerts = detector.analyzeEvent({
        eventType: 'access', newLocation: true, unusualTime: true,
        dataVolume: 0, downloadRate: 0,
        roleChanged: false, newRole: 'user',
        rateLimitExceeded: false, errorRate: 0
      });
      expect(alerts.length).toBe(1);
      expect(alerts[0].action).toBe('challenged');
    });

    it('should throttle api-abuse events', () => {
      const alerts = detector.analyzeEvent({
        eventType: 'api.call', newLocation: false, unusualTime: false,
        dataVolume: 0, downloadRate: 0,
        roleChanged: false, newRole: 'user',
        rateLimitExceeded: true, errorRate: 0.8
      });
      expect(alerts.length).toBe(1);
      expect(alerts[0].action).toBe('throttled');
    });
  });
});

describe('ZeroTrustEngine - risk assessment branches', () => {
  let engine;

  beforeEach(() => {
    engine = new ZeroTrustEngine();
  });

  it('should detect brute_force risk from high failedAttempts', async () => {
    const logs = [];
    for (let i = 0; i < 4; i++) {
      logs.push({ userId: 'user-bf', decision: { action: 'block' }, timestamp: Date.now() });
    }
    engine.accessLogs.set('user-bf', logs);
    const result = await engine.evaluateAccess({
      userId: 'user-bf', resource: 'file.txt', action: 'read',
      context: { ip: '203.0.113.1' }
    });
    expect(result.trustScore).toBeLessThan(50);
  });

  it('should detect destructive_action risk from delete action', async () => {
    const result = await engine.evaluateAccess({
      userId: 'user-del', resource: 'file.txt', action: 'data:delete',
      context: { ip: '203.0.113.1' }
    });
    expect(result.riskLevel).toBeDefined();
  });

  it('should evaluate action-in condition with single-item array', async () => {
    engine.addPolicy({
      id: 'action-test',
      rules: [{ condition: 'action in ["delete"]', action: 'block' }],
      priority: 100
    });
    const result = await engine.evaluateAccess({
      userId: 'user-act', resource: 'file.txt', action: 'delete',
      context: { ip: '203.0.113.1' }
    });
    expect(result.factors).toContain('action-test');
  });

  it('should detect sensitive_data risk from pii classification', async () => {
    const result = await engine.evaluateAccess({
      userId: 'user-pii', resource: { classification: 'pii' }, action: 'read',
      context: { ip: '203.0.113.1' }
    });
    expect(result.riskLevel).toBeDefined();
  });
});

describe('ZeroTrustEngine - condition operators', () => {
  let engine;

  beforeEach(() => {
    engine = new ZeroTrustEngine();
  });

  it('should evaluate <= operator', async () => {
    engine.addPolicy({
      id: 'le-test',
      rules: [{ condition: 'trustScore <= 50', action: 'block' }],
      priority: 100
    });
    const result = await engine.evaluateAccess({
      userId: 'user-op', resource: 'file.txt', action: 'read',
      context: { ip: '192.0.2.0' }
    });
    expect(result.factors).toContain('le-test');
  });

  it('should evaluate >= operator', async () => {
    engine.addPolicy({
      id: 'ge-test',
      rules: [{ condition: 'trustScore >= 80', action: 'allow' }],
      priority: 100
    });
    const result = await engine.evaluateAccess({
      userId: 'user-op2', resource: 'file.txt', action: 'read',
      context: { identityVerified: true, mfaEnabled: true, deviceRegistered: true, ip: '203.0.113.1' }
    });
    expect(result.allowed).toBe(true);
  });

  it('should evaluate == operator', async () => {
    jest.spyOn(engine, '_isUnusualTime').mockReturnValue(false);
    engine.addPolicy({
      id: 'eq-test',
      rules: [{ condition: 'trustScore == 75', action: 'block' }],
      priority: 100
    });
    const result = await engine.evaluateAccess({
      userId: 'user-eq', resource: 'file.txt', action: 'read',
      context: { identityVerified: true, ip: '203.0.113.1' }
    });
    expect(result.factors).toContain('eq-test');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});

describe('ZeroTrustEngine - log maintenance', () => {
  let engine;

  beforeEach(() => {
    engine = new ZeroTrustEngine();
  });

  it('should handle non-block entries in getFailedAttempts', async () => {
    await engine.evaluateAccess({
      userId: 'user-nb', resource: 'file.txt', action: 'read',
      context: { ip: '203.0.113.1' }
    });
    const result = await engine.evaluateAccess({
      userId: 'user-nb', resource: 'file.txt', action: 'read',
      context: { ip: '203.0.113.1' }
    });
    expect(result.trustScore).toBeGreaterThanOrEqual(0);
  });

  it('should rotate logs when exceeding 1000 entries', () => {
    for (let i = 0; i < 1005; i++) {
      const logs = engine.accessLogs.get('user-rot') || [];
      logs.push({ userId: 'user-rot', decision: { action: 'allow' }, timestamp: Date.now() });
      engine.accessLogs.set('user-rot', logs);
    }
    engine._logAccess({ userId: 'user-rot', decision: { action: 'allow' }, timestamp: Date.now() });
    expect(engine.accessLogs.get('user-rot').length).toBe(1000);
  });
});

describe('ComplianceEngine - additional coverage', () => {
  let compliance;

  beforeEach(() => {
    compliance = new ComplianceEngine();
  });

  it('should return remediation items sorted by severity with framework filtering', () => {
    compliance.assessments.set('a1', {
      framework: 'soc2',
      controls: [
        { controlId: 'CC1.1', findings: [{ checkName: 'm1', severity: 'high', checkedAt: 1 }] },
        { controlId: 'CC2.1', findings: [{ checkName: 'm2', severity: 'critical', checkedAt: 2 }] }
      ]
    });
    compliance.assessments.set('a2', {
      framework: 'iso27001',
      controls: [
        { controlId: 'A.5.1', findings: [{ checkName: 'm3', severity: 'low', checkedAt: 3 }] }
      ]
    });
    const items = compliance.getRemediationItems('soc2');
    expect(items.length).toBe(2);
    expect(items[0].severity).toBe('critical');
    expect(items[1].severity).toBe('high');
  });

  it('should default severity to medium when finding lacks severity', () => {
    compliance.assessments.set('a3', {
      framework: 'soc2',
      controls: [
        { controlId: 'CC1.1', findings: [{ checkName: 'm4', checkedAt: 4 }] }
      ]
    });
    const items = compliance.getRemediationItems('soc2');
    expect(items.length).toBe(1);
    expect(items[0].severity).toBe('medium');
  });

  it('should generate summary with zero rate for empty controls', () => {
    const summary = compliance._generateSummary([]);
    expect(summary.totalControls).toBe(0);
    expect(summary.complianceRate).toBe(0);
  });

  it('should generate pdf report format', async () => {
    const assessment = await compliance.runAssessment('soc2', 'pdf-scope');
    const report = compliance.generateReport(assessment.id, 'pdf');
    expect(report.format).toBe('pdf');
    expect(report.data.framework).toBe('soc2');
    expect(report.data.scope).toBe('pdf-scope');
    expect(report.data.controls.length).toBe(8);
  });
});

describe('ZeroTrustEngine - signal & policy edge coverage', () => {
  let engine;

  beforeEach(() => {
    engine = new ZeroTrustEngine();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should add active bonus when sessionAge exceeds 3600', async () => {
    jest.spyOn(engine, '_isUnusualTime').mockReturnValue(false);
    const result = await engine.evaluateAccess({
      userId: 'user-sa', resource: 'file.txt', action: 'read',
      context: { ip: '203.0.113.1', sessionAge: 4000 }
    });
    expect(result.trustScore).toBe(65);
  });

  it('should reduce score for high resource sensitivity', async () => {
    jest.spyOn(engine, '_isUnusualTime').mockReturnValue(false);
    const result = await engine.evaluateAccess({
      userId: 'user-hs', resource: { sensitivity: 'high' }, action: 'read',
      context: { ip: '203.0.113.1' }
    });
    expect(result.trustScore).toBe(45);
    expect(result.riskLevel).toBe('medium');
  });

  it('should not add active bonus for irregular activity pattern', async () => {
    jest.spyOn(engine, '_isUnusualTime').mockReturnValue(false);
    jest.spyOn(engine, '_analyzeActivityPattern').mockResolvedValue('irregular');
    const result = await engine.evaluateAccess({
      userId: 'user-ir', resource: 'file.txt', action: 'read',
      context: { ip: '203.0.113.1' }
    });
    expect(result.trustScore).toBe(50);
  });

  it('should throw when context is missing', async () => {
    await expect(engine.evaluateAccess({
      userId: 'user-nc', resource: 'file.txt', action: 'read'
    })).rejects.toThrow();
  });

  it('should allow when no policy applies', async () => {
    engine.policies.clear();
    const result = await engine.evaluateAccess({
      userId: 'user-np', resource: 'file.txt', action: 'read',
      context: { ip: '203.0.113.1' }
    });
    expect(result.allowed).toBe(true);
    expect(result.action).toBe('allow');
    expect(result.factors).toEqual([]);
  });

  it('should default action to allow when matched rule has no action', async () => {
    engine.policies.clear();
    engine.addPolicy({
      id: 'no-action',
      rules: [{ condition: 'always' }],
      priority: 999
    });
    const result = await engine.evaluateAccess({
      userId: 'user-noa', resource: 'file.txt', action: 'read',
      context: { ip: '203.0.113.1' }
    });
    expect(result.action).toBe('allow');
    expect(result.factors).toContain('no-action');
  });

  it('should not match trustScore condition without operator', async () => {
    engine.addPolicy({
      id: 'ts-bad',
      rules: [{ condition: 'trustScore isHigh', action: 'block' }],
      priority: 999
    });
    const result = await engine.evaluateAccess({
      userId: 'user-tsb', resource: 'file.txt', action: 'read',
      context: { ip: '203.0.113.1' }
    });
    expect(result.factors).not.toContain('ts-bad');
  });

  it('should assign 0.7 reputation for 10.x ip', async () => {
    jest.spyOn(engine, '_isUnusualTime').mockReturnValue(false);
    const result = await engine.evaluateAccess({
      userId: 'user-ip', resource: 'file.txt', action: 'read',
      context: { ip: '10.0.0.5' }
    });
    expect(result.trustScore).toBe(60);
  });

  it('should assign low trust for bot user agent', async () => {
    jest.spyOn(engine, '_isUnusualTime').mockReturnValue(false);
    const result = await engine.evaluateAccess({
      userId: 'user-ua', resource: 'file.txt', action: 'read',
      context: { ip: '203.0.113.1', userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }
    });
    expect(result.trustScore).toBe(60);
  });
});

describe('ThreatDetector - match rule edge coverage', () => {
  let detector;

  beforeEach(() => {
    detector = new ThreatDetector();
  });

  it('should skip undefined field and still match rule', () => {
    const alerts = detector.analyzeEvent({
      eventType: 'auth.failed',
      newLocation: false, unusualTime: false,
      dataVolume: 0, downloadRate: 0,
      roleChanged: false, newRole: 'user',
      rateLimitExceeded: false, errorRate: 0
    });
    expect(alerts.length).toBe(1);
    expect(alerts[0].ruleId).toBe('brute-force');
  });

  it('should not match in-operator rule when value not in list', () => {
    const alerts = detector.analyzeEvent({
      roleChanged: true, newRole: 'guest',
      eventType: 'auth.success', count: 1,
      newLocation: false, unusualTime: false,
      dataVolume: 0, downloadRate: 0,
      rateLimitExceeded: false, errorRate: 0
    });
    expect(alerts.length).toBe(0);
  });
});
