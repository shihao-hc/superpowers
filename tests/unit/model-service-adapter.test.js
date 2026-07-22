const { ModelServiceAdapter, createModelService, getModelService } = require('../../src/integrations/openclaw/ModelServiceAdapter');

const mockClient = {
  listModels: jest.fn(),
  chatCompletion: jest.fn(),
  healthCheck: jest.fn()
};

jest.mock('../../src/integrations/openclaw/OpenClawClient', () => ({
  OpenClawClient: jest.fn().mockImplementation(() => mockClient)
}));

describe('ModelServiceAdapter', () => {
  let adapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new ModelServiceAdapter();
  });

  describe('constructor', () => {
    it('sets default values', () => {
      expect(adapter.gatewayUrl).toBe('http://127.0.0.1:3002');
      expect(adapter.apiKey).toBe('ultrawork-local-key');
      expect(adapter.timeout).toBe(180000);
      expect(adapter.client).toBeNull();
      expect(adapter.initialized).toBe(false);
      expect(adapter.models).toEqual([]);
      expect(adapter.stats).toEqual({ requests: 0, tokens: 0, errors: 0, lastRequest: null });
    });

    it('accepts custom options', () => {
      const custom = new ModelServiceAdapter({
        gatewayUrl: 'http://custom:3002',
        apiKey: 'custom-key',
        timeout: 5000
      });
      expect(custom.gatewayUrl).toBe('http://custom:3002');
      expect(custom.apiKey).toBe('custom-key');
      expect(custom.timeout).toBe(5000);
    });

    it('is an EventEmitter', () => {
      expect(adapter.emit).toBeDefined();
      expect(adapter.on).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('initializes client and fetches models', async () => {
      mockClient.listModels.mockResolvedValue([{ id: 'gpt-4' }, { id: 'gpt-3.5' }]);
      const emitSpy = jest.spyOn(adapter, 'emit');
      await adapter.initialize();
      expect(adapter.initialized).toBe(true);
      expect(adapter.models).toEqual([{ id: 'gpt-4' }, { id: 'gpt-3.5' }]);
      expect(adapter.client).toBeTruthy();
      expect(emitSpy).toHaveBeenCalledWith('ready', { modelCount: 2 });
    });

    it('is idempotent when already initialized', async () => {
      adapter.initialized = true;
      mockClient.listModels.mockRejectedValue(new Error('should not be called'));
      await adapter.initialize();
      expect(mockClient.listModels).not.toHaveBeenCalled();
    });

    it('emits error and throws on failure', async () => {
      const testError = new Error('Connection failed');
      mockClient.listModels.mockRejectedValue(testError);
      const emitSpy = jest.spyOn(adapter, 'emit');
      await expect(adapter.initialize()).rejects.toThrow('Connection failed');
      expect(emitSpy).toHaveBeenCalledWith('error', testError);
    });

    it('creates OpenClawClient with correct config', async () => {
      const custom = new ModelServiceAdapter({ gatewayUrl: 'http://test:3002', apiKey: 'test-key', timeout: 9999 });
      const { OpenClawClient } = require('../../src/integrations/openclaw/OpenClawClient');
      mockClient.listModels.mockResolvedValue([]);
      await custom.initialize();
      expect(OpenClawClient).toHaveBeenCalledWith({
        gatewayUrl: 'http://test:3002',
        token: 'test-key',
        timeout: 9999
      });
    });
  });

  describe('listModels', () => {
    it('returns OpenAI-compatible model list', async () => {
      const now = Date.now();
      mockClient.listModels.mockResolvedValue([
        { id: 'openai/gpt-4', created: now }
      ]);
      const result = await adapter.listModels();
      expect(result.object).toBe('list');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('openai/gpt-4');
      expect(result.data[0].object).toBe('model');
      expect(result.data[0].owned_by).toBe('openai');
      expect(result.data[0].permission).toEqual([]);
      expect(result.data[0].root).toBe('openai/gpt-4');
      expect(result.data[0].parent).toBeNull();
    });

    it('handles model without owned_by', async () => {
      mockClient.listModels.mockResolvedValue([
        { id: 'gpt-4' }
      ]);
      const result = await adapter.listModels();
      expect(result.data[0].owned_by).toBe('gpt-4');
    });

    it('initializes if not initialized', async () => {
      const initSpy = jest.spyOn(adapter, 'initialize').mockResolvedValue();
      mockClient.listModels.mockResolvedValue([]);
      adapter.initialized = false;
      await adapter.listModels();
      expect(initSpy).toHaveBeenCalled();
      initSpy.mockRestore();
    });
  });

  describe('chatCompletions', () => {
    beforeEach(async () => {
      mockClient.listModels.mockResolvedValue([{ id: 'gpt-4' }]);
      await adapter.initialize();
    });

    it('returns OpenAI-compatible chat completion', async () => {
      mockClient.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      });
      const result = await adapter.chatCompletions({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }]
      });
      expect(result.object).toBe('chat.completion');
      expect(result.choices[0].message.content).toBe('Hello!');
      expect(result.choices[0].finish_reason).toBe('stop');
      expect(result.usage.total_tokens).toBe(15);
      expect(adapter.stats.requests).toBe(1);
      expect(adapter.stats.tokens).toBe(15);
    });

    it('throws when model not found', async () => {
      await expect(adapter.chatCompletions({
        model: 'nonexistent',
        messages: [{ role: 'user', content: 'Hi' }]
      })).rejects.toThrow('Model not found: nonexistent');
    });

    it('returns stream response when stream is true', async () => {
      mockClient.chatCompletion.mockResolvedValue({
        choices: [{ delta: { content: 'Hello' } }]
      });
      const result = await adapter.chatCompletions({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true
      });
      expect(result.object).toBe('chat.completion.chunk');
      expect(result.choices[0].delta).toEqual({ role: 'assistant', content: '' });
    });

    it('emits error on failure', async () => {
      mockClient.chatCompletion.mockRejectedValue(new Error('API error'));
      const emitSpy = jest.spyOn(adapter, 'emit');
      await expect(adapter.chatCompletions({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }]
      })).rejects.toThrow('API error');
      expect(adapter.stats.errors).toBe(1);
      expect(emitSpy).toHaveBeenCalledWith('error', expect.any(Error));
    });

    it('handles empty choices from upstream', async () => {
      mockClient.chatCompletion.mockResolvedValue({});
      const result = await adapter.chatCompletions({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }]
      });
      expect(result.choices[0].message.content).toBe('');
      expect(result.choices[0].finish_reason).toBe('stop');
    });

    it('updates stats.lastRequest', async () => {
      mockClient.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: {}
      });
      const before = adapter.stats.lastRequest;
      await adapter.chatCompletions({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }]
      });
      expect(adapter.stats.lastRequest).toBeTruthy();
      expect(adapter.stats.lastRequest).not.toBe(before);
    });

    it('handles missing usage in response', async () => {
      mockClient.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }]
      });
      const result = await adapter.chatCompletions({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }]
      });
      expect(result.usage.total_tokens).toBe(0);
    });

    it('initializes if not initialized', async () => {
      adapter.initialized = false;
      adapter.models = [];
      mockClient.listModels.mockResolvedValue([{ id: 'gpt-4' }]);
      mockClient.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: {}
      });
      await adapter.chatCompletions({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }]
      });
      expect(adapter.initialized).toBe(true);
    });
  });

  describe('completions', () => {
    beforeEach(async () => {
      mockClient.listModels.mockResolvedValue([{ id: 'gpt-4' }]);
      await adapter.initialize();
    });

    it('returns OpenAI-compatible text completion', async () => {
      mockClient.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'The answer is 42' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
      });
      const result = await adapter.completions({
        model: 'gpt-4',
        prompt: 'What is the answer?'
      });
      expect(result.object).toBe('text_completion');
      expect(result.choices[0].text).toBe('The answer is 42');
      expect(result.choices[0].logprobs).toBeNull();
      expect(result.usage.total_tokens).toBe(10);
    });

    it('converts array prompt to string', async () => {
      mockClient.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: {}
      });
      const result = await adapter.completions({
        model: 'gpt-4',
        prompt: ['part1', 'part2']
      });
      expect(result.choices[0].text).toBe('ok');
    });

    it('uses defaults for optional params', async () => {
      mockClient.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: {}
      });
      const result = await adapter.completions({
        model: 'gpt-4',
        prompt: 'hello'
      });
      expect(result.choices[0].text).toBe('ok');
    });

    it('handles empty content in completions', async () => {
      mockClient.chatCompletion.mockResolvedValue({
        choices: [{ message: {}, finish_reason: 'stop' }],
        usage: {}
      });
      const result = await adapter.completions({
        model: 'gpt-4',
        prompt: 'hello'
      });
      expect(result.choices[0].text).toBe('');
    });

    it('defaults finish_reason to stop in completions', async () => {
      jest.spyOn(adapter, 'chatCompletions').mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
        usage: {}
      });
      const result = await adapter.completions({
        model: 'gpt-4',
        prompt: 'hello'
      });
      expect(result.choices[0].finish_reason).toBe('stop');
    });
  });

  describe('_createStreamResponse', () => {
    it('creates a chat completion chunk', () => {
      const result = adapter._createStreamResponse({}, 'gpt-4', {});
      expect(result.object).toBe('chat.completion.chunk');
      expect(result.model).toBe('gpt-4');
      expect(result.choices[0].delta).toEqual({ role: 'assistant', content: '' });
      expect(result.choices[0].finish_reason).toBeNull();
    });
  });

  describe('getStats', () => {
    it('returns service statistics', () => {
      adapter.initialized = true;
      adapter.stats.requests = 10;
      adapter.stats.tokens = 500;
      adapter.models = [{ id: 'm1' }];
      const stats = adapter.getStats();
      expect(stats.requests).toBe(10);
      expect(stats.tokens).toBe(500);
      expect(stats.initialized).toBe(true);
      expect(stats.modelCount).toBe(1);
      expect(stats.gatewayUrl).toBe('http://127.0.0.1:3002');
      expect(stats.uptime).toBe(0);
    });

    it('calculates uptime when lastRequest exists', () => {
      adapter.stats.lastRequest = new Date(Date.now() - 5000).toISOString();
      const stats = adapter.getStats();
      expect(stats.uptime).toBeGreaterThanOrEqual(4000);
      expect(stats.uptime).toBeLessThanOrEqual(6000);
    });
  });

  describe('healthCheck', () => {
    beforeEach(() => {
      adapter.client = mockClient;
    });

    it('returns healthy when gateway responds', async () => {
      mockClient.healthCheck.mockResolvedValue({ healthy: true, latency: 50 });
      const result = await adapter.healthCheck();
      expect(result.status).toBe('healthy');
      expect(result.gateway).toBe('connected');
      expect(result.latency).toBe(50);
    });

    it('returns unhealthy when gateway reports unhealthy', async () => {
      mockClient.healthCheck.mockResolvedValue({ healthy: false, latency: 100 });
      const result = await adapter.healthCheck();
      expect(result.status).toBe('unhealthy');
      expect(result.gateway).toBe('disconnected');
    });

    it('returns unhealthy on error', async () => {
      mockClient.healthCheck.mockRejectedValue(new Error('timeout'));
      const result = await adapter.healthCheck();
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('timeout');
      expect(result.gateway).toBe('disconnected');
    });
  });

  describe('resetStats', () => {
    it('resets all statistics', () => {
      adapter.stats.requests = 100;
      adapter.stats.tokens = 9999;
      adapter.stats.errors = 5;
      adapter.stats.lastRequest = 'some-date';
      adapter.resetStats();
      expect(adapter.stats).toEqual({
        requests: 0,
        tokens: 0,
        errors: 0,
        lastRequest: null
      });
    });
  });

  describe('singleton functions', () => {
    beforeEach(() => {
      // Reset module state by resetting the module
      jest.resetModules();
    });

    it('createModelService creates new instance', () => {
      const service = createModelService({ timeout: 5000 });
      expect(service).toBeInstanceOf(ModelServiceAdapter);
      expect(service.timeout).toBe(5000);
    });

    it('createModelService works without options', () => {
      const service = createModelService();
      expect(service).toBeInstanceOf(ModelServiceAdapter);
      expect(service.timeout).toBe(180000);
    });

    it('getModelService creates and reuses singleton', () => {
      const s1 = getModelService({ timeout: 1000 });
      const s2 = getModelService({ timeout: 9999 });
      expect(s1).toBe(s2);
      expect(s1.timeout).toBe(1000);
    });
  });
});
