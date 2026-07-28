/**
 * PatternLearner 单元测试
 * Tests for the standalone PatternLearner module extracted from BrainSystem.js
 */

const PatternLearner = require('../../src/core/PatternLearner');
const Persistence = require('../../src/core/Persistence');

// Mock Persistence to avoid file I/O
jest.mock('../../src/core/Persistence');

describe('PatternLearner', () => {
  let learner;

  beforeEach(() => {
    jest.clearAllMocks();
    Persistence.load.mockReturnValue({});
    Persistence.save.mockReturnValue(true);
    learner = new PatternLearner('testKey');
  });

  describe('constructor', () => {
    it('should use default key when none provided', () => {
      const defaultLearner = new PatternLearner();
      expect(defaultLearner._key).toBe('patternLearner');
    });

    it('should use custom key', () => {
      expect(learner._key).toBe('testKey');
    });

    it('should initialize empty state', () => {
      expect(learner._intentHistory).toEqual({});
      expect(learner._intentCount).toBe(0);
      expect(learner._avgInputLength).toBe(0);
      expect(learner._totalLength).toBe(0);
      expect(learner._samples).toBe(0);
    });

    it('should load saved state from Persistence', () => {
      Persistence.load.mockReturnValue({
        intentHistory: { code: 5 },
        intentCount: 1,
        totalLength: 100,
        samples: 10
      });
      const loaded = new PatternLearner('testKey');
      expect(loaded._intentHistory).toEqual({ code: 5 });
      expect(loaded._intentCount).toBe(1);
      expect(loaded._totalLength).toBe(100);
      expect(loaded._samples).toBe(10);
      expect(loaded._avgInputLength).toBe(10);
    });

    it('should handle Persistence.load error gracefully', () => {
      Persistence.load.mockImplementation(() => { throw new Error('disk error'); });
      const loaded = new PatternLearner('testKey');
      expect(loaded._samples).toBe(0);
    });
  });

  describe('learn', () => {
    it('should return early for empty input', () => {
      learner.learn(null);
      learner.learn('');
      expect(learner._samples).toBe(0);
      expect(Persistence.save).not.toHaveBeenCalled();
    });

    it('should track input length statistics', () => {
      learner.learn('写代码');
      expect(learner._totalLength).toBe(3);
      expect(learner._samples).toBe(1);
      expect(learner._avgInputLength).toBe(3);
    });

    it('should update average across multiple inputs', () => {
      learner.learn('写代码');  // 3 chars
      learner.learn('学习一下这个函数');  // 8 chars
      expect(learner._totalLength).toBe(11);
      expect(learner._samples).toBe(2);
      expect(learner._avgInputLength).toBe(5.5);
    });

    it('should detect code intent', () => {
      learner.learn('写一个函数');
      expect(learner._intentHistory).toEqual({ '代码': 1 });
    });

    it('should detect learning intent', () => {
      learner.learn('学习一下React');
      expect(learner._intentHistory).toEqual({ '学习': 1 });
    });

    it('should detect security intent', () => {
      learner.learn('安全审计');
      expect(learner._intentHistory).toEqual({ '安全': 1 });
    });

    it('should detect optimize intent', () => {
      learner.learn('性能优化');
      expect(learner._intentHistory).toEqual({ '优化': 1 });
    });

    it('should detect debug intent', () => {
      learner.learn('调试这个bug');
      expect(learner._intentHistory).toEqual({ '调试': 1 });
    });

    it('should detect test intent', () => {
      learner.learn('运行测试');
      expect(learner._intentHistory).toEqual({ '测试': 1 });
    });

    it('should return null intent for unrecognized input', () => {
      learner.learn('今天天气不错');
      expect(learner._intentHistory).toEqual({});
    });

    it('should accumulate counts for same intent', () => {
      learner.learn('写代码');
      learner.learn('写函数');
      learner.learn('写一个类');
      expect(learner._intentHistory).toEqual({ '代码': 3 });
    });

    it('should track multiple intents', () => {
      learner.learn('写代码');
      learner.learn('学习一下');
      learner.learn('安全审计');
      expect(learner._intentCount).toBe(3);
    });

    it('should save after learning', () => {
      learner.learn('写代码');
      expect(Persistence.save).toHaveBeenCalledWith('testKey', expect.objectContaining({
        intentHistory: { '代码': 1 }
      }));
    });

    it('should handle Persistence.save error gracefully', () => {
      Persistence.save.mockImplementation(() => { throw new Error('disk full'); });
      expect(() => learner.learn('写代码')).not.toThrow();
    });

    it('should handle case-insensitive detection', () => {
      learner.learn('帮我DEBUG一下');
      expect(learner._intentHistory).toEqual({ '调试': 1 });
    });
  });

  describe('getTopIntent', () => {
    it('should return null when no history', () => {
      expect(learner.getTopIntent()).toBeNull();
    });

    it('should return most frequent intent', () => {
      learner.learn('写代码');
      learner.learn('写代码');
      learner.learn('学习一下');
      expect(learner.getTopIntent()).toBe('代码');
    });

    it('should handle tie by returning first sorted', () => {
      learner.learn('写代码');
      learner.learn('学习一下');
      const top = learner.getTopIntent();
      expect(['代码', '学习']).toContain(top);
    });
  });

  describe('predict', () => {
    it('should return empty prediction when no history', () => {
      const result = learner.predict();
      expect(result.topIntent).toBeNull();
      expect(result.nextPossible).toEqual([]);
      expect(result.avgInputLength).toBe(0);
    });

    it('should predict when top intent count > 2', () => {
      learner.learn('写代码');
      learner.learn('写代码');
      learner.learn('写代码');
      const result = learner.predict();
      expect(result.topIntent).toBe('代码');
      expect(result.nextPossible).toHaveLength(1);
      expect(result.nextPossible[0].intent).toBe('代码');
      expect(result.nextPossible[0].confidence).toBeGreaterThan(0);
    });

    it('should not predict when count <= 2', () => {
      learner.learn('写代码');
      learner.learn('写代码');
      const result = learner.predict();
      expect(result.nextPossible).toHaveLength(0);
    });

    it('should cap confidence at 0.9', () => {
      for (let i = 0; i < 20; i++) {learner.learn('写代码');}
      const result = learner.predict();
      expect(result.nextPossible[0].confidence).toBeLessThanOrEqual(0.9);
    });

    it('should include avgInputLength', () => {
      learner.learn('写代码');
      const result = learner.predict();
      expect(result.avgInputLength).toBe(3);
    });
  });

  describe('_detectIntent edge cases', () => {
    it('should match "debug" keyword', () => {
      learner.learn('帮我debug一下');
      expect(learner._intentHistory).toEqual({ '调试': 1 });
    });

    it('should match "test" keyword', () => {
      learner.learn('run the test');
      expect(learner._intentHistory).toEqual({ '测试': 1 });
    });

    it('should match "类" keyword', () => {
      learner.learn('创建一个新的类');
      expect(learner._intentHistory).toEqual({ '代码': 1 });
    });
  });
});
