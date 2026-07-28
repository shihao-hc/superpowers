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

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EmotionExpress (via BrainSystem.expressEmotion)', () => {
  test('expressEmotion returns result object', () => {
    const result = BrainSystem.expressEmotion('I love this', 'Thank you!');
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  test('returns natural flag', () => {
    const result = BrainSystem.expressEmotion('This is great!', 'ok');
    expect(result.natural).toBeDefined();
  });

  test('returns timestamp', () => {
    const result = BrainSystem.expressEmotion('hello', 'hi');
    expect(result.timestamp).toBeDefined();
    expect(typeof result.timestamp).toBe('number');
  });

  test('handles neutral input', () => {
    const result = BrainSystem.expressEmotion('the weather is ok', 'ok');
    expect(result).toBeDefined();
    expect(result.detected).toBeDefined();
  });

  test('handles Chinese input', () => {
    const result = BrainSystem.expressEmotion('我很开心', '好的');
    expect(result).toBeDefined();
  });
});
