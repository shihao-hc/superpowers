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
