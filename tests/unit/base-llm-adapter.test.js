const { BaseLLMAdapter, OpenAIAdapter, DeepSeekAdapter, GoogleAdapter, DashScopeAdapter, OpenClawAdapter, createLLMAdapter } = require('../../src/multiagent/patterns/BaseLLMAdapter');
const { EventEmitter } = require('events');
const http = require('http');
const https = require('https');

afterEach(() => {
  jest.restoreAllMocks();
});

describe('BaseLLMAdapter', () => {
  describe('constructor', () => {
    test('uses defaults when no config provided', () => {
      const adapter = new BaseLLMAdapter();
      expect(adapter.config.model).toBe('gpt-3.5-turbo');
      expect(adapter.config.temperature).toBe(0.7);
      expect(adapter.config.max_tokens).toBe(4096);
      expect(adapter.config.timeout).toBe(120000);
      expect(adapter.type).toBe('base');
    });

    test('merges custom config', () => {
      const adapter = new BaseLLMAdapter({ model: 'gpt-4', temperature: 0.3, max_tokens: 8192 });
      expect(adapter.config.model).toBe('gpt-4');
      expect(adapter.config.temperature).toBe(0.3);
      expect(adapter.config.max_tokens).toBe(8192);
    });

    test('allows zero temperature', () => {
      const adapter = new BaseLLMAdapter({ temperature: 0 });
      expect(adapter.config.temperature).toBe(0);
    });
  });

  describe('generate', () => {
    test('throws not implemented', async () => {
      const adapter = new BaseLLMAdapter();
      await expect(adapter.generate([{ role: 'user', content: 'hi' }]))
        .rejects.toThrow('generate() must be implemented by subclass');
    });
  });

  describe('chat', () => {
    test('wraps prompt in messages and calls generate', async () => {
      const adapter = new BaseLLMAdapter();
      const spy = jest.spyOn(adapter, 'generate').mockResolvedValue({ content: 'ok' });
      const result = await adapter.chat('hello');
      expect(spy).toHaveBeenCalledWith([{ role: 'user', content: 'hello' }], {});
      expect(result).toEqual({ content: 'ok' });
      spy.mockRestore();
    });
  });

  describe('stream', () => {
    test('throws not implemented', async () => {
      const adapter = new BaseLLMAdapter();
      await expect(adapter.stream([], () => {}))
        .rejects.toThrow('stream() must be implemented by subclass');
    });
  });

  describe('getType', () => {
    test('returns type', () => {
      expect(new BaseLLMAdapter().getType()).toBe('base');
    });
  });

  describe('getConfig', () => {
    test('returns a copy', () => {
      const adapter = new BaseLLMAdapter({ model: 'test' });
      const cfg = adapter.getConfig();
      cfg.model = 'mutated';
      expect(adapter.config.model).toBe('test');
    });
  });
});

