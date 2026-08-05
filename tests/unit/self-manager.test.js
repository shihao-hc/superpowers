const BrainUtils = require('../../src/utils/BrainUtils');
const selfManager = require('../../src/utils/SelfManager');

function makeBs(overrides = {}) {
  const lessonLibrary = {
    categories: { code: '代码', learning: '学习' },
    getStats: jest.fn().mockReturnValue({ byCategory: { code: 1 }, total: 0, applied: 0 }),
  };
  const evolution = {
    getStats: jest.fn().mockReturnValue({ recentLearnings: [] }),
    learn: jest.fn(),
  };
  const bs = {
    lessonLibrary,
    evolution,
    state: { decisionCount: 0 },
    enabled: true,
    monitoringInterval: null,
    evolutionLoop: null,
    _identifyLimitations: jest.fn().mockReturnValue([]),
    predictIssues: jest.fn().mockReturnValue({ opportunities: [], risks: [] }),
    _calculateHealth: jest.fn().mockReturnValue({ level: 'good', score: 70 }),
    getSelfAwareness: jest.fn().mockReturnValue({ capabilities: { selfEvolution: { level: 3 } } }),
    setSelfGoals: jest.fn().mockReturnValue([]),
    curiosityExplore: jest.fn().mockReturnValue({ areas: [] }),
    getImprovements: jest.fn().mockReturnValue({ suggestions: [], priority: 'medium' }),
    getStatus: jest.fn().mockReturnValue({
      health: 'good', decisionCount: 5, lessons: { total: 10, applied: 5 },
      evolution: { recentLearnings: [{ id: 'l1' }] },
    }),
    getSummary: jest.fn().mockReturnValue({
      version: 'v7.1', status: 'active', health: 'good', decisions: 5,
      lessons: { total: 10 },
    }),
    getLessonHistory: jest.fn().mockReturnValue([{ id: 'l1' }]),
    beforeDecision: jest.fn().mockReturnValue({ relatedLessons: [1, 2] }),
    afterDecision: jest.fn(),
    _executeAction: jest.fn().mockReturnValue({ success: true }),
    ...overrides,
  };
  return bs;
}

