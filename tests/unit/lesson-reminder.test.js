describe('LessonReminder', () => {
  let lessonReminder;
  let fs;

  beforeAll(() => {
    fs = require('fs');
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    lessonReminder = require('../../src/core/LessonReminder');
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('getRelevantLessons', () => {
    it('returns empty array when lessons file missing', () => {
      const result = lessonReminder.getRelevantLessons('code', 5);
      expect(result).toEqual([]);
    });

    it('returns empty array on parse error', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('invalid json');
      const result = lessonReminder.getRelevantLessons('code', 5);
      expect(result).toEqual([]);
    });

    it('returns lessons matching task category sorted by priority', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
        lessons: [
          { lesson: 'low prio', category: 'thinking', status: 'active', priority: 'low', effectiveness: 3, useCount: 0 },
          { lesson: 'high prio', category: 'thinking', status: 'active', priority: 'high', effectiveness: 3, useCount: 0 },
          { lesson: 'inactive', category: 'thinking', status: 'inactive', priority: 'high', effectiveness: 5, useCount: 0 }
        ]
      }));
      const result = lessonReminder.getRelevantLessons('code', 5);
      expect(result).toHaveLength(2);
      expect(result[0].lesson).toBe('high prio');
    });

    it('uses default category for unknown task types', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
        lessons: [
          { lesson: 'default lesson', category: 'thinking', status: 'active', priority: 'medium' }
        ]
      }));
      const result = lessonReminder.getRelevantLessons('unknown_type');
      expect(result).toHaveLength(1);
    });

    it('limits results to maxLessons', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
        lessons: [
          { lesson: 'a', category: 'thinking', status: 'active', priority: 'medium' },
          { lesson: 'b', category: 'thinking', status: 'active', priority: 'medium' },
          { lesson: 'c', category: 'thinking', status: 'active', priority: 'medium' }
        ]
      }));
      expect(lessonReminder.getRelevantLessons('code', 2)).toHaveLength(2);
    });
  });

  describe('formatReminder', () => {
    it('returns empty string for empty lessons', () => {
      expect(lessonReminder.formatReminder([])).toBe('');
      expect(lessonReminder.formatReminder(null)).toBe('');
      expect(lessonReminder.formatReminder(undefined)).toBe('');
    });

    it('formats lessons with stars and use count', () => {
      const lessons = [
        { lesson: 'highly effective', effectiveness: 5, useCount: 3 },
        { lesson: 'less effective', effectiveness: 2, useCount: 1 }
      ];
      const result = lessonReminder.formatReminder(lessons);
      expect(result).toContain('=== 教训提醒 ===');
      expect(result).toContain('★ highly effective (使用3次)');
      expect(result).toContain('○ less effective (使用1次)');
      expect(result).toContain('==============');
    });

    it('uses safe defaults for missing useCount and effectiveness', () => {
      const lessons = [{ lesson: 'minimal' }];
      const result = lessonReminder.formatReminder(lessons);
      expect(result).toContain('○ minimal (使用0次)');
    });
  });

  describe('getQuickReminder', () => {
    it('returns empty string when no lessons', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(lessonReminder.getQuickReminder('code')).toBe('');
    });

    it('returns pipe-joined lesson titles', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
        lessons: [
          { lesson: 'first', category: 'thinking', status: 'active', priority: 'high' },
          { lesson: 'second', category: 'thinking', status: 'active', priority: 'medium' }
        ]
      }));
      expect(lessonReminder.getQuickReminder('code')).toBe('first | second');
    });
  });

  describe('printReminder', () => {
    it('does not call console.log when no lessons', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      lessonReminder.printReminder('code');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('calls console.log when lessons exist', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
        lessons: [{ lesson: 'test', category: 'thinking', status: 'active', priority: 'high' }]
      }));
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      lessonReminder.printReminder('code');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toContain('test');
      spy.mockRestore();
    });
  });

  describe('TASK_CATEGORY_MAP', () => {
    it('maps all expected task types', () => {
      const types = ['code', 'test', 'fix', 'feature', 'refactor', 'security', 'deploy', 'review', 'default'];
      types.forEach((t) => {
        expect(Array.isArray(lessonReminder.TASK_CATEGORY_MAP[t])).toBe(true);
      });
    });

    it('maps default as fallback', () => {
      expect(lessonReminder.TASK_CATEGORY_MAP.default).toEqual(['thinking', 'tool', 'pattern']);
    });
  });

  describe('branch coverage edge cases', () => {
    it('getRelevantLessons uses default taskType when called without args', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
        lessons: [{ lesson: 'def-cat', category: 'tool', status: 'active', priority: 'medium' }]
      }));
      expect(lessonReminder.getRelevantLessons()).toHaveLength(1);
    });

    it('handles undefined lessons key in data', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({}));
      expect(lessonReminder.getRelevantLessons('code')).toEqual([]);
    });

    it('covers sort ?? 2 right-branch and aE !== bE true-branch', () => {
      // index structure exploits TimSort compare(arr[i+1], arr[i]) for descending detection:
      // compare(B,A): a=B('urgent') -> aP=??2 RIGHT; compare(D,C): aE=3,bE=5 -> aE!==bE TRUE
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
        lessons: [
          { lesson: 'A', category: 'thinking', status: 'active', priority: 'high', effectiveness: 3 },
          { lesson: 'B', category: 'thinking', status: 'active', priority: 'urgent', effectiveness: 5 },
          { lesson: 'C', category: 'thinking', status: 'active', priority: 'high', effectiveness: 5 },
          { lesson: 'D', category: 'thinking', status: 'active', priority: 'high', effectiveness: 3, useCount: 5 }
        ]
      }));
      const result = lessonReminder.getRelevantLessons('code', 5);
      expect(result).toHaveLength(4);
    });

    it('getQuickReminder uses default taskType', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
        lessons: [{ lesson: 'quick', category: 'pattern', status: 'active', priority: 'high' }]
      }));
      expect(lessonReminder.getQuickReminder()).toBe('quick');
    });

    it('getQuickReminder empty when no lessons with default taskType', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(lessonReminder.getQuickReminder()).toBe('');
    });

    it('printReminder uses default taskType', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
        lessons: [{ lesson: 'print-def', category: 'pattern', status: 'active', priority: 'high' }]
      }));
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      lessonReminder.printReminder();
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });
});
