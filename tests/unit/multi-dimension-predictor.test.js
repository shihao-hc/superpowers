const BrainSystem = require('../../src/core/BrainSystem');
const MultiDimensionPredictor = require('../../src/core/MultiDimensionPredictor');

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

describe('MultiDimensionPredictor (via BrainSystem static methods)', () => {
  beforeEach(() => {
    BrainSystem.BrainSystem._predictor = null;
  });

  test('predict returns prediction object with 4 dimensions', () => {
    const result = BrainSystem.predict('test input', { history: [] });
    expect(result).toBeDefined();
    expect(result.intent).toBeDefined();
    expect(result.intent).toHaveProperty('intent');
    expect(result.intent).toHaveProperty('confidence');
    expect(result.skill).toBeDefined();
    expect(result.skill).toHaveProperty('skill');
    expect(result.skill).toHaveProperty('confidence');
    expect(result.nextAction).toBeDefined();
    expect(result.nextAction).toHaveProperty('confidence');
    expect(result.timeBased).toBeDefined();
    expect(result.timeBased).toHaveProperty('confidence');
    expect(typeof result.confidence).toBe('number');
  });

  test('predict with deployment context', () => {
    const result = BrainSystem.predict('deploy code', {
      history: [{ input: 'deploy', intent: 'deploy' }],
      currentIntent: { type: 'deploy' }
    });
    expect(result).toBeDefined();
  });

  test('learnInteraction records data without error', () => {
    expect(() => {
      BrainSystem.learnInteraction('test input', { type: 'code' }, 'skill1', 'action1');
    }).not.toThrow();
  });

  test('predict multiple times builds history', () => {
    BrainSystem.predict('input1', {});
    BrainSystem.predict('input2', {});
    const result = BrainSystem.predict('input3', {});
    expect(result).toBeDefined();
  });

  test('predict with empty input', () => {
    const result = BrainSystem.predict('', {});
    expect(result).toBeDefined();
  });
});

