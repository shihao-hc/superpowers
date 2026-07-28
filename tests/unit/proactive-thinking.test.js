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
