const BrainSystem = require('../../src/core/BrainSystem');
const DeepIntentAnalyzer = require('../../src/core/DeepIntentAnalyzer');

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

describe('DeepIntentAnalyzer (via BrainSystem.analyzeIntent)', () => {
  test('analyzes code-related intent', () => {
    const result = BrainSystem.analyzeIntent('fix the bug in auth.js');
    expect(result).toBeDefined();
    expect(result.intent).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  test('analyzes security intent', () => {
    const result = BrainSystem.analyzeIntent('check for SQL injection vulnerabilities');
    expect(result.intent).toBeDefined();
  });

  test('analyzes testing intent', () => {
    const result = BrainSystem.analyzeIntent('write unit tests for the login function');
    expect(result.intent).toBeDefined();
  });

  test('analyzes deployment intent', () => {
    const result = BrainSystem.analyzeIntent('deploy to production server');
    expect(result.intent).toBeDefined();
  });

  test('analyzes refactoring intent', () => {
    const result = BrainSystem.analyzeIntent('refactor the database connection code');
    expect(result.intent).toBeDefined();
  });

  test('analyzes review intent', () => {
    const result = BrainSystem.analyzeIntent('review the pull request');
    expect(result.intent).toBeDefined();
  });

  test('handles ambiguous input', () => {
    const result = BrainSystem.analyzeIntent('hello');
    expect(result).toBeDefined();
    expect(result.intent).toBeDefined();
  });

  test('handles empty input', () => {
    const result = BrainSystem.analyzeIntent('');
    expect(result).toBeDefined();
  });

  test('analyzes Chinese input', () => {
    const result = BrainSystem.analyzeIntent('修复认证模块的bug');
    expect(result).toBeDefined();
    expect(result.intent).toBeDefined();
  });

  test('returns method field', () => {
    const result = BrainSystem.analyzeIntent('fix the SQL injection in user search');
    expect(result.method).toBeDefined();
  });
});

describe('DeepIntentAnalyzer (direct class)', () => {
  let analyzer;

  beforeEach(() => {
    jest.clearAllMocks();
    analyzer = new DeepIntentAnalyzer();
  });

  test('analyzes code intent via pattern match', () => {
    const result = analyzer.analyze('写一个函数处理数据');
    expect(result.intent).toBe('code_create');
    expect(result.method).toBe('pattern');
    expect(result.confidence).toBe(0.8);
  });

  test('analyzes learn intent via keyword match', () => {
    const result = analyzer.analyze('想理解深度学习的原理');
    expect(result.intent).toBe('learn_principle');
  });

  test('boosts confidence when lastIntent matches', () => {
    analyzer.analyze('写一个函数');
    const result = analyzer.analyze('写一个类', { lastIntent: 'code_create' });
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });

  test('clamps confidence boost to 0.95', () => {
    analyzer._currentIntent = 'code_create';
    const result = analyzer.analyze('写一个函数', { lastIntent: 'code_create' });
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });

  test('does not boost when lastIntent differs', () => {
    analyzer.analyze('写一个函数');
    const result = analyzer.analyze('修复这个bug', { lastIntent: 'learn_method' });
    expect(result.confidence).toBe(0.8);
  });

  test('shifts context stack when over 10 entries', () => {
    for (let i = 0; i < 12; i++) {
      analyzer.analyze(`input ${i}`);
    }
    expect(analyzer._contextStack.length).toBeLessThanOrEqual(10);
    expect(analyzer.getContextHistory().length).toBe(10);
  });

  test('getCurrentIntent returns current intent and confidence', () => {
    analyzer.analyze('修复这个bug');
    const status = analyzer.getCurrentIntent();
    expect(status.intent).toBe('debug_fix');
    expect(typeof status.confidence).toBe('number');
  });

  test('getContextHistory returns context stack', () => {
    analyzer.analyze('hello world');
    const history = analyzer.getContextHistory();
    expect(history).toHaveLength(1);
    expect(history[0].input).toBe('hello world');
  });

  test('returns empty suggestions for unknown intent', () => {
    const result = analyzer.analyze('zzz unknown input');
    expect(result.suggestions).toEqual([]);
  });
});
