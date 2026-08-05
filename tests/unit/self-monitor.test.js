const { SelfMonitor } = require('../../src/utils/SelfMonitor');

function makeBs(overrides = {}) {
  const bs = {
    lessonLibrary: { getStats: jest.fn().mockReturnValue({ total: 10, applied: 5 }) },
    evolution: { getStats: jest.fn().mockReturnValue({ recentLearnings: [{}, {}, {}, {}, {}] }) },
    tools: { getStats: jest.fn().mockReturnValue({ usageCount: 5 }) },
    metaCognition: {
      analyzeHistory: jest.fn().mockReturnValue({ uncertainRate: 0.1 }),
      history: [],
    },
    state: { decisionCount: 5 },
    selfCheckInterval: null,
    monitoringInterval: null,
    thinking: {},
    reverseThinking: {},
    beforeDecision: jest.fn(),
    afterDecision: jest.fn(),
    ...overrides,
  };
  return bs;
}

describe('SelfMonitor', () => {
  let monitor;
  let bs;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    bs = makeBs();
    monitor = new SelfMonitor(bs);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (bs.monitoringInterval) clearInterval(bs.monitoringInterval);
    if (bs.selfCheckInterval) clearInterval(bs.selfCheckInterval);
  });

  describe('_calculateHealth', () => {
    test('computes excellent health with all modules active', () => {
      bs.lessonLibrary.getStats.mockReturnValue({ total: 10, applied: 10 });
      bs.evolution.getStats.mockReturnValue({ recentLearnings: [{}, {}, {}, {}, {}] });
      bs.state.decisionCount = 20;
      bs.monitoringInterval = setInterval(() => {}, 60000);
      bs.selfCheckInterval = setInterval(() => {}, 60000);
      const health = monitor._calculateHealth();
      expect(health.level).toBe('excellent');
      expect(health.score).toBeGreaterThanOrEqual(80);
      expect(health.metrics.lessonLibrary.rate).toBe('100%');
      expect(health.metrics.systemReady.activeModules).toBe(6);
      expect(health.metrics.proactive.selfCheck).toBe(true);
      expect(health.metrics.proactive.monitoring).toBe(true);
    });

    test('reports low health with no lessons and low decisions', () => {
      bs.lessonLibrary.getStats.mockReturnValue({ total: 0, applied: 0 });
      bs.evolution.getStats.mockReturnValue({ recentLearnings: [] });
      bs.state.decisionCount = 0;
      bs.tools = null;
      bs.thinking = null;
      bs.reverseThinking = null;
      const health = monitor._calculateHealth();
      expect(health.level).toBe('needs-improvement');
      expect(health.score).toBeLessThan(40);
      expect(health.metrics.lessonLibrary.hasSystem).toBe(false);
    });

    test('flags low application rate when lessons exceed 5', () => {
      bs.lessonLibrary.getStats.mockReturnValue({ total: 20, applied: 2 });
      const health = monitor._calculateHealth();
      expect(health.improvements.length).toBeGreaterThan(0);
    });

    test('caps evolution and decision scores at 1', () => {
      bs.evolution.getStats.mockReturnValue({ recentLearnings: new Array(50).fill({}) });
      bs.state.decisionCount = 100;
      const health = monitor._calculateHealth();
      expect(health.metrics.evolution.score).toBe(1);
      expect(health.metrics.decisionDiversity.score).toBe(1);
    });

    test('handles missing evolution stats', () => {
      bs.evolution.getStats.mockReturnValue(undefined);
      const health = monitor._calculateHealth();
      expect(health.metrics.evolution.recentLearnings).toBe(0);
    });
  });

  describe('startSelfMonitoring / stopSelfMonitoring', () => {
    test('starts monitoring and runs immediate check', () => {
      const spy = jest.spyOn(monitor, '_selfMonitor').mockReturnValue({ checks: [] });
      monitor.startSelfMonitoring(1000);
      expect(bs.monitoringInterval).toBeTruthy();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    test('is a no-op when already running', () => {
      bs.monitoringInterval = setInterval(() => {}, 60000);
      const spy = jest.spyOn(monitor, '_selfMonitor');
      monitor.startSelfMonitoring(1000);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    test('stopSelfMonitoring clears interval', () => {
      monitor.startSelfMonitoring(1000);
      monitor.stopSelfMonitoring();
      expect(bs.monitoringInterval).toBeNull();
    });

    test('stopSelfMonitoring is safe when no interval', () => {
      expect(() => monitor.stopSelfMonitoring()).not.toThrow();
    });
  });

  describe('_selfMonitor', () => {
    test('returns normal summary when no issues', () => {
      const result = monitor._selfMonitor();
      expect(result.checks).toHaveLength(5);
      expect(result.issueCount).toBe(0);
      expect(result.summary).toBe('正常');
    });

    test('reports issues and auto-fixes when warnings present', () => {
      bs.state.decisionCount = 0;
      bs.evolution.getStats.mockReturnValue({ recentLearnings: [] });
      bs.tools.getStats.mockReturnValue({ usageCount: 0 });
      bs.metaCognition.history = new Array(60).fill({});
      const autoSpy = jest.spyOn(monitor, '_autoFixIssues');
      const result = monitor._selfMonitor();
      expect(result.issueCount).toBeGreaterThan(0);
      expect(autoSpy).toHaveBeenCalled();
      autoSpy.mockRestore();
    });
  });

  describe('_checkDecisionQuality', () => {
    test('warns when no decisions', () => {
      bs.state.decisionCount = 0;
      const check = monitor._checkDecisionQuality();
      expect(check.status).toBe('warning');
      expect(check.message).toBe('尚无决策记录');
    });

    test('warns when uncertainty high', () => {
      bs.metaCognition.analyzeHistory.mockReturnValue({ uncertainRate: 0.9 });
      const check = monitor._checkDecisionQuality();
      expect(check.status).toBe('warning');
      expect(check.issues).toContain('增加信息收集后再决策');
    });

    test('ok when decisions exist and uncertainty low', () => {
      expect(monitor._checkDecisionQuality().status).toBe('ok');
    });
  });

  describe('_checkEvolutionActivity', () => {
    test('warns when no recent learning', () => {
      bs.evolution.getStats.mockReturnValue({ recentLearnings: [] });
      const check = monitor._checkEvolutionActivity();
      expect(check.status).toBe('warning');
      expect(check.issues).toContain('建议增加任务后的复盘');
    });

    test('warns when low learning frequency with many decisions', () => {
      bs.evolution.getStats.mockReturnValue({ recentLearnings: [{ id: 'a' }] });
      bs.state.decisionCount = 20;
      const check = monitor._checkEvolutionActivity();
      expect(check.status).toBe('warning');
      expect(check.message).toBe('学习频率偏低');
    });

    test('ok when learning frequent', () => {
      expect(monitor._checkEvolutionActivity().status).toBe('ok');
    });
  });

  describe('_checkToolEfficiency', () => {
    test('warns when no tools used but many decisions', () => {
      bs.tools.getStats.mockReturnValue({ usageCount: 0 });
      bs.state.decisionCount = 10;
      const check = monitor._checkToolEfficiency();
      expect(check.status).toBe('warning');
      expect(check.message).toBe('未使用工具');
    });

    test('ok when tools used', () => {
      expect(monitor._checkToolEfficiency().status).toBe('ok');
    });
  });

  describe('_checkMetaCognitionStatus', () => {
    test('warns when history long', () => {
      bs.metaCognition.history = new Array(51).fill({});
      const check = monitor._checkMetaCognitionStatus();
      expect(check.status).toBe('warning');
      expect(check.message).toBe('复盘历史较长');
    });

    test('ok when history short', () => {
      expect(monitor._checkMetaCognitionStatus().status).toBe('ok');
    });
  });

  describe('_autoFixIssues', () => {
    test('fixes lesson-health critical with beforeDecision', () => {
      monitor._autoFixIssues([{
        check: 'lesson-health',
        status: 'critical',
        issues: ['教训未被使用，需要检查集成'],
      }]);
      expect(bs.beforeDecision).toHaveBeenCalledWith('health-check');
    });

    test('does not fix lesson-health when not critical', () => {
      monitor._autoFixIssues([{ check: 'lesson-health', status: 'warning', issues: [] }]);
      expect(bs.beforeDecision).not.toHaveBeenCalled();
    });

    test('fixes evolution-activity with afterDecision', () => {
      monitor._autoFixIssues([{ check: 'evolution-activity', issues: ['建议增加任务后的复盘'] }]);
      expect(bs.afterDecision).toHaveBeenCalledWith('auto-monitor', { success: true }, 'self-check');
    });

    test('fixes meta-status by slicing history', () => {
      bs.metaCognition.history = new Array(60).fill({});
      monitor._autoFixIssues([{ check: 'meta-status', issues: ['考虑压缩历史记录'] }]);
      expect(bs.metaCognition.history).toHaveLength(30);
    });

    test('catches errors during fixes', () => {
      bs.beforeDecision.mockImplementation(() => {
        throw new Error('fix fail');
      });
      expect(() => monitor._autoFixIssues([{
        check: 'lesson-health',
        status: 'critical',
        issues: ['教训未被使用，需要检查集成'],
      }])).not.toThrow();
    });
  });
});
