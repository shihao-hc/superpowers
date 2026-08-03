describe('StatusReporter', () => {
  let StatusReporter;
  let reporter;
  let bs;

  beforeAll(() => {
    StatusReporter = require('../../src/utils/StatusReporter');
  });

  beforeEach(() => {
    bs = {
      enabled: true,
      config: { enableMetaCognition: true, enableReverseThinking: true, enableAutoEvolution: true },
      state: { decisionCount: 10 },
      lessonLibrary: {
        getStats: jest.fn().mockReturnValue({ applied: 3, total: 10, unapplied: 7 })
      },
      evolution: {
        getStats: jest.fn().mockReturnValue({ generations: 5, learnings: 12 })
      },
      tools: {
        getStats: jest.fn().mockReturnValue({ total: 8, active: 5 })
      },
      _calculateHealth: jest.fn().mockReturnValue({
        score: 65, level: 'good', metrics: { evolution: { recentLearnings: 3 } }, improvements: ['impr1']
      }),
      metaCognition: {
        analyzeHistory: jest.fn().mockReturnValue({ uncertainRate: 0.3 })
      }
    };
    reporter = new StatusReporter(bs);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getStatus', () => {
    it('returns full status object', () => {
      const status = reporter.getStatus();
      expect(status).toHaveProperty('enabled', true);
      expect(status).toHaveProperty('decisionCount', 10);
      expect(status).toHaveProperty('capabilities');
      expect(status).toHaveProperty('evolution');
      expect(status).toHaveProperty('tools');
      expect(status).toHaveProperty('lessons');
      expect(status).toHaveProperty('health');
    });
  });

  describe('getImprovements', () => {
    it('returns improvements with health and suggestions', () => {
      const result = reporter.getImprovements();
      expect(result).toHaveProperty('health');
      expect(result).toHaveProperty('suggestions');
      expect(result).toHaveProperty('priority', 'low');
    });

    it('adds lesson suggestion when unapplied > 70%', () => {
      bs.lessonLibrary.getStats.mockReturnValue({ applied: 2, total: 10, unapplied: 8 });
      const result = reporter.getImprovements();
      expect(result.suggestions.some(s => s.includes('教训积累过多'))).toBe(true);
    });

    it('adds meta suggestion when uncertainRate > 0.5', () => {
      bs.metaCognition.analyzeHistory.mockReturnValue({ uncertainRate: 0.8 });
      const result = reporter.getImprovements();
      expect(result.suggestions.some(s => s.includes('不确定性较高'))).toBe(true);
    });

    it('adds evolution suggestion when decisionCount > 50 and recentLearnings < 5', () => {
      bs.state.decisionCount = 60;
      const result = reporter.getImprovements();
      expect(result.suggestions.some(s => s.includes('决策频繁'))).toBe(true);
    });

    it('returns high priority when health level is critical', () => {
      bs._calculateHealth.mockReturnValue({ score: 20, level: 'critical', metrics: {}, improvements: ['fix'] });
      expect(reporter.getImprovements().priority).toBe('high');
    });

    it('returns medium priority when needs-improvement', () => {
      bs._calculateHealth.mockReturnValue({ score: 35, level: 'needs-improvement', metrics: {}, improvements: ['fix'] });
      expect(reporter.getImprovements().priority).toBe('medium');
    });
  });
});
