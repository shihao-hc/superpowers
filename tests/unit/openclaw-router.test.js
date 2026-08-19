jest.mock('express', () => {
  const mockApp = {
    _middleware: [],
    _routes: { get: [], post: [], delete: [] },
    use: jest.fn(function (fn) {
      this._middleware.push(fn);
      return this;
    }),
    get: jest.fn(function (path, fn) {
      this._routes.get.push({ path, fn });
      return this;
    }),
    post: jest.fn(function (path, fn) {
      this._routes.post.push({ path, fn });
      return this;
    }),
    delete: jest.fn(function (path, fn) {
      this._routes.delete.push({ path, fn });
      return this;
    }),
    set: jest.fn(),
    listen: jest.fn(function (port, cb) {
      const server = { close: jest.fn(), timeout: 0 };
      if (cb) Promise.resolve().then(() => cb());
      return server;
    })
  };
  const mockJson = jest.fn(() => (req, res, next) => next());
  const mockUrlencoded = jest.fn(() => (req, res, next) => next());
  const express = jest.fn(() => mockApp);
  express.json = jest.fn(() => mockJson());
  express.urlencoded = jest.fn(() => mockUrlencoded());
  return express;
});

jest.mock('helmet', () => jest.fn(() => (req, res, next) => next()));

const mockHealthCheck = jest.fn();
const mockGetStats = jest.fn();
const mockListModels = jest.fn();
const mockChatCompletions = jest.fn();
const mockCompletions = jest.fn();
const mockInitialize = jest.fn();
const mockGetProviders = jest.fn();
const mockGetModels = jest.fn();
const mockSearchModels = jest.fn();
const mockFilterModels = jest.fn();
const mockStreamChat = jest.fn();
const mockAsk = jest.fn();
const mockAskOnce = jest.fn();
const mockSwitchModel = jest.fn();

jest.mock('../../src/integrations/openclaw/ModelServiceAdapter', () => ({
  ModelServiceAdapter: jest.fn(() => ({
    healthCheck: mockHealthCheck,
    getStats: mockGetStats,
    listModels: mockListModels,
    chatCompletions: mockChatCompletions,
    completions: mockCompletions
  }))
}));

jest.mock('../../src/integrations/openclaw/MultiModelManager', () => ({
  MultiModelManager: jest.fn(() => ({
    initialize: mockInitialize,
    getProviders: mockGetProviders,
    getModels: mockGetModels,
    searchModels: mockSearchModels,
    filterModels: mockFilterModels,
    streamChat: mockStreamChat,
    ask: mockAsk,
    askOnce: mockAskOnce,
    switchModel: mockSwitchModel
  }))
}));

const mockResponseCacheInstance = {
  getStats: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn()
};

jest.mock('../../src/integrations/openclaw/ResponseCache', () => ({
  ResponseCache: jest.fn(() => mockResponseCacheInstance)
}));

const express = require('express');
const { OpenClawRouter, createOpenClawRouter, RateLimiter } = require('../../src/integrations/openclaw/OpenClawRouter');

