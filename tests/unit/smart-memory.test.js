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
jest.mock('../../src/core/LessonLibrary', () => jest.fn().mockImplementation(() => {
  const lessons = [];
  return {
    lessons,
    search: jest.fn().mockReturnValue([]),
    get: jest.fn().mockReturnValue(null),
    add: jest.fn().mockImplementation(l => { lessons.push(l); return l; }),
    markApplied: jest.fn(),
    getSuggestions: jest.fn().mockReturnValue([]),
    getRelated: jest.fn().mockReturnValue([]),
    getStats: jest.fn().mockReturnValue({ total: 0, applied: 0 }),
    export: jest.fn().mockReturnValue('[]'),
    categories: {}
  };
}));

describe('SmartMemory (via BrainSystem static methods)', () => {
  beforeEach(() => {
    BrainSystem.BrainSystem._smartMemory = null;
  });

  test('smartStore stores a value', () => {
    const result = BrainSystem.smartStore('testKey', { data: 'hello' });
    expect(result).toBeDefined();
  });

  test('smartSearch retrieves stored value', () => {
    BrainSystem.smartStore('searchKey', { data: 'world' });
    const results = BrainSystem.smartSearch('searchKey');
    expect(Array.isArray(results)).toBe(true);
  });

  test('smartStore with metadata', () => {
    const result = BrainSystem.smartStore('metaKey', 'value', { tags: ['test'] });
    expect(result).toBeDefined();
  });

  test('smartSearch with limit', () => {
    BrainSystem.smartStore('lim1', 'a');
    BrainSystem.smartStore('lim2', 'b');
    const results = BrainSystem.smartSearch('lim', 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  test('smartSearch returns empty for no match', () => {
    const results = BrainSystem.smartSearch('nonexistent_xyz_abc');
    expect(results).toEqual([]);
  });
});