describe('SelfManager', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('curiosityExplore', () => {
    test('finds unexplored categories, knowledge gaps, and opportunities', () => {
      const bs = makeBs({
        _identifyLimitations: jest.fn().mockReturnValue([{ area: '安全' }]),
        predictIssues: jest.fn().mockReturnValue({
          opportunities: [{ message: '机会A' }], risks: [],
        }),
      });
      const result = selfManager.curiosityExplore(bs);
      expect(result.areas).toHaveLength(3);
      expect(result.areas[0].type).toBe(' unexplored');
      expect(result.areas[0].category).toBe('学习');
      expect(result.areas[1].type).toBe('knowledge-gap');
      expect(result.areas[1].areas).toEqual(['安全']);
      expect(result.areas[2].type).toBe('opportunity');
      expect(result.areas[2].items).toEqual(['机会A']);
    });

    test('returns empty areas when everything covered', () => {
      const bs = makeBs({
        lessonLibrary: {
          categories: { code: '代码' },
          getStats: jest.fn().mockReturnValue({ byCategory: { code: 1 }, total: 1, applied: 1 }),
        },
      });
      const result = selfManager.curiosityExplore(bs);
      expect(result.areas).toEqual([]);
    });
  });

  describe('setSelfGoals', () => {
    test('adds all four goals when conditions met', () => {
      const bs = makeBs({
        lessonLibrary: {
          categories: {},
          getStats: jest.fn().mockReturnValue({ byCategory: {}, total: 20, applied: 2 }),
        },
        evolution: {
          getStats: jest.fn().mockReturnValue({ recentLearnings: [{ id: 'a' }] }),
          learn: jest.fn(),
        },
        state: { decisionCount: 15 },
      });
      const goals = selfManager.setSelfGoals(bs);
      expect(goals.map((g) => g.id)).toEqual([
        'lesson-application', 'learning-frequency', 'knowledge-expansion', 'decision-quality',
      ]);
      expect(goals[0].current).toBe('10%');
    });

    test('adds no goals when all conditions satisfied', () => {
      const bs = makeBs({
        lessonLibrary: {
          categories: {},
          getStats: jest.fn().mockReturnValue({ byCategory: {}, total: 40, applied: 20 }),
        },
        evolution: {
          getStats: jest.fn().mockReturnValue({ recentLearnings: [{}, {}, {}, {}, {}] }),
          learn: jest.fn(),
        },
        state: { decisionCount: 3 },
      });
      expect(selfManager.setSelfGoals(bs)).toEqual([]);
    });

    test('handles missing evolution stats', () => {
      const bs = makeBs({
        evolution: { getStats: jest.fn().mockReturnValue(undefined), learn: jest.fn() },
      });
      const goals = selfManager.setSelfGoals(bs);
      expect(goals.some((g) => g.id === 'learning-frequency')).toBe(true);
    });
  });

  describe('diagnose', () => {
    test('assembles full diagnosis', () => {
      const bs = makeBs();
      const spy = jest.spyOn(BrainUtils, '_generateRecommendations').mockReturnValue([]);
      const diag = selfManager.diagnose(bs);
      expect(diag.selfAwareness).toBeDefined();
      expect(diag.health.level).toBe('good');
      expect(diag.goals).toEqual([]);
      expect(diag.exploration.areas).toEqual([]);
      expect(diag.recommendations).toEqual([]);
      expect(bs.getSelfAwareness).toHaveBeenCalled();
      expect(bs.getImprovements).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('getSummary', () => {
    test('reports active status with stats', () => {
      const bs = makeBs();
      const summary = selfManager.getSummary(bs);
      expect(summary.version).toBe('v7.1');
      expect(summary.status).toBe('active');
      expect(summary.health).toBe('good');
      expect(summary.decisions).toBe(0);
      expect(summary.active.monitoring).toBe(false);
      expect(summary.active.evolutionLoop).toBe(false);
      expect(summary.risks).toBe(0);
    });

    test('reports inactive when disabled', () => {
      const bs = makeBs({ enabled: false });
      expect(selfManager.getSummary(bs).status).toBe('inactive');
    });

    test('reports 0% rate when no lessons', () => {
      const bs = makeBs({
        lessonLibrary: {
          categories: {},
          getStats: jest.fn().mockReturnValue({ byCategory: {}, total: 0, applied: 0 }),
        },
      });
      expect(selfManager.getSummary(bs).lessons.rate).toBe('0%');
    });
  });

  describe('getBrainBrief', () => {
    test('summarizes brief with first goal', () => {
      const bs = makeBs({
        setSelfGoals: jest.fn().mockReturnValue([{ description: '目标1' }, { description: '目标2' }]),
      });
      const brief = selfManager.getBrainBrief(bs);
      expect(brief.activeGoals).toBe(2);
      expect(brief.nextAction).toBe('目标1');
      expect(brief.keyCapability).toBe(3);
    });

    test('falls back to default next action when no goals', () => {
      const bs = makeBs();
      expect(selfManager.getBrainBrief(bs).nextAction).toBe('继续当前任务');
    });
  });

  describe('generateSelfReport', () => {
    test('builds report with recommendations', () => {
      const bs = makeBs();
      const spy = jest.spyOn(BrainUtils, '_generateRecommendations').mockReturnValue([]);
      const report = selfManager.generateSelfReport(bs);
      expect(report.brainVersion).toBe('v6.0');
      expect(report.overallHealth).toBe('good');
      expect(report.stats.decisions).toBe(5);
      expect(report.stats.lessons).toBe(10);
      expect(report.stats.evolutionLearnings).toBe(1);
      expect(report.recentLessonsApplied).toEqual([{ id: 'l1' }]);
      expect(report.improvements).toEqual([]);
      spy.mockRestore();
    });
  });

  describe('generateActionPlan', () => {
    test('converts suggestions to sorted actions and auto-executes high priority', () => {
      const bs = makeBs({
        getImprovements: jest.fn().mockReturnValue({
          priority: 'high',
          suggestions: [
            { description: '低优建议' },
            { description: '高优建议', autoExecutable: true, priority: 'high' },
          ],
        }),
      });
      const suggestionSpy = jest.spyOn(BrainUtils, '_suggestionToAction')
        .mockImplementation((s) => ({
          description: s.description,
          priority: s.autoExecutable ? 'high' : 'low',
          autoExecutable: !!s.autoExecutable,
        }));
      const plan = selfManager.generateActionPlan(bs);
      expect(plan.actions).toHaveLength(2);
      expect(plan.actions[0].priority).toBe('high');
      expect(plan.autoExecuted).toHaveLength(1);
      expect(bs._executeAction).toHaveBeenCalled();
      suggestionSpy.mockRestore();
    });

    test('filters actions with no conversion and auto-executes none', () => {
      const bs = makeBs({
        getImprovements: jest.fn().mockReturnValue({
          priority: 'low',
          suggestions: [{ description: '不可执行' }],
        }),
      });
      const spy = jest.spyOn(BrainUtils, '_suggestionToAction').mockReturnValue(null);
      const plan = selfManager.generateActionPlan(bs);
      expect(plan.actions).toEqual([]);
      expect(plan.autoExecuted).toEqual([]);
      spy.mockRestore();
    });
  });

  describe('_executeAction', () => {
    const cases = [
      { desc: '分析教训库内容，将高价值教训标记为优先', message: '教训库分析完成' },
      { desc: '执行一次自我复盘，记录学习', message: '复盘已记录' },
      { desc: '检查教训与决策流程集成状态', message: '集成状态正常' },
      { desc: '强制触发复盘流程', message: '复盘已触发' },
    ];

    for (const c of cases) {
      test(`handles action: ${c.desc}`, () => {
        const bs = makeBs();
        const result = selfManager._executeAction(bs, { description: c.desc });
        expect(result.success).toBe(true);
        expect(result.message).toBe(c.message);
      });
    }

    test('reports failure for unknown action', () => {
      const bs = makeBs();
      const result = selfManager._executeAction(bs, { description: '未知动作' });
      expect(result.success).toBe(false);
      expect(result.message).toBe('无法自动执行');
    });

    test('catches errors during execution', () => {
      const bs = makeBs({
        lessonLibrary: {
          categories: {},
          getStats: jest.fn().mockImplementation(() => {
            throw new Error('boom');
          }),
        },
      });
      const result = selfManager._executeAction(bs, { description: '分析教训库内容，将高价值教训标记为优先' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('boom');
    });
  });
});
