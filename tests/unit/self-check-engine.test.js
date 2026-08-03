describe('SelfCheckEngine', () => {
  let SelfCheckEngine;
  let engine;
  let bs;

  beforeAll(() => {
    SelfCheckEngine = require('../../src/utils/SelfCheckEngine');
  });

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    bs = {
      state: {
        decisionCount: 5,
        lastSelfCheck: null,
        selfCheckCount: 0
      },
      lessonLibrary: {
        getStats: jest.fn().mockReturnValue({ applied: 3, total: 10, unapplied: 7 }),
        lessons: [{ id: 'l1', priority: 'high', applied: false, lesson: 'test lesson' }],
        markApplied: jest.fn()
      },
      _calculateHealth: jest.fn().mockReturnValue({
        score: 60, level: 'good', metrics: {}, improvements: ['improve A']
      }),
      _runDailyCheck: jest.fn(),
      _selfMonitor: jest.fn(),
      comprehensiveChecker: null,
      selfCheckInterval: null,
      monitoringInterval: null
    };
    engine = new SelfCheckEngine(bs);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('_autoStartDailyCheck', () => {
    it('sets up intervals and updates lastSelfCheck', () => {
      jest.useFakeTimers();
      engine._autoStartDailyCheck();
      expect(bs.state.lastSelfCheck).toBeDefined();
      expect(bs.selfCheckInterval).toBeDefined();
      expect(bs.monitoringInterval).toBeDefined();
      jest.clearAllTimers();
    });
  });

  describe('_runDailyCheck', () => {
    it('updates lastSelfCheck timestamp', () => {
      const before = Date.now();
      engine._runDailyCheck();
      expect(bs.state.lastSelfCheck).toBeGreaterThanOrEqual(before);
    });

    it('auto-applies high-priority lesson when application rate < 0.3', () => {
      bs.lessonLibrary.getStats.mockReturnValue({ applied: 1, total: 10, unapplied: 9 });
      engine._runDailyCheck();
      expect(bs.lessonLibrary.markApplied).toHaveBeenCalledWith('l1');
    });

    it('does NOT auto-apply when application rate >= 0.3', () => {
      engine._runDailyCheck();
      expect(bs.lessonLibrary.markApplied).not.toHaveBeenCalled();
    });

    it('increments selfCheckCount when comprehensiveChecker absent', () => {
      bs.comprehensiveChecker = null;
      engine._runDailyCheck();
      expect(bs.state.selfCheckCount).toBe(1);
    });

    it('calls comprehensiveChecker.run every 10th check', () => {
      bs.comprehensiveChecker = { run: jest.fn().mockResolvedValue({ stats: { passed: 56, failed: 0 } }) };
      bs.state.selfCheckCount = 9;
      engine._runDailyCheck();
      expect(bs.comprehensiveChecker.run).toHaveBeenCalled();
    });

    it('increments selfCheckCount with comprehensiveChecker', () => {
      bs.comprehensiveChecker = { run: jest.fn().mockResolvedValue({ stats: { passed: 50, failed: 0 } }) };
      bs.state.selfCheckCount = 9;
      engine._runDailyCheck();
      expect(bs.state.selfCheckCount).toBe(10);
    });

    it('logs when no decisions yet', () => {
      bs.state.decisionCount = 0;
      engine._runDailyCheck();
    });
  });

  describe('getActiveSuggestions', () => {
    it('returns improvement suggestion when rate < 50% and total > 10', () => {
      bs.lessonLibrary.getStats.mockReturnValue({ applied: 3, total: 20, unapplied: 17 });
      const suggestions = engine.getActiveSuggestions();
      expect(suggestions.some(s => s.type === 'improvement')).toBe(true);
    });

    it('returns usage suggestion when decisionCount < 5', () => {
      bs.state.decisionCount = 2;
      const suggestions = engine.getActiveSuggestions();
      expect(suggestions.some(s => s.type === 'usage')).toBe(true);
    });

    it('returns module suggestion when controller is missing', () => {
      bs.controller = null;
      bs.introspection = null;
      const suggestions = engine.getActiveSuggestions();
      expect(suggestions.some(s => s.type === 'module')).toBe(true);
    });

    it('does not include module suggestion when all modules present', () => {
      bs.controller = {};
      bs.introspection = {};
      const suggestions = engine.getActiveSuggestions();
      expect(suggestions.some(s => s.type === 'module')).toBe(false);
    });
  });

  describe('主动Learn', () => {
    it('returns learning from decision history', () => {
      bs.state.decisionCount = 5;
      bs.state.selfCheckCount = 3;
      const learnings = engine['主动Learn']();
      expect(learnings).toHaveLength(2);
    });

    it('returns empty when no decisions or checks', () => {
      bs.state.decisionCount = 0;
      bs.state.selfCheckCount = 0;
      const learnings = engine['主动Learn']();
      expect(learnings).toHaveLength(0);
    });
  });

  describe('generateImprovementPlan', () => {
    it('generates plan with actions based on health and stats', () => {
      const plan = engine.generateImprovementPlan();
      expect(plan).toHaveProperty('actions');
      expect(plan).toHaveProperty('reason');
    });

    it('adds improvement action when health < 40', () => {
      bs._calculateHealth.mockReturnValue({ score: 30, level: 'poor', metrics: {}, improvements: [] });
      const plan = engine.generateImprovementPlan();
      expect(plan.actions.length).toBeGreaterThanOrEqual(1);
    });

    it('adds lesson action when applied rate < 50%', () => {
      const plan = engine.generateImprovementPlan();
      expect(plan.actions.some(a => a.action.includes('beforeDecision'))).toBe(true);
    });

    it('adds monitoring action when no interval', () => {
      const plan = engine.generateImprovementPlan();
      expect(plan.actions.some(a => a.action.includes('startSelfMonitoring'))).toBe(true);
    });
  });

  describe('analyzePatterns', () => {
    it('returns patterns with last context', () => {
      bs.state.lastContext = 'test context';
      const patterns = engine.analyzePatterns();
      expect(patterns.decisionTopics).toContain('test context');
    });

    it('returns insights when memory available', () => {
      bs.memory = { getRecent: jest.fn().mockReturnValue([{}, {}, {}]) };
      const patterns = engine.analyzePatterns();
      expect(patterns.insights.some(i => i.includes('3 条近期记忆'))).toBe(true);
    });

    it('handles memory error gracefully', () => {
      bs.memory = { getRecent: jest.fn().mockImplementation(() => { throw new Error('mem fail'); }) };
      expect(() => engine.analyzePatterns()).not.toThrow();
    });
  });

  describe('generateStatusReport', () => {
    it('returns report with health, activity, lessons, capabilities', () => {
      const report = engine.generateStatusReport();
      expect(report).toHaveProperty('health');
      expect(report).toHaveProperty('activity');
      expect(report).toHaveProperty('lessons');
      expect(report).toHaveProperty('capabilities');
      expect(report.activity.decisions).toBe(5);
    });
  });

  describe('getQuickStatus', () => {
    it('returns excellent status when score >= 80', () => {
      bs._calculateHealth.mockReturnValue({ score: 85, level: 'excellent', metrics: {}, improvements: [] });
      const status = engine.getQuickStatus();
      expect(status).toContain('状态优秀');
    });

    it('returns good status when score >= 60', () => {
      const status = engine.getQuickStatus();
      expect(status).toContain('状态良好');
    });

    it('returns fair status when score >= 40', () => {
      bs._calculateHealth.mockReturnValue({ score: 45, level: 'fair', metrics: {}, improvements: [] });
      const status = engine.getQuickStatus();
      expect(status).toContain('状态一般');
    });

    it('returns needs improvement when score < 40', () => {
      bs._calculateHealth.mockReturnValue({ score: 25, level: 'poor', metrics: {}, improvements: [] });
      const status = engine.getQuickStatus();
      expect(status).toContain('需要改进');
    });

    it('includes lesson and decision info', () => {
      const status = engine.getQuickStatus();
      expect(status).toContain('教训应用');
      expect(status).toContain('决策5次');
    });
  });
});
