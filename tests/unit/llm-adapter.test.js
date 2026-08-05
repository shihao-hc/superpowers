'use strict';

const { LLMAdapter, LLMError, StreamParser, ErrorTypes, LLMStream, PendingRequestMap, RetryStrategy } = require('../../src/agent/LLMAdapter');

describe('LLMError', () => {
  it('creates error with all properties', () => {
    const orig = new Error('original');
    const err = new LLMError('test msg', ErrorTypes.TIMEOUT, true, orig);
    expect(err.name).toBe('LLMError');
    expect(err.message).toBe('test msg');
    expect(err.type).toBe('TIMEOUT');
    expect(err.retryable).toBe(true);
    expect(err.originalError).toBe(orig);
    expect(err.timestamp).toBeGreaterThan(0);
  });

  it('uses defaults for optional params', () => {
    const err = new LLMError('fallback');
    expect(err.type).toBe('UNKNOWN');
    expect(err.retryable).toBe(false);
    expect(err.originalError).toBeNull();
  });
});

describe('ErrorTypes', () => {
  it('contains all expected constants', () => {
    const expected = ['RATE_LIMIT', 'AUTH_ERROR', 'TIMEOUT', 'NETWORK_ERROR', 'SERVER_ERROR', 'VALIDATION_ERROR', 'CONTEXT_OVERFLOW', 'UNKNOWN'];
    expected.forEach((t) => {
      expect(ErrorTypes[t]).toBe(t);
    });
  });
});

describe('StreamParser', () => {
  let parser;

  beforeEach(() => {
    parser = new StreamParser();
  });

  it('parseSSE handles event with data', () => {
    const events = parser.parseSSE('event:message\ndata:hello\n\n');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'message', data: 'hello\n' });
  });

  it('parseSSE handles multiple events separated by empty lines', () => {
    const events = parser.parseSSE('event:a\ndata:1\n\nevent:b\ndata:2\n\n');
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('a');
    expect(events[1].type).toBe('b');
  });

  it('parseSSE ignores data-only lines without event prefix', () => {
    const events = parser.parseSSE('data:{"text":"hello"}\n\n');
    expect(events).toHaveLength(0);
  });

  it('parseSSE buffers partial chunks across calls', () => {
    const r1 = parser.parseSSE('event:partial\ndata:in');
    expect(r1).toHaveLength(0);
    expect(parser.buffer).toBe('data:in');

    const r2 = parser.parseSSE('complete\n\n');
    expect(r2).toHaveLength(0);
  });

  it('parseSSE handles empty chunk', () => {
    const events = parser.parseSSE('');
    expect(events).toHaveLength(0);
  });

  it('parseNDJSON parses valid JSON lines', () => {
    const events = parser.parseNDJSON('{"a":1}\n{"b":2}\n');
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ a: 1 });
    expect(events[1]).toEqual({ b: 2 });
  });

  it('parseNDJSON skips invalid JSON silently', () => {
    const events = parser.parseNDJSON('{"valid":1}\nnot-json\n{"valid":2}\n');
    expect(events).toHaveLength(2);
  });

  it('parseNDJSON skips empty lines', () => {
    const events = parser.parseNDJSON('{"a":1}\n\n{"b":2}\n');
    expect(events).toHaveLength(2);
  });

  it('parseNDJSON buffers incomplete lines', () => {
    const r1 = parser.parseNDJSON('{"a":1}\n{"b');
    expect(r1).toHaveLength(1);
    expect(parser.buffer).toBe('{"b');

    const r2 = parser.parseNDJSON('":2}\n');
    expect(r2).toHaveLength(1);
    expect(r2[0]).toEqual({ b: 2 });
  });

  it('reset clears internal buffer', () => {
    parser.parseSSE('event:x\ndata:');
    expect(parser.buffer).not.toBe('');
    parser.reset();
    expect(parser.buffer).toBe('');
  });
});

describe('PendingRequestMap', () => {
  let prm;

  beforeEach(() => {
    prm = new PendingRequestMap();
  });

  afterEach(() => {
    prm.cancelAll();
  });

  it('create returns pending request with promise', () => {
    const result = prm.create({ timeout: -1 });
    expect(result.id).toBe(1);
    expect(result.promise).toBeInstanceOf(Promise);
    expect(result.pending.timeout).toBe(-1);
  });

  it('create uses defaults when options not provided', () => {
    const result = prm.create();
    expect(result.pending.timeout).toBe(60000);
    expect(result.pending.request).toBeNull();
    expect(result.pending.metadata).toEqual({});
  });

  it('create stores request and metadata', () => {
    const result = prm.create({ timeout: -1, request: 'my-req', metadata: { key: 'val' } });
    expect(result.pending.request).toBe('my-req');
    expect(result.pending.metadata).toEqual({ key: 'val' });
  });

  it('create auto-increments id', () => {
    const r1 = prm.create({ timeout: -1 });
    const r2 = prm.create({ timeout: -1 });
    expect(r2.id).toBe(r1.id + 1);
  });

  it('resolve completes the promise with result', async () => {
    const { id, promise } = prm.create({ timeout: -1 });
    prm.resolve(id, 'success');
    await expect(promise).resolves.toBe('success');
  });

  it('reject fails the promise', async () => {
    const { id, promise } = prm.create({ timeout: -1 });
    prm.reject(id, new LLMError('fail'));
    await expect(promise).rejects.toThrow('fail');
  });

  it('resolve returns false for unknown id', () => {
    expect(prm.resolve(999, 'x')).toBe(false);
  });

  it('reject returns false for unknown id', () => {
    expect(prm.reject(999, new Error())).toBe(false);
  });

  it('get returns pending request by id', () => {
    const { id, pending } = prm.create({ timeout: -1 });
    expect(prm.get(id)).toBe(pending);
  });

  it('get returns undefined for unknown id', () => {
    expect(prm.get(999)).toBeUndefined();
  });

  it('getAll returns all pending requests', () => {
    prm.create({ timeout: -1 });
    prm.create({ timeout: -1 });
    expect(prm.getAll()).toHaveLength(2);
  });

  it('size returns current count', () => {
    expect(prm.size()).toBe(0);
    prm.create({ timeout: -1 });
    expect(prm.size()).toBe(1);
  });

  it('cancelAll rejects all and clears map', async () => {
    const r1 = prm.create({ timeout: -1 });
    const r2 = prm.create({ timeout: -1 });
    r1.promise.catch(() => {});
    r2.promise.catch(() => {});
    prm.cancelAll();
    expect(prm.size()).toBe(0);
  });

  it('getStats returns correct stats', () => {
    prm.create({ timeout: -1 });
    prm.create({ timeout: -1 });
    const stats = prm.getStats();
    expect(stats.size).toBe(2);
    expect(stats.oldest).toBeGreaterThanOrEqual(0);
    expect(stats.newest).toBeGreaterThanOrEqual(0);
  });

  it('getStats returns zeros for empty map', () => {
    const stats = prm.getStats();
    expect(stats.size).toBe(0);
    expect(stats.oldest).toBe(0);
    expect(stats.newest).toBe(0);
  });
});

