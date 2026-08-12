const BrainSystem = require('../../src/core/BrainSystem');

jest.mock('../../src/core/MetaCognition', () => jest.fn().mockImplementation(() => ({
  analyze: jest.fn().mockReturnValue({ questions: [], score: 0.5 }),
  getAnalysis: jest.fn().mockReturnValue({}),
  addKnowledge: jest.fn(),
  getKnowledge: jest.fn().mockReturnValue([]),
  analyzePattern: jest.fn().mockReturnValue({}),
  identifyGap: jest.fn().mockReturnValue(null),
  suggestImprovement: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({}),
  getStatus: jest.fn().mockReturnValue('ok')
})));
jest.mock('../../src/core/Thinking', () => jest.fn().mockImplementation(() => ({
  think: jest.fn().mockReturnValue({ perspectives: [], conclusion: '' }),
  solve: jest.fn().mockReturnValue({ solution: '' }),
  combinePerspectives: jest.fn().mockReturnValue([]),
  calculateConfidence: jest.fn().mockReturnValue(0.5),
  question: jest.fn().mockReturnValue(''),
  associate: jest.fn().mockReturnValue([]),
  reverseEngineer: jest.fn().mockReturnValue({}),
  orangePractice: jest.fn().mockReturnValue({})
})));
jest.mock('../../src/core/Evolution', () => jest.fn().mockImplementation(() => ({
  record: jest.fn(),
  getHistory: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({}),
  adjustStrategy: jest.fn(),
  evolve: jest.fn()
})));
jest.mock('../../src/core/ReverseThinking', () => jest.fn().mockImplementation(() => ({
  analyze: jest.fn().mockReturnValue({ reverse: true }),
  getInsights: jest.fn().mockReturnValue([])
})));
jest.mock('../../src/core/ToolManager', () => jest.fn().mockImplementation(() => ({
  register: jest.fn(),
  get: jest.fn().mockReturnValue(null),
  list: jest.fn().mockReturnValue([]),
  selectTools: jest.fn().mockReturnValue([]),
  execute: jest.fn(),
  compose: jest.fn()
})));
jest.mock('../../src/core/LessonLibrary', () => jest.fn().mockImplementation(() => ({
  lessons: [],
  search: jest.fn().mockReturnValue([]),
  get: jest.fn().mockReturnValue(null),
  add: jest.fn(),
  markApplied: jest.fn(),
  getSuggestions: jest.fn().mockReturnValue([]),
  getRelated: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({ total: 0, applied: 0 }),
  export: jest.fn().mockReturnValue('[]'),
  categories: {}
})));