describe('OpenAIAdapter', () => {
  test('sets type to openai and default model', () => {
    const adapter = new OpenAIAdapter({ apiKey: 'test' });
    expect(adapter.type).toBe('openai');
    expect(adapter.config.model).toBe('gpt-3.5-turbo');
  });

  test('constructs with default options', () => {
    const adapter = new OpenAIAdapter();
    expect(adapter.type).toBe('openai');
    expect(adapter.config.model).toBe('gpt-3.5-turbo');
    expect(adapter.config.baseUrl).toContain('api.openai.com');
  });

  describe('_formatMessages', () => {
    test('wraps string in role user', () => {
      const adapter = new OpenAIAdapter({ apiKey: 'test' });
      expect(adapter._formatMessages('hi')).toEqual([{ role: 'user', content: 'hi' }]);
    });

    test('maps array of strings', () => {
      const adapter = new OpenAIAdapter({ apiKey: 'test' });
      const result = adapter._formatMessages(['a', 'b']);
      expect(result).toEqual([
        { role: 'user', content: 'a' },
        { role: 'user', content: 'b' }
      ]);
    });

    test('passes through objects with defaults', () => {
      const adapter = new OpenAIAdapter({ apiKey: 'test' });
      const result = adapter._formatMessages([{ content: 'x' }]);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toBe('x');
    });

    test('stringifies non-string/non-object messages', () => {
      const adapter = new OpenAIAdapter({ apiKey: 'test' });
      const result = adapter._formatMessages([42]);
      expect(result[0]).toEqual({ role: 'user', content: '42' });
    });
  });

  describe('_parseResponse', () => {
    test('extracts content, usage, model from OpenAI format', () => {
      const adapter = new OpenAIAdapter({ apiKey: 'test', model: 'gpt-4' });
      const result = adapter._parseResponse({
        choices: [{ message: { content: 'hello' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        model: 'gpt-4'
      });
      expect(result.content).toBe('hello');
      expect(result.usage.prompt_tokens).toBe(10);
      expect(result.model).toBe('gpt-4');
      expect(result.finishReason).toBeUndefined();
    });

    test('extracts finish_reason', () => {
      const adapter = new OpenAIAdapter({ apiKey: 'test' });
      const result = adapter._parseResponse({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }]
      });
      expect(result.finishReason).toBe('stop');
    });

    test('extracts empty content when message content missing', () => {
      const adapter = new OpenAIAdapter({ apiKey: 'test' });
      const result = adapter._parseResponse({
        choices: [{ message: {} }]
      });
      expect(result.content).toBe('');
    });
  });

  describe('generate', () => {
    test('throws when request fails', async () => {
      const adapter = new OpenAIAdapter({ apiKey: 'test', baseUrl: 'http://localhost:1' });
      await expect(adapter.generate([{ role: 'user', content: 'hi' }]))
        .rejects.toThrow();
    });
  });
});

describe('OpenAIAdapter temperature resolution', () => {
  test('uses options.temperature when config temperature is null', async () => {
    const { req, impl } = mockResponse({ statusCode: 200, chunks: ['{"choices":[{"message":{"content":"x"}}]}'] });
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'http://localhost:9999', temperature: null });
    await adapter.generate([{ role: 'user', content: 'hi' }], { temperature: 0.9 });
    const body = JSON.parse(req.write.mock.calls[0][0]);
    expect(body.temperature).toBe(0.9);
  });

  test('uses 0.7 default when neither config nor options temperature set', async () => {
    const { req, impl } = mockResponse({ statusCode: 200, chunks: ['{"choices":[{"message":{"content":"x"}}]}'] });
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'http://localhost:9999', temperature: null });
    await adapter.generate([{ role: 'user', content: 'hi' }]);
    const body = JSON.parse(req.write.mock.calls[0][0]);
    expect(body.temperature).toBe(0.7);
  });

  test('uses options.temperature in stream when config temperature is null', async () => {
    const { req, res, impl } = mockStream();
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'http://localhost:9999', temperature: null });
    const p = adapter.stream([{ role: 'user', content: 'hi' }], jest.fn(), { temperature: 0.5 });
    const body = JSON.parse(req.write.mock.calls[0][0]);
    expect(body.temperature).toBe(0.5);
    res.emit('data', 'data: [DONE]\n\n');
    res.emit('end');
    await p;
  });

  test('uses 0.7 default temperature in stream', async () => {
    const { req, res, impl } = mockStream();
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'http://localhost:9999', temperature: null });
    const p = adapter.stream([{ role: 'user', content: 'hi' }], jest.fn());
    const body = JSON.parse(req.write.mock.calls[0][0]);
    expect(body.temperature).toBe(0.7);
    res.emit('data', 'data: [DONE]\n\n');
    res.emit('end');
    await p;
  });
});

