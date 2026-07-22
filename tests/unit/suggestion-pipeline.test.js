const {
  SuggestionPipeline,
  SuggestionType,
  PipelineStage,
  GenerateStage,
  FilterStage,
  RankStage,
  PresentStage,
  SpeculativeExecutor,
  createDefaultPipeline
} = require('../../src/agent/SuggestionPipeline');

describe('SuggestionPipeline', () => {
  let pipeline;
  let mockLlm;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockLlm = { generate: jest.fn() };
    pipeline = new SuggestionPipeline({ llmAdapter: mockLlm });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should set default values', () => {
      expect(pipeline.stages).toBeInstanceOf(Map);
      expect(pipeline.stages.size).toBe(0);
      expect(pipeline.llmAdapter).toBe(mockLlm);
      expect(pipeline.toolExecutor).toBeUndefined();
      expect(pipeline.enabled).toBe(true);
      expect(pipeline.speculator).toBeNull();
    });

    test('should accept custom options', () => {
      const toolExec = { execute: jest.fn() };
      const p = new SuggestionPipeline({ llmAdapter: mockLlm, toolExecutor: toolExec, enabled: false });
      expect(p.toolExecutor).toBe(toolExec);
      expect(p.enabled).toBe(false);
      expect(p.speculator).toBeInstanceOf(SpeculativeExecutor);
    });
  });

  describe('use', () => {
    test('should add PipelineStage instance', () => {
      const stage = new PipelineStage('test');
      pipeline.use('test', stage);
      expect(pipeline.stages.get('test')).toBe(stage);
    });

    test('should add function as stage', () => {
      const fn = jest.fn();
      pipeline.use('fn', fn);
      const stored = pipeline.stages.get('fn');
      expect(stored.name).toBe('fn');
      expect(stored.process).toBe(fn);
      expect(stored.enabled).toBe(true);
    });

    test('should skip non-PipelineStage non-function', () => {
      pipeline.use('invalid', 'string');
      expect(pipeline.stages.has('invalid')).toBe(false);
    });

    test('should be chainable', () => {
      const stage = new PipelineStage('a');
      const ret = pipeline.use('a', stage);
      expect(ret).toBe(pipeline);
    });
  });

  describe('useGenerate', () => {
    test('should add GenerateStage', () => {
      pipeline.useGenerate(mockLlm);
      const stage = pipeline.stages.get('generate');
      expect(stage).toBeInstanceOf(GenerateStage);
      expect(stage.llmAdapter).toBe(mockLlm);
    });
  });

  describe('useFilter', () => {
    test('should add FilterStage with options', () => {
      pipeline.useFilter({ blacklist: ['bad'], minConfidence: 0.7 });
      const stage = pipeline.stages.get('filter');
      expect(stage).toBeInstanceOf(FilterStage);
      expect(stage.blacklist).toEqual(['bad']);
      expect(stage.minConfidence).toBe(0.7);
    });
  });

  describe('useRank', () => {
    test('should add RankStage with options', () => {
      pipeline.useRank({ recencyWeight: 0.1, relevanceWeight: 0.8, confidenceWeight: 0.1 });
      const stage = pipeline.stages.get('rank');
      expect(stage).toBeInstanceOf(RankStage);
      expect(stage.priorityWeights.recency).toBe(0.1);
      expect(stage.priorityWeights.relevance).toBe(0.8);
    });
  });

  describe('usePresent', () => {
    test('should add PresentStage', () => {
      pipeline.usePresent({ maxDisplay: 3, format: 'markdown' });
      const stage = pipeline.stages.get('present');
      expect(stage).toBeInstanceOf(PresentStage);
      expect(stage.maxDisplay).toBe(3);
      expect(stage.format).toBe('markdown');
    });
  });

  describe('enable/disable', () => {
    test('should enable a stage', () => {
      const stage = new PipelineStage('test');
      stage.enabled = false;
      pipeline.use('test', stage);
      pipeline.enable('test');
      expect(stage.enabled).toBe(true);
    });

    test('should disable a stage', () => {
      const stage = new PipelineStage('test');
      pipeline.use('test', stage);
      pipeline.disable('test');
      expect(stage.enabled).toBe(false);
    });

    test('should not throw for missing stage on enable/disable', () => {
      expect(() => pipeline.enable('nonexistent')).not.toThrow();
      expect(() => pipeline.disable('nonexistent')).not.toThrow();
    });

    test('should be chainable', () => {
      const stage = new PipelineStage('a');
      pipeline.use('a', stage);
      expect(pipeline.enable('a')).toBe(pipeline);
      expect(pipeline.disable('a')).toBe(pipeline);
    });
  });

  describe('getStages', () => {
    test('should return stage list', () => {
      pipeline.useGenerate(mockLlm);
      pipeline.useFilter();
      const stages = pipeline.getStages();
      expect(stages).toHaveLength(2);
      expect(stages[0]).toEqual({ name: 'generate', enabled: true });
      expect(stages[1]).toEqual({ name: 'filter', enabled: true });
    });
  });

  describe('clear', () => {
    test('should clear all stages', () => {
      pipeline.useGenerate(mockLlm);
      expect(pipeline.stages.size).toBe(1);
      pipeline.clear();
      expect(pipeline.stages.size).toBe(0);
    });

    test('should be chainable', () => {
      expect(pipeline.clear()).toBe(pipeline);
    });
  });

  describe('destroy', () => {
    test('should clear stages and remove listeners', () => {
      pipeline.useGenerate(mockLlm);
      const handler = jest.fn();
      pipeline.on('complete', handler);
      pipeline.destroy();
      expect(pipeline.stages.size).toBe(0);
      expect(pipeline.listenerCount('complete')).toBe(0);
    });

    test('should be chainable', () => {
      expect(pipeline.destroy()).toBe(pipeline);
    });
  });

  describe('execute', () => {
    test('should return context when disabled', async () => {
      pipeline.enabled = false;
      const ctx = { message: 'hello' };
      const result = await pipeline.execute(ctx);
      expect(result).toBe(ctx);
    });

    test('should truncate long messages', async () => {
      const long = 'x'.repeat(6000);
      const ctx = { message: long };
      const stageFn = jest.fn().mockResolvedValue({ suggestions: [] });
      pipeline.use('s1', stageFn);
      await pipeline.execute(ctx);
      expect(stageFn).toHaveBeenCalledWith(
        expect.objectContaining({ message: long.substring(0, 5000) })
      );
    });

    test('should execute stages in order', async () => {
      const order = [];
      pipeline.use('s1', async (ctx) => { order.push('s1'); return { ...ctx, a: 1 }; });
      pipeline.use('s2', async (ctx) => { order.push('s2'); return { ...ctx, b: 2 }; });
      await pipeline.execute({ message: 'test' });
      expect(order).toEqual(['s1', 's2']);
    });

    test('should skip disabled stages', async () => {
      const stageFn = jest.fn(async (_ctx) => ({}));
      pipeline.use('s1', stageFn);
      pipeline.disable('s1');
      await pipeline.execute({ message: 'test' });
      expect(stageFn).not.toHaveBeenCalled();
    });

    test('should limit suggestions at end', async () => {
      const many = Array.from({ length: 20 }, (_, i) => ({ text: `s${i}`, confidence: 0.9 }));
      pipeline.use('s1', async (ctx) => ({ ...ctx, suggestions: many }));
      const result = await pipeline.execute({ message: 'test' });
      expect(result.suggestions).toHaveLength(10);
    });

    test('should emit stageStart and stageComplete events', async () => {
      const stageFn = jest.fn().mockResolvedValue({ suggestions: [{ text: 'a' }] });
      pipeline.use('s1', stageFn);
      const onStart = jest.fn();
      const onComplete = jest.fn();
      pipeline.on('stageStart', onStart);
      pipeline.on('stageComplete', onComplete);
      await pipeline.execute({ message: 'test' });
      expect(onStart).toHaveBeenCalledWith({ stage: 's1' });
      expect(onComplete).toHaveBeenCalledWith({ stage: 's1', suggestions: 1 });
    });

    test('should emit stageError and break on stage failure', async () => {
      pipeline.use('s1', async () => { throw new Error('fail'); });
      pipeline.use('s2', jest.fn().mockResolvedValue({}));
      const onError = jest.fn();
      const onComplete = jest.fn();
      pipeline.on('stageError', onError);
      pipeline.on('complete', onComplete);
      const result = await pipeline.execute({ message: 'test' });
      expect(onError).toHaveBeenCalledWith({ stage: 's1', error: 'fail' });
      expect(result.suggestions).toEqual([]);
      expect(onComplete).toHaveBeenCalled();
    });

    test('should handle non-string message', async () => {
      pipeline.use('s1', async (ctx) => ({ ...ctx, suggestions: [] }));
      const result = await pipeline.execute({ message: 123 });
      expect(result.message).toBe('');
    });

    test('should emit complete event', async () => {
      pipeline.use('s1', async (ctx) => ({ ...ctx, suggestions: [{ text: 'a' }] }));
      const onComplete = jest.fn();
      pipeline.on('complete', onComplete);
      const result = await pipeline.execute({ message: 'test' });
      expect(onComplete).toHaveBeenCalledWith(result);
    });
  });

  describe('speculate', () => {
    test('should throw when SpeculativeExecutor not configured', async () => {
      await expect(pipeline.speculate('tool', 'input')).rejects.toThrow('SpeculativeExecutor not configured');
    });

    test('should return speculation result', async () => {
      const toolExec = { execute: jest.fn().mockResolvedValue({ ok: true }) };
      const p = new SuggestionPipeline({ llmAdapter: mockLlm, toolExecutor: toolExec });
      const result = await p.speculate('tool', 'input');
      expect(result.tool).toBe('tool');
      expect(result.input).toBe('input');
      expect(result.speculation).toEqual({
        predictedOutcome: 'success',
        confidence: 0.9,
        risks: [],
        estimatedTime: 1000
      });
      const execResult = await result.execute();
      expect(execResult).toEqual({ ok: true });
    });
  });

  describe('createDefaultPipeline', () => {
    test('should create pipeline with all default stages', () => {
      const toolExec = { execute: jest.fn() };
      const p = createDefaultPipeline(mockLlm, toolExec);
      expect(p).toBeInstanceOf(SuggestionPipeline);
      const stages = p.getStages();
      expect(stages.map((s) => s.name)).toEqual(['generate', 'filter', 'rank', 'present']);
      stages.forEach((s) => expect(s.enabled).toBe(true));
    });
  });
});