describe('ProactiveThinking (via BrainSystem static methods)', () => {
  beforeEach(() => {
    BrainSystem.BrainSystem._proactiveThinking = null;
  });

  test('proactiveThink returns result with questions and suggestions', () => {
    const result = BrainSystem.proactiveThink('test input', { history: [] });
    expect(result).toBeDefined();
    expect(result.questions).toBeDefined();
    expect(result.suggestions).toBeDefined();
  });

  test('proactiveThink with bug fix input', () => {
    const result = BrainSystem.proactiveThink('fix the authentication bug', {});
    expect(result).toBeDefined();
    expect(Array.isArray(result.questions)).toBe(true);
  });

  test('proactiveThink with deploy input', () => {
    const result = BrainSystem.proactiveThink('deploy to production', {});
    expect(result).toBeDefined();
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  test('proactiveThink with conversation context', () => {
    const result = BrainSystem.proactiveThink('continue', {
      history: [
        { input: 'write tests', response: 'tests written' },
        { input: 'run tests', response: 'tests passed' }
      ]
    });
    expect(result).toBeDefined();
  });

  test('getProactiveStatus returns status', () => {
    const status = BrainSystem.getProactiveStatus();
    expect(status).toBeDefined();
  });
});

describe('ProactiveThinking (direct factory)', () => {
  let factory;
  let persistence;
  let pt;

  beforeEach(() => {
    jest.clearAllMocks();
    persistence = {
      load: jest.fn().mockReturnValue({ count: 0, lastTime: 0 }),
      save: jest.fn()
    };
    factory = require('../../src/core/ProactiveThinking');
    pt = factory(persistence);
    pt._patternLearner = {
      learn: jest.fn(),
      predict: jest.fn().mockReturnValue({ topIntent: null, nextPossible: [], avgInputLength: 0 }),
      getTopIntent: jest.fn().mockReturnValue(null),
      _intentCount: 0
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('initializes and returns proactive result', () => {
    const result = pt.think('hello', { history: [] });
    expect(result.proactive).toBe(true);
    expect(result.questions).toBeDefined();
    expect(result.suggestions).toBeDefined();
    expect(persistence.load).toHaveBeenCalledWith('proactive', expect.anything());
    expect(persistence.save).toHaveBeenCalled();
  });

  test('think works with omitted default arguments', () => {
    const result = pt.think();
    expect(result.proactive).toBe(true);
  });

  test('only initializes once', () => {
    pt.think('a', {});
    pt.think('b', {});
    expect(persistence.load).toHaveBeenCalledTimes(1);
  });

  test('persistence load failure uses defaults', () => {
    persistence.load.mockImplementation(() => {
      throw new Error('load failed');
    });
    const result = pt.think('input', {});
    expect(result.proactive).toBe(true);
  });

  test('persistence save failure logs error', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    persistence.save.mockImplementation(() => {
      throw new Error('save failed');
    });
    pt.think('input', {});
    expect(errorSpy).toHaveBeenCalled();
  });

  test('increments patternsLearned for input longer than 2 chars', () => {
    pt.think('a', {});
    expect(pt._patternsLearned).toBe(0);
    pt.think('longer input', {});
    expect(pt._patternsLearned).toBe(1);
  });

  test('generateQuestions returns prediction, review and clarification questions', () => {
    pt._patternLearner.predict.mockReturnValue({
      topIntent: 'test',
      nextPossible: [{ intent: 'test', confidence: 0.9 }],
      avgInputLength: 10
    });
    pt._interactionCount = 11;
    const questions = pt.generateQuestions('hi', {});
    expect(questions.some((q) => q.type === 'prediction')).toBe(true);
    expect(questions.some((q) => q.type === 'review')).toBe(true);
    expect(questions.some((q) => q.type === 'clarification')).toBe(true);
  });

  test('generateQuestions returns empty for high-confidence short input edge', () => {
    pt._patternLearner.predict.mockReturnValue({ nextPossible: [] });
    const questions = pt.generateQuestions('', {});
    expect(questions).toEqual([]);
  });

  test('generateQuestions skips prediction when confidence is not high', () => {
    pt._patternLearner.predict.mockReturnValue({
      nextPossible: [{ intent: 'test', confidence: 0.5 }]
    });
    const questions = pt.generateQuestions('a long enough input', {});
    expect(questions.some((q) => q.type === 'prediction')).toBe(false);
  });

  test('generateQuestions falls back to empty predictions', () => {
    pt._patternLearner.predict.mockReturnValue(null);
    expect(pt.generateQuestions('long enough input', {})).toEqual([]);
  });

  test('generateSuggestions falls back to empty predictions', () => {
    pt._patternLearner.predict.mockReturnValue(null);
    expect(pt.generateSuggestions('', {})).toEqual([]);
  });

  test('generateSuggestions returns predicted and keyword-based suggestions', () => {
    pt._patternLearner.predict.mockReturnValue({
      topIntent: 'code',
      nextPossible: [{ intent: 'code', confidence: 0.9 }],
      avgInputLength: 10
    });
    const suggestions = pt.generateSuggestions('fix the bug', {});
    expect(suggestions.some((s) => s.type === 'predicted')).toBe(true);
    expect(suggestions.some((s) => s.type === 'skill')).toBe(true);
  });

  test('generateSuggestions handles keyword groups and empty input', () => {
    pt._patternLearner.predict.mockReturnValue({ nextPossible: [] });
    const s1 = pt.generateSuggestions('优化一下性能', {});
    expect(s1.some((s) => s.name === 'performance-optimization')).toBe(true);
    const s2 = pt.generateSuggestions('', {});
    expect(s2).toEqual([]);
  });

  test('generateSuggestions skips prediction when confidence is not high', () => {
    pt._patternLearner.predict.mockReturnValue({
      nextPossible: [{ intent: 'code', confidence: 0.4 }]
    });
    const suggestions = pt.generateSuggestions('write code', {});
    expect(suggestions.some((s) => s.type === 'predicted')).toBe(false);
  });

  test('generateInsights reports progress when intent count exceeds 5', () => {
    pt._patternLearner._intentCount = 6;
    const insights = pt.generateInsights();
    expect(insights).toHaveLength(1);
  });

  test('generateInsights empty when intent count low', () => {
    pt._patternLearner._intentCount = 2;
    expect(pt.generateInsights()).toEqual([]);
  });

  test('maybeReview returns needed when count is multiple of 10', () => {
    pt._interactionCount = 10;
    expect(pt.maybeReview()).toEqual({ needed: true, type: 'periodic', text: expect.stringContaining('10') });
  });

  test('maybeReview returns not needed otherwise', () => {
    pt._interactionCount = 5;
    expect(pt.maybeReview()).toEqual({ needed: false });
  });

  test('think logs insights when present', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    pt._patternLearner._intentCount = 6;
    pt._patternLearner.predict.mockReturnValue({
      topIntent: 'code',
      nextPossible: [{ intent: 'code', confidence: 0.9 }],
      avgInputLength: 10
    });
    pt.think('write a function to fix this bug', {});
    expect(logSpy).toHaveBeenCalled();
  });

  test('think logs N/A when prediction confidence is missing', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    pt._patternLearner._intentCount = 6;
    pt._patternLearner.predict.mockReturnValue({
      topIntent: 'code',
      nextPossible: [{ intent: 'code' }],
      avgInputLength: 10
    });
    pt.think('write a function to fix this bug', {});
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('N/A'));
  });

  test('think logs suggestions when questions are empty', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    pt._patternLearner._intentCount = 6;
    pt._patternLearner.predict.mockReturnValue({
      topIntent: null,
      nextPossible: [],
      avgInputLength: 0
    });
    pt._interactionCount = 2;
    pt.think('修复这个 bug', {});
    expect(logSpy).toHaveBeenCalled();
  });

  test('think does not log when nothing to report', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    pt._patternLearner.predict.mockReturnValue({ topIntent: null, nextPossible: [], avgInputLength: 0 });
    pt._interactionCount = 2;
    pt.think('', {});
    expect(logSpy).not.toHaveBeenCalled();
  });

  test('getStatus returns saved values', () => {
    persistence.load.mockReturnValue({
      count: 5,
      patternsLearned: 3,
      topIntent: 'saved-topic',
      lastTime: 123
    });
    pt._patternLearner.getTopIntent.mockReturnValue('live-topic');
    const status = pt.getStatus();
    expect(status.interactionCount).toBe(5);
    expect(status.patternsLearned).toBe(3);
    expect(status.topIntent).toBe('live-topic');
    expect(status.lastInteraction).toBe(123);
  });

  test('getStatus falls back to live values when saved are zeros', () => {
    persistence.load.mockReturnValue({
      count: 0,
      patternsLearned: 0,
      topIntent: null,
      lastTime: 0
    });
    pt._interactionCount = 7;
    pt._patternsLearned = 2;
    pt._lastInteractionTime = 456;
    const status = pt.getStatus();
    expect(status.interactionCount).toBe(7);
    expect(status.patternsLearned).toBe(2);
    expect(status.topIntent).toBeNull();
    expect(status.lastInteraction).toBe(456);
  });

  test('getStatus works without a pattern learner', () => {
    pt._patternLearner = null;
    const status = pt.getStatus();
    expect(status.interactionCount).toBe(0);
    expect(status.topIntent).toBeNull();
  });

  test('getStatus falls back when persistence load throws', () => {
    persistence.load.mockImplementation(() => {
      throw new Error('load failed');
    });
    pt._patternLearner.getTopIntent.mockReturnValue('live-topic');
    pt._interactionCount = 7;
    pt._patternsLearned = 2;
    pt._lastInteractionTime = 456;
    const status = pt.getStatus();
    expect(status.interactionCount).toBe(7);
    expect(status.topIntent).toBe('live-topic');
    expect(status.lastInteraction).toBe(456);
  });

  test('getStatus catch fallback keeps null top intent', () => {
    persistence.load.mockImplementation(() => {
      throw new Error('load failed');
    });
    pt._patternLearner.getTopIntent.mockReturnValue(null);
    pt._interactionCount = 7;
    const status = pt.getStatus();
    expect(status.interactionCount).toBe(7);
    expect(status.topIntent).toBeNull();
  });
});
