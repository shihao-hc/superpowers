const fs = require('fs');

// Mock registry for top-level dependencies
const mockRegistry = {};

jest.mock('../../src/core/CircuitBreaker', () => {
  const inst = {
    isAllowed: jest.fn(),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
    state: 'CLOSED',
    failureCount: 0
  };
  mockRegistry.breaker = inst;
  return jest.fn(() => inst);
});

jest.mock('../../src/core/LoopGuard', () => {
  const inst = {
    check: jest.fn(),
    isTripped: false
  };
  mockRegistry.loopGuard = inst;
  return jest.fn(() => inst);
});

jest.mock('../../src/core/AuditLogger', () => {
  const inst = { log: jest.fn() };
  mockRegistry.audit = inst;
  return jest.fn(() => inst);
});

// Mock lazy-loaded dependencies for _execute
let mockBrainSystemThrow = false;
jest.mock('../../src/core/BrainSystem', () => {
  if (mockBrainSystemThrow) { throw new Error('brain load failed'); }
  return { analyzeIntent: jest.fn() };
});

const mockGetRelevantLessons = jest.fn();
jest.mock('../../src/core/LessonReminder', () => ({
  getRelevantLessons: mockGetRelevantLessons
}));

const mockDecisionContextGenerate = jest.fn();
jest.mock('../../src/core/DecisionContext', () => jest.fn(() => ({
  generate: mockDecisionContextGenerate
})));

const mockDecisionTrackerRecord = jest.fn();
jest.mock('../../src/core/DecisionTracker', () => jest.fn(() => ({
  record: mockDecisionTrackerRecord
})));

const mockAutoDiagnoseDiagnose = jest.fn();
jest.mock('../../src/core/AutoDiagnose', () => jest.fn(() => ({
  diagnose: mockAutoDiagnoseDiagnose
})));

const mockLessonLearner = { recordEvent: jest.fn() };
let mockLessonLearnerThrow = false;
jest.mock('../../src/core/LessonLearner', () => {
  if (mockLessonLearnerThrow) { throw new Error('lesson learner load failed'); }
  return jest.fn(() => mockLessonLearner);
});

const mockPreToolRiskAnalyzer = { analyze: jest.fn() };
jest.mock('../../src/core/PreToolRiskAnalyzer', () => jest.fn(() => mockPreToolRiskAnalyzer));

const mockToolExecutor = { execute: jest.fn() };
jest.mock('../../src/core/ToolExecutor', () => jest.fn(() => mockToolExecutor));

// Load module under test
const { BrainBridge, loadConfig } = require('../../src/core/BrainBridge');