describe('PendingRequestMap timeout', () => {
  let prm;

  beforeEach(() => {
    prm = new PendingRequestMap();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects on timeout expiration', async () => {
    jest.useFakeTimers();
    const { promise } = prm.create({ timeout: 100 });
    jest.advanceTimersByTime(100);
    await expect(promise).rejects.toThrow('timeout');
  });

  it('resolve clears pending timeout', async () => {
    jest.useFakeTimers();
    const { id, promise } = prm.create({ timeout: 50000 });
    prm.resolve(id, 'ok');
    jest.advanceTimersByTime(50000);
    await expect(promise).resolves.toBe('ok');
  });

  it('reject clears pending timeout', async () => {
    jest.useFakeTimers();
    const { id, promise } = prm.create({ timeout: 50000 });
    prm.reject(id, new Error('no'));
    jest.advanceTimersByTime(50000);
    await expect(promise).rejects.toThrow('no');
  });
});

describe('RetryStrategy', () => {
  it('calculateDelay uses exponential backoff with jitter', () => {
    const s = new RetryStrategy({ baseDelay: 1000 });
    const d1 = s.calculateDelay(1);
    const d3 = s.calculateDelay(3);
    expect(d1).toBeGreaterThanOrEqual(750);
    expect(d1).toBeLessThanOrEqual(1250);
    expect(d3).toBeGreaterThanOrEqual(3000);
    expect(d3).toBeLessThanOrEqual(5000);
  });

  it('calculateDelay caps at maxDelay', () => {
    const s = new RetryStrategy({ baseDelay: 50000, maxDelay: 60000 });
    const d = s.calculateDelay(100);
    expect(d).toBeLessThanOrEqual(75000);
  });

  it('shouldRetry allows retryable error types', () => {
    const s = new RetryStrategy({ maxRetries: 3 });
    expect(s.shouldRetry(new LLMError('rl', ErrorTypes.RATE_LIMIT, true), 1)).toBe(true);
    expect(s.shouldRetry(new LLMError('se', ErrorTypes.SERVER_ERROR, true), 1)).toBe(true);
    expect(s.shouldRetry(new LLMError('ne', ErrorTypes.NETWORK_ERROR, true), 1)).toBe(true);
    expect(s.shouldRetry(new LLMError('to', ErrorTypes.TIMEOUT, true), 1)).toBe(true);
  });

  it('shouldRetry denies after max attempts', () => {
    const s = new RetryStrategy({ maxRetries: 2 });
    const err = new LLMError('rl', ErrorTypes.RATE_LIMIT, true);
    expect(s.shouldRetry(err, 2)).toBe(false);
  });

  it('shouldRetry denies non-retryable error types', () => {
    const s = new RetryStrategy({ maxRetries: 3 });
    expect(s.shouldRetry(new LLMError('ae', ErrorTypes.AUTH_ERROR, false), 1)).toBe(false);
    expect(s.shouldRetry(new LLMError('ve', ErrorTypes.VALIDATION_ERROR, false), 1)).toBe(false);
  });

  it('shouldRetry treats non-LLMError as retryable (network error)', () => {
    const s = new RetryStrategy({ maxRetries: 3 });
    expect(s.shouldRetry(new Error('generic'), 1)).toBe(true);
  });

  it('constructor applies defaults', () => {
    const s = new RetryStrategy();
    expect(s.maxRetries).toBe(3);
    expect(s.baseDelay).toBe(1000);
    expect(s.maxDelay).toBe(30000);
    expect(s.jitterFactor).toBe(0.25);
    expect(s.retryableErrors).toEqual([ErrorTypes.RATE_LIMIT, ErrorTypes.SERVER_ERROR, ErrorTypes.NETWORK_ERROR, ErrorTypes.TIMEOUT]);
  });
});

