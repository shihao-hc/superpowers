describe('DecisionContext', () => {
  let DecisionContext;

  beforeAll(() => {
    DecisionContext = require('../../src/core/DecisionContext');
  });

  describe('constructor', () => {
    it('creates instance', () => {
      const dc = new DecisionContext();
      expect(dc._audit).toBeNull();
      expect(dc._tracker).toBeNull();
    });
  });

  describe('_calcRiskLevel', () => {
    it('returns low for no task type', () => {
      const dc = new DecisionContext();
      expect(dc._calcRiskLevel(null, [])).toBe('low');
    });

    it('returns high for security task type', () => {
      const dc = new DecisionContext();
      expect(dc._calcRiskLevel('security', [])).toBe('high');
    });

    it('returns high for fix task type', () => {
      const dc = new DecisionContext();
      expect(dc._calcRiskLevel('fix', [])).toBe('high');
    });

    it('returns high with 3+ high priority lessons', () => {
      const dc = new DecisionContext();
      const lessons = [{ priority: 'high' }, { priority: 'high' }, { priority: 'high' }];
      expect(dc._calcRiskLevel('code', lessons)).toBe('high');
    });

    it('returns medium with 1-2 high priority lessons', () => {
      const dc = new DecisionContext();
      const lessons = [{ priority: 'high' }];
      expect(dc._calcRiskLevel('code', lessons)).toBe('medium');
    });

    it('returns medium for deploy and review', () => {
      const dc = new DecisionContext();
      expect(dc._calcRiskLevel('deploy', [])).toBe('medium');
      expect(dc._calcRiskLevel('review', [])).toBe('medium');
    });

    it('returns low for other task types', () => {
      const dc = new DecisionContext();
      expect(dc._calcRiskLevel('code', [])).toBe('low');
    });
  });

  describe('_buildRecommendations', () => {
    it('returns empty recs for no task type', () => {
      const dc = new DecisionContext();
      expect(dc._buildRecommendations(null, [])).toEqual([]);
    });

    it('returns type-specific recommendations', () => {
      const dc = new DecisionContext();
      const recs = dc._buildRecommendations('security', []);
      expect(recs.length).toBeGreaterThan(0);
      expect(recs.some(r => r.includes('高危'))).toBe(true);
    });

    it('caps at 5 recommendations', () => {
      const dc = new DecisionContext();
      const lessons = [
        { priority: 'high', useCount: 0, title: 'a' },
        { priority: 'high', useCount: 0, title: 'b' },
        { priority: 'high', useCount: 0, title: 'c' }
      ];
      const recs = dc._buildRecommendations('code', lessons);
      expect(recs.length).toBeLessThanOrEqual(5);
    });

    it('includes unapplied high priority lessons', () => {
      const dc = new DecisionContext();
      const lessons = [{ priority: 'high', useCount: 0, title: 'never used' }];
      const recs = dc._buildRecommendations('code', lessons);
      expect(recs.some(r => r.includes('never used'))).toBe(true);
    });
  });

  describe('_calcOverrides', () => {
    it('returns empty overrides by default', () => {
      const dc = new DecisionContext();
      expect(dc._calcOverrides([])).toEqual({});
    });

    it('overrides high priority security lessons', () => {
      const dc = new DecisionContext();
      const lessons = [{ id: 'l1', priority: 'high', category: 'security' }];
      expect(dc._calcOverrides(lessons)).toEqual({ l1: 'high' });
    });

    it('promotes low priority lessons with high apply count', () => {
      const dc = new DecisionContext();
      const lessons = [{ id: 'l2', priority: 'low', applyCount: 10 }];
      expect(dc._calcOverrides(lessons)).toEqual({ l2: 'medium' });
    });
  });

  describe('_calcRestrictions', () => {
    it('returns empty for low risk', () => {
      const dc = new DecisionContext();
      expect(dc._calcRestrictions('code', 'low')).toEqual([]);
    });

    it('blocks delete for high risk', () => {
      const dc = new DecisionContext();
      const restrictions = dc._calcRestrictions('code', 'high');
      expect(restrictions.some(r => r.op === 'delete' && r.action === 'BLOCK')).toBe(true);
    });

    it('warns delete for medium risk', () => {
      const dc = new DecisionContext();
      const restrictions = dc._calcRestrictions('code', 'medium');
      expect(restrictions.some(r => r.op === 'delete' && r.action === 'WARN')).toBe(true);
    });
  });

  describe('_buildSessionContext', () => {
    it('returns defaults without history', () => {
      const dc = new DecisionContext();
      const ctx = dc._buildSessionContext(null);
      expect(ctx.interactionCount).toBe(0);
      expect(ctx.topIntent).toBeNull();
      expect(ctx.recentDecisions).toEqual([]);
    });

    it('uses history values', () => {
      const dc = new DecisionContext();
      const history = { interactionCount: 5, topIntent: 'fix', recentDecisions: ['d1', 'd2'] };
      const ctx = dc._buildSessionContext(history);
      expect(ctx.interactionCount).toBe(5);
      expect(ctx.topIntent).toBe('fix');
      expect(ctx.recentDecisions).toHaveLength(2);
    });
  });

  describe('generate', () => {
    it('returns full decision context', () => {
      const dc = new DecisionContext();
      const ctx = dc.generate('fix problem', 'fix', [{ priority: 'high' }], { interactionCount: 1 });
      expect(ctx.riskLevel).toBe('high');
      expect(Array.isArray(ctx.recommendations)).toBe(true);
      expect(Array.isArray(ctx.toolRestrictions)).toBe(true);
      expect(ctx.sessionContext.interactionCount).toBe(1);
      expect(ctx.generatedAt).toBeDefined();
    });

    it('logs audit event when audit logger is provided', () => {
      const audit = { log: jest.fn() };
      const dc = new DecisionContext({ audit });
      const _ctx = dc.generate('test', 'code', [], { interactionCount: 0 });
      expect(audit.log).toHaveBeenCalledWith({
        level: 'info',
        module: 'decision',
        action: 'context_generated',
        riskLevel: 'low',
        recCount: 2
      });
    });
  });

  describe('_calcRiskLevel edge cases', () => {
    it('handles undefined lessons safely', () => {
      const dc = new DecisionContext();
      expect(dc._calcRiskLevel('code', undefined)).toBe('low');
    });
  });

  describe('_buildRecommendations edge cases', () => {
    it('returns empty for unknown task type', () => {
      const dc = new DecisionContext();
      expect(dc._buildRecommendations('unknown', [])).toEqual([]);
    });

    it('handles undefined lessons gracefully', () => {
      const dc = new DecisionContext();
      const recs = dc._buildRecommendations('code', undefined);
      expect(recs).toHaveLength(2);
    });

    it('covers useCount truthy but < 1 path in filter', () => {
      const dc = new DecisionContext();
      const lessons = [{ priority: 'high', useCount: 0.5, title: 'partial use' }];
      const recs = dc._buildRecommendations('code', lessons);
      expect(recs.some(r => r.includes('partial use'))).toBe(true);
    });
  });

  describe('_calcOverrides edge cases', () => {
    it('returns empty overrides for undefined lessons', () => {
      const dc = new DecisionContext();
      expect(dc._calcOverrides(undefined)).toEqual({});
    });
  });
});
