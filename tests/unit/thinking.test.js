const Thinking = require('../../src/core/Thinking');

describe('Thinking', () => {
  let thinking;

  beforeEach(() => {
    thinking = new Thinking();
  });

  describe('constructor', () => {
    it('has 5 thinking angles', () => {
      expect(Object.keys(thinking.angles)).toEqual([
        'technical', 'business', 'user', 'risk', 'alternative'
      ]);
    });
  });

  describe('multiAngle', () => {
    it('analyzes from all angles', () => {
      const results = thinking.multiAngle('如何优化性能');
      expect(Object.keys(results)).toHaveLength(5);
      expect(results.technical.angle).toBe('技术角度');
    });

    it('handles object input', () => {
      const results = thinking.multiAngle({ description: '测试问题' });
      expect(results.technical).toBeDefined();
    });

    it('handles object input without description', () => {
      const results = thinking.multiAngle({ custom: 'data' });
      expect(results.technical).toBeDefined();
    });
  });

  describe('analyzeFromAngle', () => {
    it('returns keyPoints for matching keywords', () => {
      const result = thinking.analyzeFromAngle('性能问题', 'technical', thinking.angles.technical);
      expect(result.keyPoints).toContain('性能');
      expect(result.conclusion).toContain('性能');
    });

    it('returns generic analysis when no keywords match', () => {
      const result = thinking.analyzeFromAngle('你好', 'technical', thinking.angles.technical);
      expect(result.keyPoints).toEqual([]);
      expect(result.conclusion).toContain('需要进一步考虑');
    });
  });

  describe('question', () => {
    it('generates challenges for an assumption', () => {
      const result = thinking.question('用户想要更多功能');
      expect(result.questions).toHaveLength(4);
      expect(result.alternatives).toHaveLength(3);
      expect(result.conclusions).toHaveLength(3);
      expect(result.original).toBe('用户想要更多功能');
    });

    it('records in history', () => {
      thinking.question('test');
      expect(thinking.history).toHaveLength(1);
      expect(thinking.history[0].type).toBe('question');
    });
  });

  describe('associate', () => {
    it('returns analogies', () => {
      const result = thinking.associate('分解');
      expect(result.concept).toBe('分解');
      expect(result.analogies.length).toBeGreaterThan(0);
    });

    it('filters lessons that match the concept', () => {
      const lessons = [
        { lesson: 'agile development', problem: 'sprint', improvement: 'better' },
        { lesson: 'unrelated', problem: 'other', improvement: 'none' }
      ];
      const result = thinking.associate('development', lessons);
      expect(result.patterns).toHaveLength(1);
    });

    it('records associations in map', () => {
      thinking.associate('test-concept');
      expect(thinking.associations.has('test-concept')).toBe(true);
    });

    it('appends to existing concept associations', () => {
      thinking.associate('same-concept');
      thinking.associate('same-concept');
      expect(thinking.associations.get('same-concept').length).toBeGreaterThan(0);
    });
  });

  describe('isRelated', () => {
    it('returns true for related words', () => {
      expect(thinking.isRelated('test code', 'code review')).toBe(true);
    });

    it('returns false for unrelated words', () => {
      expect(thinking.isRelated('cat', 'development')).toBe(false);
    });

    it('returns false for null inputs', () => {
      expect(thinking.isRelated(null, 'test')).toBe(false);
    });
  });

  describe('causalChain', () => {
    it('returns structured chain analysis', () => {
      const chain = thinking.causalChain('系统性能下降');
      expect(chain.problem).toBe('系统性能下降');
      expect(chain.causes).toHaveLength(3);
      expect(chain.effects).toHaveLength(2);
      expect(chain.leveragePoints).toHaveLength(2);
    });
  });

  describe('firstPrinciples', () => {
    it('returns structured analysis', () => {
      const result = thinking.firstPrinciples('如何改进流程');
      expect(result.assumptions).toHaveLength(3);
      expect(result.breakdown).toHaveLength(3);
      expect(result.reconstruction).toHaveLength(3);
    });
  });

  describe('getHistory', () => {
    it('returns limited history', () => {
      for (let i = 0; i < 30; i++) thinking.history.push({ i });
      expect(thinking.getHistory(5)).toHaveLength(5);
    });

    it('uses default limit of 20', () => {
      for (let i = 0; i < 30; i++) thinking.history.push({ i });
      expect(thinking.getHistory()).toHaveLength(20);
    });
  });

  describe('getAssociations', () => {
    it('returns stored associations', () => {
      thinking.associations.set('test', ['a']);
      expect(thinking.getAssociations('test')).toEqual(['a']);
    });

    it('returns empty array for missing concept', () => {
      expect(thinking.getAssociations('missing')).toEqual([]);
    });
  });
});