const mockApp = express();

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should allow first request from an IP', () => {
    expect(limiter.isAllowed('192.168.1.1')).toBe(true);
  });

  it('should allow requests within limit', () => {
    for (let i = 0; i < 99; i++) {
      limiter.isAllowed('10.0.0.1');
    }
    expect(limiter.isAllowed('10.0.0.1')).toBe(true);
  });

  it('should block requests exceeding limit', () => {
    for (let i = 0; i < 100; i++) {
      limiter.isAllowed('10.0.0.2');
    }
    expect(limiter.isAllowed('10.0.0.2')).toBe(false);
  });

  it('should reset window after timeout', () => {
    jest.useFakeTimers();
    for (let i = 0; i < 100; i++) {
      limiter.isAllowed('10.0.0.3');
    }
    expect(limiter.isAllowed('10.0.0.3')).toBe(false);
    jest.advanceTimersByTime(60001);
    expect(limiter.isAllowed('10.0.0.3')).toBe(true);
  });

  it('should treat different IPs independently', () => {
    for (let i = 0; i < 101; i++) {
      limiter.isAllowed('10.0.0.4');
    }
    expect(limiter.isAllowed('10.0.0.4')).toBe(false);
    expect(limiter.isAllowed('10.0.0.5')).toBe(true);
  });

  it('should not block when no prior requests exist', () => {
    expect(limiter.isAllowed('unknown')).toBe(true);
  });

  describe('cleanup', () => {
    it('should remove expired entries', () => {
      jest.useFakeTimers();
      limiter.isAllowed('10.0.0.6');
      limiter.isAllowed('10.0.0.7');
      expect(limiter.requests.size).toBe(2);
      jest.advanceTimersByTime(120001);
      limiter.cleanup();
      expect(limiter.requests.size).toBe(0);
    });

    it('should not remove recent entries', () => {
      jest.useFakeTimers();
      limiter.isAllowed('10.0.0.8');
      jest.advanceTimersByTime(30000);
      limiter.cleanup();
      expect(limiter.requests.size).toBe(1);
    });
  });
});