describe('DeepSeekAdapter', () => {
  test('sets type deepseek and default model', () => {
    const adapter = new DeepSeekAdapter({ apiKey: 'test' });
    expect(adapter.type).toBe('deepseek');
    expect(adapter.config.model).toBe('deepseek-chat');
  });

  test('constructs with default options', () => {
    const adapter = new DeepSeekAdapter();
    expect(adapter.type).toBe('deepseek');
  });

  test('uses deepseek baseUrl', () => {
    const adapter = new DeepSeekAdapter({ apiKey: 'test' });
    expect(adapter.config.baseUrl).toContain('deepseek');
  });
});

describe('GoogleAdapter', () => {
  test('sets type google', () => {
    const adapter = new GoogleAdapter({ apiKey: 'test' });
    expect(adapter.type).toBe('google');
    expect(adapter.config.model).toBe('gemini-pro');
  });

  test('constructs with default options', () => {
    const adapter = new GoogleAdapter();
    expect(adapter.type).toBe('google');
    expect(adapter.config.model).toBe('gemini-pro');
  });

  describe('_formatMessages', () => {
    test('converts assistant role to model', () => {
      const adapter = new GoogleAdapter({ apiKey: 'test' });
      const result = adapter._formatMessages([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' }
      ]);
      expect(result[0].role).toBe('user');
      expect(result[1].role).toBe('model');
      expect(result[0].parts).toEqual([{ text: 'hi' }]);
    });
  });

  describe('_parseResponse', () => {
    test('extracts from candidates format', () => {
      const adapter = new GoogleAdapter({ apiKey: 'test' });
      const result = adapter._parseResponse({
        candidates: [{ content: { parts: [{ text: 'response' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 5 }
      });
      expect(result.content).toBe('response');
      expect(result.finishReason).toBe('STOP');
      expect(result.usage.promptTokenCount).toBe(5);
    });

    test('extracts empty content when candidate text missing', () => {
      const adapter = new GoogleAdapter({ apiKey: 'test' });
      const result = adapter._parseResponse({
        candidates: [{ content: { parts: [{}] }, finishReason: 'STOP' }]
      });
      expect(result.content).toBe('');
    });

    test('throws when no candidates', () => {
      const adapter = new GoogleAdapter({ apiKey: 'test' });
      expect(() => adapter._parseResponse({})).toThrow('No response candidates');
    });
  });
});

describe('DashScopeAdapter', () => {
  test('sets type dashscope', () => {
    const adapter = new DashScopeAdapter({ apiKey: 'test' });
    expect(adapter.type).toBe('dashscope');
    expect(adapter.config.model).toBe('qwen-turbo');
  });

  test('constructs with default options', () => {
    const adapter = new DashScopeAdapter();
    expect(adapter.type).toBe('dashscope');
    expect(adapter.config.model).toBe('qwen-turbo');
  });

  describe('_parseResponse', () => {
    test('extracts from DashScope output format', () => {
      const adapter = new DashScopeAdapter({ apiKey: 'test' });
      const result = adapter._parseResponse({
        output: { choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] },
        usage: { input_tokens: 3 },
        model: 'qwen-turbo'
      });
      expect(result.content).toBe('hi');
      expect(result.finishReason).toBe('stop');
      expect(result.usage.input_tokens).toBe(3);
    });

    test('extracts empty content when message content missing', () => {
      const adapter = new DashScopeAdapter({ apiKey: 'test' });
      const result = adapter._parseResponse({
        output: { choices: [{ message: {}, finish_reason: 'stop' }] },
        model: 'qwen-turbo'
      });
      expect(result.content).toBe('');
    });

    test('throws when no output', () => {
      const adapter = new DashScopeAdapter({ apiKey: 'test' });
      expect(() => adapter._parseResponse({})).toThrow('No output');
    });
  });
});

describe('OpenClawAdapter', () => {
  test('sets type openclaw with default baseUrl localhost:3002', () => {
    const adapter = new OpenClawAdapter({ apiKey: 'test' });
    expect(adapter.type).toBe('openclaw');
    expect(adapter.config.baseUrl).toContain('3002');
    expect(adapter.config.model).toBe('deepseek-web/deepseek-chat');
  });

  test('constructs with default options', () => {
    const adapter = new OpenClawAdapter();
    expect(adapter.type).toBe('openclaw');
    expect(adapter.config.baseUrl).toContain('3002');
  });
});

describe('createLLMAdapter', () => {
  test('creates OpenAI adapter', () => {
    expect(createLLMAdapter('openai', { apiKey: 'k' }).type).toBe('openai');
  });

  test('creates DeepSeek adapter', () => {
    expect(createLLMAdapter('deepseek', { apiKey: 'k' }).type).toBe('deepseek');
  });

  test('creates Google adapter for "gemini"', () => {
    expect(createLLMAdapter('gemini', { apiKey: 'k' }).type).toBe('google');
  });

  test('creates Google adapter for "google"', () => {
    expect(createLLMAdapter('google', { apiKey: 'k' }).type).toBe('google');
  });

  test('creates DashScope adapter for "qwen"', () => {
    expect(createLLMAdapter('qwen', { apiKey: 'k' }).type).toBe('dashscope');
  });

  test('creates DashScope adapter for "dashscope"', () => {
    expect(createLLMAdapter('dashscope', { apiKey: 'k' }).type).toBe('dashscope');
  });

  test('creates DashScope adapter for "alibaba"', () => {
    expect(createLLMAdapter('alibaba', { apiKey: 'k' }).type).toBe('dashscope');
  });

  test('creates OpenClaw adapter', () => {
    expect(createLLMAdapter('openclaw', { apiKey: 'k' }).type).toBe('openclaw');
  });

  test('falls back to OpenAI when baseUrl provided', () => {
    const adapter = createLLMAdapter('unknown', { baseUrl: 'http://custom', apiKey: 'k' });
    expect(adapter.type).toBe('openai');
  });

  test('throws for unknown provider without baseUrl', () => {
    expect(() => createLLMAdapter('nonexistent')).toThrow('Unknown LLM provider');
  });

  test('case insensitive', () => {
    expect(createLLMAdapter('OpenAI', { apiKey: 'k' }).type).toBe('openai');
  });
});

function mockResponse({ statusCode = 200, chunks = [], emitEnd = true } = {}) {
  const req = new EventEmitter();
  req.write = jest.fn();
  req.end = jest.fn();
  req.destroy = jest.fn();
  const res = new EventEmitter();
  res.statusCode = statusCode;
  const impl = jest.fn((_opts, cb) => {
    cb(res);
    for (const chunk of chunks) res.emit('data', chunk);
    if (emitEnd) setImmediate(() => res.emit('end'));
    return req;
  });
  return { req, res, impl };
}

function mockStream() {
  const req = new EventEmitter();
  req.write = jest.fn();
  req.end = jest.fn();
  req.destroy = jest.fn();
  const res = new EventEmitter();
  res.statusCode = 200;
  const impl = jest.fn((_opts, cb) => { cb(res); return req; });
  return { req, res, impl };
}

function installTransport(impl) {
  jest.spyOn(http, 'request').mockImplementation(impl);
  jest.spyOn(https, 'request').mockImplementation(impl);
}

describe('OpenAIAdapter HTTP requests', () => {
  test('generate resolves content via https transport', async () => {
    const { req, impl } = mockResponse({
      statusCode: 200,
      chunks: [JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { total_tokens: 3 }, model: 'gpt-4' })]
    });
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'https://api.openai.com/v1' });
    const result = await adapter.generate([{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('ok');
    expect(result.finishReason).toBe('stop');
    expect(result.model).toBe('gpt-4');
    const opts = impl.mock.calls[0][0];
    expect(opts.hostname).toBe('api.openai.com');
    expect(opts.port).toBe(443);
    expect(opts.headers.Authorization).toBe('Bearer k');
    expect(JSON.parse(req.write.mock.calls[0][0]).model).toBe('gpt-3.5-turbo');
  });

  test('generate sends zero temperature and max_tokens override via http', async () => {
    const { req, impl } = mockResponse({ statusCode: 200, chunks: ['{"choices":[{"message":{"content":"x"}}]}'] });
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'http://localhost:9999', temperature: 0 });
    await adapter.generate([{ role: 'user', content: 'hi' }], { max_tokens: 512 });
    const body = JSON.parse(req.write.mock.calls[0][0]);
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(512);
  });

  test('generate uses default port when baseUrl has no port', async () => {
    const { req, impl } = mockResponse({ statusCode: 200, chunks: ['{"choices":[{"message":{"content":"x"}}]}'] });
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'http://localhost' });
    await adapter.generate([{ role: 'user', content: 'hi' }]);
    expect(impl.mock.calls[0][0].port).toBe(80);
    expect(JSON.parse(req.write.mock.calls[0][0]).messages).toBeDefined();
  });

  test('generate rejects with HTTP error message from JSON', async () => {
    const { impl } = mockResponse({ statusCode: 400, chunks: [JSON.stringify({ error: { message: 'Bad request' } })] });
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'http://localhost:9999' });
    await expect(adapter.generate([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('HTTP 400: Bad request');
  });

  test('generate rejects with raw body when not JSON', async () => {
    const { impl } = mockResponse({ statusCode: 500, chunks: ['oops'] });
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'http://localhost:9999' });
    await expect(adapter.generate([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('HTTP 500: oops');
  });

  test('generate rejects with raw body when error message is missing', async () => {
    const { impl } = mockResponse({ statusCode: 400, chunks: [JSON.stringify({ error: {} })] });
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'http://localhost:9999' });
    await expect(adapter.generate([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('HTTP 400: {"error":{}}');
  });

  test('generate rejects on request error', async () => {
    const { req, impl } = mockResponse({ statusCode: 200, chunks: ['{}'], emitEnd: false });
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'http://localhost:9999' });
    const p = adapter.generate([{ role: 'user', content: 'hi' }]);
    req.emit('error', new Error('ECONNREFUSED'));
    await expect(p).rejects.toThrow('ECONNREFUSED');
  });

  test('generate rejects on timeout', async () => {
    const { req, impl } = mockResponse({ statusCode: 200, chunks: ['{}'], emitEnd: false });
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'http://localhost:9999' });
    const p = adapter.generate([{ role: 'user', content: 'hi' }]);
    req.emit('timeout');
    await expect(p).rejects.toThrow('Request timeout');
    expect(req.destroy).toHaveBeenCalled();
  });

  test('formats scalar non-array messages via String()', () => {
    const adapter = new OpenAIAdapter({ apiKey: 'k' });
    expect(adapter._formatMessages(42)).toEqual([{ role: 'user', content: '42' }]);
  });

  test('throws when response has no choices', () => {
    const adapter = new OpenAIAdapter({ apiKey: 'k' });
    expect(() => adapter._parseResponse({})).toThrow('No response choices in LLM response');
  });
});