describe('LLMStream', () => {
  const buildResp = (chunks) => {
    let idx = 0;
    const enc = new TextEncoder();
    return {
      body: {
        getReader: () => ({
          read: async () => {
            if (idx < chunks.length) {
              return { done: false, value: enc.encode(chunks[idx++]) };
            }
            return { done: true, value: undefined };
          },
          releaseLock: jest.fn()
        })
      }
    };
  };

  it('yields content and done from OpenAI NDJSON format', async () => {
    const resp = buildResp(['{"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}\n']);
    const parser = new StreamParser();
    const stream = new LLMStream(resp, parser, { format: 'ndjson' });

    const results = [];
    for await (const evt of stream) {
      results.push(evt);
    }
    expect(results).toHaveLength(2);
    expect(results[0].type).toBe('content');
    expect(results[0].delta).toBe('hi');
    expect(results[1].type).toBe('done');
  });

  it('yields content from Ollama NDJSON format', async () => {
    const resp = buildResp(['{"response":"hello","done":false}\n{"response":" world","done":true}\n']);
    const parser = new StreamParser();
    const stream = new LLMStream(resp, parser, { format: 'ndjson' });

    const results = [];
    for await (const evt of stream) {
      results.push(evt);
    }
    expect(results).toHaveLength(3);
    expect(results[0].delta).toBe('hello');
    expect(results[1].delta).toBe(' world');
    expect(results[2].type).toBe('done');
  });

    it('handles Anthropic format events', async () => {
      const resp = buildResp(['{"type":"content_block_delta","delta":{"text":"hello"}}\n']);
      const parser = new StreamParser();
      const stream = new LLMStream(resp, parser, { format: 'ndjson' });

      const results = [];
      for await (const evt of stream) {
        results.push(evt);
      }
      expect(results[0].type).toBe('content');
      expect(results[0].delta).toBe('hello');
    });

    it('handles Anthropic delta without text', async () => {
      const resp = buildResp(['{"type":"content_block_delta","delta":{}}\n']);
      const parser = new StreamParser();
      const stream = new LLMStream(resp, parser, { format: 'ndjson' });

      const results = [];
      for await (const evt of stream) {
        results.push(evt);
      }
      expect(results[0].type).toBe('content');
      expect(results[0].delta).toBe('');
    });

  it('handles error events', async () => {
    const resp = buildResp(['{"error":"rate limited"}\n']);
    const parser = new StreamParser();
    const stream = new LLMStream(resp, parser, { format: 'ndjson' });

    const results = [];
    for await (const evt of stream) {
      results.push(evt);
    }
    expect(results[0].type).toBe('error');
    expect(results[0].error).toBe('rate limited');
  });

  it('skips unrecognized event formats', async () => {
    const resp = buildResp(['{"unknown":true}\n']);
    const parser = new StreamParser();
    const stream = new LLMStream(resp, parser, { format: 'ndjson' });

    const results = [];
    for await (const evt of stream) {
      results.push(evt);
    }
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('done');
  });

  it('getStats returns execution stats', async () => {
    const resp = buildResp(['{"response":"ab","done":true}\n']);
    const parser = new StreamParser();
    const stream = new LLMStream(resp, parser, { format: 'ndjson' });

    for await (const _ of stream) { /* drain stream */ }
    const stats = stream.getStats();
    expect(stats.tokens).toBe(1);
    expect(stats.duration).toBeGreaterThanOrEqual(0);
    expect(stats.tps).toBeGreaterThanOrEqual(0);
    expect(stats.done).toBe(true);
  });

  it('processes SSE format events', async () => {
    const resp = buildResp(['event:message\ndata:{"text":"hi"}\n\n']);
    const parser = new StreamParser();
    const stream = new LLMStream(resp, parser, { format: 'sse' });

    const results = [];
    for await (const evt of stream) {
      results.push(evt);
    }
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('done');
  });

  it('uses default options when not provided', async () => {
    const resp = buildResp(['{"response":"x","done":true}\n']);
    const parser = new StreamParser();
    const stream = new LLMStream(resp, parser);

    const results = [];
    for await (const evt of stream) {
      results.push(evt);
    }
    expect(results).toHaveLength(2);
    expect(results[0].delta).toBe('x');
  });
});

