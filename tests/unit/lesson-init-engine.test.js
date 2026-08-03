describe('LessonInitEngine', () => {
  let LessonInitEngine;
  let engine;
  let bs;

  beforeAll(() => {
    LessonInitEngine = require('../../src/utils/LessonInitEngine');
  });

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    bs = {
      lessonLibrary: {
        getStats: jest.fn().mockReturnValue({ total: 0 }),
        lessons: [],
        add: jest.fn(),
        _save: jest.fn()
      }
    };
    engine = new LessonInitEngine(bs);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('_initDefaultLessons', () => {
    it('adds all 34 default lessons when library is empty', () => {
      engine._initDefaultLessons();
      expect(bs.lessonLibrary.add).toHaveBeenCalledTimes(34);
    });

    it('skips adding if existing lessons and cleans design notes', () => {
      bs.lessonLibrary.getStats.mockReturnValue({ total: 5 });
      bs.lessonLibrary.lessons = [
        { lesson: '需要感知层来提高AI认知', applied: false },
        { lesson: 'normal lesson', applied: false }
      ];
      engine._initDefaultLessons();
      expect(bs.lessonLibrary._save).toHaveBeenCalled();
      const applied = bs.lessonLibrary.lessons.filter(l => l.applied);
      expect(applied).toHaveLength(1);
    });

    it('handles duplicate/invalid lesson add errors gracefully', () => {
      const addMock = bs.lessonLibrary.add;
      addMock.mockImplementationOnce(() => { throw new Error('duplicate'); });
      addMock.mockReturnValue(undefined);
      expect(() => engine._initDefaultLessons()).not.toThrow();
    });
  });
});
