const Introspection = require('../../src/core/Introspection');

function createMockBrain() {
  return {
    searchLessons: jest.fn().mockReturnValue([]),
    lessonLibrary: { lessons: [] },
    beforeDecision: jest.fn().mockReturnValue({ questions: ['q1'] }),
    thinking: {
      multiAngle: jest.fn().mockReturnValue({ technical: {} })
    },
    associate: jest.fn().mockReturnValue('associated concept')
  };
}

describe('Introspection', () => {
  let introspection;

  beforeEach(() => {
    introspection = new Introspection(createMockBrain());
  });

  describe('constructor', () => {
    it('initializes with idle mode', () => {
      expect(introspection.state.mode).toBe('idle');
      expect(introspection.state.depth).toBe(0);
      expect(introspection.state.sessionCount).toBe(0);
    });

    it('has 10 default topics', () => {
      expect(introspection.topics).toHaveLength(10);
    });
  });

  describe('_randomTopic', () => {
    it('returns a topic from the list', () => {
      const topic = introspection._randomTopic();
      expect(introspection.topics).toContain(topic);
    });
  });

  describe('_addThought', () => {
    it('adds thought with timestamp', () => {
      introspection._addThought({ content: 'test' });
      expect(introspection.thoughtStream).toHaveLength(1);
      expect(introspection.thoughtStream[0].timestamp).toBeDefined();
    });

    it('caps at maxStream', () => {
      introspection.maxStream = 2;
      for (let i = 0; i < 5; i++) introspection._addThought({ content: `t${i}` });
      expect(introspection.thoughtStream).toHaveLength(2);
    });
  });

  describe('_extractInsight', () => {
    it('returns default when no items', () => {
      expect(introspection._extractInsight([])).toBe('无特别洞察');
    });

    it('returns middle topic as insight', () => {
      const items = [
        { topic: 'a' },
        { topic: 'b' },
        { topic: 'c' }
      ];
      const insight = introspection._extractInsight(items);
      expect(insight).toContain('b');
    });

    it('falls back when no topics', () => {
      expect(introspection._extractInsight([{}])).toBe('需要更深入的思考');
    });
  });

  describe('_generateMeditationContent', () => {
    it('returns structured content', () => {
      const content = introspection._generateMeditationContent('自我', ['q1'], ['technical']);
      expect(content.main).toBeTruthy();
      expect(content.questions).toHaveLength(1);
      expect(content.perspectives).toHaveLength(1);
    });
  });

  describe('_reflectOnLesson', () => {
    it('returns structured reflection', async () => {
      const lesson = { lesson: 'lesson text', category: 'cat' };
      const reflection = await introspection._reflectOnLesson(lesson);
      expect(reflection.what).toBe('lesson text');
      expect(reflection.why).toBeTruthy();
      expect(reflection.how).toBeTruthy();
    });
  });

  describe('_creativeGenerate', () => {
    it('generates creative content with keywords', async () => {
      const gen = await introspection._creativeGenerate('time space');
      expect(gen.style).toBe('creative');
      expect(gen.content).toBeTruthy();
      expect(gen.associations).toContain('time');
    });
  });

  describe('_analogyGenerate', () => {
    it('generates analogy content', async () => {
      const gen = await introspection._analogyGenerate('coding');
      expect(gen.style).toBe('analogy');
      expect(gen.content).toContain('coding');
    });
  });

  describe('_futureGenerate', () => {
    it('generates timeline with stages', async () => {
      const gen = await introspection._futureGenerate('AI');
      expect(gen.style).toBe('future');
      expect(gen.timeline).toHaveLength(3);
      expect(gen.timeline[0].stage).toBe('现在');
    });
  });

  describe('_abstractGenerate', () => {
    it('generates abstract content', async () => {
      const gen = await introspection._abstractGenerate('thought');
      expect(gen.style).toBe('abstract');
      expect(gen.essence).toContain('thought');
    });
  });

  describe('_interpretDream', () => {
    it('interprets dream fragments', async () => {
      const fragments = [
        { main: 'topicA' },
        { main: 'topicB' }
      ];
      const meaning = await introspection._interpretDream(fragments);
      expect(meaning.symbols).toContain('topicA');
      expect(meaning.mood).toBeDefined();
    });
  });

  describe('getStatus', () => {
    it('returns current state', () => {
      const status = introspection.getStatus();
      expect(status.mode).toBe('idle');
      expect(status.depth).toBe(0);
    });
  });

  describe('getThoughtHistory', () => {
    it('returns limited thoughts', () => {
      for (let i = 0; i < 15; i++) introspection.thoughtStream.push({ i });
      expect(introspection.getThoughtHistory(5)).toHaveLength(5);
    });
  });

  describe('getImaginations', () => {
    it('returns limited imaginations', () => {
      for (let i = 0; i < 15; i++) introspection.imaginations.push({ i });
      expect(introspection.getImaginations(5)).toHaveLength(5);
    });
  });

  describe('diagnose', () => {
    it('returns healthy with sufficient sessions', () => {
      introspection.state.sessionCount = 10;
      const diag = introspection.diagnose();
      expect(diag.health).toBe('healthy');
    });

    it('flags needs-practice with few sessions', () => {
      const diag = introspection.diagnose();
      expect(diag.health).toBe('needs-practice');
    });
  });

  describe('meditate', () => {
    beforeEach(() => {
      jest.spyOn(introspection, '_delay').mockImplementation(() => Promise.resolve());
    });

    afterEach(() => {
      introspection._delay.mockRestore();
    });

    it('runs meditation loop when duration > 0', async () => {
      const session = await introspection.meditate(10);
      expect(session.type).toBe('meditation');
      expect(session.thoughts.length).toBeGreaterThanOrEqual(1);
      expect(introspection.state.mode).toBe('idle');
      expect(introspection.state.depth).toBeGreaterThanOrEqual(1);
      expect(session.duration).toBeDefined();
      expect(session.insight).toBeDefined();
    });

    it('skips loop when duration is 0', async () => {
      const session = await introspection.meditate(0);
      expect(session.thoughts).toHaveLength(0);
      expect(introspection.state.mode).toBe('idle');
    });

    it('increments sessionCount', async () => {
      const before = introspection.state.sessionCount;
      await introspection.meditate(10);
      expect(introspection.state.sessionCount).toBe(before + 1);
    });
  });

  describe('reflect', () => {
    beforeEach(() => {
      jest.spyOn(introspection, '_delay').mockImplementation(() => Promise.resolve());
    });

    afterEach(() => {
      introspection._delay.mockRestore();
    });

    it('uses searchLessons when keyword is provided', async () => {
      introspection.brain.searchLessons = jest.fn().mockReturnValue([
        { lesson: 'lesson one', category: 'cat1' },
        { lesson: 'lesson two', category: 'cat2' }
      ]);
      const session = await introspection.reflect('testKeyword');
      expect(introspection.brain.searchLessons).toHaveBeenCalledWith('testKeyword');
      expect(session.type).toBe('reflection');
      expect(session.reviews.length).toBe(2);
      expect(introspection.state.mode).toBe('idle');
    });

    it('uses lessonLibrary when keyword is null', async () => {
      introspection.brain.lessonLibrary.lessons = [
        { lesson: 'lib lesson one', category: 'cat1' },
        { lesson: 'lib lesson two', category: 'cat2' }
      ];
      const session = await introspection.reflect(null);
      expect(introspection.brain.searchLessons).not.toHaveBeenCalled();
      expect(session.reviews.length).toBe(2);
    });

    it('limits reviews to 5', async () => {
      introspection.brain.searchLessons = jest.fn().mockReturnValue(
        Array.from({ length: 10 }, (_, i) => ({ lesson: `lesson ${i}`, category: 'cat' }))
      );
      const session = await introspection.reflect('kw');
      expect(session.reviews.length).toBe(5);
    });
  });

  describe('imagine', () => {
    beforeEach(() => {
      jest.spyOn(introspection, '_delay').mockImplementation(() => Promise.resolve());
    });

    afterEach(() => {
      introspection._delay.mockRestore();
    });

    it('generates creative style by default', async () => {
      const session = await introspection.imagine('test prompt', 'creative');
      expect(session.type).toBe('imagination');
      expect(session.generations[0].style).toBe('creative');
      expect(introspection.state.mode).toBe('idle');
      expect(introspection.imaginations.length).toBeGreaterThanOrEqual(1);
    });

    it('generates analogy style', async () => {
      const session = await introspection.imagine('test prompt', 'analogy');
      expect(session.generations[0].style).toBe('analogy');
    });

    it('generates future style', async () => {
      const session = await introspection.imagine('test prompt', 'future');
      expect(session.generations[0].style).toBe('future');
    });

    it('generates abstract style', async () => {
      const session = await introspection.imagine('test prompt', 'abstract');
      expect(session.generations[0].style).toBe('abstract');
    });

    it('falls back to creative for unknown style', async () => {
      const session = await introspection.imagine('test prompt', 'unknownStyle');
      expect(session.generations[0].style).toBe('creative');
    });

    it('saves imagination with prompt and style', async () => {
      const before = introspection.imaginations.length;
      await introspection.imagine('my prompt', 'creative');
      const saved = introspection.imaginations[introspection.imaginations.length - 1];
      expect(saved.prompt).toBe('my prompt');
      expect(saved.style).toBe('creative');
      expect(saved.content).toBeDefined();
      expect(introspection.imaginations.length).toBe(before + 1);
    });
  });

  describe('dream', () => {
    beforeEach(() => {
      jest.spyOn(introspection, '_delay').mockImplementation(() => Promise.resolve());
    });

    afterEach(() => {
      introspection._delay.mockRestore();
    });

    it('creates dream fragments', async () => {
      const session = await introspection.dream(6000);
      expect(session.type).toBe('dreaming');
      expect(session.fragments).toHaveLength(2);
      expect(introspection.state.mode).toBe('idle');
      expect(session.dreamMeaning).toBeDefined();
    });

    it('skips loop with 0 duration', async () => {
      const session = await introspection.dream(0);
      expect(session.fragments).toHaveLength(0);
      expect(introspection.state.mode).toBe('idle');
    });

    it('increments session count', async () => {
      const before = introspection.state.sessionCount;
      await introspection.dream(3000);
      expect(introspection.state.sessionCount).toBe(before + 1);
    });
  });

  describe('_deepThought', () => {
    it('uses beforeDecision and thinking when available', async () => {
      introspection.brain.beforeDecision = jest.fn().mockReturnValue({ questions: ['q1', 'q2', 'q3', 'q4'] });
      introspection.brain.thinking = { multiAngle: jest.fn().mockReturnValue({ a: 1, b: 2 }) };
      const thought = await introspection._deepThought('test topic');
      expect(thought.topic).toBe('test topic');
      expect(thought.questions.length).toBeLessThanOrEqual(3);
      expect(thought.perspectives).toBeDefined();
      expect(thought.perspectives.length).toBeLessThanOrEqual(3);
      expect(thought.content).toBeDefined();
    });

    it('skips beforeDecision when absent', async () => {
      introspection.brain.beforeDecision = null;
      introspection.brain.thinking = null;
      const thought = await introspection._deepThought('topic');
      expect(thought.questions).toEqual([]);
      expect(thought.perspectives).toBeUndefined();
    });

    it('handles beforeDecision returning null questions', async () => {
      introspection.brain.beforeDecision = jest.fn().mockReturnValue({ questions: null });
      const thought = await introspection._deepThought('topic');
      expect(thought.questions).toEqual([]);
    });

    it('handles beforeDecision returning no questions key', async () => {
      introspection.brain.beforeDecision = jest.fn().mockReturnValue({});
      const thought = await introspection._deepThought('topic');
      expect(thought.questions).toEqual([]);
    });
  });

  describe('_generateMeditationContent', () => {
    it('handles null questions and perspectives', () => {
      const content = introspection._generateMeditationContent('topic', null, null);
      expect(content.questions).toEqual([]);
      expect(content.perspectives).toEqual([]);
    });

    it('handles empty questions and perspectives arrays', () => {
      const content = introspection._generateMeditationContent('topic', [], []);
      expect(content.questions).toEqual([]);
      expect(content.perspectives).toEqual([]);
    });

    it('slices questions to max 2', () => {
      const content = introspection._generateMeditationContent('topic', ['a', 'b', 'c', 'd'], ['p1']);
      expect(content.questions.length).toBeLessThanOrEqual(2);
    });

    it('slices perspectives to max 3', () => {
      const content = introspection._generateMeditationContent('topic', ['q1'], ['p1', 'p2', 'p3', 'p4', 'p5']);
      expect(content.perspectives.length).toBeLessThanOrEqual(3);
    });
  });

  describe('_associate', () => {
    it('uses brain.associate when available', async () => {
      introspection.brain.associate = jest.fn().mockReturnValue('brain concept');
      const result = await introspection._associate('topic');
      expect(result).toBe('brain concept');
      expect(introspection.brain.associate).toHaveBeenCalledWith('topic');
    });

    it('falls back to _randomTopic when brain.associate is absent', async () => {
      introspection.brain.associate = null;
      const result = await introspection._associate('topic');
      expect(introspection.topics).toContain(result);
    });
  });

  describe('_extractInsight', () => {
    it('returns default when items is null', () => {
      expect(introspection._extractInsight(null)).toBe('无特别洞察');
    });

    it('uses main property when topic is absent', () => {
      const items = [{ main: 'mainA' }, { main: 'mainB' }];
      const insight = introspection._extractInsight(items);
      expect(insight).toContain('mainB');
    });

    it('uses lesson property when topic and main are absent', () => {
      const items = [{ lesson: 'lessonA' }, { lesson: 'lessonB' }];
      const insight = introspection._extractInsight(items);
      expect(insight).toContain('lessonB');
    });

    it('prioritizes topic over main and lesson', () => {
      const items = [{ topic: 't1', main: 'm1', lesson: 'l1' }];
      const insight = introspection._extractInsight(items);
      expect(insight).toContain('t1');
    });

    it('prioritizes main over lesson', () => {
      const items = [{ main: 'm1', lesson: 'l1' }];
      const insight = introspection._extractInsight(items);
      expect(insight).toContain('m1');
    });
  });

  describe('_interpretDream', () => {
    it('produces mood either 探索性 or 成长性', async () => {
      const results = new Set();
      for (let i = 0; i < 20; i++) {
        const meaning = await introspection._interpretDream([{ main: 'a' }, { main: 'b' }]);
        results.add(meaning.mood);
      }
      expect(results.has('探索性') || results.has('成长性')).toBe(true);
    });
  });

  describe('getThoughtHistory', () => {
    it('returns all when limit exceeds length', () => {
      introspection.thoughtStream = [{ content: 'a' }, { content: 'b' }];
      expect(introspection.getThoughtHistory(10)).toHaveLength(2);
    });

    it('returns empty when stream is empty', () => {
      expect(introspection.getThoughtHistory()).toHaveLength(0);
    });
  });

  describe('getImaginations', () => {
    it('returns all when limit exceeds length', () => {
      introspection.imaginations = [{ prompt: 'a' }];
      expect(introspection.getImaginations(10)).toHaveLength(1);
    });

    it('returns empty when list is empty', () => {
      expect(introspection.getImaginations()).toHaveLength(0);
    });
  });

  describe('_addThought', () => {
    it('does not trim when under maxStream', () => {
      introspection.maxStream = 10;
      introspection._addThought({ content: 'one' });
      expect(introspection.thoughtStream).toHaveLength(1);
    });
  });
});
