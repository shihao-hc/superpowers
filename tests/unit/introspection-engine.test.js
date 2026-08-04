const { IntrospectionEngine } = require('../../src/utils/IntrospectionEngine');

function makeLessonLibrary({ total = 25, applied = 10, lessons = [], categories = {} } = {}) {
  const realLessons = lessons;
  return {
    lessons: realLessons,
    categories,
    getStats() {
      return {
        total,
        applied,
        lessons: realLessons
      };
    },
    search() {
      return realLessons;
    }
  };
}

function makeBrain(overrides = {}) {
  const lessonLibrary = overrides.lessonLibrary || makeLessonLibrary();
  const brain = {
    metaCognition: {
      history: [{ ts: Date.now() }],
      analyzeHistory: () => ({ message: '暂无复盘历史', uncertainRate: 0 })
    },
    evolution: {
      getStats: () => ({ recentLearnings: ['a', 'b'] })
    },
    tools: {
      getStats: () => ({ usageCount: 42 })
    },
    lessonLibrary,
    predictIssues: () => ({ risks: [] }),
    _calculateHealth: () => ({ score: 88, level: 'healthy' }),
    state: { decisionCount: 7 }
  };
  return { ...brain, ...overrides };
}

describe('IntrospectionEngine', () => {
  test('getSelfAwareness returns all five facets', () => {
    const engine = new IntrospectionEngine(makeBrain());
    const result = engine.getSelfAwareness();
    expect(Object.keys(result)).toEqual(['identity', 'capabilities', 'knowledge', 'limitations', 'growth']);
    expect(result.identity.name).toBe('AI Brain System');
    expect(result.capabilities.metaCognition.level).toBe('high');
    expect(result.capabilities.toolUsage.evidence).toBe('42次使用');
    expect(result.growth.healthScore).toBe(88);
  });

  test('capabilities evidence falls back when recentLearnings absent', () => {
    const brain = makeBrain();
    brain.evolution.getStats = () => ({});
    const engine = new IntrospectionEngine(brain);
    const result = engine._assessCapabilities();
    expect(result.selfEvolution.evidence).toBe('0次学习');
  });

  test('_assessKnowledge aggregates categories and top lessons', () => {
    const lessons = [
      { lesson: '永不硬编码密钥', category: 'security', priority: 'high', applied: 5, date: new Date().toISOString() },
      { lesson: '先搜后改', category: 'process', priority: 'medium', applied: 2, date: new Date().toISOString() }
    ];
    const brain = makeBrain({
      lessonLibrary: makeLessonLibrary({
        lessons,
        categories: { security: '安全', process: '流程' }
      })
    });
    const engine = new IntrospectionEngine(brain);
    const result = engine._assessKnowledge();
    expect(result.total).toBe(25);
    expect(result.applied).toBe(10);
    expect(result.domains).toEqual({ 安全: 1, 流程: 1 });
    expect(result.topLessons).toHaveLength(1);
    expect(result.topLessons[0].category).toBe('security');
    expect(result.topLessons[0].lesson).toContain('永不硬编码密钥');
  });

  test('_assessKnowledge skips categories with zero lessons', () => {
    const lessons = [
      { lesson: 'a', category: 'security', priority: 'high', applied: 1, date: new Date().toISOString() }
    ];
    const brain = makeBrain({
      lessonLibrary: makeLessonLibrary({
        lessons,
        categories: { security: '安全', empty: '空类' }
      })
    });
    const engine = new IntrospectionEngine(brain);
    const result = engine._assessKnowledge();
    expect(result.domains).toEqual({ 安全: 1 });
  });

  test('_identifyLimitations flags small library and zero applied', () => {
    const brain = makeBrain({
      lessonLibrary: makeLessonLibrary({ total: 5, applied: 0 })
    });
    const engine = new IntrospectionEngine(brain);
    const limitations = engine._identifyLimitations();
    const areas = limitations.map((l) => l.area);
    expect(areas).toContain('经验积累');
    expect(areas).toContain('知识应用');
  });

  test('_identifyLimitations adds risks and high uncertainty', () => {
    const brain = makeBrain({
      predictIssues: () => ({
        risks: [
          { type: 'security', message: '密钥泄露风险' },
          { type: 'stability', message: '稳定性风险' },
          { type: 'extra', message: '多余风险' }
        ]
      })
    });
    brain.metaCognition.analyzeHistory = () => ({ message: '有复盘历史', uncertainRate: 0.8 });
    const engine = new IntrospectionEngine(brain);
    const limitations = engine._identifyLimitations();
    const areas = limitations.map((l) => l.area);
    expect(areas).toContain('security');
    expect(areas).toContain('stability');
    expect(areas).toContain('决策确定性');
    expect(areas).not.toContain('extra');
  });

  test('_calculateGrowthTrend returns unknown when no lessons', () => {
    const brain = makeBrain({
      lessonLibrary: makeLessonLibrary({ lessons: [] })
    });
    const engine = new IntrospectionEngine(brain);
    expect(engine._calculateGrowthTrend()).toBe('unknown');
  });

  test('_calculateGrowthTrend returns accelerating for recent burst', () => {
    const today = new Date();
    const lessons = [0, 1, 2].map(() => ({ date: today.toISOString() }));
    const brain = makeBrain({ lessonLibrary: makeLessonLibrary({ lessons }) });
    const engine = new IntrospectionEngine(brain);
    expect(engine._calculateGrowthTrend()).toBe('accelerating');
  });

  test('_calculateGrowthTrend returns growing for recent single lesson', () => {
    const daysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    const brain = makeBrain({
      lessonLibrary: makeLessonLibrary({ lessons: [{ date: daysAgo }] })
    });
    const engine = new IntrospectionEngine(brain);
    expect(engine._calculateGrowthTrend()).toBe('growing');
  });

  test('_calculateGrowthTrend returns stable within 30 days', () => {
    const daysAgo = new Date(Date.now() - 15 * 86400000).toISOString();
    const brain = makeBrain({
      lessonLibrary: makeLessonLibrary({ lessons: [{ date: daysAgo }] })
    });
    const engine = new IntrospectionEngine(brain);
    expect(engine._calculateGrowthTrend()).toBe('stable');
  });

  test('_calculateGrowthTrend returns slowing beyond 30 days', () => {
    const daysAgo = new Date(Date.now() - 40 * 86400000).toISOString();
    const brain = makeBrain({
      lessonLibrary: makeLessonLibrary({ lessons: [{ date: daysAgo }] })
    });
    const engine = new IntrospectionEngine(brain);
    expect(engine._calculateGrowthTrend()).toBe('slowing');
  });
});
