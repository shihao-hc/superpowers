const EventEmitter = require('events');

jest.mock('http', () => ({ request: jest.fn() }));
jest.mock('https', () => ({ request: jest.fn() }));

const { OpenClawClient, createOpenClawClient, getOpenClawClient } = require('../src/integrations/openclaw/OpenClawClient');
const http = require('http');
const https = require('https');

function mockResponse(statusCode, _body) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.headers = {};
  return res;
}

function mockRequest() {
  const req = new EventEmitter();
  req.write = jest.fn();
  req.end = jest.fn();
  req.destroy = jest.fn();
  req.aborted = false;
  return req;
}

function setupHttpMock(statusCode, body) {
  const req = mockRequest();
  const res = mockResponse(statusCode, body);
  http.request.mockImplementation((_url, _opts, cb) => { cb(res); return req; });
  https.request.mockImplementation((_url, _opts, cb) => { cb(res); return req; });
  return { req, res, emitData: () => { res.emit('data', Buffer.from(typeof body === 'object' ? JSON.stringify(body) : String(body))); }, emitEnd: () => res.emit('end') };
}

function emitResponse(res, body) {
  const data = typeof body === 'object' ? JSON.stringify(body) : String(body);
  res.emit('data', Buffer.from(data));
  res.emit('end');
}