describe('MultiDimensionPredictor (direct class)', () => {
  let predictor;

  beforeEach(() => {
    jest.clearAllMocks();
    predictor = new MultiDimensionPredictor();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('default constructor initializes dimensions', () => {
    expect(predictor._maxHistory).toBe(50);
    expect(predictor._dimensions.time).toEqual({ morning: 0, afternoon: 0, evening: 0, night: 0 });
  });

  test('learn records entry and increments dimensions', () => {
    predictor.learn('write tests', 'test', 'skill1', 'action1');
    expect(predictor._history).toHaveLength(1);
    expect(predictor._dimensions.intent.test).toBe(1);
    expect(predictor._dimensions.skill.skill1).toBe(1);
    expect(predictor._dimensions.action.action1).toBe(1);
  });

  test('learn with null skill/action uses default args', () => {
    predictor.learn('hello', 'greet');
    expect(predictor._history[0].skill).toBeNull();
    expect(predictor._history[0].action).toBeNull();
  });

  test('learn shifts history when over max', () => {
    predictor._maxHistory = 3;
    predictor.learn('a', 'i1');
    predictor.learn('b', 'i2');
    predictor.learn('c', 'i3');
    predictor.learn('d', 'i4');
    expect(predictor._history).toHaveLength(3);
    expect(predictor._history[0].intent).toBe('i2');
  });

  test('_getTimeSlot returns morning', () => {
    expect(predictor._getTimeSlot(6)).toBe('morning');
    expect(predictor._getTimeSlot(8)).toBe('morning');
  });

  test('_getTimeSlot returns afternoon', () => {
    expect(predictor._getTimeSlot(12)).toBe('afternoon');
    expect(predictor._getTimeSlot(15)).toBe('afternoon');
  });

  test('_getTimeSlot returns evening', () => {
    expect(predictor._getTimeSlot(18)).toBe('evening');
    expect(predictor._getTimeSlot(20)).toBe('evening');
  });

  test('_getTimeSlot returns night', () => {
    expect(predictor._getTimeSlot(22)).toBe('night');
    expect(predictor._getTimeSlot(5)).toBe('night');
  });

  test('predict with default context uses empty object', () => {
    const result = predictor.predict('abc');
    expect(result).toBeDefined();
    expect(typeof result.confidence).toBe('number');
  });

  test('predict identifies code_create intent', () => {
    predictor.learn('build a class', 'code', 's', 'a');
    const result = predictor.predict('我想写一个函数');
    expect(result.intent.intent).toBe('code_create');
    expect(result.intent.confidence).toBe(0.8);
  });

  test('predict identifies optimize_performance intent', () => {
    const result = predictor.predict('优化一下性能');
    expect(result.intent.intent).toBe('optimize_performance');
  });

  test('predict identifies security intent', () => {
    const result = predictor.predict('检查安全漏洞');
    expect(result.intent.intent).toBe('security');
  });

  test('predict falls back to history trend intent', () => {
    predictor.learn('input1', 'common-intent');
    predictor.learn('input2', 'common-intent');
    predictor.learn('input3', 'common-intent');
    const result = predictor.predict('无关键词内容');
    expect(result.intent).toEqual({ intent: 'common-intent', confidence: 0.6, reason: 'history_trend' });
  });

  test('predict returns no_data intent for empty history', () => {
    const result = predictor.predict('无关键词');
    expect(result.intent).toEqual({ intent: null, confidence: 0, reason: 'no_data' });
  });

  test('_predictSkill uses history trend when skill present', () => {
    predictor.learn('x', 'i', 'top-skill');
    const result = predictor._predictSkill();
    expect(result).toEqual({ skill: 'top-skill', confidence: 0.6, reason: 'history_trend' });
  });

  test('_predictSkill falls back to time-based skill', () => {
    const result = predictor._predictSkill();
    expect(result.confidence).toBe(0.4);
    expect(result.reason).toBe('time_based');
  });

  test('_predictNextAction returns action from history', () => {
    predictor.learn('a', 'i', 's', 'act1');
    predictor.learn('b', 'i', 's', 'act2');
    predictor.learn('c', 'i', 's', 'act1');
    const result = predictor._predictNextAction();
    expect(result).toEqual({ action: 'act1', confidence: 0.5, reason: 'history' });
  });

  test('_predictNextAction returns null when no actions', () => {
    predictor.learn('a', 'i', null, null);
    const result = predictor._predictNextAction();
    expect(result).toEqual({ action: null, confidence: 0 });
  });

  test('_predictTimeBased returns zero confidence when no time data', () => {
    const result = predictor._predictTimeBased();
    expect(result.confidence).toBe(0);
    expect(result.activity).toBeNull();
  });

  test('_predictTimeBased returns slot activity with confidence', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-12T10:00:00'));
    predictor.learn('write code', 'code', 's', 'a');
    const result = predictor._predictTimeBased();
    jest.useRealTimers();
    expect(result.activity).toBe('code');
    expect(result.confidence).toBe(1);
  });

  test('_findSlotActivity returns null when entries empty', () => {
    expect(predictor._findSlotActivity('morning')).toBeNull();
  });

  test('_findSlotActivity returns null when no intents', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-12T10:00:00'));
    predictor.learn('a', null, 's', 'a');
    const result = predictor._findSlotActivity('morning');
    jest.useRealTimers();
    expect(result).toBeNull();
  });

  test('_findSlotActivity returns top intent', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-12T10:00:00'));
    predictor.learn('a', 'intent-x', 's', 'a');
    predictor.learn('b', 'intent-y', 's', 'a');
    predictor.learn('c', 'intent-x', 's', 'a');
    const result = predictor._findSlotActivity('morning');
    jest.useRealTimers();
    expect(result).toBe('intent-x');
  });

  test('_getTop returns null for empty dimension', () => {
    expect(predictor._getTop('intent')).toBeNull();
  });

  test('_getTopFromArray returns null for empty array', () => {
    expect(predictor._getTopFromArray([])).toBeNull();
  });

  test('_getTopFromArray sorts entry arrays', () => {
    const result = predictor._getTopFromArray([['a', 1], ['b', 3]]);
    expect(result).toBe('b');
  });

  test('_getTopFromArray counts occurrences for plain arrays', () => {
    const result = predictor._getTopFromArray(['x', 'y', 'x']);
    expect(result).toBe('x');
  });

  test('_countOccurrences counts values', () => {
    const counts = predictor._countOccurrences(['a', 'b', 'a']);
    expect(counts).toEqual({ a: 2, b: 1 });
  });

  test('predict combines confidence across dimensions', () => {
    predictor.learn('写代码', 'code', 'skill1', 'action1');
    const result = predictor.predict('写代码');
    expect(result.confidence).toBeGreaterThan(0);
  });
});
