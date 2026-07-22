const MetaCognition = require('../../src/core/MetaCognition');

describe('MetaCognition', () => {
  let meta;

  beforeEach(() => {
    meta = new MetaCognition();
  });

  describe('constructor', () => {
    it('has before and after questions', () => {
      expect(meta.beforeQuestions).toHaveLength(5);
      expect(meta.afterQuestions).toHaveLength(3);
    });
  });

  describe('beforeAsk', () => {
    it('returns questions with hints', () => {
      const result = meta.beforeAsk();
      expect(result.questions).toHaveLength(5);
      expect(result.questions[0].hint).toBeTruthy();
    });
  });

  describe('getQuestionHint', () => {
    it('returns hint for known question', () => {
      const hint = meta.getQuestionHint('我有盲区吗？');
      expect(hint).toMatch(/遗漏/);
    });

    it('returns empty string for unknown', () => {
      expect(meta.getQuestionHint('unknown question')).toBe('');
    });
  });

  describe('afterReview', () => {
    it('creates review with context and result', () => {
      const review = meta.afterReview('test context', { status: 'success' });
      expect(review.context).toBe('test context');
      expect(review.result.status).toBe('success');
    });

    it('adds review to history', () => {
      meta.afterReview('ctx', {});
      expect(meta.history).toHaveLength(1);
    });

    it('caps history at 100', () => {
      for (let i = 0; i < 120; i++) meta.afterReview(`ctx${i}`, {});
      expect(meta.history).toHaveLength(100);
    });
  });

  describe('check', () => {
    it('returns uncertain for high uncertain word count', () => {
      const result = meta.check('大概可能应该估计');
      expect(result.status).toBe('uncertain');
      expect(result.confidence).toBe(0.4);
    });

    it('returns confident for high certainty', () => {
      const result = meta.check('根据数据显示，确定肯定');
      expect(result.status).toBe('confident');
      expect(result.confidence).toBe(0.85);
    });

    it('returns partial for some uncertainty', () => {
      const result = meta.check('这个可能有问题');
      expect(result.status).toBe('partial');
      expect(result.confidence).toBe(0.6);
    });

    it('returns neutral for no markers', () => {
      const result = meta.check('这是一个普通句子');
      expect(result.status).toBe('neutral');
      expect(result.confidence).toBe(0.5);
    });

    it('returns hypothesis when certainty without evidence', () => {
      const result = meta.check('我确定这个是对的');
      expect(result.status).toBe('hypothesis');
    });

    it('returns unknown for empty text', () => {
      const result = meta.check('');
      expect(result.status).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });

  describe('detectHypothesis', () => {
    it('detects certainty without evidence', () => {
      expect(meta.detectHypothesis('我确定')).toBe(true);
    });

    it('returns false with evidence indicators', () => {
      expect(meta.detectHypothesis('根据数据，我确定')).toBe(false);
    });

    it('returns false without certainty', () => {
      expect(meta.detectHypothesis('大概是这样')).toBe(false);
    });
  });

  describe('deepAsk', () => {
    it('returns questions based on context', () => {
      const result = meta.deepAsk('这是什么？', 1);
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns empty for depth <= 0', () => {
      expect(meta.deepAsk('test', 0)).toEqual([]);
    });

    it('recursively generates questions for depth > 1', () => {
      const result = meta.deepAsk('hi', 2);
      expect(result.length).toBeGreaterThan(1);
    });
  });

  describe('getHistory', () => {
    it('returns last N entries', () => {
      for (let i = 0; i < 15; i++) meta.history.push({ i });
      expect(meta.getHistory(5)).toHaveLength(5);
    });

    it('uses default limit when not specified', () => {
      for (let i = 0; i < 5; i++) meta.history.push({ i });
      expect(meta.getHistory()).toHaveLength(5);
    });
  });

  describe('analyzeHistory', () => {
    it('returns message when no history', () => {
      expect(meta.analyzeHistory().message).toMatch(/暂无/);
    });

    it('analyzes uncertainty rate with history', () => {
      meta.history.push({ result: { status: 'uncertain' } });
      meta.history.push({ result: { status: 'confident' } });
      const analysis = meta.analyzeHistory();
      expect(analysis.totalReviews).toBe(2);
      expect(analysis.uncertainRate).toBe(0.5);
    });
  });

  describe('知道自己不知道什么', () => {
    it('detects knowledge gaps', () => {
      const result = meta['知道自己不知道什么']('最新的具体方案是什么？');
      expect(result.hasUnknowns).toBe(true);
      expect(result.unknowns.length).toBeGreaterThan(0);
    });

    it('returns no gaps for simple text', () => {
      const result = meta['知道自己不知道什么']('hello');
      expect(result.hasUnknowns).toBe(false);
    });

    it('recommends gathering info when many unknowns', () => {
      const result = meta['知道自己不知道什么']('最新的?具体方案');
      expect(result.unknowns.length).toBeGreaterThan(2);
      expect(result.recommendation).toMatch(/收集更多信息/);
    });
  });

  describe('deepAsk extra branches', () => {
    it('detects ASCII question mark', () => {
      const result = meta.deepAsk('Is this correct?', 1);
      expect(result.length).toBeGreaterThan(0);
    });

    it('skips both questions for long context without question', () => {
      const result = meta.deepAsk('A'.repeat(60), 1);
      expect(result).toEqual([]);
    });

    it('uses default depth when not specified', () => {
      const result = meta.deepAsk('?');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('check hypothesis override paths', () => {
    it('overrides confident to hypothesis when no evidence', () => {
      const result = meta.check('我确定肯定绝对');
      expect(result.status).toBe('hypothesis');
      expect(result.confidence).toBe(0.3);
    });

    it('overrides partial to hypothesis when certainty present', () => {
      const result = meta.check('可能我确定');
      expect(result.status).toBe('hypothesis');
    });

    it('overrides uncertain to hypothesis when certainty also present', () => {
      const result = meta.check('大概可能应该maybe我确定肯定');
      expect(result.status).toBe('hypothesis');
    });
  });

  describe('analyzeHistory high uncertainty', () => {
    it('detects high uncertainty pattern', () => {
      for (let i = 0; i < 6; i++) {
        meta.history.push({ result: { status: 'uncertain' } });
      }
      for (let i = 0; i < 4; i++) {
        meta.history.push({ result: { status: 'confident' } });
      }
      const analysis = meta.analyzeHistory();
      expect(analysis.pattern).toMatch(/不确定性较高/);
    });
  });
});