describe('PipelineStage', () => {
  test('should set name and enabled', () => {
    const stage = new PipelineStage('test');
    expect(stage.name).toBe('test');
    expect(stage.enabled).toBe(true);
  });

  test('process should throw by default', async () => {
    const stage = new PipelineStage('test');
    await expect(stage.process({})).rejects.toThrow('Must be implemented by subclass');
  });
});

describe('GenerateStage', () => {
  let stage;
  let mockLlm;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockLlm = { generate: jest.fn() };
    stage = new GenerateStage(mockLlm);
  });

  test('should return context when disabled', async () => {
    stage.enabled = false;
    const ctx = { prompt: 'test' };
    const result = await stage.process(ctx);
    expect(result).toBe(ctx);
  });

  test('should call llmAdapter.generate and parse suggestions', async () => {
    mockLlm.generate.mockResolvedValue('1. add tests\n2. fix bug\n3. refactor code');
    const result = await stage.process({ prompt: 'improve code', maxSuggestions: 5 });
    expect(mockLlm.generate).toHaveBeenCalledWith(
      'Generate 5 suggestions for: improve code',
      { maxTokens: 500, temperature: 0.7 }
    );
    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions[0].text).toBe('add tests');
    expect(result.suggestions[0].type).toBe(SuggestionType.TEST);
    expect(result.suggestions[0].confidence).toBe(0.8);
    expect(result.generatedAt).toBeDefined();
  });

  test('should handle llm failure gracefully', async () => {
    mockLlm.generate.mockRejectedValue(new Error('API error'));
    const result = await stage.process({ prompt: 'test' });
    expect(result.suggestions).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  test('parseSuggestions should parse numbered lines', () => {
    const text = '1. first\n2. second\n3. third';
    const parsed = stage.parseSuggestions(text);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].text).toBe('first');
    expect(parsed[1].text).toBe('second');
  });

  test('parseSuggestions should skip unnumbered lines', () => {
    const text = '1. first\nsome note\n2. second';
    const parsed = stage.parseSuggestions(text);
    expect(parsed).toHaveLength(2);
  });

  test('inferType should return TEST for test-related', () => {
    expect(stage.inferType('add unit tests')).toBe(SuggestionType.TEST);
  });

  test('inferType should return REFACTOR for refactor/improve', () => {
    expect(stage.inferType('refactor this module')).toBe(SuggestionType.REFACTOR);
    expect(stage.inferType('improve performance')).toBe(SuggestionType.REFACTOR);
  });

  test('inferType should return EXPLANATION for explain/what', () => {
    expect(stage.inferType('explain the logic')).toBe(SuggestionType.EXPLANATION);
    expect(stage.inferType('what does this do')).toBe(SuggestionType.EXPLANATION);
  });

  test('inferType should return CODE for backtick text', () => {
    expect(stage.inferType('`function foo()`')).toBe(SuggestionType.CODE);
  });

  test('inferType should return COMMAND as default', () => {
    expect(stage.inferType('run the build')).toBe(SuggestionType.COMMAND);
  });
});