describe('OpenClawClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('uses defaults when no options given', () => {
      const c = new OpenClawClient();
      expect(c.gatewayUrl).toBe('http://127.0.0.1:3002');
      expect(c.token).toBe('');
      expect(c.timeout).toBe(120000);
      expect(c.retries).toBe(3);
      expect(c.connected).toBe(false);
      expect(c.models).toEqual([]);
      expect(c.providers).toEqual(new Map());
    });

    test('overrides defaults with options', () => {
      const c = new OpenClawClient({ gatewayUrl: 'http://localhost:4000', token: 'abc', timeout: 5000, retries: 2 });
      expect(c.gatewayUrl).toBe('http://localhost:4000');
      expect(c.token).toBe('abc');
      expect(c.timeout).toBe(5000);
      expect(c.retries).toBe(2);
    });

    test('caps timeout at 300000', () => {
      const c = new OpenClawClient({ timeout: 999999 });
      expect(c.timeout).toBe(300000);
    });

    test('caps retries at 5', () => {
      const c = new OpenClawClient({ retries: 100 });
      expect(c.retries).toBe(5);
    });

    test('throws for unsafe gateway URL', () => {
      expect(() => new OpenClawClient({ gatewayUrl: 'http://evil.com' })).toThrow('Unsafe gateway URL');
    });
  });

  describe('getUrl', () => {
    test('builds URL without double slash', () => {
      const c = new OpenClawClient();
      expect(c.getUrl('/v1/models')).toBe('http://127.0.0.1:3002/v1/models');
    });

    test('adds leading slash when missing', () => {
      const c = new OpenClawClient();
      expect(c.getUrl('v1/models')).toBe('http://127.0.0.1:3002/v1/models');
    });

    test('removes trailing slash from base', () => {
      const c = new OpenClawClient({ gatewayUrl: 'http://127.0.0.1:3002/' });
      expect(c.getUrl('/test')).toBe('http://127.0.0.1:3002/test');
    });
  });

  describe('request', () => {
    test('resolves with JSON on 2xx', async () => {
      const { res } = setupHttpMock(200, { ok: true });
      const c = new OpenClawClient();
      const promise = c.request('GET', '/health');
      emitResponse(res, { ok: true });
      await expect(promise).resolves.toEqual({ ok: true });
    });

    test('resolves with body string on 2xx when JSON invalid', async () => {
      const { res } = setupHttpMock(200, 'plain text');
      const c = new OpenClawClient();
      const promise = c.request('GET', '/health');
      res.emit('data', Buffer.from('plain text'));
      res.emit('end');
      await expect(promise).resolves.toBe('plain text');
    });

    test('rejects on non-2xx with JSON error', async () => {
      const { res } = setupHttpMock(400, { error: { message: 'bad request' } });
      const c = new OpenClawClient();
      const promise = c.request('GET', '/health');
      emitResponse(res, { error: { message: 'bad request' } });
      await expect(promise).rejects.toThrow('HTTP 400: bad request');
    });

    test('rejects on non-2xx with plain body', async () => {
      const { res } = setupHttpMock(500, 'internal error');
      const c = new OpenClawClient();
      const promise = c.request('GET', '/health');
      res.emit('data', Buffer.from('internal error'));
      res.emit('end');
      await expect(promise).rejects.toThrow('HTTP 500: internal error');
    });

    test('sends POST data when provided', async () => {
      const { req, res } = setupHttpMock(200, { ok: true });
      const c = new OpenClawClient();
      const promise = c.request('POST', '/chat', { msg: 'hello' });
      emitResponse(res, { ok: true });
      await promise;
      expect(req.write).toHaveBeenCalledWith('{"msg":"hello"}');
    });

    test('rejects on request timeout', async () => {
      const req = mockRequest();
      http.request.mockImplementation(() => req);
      const c = new OpenClawClient({ timeout: 100 });
      const promise = c.request('GET', '/health');
      req.emit('timeout');
      await expect(promise).rejects.toThrow('Request timeout');
      expect(req.destroy).toHaveBeenCalled();
    });

    test('rejects on network error', async () => {
      const req = mockRequest();
      http.request.mockImplementation(() => req);
      const c = new OpenClawClient();
      const promise = c.request('GET', '/health');
      req.emit('error', new Error('ECONNREFUSED'));
      await expect(promise).rejects.toThrow('ECONNREFUSED');
    });

    test('rejects when request body exceeds max size', async () => {
      const c = new OpenClawClient();
      const largeData = { data: 'x'.repeat(11 * 1024 * 1024) };
      await expect(c.request('POST', '/chat', largeData)).rejects.toThrow('Request body too large');
    });

    test('rejects when response body exceeds max size', async () => {
      const req = mockRequest();
      const res = mockResponse(200, null);
      http.request.mockImplementation((_url, _opts, cb) => { cb(res); return req; });
      const c = new OpenClawClient();
      const promise = c.request('GET', '/large');
      res.emit('data', Buffer.alloc(11 * 1024 * 1024));
      await expect(promise).rejects.toThrow('Response body too large');
      expect(req.destroy).toHaveBeenCalled();
    });

    test('rejects when unsafe URL after overriding gatewayUrl', async () => {
      const c = new OpenClawClient();
      c.gatewayUrl = 'http://evil.com';
      await expect(c.request('GET', '/health')).rejects.toThrow('Unsafe request URL');
    });
  });

  describe('connect', () => {
    test('sets connected true and emits event on success', async () => {
      const { res } = setupHttpMock(200, { data: [] });
      const c = new OpenClawClient();
      const handler = jest.fn();
      c.on('connected', handler);
      const promise = c.connect();
      emitResponse(res, { data: [] });
      await promise;
      expect(c.connected).toBe(true);
      expect(handler).toHaveBeenCalled();
    });

    test('sets connected false and emits error on failure', async () => {
      const req = mockRequest();
      http.request.mockImplementation(() => req);
      const c = new OpenClawClient();
      const handler = jest.fn();
      c.on('error', handler);
      const promise = c.connect();
      req.emit('error', new Error('fail'));
      await expect(promise).rejects.toThrow('fail');
      expect(c.connected).toBe(false);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('listModels', () => {
    test('returns models array', async () => {
      const { res } = setupHttpMock(200, { data: [{ id: 'm1' }, { id: 'm2' }] });
      const c = new OpenClawClient();
      const promise = c.listModels();
      emitResponse(res, { data: [{ id: 'm1' }, { id: 'm2' }] });
      const result = await promise;
      expect(result).toEqual([{ id: 'm1' }, { id: 'm2' }]);
      expect(c.models).toEqual([{ id: 'm1' }, { id: 'm2' }]);
    });
  });

  describe('getModel', () => {
    test('throws for invalid modelId', async () => {
      const c = new OpenClawClient();
      await expect(c.getModel('')).rejects.toThrow('Invalid model ID');
      await expect(c.getModel(123)).rejects.toThrow('Invalid model ID');
    });

    test('returns matching model', async () => {
      const { res } = setupHttpMock(200, { data: [{ id: 'gpt-4' }, { id: 'claude-3' }] });
      const c = new OpenClawClient();
      const promise = c.getModel('claude-3');
      emitResponse(res, { data: [{ id: 'gpt-4' }, { id: 'claude-3' }] });
      const result = await promise;
      expect(result).toEqual({ id: 'claude-3' });
    });

    test('returns undefined when model not found', async () => {
      const { res } = setupHttpMock(200, { data: [{ id: 'gpt-4' }] });
      const c = new OpenClawClient();
      const promise = c.getModel('nonexistent');
      emitResponse(res, { data: [{ id: 'gpt-4' }] });
      const result = await promise;
      expect(result).toBeUndefined();
    });
  });

  describe('chatCompletion', () => {
    test('throws on prototype pollution attempt', async () => {
      const c = new OpenClawClient();
      const obj = JSON.parse('{"__proto__":{"admin":true},"model":"t","messages":[{"role":"user","content":"hi"}]}');
      await expect(c.chatCompletion(obj)).rejects.toThrow('prototype pollution');
    });

    test('throws when model is missing', async () => {
      const c = new OpenClawClient();
      await expect(c.chatCompletion({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow('Missing or invalid model');
    });

    test('throws when messages is missing', async () => {
      const c = new OpenClawClient();
      await expect(c.chatCompletion({ model: 'test' })).rejects.toThrow('Missing or invalid messages');
    });

    test('throws when messages is empty', async () => {
      const c = new OpenClawClient();
      await expect(c.chatCompletion({ model: 'test', messages: [] })).rejects.toThrow('Missing or invalid messages');
    });

    test('throws when temperature out of range', async () => {
      const c = new OpenClawClient();
      await expect(c.chatCompletion({ model: 't', messages: [{ role: 'user', content: 'hi' }], temperature: -1 })).rejects.toThrow('Temperature must be between 0 and 2');
      await expect(c.chatCompletion({ model: 't', messages: [{ role: 'user', content: 'hi' }], temperature: 3 })).rejects.toThrow('Temperature must be between 0 and 2');
    });

    test('throws when max_tokens out of range', async () => {
      const c = new OpenClawClient();
      await expect(c.chatCompletion({ model: 't', messages: [{ role: 'user', content: 'hi' }], max_tokens: -1 })).rejects.toThrow('max_tokens must be between 1 and 32000');
      await expect(c.chatCompletion({ model: 't', messages: [{ role: 'user', content: 'hi' }], max_tokens: 32001 })).rejects.toThrow('max_tokens must be between 1 and 32000');
    });

    test('calls streamChatCompletion when stream and onChunk provided', async () => {
      const c = new OpenClawClient();
      const scSpy = jest.spyOn(c, 'streamChatCompletion').mockResolvedValue({ done: true });
      const onChunk = jest.fn();
      const result = await c.chatCompletion({ model: 't', messages: [{ role: 'user', content: 'hi' }], stream: true }, onChunk);
      expect(result).toEqual({ done: true });
      expect(scSpy).toHaveBeenCalled();
      scSpy.mockRestore();
    });

    test('makes non-stream POST request', async () => {
      const { res } = setupHttpMock(200, { choices: [{ message: { content: 'hello' } }] });
      const c = new OpenClawClient();
      const promise = c.chatCompletion({ model: 'deepseek', messages: [{ role: 'user', content: 'hi' }], stream: false });
      emitResponse(res, { choices: [{ message: { content: 'hello' } }] });
      const result = await promise;
      expect(result).toEqual({ choices: [{ message: { content: 'hello' } }] });
    });
  });

  describe('streamChatCompletion', () => {
    test('throws on prototype pollution attempt', async () => {
      const c = new OpenClawClient();
      const obj = JSON.parse('{"__proto__":{"admin":true}}');
      await expect(c.streamChatCompletion(obj, jest.fn())).rejects.toThrow('prototype pollution');
    });

    test('throws when body exceeds max size', async () => {
      const c = new OpenClawClient();
      const hugeData = { data: 'x'.repeat(11 * 1024 * 1024) };
      await expect(c.streamChatCompletion(hugeData, jest.fn())).rejects.toThrow('Request body too large');
    });

    test('parses SSE stream and resolves on [DONE]', async () => {
      const req = mockRequest();
      const res = mockResponse(200, null);
      http.request.mockImplementation((_url, _opts, cb) => { cb(res); return req; });
      const c = new OpenClawClient();
      const onChunk = jest.fn();
      const promise = c.streamChatCompletion({ model: 't', messages: [] }, onChunk);
      res.emit('data', Buffer.from('data: {"text":"hello"}\ndata: [DONE]\n'));
      res.emit('end');
      const result = await promise;
      expect(result).toEqual({ done: true });
      expect(onChunk).toHaveBeenCalledWith({ text: 'hello' });
    });

    test('resolves on response end without [DONE]', async () => {
      const req = mockRequest();
      const res = mockResponse(200, null);
      http.request.mockImplementation((_url, _opts, cb) => { cb(res); return req; });
      const c = new OpenClawClient();
      const promise = c.streamChatCompletion({ model: 't', messages: [] }, jest.fn());
      res.emit('end');
      const result = await promise;
      expect(result).toEqual({ done: true });
    });

    test('rejects on stream timeout', async () => {
      const req = mockRequest();
      http.request.mockImplementation(() => req);
      const c = new OpenClawClient();
      const promise = c.streamChatCompletion({ model: 't', messages: [] }, jest.fn());
      req.emit('timeout');
      await expect(promise).rejects.toThrow('Stream timeout');
      expect(req.destroy).toHaveBeenCalled();
    });

    test('rejects on network error', async () => {
      const req = mockRequest();
      http.request.mockImplementation(() => req);
      const c = new OpenClawClient();
      const promise = c.streamChatCompletion({ model: 't', messages: [] }, jest.fn());
      req.emit('error', new Error('stream fail'));
      await expect(promise).rejects.toThrow('stream fail');
    });

    test('rejects on response error', async () => {
      const req = mockRequest();
      const res = mockResponse(200, null);
      http.request.mockImplementation((_url, _opts, cb) => { cb(res); return req; });
      const c = new OpenClawClient();
      const promise = c.streamChatCompletion({ model: 't', messages: [] }, jest.fn());
      res.emit('error', new Error('res error'));
      await expect(promise).rejects.toThrow('res error');
    });

    test('rejects when stream response exceeds max size', async () => {
      const req = mockRequest();
      const res = mockResponse(200, null);
      http.request.mockImplementation((_url, _opts, cb) => { cb(res); return req; });
      const c = new OpenClawClient();
      const promise = c.streamChatCompletion({ model: 't', messages: [] }, jest.fn());
      for (let i = 0; i < 11; i++) {
        res.emit('data', Buffer.alloc(10 * 1024 * 1024));
      }
      await expect(promise).rejects.toThrow('Response too large');
      expect(req.destroy).toHaveBeenCalled();
    });

    test('rejects when unsafe URL after overriding gatewayUrl', async () => {
      const c = new OpenClawClient();
      c.gatewayUrl = 'http://evil.com';
      await expect(c.streamChatCompletion({ model: 't', messages: [] }, jest.fn())).rejects.toThrow('Unsafe request URL');
    });

    test('handles SSE data events across chunks', async () => {
      const req = mockRequest();
      const res = mockResponse(200, null);
      http.request.mockImplementation((_url, _opts, cb) => { cb(res); return req; });
      const c = new OpenClawClient();
      const onChunk = jest.fn();
      const promise = c.streamChatCompletion({ model: 't', messages: [] }, onChunk);
      res.emit('data', Buffer.from('data: {"a":1}\ndata: {"b":'));
      res.emit('data', Buffer.from('2}\ndata: [DONE]\n'));
      res.emit('end');
      await promise;
      expect(onChunk).toHaveBeenCalledWith({ a: 1 });
      expect(onChunk).toHaveBeenCalledWith({ b: 2 });
    });
  });

  describe('generate', () => {
    test('throws for invalid prompt', async () => {
      const c = new OpenClawClient();
      await expect(c.generate('')).rejects.toThrow('Invalid prompt');
      await expect(c.generate(123)).rejects.toThrow('Invalid prompt');
    });

    test('returns message content on success', async () => {
      const { res } = setupHttpMock(200, { choices: [{ message: { content: 'Hello world' } }] });
      const c = new OpenClawClient();
      const promise = c.generate('Say hi');
      emitResponse(res, { choices: [{ message: { content: 'Hello world' } }] });
      const result = await promise;
      expect(result).toBe('Hello world');
    });

    test('returns empty string when no choices', async () => {
      const { res } = setupHttpMock(200, {});
      const c = new OpenClawClient();
      const promise = c.generate('test');
      emitResponse(res, {});
      const result = await promise;
      expect(result).toBe('');
    });
  });

  describe('switchModel', () => {
    test('throws for invalid modelId', async () => {
      const c = new OpenClawClient();
      await expect(c.switchModel('')).rejects.toThrow('Invalid model ID');
      await expect(c.switchModel(123)).rejects.toThrow('Invalid model ID');
    });

    test('throws when model not found', async () => {
      const { res } = setupHttpMock(200, { data: [{ id: 'gpt-4' }] });
      const c = new OpenClawClient();
      const promise = c.switchModel('nonexistent');
      res.emit('data', Buffer.from(JSON.stringify({ data: [{ id: 'gpt-4' }] })));
      res.emit('end');
      await expect(promise).rejects.toThrow('Model not found: nonexistent');
    });

    test('returns model when found', async () => {
      const { res } = setupHttpMock(200, { data: [{ id: 'gpt-4' }, { id: 'claude-3' }] });
      const c = new OpenClawClient();
      const promise = c.switchModel('claude-3');
      emitResponse(res, { data: [{ id: 'gpt-4' }, { id: 'claude-3' }] });
      const result = await promise;
      expect(result).toEqual({ id: 'claude-3' });
    });
  });

  describe('listProviders', () => {
    test('returns grouped providers', async () => {
      const { res } = setupHttpMock(200, { data: [{ id: 'openai/gpt4' }, { id: 'anthropic/claude' }] });
      const c = new OpenClawClient();
      const promise = c.listProviders();
      emitResponse(res, { data: [{ id: 'openai/gpt4' }, { id: 'anthropic/claude' }] });
      const result = await promise;
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('openai');
      expect(result[1].id).toBe('anthropic');
      expect(result[0].models).toHaveLength(1);
    });

    test('skips models with empty provider prefix', async () => {
      const { res } = setupHttpMock(200, { data: [{ id: '/only' }, { id: 'valid/m' }] });
      const c = new OpenClawClient();
      const promise = c.listProviders();
      emitResponse(res, { data: [{ id: '/only' }, { id: 'valid/m' }] });
      const result = await promise;
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('valid');
    });
  });

  describe('healthCheck', () => {
    test('returns healthy with latency', async () => {
      const { res } = setupHttpMock(200, { status: 'ok' });
      const c = new OpenClawClient();
      const promise = c.healthCheck();
      emitResponse(res, { status: 'ok' });
      const result = await promise;
      expect(result.healthy).toBe(true);
      expect(typeof result.latency).toBe('number');
    });

    test('returns unhealthy on error', async () => {
      const req = mockRequest();
      http.request.mockImplementation(() => req);
      const c = new OpenClawClient();
      const promise = c.healthCheck();
      req.emit('error', new Error('down'));
      const result = await promise;
      expect(result.healthy).toBe(false);
      expect(result.error).toBe('down');
    });
  });

  describe('disconnect', () => {
    test('sets connected false and emits event', () => {
      const c = new OpenClawClient();
      c.connected = true;
      const handler = jest.fn();
      c.on('disconnected', handler);
      c.disconnect();
      expect(c.connected).toBe(false);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('factory functions', () => {
    test('createOpenClawClient returns new instance', () => {
      const c = createOpenClawClient({ gatewayUrl: 'http://127.0.0.1:3002' });
      expect(c).toBeInstanceOf(OpenClawClient);
    });

    test('getOpenClawClient creates singleton on first call', () => {
      const c1 = getOpenClawClient();
      const c2 = getOpenClawClient();
      expect(c1).toBe(c2);
    });
  });
});
