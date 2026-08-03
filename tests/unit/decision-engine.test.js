describe('DecisionEngine', () => {
  let DecisionEngine;
  let engine;
  let bs;

  beforeAll(() => {
    DecisionEngine = require('../../src/utils/DecisionEngine');
  });

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    bs = {
      enabled: true,
      config: { enableMetaCognition: true, enableAutoEvolution: true },
      state: { decisionCount: 0, lastContext: null, lastResult: null, activeThinking: false },
      metaCognition: {
        beforeAsk: jest.fn().mockReturnValue({ questions: ['question1'] }),
        check: jest.fn().mockReturnValue({ status: 'ok' }),
        afterReview: jest.fn().mockReturnValue({ reflection: 'done' })
      },
      lessonLibrary: {
        getSuggestions: jest.fn().mockReturnValue([]),
        getRelated: jest.fn().mockReturnValue([])
      },
      evolution: { learn: jest.fn() },
      _autoSelfReview: jest.fn().mockReturnValue({ checks: [] }),
      _trackLessonUsage: jest.fn().mockReturnValue({ lessonsUsed: [] }),
      _autoComprehensiveCheck: jest.fn().mockReturnValue({ triggered: false }),
      selfLearning: null
    };
    engine = new DecisionEngine(bs);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('beforeDecision', () => {
    it('returns disabled status when bs is disabled', () => {
      bs.enabled = false;
      const result = engine.beforeDecision('test context');
      expect(result).toEqual({ questions: [], selfCheck: { status: 'disabled' } });
    });

    it('returns disabled when enableMetaCognition is false', () => {
      bs.config.enableMetaCognition = false;
      const result = engine.beforeDecision('test context');
      expect(result).toEqual({ questions: [], selfCheck: { status: 'disabled' } });
    });

    it('increments decisionCount and updates state', () => {
      engine.beforeDecision('test');
      expect(bs.state.decisionCount).toBe(1);
      expect(bs.state.lastContext).toBe('test');
      expect(bs.state.activeThinking).toBe(true);
    });

    it('calls metaCognition.beforeAsk and metaCognition.check', () => {
      engine.beforeDecision('test');
      expect(bs.metaCognition.beforeAsk).toHaveBeenCalledWith('test');
      expect(bs.metaCognition.check).toHaveBeenCalledWith('test');
    });

    it('queries lessonLibrary for suggestions and related', () => {
      engine.beforeDecision('test');
      expect(bs.lessonLibrary.getSuggestions).toHaveBeenCalledWith('test');
      expect(bs.lessonLibrary.getRelated).toHaveBeenCalledWith('test', 3);
    });

    it('returns enhanced questions and selfCheck', () => {
      const result = engine.beforeDecision('test');
      expect(result).toHaveProperty('questions');
      expect(result).toHaveProperty('selfCheck');
      expect(result).toHaveProperty('context', 'test');
      expect(result).toHaveProperty('lessonWarnings');
      expect(result).toHaveProperty('relatedLessons');
      expect(result).toHaveProperty('timestamp');
    });

    it('calls selfLearning.recordIntent when available', () => {
      bs.selfLearning = { recordIntent: jest.fn() };
      engine.beforeDecision('test');
      expect(bs.selfLearning.recordIntent).toHaveBeenCalledWith('test', 'brain-decision', true);
    });

    it('handles selfLearning.recordIntent error gracefully', () => {
      bs.selfLearning = { recordIntent: jest.fn().mockImplementation(() => { throw new Error('intent-fail'); }) };
      expect(() => engine.beforeDecision('test')).not.toThrow();
    });

    it('includes lesson warnings for high-priority unapplied suggestions', () => {
      bs.lessonLibrary.getSuggestions.mockReturnValue([
        { priority: 'high', lessonId: 'l1', lesson: 'test lesson', improvement: 'do better' }
      ]);
      bs.lessonLibrary.get = jest.fn().mockReturnValue({ id: 'l1', lastApplied: null });
      const result = engine.beforeDecision('test');
      expect(result.lessonWarnings).toHaveLength(1);
      expect(result.lessonWarnings[0].type).toBe('lesson-warning');
    });

    it('does NOT include warning if lesson was recently applied (< 24h)', () => {
      bs.lessonLibrary.getSuggestions.mockReturnValue([
        { priority: 'high', lessonId: 'l1', lesson: 'test', improvement: 'do better' }
      ]);
      bs.lessonLibrary.get = jest.fn().mockReturnValue({
        id: 'l1', lastApplied: new Date(Date.now() - 1000).toISOString()
      });
      const result = engine.beforeDecision('test');
      expect(result.lessonWarnings).toHaveLength(0);
    });
  });

  describe('_isRecentApplied', () => {
    it('returns false when lesson not found', () => {
      bs.lessonLibrary.get = jest.fn().mockReturnValue(null);
      expect(engine._isRecentApplied('l1')).toBe(false);
    });

    it('returns false when lesson has no lastApplied', () => {
      bs.lessonLibrary.get = jest.fn().mockReturnValue({ id: 'l1' });
      expect(engine._isRecentApplied('l1')).toBe(false);
    });

    it('returns false when applied more than 24h ago', () => {
      bs.lessonLibrary.get = jest.fn().mockReturnValue({
        id: 'l1', lastApplied: new Date(Date.now() - 25 * 3600 * 1000).toISOString()
      });
      expect(engine._isRecentApplied('l1')).toBe(false);
    });
  });

  describe('afterDecision', () => {
    it('returns undefined when bs is disabled', () => {
      bs.enabled = false;
      expect(engine.afterDecision('ctx', { success: true })).toBeUndefined();
    });

    it('updates state with lastResult and disables activeThinking', () => {
      engine.afterDecision('ctx', { success: true });
      expect(bs.state.lastResult).toEqual({ success: true });
      expect(bs.state.activeThinking).toBe(false);
    });

    it('calls metaCognition.afterReview', () => {
      engine.afterDecision('ctx', { success: true });
      expect(bs.metaCognition.afterReview).toHaveBeenCalledWith('ctx', { success: true });
    });

    it('calls evolution.learn when enableAutoEvolution is true', () => {
      engine.afterDecision('ctx', { success: true }, 'fix');
      expect(bs.evolution.learn).toHaveBeenCalledWith('ctx', 'fix', { success: true });
    });

    it('skips evolution.learn when enableAutoEvolution is false', () => {
      bs.config.enableAutoEvolution = false;
      engine.afterDecision('ctx', { success: true }, 'fix');
      expect(bs.evolution.learn).not.toHaveBeenCalled();
    });

    it('calls _autoSelfReview, _trackLessonUsage, _autoComprehensiveCheck', () => {
      engine.afterDecision('ctx', { success: true }, 'fix');
      expect(bs._autoSelfReview).toHaveBeenCalledWith('ctx', { success: true }, 'fix');
      expect(bs._trackLessonUsage).toHaveBeenCalledWith('ctx', { success: true }, 'fix');
      expect(bs._autoComprehensiveCheck).toHaveBeenCalledWith('ctx', { success: true }, 'fix');
    });

    it('calls selfLearning.recordResponse when available', () => {
      bs.selfLearning = { recordResponse: jest.fn() };
      engine.afterDecision('ctx', { success: true }, 'fix');
      expect(bs.selfLearning.recordResponse).toHaveBeenCalledWith('ctx', { success: true }, 0.8);
    });

    it('passes 0.4 confidence when result.success is false', () => {
      bs.selfLearning = { recordResponse: jest.fn() };
      engine.afterDecision('ctx', { success: false }, 'fix');
      expect(bs.selfLearning.recordResponse).toHaveBeenCalledWith('ctx', { success: false }, 0.4);
    });

    it('handles selfLearning.recordResponse error gracefully', () => {
      bs.selfLearning = { recordResponse: jest.fn().mockImplementation(() => { throw new Error('resp-fail'); }) };
      expect(() => engine.afterDecision('ctx', { success: true })).not.toThrow();
    });

    it('returns reflection with all fields', () => {
      const result = engine.afterDecision('ctx', { success: true }, 'fix');
      expect(result).toHaveProperty('reflection');
      expect(result).toHaveProperty('context', 'ctx');
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('autoReview');
      expect(result).toHaveProperty('lessonTracking');
      expect(result).toHaveProperty('comprehensiveCheck');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('_hasRecentLesson', () => {
    it('returns false when search returns empty', () => {
      bs.lessonLibrary.search = jest.fn().mockReturnValue([]);
      expect(engine._hasRecentLesson('ctx')).toBe(false);
    });

    it('returns true when recent lesson within 2 hours', () => {
      bs.lessonLibrary.search = jest.fn().mockReturnValue([
        { date: new Date(Date.now() - 1000).toISOString() }
      ]);
      expect(engine._hasRecentLesson('ctx')).toBe(true);
    });

    it('returns false when recent lesson older than 2 hours', () => {
      bs.lessonLibrary.search = jest.fn().mockReturnValue([
        { date: new Date(Date.now() - 3 * 3600 * 1000).toISOString() }
      ]);
      expect(engine._hasRecentLesson('ctx')).toBe(false);
    });
  });
});