describe('FilterStage', () => {
  let stage;

  test('should use default options', () => {
    stage = new FilterStage();
    expect(stage.blacklist).toEqual([]);
    expect(stage.minConfidence).toBe(0.5);
  });

  test('should limit blacklist size to 100', () => {
    const big = Array.from({ length: 200 }, (_, i) => `term${i}`);
    stage = new FilterStage({ blacklist: big });
    expect(stage.blacklist).toHaveLength(100);
  });

  test('should handle non-array blacklist', () => {
    stage = new FilterStage({ blacklist: 'string' });
    expect(stage.blacklist).toEqual([]);
  });

  test('should return context when disabled', async () => {
    stage = new FilterStage();
    stage.enabled = false;
    const ctx = { suggestions: [{ text: 'a', confidence: 0.9 }] };
    const result = await stage.process(ctx);
    expect(result).toBe(ctx);
  });

  test('should filter blacklisted suggestions', async () => {
    stage = new FilterStage({ blacklist: ['rm -rf'] });
    const result = await stage.process({
      suggestions: [
        { text: 'use rm -rf /', confidence: 0.9 },
        { text: 'safe command', confidence: 0.9 }
      ],
      history: []
    });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].text).toBe('safe command');
  });

  test('should filter low confidence suggestions', async () => {
    stage = new FilterStage({ minConfidence: 0.7 });
    const result = await stage.process({
      suggestions: [
        { text: 'good', confidence: 0.9 },
        { text: 'bad', confidence: 0.3 }
      ],
      history: []
    });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].text).toBe('good');
  });

  test('should filter duplicates against history', async () => {
    stage = new FilterStage();
    const result = await stage.process({
      suggestions: [
        { text: 'Add tests', confidence: 0.9 },
        { text: 'Fix bug', confidence: 0.9 }
      ],
      history: [{ text: 'Add tests' }, { text: 'other' }]
    });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].text).toBe('Fix bug');
  });

  test('should handle missing history gracefully', async () => {
    stage = new FilterStage();
    const result = await stage.process({
      suggestions: [{ text: 'a', confidence: 0.9 }, { text: 'b', confidence: 0.9 }]
    });
    expect(result.suggestions).toHaveLength(2);
  });

  test('isBlacklisted should match case-insensitively', () => {
    stage = new FilterStage({ blacklist: ['DROP TABLE'] });
    expect(stage.isBlacklisted('drop table users')).toBe(true);
  });

  test('isDuplicate should normalize and compare', () => {
    stage = new FilterStage();
    expect(stage.isDuplicate('  Add Tests  ', [{ text: 'add tests' }])).toBe(true);
    expect(stage.isDuplicate('New thing', [{ text: 'old thing' }])).toBe(false);
  });
});