describe('OpenClawRouter', () => {
  let router;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockApp._middleware = [];
    mockApp._routes = { get: [], post: [], delete: [] };
    router = new OpenClawRouter();
  });

  afterEach(() => {
    if (router._cleanupInterval) {
      clearInterval(router._cleanupInterval);
    }
  });

  describe('constructor', () => {
    it('should set default values', () => {
      expect(router.gatewayUrl).toBe('http://127.0.0.1:3002');
      expect(router.port).toBe(3003);
      expect(router.apiKey).toBe('ultrawork-local-key');
    });

    it('should override with options', () => {
      const r = new OpenClawRouter({
        gatewayUrl: 'http://custom:8080',
        port: 9999,
        apiKey: 'custom-key'
      });
      expect(r.gatewayUrl).toBe('http://custom:8080');
      expect(r.port).toBe(9999);
      expect(r.apiKey).toBe('custom-key');
      clearInterval(r._cleanupInterval);
    });

    it('should read from env vars', () => {
      const prevGateway = process.env.OPENCLAW_GATEWAY_URL;
      const prevKey = process.env.OPENCLAW_API_KEY;
      process.env.OPENCLAW_GATEWAY_URL = 'http://env:3002';
      process.env.OPENCLAW_API_KEY = 'env-key';
      const r = new OpenClawRouter();
      expect(r.gatewayUrl).toBe('http://env:3002');
      expect(r.apiKey).toBe('env-key');
      process.env.OPENCLAW_GATEWAY_URL = prevGateway;
      process.env.OPENCLAW_API_KEY = prevKey;
      clearInterval(r._cleanupInterval);
    });

    it('should set up cleanup interval', () => {
      const r = new OpenClawRouter();
      expect(r._cleanupInterval).toBeDefined();
      expect(r._cleanupInterval.unref).toBeDefined();
      clearInterval(r._cleanupInterval);
    });

    it('should call rateLimiter.cleanup when interval elapses', () => {
      jest.useFakeTimers();
      const r = new OpenClawRouter();
      const cleanupSpy = jest.spyOn(r.rateLimiter, 'cleanup');
      jest.advanceTimersByTime(120001);
      expect(cleanupSpy).toHaveBeenCalled();
      jest.useRealTimers();
      clearInterval(r._cleanupInterval);
    });
  });

  describe('initialize', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should call express()', () => {
      expect(express).toHaveBeenCalled();
    });

    it('should set trust proxy', () => {
      expect(mockApp.set).toHaveBeenCalledWith('trust proxy', 1);
    });

    it('should register middleware', () => {
      expect(mockApp.use).toHaveBeenCalled();
      expect(mockApp._middleware.length).toBeGreaterThan(0);
    });

    it('should register routes', () => {
      expect(mockApp.get).toHaveBeenCalled();
      expect(mockApp.post).toHaveBeenCalled();
      expect(mockApp.delete).toHaveBeenCalled();
    });
  });

  describe('middleware - rate limiting', () => {
    let rateLimitMw;

    beforeEach(async () => {
      await router.initialize();
      const mw = mockApp._middleware;
      rateLimitMw = mw[0];
    });

    it('should allow requests within limit', () => {
      const req = { ip: '10.0.0.10', method: 'GET', path: '/health' };
      const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      const next = jest.fn();
      rateLimitMw(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should reject when limit exceeded', () => {
      const req = { ip: '10.0.0.11', method: 'GET', path: '/health' };
      const next = jest.fn();
      for (let i = 0; i < 100; i++) {
        rateLimitMw({ ip: '10.0.0.11' }, { json: jest.fn(), status: jest.fn().mockReturnThis() }, jest.fn());
      }
      const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      rateLimitMw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Too many requests' }));
      expect(next).not.toHaveBeenCalled();
    });

    it('should fall back to connection address when ip is absent', () => {
      const req = { method: 'GET', path: '/health', connection: { remoteAddress: '192.168.1.5' } };
      const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      const next = jest.fn();
      rateLimitMw(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should fall back to unknown when neither ip nor address present', () => {
      const req = { method: 'GET', path: '/health', connection: {} };
      const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      const next = jest.fn();
      rateLimitMw(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('middleware - API key auth', () => {
    let authMw;

    beforeEach(async () => {
      router = new OpenClawRouter({ apiKey: 'test-key-123' });
      await router.initialize();
      // _setupMiddleware registers 8 middleware (index 0-7), _setupRoutes adds 2 more (404, error)
      // The auth middleware is the 8th (last) from _setupMiddleware, at index 7
      authMw = mockApp._middleware[7];
    });

    it('should allow requests with valid API key for /v1/', () => {
      const req = { path: '/v1/models', headers: { authorization: 'Bearer test-key-123' }, method: 'GET' };
      const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      const next = jest.fn();
      authMw(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should reject requests without API key for /v1/', () => {
      const req = { path: '/v1/models', headers: {}, method: 'GET' };
      const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      const next = jest.fn();
      authMw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing API key' });
    });

    it('should reject requests with invalid API key', () => {
      const req = { path: '/v1/models', headers: { authorization: 'Bearer wrong-key' }, method: 'GET' };
      const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      const next = jest.fn();
      authMw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API key' });
    });

    it('should allow non-api paths without auth', () => {
      const req = { path: '/health', headers: {}, method: 'GET' };
      const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      const next = jest.fn();
      authMw(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should protect /api/ paths too', () => {
      const req = { path: '/api/openclaw/ask', headers: {}, method: 'POST' };
      const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      const next = jest.fn();
      authMw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('middleware - security headers', () => {
    let mw;

    beforeEach(async () => {
      await router.initialize();
      mw = mockApp._middleware;
    });

    it('sets X-XSS-Protection header', () => {
      const req = { ip: '10.0.0.10', method: 'GET', path: '/health' };
      const res = { setHeader: jest.fn(), json: jest.fn(), status: jest.fn().mockReturnThis() };
      const next = jest.fn();
      mw[4](req, res, next);
      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(next).toHaveBeenCalled();
    });

    it('logs request on finish', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const req = { ip: '10.0.0.10', method: 'GET', path: '/health' };
      const res = { on: jest.fn((evt, cb) => { if (evt === 'finish') cb(); }), setHeader: jest.fn() };
      const next = jest.fn();
      mw[5](req, res, next);
      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
      expect(next).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('sets CORS headers for localhost origin', () => {
      const req = { method: 'GET', path: '/health', headers: { origin: 'http://localhost:3000' } };
      const res = { setHeader: jest.fn(), end: jest.fn() };
      const next = jest.fn();
      mw[6](req, res, next);
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:3000');
      expect(next).toHaveBeenCalled();
    });

    it('sets CORS headers for 127.0.0.1 origin', () => {
      const req = { method: 'GET', path: '/health', headers: { origin: 'http://127.0.0.1:8080' } };
      const res = { setHeader: jest.fn(), end: jest.fn() };
      const next = jest.fn();
      mw[6](req, res, next);
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://127.0.0.1:8080');
      expect(next).toHaveBeenCalled();
    });

    it('does not set CORS headers for external origin', () => {
      const req = { method: 'GET', path: '/health', headers: { origin: 'https://evil.com' } };
      const res = { setHeader: jest.fn(), end: jest.fn() };
      const next = jest.fn();
      mw[6](req, res, next);
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('handles OPTIONS preflight request', () => {
      const req = { method: 'OPTIONS', path: '/health', headers: { origin: 'http://localhost:3000' } };
      const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), end: jest.fn() };
      const next = jest.fn();
      mw[6](req, res, next);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });


  async function findAndCallRoute(method, path, req, resOverrides = {}) {
    const routes = mockApp._routes[method] || [];
    const route = routes.find((r) => r.path === path);
    if (!route) throw new Error(`Route not found: ${method} ${path}`);
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      end: jest.fn(),
      write: jest.fn(),
      ...resOverrides
    };
    await route.fn(req, res);
    return res;
  }

  describe('GET /health', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should return healthy status', async () => {
      mockHealthCheck.mockResolvedValue({ status: 'healthy', gateway: 'connected', latency: 5 });
      const res = await findAndCallRoute('get', '/health', {});
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        status: 'healthy',
        version: '1.0.0'
      }));
    });

    it('should return unhealthy status on error', async () => {
      mockHealthCheck.mockRejectedValue(new Error('Connection refused'));
      const res = await findAndCallRoute('get', '/health', {});
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        status: 'unhealthy',
        error: 'Health check failed'
      }));
    });
  });

  describe('GET /stats', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should return service stats', async () => {
      mockGetStats.mockReturnValue({ requests: 42, errors: 0 });
      const res = await findAndCallRoute('get', '/stats', {});
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        requests: 42,
        errors: 0
      }));
    });
  });

  describe('GET /cache/stats', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should return cache stats', async () => {
      mockResponseCacheInstance.getStats.mockReturnValue({ hits: 10, misses: 5, size: 100 });
      const res = await findAndCallRoute('get', '/cache/stats', {});
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        hits: 10,
        misses: 5,
        size: 100
      }));
    });
  });

  describe('DELETE /cache', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should invalidate cache for specific model', async () => {
      mockResponseCacheInstance.invalidate.mockReturnValue(3);
      const res = await findAndCallRoute('delete', '/cache', { query: { model: 'gpt-4' } });
      expect(mockResponseCacheInstance.invalidate).toHaveBeenCalledWith('gpt-4');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        invalidated: 3,
        model: 'gpt-4'
      }));
    });

    it('should invalidate all cache when no model specified', async () => {
      mockResponseCacheInstance.invalidate.mockReturnValue(10);
      const res = await findAndCallRoute('delete', '/cache', { query: {} });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        invalidated: 10,
        model: 'all'
      }));
    });
  });

  describe('GET /v1/models', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should list models successfully', async () => {
      mockListModels.mockResolvedValue({ object: 'list', data: [{ id: 'gpt-4' }] });
      const res = await findAndCallRoute('get', '/v1/models', {});
      expect(res.json).toHaveBeenCalledWith({ object: 'list', data: [{ id: 'gpt-4' }] });
    });

    it('should return 500 on error', async () => {
      mockListModels.mockRejectedValue(new Error('API down'));
      const res = await findAndCallRoute('get', '/v1/models', {});
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('POST /v1/chat/completions', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should validate model parameter', async () => {
      const res = await findAndCallRoute('post', '/v1/chat/completions', {
        body: { messages: [{ role: 'user', content: 'hi' }] }
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid model parameter' });
    });

    it('should validate messages parameter', async () => {
      const res = await findAndCallRoute('post', '/v1/chat/completions', {
        body: { model: 'gpt-4', messages: [] }
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid messages parameter' });
    });

    it('should validate temperature range', async () => {
      const res = await findAndCallRoute('post', '/v1/chat/completions', {
        body: { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }], temperature: 5 }
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Temperature must be between 0 and 2' });
    });

    it('should validate max_tokens range', async () => {
      const res = await findAndCallRoute('post', '/v1/chat/completions', {
        body: { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }], max_tokens: 99999 }
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'max_tokens must be between 1 and 32000' });
    });

    it('should return cached result on hit', async () => {
      const cachedData = { id: 'cached', choices: [{ message: { content: 'cached reply' } }] };
      mockResponseCacheInstance.get.mockReturnValue(cachedData);
      const res = await findAndCallRoute('post', '/v1/chat/completions', {
        body: { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] }
      });
      expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
      expect(res.json).toHaveBeenCalledWith(cachedData);
    });

    it('should call model service on cache miss', async () => {
      mockResponseCacheInstance.get.mockReturnValue(null);
      mockChatCompletions.mockResolvedValue({
        id: 'fresh',
        choices: [{ message: { content: 'fresh reply' } }]
      });
      const res = await findAndCallRoute('post', '/v1/chat/completions', {
        body: { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] }
      });
      expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'MISS');
      expect(mockChatCompletions).toHaveBeenCalled();
      expect(mockResponseCacheInstance.set).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        id: 'fresh'
      }));
    });

    it('should handle errors gracefully', async () => {
      mockChatCompletions.mockRejectedValue(new Error('Provider error'));
      const res = await findAndCallRoute('post', '/v1/chat/completions', {
        body: { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] }
      });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('should not cache streaming requests', async () => {
      mockResponseCacheInstance.get.mockReturnValue(null);
      mockChatCompletions.mockResolvedValue({ id: 'streaming', choices: [{ message: { content: 'stream' } }] });
      mockResponseCacheInstance.set.mockClear();
      await findAndCallRoute('post', '/v1/chat/completions', {
        body: { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }], stream: true }
      });
      expect(mockResponseCacheInstance.set).not.toHaveBeenCalled();
    });

    it('should coerce non-string message content to empty string', async () => {
      mockResponseCacheInstance.get.mockReturnValue(null);
      mockChatCompletions.mockResolvedValue({ id: 'fresh', choices: [{ message: { content: 'ok' } }] });
      await findAndCallRoute('post', '/v1/chat/completions', {
        body: { model: 'gpt-4', messages: [{ role: 'user', content: 123 }] }
      });
      expect(mockChatCompletions).toHaveBeenCalledWith(expect.objectContaining({
        messages: [{ role: 'user', content: '' }]
      }));
    });
  });

  describe('POST /v1/completions', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should validate model and prompt', async () => {
      const res = await findAndCallRoute('post', '/v1/completions', {
        body: { model: 'gpt-4', prompt: 123 }
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing model or prompt' });
    });

    it('should call completions service', async () => {
      mockCompletions.mockResolvedValue({
        id: 'cmpl-1',
        choices: [{ text: 'Hello world' }]
      });
      const res = await findAndCallRoute('post', '/v1/completions', {
        body: { model: 'gpt-4', prompt: 'Hello' }
      });
      expect(mockCompletions).toHaveBeenCalledWith(expect.objectContaining({
        model: 'gpt-4',
        prompt: 'Hello'
      }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        id: 'cmpl-1'
      }));
    });

    it('should return 500 when completions service throws', async () => {
      mockCompletions.mockRejectedValue(new Error('boom'));
      const res = await findAndCallRoute('post', '/v1/completions', {
        body: { model: 'gpt-4', prompt: 'Hello' }
      });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('GET /api/openclaw/providers', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should return providers', async () => {
      mockInitialize.mockResolvedValue();
      mockGetProviders.mockReturnValue(['deepseek-web', 'qwen-web']);
      const res = await findAndCallRoute('get', '/api/openclaw/providers', {});
      expect(mockInitialize).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(['deepseek-web', 'qwen-web']);
    });

    it('should handle errors', async () => {
      mockInitialize.mockRejectedValue(new Error('Init failed'));
      const res = await findAndCallRoute('get', '/api/openclaw/providers', {});
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /api/openclaw/models', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should return all models', async () => {
      mockGetModels.mockResolvedValue([{ id: 'deepseek-chat' }]);
      const res = await findAndCallRoute('get', '/api/openclaw/models', { query: {} });
      expect(res.json).toHaveBeenCalledWith([{ id: 'deepseek-chat' }]);
    });

    it('should search models by query', async () => {
      mockGetModels.mockResolvedValue([{ id: 'gpt-4' }, { id: 'gpt-3' }]);
      mockSearchModels.mockReturnValue([{ id: 'gpt-4' }]);
      const res = await findAndCallRoute('get', '/api/openclaw/models', {
        query: { search: 'gpt' }
      });
      expect(mockSearchModels).toHaveBeenCalledWith('gpt');
      expect(res.json).toHaveBeenCalledWith([{ id: 'gpt-4' }]);
    });

    it('should filter by provider', async () => {
      mockGetModels.mockResolvedValue([{ id: 'deepseek-chat' }]);
      mockFilterModels.mockReturnValue([{ id: 'deepseek-chat' }]);
      const res = await findAndCallRoute('get', '/api/openclaw/models', {
        query: { provider: 'deepseek-web' }
      });
      expect(mockFilterModels).toHaveBeenCalledWith({ provider: 'deepseek-web' });
      expect(res.json).toHaveBeenCalledWith([{ id: 'deepseek-chat' }]);
    });

    it('should return 500 when getModels throws', async () => {
      mockGetModels.mockRejectedValue(new Error('boom'));
      const res = await findAndCallRoute('get', '/api/openclaw/models', { query: {} });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('POST /api/openclaw/ask', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should validate prompt', async () => {
      const res = await findAndCallRoute('post', '/api/openclaw/ask', {
        body: { prompt: 123 }
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid prompt' });
    });

    it('should return non-stream response', async () => {
      mockInitialize.mockResolvedValue();
      mockAsk.mockResolvedValue({ content: 'Hello!' });
      const res = await findAndCallRoute('post', '/api/openclaw/ask', {
        body: { prompt: 'Hi', model: 'gpt-4' }
      });
      expect(mockAsk).toHaveBeenCalledWith('Hi', expect.objectContaining({ model: 'gpt-4' }));
      expect(res.json).toHaveBeenCalledWith({ content: 'Hello!' });
    });

    it('should handle stream mode', async () => {
      mockInitialize.mockResolvedValue();
      mockStreamChat.mockImplementation((messages, options) => {
        const { onChunk } = options;
        onChunk({ choices: [{ delta: { content: 'Hello' } }] });
        onChunk({ choices: [{ delta: { content: ' world' } }] });
      });
      const writeFn = jest.fn();
      const endFn = jest.fn();
      const res = await findAndCallRoute('post', '/api/openclaw/ask', {
        body: { prompt: 'Hi', stream: true }
      }, { write: writeFn, end: endFn });
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(writeFn).toHaveBeenCalledTimes(3);
      expect(writeFn).toHaveBeenLastCalledWith('data: [DONE]\n\n');
      expect(endFn).toHaveBeenCalled();
    });

    it('should return 500 when ask service throws', async () => {
      mockInitialize.mockResolvedValue();
      mockAsk.mockRejectedValue(new Error('boom'));
      const res = await findAndCallRoute('post', '/api/openclaw/ask', {
        body: { prompt: 'Hi', model: 'gpt-4' }
      });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('POST /api/openclaw/ask-once', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should validate prompt', async () => {
      const res = await findAndCallRoute('post', '/api/openclaw/ask-once', {
        body: { prompt: '' }
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid prompt' });
    });

    it('should ask multiple models', async () => {
      mockInitialize.mockResolvedValue();
      mockAskOnce.mockResolvedValue([
        { model: 'gpt-4', content: 'A' },
        { model: 'claude', content: 'B' }
      ]);
      const res = await findAndCallRoute('post', '/api/openclaw/ask-once', {
        body: { prompt: 'Hello', models: ['gpt-4', 'claude'] }
      });
      expect(mockAskOnce).toHaveBeenCalledWith('Hello', ['gpt-4', 'claude'], expect.any(Object));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        prompt: 'Hello',
        results: [{ model: 'gpt-4', content: 'A' }, { model: 'claude', content: 'B' }]
      }));
    });

    it('should return 500 when ask-once service throws', async () => {
      mockInitialize.mockResolvedValue();
      mockAskOnce.mockRejectedValue(new Error('boom'));
      const res = await findAndCallRoute('post', '/api/openclaw/ask-once', {
        body: { prompt: 'Hello', models: ['gpt-4'] }
      });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('should filter non-string models and handle non-array models', async () => {
      mockInitialize.mockResolvedValue();
      mockAskOnce.mockResolvedValue([]);
      const res = await findAndCallRoute('post', '/api/openclaw/ask-once', {
        body: { prompt: 'Hello', models: ['gpt-4', 123, null] }
      });
      expect(mockAskOnce).toHaveBeenCalledWith('Hello', ['gpt-4'], expect.any(Object));
      expect(res.json).toHaveBeenCalled();
    });

    it('should default to empty models when not an array', async () => {
      mockInitialize.mockResolvedValue();
      mockAskOnce.mockResolvedValue([]);
      const res = await findAndCallRoute('post', '/api/openclaw/ask-once', {
        body: { prompt: 'Hello', models: 'not-array' }
      });
      expect(mockAskOnce).toHaveBeenCalledWith('Hello', [], expect.any(Object));
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('POST /api/openclaw/switch-model', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should validate model parameter', async () => {
      const res = await findAndCallRoute('post', '/api/openclaw/switch-model', {
        body: { model: '' }
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid model' });
    });

    it('should switch to valid model', async () => {
      mockInitialize.mockResolvedValue();
      mockSwitchModel.mockResolvedValue({ success: true, model: 'deepseek-chat' });
      const res = await findAndCallRoute('post', '/api/openclaw/switch-model', {
        body: { model: 'deepseek-chat' }
      });
      expect(mockSwitchModel).toHaveBeenCalledWith('deepseek-chat');
      expect(res.json).toHaveBeenCalledWith({ success: true, model: 'deepseek-chat' });
    });

    it('should handle switch error', async () => {
      mockInitialize.mockResolvedValue();
      mockSwitchModel.mockRejectedValue(new Error('Model unavailable'));
      const res = await findAndCallRoute('post', '/api/openclaw/switch-model', {
        body: { model: 'bad-model' }
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid model parameter' });
    });
  });

  describe('404 handler', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should return 404 for unknown routes', () => {
      const allUseCalls = mockApp.use.mock.calls.map((c) => c[0]);
      const notFoundFn = allUseCalls[allUseCalls.length - 2];
      const req = {};
      const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      notFoundFn(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Endpoint not found' });
    });
  });

  describe('error handler', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should return 500 for unhandled errors', () => {
      const allUseCalls = mockApp.use.mock.calls.map((c) => c[0]);
      const errorFn = allUseCalls[allUseCalls.length - 1];
      const err = new Error('Unexpected');
      const req = {};
      const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      errorFn(err, req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('start', () => {
    it('should initialize and start listening', async () => {
      const server = await router.start();
      expect(router.app).toBeDefined();
      expect(server).toBeDefined();
      expect(server.timeout).toBe(180000);
    });
  });

  describe('stop', () => {
    it('should close the server if running', async () => {
      await router.start();
      const closeSpy = router.server.close;
      router.stop();
      expect(closeSpy).toHaveBeenCalled();
    });

    it('should not throw if server is not running', () => {
      expect(() => router.stop()).not.toThrow();
    });
  });
});

describe('createOpenClawRouter', () => {
  it('should create a new OpenClawRouter instance', () => {
    const instance = createOpenClawRouter({ port: 4000 });
    expect(instance).toBeInstanceOf(OpenClawRouter);
    expect(instance.port).toBe(4000);
    clearInterval(instance._cleanupInterval);
  });

  it('should work without options', () => {
    const instance = createOpenClawRouter();
    expect(instance).toBeInstanceOf(OpenClawRouter);
    clearInterval(instance._cleanupInterval);
  });
});
