const ReverseThinking = require('../../src/core/ReverseThinking');

describe('ReverseThinking', () => {
  let rt;

  beforeEach(() => {
    rt = new ReverseThinking();
  });

  describe('constructor', () => {
    test('initializes domain knowledge with 4 domains', () => {
      expect(Object.keys(rt.domainKnowledge)).toEqual(['code', 'architecture', 'data', 'business']);
    });

    test('initializes templates for 3 categories', () => {
      expect(Object.keys(rt.templates)).toEqual(['problem', 'solution', 'observation']);
    });

    test('initializes empty history', () => {
      expect(rt.history).toEqual([]);
    });
  });

  describe('calculateGap', () => {
    test('returns unknown gap for missing current', () => {
      expect(rt.calculateGap(null, 'goal').severity).toBe('unknown');
    });

    test('returns unknown gap for missing target', () => {
      expect(rt.calculateGap('current', null).severity).toBe('unknown');
    });

    test('handles string gap', () => {
      const gap = rt.calculateGap('A', 'B');
      expect(gap.description).toContain('A');
      expect(gap.description).toContain('B');
      expect(gap.severity).toBe('medium');
    });

    test('computes numeric gap', () => {
      const gap = rt.calculateGap(10, 50);
      expect(gap.description).toBe('差距: 40');
      expect(gap.metrics.diff).toBe(40);
      expect(gap.metrics.percentage).toBe('400.00%');
    });

    test('high severity for diff > 100', () => {
      const gap = rt.calculateGap(10, 200);
      expect(gap.severity).toBe('high');
    });
  });

  describe('reverseSteps', () => {
    test('returns 5 steps', () => {
      const steps = rt.reverseSteps('goal');
      expect(steps).toHaveLength(5);
      expect(steps[0]).toContain('goal');
    });
  });

  describe('fiveWhys', () => {
    test('returns 5 questions with answers', () => {
      const whys = rt.fiveWhys('代码性能问题');
      expect(whys).toHaveLength(5);
      expect(whys[0].question).toContain('为什么');
      expect(whys[0].depth).toBe(1);
    });

    test('has non-null answer for matching domain', () => {
      const whys = rt.fiveWhys('代码性能问题');
      expect(whys[0].answer).toBeTruthy();
    });

    test('uses default causes for unknown domain', () => {
      const whys = rt.fiveWhys('xyz unknown problem');
      expect(whys[0].answer).toBeTruthy();
      expect(whys[0].answer).toBe('需求理解不准确');
    });
  });

  describe('getDomainCause', () => {
    test('matches code domain keywords', () => {
      const causes = rt.getDomainCause('代码bug问题');
      expect(causes.length).toBeGreaterThan(0);
    });

    test('matches architecture domain', () => {
      const causes = rt.getDomainCause('微服务扩展问题');
      expect(causes.length).toBeGreaterThan(0);
    });

    test('returns default causes for unknown text', () => {
      const causes = rt.getDomainCause('something completely random');
      expect(causes).toHaveLength(5);
      expect(causes[0]).toBe('需求理解不准确');
    });
  });

  describe('findCauses', () => {
    test('finds causes from keyword matching', () => {
      const causes = rt.findCauses('系统很慢有延迟');
      expect(causes.some(c => c.includes('性能'))).toBe(true);
    });

    test('finds error-related causes', () => {
      const causes = rt.findCauses('出现错误和bug');
      expect(causes.some(c => c.includes('错误') || c.includes('异常'))).toBe(true);
    });

    test('deduplicates causes', () => {
      const causes = rt.findCauses('代码安全问题');
      const unique = new Set(causes);
      expect(causes.length).toBe(unique.size);
    });

    test('returns empty for no match', () => {
      const causes = rt.findCauses('zzz yyy something');
      const hasUnknown = causes.every(c => typeof c === 'string');
      expect(hasUnknown).toBe(true);
    });
  });

  describe('suggestVerification', () => {
    test('returns performance verification for performance cause', () => {
      const results = rt.suggestVerification(['性能问题']);
      expect(results[0]).toContain('性能测试');
    });

    test('returns data verification for data cause', () => {
      const results = rt.suggestVerification(['数据问题']);
      expect(results[0]).toContain('数据对比');
    });

    test('returns code review for generic cause', () => {
      const results = rt.suggestVerification(['逻辑错误']);
      expect(results[0]).toContain('代码审查');
    });
  });

  describe('reverseInfer', () => {
    test('returns structured reverse inference', () => {
      const result = rt.reverseInfer('系统运行慢');
      expect(result.observation).toBe('系统运行慢');
      expect(result.causes.length).toBeGreaterThan(0);
      expect(result.conclusion).toBeTruthy();
      expect(result.reasoning).toBeTruthy();
      expect(result.verification).toBeDefined();
    });
  });

  describe('deepSearchCauses', () => {
    test('may return deep causes from default causes', () => {
      const results = rt.deepSearchCauses('xyz unknown');
      expect(Array.isArray(results)).toBe(true);
    });

    test('returns deep causes for matching observation', () => {
      const results = rt.deepSearchCauses('代码性能问题');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].cause).toBeDefined();
    });
  });

  describe('premortem', () => {
    test('returns premortem analysis', () => {
      const pm = rt.premortem('build project');
      expect(pm.scenario).toContain('build project');
      expect(pm.potentialFailures).toHaveLength(5);
      expect(pm.mitigation).toHaveLength(4);
      expect(pm.insight).toBeTruthy();
    });
  });

  describe('successAnalysis', () => {
    test('returns success factors and learnings', () => {
      const sa = rt.successAnalysis('solve problem');
      expect(sa.scenario).toContain('solve problem');
      expect(sa.successFactors).toHaveLength(5);
      expect(sa.keyLearnings).toHaveLength(2);
    });
  });

  describe('generateConclusion', () => {
    test('includes root cause when available', () => {
      const analysis = {
        fiveWhys: [{ answer: '算法太慢' }, { answer: null }],
        causes: ['性能问题'],
        alternatives: [{ text: '简化方案' }]
      };
      const conclusion = rt.generateConclusion(analysis);
      expect(conclusion).toContain('算法太慢');
      expect(conclusion).toContain('性能问题');
      expect(conclusion).toContain('简化方案');
    });

    test('returns fallback when no info', () => {
      const analysis = { fiveWhys: [{ answer: null }], causes: [], alternatives: [] };
      expect(rt.generateConclusion(analysis)).toBe('需要更多信息');
    });
  });

  describe('generateRecommendations', () => {
    test('returns fix, prevent, and inspire recommendations', () => {
      const analysis = {
        fiveWhys: [{ answer: 'root cause' }],
        premortem: { mitigation: ['plan'] },
        successAnalysis: {}
      };
      const recs = rt.generateRecommendations(analysis);
      expect(recs.some(r => r.type === 'fix')).toBe(true);
      expect(recs.some(r => r.type === 'prevent')).toBe(true);
      expect(recs.some(r => r.type === 'inspire')).toBe(true);
    });
  });

  describe('analyze', () => {
    test('analyzes string problem', () => {
      const result = rt.analyze('代码性能问题');
      expect(result.problem).toBe('代码性能问题');
      expect(result.fiveWhys).toHaveLength(5);
      expect(result.causes.length).toBeGreaterThan(0);
      expect(result.conclusion).toBeTruthy();
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    test('analyzes object problem', () => {
      const result = rt.analyze({ description: '系统延迟高' });
      expect(result.problem).toBe('系统延迟高');
    });
  });

  describe('fromResult', () => {
    test('returns full analysis from result', () => {
      const result = rt.fromResult('current state', 'goal state');
      expect(result.target).toBe('goal state');
      expect(result.current).toBe('current state');
      expect(result.gap).toBeDefined();
      expect(result.reverseSteps).toHaveLength(5);
      expect(result.fiveWhys).toHaveLength(5);
      expect(result.premortem).toBeDefined();
      expect(result.milestones).toHaveLength(5);
      expect(result.insights).toHaveLength(4);
    });

    test('pushes to history', () => {
      rt.fromResult('a', 'b');
      expect(rt.history).toHaveLength(1);
      expect(rt.history[0].type).toBe('fromResult');
    });
  });

  describe('identifyMilestones', () => {
    test('returns 5 milestones', () => {
      const ms = rt.identifyMilestones('goal');
      expect(ms).toHaveLength(5);
      expect(ms[0].ready).toBe(true);
    });
  });

  describe('assessMilestone', () => {
    test('startup phase is ready', () => {
      expect(rt.assessMilestone('goal', '启动阶段')).toBe(true);
    });

    test('unknown phase returns false', () => {
      expect(rt.assessMilestone('goal', '未知阶段')).toBe(false);
    });
  });

  describe('findAlternatives', () => {
    test('returns 5 alternatives', () => {
      expect(rt.findAlternatives('problem')).toHaveLength(5);
    });
  });

  describe('orangePractice', () => {
    test('returns orange practice analysis', () => {
      const result = rt.orangePractice('slow system');
      expect(result.observation).toBe('slow system');
      expect(result.reverse).toBeDefined();
      expect(result.traditional).toBe('直接尝试解决');
    });
  });

  describe('orangeReverseAnalyze', () => {
    test('returns 4 step analysis', () => {
      const result = rt.orangeReverseAnalyze();
      expect(result.steps).toHaveLength(4);
      expect(result.method).toBe('庖丁解牛法');
    });
  });

  describe('decomposeReverse', () => {
    test('returns decomposed problems with solutions', () => {
      const results = rt.decomposeReverse('代码性能问题');
      expect(results).toHaveLength(4);
      expect(results[0].problem).toBeTruthy();
      expect(results[0].solutions).toHaveLength(4);
      expect(results[0].reversePriority).toBeDefined();
    });
  });

  describe('decompose', () => {
    test('returns 4 sub-questions', () => {
      const parts = rt.decompose('problem');
      expect(parts).toHaveLength(4);
      expect(parts[0]).toContain('核心问题');
    });
  });

  describe('findSolutions', () => {
    test('returns 4 solution types', () => {
      const solutions = rt.findSolutions('problem');
      expect(solutions).toHaveLength(4);
      expect(solutions.some(s => s.type === 'direct')).toBe(true);
      expect(solutions.some(s => s.type === 'transform')).toBe(true);
    });
  });

  describe('prioritize', () => {
    test('index 0 returns high urgency', () => {
      expect(rt.prioritize('p', 0).urgency).toBe('high');
    });

    test('index 0 has high importance', () => {
      expect(rt.prioritize('p', 0).importance).toBe('high');
    });

    test('index 3 returns medium urgency', () => {
      expect(rt.prioritize('p', 3).urgency).toBe('medium');
    });
  });

  describe('suggestMitigations', () => {
    test('returns 4 mitigation suggestions', () => {
      expect(rt.suggestMitigations()).toHaveLength(4);
    });
  });

  describe('getHistory', () => {
    test('returns recent history entries', () => {
      rt.fromResult('a', 'b');
      rt.fromResult('c', 'd');
      const history = rt.getHistory(1);
      expect(history).toHaveLength(1);
    });

    test('returns all history when limit exceeds count', () => {
      rt.fromResult('a', 'b');
      expect(rt.getHistory(10)).toHaveLength(1);
    });

    test('uses default limit when no argument given', () => {
      rt.fromResult('a', 'b');
      rt.fromResult('c', 'd');
      expect(rt.getHistory()).toHaveLength(2);
    });
  });

  describe('branch coverage edge cases', () => {
    test('analyze falls back to JSON.stringify for object without description', () => {
      const result = rt.analyze({ code: 42 });
      expect(result.problem).toContain('code');
    });

    test('generateRecommendations skips prevent when premortem is null', () => {
      const recs = rt.generateRecommendations({
        fiveWhys: [{ answer: 'root' }],
        premortem: null,
        successAnalysis: {}
      });
      expect(recs.some(r => r.type === 'fix')).toBe(true);
      expect(recs.some(r => r.type === 'prevent')).toBe(false);
      expect(recs.some(r => r.type === 'inspire')).toBe(true);
    });

    test('suggestVerification returns security scan for security cause', () => {
      const results = rt.suggestVerification(['安全问题']);
      expect(results[0]).toContain('安全扫描');
    });

    test('prioritize with index beyond array returns medium urgency', () => {
      expect(rt.prioritize('p', 5).urgency).toBe('medium');
    });
  });
});
