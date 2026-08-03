describe('LessonTracker', () => {
  let LessonTracker;
  let tracker;
  let bs;

  beforeAll(() => {
    LessonTracker = require('../../src/utils/LessonTracker');
  });

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});

    bs = {
      _hasRecentLesson: jest.fn().mockReturnValue(false),
      lessonLibrary: {
        getSuggestions: jest.fn().mockReturnValue([]),
        get: jest.fn(),
        markApplied: jest.fn(),
        getStats: jest.fn().mockReturnValue({ applied: 5, total: 10, unapplied: 5 }),
        search: jest.fn().mockReturnValue([])
      }
    };
    tracker = new LessonTracker(bs);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('_autoSelfReview', () => {
    it('adds lesson-record when successful with action and no recent lesson', () => {
      const result = tracker._autoSelfReview('ctx', { success: true }, 'analyze bug');
      expect(result.checks.some(c => c.check === 'lesson-record')).toBe(true);
      expect(result.hasPendingChecks).toBe(true);
    });

    it('does NOT add any checks when result is falsy', () => {
      const result = tracker._autoSelfReview('ctx', null, 'analyze bug');
      expect(result.checks).toHaveLength(0);
      expect(result.hasPendingChecks).toBe(false);
    });

    it('does NOT add any checks when result.success is false', () => {
      const result = tracker._autoSelfReview('ctx', { success: false }, 'analyze bug');
      expect(result.checks).toHaveLength(0);
    });

    it('does NOT add any checks when action is null', () => {
      const result = tracker._autoSelfReview('ctx', { success: true }, null);
      expect(result.checks).toHaveLength(0);
    });

    it('does NOT add lesson-record when recent lesson exists', () => {
      bs._hasRecentLesson.mockReturnValue(true);
      const result = tracker._autoSelfReview('ctx', { success: true }, 'analyze bug');
      expect(result.checks.some(c => c.check === 'lesson-record')).toBe(false);
    });

    it('adds self-check when action triggers _shouldSelfCheck', () => {
      const result = tracker._autoSelfReview('ctx', { success: true }, 'modify config');
      expect(result.checks.some(c => c.check === 'self-check')).toBe(true);
    });

    it('adds cleanup check when action may have leftovers', () => {
      const result = tracker._autoSelfReview('ctx', { success: true }, 'new feature');
      expect(result.checks.some(c => c.check === 'cleanup')).toBe(true);
    });

    it('returns timestamp in result', () => {
      const result = tracker._autoSelfReview('ctx', { success: true }, 'create file');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('_trackLessonUsage', () => {
    it('returns empty tracking when no suggestions', () => {
      const result = tracker._trackLessonUsage('ctx');
      expect(result.lessonsUsed).toHaveLength(0);
      expect(result.lessonsApplied).toHaveLength(0);
    });

    it('tracks lessons from suggestions', () => {
      bs.lessonLibrary.getSuggestions.mockReturnValue([
        { lessonId: 'l1' }, { lessonId: 'l2' }
      ]);
      bs.lessonLibrary.get
        .mockReturnValueOnce({ id: 'l1', lesson: 'test lesson one', applied: true })
        .mockReturnValueOnce({ id: 'l2', lesson: 'test lesson two', applied: false });
      const result = tracker._trackLessonUsage('ctx');
      expect(result.lessonsUsed).toHaveLength(2);
      expect(result.lessonsApplied).toEqual(['l2']);
    });

    it('marks unapplied lessons as applied', () => {
      bs.lessonLibrary.getSuggestions.mockReturnValue([{ lessonId: 'l1' }]);
      bs.lessonLibrary.get.mockReturnValue({ id: 'l1', lesson: 'test lesson', applied: false });
      tracker._trackLessonUsage('ctx');
      expect(bs.lessonLibrary.markApplied).toHaveBeenCalledWith('l1');
    });

    it('skips lesson when get returns null', () => {
      bs.lessonLibrary.getSuggestions.mockReturnValue([{ lessonId: 'nonexistent' }]);
      bs.lessonLibrary.get.mockReturnValue(null);
      const result = tracker._trackLessonUsage('ctx');
      expect(result.lessonsUsed).toHaveLength(0);
    });

    it('evaluates lesson effectiveness', () => {
      const result = tracker._trackLessonUsage('ctx');
      expect(result.effectiveness).toBeDefined();
      expect(result.effectiveness.applicationRate).toBe('50%');
      expect(result.effectiveness.health).toBe('good');
    });
  });

  describe('_evaluateLessonEffectiveness', () => {
    it('returns 0% when total is 0', () => {
      bs.lessonLibrary.getStats.mockReturnValue({ applied: 0, total: 0, unapplied: 0 });
      const result = tracker._evaluateLessonEffectiveness();
      expect(result.applicationRate).toBe('0%');
      expect(result.health).toBe('needs-attention');
    });

    it('returns good when rate >= 50', () => {
      bs.lessonLibrary.getStats.mockReturnValue({ applied: 5, total: 10, unapplied: 5 });
      expect(tracker._evaluateLessonEffectiveness().health).toBe('good');
    });

    it('returns fair when rate >= 30', () => {
      bs.lessonLibrary.getStats.mockReturnValue({ applied: 3, total: 10, unapplied: 7 });
      expect(tracker._evaluateLessonEffectiveness().health).toBe('fair');
    });

    it('returns needs-attention when rate < 30', () => {
      bs.lessonLibrary.getStats.mockReturnValue({ applied: 1, total: 10, unapplied: 9 });
      expect(tracker._evaluateLessonEffectiveness().health).toBe('needs-attention');
    });
  });

  describe('getLessonHistory', () => {
    it('returns empty array when no applied lessons', () => {
      bs.lessonLibrary.search.mockReturnValue([]);
      expect(tracker.getLessonHistory()).toEqual([]);
    });

    it('returns only applied lessons mapped correctly', () => {
      bs.lessonLibrary.search.mockReturnValue([
        { id: 'l1', lesson: 'lesson one', applied: true, lastApplied: '2024-01-01', applyCount: 3 },
        { id: 'l2', lesson: 'lesson two', applied: false, lastApplied: null, applyCount: 0 }
      ]);
      const result = tracker.getLessonHistory();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('l1');
      expect(result[0].applyCount).toBe(3);
    });

    it('passes limit to lessonLibrary.search', () => {
      bs.lessonLibrary.search.mockReturnValue([]);
      tracker.getLessonHistory(3);
      expect(bs.lessonLibrary.search).toHaveBeenCalledWith('', { type: 'success', limit: 3 });
    });
  });
});