describe('OpenAIAdapter HTTP streaming', () => {
  test('streams SSE chunks and resolves on [DONE] via https', async () => {
    const { res, impl } = mockStream();
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'https://api.openai.com/v1' });
    const received = [];
    const p = adapter.stream([{ role: 'user', content: 'hi' }], (c) => received.push(c));
    res.emit('data', 'data: {"choices":[{"delta":{"content":"a"}}]}\n\n');
    res.emit('data', 'data: [DONE]\n\n');
    await p;
    expect(received).toHaveLength(1);
    expect(received[0].choices[0].delta.content).toBe('a');
  });

  test('streams via http with no port uses default 80', async () => {
    const { req, res, impl } = mockStream();
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'http://localhost' });
    const p = adapter.stream([{ role: 'user', content: 'hi' }], jest.fn());
    expect(impl.mock.calls[0][0].port).toBe(80);
    expect(JSON.parse(req.write.mock.calls[0][0]).stream).toBe(true);
    res.emit('data', 'data: [DONE]\n\n');
    res.emit('end');
    await p;
  });

  test('streams via http and skips malformed JSON lines', async () => {
    const { res, impl } = mockStream();
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'http://localhost:9999' });
    const received = [];
    const p = adapter.stream([{ role: 'user', content: 'hi' }], (c) => received.push(c));
    res.emit('data', 'data: not-json\n');
    res.emit('data', 'data: {"choices":[{"delta":{"content":"b"}}]}\n\n');
    res.emit('data', 'data: [DONE]\n\n');
    await p;
    expect(received).toHaveLength(1);
    expect(received[0].choices[0].delta.content).toBe('b');
  });

  test('stream rejects on request error', async () => {
    const { req, impl } = mockStream();
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'http://localhost:9999' });
    const p = adapter.stream([{ role: 'user', content: 'hi' }], () => {});
    req.emit('error', new Error('ECONNREFUSED'));
    await expect(p).rejects.toThrow('ECONNREFUSED');
  });

  test('stream rejects on timeout', async () => {
    const { req, impl } = mockStream();
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'http://localhost:9999' });
    const p = adapter.stream([{ role: 'user', content: 'hi' }], () => {});
    req.emit('timeout');
    await expect(p).rejects.toThrow('Stream timeout');
    expect(req.destroy).toHaveBeenCalled();
  });

  test('stream res rejects', async () => {
    const { res, impl } = mockStream();
    installTransport(impl);
    const adapter = new OpenAIAdapter({ apiKey: 'k', baseUrl: 'http://localhost:9999' });
    const p = adapter.stream([{ role: 'user', content: 'hi' }], () => {});
    res.emit('error', new Error('socket hang up'));
    await expect(p).rejects.toThrow('socket hang up');
  });
});