describe('BrainBridge', () => {
  let bridge;

  function setupFsMock(defaults = {}) {
    jest.spyOn(fs, 'existsSync').mockReturnValue(defaults.existsSync !== undefined ? defaults.existsSync : false);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(defaults.readFileSync !== undefined ? defaults.readFileSync : '{}');
    jest.spyOn(fs, 'writeFileSync').mockReturnValue();
    jest.spyOn(fs, 'mkdirSync').mockReturnValue();
    jest.spyOn(fs, 'copyFileSync').mockReturnValue();
    jest.spyOn(fs, 'unlinkSync').mockReturnValue();
    jest.spyOn(fs, 'readdirSync').mockReturnValue([]);
  }

  function setupProcessMocks() {
    mockRegistry.breaker.isAllowed.mockReturnValue(true);
    mockRegistry.loopGuard.check.mockReturnValue({ tripped: false, pattern: null, ts: Date.now() });
    mockRegistry.audit.log.mockReturnValue();
    const BrainSystem = require('../../src/core/BrainSystem');
    BrainSystem.analyzeIntent.mockReturnValue({ intent: 'bug_fix', confidence: 0.9 });
    mockGetRelevantLessons.mockReturnValue([]);
    mockDecisionContextGenerate.mockReturnValue({ riskLevel: 'low', recommendations: [], priorityOverrides: [], toolRestrictions: [] });
    mockDecisionTrackerRecord.mockReturnValue();
    jest.spyOn(fs, 'readFileSync').mockReturnValue('{}');
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(fs, 'writeFileSync').mockReturnValue();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    if (mockRegistry.breaker) {
      mockRegistry.breaker.isAllowed.mockReturnValue(true);
      mockRegistry.breaker.recordSuccess.mockClear();
      mockRegistry.breaker.recordFailure.mockClear();
      mockRegistry.breaker.state = 'CLOSED';
      mockRegistry.breaker.failureCount = 0;
    }
    if (mockRegistry.loopGuard) {
      mockRegistry.loopGuard.check.mockReturnValue({ tripped: false, pattern: null, ts: Date.now() });
      mockRegistry.loopGuard.isTripped = false;
    }
    if (mockRegistry.audit) {
      mockRegistry.audit.log.mockClear();
    }
    setupFsMock();
    bridge = new BrainBridge();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.BRAIN_DISABLE;
  });

  describe('constructor', () => {
    test('initializes fields lazily', () => {
      expect(bridge._config).toBeNull();
      expect(bridge._initialized).toBe(false);
      expect(bridge._breaker).toBeNull();
      expect(bridge._loopGuard).toBeNull();
      expect(bridge._audit).toBeNull();
      expect(bridge._brainSystem).toBeNull();
    });

    test('enabled returns null before initialize (config null)', () => {
      expect(bridge.enabled).toBeNull();
    });
  });

  describe('initialize', () => {
    test('loads config and creates components', () => {
      setupFsMock({ existsSync: false });
      bridge.initialize();
      expect(bridge._initialized).toBe(true);
      expect(bridge._config).toBeTruthy();
      expect(bridge._config.enabled).toBe(true);
      expect(bridge._breaker).toBeTruthy();
      expect(bridge._loopGuard).toBeTruthy();
      expect(bridge._audit).toBeTruthy();
    });

    test('skips component creation when disabled', () => {
      jest.restoreAllMocks();
      process.env.BRAIN_DISABLE = '1';
      setupFsMock({ existsSync: false });
      bridge.initialize();
      expect(bridge._config).toBeTruthy();
      expect(bridge._config.enabled).toBe(false);
      expect(bridge._breaker).toBeNull();
      expect(bridge._loopGuard).toBeNull();
      expect(bridge._audit).toBeNull();
    });

    test('is idempotent when called twice', () => {
      setupFsMock({ existsSync: false });
      bridge.initialize();
      const breaker = bridge._breaker;
      bridge.initialize();
      expect(bridge._breaker).toBe(breaker);
    });
  });

  describe('_resolveTaskType', () => {
    function rtt(text, original) {
      return bridge._resolveTaskType(text, original);
    }

    test('maps security_check intent', () => {
      expect(rtt('security_check')).toBe('security');
    });

    test('maps code_create, code_edit, code_review intents', () => {
      expect(rtt('code_create')).toBe('code');
      expect(rtt('code_edit')).toBe('code');
      expect(rtt('code_review')).toBe('code');
    });

    test('maps test_write and test_run intents', () => {
      expect(rtt('test_write')).toBe('test');
      expect(rtt('test_run')).toBe('test');
    });

    test('maps bug_fix intent', () => {
      expect(rtt('bug_fix')).toBe('fix');
    });

    test('maps refactor and optimize intents', () => {
      expect(rtt('refactor')).toBe('refactor');
      expect(rtt('optimize')).toBe('refactor');
    });

    test('maps learn and research intents', () => {
      expect(rtt('learn')).toBe('test');
      expect(rtt('research')).toBe('test');
    });

    test('maps deploy intent', () => {
      expect(rtt('deploy')).toBe('deploy');
    });

    test('maps review intent', () => {
      expect(rtt('review')).toBe('review');
    });

    test('matches Chinese keyword via originalInput', () => {
      expect(rtt('default', '安全审计')).toBe('security');
      expect(rtt('default', '测试用例')).toBe('test');
      expect(rtt('default', '部署上线')).toBe('deploy');
      expect(rtt('default', '性能优化')).toBe('refactor');
      expect(rtt('default', '代码审查')).toBe('review');
    });

    test('matches English keyword via originalInput', () => {
      expect(rtt('default', 'fix a bug')).toBe('fix');
      expect(rtt('default', 'run test')).toBe('test');
      expect(rtt('default', 'debug this')).toBe('fix');
    });

    test('matches longer keywords first', () => {
      expect(rtt('default', '我是一个测试')).toBe('test');
    });

    test('returns default for unrecognized input', () => {
      expect(rtt('hello world')).toBe('default');
      expect(rtt('')).toBe('default');
    });

    test('is case insensitive', () => {
      expect(rtt('BUG_FIX')).toBe('fix');
      expect(rtt('SECURITY_CHECK')).toBe('security');
    });
  });

  describe('_emptyResult', () => {
    test('returns structure with error reason', () => {
      const result = bridge._emptyResult('test_reason', 1000);
      expect(result.intent).toBeNull();
      expect(result.taskType).toBeNull();
      expect(result.lessons).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.suggestions).toEqual([]);
      expect(result.proactive).toEqual({});
      expect(result.source).toBe('brain-bridge-v1');
      expect(result.error).toBe('test_reason');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getStatus', () => {
    test('returns status after initialize', () => {
      setupFsMock({ existsSync: false });
      bridge.initialize();
      const status = bridge.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.initialized).toBe(true);
      expect(status.breakerState).toBe('CLOSED');
      expect(status.breakerFailures).toBe(0);
      expect(status.loopTripped).toBe(false);
      expect(status.hasBrain).toBe(false);
    });

    test('reports fullAuto false when config is missing', () => {
      bridge._initialized = true;
      bridge._config = null;
      const status = bridge.getStatus();
      expect(status.fullAuto).toBe(false);
    });

    test('reports UNKNOWN and zero fallbacks when components missing', () => {
      jest.restoreAllMocks();
      process.env.BRAIN_DISABLE = '1';
      setupFsMock({ existsSync: false });
      const status = bridge.getStatus();
      expect(status.breakerState).toBe('UNKNOWN');
      expect(status.breakerFailures).toBe(0);
      expect(status.loopTripped).toBe(false);
    });
  });

  describe('process', () => {
    test('returns empty result when disabled', () => {
      process.env.BRAIN_DISABLE = '1';
      jest.restoreAllMocks();
      setupFsMock({ existsSync: false });
      const result = bridge.process('test input');
      expect(result.error).toBe('disabled');
      expect(result.intent).toBeNull();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('returns empty result when breaker is open', () => {
      setupFsMock({ existsSync: false });
      mockRegistry.breaker.isAllowed.mockReturnValue(false);
      const result = bridge.process('test input');
      expect(result.error).toBe('disabled');
    });

    test('returns warning when loop guard tripped', () => {
      setupFsMock({ existsSync: false });
      mockRegistry.loopGuard.check.mockReturnValue({ tripped: true, pattern: 'rate_limit', ts: Date.now() });
      const result = bridge.process('test input');
      expect(result.error).toBe('loop_guard');
      expect(result.loopGuardTripped).toBe(true);
      expect(result.blockedActions).toContain('rate_limit');
    });

    test('returns full result on success', () => {
      setupFsMock({ existsSync: false });
      setupProcessMocks();
      const result = bridge.process('test input');
      expect(result.error).toBeUndefined();
      expect(result.intent).toBeTruthy();
      expect(result.intent.type).toBe('bug_fix');
      expect(result.source).toBe('brain-bridge-v1');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('handles missing proactive.json gracefully', () => {
      setupFsMock({ existsSync: false });
      setupProcessMocks();
      const result = bridge.process('test input');
      expect(result.source).toBe('brain-bridge-v1');
      expect(result.taskType).toBe('fix');
      expect(result.proactive.interactionCount).toBe(0);
      expect(result.proactive.topIntent).toBeNull();
    });

    test('returns error result when _execute throws', () => {
      setupFsMock({ existsSync: false });
      setupProcessMocks();
      jest.spyOn(bridge, '_execute').mockImplementation(() => { throw new Error('exec failed'); });
      const result = bridge.process('test input');
      expect(result.error).toBe('error');
      expect(mockRegistry.breaker.recordFailure).toHaveBeenCalled();
      expect(mockRegistry.audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'failed' }));
    });

    test('uses low riskLevel when decision context is null', () => {
      setupFsMock({ existsSync: false });
      setupProcessMocks();
      mockDecisionContextGenerate.mockReturnValue(null);
      const result = bridge.process('test input');
      expect(result.decisionContext).toBeNull();
      expect(mockDecisionTrackerRecord).toHaveBeenCalledWith(expect.objectContaining({ riskLevel: 'low' }));
    });
  });

  describe('_ensureBrain load failure', () => {
    test('returns no_brain when BrainSystem fails to load', () => {
      const saved = { breaker: mockRegistry.breaker, loopGuard: mockRegistry.loopGuard, audit: mockRegistry.audit };
      mockBrainSystemThrow = true;
      jest.resetModules();
      const Fresh = require('../../src/core/BrainBridge');
      const freshBridge = new Fresh.BrainBridge();
      freshBridge.initialize();
      const audit = freshBridge._audit;
      freshBridge._breaker.isAllowed.mockReturnValue(true);
      freshBridge._loopGuard.check.mockReturnValue({ tripped: false, pattern: null, ts: Date.now() });
      const result = freshBridge.process('test input');
      mockRegistry.breaker = saved.breaker;
      mockRegistry.loopGuard = saved.loopGuard;
      mockRegistry.audit = saved.audit;
      mockBrainSystemThrow = false;
      expect(result.error).toBe('no_brain');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'brain_load_failed' }));
    });

    test('returns true when brain already loaded', () => {
      bridge._brainSystem = {};
      expect(bridge._ensureBrain()).toBe(true);
    });

    test('returns false when BrainSystem fails and no audit is set', () => {
      const saved = { breaker: mockRegistry.breaker, loopGuard: mockRegistry.loopGuard, audit: mockRegistry.audit };
      mockBrainSystemThrow = true;
      jest.resetModules();
      const Fresh = require('../../src/core/BrainBridge');
      const freshBridge = new Fresh.BrainBridge();
      const ok = freshBridge._ensureBrain();
      mockRegistry.breaker = saved.breaker;
      mockRegistry.loopGuard = saved.loopGuard;
      mockRegistry.audit = saved.audit;
      mockBrainSystemThrow = false;
      expect(ok).toBe(false);
      expect(freshBridge._audit).toBeNull();
    });
  });

  describe('_execute edge cases', () => {
    test('returns no_brain when brain not loaded (with and without startTime)', () => {
      expect(bridge._execute('x', null, 1000).error).toBe('no_brain');
      expect(bridge._execute('x').error).toBe('no_brain');
    });

    test('handles brain without analyzeIntent method', () => {
      bridge._brainSystem = {};
      const result = bridge._execute('x', 'code', Date.now());
      expect(result.intent).toEqual({ type: null, confidence: 0 });
    });

    test('handles analyzeIntent returning falsy', () => {
      bridge._brainSystem = { analyzeIntent: () => null };
      const result = bridge._execute('x', 'code', Date.now());
      expect(result.intent).toEqual({ type: null, confidence: 0 });
    });

    test('resolves task type when not provided', () => {
      bridge._brainSystem = { analyzeIntent: () => ({ intent: 'bug_fix', confidence: 0.9 }) };
      const result = bridge._execute('hello bug', null, Date.now());
      expect(result.taskType).toBe('fix');
    });

    test('computes duration with default start time', () => {
      bridge._brainSystem = { analyzeIntent: jest.fn() };
      const result = bridge._execute('x', 'code');
      expect(result.taskType).toBe('code');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('resolves task type from raw input when intent missing', () => {
      bridge._brainSystem = { analyzeIntent: () => ({ intent: null, confidence: 0 }) };
      const result = bridge._execute('安全审计', null, Date.now());
      expect(result.taskType).toBe('security');
    });
  });

  describe('getLessonLearner load failure', () => {
    test('returns null when LessonLearner fails to load', () => {
      const saved = { breaker: mockRegistry.breaker, loopGuard: mockRegistry.loopGuard, audit: mockRegistry.audit };
      mockLessonLearnerThrow = true;
      jest.resetModules();
      const Fresh = require('../../src/core/BrainBridge');
      const freshBridge = new Fresh.BrainBridge();
      freshBridge.initialize();
      const result = freshBridge.getLessonLearner();
      mockRegistry.breaker = saved.breaker;
      mockRegistry.loopGuard = saved.loopGuard;
      mockRegistry.audit = saved.audit;
      mockLessonLearnerThrow = false;
      expect(result).toBeNull();
    });
  });

  describe('autoExecute', () => {
    test('returns not executed when disabled', () => {
      process.env.BRAIN_DISABLE = '1';
      jest.restoreAllMocks();
      setupFsMock({ existsSync: false });
      const result = bridge.autoExecute('ReadFile', ['test.js']);
      expect(result.executed).toBe(false);
      expect(result.reason).toBe('disabled');
    });

    test('returns not executed when fullAuto disabled', () => {
      setupFsMock({ existsSync: false });
      bridge.initialize();
      const result = bridge.autoExecute('ReadFile', ['test.js']);
      expect(result.executed).toBe(false);
      expect(result.reason).toBe('fullAuto_disabled');
    });

    test('returns not executed when breaker is open', () => {
      setupFsMock({
        existsSync: true,
        readFileSync: JSON.stringify({ enabled: true, fullAuto: true, fullAutoWhitelist: ['read'], circuitBreaker: { maxRetries: 3, resetAfterMs: 60000 }, loopGuard: { maxHistory: 50, maxPerMinute: 3 }, audit: { maxDays: 90 }, backup: { maxBackups: 30, minDiskSpaceMB: 100 }, learner: { enabled: true, minConfidence: 0.3, requireApproval: true, autoApprovalThreshold: 0.8 }, diagnose: { enabled: true, maxResults: 3, minScore: 0.1 }, daemon: { enabled: true, healthIntervalMs: 300000, cleanIntervalMs: 3600000 }, proactive: { enabled: true, scanIntervalMs: 3600000 } })
      });
      bridge.initialize();
      mockRegistry.breaker.isAllowed.mockReturnValue(false);
      const result = bridge.autoExecute('ReadFile', ['test.js']);
      expect(result.executed).toBe(false);
      expect(result.reason).toBe('breaker_open');
    });

    test('returns not executed when loop guard tripped', () => {
      setupFsMock({
        existsSync: true,
        readFileSync: JSON.stringify({ enabled: true, fullAuto: true, fullAutoWhitelist: [], circuitBreaker: { maxRetries: 3, resetAfterMs: 60000 }, loopGuard: { maxHistory: 50, maxPerMinute: 3 }, audit: { maxDays: 90 }, backup: { maxBackups: 30, minDiskSpaceMB: 100 }, learner: { enabled: true, minConfidence: 0.3, requireApproval: true, autoApprovalThreshold: 0.8 }, diagnose: { enabled: true, maxResults: 3, minScore: 0.1 }, daemon: { enabled: true, healthIntervalMs: 300000, cleanIntervalMs: 3600000 }, proactive: { enabled: true, scanIntervalMs: 3600000 } })
      });
      bridge.initialize();
      mockRegistry.loopGuard.check.mockReturnValue({ tripped: true, pattern: 'excessive', ts: Date.now() });
      const result = bridge.autoExecute('ReadFile', ['test.js']);
      expect(result.executed).toBe(false);
      expect(result.reason).toBe('loop_guard');
    });
  });

  describe('emergencyStop', () => {
    test('disables config and persists', () => {
      setupFsMock({
        existsSync: true,
        readFileSync: JSON.stringify({ enabled: true })
      });
      const spy = jest.spyOn(fs, 'writeFileSync');
      bridge.emergencyStop();
      expect(bridge._config).toBeTruthy();
      expect(bridge._config.enabled).toBe(false);
      expect(spy).toHaveBeenCalled();
      const written = JSON.parse(spy.mock.calls[0][1]);
      expect(written.enabled).toBe(false);
    });

    test('logs emergency_stop when audit is present', () => {
      setupFsMock({ existsSync: false });
      bridge.initialize();
      bridge.emergencyStop();
      expect(mockRegistry.audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'emergency_stop' }));
    });
  });

  describe('getLessonLearner', () => {
    test('creates LessonLearner instance', () => {
      const learner = bridge.getLessonLearner();
      expect(learner).toBe(mockLessonLearner);
    });

    test('handles config without learner section', () => {
      setupFsMock({ existsSync: false });
      bridge.initialize();
      delete bridge._config.learner;
      const learner = bridge.getLessonLearner();
      expect(learner).toBe(mockLessonLearner);
    });
  });

  describe('loadConfig', () => {
    test('returns defaults when config file missing', () => {
      jest.restoreAllMocks();
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      const config = loadConfig();
      expect(config.enabled).toBe(true);
      expect(config.autoBridge).toBe(true);
      expect(config.circuitBreaker.maxRetries).toBe(3);
      expect(config.loopGuard.maxHistory).toBe(50);
      expect(config.audit.maxDays).toBe(90);
    });

    test('merges file config over defaults', () => {
      jest.restoreAllMocks();
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ enabled: false, circuitBreaker: { maxRetries: 5 } }));
      const config = loadConfig();
      expect(config.enabled).toBe(false);
      expect(config.circuitBreaker.maxRetries).toBe(5);
      expect(config.loopGuard.maxHistory).toBe(50);
    });

    test('disables via BRAIN_DISABLE env var', () => {
      jest.restoreAllMocks();
      process.env.BRAIN_DISABLE = '1';
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      const config = loadConfig();
      expect(config.enabled).toBe(false);
    });

    test('handles malformed config file gracefully', () => {
      jest.restoreAllMocks();
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('not json');
      const config = loadConfig();
      expect(config.enabled).toBe(true);
    });
  });

  describe('backup', () => {
    test('delegates to backupBeforeWrite', () => {
      const result = bridge.backup('/nonexistent/file.txt');
      expect(result).toBeNull();
    });
  });

  describe('ensureDir', () => {
    test('creates backup directory when missing', () => {
      jest.restoreAllMocks();
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
        const ps = p.toString();
        if (ps.includes('backups')) {return false;}
        if (ps.includes('nonexistent')) {return false;}
        return true;
      });
      jest.spyOn(fs, 'mkdirSync').mockReturnValue();
      jest.spyOn(fs, 'copyFileSync').mockReturnValue();
      jest.spyOn(fs, 'readdirSync').mockReturnValue([]);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('{}');
      const result = bridge.backup('/tmp/existing-file.txt');
      expect(result).toBeTruthy();
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('backup cleanup', () => {
    test('removes old backups when exceeding maxBackups', () => {
      jest.restoreAllMocks();
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
        const ps = p.toString();
        if (ps.includes('nonexistent')) {return false;}
        return true;
      });
      jest.spyOn(fs, 'mkdirSync').mockReturnValue();
      jest.spyOn(fs, 'copyFileSync').mockReturnValue();
      jest.spyOn(fs, 'readdirSync').mockReturnValue(
        Array.from({ length: 40 }, (_, i) => `backup_${i}.bak`)
      );
      jest.spyOn(fs, 'unlinkSync').mockReturnValue();
      jest.spyOn(fs, 'readFileSync').mockReturnValue('{}');
      const result = bridge.backup('/tmp/existing-file.txt');
      expect(result).toBeTruthy();
      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(fs.unlinkSync.mock.calls.length).toBeGreaterThan(0);
    });

    test('returns null when backup copy fails', () => {
      jest.restoreAllMocks();
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('{}');
      jest.spyOn(fs, 'copyFileSync').mockImplementation(() => { throw new Error('copy failed'); });
      const result = bridge.backup('/tmp/existing-file.txt');
      expect(result).toBeNull();
    });
  });

  describe('_execute warnings', () => {
    test('includes high priority lessons as warnings', () => {
      setupFsMock({ existsSync: false });
      setupProcessMocks();
      mockGetRelevantLessons.mockReturnValue([
        { id: 'LESSON_001', lesson: 'Test Lesson', priority: 'high', useCount: 0 }
      ]);
      const result = bridge.process('test input');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('LESSON_001');
    });

    test('falls back to empty strings when lesson fields missing', () => {
      setupFsMock({ existsSync: false });
      setupProcessMocks();
      mockGetRelevantLessons.mockReturnValue([
        { id: undefined, lesson: undefined, priority: undefined, category: undefined, effectiveness: undefined }
      ]);
      const result = bridge.process('test input');
      expect(result.lessons[0]).toEqual({
        id: '', title: '', priority: 'medium', category: '', effectiveness: 0
      });
    });

    test('warns when high priority lesson has truthy low useCount', () => {
      setupFsMock({ existsSync: false });
      setupProcessMocks();
      mockGetRelevantLessons.mockReturnValue([
        { id: 'LESSON_003', lesson: 'Used Lesson', priority: 'high', useCount: 0.5 }
      ]);
      const result = bridge.process('test input');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('LESSON_003');
    });
  });

  describe('autoExecute risk paths', () => {
    function setupFullAutoConfig(overrides = {}) {
      jest.restoreAllMocks();
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
        enabled: true, fullAuto: true, fullAutoWhitelist: ['ReadFile'],
        circuitBreaker: { maxRetries: 3, resetAfterMs: 60000 },
        loopGuard: { maxHistory: 50, maxPerMinute: 3 },
        audit: { maxDays: 90 }, backup: { maxBackups: 30, minDiskSpaceMB: 100 },
        learner: { enabled: true, minConfidence: 0.3, requireApproval: true, autoApprovalThreshold: 0.8 },
        diagnose: { enabled: true, maxResults: 3, minScore: 0.1 },
        daemon: { enabled: true, healthIntervalMs: 300000, cleanIntervalMs: 3600000 },
        proactive: { enabled: true, scanIntervalMs: 3600000 },
        ...overrides
      }));
      jest.spyOn(fs, 'writeFileSync').mockReturnValue();
    }

    test('returns blocked_by_risk when PreToolRiskAnalyzer returns BLOCK', () => {
      setupFullAutoConfig();
      bridge.initialize();
      mockPreToolRiskAnalyzer.analyze.mockReturnValue({ action: 'BLOCK', reason: 'high_risk' });
      const result = bridge.autoExecute('ReadFile', ['test.js']);
      expect(result.executed).toBe(false);
      expect(result.reason).toBe('blocked_by_risk');
    });

    test('returns blocked_by_risk without audit when audit is null', () => {
      setupFullAutoConfig();
      bridge.initialize();
      bridge._audit = null;
      mockPreToolRiskAnalyzer.analyze.mockReturnValue({ action: 'BLOCK', reason: 'high_risk' });
      const result = bridge.autoExecute('ReadFile', ['test.js']);
      expect(result.executed).toBe(false);
      expect(result.reason).toBe('blocked_by_risk');
    });

    test('returns not_in_whitelist when risk is WARN and tool not whitelisted', () => {
      setupFullAutoConfig();
      const spy = jest.spyOn(fs, 'readFileSync');
      spy.mockReturnValue(JSON.stringify({
        enabled: true, fullAuto: true, fullAutoWhitelist: [],
        circuitBreaker: { maxRetries: 3, resetAfterMs: 60000 },
        loopGuard: { maxHistory: 50, maxPerMinute: 3 },
        audit: { maxDays: 90 }, backup: { maxBackups: 30, minDiskSpaceMB: 100 },
        learner: { enabled: true, minConfidence: 0.3, requireApproval: true, autoApprovalThreshold: 0.8 },
        diagnose: { enabled: true, maxResults: 3, minScore: 0.1 },
        daemon: { enabled: true, healthIntervalMs: 300000, cleanIntervalMs: 3600000 },
        proactive: { enabled: true, scanIntervalMs: 3600000 }
      }));
      bridge.initialize();
      mockPreToolRiskAnalyzer.analyze.mockReturnValue({ action: 'WARN', reason: 'suspicious' });
      const result = bridge.autoExecute('ReadFile', ['test.js']);
      expect(result.executed).toBe(false);
      expect(result.reason).toBe('not_in_whitelist');
    });

    test('falls back to empty whitelist when config lacks fullAutoWhitelist', () => {
      setupFullAutoConfig({ fullAutoWhitelist: null });
      bridge.initialize();
      mockPreToolRiskAnalyzer.analyze.mockReturnValue({ action: 'WARN', reason: 'suspicious' });
      const result = bridge.autoExecute('WriteFile', ['test.js']);
      expect(result.executed).toBe(false);
      expect(result.reason).toBe('not_in_whitelist');
    });

    test('returns not_in_whitelist when WARN tool not in whitelist', () => {
      setupFullAutoConfig();
      bridge.initialize();
      mockPreToolRiskAnalyzer.analyze.mockReturnValue({ action: 'WARN', reason: 'suspicious' });
      const result = bridge.autoExecute('WriteFile', ['test.js']);
      expect(result.executed).toBe(false);
      expect(result.reason).toBe('not_in_whitelist');
    });

    test('executes when WARN tool is in whitelist', () => {
      setupFullAutoConfig();
      bridge.initialize();
      mockPreToolRiskAnalyzer.analyze.mockReturnValue({ action: 'WARN', reason: 'suspicious' });
      mockToolExecutor.execute.mockReturnValue('success');
      const result = bridge.autoExecute('ReadFile', ['test.js']);
      expect(result.executed).toBe(true);
      expect(result.result).toBe('success');
    });

    test('returns not_in_whitelist without audit when audit is null', () => {
      setupFullAutoConfig();
      bridge.initialize();
      bridge._audit = null;
      mockPreToolRiskAnalyzer.analyze.mockReturnValue({ action: 'WARN', reason: 'suspicious' });
      const result = bridge.autoExecute('WriteFile', ['test.js']);
      expect(result.executed).toBe(false);
      expect(result.reason).toBe('not_in_whitelist');
    });

    test('executes when risk is ALLOW', () => {
      setupFullAutoConfig();
      bridge.initialize();
      mockPreToolRiskAnalyzer.analyze.mockReturnValue({ action: 'ALLOW' });
      mockToolExecutor.execute.mockReturnValue('success');
      const result = bridge.autoExecute('ReadFile', ['test.js']);
      expect(result.executed).toBe(true);
      expect(result.result).toBe('success');
    });

    test('executes without audit when audit is null', () => {
      setupFullAutoConfig();
      bridge.initialize();
      bridge._audit = null;
      mockPreToolRiskAnalyzer.analyze.mockReturnValue({ action: 'ALLOW' });
      mockToolExecutor.execute.mockReturnValue('success');
      const result = bridge.autoExecute('ReadFile', ['test.js']);
      expect(result.executed).toBe(true);
      expect(result.result).toBe('success');
    });

    test('returns execution_error when executor throws', () => {
      setupFullAutoConfig();
      bridge.initialize();
      mockPreToolRiskAnalyzer.analyze.mockReturnValue({ action: 'ALLOW' });
      mockToolExecutor.execute.mockImplementation(() => { throw new Error('exec failed'); });
      const result = bridge.autoExecute('ReadFile', ['test.js']);
      expect(result.executed).toBe(false);
      expect(result.reason).toBe('execution_error');
    });

    test('returns execution_error without audit when audit is null', () => {
      setupFullAutoConfig();
      bridge.initialize();
      bridge._audit = null;
      mockPreToolRiskAnalyzer.analyze.mockReturnValue({ action: 'ALLOW' });
      mockToolExecutor.execute.mockImplementation(() => { throw new Error('exec failed'); });
      const result = bridge.autoExecute('ReadFile', ['test.js']);
      expect(result.executed).toBe(false);
      expect(result.reason).toBe('execution_error');
    });
  });

  describe('diagnose', () => {
    test('returns results when AutoDiagnose succeeds', () => {
      setupFsMock({ existsSync: false });
      bridge.initialize();
      mockAutoDiagnoseDiagnose.mockReturnValue([{ id: 'DIAG_001', description: 'test diagnosis' }]);
      const results = bridge.diagnose('test error', 3);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('DIAG_001');
    });

    test('returns empty array when AutoDiagnose throws', () => {
      setupFsMock({ existsSync: false });
      bridge.initialize();
      mockAutoDiagnoseDiagnose.mockImplementation(() => { throw new Error('diagnose failed'); });
      const results = bridge.diagnose('test error', 3);
      expect(results).toEqual([]);
    });

    test('returns results without audit when audit is null', () => {
      setupFsMock({ existsSync: false });
      bridge.initialize();
      bridge._audit = null;
      mockAutoDiagnoseDiagnose.mockReturnValue([{ id: 'DIAG_001', description: 'test diagnosis' }]);
      const results = bridge.diagnose('test error', 3);
      expect(results.length).toBe(1);
    });

    test('returns empty array without audit when AutoDiagnose throws', () => {
      setupFsMock({ existsSync: false });
      bridge.initialize();
      bridge._audit = null;
      mockAutoDiagnoseDiagnose.mockImplementation(() => { throw new Error('diagnose failed'); });
      const results = bridge.diagnose('test error', 3);
      expect(results).toEqual([]);
    });
  });
});
