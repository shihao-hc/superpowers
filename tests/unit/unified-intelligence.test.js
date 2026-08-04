jest.mock('../../src/core/DeepIntentAnalyzer', () => {
  return jest.fn().mockImplementation(() => ({
    analyze: jest.fn((_input, _context) => ({
      intent: 'code',
      confidence: 0.9,
      suggestions: ['refactor', 'test']
    }))
  }));
});

jest.mock('../../src/core/MultiDimensionPredictor', () => {
  return jest.fn().mockImplementation(() => ({
    predict: jest.fn(() => ({ confidence: 0.8, skill: { skill: 'optimize' } }))
  }));
});

jest.mock('../../src/core/EmotionExpress', () => ({
  express: jest.fn(() => ({ emotion: 'neutral', intensity: 0.5 }))
}));

const UnifiedIntelligence = require('../../src/core/UnifiedIntelligence');

describe('UnifiedIntelligence', () => {
  test('process runs full pipeline with default predictor', () => {
    const ui = new UnifiedIntelligence();
    const result = ui.process('优化性能');
    expect(result.processed).toBe(true);
    expect(result.intent.intent).toBe('code');
    expect(result.prediction.confidence).toBe(0.8);
    expect(result.emotion.emotion).toBe('neutral');
    expect(result.confidence).toBe(0.9);
    expect(result.timestamp).toEqual(expect.any(Number));
  });

  test('process includes proactive questions and suggestions when proactiveThinking present', () => {
    const proactiveThinking = {
      think: jest.fn(),
      generateQuestions: jest.fn(() => ['为什么这么问？']),
      generateSuggestions: jest.fn(() => ['主动建议'])
    };
    const ui = new UnifiedIntelligence({ proactiveThinking });
    const result = ui.process('帮我学习');
    expect(proactiveThinking.think).toHaveBeenCalledWith('帮我学习', {});
    expect(result.proactive.questions).toEqual(['为什么这么问？']);
    expect(result.proactive.suggestions).toEqual(['主动建议']);
  });

  test('process handles proactiveThinking without optional methods', () => {
    const proactiveThinking = { think: jest.fn() };
    const ui = new UnifiedIntelligence({ proactiveThinking });
    const result = ui.process('x');
    expect(result.proactive).toEqual({ questions: [], suggestions: [] });
  });

  test('process without proactiveThinking returns empty proactive', () => {
    const ui = new UnifiedIntelligence();
    const result = ui.process('x');
    expect(result.proactive).toEqual({ questions: [], suggestions: [] });
  });

  test('_combineSuggestions merges string and object suggestions, dedupes', () => {
    const ui = new UnifiedIntelligence();
    const result = ui._combineSuggestions(
      { suggestions: ['a', 'b'] },
      { suggestions: [{ name: 'b' }, { type: 'c' }, 'd'] },
      { skill: { skill: 'a' } }
    );
    expect(result).toEqual(['a', 'b', 'c', 'd']);
  });

  test('_combineSuggestions handles missing suggestion sources', () => {
    const ui = new UnifiedIntelligence();
    expect(ui._combineSuggestions({}, {}, {})).toEqual([]);
    expect(ui._combineSuggestions({}, { suggestions: [{ name: 'x' }] }, {})).toEqual(['x']);
  });

  test('_calculateConfidence takes max of intents and prediction', () => {
    const ui = new UnifiedIntelligence();
    expect(ui._calculateConfidence({ confidence: 0.5 }, { confidence: 0.7 })).toBe(0.7);
    expect(ui._calculateConfidence({ confidence: 0.9 }, { confidence: 0.2 })).toBe(0.9);
    expect(ui._calculateConfidence({}, {})).toBe(0);
  });

  test('_analyzeIntent delegates to DeepIntentAnalyzer', () => {
    const ui = new UnifiedIntelligence();
    const result = ui._analyzeIntent('hello', { user: 1 });
    expect(result.intent).toBe('code');
  });

  test('_predict delegates to predictor', () => {
    const ui = new UnifiedIntelligence();
    expect(ui._predict('x', {}).skill.skill).toBe('optimize');
  });

  test('_expressEmotion delegates to EmotionExpress', () => {
    const ui = new UnifiedIntelligence();
    const result = ui._expressEmotion('你好', '');
    expect(result.emotion).toBe('neutral');
  });
});