describe('LLMAdapter', () => {
  let adapter;

  beforeEach(() => {
    global.fetch = jest.fn();
    adapter = new LLMAdapter({ apiKey: 'test-key' });
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('constructor applies defaults', () => {
    const a = new LLMAdapter();
    expect(a.provider).toBe('ollama');
    expect(a.model).toBe('llama3.2');
    expect(a.baseUrl).toBe('http://localhost:11434');
    expect(a.timeout).toBe(30000);
    expect(a.enableStreaming).toBe(true);
    expect(a.defaultStreamFormat).toBe('ndjson');
    expect(a.budget.dailyLimit).toBe(Infinity);
    expect(a.budget.dailySpent).toBe(0);
    expect(a.stats.totalRequests).toBe(0);
  });

  it('constructor respects custom config', () => {
    const a = new LLMAdapter({
      provider: 'openai',
      model: 'gpt-4',
      baseUrl: 'https://custom.ai',
      timeout: 5000,
      maxRetries: 5,
      retryDelay: 2000,
      dailyBudget: 50000,
      streamFormat: 'sse',
      enableStreaming: false
    });
    expect(a.provider).toBe('openai');
    expect(a.model).toBe('gpt-4');
    expect(a.baseUrl).toBe('https://custom.ai');
    expect(a.timeout).toBe(5000);
    expect(a.retryStrategy.maxRetries).toBe(5);
    expect(a.retryStrategy.baseDelay).toBe(2000);
    expect(a.budget.dailyLimit).toBe(50000);
    expect(a.defaultStreamFormat).toBe('sse');
    expect(a.enableStreaming).toBe(false);
  });

  describe('generateWithRetry', () => {
    it('succeeds on first attempt', async () => {
      adapter.generate = jest.fn().mockResolvedValue({ response: 'ok', tokens: 5 });
      const result = await adapter.generateWithRetry('hi');
      expect(result).toEqual({ response: 'ok', tokens: 5 });
      expect(adapter.stats.successfulRequests).toBe(1);
      expect(adapter.stats.totalRequests).toBe(1);
    });

    it('retries on server error then succeeds', async () => {
      const err = new LLMError('server down', ErrorTypes.SERVER_ERROR, true);
      adapter.generate = jest.fn()
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce({ response: 'retry ok', tokens: 3 });

      const result = await adapter.generateWithRetry('hi');
      expect(result.response).toBe('retry ok');
      expect(adapter.stats.retryCount).toBe(1);
      expect(adapter.stats.totalRequests).toBe(2);
    });

    it('throws after exhausting retries', async () => {
      const err = new LLMError('persistent', ErrorTypes.SERVER_ERROR, true);
      adapter.generate = jest.fn().mockRejectedValue(err);

      await expect(adapter.generateWithRetry('hi')).rejects.toThrow('persistent');
      expect(adapter.stats.failedRequests).toBe(3);
      expect(adapter.stats.retryCount).toBe(2);
    });

    it('throws immediately on non-retryable error', async () => {
      const err = new LLMError('unauthorized', ErrorTypes.AUTH_ERROR, false);
      adapter.generate = jest.fn().mockRejectedValue(err);

      await expect(adapter.generateWithRetry('hi')).rejects.toThrow('unauthorized');
      expect(adapter.stats.failedRequests).toBe(1);
      expect(adapter.stats.retryCount).toBe(0);
    });

    it('emits retry event on each retry', async () => {
      const listener = jest.fn();
      adapter.on('retry', listener);
      const err = new LLMError('timeout', ErrorTypes.TIMEOUT, true);
      adapter.generate = jest.fn()
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce({ response: 'ok', tokens: 1 });

      await adapter.generateWithRetry('hi');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1 }));
    });

    it('updates average latency on success', async () => {
      adapter.generate = jest.fn().mockResolvedValue({ response: 'ok', tokens: 1 });
      await adapter.generateWithRetry('hi');
      expect(adapter.stats.averageLatency).toBeGreaterThanOrEqual(0);
    });

    it('handles result without tokens', async () => {
      adapter.generate = jest.fn().mockResolvedValue({ response: 'ok' });
      await adapter.generateWithRetry('hi');
      expect(adapter.stats.totalTokens).toBe(0);
    });

    it('handles nullish result', async () => {
      adapter.generate = jest.fn().mockResolvedValue(null);
      await adapter.generateWithRetry('hi');
      expect(adapter.stats.totalTokens).toBe(0);
    });
  });

  describe('streamGenerate', () => {
    it('yields events when streaming enabled', async () => {
      const mockResp = {
        ok: true,
        body: {
          getReader: () => {
            let done = false;
            const enc = new TextEncoder();
            return {
              read: async () => {
                if (!done) {
                  done = true;
                  return { done: false, value: enc.encode('{"response":"hi","done":true}\n') };
                }
                return { done: true, value: undefined };
              },
              releaseLock: jest.fn()
            };
          }
        }
      };
      adapter._fetchStream = jest.fn().mockResolvedValue(mockResp);

      const results = [];
      for await (const evt of adapter.streamGenerate('test')) {
        results.push(evt);
      }
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.type === 'content')).toBe(true);
    });

    it('falls back to non-streaming when disabled', async () => {
      adapter.enableStreaming = false;
      adapter.generate = jest.fn().mockResolvedValue('fallback');

      const results = [];
      for await (const evt of adapter.streamGenerate('test')) {
        results.push(evt);
      }
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('content');
      expect(results[0].delta).toBe('fallback');
      expect(results[0].done).toBe(true);
    });

    it('throws LLMError when fetch fails', async () => {
      adapter._fetchStream = jest.fn().mockResolvedValue({ ok: false });
      adapter._parseError = jest.fn().mockResolvedValue({ message: 'fail', type: ErrorTypes.SERVER_ERROR, retryable: true });

      const iter = adapter.streamGenerate('test')[Symbol.asyncIterator]();
      await expect(iter.next()).rejects.toThrow('fail');
    });

    it('uses SSE format when configured', async () => {
      adapter.defaultStreamFormat = 'sse';
      const mockResp = {
        ok: true,
        body: {
          getReader: () => {
            let done = false;
            const enc = new TextEncoder();
            return {
              read: async () => {
                if (!done) {
                  done = true;
                  return { done: false, value: enc.encode('event:message\ndata:{"text":"hi"}\n\n') };
                }
                return { done: true, value: undefined };
              },
              releaseLock: jest.fn()
            };
          }
        }
      };
      adapter._fetchStream = jest.fn().mockResolvedValue(mockResp);

      const results = [];
      for await (const evt of adapter.streamGenerate('test')) {
        results.push(evt);
      }
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('done');
    });
  });

  describe('_callProvider', () => {
    it('throws for unknown provider', async () => {
      await expect(adapter._callProvider('generate', 'x', { provider: 'nonexistent' }))
        .rejects.toThrow('Unknown provider');
    });
  });

  describe('_parseError', () => {
    const mkResp = (status, msg) => ({
      status,
      json: jest.fn().mockResolvedValue(msg ? { error: { message: msg } } : {})
    });

    it('classifies 429 as RATE_LIMIT retryable', async () => {
      const r = await adapter._parseError(mkResp(429));
      expect(r.type).toBe(ErrorTypes.RATE_LIMIT);
      expect(r.retryable).toBe(true);
    });

    it('classifies 401 as AUTH_ERROR non-retryable', async () => {
      const r = await adapter._parseError(mkResp(401));
      expect(r.type).toBe(ErrorTypes.AUTH_ERROR);
      expect(r.retryable).toBe(false);
    });

    it('classifies 403 as AUTH_ERROR non-retryable', async () => {
      const r = await adapter._parseError(mkResp(403));
      expect(r.type).toBe(ErrorTypes.AUTH_ERROR);
      expect(r.retryable).toBe(false);
    });

    it('classifies 500 as SERVER_ERROR retryable', async () => {
      const r = await adapter._parseError(mkResp(500));
      expect(r.type).toBe(ErrorTypes.SERVER_ERROR);
      expect(r.retryable).toBe(true);
    });

    it('classifies 400 with token msg as CONTEXT_OVERFLOW', async () => {
      const r = await adapter._parseError(mkResp(400, 'maximum context length exceeded'));
      expect(r.type).toBe(ErrorTypes.CONTEXT_OVERFLOW);
    });

    it('classifies 400 otherwise as VALIDATION_ERROR', async () => {
      const r = await adapter._parseError(mkResp(400, 'bad request'));
      expect(r.type).toBe(ErrorTypes.VALIDATION_ERROR);
    });

    it('handles json parse failure gracefully', async () => {
      const resp = { status: 500, json: jest.fn().mockRejectedValue(new Error('parse fail')) };
      const r = await adapter._parseError(resp);
      expect(r.message).toContain('500');
    });

    it('classifies unknown status as UNKNOWN', async () => {
      const r = await adapter._parseError({ status: 404, json: jest.fn().mockResolvedValue({}) });
      expect(r.type).toBe(ErrorTypes.UNKNOWN);
      expect(r.retryable).toBe(false);
    });
  });

  describe('generate delegates', () => {
    it('calls _callProvider with generate', async () => {
      adapter._callProvider = jest.fn().mockResolvedValue('result');
      const result = await adapter.generate('hello');
      expect(result).toBe('result');
      expect(adapter._callProvider).toHaveBeenCalledWith('generate', 'hello', expect.any(Object));
    });
  });

  describe('chat delegates', () => {
    it('calls _callProvider with chat', async () => {
      adapter._callProvider = jest.fn().mockResolvedValue('chat result');
      const result = await adapter.chat([{ role: 'user', content: 'hi' }]);
      expect(result).toBe('chat result');
      expect(adapter._callProvider).toHaveBeenCalledWith('chat', [{ role: 'user', content: 'hi' }], expect.any(Object));
    });
  });

  describe('generateWithVision', () => {
    it('calls _callProvider with vision', async () => {
      adapter._callProvider = jest.fn().mockResolvedValue('vision result');
      const result = await adapter.generateWithVision('base64img', 'what is this?');
      expect(result).toBe('vision result');
    });
  });

  describe('embed', () => {
    it('calls _callProvider with embed', async () => {
      adapter._callProvider = jest.fn().mockResolvedValue([0.1, 0.2]);
      const result = await adapter.embed('text to embed');
      expect(result).toEqual([0.1, 0.2]);
    });
  });

  describe('provider-specific calls', () => {
    it('_ollamaCall generate returns response field', async () => {
      global.fetch.mockResolvedValue({ json: jest.fn().mockResolvedValue({ response: 'ollama response' }) });
      const a = new LLMAdapter({ provider: 'ollama' });
      const result = await a._ollamaCall('generate', 'hi', { model: 'llama3.2', temperature: 0.5 });
      expect(result).toBe('ollama response');
    });

    it('_ollamaCall chat returns message content', async () => {
      global.fetch.mockResolvedValue({ json: jest.fn().mockResolvedValue({ message: { content: 'chat response' } }) });
      const a = new LLMAdapter({ provider: 'ollama' });
      const result = await a._ollamaCall('chat', [{ role: 'user', content: 'hi' }], { model: 'llama3.2' });
      expect(result).toBe('chat response');
    });

    it('_ollamaCall chat returns empty string when no message content', async () => {
      global.fetch.mockResolvedValue({ json: jest.fn().mockResolvedValue({}) });
      const a = new LLMAdapter({ provider: 'ollama' });
      const result = await a._ollamaCall('chat', [], { model: 'llama3.2' });
      expect(result).toBe('');
    });

    it('_ollamaCall vision returns response', async () => {
      global.fetch.mockResolvedValue({ json: jest.fn().mockResolvedValue({ response: 'vision answer' }) });
      const a = new LLMAdapter({ provider: 'ollama' });
      const result = await a._ollamaCall('vision', { image: 'img', prompt: 'see?' }, { model: 'llava' });
      expect(result).toBe('vision answer');
    });

    it('_ollamaCall embed returns embedding', async () => {
      global.fetch.mockResolvedValue({ json: jest.fn().mockResolvedValue({ embedding: [0.1, 0.2] }) });
      const a = new LLMAdapter({ provider: 'ollama' });
      const result = await a._ollamaCall('embed', 'text', {});
      expect(result).toEqual([0.1, 0.2]);
    });

    it('_ollamaCall returns undefined for unknown method', async () => {
      const a = new LLMAdapter({ provider: 'ollama' });
      const result = await a._ollamaCall('unknown', 'text', {});
      expect(result).toBeUndefined();
    });

    it('_openaiCall generate returns message content', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'gpt response' } }] }) });
      const a = new LLMAdapter({ provider: 'openai', apiKey: 'sk-test' });
      const result = await a._openaiCall('generate', 'hi', { apiKey: 'sk-test' });
      expect(result).toBe('gpt response');
    });

    it('_openaiCall chat returns message content', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'chat reply' } }] }) });
      const a = new LLMAdapter({ provider: 'openai', apiKey: 'sk-test' });
      const result = await a._openaiCall('chat', [{ role: 'user', content: 'hi' }], { apiKey: 'sk-test' });
      expect(result).toBe('chat reply');
    });

    it('_openaiCall returns undefined for unknown method', async () => {
      const a = new LLMAdapter({ provider: 'openai', apiKey: 'sk-test' });
      const result = await a._openaiCall('unknown', 'hi', { apiKey: 'sk-test' });
      expect(result).toBeUndefined();
    });

    it('_openaiCall generate returns empty string when content missing', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ choices: [{ message: {} }] }) });
      const a = new LLMAdapter({ provider: 'openai', apiKey: 'sk-test' });
      const result = await a._openaiCall('generate', 'hi', { apiKey: 'sk-test' });
      expect(result).toBe('');
    });

    it('_openaiCall embed returns empty array when data missing', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({}) });
      const a = new LLMAdapter({ provider: 'openai', apiKey: 'sk-test' });
      const result = await a._openaiCall('embed', 'text', { apiKey: 'sk-test' });
      expect(result).toEqual([]);
    });

    it('_openaiCall throws when apiKey missing', async () => {
      const a = new LLMAdapter({ provider: 'openai' });
      await expect(a._openaiCall('generate', 'hi', {})).rejects.toThrow('OPENAI_API_KEY');
    });

    it('_openaiCall vision returns message content', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'vision ok' } }] }) });
      const a = new LLMAdapter({ provider: 'openai', apiKey: 'sk-test' });
      const result = await a._openaiCall('vision', { image: 'img', prompt: 'what' }, { apiKey: 'sk-test' });
      expect(result).toBe('vision ok');
    });

    it('_openaiCall vision returns empty when content missing', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ choices: [{ message: {} }] }) });
      const a = new LLMAdapter({ provider: 'openai', apiKey: 'sk-test' });
      const result = await a._openaiCall('vision', { image: 'img', prompt: 'what' }, { apiKey: 'sk-test' });
      expect(result).toBe('');
    });

    it('_openaiCall embed returns embedding', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ data: [{ embedding: [0.5] }] }) });
      const a = new LLMAdapter({ provider: 'openai', apiKey: 'sk-test' });
      const result = await a._openaiCall('embed', 'text', { apiKey: 'sk-test' });
      expect(result).toEqual([0.5]);
    });

    it('_openaiCall throws LLMError on non-ok response', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 401, json: jest.fn().mockResolvedValue({ error: { message: 'bad key' } }) });
      const a = new LLMAdapter({ provider: 'openai', apiKey: 'sk-test' });
      await expect(a._openaiCall('generate', 'hi', { apiKey: 'sk-test' })).rejects.toThrow('bad key');
    });

    it('_anthropicCall generate returns text content', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ content: [{ text: 'claude response' }] }) });
      const a = new LLMAdapter({ provider: 'anthropic', apiKey: 'sk-ant' });
      const result = await a._anthropicCall('generate', 'hi', { apiKey: 'sk-ant', model: 'claude-3-haiku-20240307' });
      expect(result).toBe('claude response');
    });

    it('_anthropicCall chat returns text content', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ content: [{ text: 'chat reply' }] }) });
      const a = new LLMAdapter({ provider: 'anthropic', apiKey: 'sk-ant' });
      const result = await a._anthropicCall('chat', [{ role: 'user', content: 'hi' }], { apiKey: 'sk-ant' });
      expect(result).toBe('chat reply');
    });

    it('_anthropicCall returns empty when content empty', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ content: [] }) });
      const a = new LLMAdapter({ provider: 'anthropic', apiKey: 'sk-ant' });
      const result = await a._anthropicCall('generate', 'hi', { apiKey: 'sk-ant' });
      expect(result).toBe('');
    });

    it('_anthropicCall throws when apiKey missing', async () => {
      const a = new LLMAdapter({ provider: 'anthropic' });
      await expect(a._anthropicCall('generate', 'hi', {})).rejects.toThrow('ANTHROPIC_API_KEY');
    });

    it('_anthropicCall throws on non-ok response', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 401, json: jest.fn().mockResolvedValue({ error: { message: 'unauthorized' } }) });
      const a = new LLMAdapter({ provider: 'anthropic', apiKey: 'sk-ant' });
      await expect(a._anthropicCall('generate', 'hi', { apiKey: 'sk-ant' })).rejects.toThrow('unauthorized');
    });

    it('_anthropicCall throws for unsupported method', async () => {
      const a = new LLMAdapter({ provider: 'anthropic', apiKey: 'sk-ant' });
      await expect(a._anthropicCall('embed', 'text', { apiKey: 'sk-ant' })).rejects.toThrow('does not support');
    });

    it('_deepseekCall generate returns content', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'deepseek reply' } }] }) });
      const a = new LLMAdapter({ provider: 'deepseek', apiKey: 'ds-key' });
      const result = await a._deepseekCall('generate', 'hi', { apiKey: 'ds-key' });
      expect(result).toBe('deepseek reply');
    });

    it('_deepseekCall chat returns content', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'chat reply' } }] }) });
      const a = new LLMAdapter({ provider: 'deepseek', apiKey: 'ds-key' });
      const result = await a._deepseekCall('chat', [{ role: 'user', content: 'hi' }], { apiKey: 'ds-key' });
      expect(result).toBe('chat reply');
    });

    it('_deepseekCall returns empty when content missing', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ choices: [{ message: {} }] }) });
      const a = new LLMAdapter({ provider: 'deepseek', apiKey: 'ds-key' });
      const result = await a._deepseekCall('generate', 'hi', { apiKey: 'ds-key' });
      expect(result).toBe('');
    });

    it('_deepseekCall throws when apiKey missing', async () => {
      const a = new LLMAdapter({ provider: 'deepseek' });
      await expect(a._deepseekCall('generate', 'hi', {})).rejects.toThrow('DEEPSEEK_API_KEY');
    });

    it('_deepseekCall throws for unsupported method', async () => {
      const a = new LLMAdapter({ provider: 'deepseek', apiKey: 'ds-key' });
      await expect(a._deepseekCall('embed', 'text', { apiKey: 'ds-key' })).rejects.toThrow('does not support');
    });

    it('_geminiCall generate returns text', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ candidates: [{ content: { parts: [{ text: 'gemini reply' }] } }] }) });
      const a = new LLMAdapter({ provider: 'gemini', apiKey: 'gm-key' });
      const result = await a._geminiCall('generate', 'hi', { apiKey: 'gm-key' });
      expect(result).toBe('gemini reply');
    });

    it('_geminiCall chat returns text', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ candidates: [{ content: { parts: [{ text: 'chat reply' }] } }] }) });
      const a = new LLMAdapter({ provider: 'gemini', apiKey: 'gm-key' });
      const result = await a._geminiCall('chat', [{ role: 'user', content: 'hi' }], { apiKey: 'gm-key' });
      expect(result).toBe('chat reply');
    });

    it('_geminiCall returns empty when parts missing', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ candidates: [{ content: {} }] }) });
      const a = new LLMAdapter({ provider: 'gemini', apiKey: 'gm-key' });
      const result = await a._geminiCall('generate', 'hi', { apiKey: 'gm-key' });
      expect(result).toBe('');
    });

    it('_geminiCall vision returns empty when parts missing', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ candidates: [{ content: {} }] }) });
      const a = new LLMAdapter({ provider: 'gemini', apiKey: 'gm-key' });
      const result = await a._geminiCall('vision', { image: 'img', prompt: 'see' }, { apiKey: 'gm-key' });
      expect(result).toBe('');
    });

    it('_geminiCall throws when apiKey missing', async () => {
      const a = new LLMAdapter({ provider: 'gemini' });
      await expect(a._geminiCall('generate', 'hi', {})).rejects.toThrow('GEMINI_API_KEY');
    });

    it('_geminiCall vision returns text', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ candidates: [{ content: { parts: [{ text: 'vision reply' }] } }] }) });
      const a = new LLMAdapter({ provider: 'gemini', apiKey: 'gm-key' });
      const result = await a._geminiCall('vision', { image: 'img', prompt: 'see' }, { apiKey: 'gm-key' });
      expect(result).toBe('vision reply');
    });

    it('_geminiCall throws for unsupported method', async () => {
      const a = new LLMAdapter({ provider: 'gemini', apiKey: 'gm-key' });
      await expect(a._geminiCall('embed', 'text', { apiKey: 'gm-key' })).rejects.toThrow('does not support');
    });

    it('_geminiCall handles non-ok response', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 400, json: jest.fn().mockResolvedValue({ error: { message: 'bad request' } }) });
      const a = new LLMAdapter({ provider: 'gemini', apiKey: 'gm-key' });
      await expect(a._geminiCall('generate', 'hi', { apiKey: 'gm-key' })).rejects.toThrow('bad request');
    });

    it('_geminiCall sanitizes model name with special chars', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) });
      const a = new LLMAdapter({ provider: 'gemini', apiKey: 'gm-key' });
      const result = await a._geminiCall('generate', 'hi', { apiKey: 'gm-key', model: 'gemini-pro/v2' });
      expect(result).toBe('ok');
    });
  });

  describe('healthCheck', () => {
    it('returns ok for ollama when fetch succeeds', async () => {
      global.fetch.mockResolvedValue({ ok: true });
      const result = await adapter.healthCheck();
      expect(result.ok).toBe(true);
      expect(result.provider).toBe('ollama');
    });

    it('returns error when fetch fails', async () => {
      global.fetch.mockRejectedValue(new Error('connection refused'));
      const result = await adapter.healthCheck();
      expect(result.ok).toBe(false);
      expect(result.provider).toBe('ollama');
    });

    it('returns ok for non-ollama providers', async () => {
      const a = new LLMAdapter({ provider: 'openai' });
      const result = await a.healthCheck();
      expect(result.ok).toBe(true);
    });
  });

  describe('stats', () => {
    it('getStats returns combined stats', () => {
      const stats = adapter.getStats();
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('pendingRequests');
      expect(stats).toHaveProperty('budget');
      expect(stats).toHaveProperty('averageLatency');
    });

    it('resetStats clears all counters', () => {
      adapter.stats.totalRequests = 50;
      adapter.stats.averageLatency = 100;
      adapter.resetStats();
      expect(adapter.stats.totalRequests).toBe(0);
      expect(adapter.stats.averageLatency).toBe(0);
    });
  });

  describe('static', () => {
    it('getSupportedProviders returns 5 providers', () => {
      const providers = LLMAdapter.getSupportedProviders();
      expect(providers).toHaveLength(5);
      const names = providers.map((p) => p.name);
      expect(names).toContain('ollama');
      expect(names).toContain('openai');
      expect(names).toContain('anthropic');
    });
  });

  describe('_fetchStream', () => {
    it('uses ollama endpoint for ollama provider', async () => {
      global.fetch.mockResolvedValue({ ok: true });
      await adapter._fetchStream('prompt', { provider: 'ollama' });
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:11434/api/generate', expect.any(Object));
    });

    it('uses openai endpoint for non-ollama provider', async () => {
      global.fetch.mockResolvedValue({ ok: true });
      await adapter._fetchStream('prompt', { provider: 'openai' });
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:11434/chat/completions', expect.any(Object));
    });
  });

  describe('streamChat', () => {
    it('falls back to non-streaming when disabled', async () => {
      adapter.enableStreaming = false;
      adapter.chat = jest.fn().mockResolvedValue('fallback');
      const results = [];
      for await (const evt of adapter.streamChat([{ role: 'user', content: 'hi' }])) {
        results.push(evt);
      }
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('content');
      expect(results[0].delta).toBe('fallback');
    });

    it('yields events when streaming enabled', async () => {
      const enc = new TextEncoder();
      const mockResp = {
        ok: true,
        body: {
          getReader: () => {
            let done = false;
            return {
              read: async () => {
                if (!done) { done = true; return { done: false, value: enc.encode('{"response":"chat","done":true}\n') }; }
                return { done: true, value: undefined };
              },
              releaseLock: jest.fn()
            };
          }
        }
      };
      adapter._fetchStreamChat = jest.fn().mockResolvedValue(mockResp);
      const results = [];
      for await (const evt of adapter.streamChat([{ role: 'user', content: 'hi' }])) {
        results.push(evt);
      }
      expect(results.length).toBeGreaterThan(0);
    });

    it('throws LLMError on fetch failure', async () => {
      adapter._fetchStreamChat = jest.fn().mockResolvedValue({ ok: false });
      adapter._parseError = jest.fn().mockResolvedValue({ message: 'fail', type: ErrorTypes.SERVER_ERROR, retryable: true });
      const iter = adapter.streamChat([{ role: 'user', content: 'hi' }])[Symbol.asyncIterator]();
      await expect(iter.next()).rejects.toThrow('fail');
    });
  });

  describe('generateWithRetry last resort', () => {
    it('throws lastError after loop exhausts', async () => {
      const a = new LLMAdapter({ maxRetries: 1, retryDelay: 10 });
      a.retryStrategy.shouldRetry = jest.fn().mockReturnValue(true);
      a.generate = jest.fn().mockRejectedValue(new LLMError('loopend', ErrorTypes.SERVER_ERROR, true));
      await expect(a.generateWithRetry('hi')).rejects.toThrow('loopend');
      expect(a.stats.failedRequests).toBe(1);
      expect(a.stats.retryCount).toBe(1);
    });
  });

  describe('provider switch coverage', () => {
    it('routes ollama through generate', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ response: 'ollama' }) });
      const a = new LLMAdapter({ provider: 'ollama' });
      expect(await a.generate('hi')).toBe('ollama');
    });

    it('routes openai through generate', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'oa' } }] }) });
      const a = new LLMAdapter({ provider: 'openai', apiKey: 'sk-test' });
      expect(await a.generate('hi')).toBe('oa');
    });

    it('routes anthropic through generate', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ content: [{ text: 'ant' }] }) });
      const a = new LLMAdapter({ provider: 'anthropic', apiKey: 'sk-ant' });
      expect(await a.generate('hi')).toBe('ant');
    });

    it('routes deepseek through generate', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'ds' } }] }) });
      const a = new LLMAdapter({ provider: 'deepseek', apiKey: 'ds-test' });
      expect(await a.generate('hi')).toBe('ds');
    });

    it('routes gemini through generate', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ candidates: [{ content: { parts: [{ text: 'gm' }] } }] }) });
      const a = new LLMAdapter({ provider: 'gemini', apiKey: 'gm-test' });
      expect(await a.generate('hi')).toBe('gm');
    });
  });

  describe('_fetchStreamChat', () => {
    it('sends correct request with model option', async () => {
      global.fetch.mockResolvedValue({ ok: true });
      const a = new LLMAdapter({ provider: 'openai', apiKey: 'sk-test' });
      await a._fetchStreamChat([{ role: 'user', content: 'hi' }], { model: 'gpt-4' });
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/chat/completions',
        expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'Authorization': 'Bearer sk-test' }) })
      );
    });

    it('uses default model when not provided', async () => {
      global.fetch.mockResolvedValue({ ok: true });
      const a = new LLMAdapter({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o' });
      await a._fetchStreamChat([{ role: 'user', content: 'hi' }], {});
      const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(callBody.model).toBe('gpt-4o');
    });
  });

  describe('_deepseekCall error', () => {
    it('throws on non-ok response', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 401, json: jest.fn().mockResolvedValue({ error: { message: 'ds auth' } }) });
      const a = new LLMAdapter({ provider: 'deepseek', apiKey: 'ds-key' });
      await expect(a._deepseekCall('generate', 'hi', { apiKey: 'ds-key' })).rejects.toThrow('ds auth');
    });
  });
});