describe('RankStage', () => {
  let stage;

  beforeEach(() => {
    stage = new RankStage({ recencyWeight: 0.3, relevanceWeight: 0.4, confidenceWeight: 0.3 });
  });

  test('should use default weights', () => {
    const s = new RankStage();
    expect(s.priorityWeights).toEqual({ recency: 0.3, relevance: 0.4, confidence: 0.3 });
  });

  test('should return context when disabled', async () => {
    stage.enabled = false;
    const ctx = { suggestions: [{ text: 'a', confidence: 0.9 }] };
    const result = await stage.process(ctx);
    expect(result).toBe(ctx);
  });

  test('should rank suggestions by score descending', async () => {
    const result = await stage.process({
      suggestions: [
        { text: 'low', confidence: 0.3 },
        { text: 'high', confidence: 0.9 }
      ],
      currentContext: { filePath: 'test.js', description: 'testing' }
    });
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0].text).toBe('high');
    expect(result.suggestions[1].text).toBe('low');
    expect(result.suggestions[0].score).toBeGreaterThan(result.suggestions[1].score);
    expect(result.rankedAt).toBeDefined();
  });

  test('calculateRelevance should return 0.5 when no context', () => {
    const score = stage.calculateRelevance({ text: 'foo' }, null);
    expect(score).toBe(0.5);
  });

  test('calculateRelevance should match words', () => {
    const score = stage.calculateRelevance(
      { text: 'test the login feature' },
      { filePath: 'login.js', description: 'test login' }
    );
    expect(score).toBeGreaterThan(0);
  });

  test('calculateScore should handle generatedAt', () => {
    const recent = stage.calculateScore({ text: 'a', confidence: 0.8, generatedAt: Date.now() - 1000 }, null);
    const old = stage.calculateScore({ text: 'b', confidence: 0.8, generatedAt: Date.now() - 7200000 }, null);
    expect(recent).toBeGreaterThan(old);
  });

  test('calculateScore should handle missing confidence', () => {
    const score = stage.calculateScore({ text: 'a' }, null);
    expect(score).toBeDefined();
  });

  test('calculateRelevance should handle missing description', () => {
    const score = stage.calculateRelevance(
      { text: 'test feature' },
      { filePath: 'login.js' }
    );
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('PresentStage', () => {
  let stage;

  beforeEach(() => {
    stage = new PresentStage({ maxDisplay: 3 });
  });

  test('should use default options', () => {
    const s = new PresentStage();
    expect(s.maxDisplay).toBe(5);
    expect(s.format).toBe('markdown');
  });

  test('should return context when disabled', async () => {
    stage.enabled = false;
    const ctx = { suggestions: [{ text: 'a' }] };
    const result = await stage.process(ctx);
    expect(result).toBe(ctx);
  });

  test('should limit display to maxDisplay', async () => {
    const suggestions = Array.from({ length: 10 }, (_, i) => ({ text: `s${i}`, confidence: 0.9 }));
    const result = await stage.process({ suggestions });
    expect(result.display).toHaveLength(3);
    expect(result.presentedAt).toBeDefined();
  });

  test('formatMarkdown should produce markdown', () => {
    const suggestions = [
      { text: 'Add tests', confidence: 0.9 },
      { text: 'Fix bug', confidence: 0.5 }
    ];
    const md = stage.formatMarkdown(suggestions);
    expect(md).toContain('## Suggestions');
    expect(md).toContain('1. Add tests');
    expect(md).toContain('2. Fix bug');
    expect(md).toContain('Confidence: 90%');
    expect(md).toContain('Confidence: 50%');
  });

  test('formatMarkdown should handle missing confidence', () => {
    const md = stage.formatMarkdown([{ text: 'simple' }]);
    expect(md).toContain('1. simple');
    expect(md).not.toContain('Confidence');
  });
});

describe('SpeculativeExecutor', () => {
  let exec;
  let mockTool;

  beforeEach(() => {
    mockTool = { execute: jest.fn().mockResolvedValue({ ok: true }) };
    exec = new SpeculativeExecutor(mockTool);
  });

  test('should return speculation result', async () => {
    const result = await exec.speculate('tool_name', 'some_input');
    expect(result.tool).toBe('tool_name');
    expect(result.input).toBe('some_input');
    expect(result.speculation).toEqual({
      predictedOutcome: 'success',
      confidence: 0.9,
      risks: [],
      estimatedTime: 1000
    });
  });

  test('execute should delegate to toolExecutor', async () => {
    const result = await exec.speculate('t', 'i');
    const execResult = await result.execute();
    expect(mockTool.execute).toHaveBeenCalledWith('t', 'i');
    expect(execResult).toEqual({ ok: true });
  });
});

describe('SuggestionPipeline additional coverage', () => {
  test('should handle undefined options', () => {
    const p = new SuggestionPipeline(undefined);
    expect(p.speculator).toBeNull();
    expect(p.enabled).toBe(true);
  });

  test('should register rank stage without options', () => {
    const p = new SuggestionPipeline({});
    p.useRank();
    expect(p.stages.has('rank')).toBe(true);
    const stage = p.stages.get('rank');
    expect(stage).toBeInstanceOf(RankStage);
  });

  test('should register present stage without options', () => {
    const p = new SuggestionPipeline({});
    p.usePresent();
    expect(p.stages.has('present')).toBe(true);
    const stage = p.stages.get('present');
    expect(stage).toBeInstanceOf(PresentStage);
  });
});