describe('GoogleAdapter HTTP requests', () => {
  test('generate resolves via candidates over https', async () => {
    const { req, impl } = mockResponse({
      statusCode: 200,
      chunks: [JSON.stringify({ candidates: [{ content: { parts: [{ text: 'gok' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 7 } })]
    });
    jest.spyOn(https, 'request').mockImplementation(impl);
    const adapter = new GoogleAdapter({ apiKey: 'k' });
    const result = await adapter.generate([{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('gok');
    expect(result.finishReason).toBe('STOP');
    expect(result.usage.promptTokenCount).toBe(7);
    expect(impl.mock.calls[0][0].path).toContain('key=k');
    expect(JSON.parse(req.write.mock.calls[0][0]).generationConfig.temperature).toBe(0.7);
  });

  test('generate rejects on HTTP error', async () => {
    const { impl } = mockResponse({ statusCode: 429, chunks: [JSON.stringify({ error: { message: 'rate limited' } })] });
    jest.spyOn(https, 'request').mockImplementation(impl);
    const adapter = new GoogleAdapter({ apiKey: 'k' });
    await expect(adapter.generate([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('HTTP 429: rate limited');
  });

  test('generate rejects with raw body when 2xx body is not JSON', async () => {
    const { impl } = mockResponse({ statusCode: 200, chunks: ['not-json-at-all'] });
    jest.spyOn(https, 'request').mockImplementation(impl);
    const adapter = new GoogleAdapter({ apiKey: 'k' });
    await expect(adapter.generate([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('HTTP 200: not-json-at-all');
  });

  test('generate rejects on request timeout', async () => {
    const { req, impl } = mockResponse({ statusCode: 200, chunks: ['{}'], emitEnd: false });
    jest.spyOn(https, 'request').mockImplementation(impl);
    const adapter = new GoogleAdapter({ apiKey: 'k' });
    const p = adapter.generate([{ role: 'user', content: 'hi' }]);
    req.emit('timeout');
    await expect(p).rejects.toThrow('Request timeout');
    expect(req.destroy).toHaveBeenCalled();
  });

  test('generate rejects with raw body when error message missing', async () => {
    const { impl } = mockResponse({ statusCode: 400, chunks: [JSON.stringify({ error: {} })] });
    jest.spyOn(https, 'request').mockImplementation(impl);
    const adapter = new GoogleAdapter({ apiKey: 'k' });
    await expect(adapter.generate([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('HTTP 400: {"error":{}}');
  });

  test('generate uses http transport for http baseUrl', async () => {
    const { impl } = mockResponse({ statusCode: 200, chunks: ['{"candidates":[{"content":{"parts":[{"text":"x"}]}}]}'] });
    jest.spyOn(http, 'request').mockImplementation(impl);
    const adapter = new GoogleAdapter({ apiKey: 'k', baseUrl: 'http://localhost:8888' });
    await adapter.generate([{ role: 'user', content: 'hi' }]);
    expect(impl.mock.calls[0][0].port).toBe('8888');
  });
});

describe('DashScopeAdapter HTTP requests', () => {
  test('generate resolves via DashScope output format over https', async () => {
    const { req, impl } = mockResponse({
      statusCode: 200,
      chunks: [JSON.stringify({ output: { choices: [{ message: { content: 'dok' }, finish_reason: 'stop' }] }, usage: { input_tokens: 4 }, model: 'qwen-turbo' })]
    });
    jest.spyOn(https, 'request').mockImplementation(impl);
    const adapter = new DashScopeAdapter({ apiKey: 'k' });
    const result = await adapter.generate([{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('dok');
    expect(result.usage.input_tokens).toBe(4);
    expect(impl.mock.calls[0][0].path).toBe('/chat/completions');
    const body = JSON.parse(req.write.mock.calls[0][0]);
    expect(body.parameters.result_format).toBe('message');
  });

  test('generate rejects on HTTP error', async () => {
    const { impl } = mockResponse({ statusCode: 401, chunks: [JSON.stringify({ error: { message: 'no auth' } })] });
    jest.spyOn(https, 'request').mockImplementation(impl);
    const adapter = new DashScopeAdapter({ apiKey: 'k' });
    await expect(adapter.generate([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('HTTP 401: no auth');
  });

  test('generate rejects with raw body when 2xx body is not JSON', async () => {
    const { impl } = mockResponse({ statusCode: 200, chunks: ['plain-text-body'] });
    jest.spyOn(https, 'request').mockImplementation(impl);
    const adapter = new DashScopeAdapter({ apiKey: 'k' });
    await expect(adapter.generate([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('HTTP 200: plain-text-body');
  });

  test('generate rejects on request timeout', async () => {
    const { req, impl } = mockResponse({ statusCode: 200, chunks: ['{}'], emitEnd: false });
    jest.spyOn(https, 'request').mockImplementation(impl);
    const adapter = new DashScopeAdapter({ apiKey: 'k' });
    const p = adapter.generate([{ role: 'user', content: 'hi' }]);
    req.emit('timeout');
    await expect(p).rejects.toThrow('Request timeout');
    expect(req.destroy).toHaveBeenCalled();
  });

  test('generate rejects with raw body when error message missing', async () => {
    const { impl } = mockResponse({ statusCode: 401, chunks: [JSON.stringify({ error: {} })] });
    jest.spyOn(https, 'request').mockImplementation(impl);
    const adapter = new DashScopeAdapter({ apiKey: 'k' });
    await expect(adapter.generate([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('HTTP 401: {"error":{}}');
  });
});

describe('OpenClawAdapter HTTP requests', () => {
  test('generate resolves via default http transport', async () => {
    const { impl } = mockResponse({ statusCode: 200, chunks: ['{"choices":[{"message":{"content":"ok"}}]}'] });
    jest.spyOn(http, 'request').mockImplementation(impl);
    const adapter = new OpenClawAdapter({ apiKey: 'k' });
    const result = await adapter.generate([{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('ok');
    expect(impl.mock.calls[0][0].port).toBe('3002');
  });
});
