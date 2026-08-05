const mockLLMAdapter = jest.fn();
const mockValidateURL = jest.fn();

class MockLLMAdapter {
  constructor(...args) {
    return mockLLMAdapter(...args);
  }
}

jest.mock('../../src/agent/LLMAdapter', () => ({
  LLMAdapter: MockLLMAdapter,
}));

jest.mock('../../src/utils/SSRFValidator', () => ({
  validateURL: (...args) => mockValidateURL(...args),
}));

const InferenceBridge = require('../../src/localInferencing/InferBridge');

const makeAdapter = (overrides = {}) => ({
  generateWithRetry: jest.fn(),
  streamGenerate: jest.fn(),
  enableStreaming: false,
  ...overrides,
});

describe('InferenceBridge', () => {
  let consoleLogSpy;
  let consoleWarnSpy;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.INFER_ENDPOINT;
    delete process.env.USE_LLM_ADAPTER;
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_BASE_URL;
    mockLLMAdapter.mockReset();
    mockValidateURL.mockReset();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    jest.restoreAllMocks();
  });

  test('constructor defaults to local engine config', () => {
    const bridge = new InferenceBridge();
    expect(bridge.useLLMAdapter).toBe(false);
    expect(bridge.externalEndpoint).toBeNull();
    expect(bridge.provider).toBe('ollama');
    expect(bridge.model).toBe('llama3.2');
    expect(bridge.baseUrl).toBe('http://localhost:11434');
  });

  test('constructor reads env config', () => {
    process.env.USE_LLM_ADAPTER = 'true';
    process.env.LLM_PROVIDER = 'openai';
    process.env.LLM_MODEL = 'gpt-4';
    process.env.LLM_BASE_URL = 'http://api.example.com';
    const bridge = new InferenceBridge();
    expect(bridge.useLLMAdapter).toBe(true);
    expect(bridge.provider).toBe('openai');
    expect(bridge.model).toBe('gpt-4');
    expect(bridge.baseUrl).toBe('http://api.example.com');
  });

  test('loadModel uses LLMAdapter when enabled', async () => {
    process.env.USE_LLM_ADAPTER = 'true';
    const adapter = makeAdapter();
    mockLLMAdapter.mockReturnValue(adapter);
    const bridge = new InferenceBridge();
    const result = await bridge.loadModel();
    expect(result).toBe(true);
    expect(bridge.modelLoaded).toBe(true);
    expect(bridge.llmAdapter).toBe(adapter);
    expect(mockLLMAdapter).toHaveBeenCalledWith({
      provider: 'ollama',
      model: 'llama3.2',
      baseUrl: 'http://localhost:11434',
      enableStreaming: false,
      maxRetries: 3,
    });
  });

  test('loadModel falls back when LLMAdapter init throws', async () => {
    process.env.USE_LLM_ADAPTER = 'true';
    mockLLMAdapter.mockImplementation(() => {
      throw new Error('init failed');
    });
    const bridge = new InferenceBridge();
    await bridge.loadModel();
    expect(bridge.useLLMAdapter).toBe(false);
    expect(bridge.modelLoaded).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('falling back'),
      'init failed'
    );
  });

  test('loadModel uses external endpoint when allowed', async () => {
    process.env.INFER_ENDPOINT = 'http://api.example.com/infer';
    mockValidateURL.mockReturnValue({ allowed: true, reason: '' });
    const bridge = new InferenceBridge();
    const result = await bridge.loadModel();
    expect(result).toBe(true);
    expect(bridge.modelLoaded).toBe(true);
    expect(mockValidateURL).toHaveBeenCalledWith('http://api.example.com/infer', {
      allowPrivate: false,
      allowLoopback: false,
    });
  });

  test('loadModel blocks external endpoint when not allowed', async () => {
    process.env.INFER_ENDPOINT = 'http://169.254.169.254/infer';
    mockValidateURL.mockReturnValue({ allowed: false, reason: 'private-ip' });
    const bridge = new InferenceBridge();
    await bridge.loadModel();
    expect(bridge.externalEndpoint).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('blocked')
    );
    expect(bridge.modelLoaded).toBe(true);
  });

  test('infer uses LLMAdapter result.content when response missing', async () => {
    process.env.USE_LLM_ADAPTER = 'true';
    const adapter = makeAdapter({
      generateWithRetry: jest.fn().mockResolvedValue({ content: 'content answer' }),
    });
    mockLLMAdapter.mockReturnValue(adapter);
    const bridge = new InferenceBridge();
    await bridge.loadModel();
    const result = await bridge.infer('hello');
    expect(result.text).toBe('content answer');
  });

  test('infer uses String(result) when response and content missing', async () => {
    process.env.USE_LLM_ADAPTER = 'true';
    const adapter = makeAdapter({
      generateWithRetry: jest.fn().mockResolvedValue({ tokens: 7 }),
    });
    mockLLMAdapter.mockReturnValue(adapter);
    const bridge = new InferenceBridge();
    await bridge.loadModel();
    const result = await bridge.infer('hello');
    expect(result.text).toBe('[object Object]');
    expect(result.tokens).toBe(7);
  });

  test('loadModel falls back to LocalEngine', async () => {
    const bridge = new InferenceBridge();
    const result = await bridge.loadModel();
    expect(result).toBe(true);
    expect(bridge.engine).toBeDefined();
    expect(bridge.modelLoaded).toBe(true);
  });

  test('infer uses LLMAdapter generateWithRetry', async () => {
    process.env.USE_LLM_ADAPTER = 'true';
    const adapter = makeAdapter({
      generateWithRetry: jest.fn().mockResolvedValue({
        response: 'llm answer',
        tokens: 42,
      }),
    });
    mockLLMAdapter.mockReturnValue(adapter);
    const bridge = new InferenceBridge();
    await bridge.loadModel();
    const result = await bridge.infer('hello', { temperature: 0.3, maxTokens: 100 });
    expect(result).toEqual({
      ok: true,
      text: 'llm answer',
      tokens: 42,
      provider: 'ollama',
    });
    expect(adapter.generateWithRetry).toHaveBeenCalledWith('hello', {
      temperature: 0.3,
      maxTokens: 100,
    });
  });

  test('infer falls back to model-not-loaded when LLMAdapter throws', async () => {
    process.env.USE_LLM_ADAPTER = 'true';
    const adapter = makeAdapter({
      generateWithRetry: jest.fn().mockRejectedValue(new Error('timeout')),
    });
    mockLLMAdapter.mockReturnValue(adapter);
    const bridge = new InferenceBridge();
    await bridge.loadModel();
    const result = await bridge.infer('hi');
    expect(result).toEqual({ ok: false, text: 'model-not-loaded' });
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('LLMAdapter error'),
      'timeout'
    );
  });

  test('infer uses external endpoint via fetch', async () => {
    process.env.INFER_ENDPOINT = 'http://api.example.com/infer';
    mockValidateURL.mockReturnValue({ allowed: true, reason: '' });
    const mockFetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({ ok: true, text: 'external answer' }),
    });
    global.fetch = mockFetch;
    const bridge = new InferenceBridge();
    await bridge.loadModel();
    const result = await bridge.infer('question');
    expect(result).toEqual({ ok: true, text: 'external answer' });
    expect(mockFetch).toHaveBeenCalledWith('http://api.example.com/infer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'question' }),
    });
    delete global.fetch;
  });

  test('infer returns error when external fetch throws', async () => {
    process.env.INFER_ENDPOINT = 'http://api.example.com/infer';
    mockValidateURL.mockReturnValue({ allowed: true, reason: '' });
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    const bridge = new InferenceBridge();
    await bridge.loadModel();
    const result = await bridge.infer('question');
    expect(result).toEqual({
      ok: false,
      text: 'external-infer-error',
      error: 'network down',
    });
    delete global.fetch;
  });

  test('infer returns model-not-loaded when no engine', async () => {
    const bridge = new InferenceBridge();
    const result = await bridge.infer('hello');
    expect(result).toEqual({ ok: false, text: 'model-not-loaded' });
  });

  test('infer uses LocalEngine', async () => {
    const bridge = new InferenceBridge();
    await bridge.loadModel();
    const result = await bridge.infer('本地推理');
    expect(result).toEqual({ ok: true, text: 'LocalEngine response: 本地推理' });
  });

  test('streamInfer yields content events from LLMAdapter streaming', async () => {
    process.env.USE_LLM_ADAPTER = 'true';
    async function* streamGen() {
      yield { type: 'content', delta: 'par', done: false };
      yield { type: 'content', delta: 't', done: false };
      yield { type: 'done', content: 'part', done: true };
    }
    const adapter = makeAdapter({
      enableStreaming: true,
      streamGenerate: jest.fn().mockImplementation(streamGen),
    });
    mockLLMAdapter.mockReturnValue(adapter);
    const bridge = new InferenceBridge();
    await bridge.loadModel();
    const events = [];
    for await (const ev of bridge.streamInfer('text')) {
      events.push(ev);
    }
    expect(events).toEqual([
      { ok: true, delta: 'par', done: false },
      { ok: true, delta: 't', done: false },
      { ok: true, text: 'part', done: true },
    ]);
  });

  test('streamInfer yields error events', async () => {
    process.env.USE_LLM_ADAPTER = 'true';
    async function* streamGen() {
      yield { type: 'error', error: 'stream error' };
    }
    const adapter = makeAdapter({
      enableStreaming: true,
      streamGenerate: jest.fn().mockImplementation(streamGen),
    });
    mockLLMAdapter.mockReturnValue(adapter);
    const bridge = new InferenceBridge();
    await bridge.loadModel();
    const events = [];
    for await (const ev of bridge.streamInfer('text')) {
      events.push(ev);
    }
    expect(events).toEqual([{ ok: false, error: 'stream error' }]);
  });

  test('streamInfer catches LLMAdapter stream exceptions', async () => {
    process.env.USE_LLM_ADAPTER = 'true';
    const adapter = makeAdapter({
      enableStreaming: true,
      streamGenerate: jest.fn().mockImplementation(async function* () {
        yield { type: 'content', delta: 'x', done: false };
        throw new Error('stream crash');
      }),
    });
    mockLLMAdapter.mockReturnValue(adapter);
    const bridge = new InferenceBridge();
    await bridge.loadModel();
    const events = [];
    for await (const ev of bridge.streamInfer('text')) {
      events.push(ev);
    }
    expect(events).toEqual([
      { ok: true, delta: 'x', done: false },
      { ok: false, error: 'stream crash' },
    ]);
  });

  test('streamInfer delegates to infer for non-streaming path', async () => {
    const bridge = new InferenceBridge();
    await bridge.loadModel();
    const events = [];
    for await (const ev of bridge.streamInfer('hello')) {
      events.push(ev);
    }
    expect(events).toEqual([{ ok: true, text: 'LocalEngine response: hello', done: true }]);
  });

  test('getStatus reports local engine', () => {
    const bridge = new InferenceBridge();
    expect(bridge.getStatus()).toEqual({
      provider: 'local',
      model: 'llama3.2',
      loaded: false,
      streaming: false,
    });
  });

  test('getStatus reports llm adapter provider', async () => {
    process.env.USE_LLM_ADAPTER = 'true';
    process.env.LLM_PROVIDER = 'deepseek';
    mockLLMAdapter.mockReturnValue(makeAdapter({ enableStreaming: true }));
    const bridge = new InferenceBridge();
    await bridge.loadModel();
    expect(bridge.getStatus()).toEqual({
      provider: 'deepseek',
      model: 'llama3.2',
      loaded: true,
      streaming: true,
    });
  });

  test('getStatus reports external endpoint', async () => {
    process.env.INFER_ENDPOINT = 'http://api.example.com/infer';
    mockValidateURL.mockReturnValue({ allowed: true, reason: '' });
    const bridge = new InferenceBridge();
    await bridge.loadModel();
    expect(bridge.getStatus().provider).toBe('external');
  });
});
