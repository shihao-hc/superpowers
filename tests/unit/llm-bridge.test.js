'use strict';

const mockGenerateWithRetry = jest.fn();
const mockStreamGenerate = jest.fn();
const mockChat = jest.fn();
const mockGetStats = jest.fn();
const mockGetSupportedProviders = jest.fn();

jest.mock('../../src/agent/LLMAdapter', () => {
  const EE = require('events');
  const MockLLMAdapter = jest.fn().mockImplementation((opts) => {
    const instance = new EE();
    instance.options = opts;
    instance.generateWithRetry = mockGenerateWithRetry;
    instance.streamGenerate = mockStreamGenerate;
    instance.chat = mockChat;
    instance.getStats = mockGetStats;
    return instance;
  });
  MockLLMAdapter.getSupportedProviders = mockGetSupportedProviders;
  return { LLMAdapter: MockLLMAdapter };
});

const { LLMBridge } = require('../../src/agent/LLMBridge');

describe('LLMBridge', () => {
  let bridge;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_API_KEY;
    bridge = new LLMBridge();
  });

  describe('constructor', () => {
    it('sets default options from defaults', () => {
      expect(bridge.options).toEqual({
        provider: 'ollama',
        model: 'llama3.2',
        baseUrl: 'http://localhost:11434',
        apiKey: null,
        temperature: 0.7,
        maxTokens: 2048,
        enableStreaming: true
      });
      expect(bridge.initialized).toBe(false);
      expect(bridge.adapter).toBeNull();
    });

    it('reads options from env vars when set', () => {
      process.env.LLM_PROVIDER = 'openai';
      process.env.LLM_MODEL = 'gpt-4o';
      process.env.LLM_BASE_URL = 'https://api.openai.com/v1';
      process.env.LLM_API_KEY = 'sk-test';
      const envBridge = new LLMBridge();
      expect(envBridge.options.provider).toBe('openai');
      expect(envBridge.options.model).toBe('gpt-4o');
      expect(envBridge.options.baseUrl).toBe('https://api.openai.com/v1');
      expect(envBridge.options.apiKey).toBe('sk-test');
    });

    it('accepts custom options overriding defaults', () => {
      const custom = new LLMBridge({
        provider: 'anthropic',
        model: 'claude-3-haiku',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant',
        temperature: 0.3,
        maxTokens: 4096,
        enableStreaming: false
      });
      expect(custom.options.provider).toBe('anthropic');
      expect(custom.options.model).toBe('claude-3-haiku');
      expect(custom.options.baseUrl).toBe('https://api.anthropic.com');
      expect(custom.options.apiKey).toBe('sk-ant');
      expect(custom.options.temperature).toBe(0.3);
      expect(custom.options.maxTokens).toBe(4096);
      expect(custom.options.enableStreaming).toBe(false);
    });

    it('enableStreaming defaults to true when omitted', () => {
      expect(bridge.options.enableStreaming).toBe(true);
    });
  });

  describe('initialize', () => {
    it('creates adapter and sets initialized', async () => {
      await bridge.initialize();
      expect(bridge.initialized).toBe(true);
      expect(bridge.adapter).not.toBeNull();
      expect(bridge.adapter.on).toBeDefined();
    });

    it('skips if already initialized', async () => {
      await bridge.initialize();
      const adapter = bridge.adapter;
      await bridge.initialize();
      expect(bridge.adapter).toBe(adapter);
    });

    it('handles adapter creation failure gracefully', async () => {
      const MockAdapter = require('../../src/agent/LLMAdapter').LLMAdapter;
      MockAdapter.mockImplementationOnce(() => {
        throw new Error('Adapter creation failed');
      });
      const bad = new LLMBridge();
      await bad.initialize();
      expect(bad.initialized).toBe(false);
      expect(bad.adapter).toBeNull();
    });
  });

  describe('infer', () => {
    it('calls initialize if not initialized', async () => {
      const spy = jest.spyOn(bridge, 'initialize');
      mockGenerateWithRetry.mockResolvedValue({ response: 'Hello' });
      await bridge.infer('test');
      expect(spy).toHaveBeenCalled();
    });

    it('returns error result if adapter is null', async () => {
      bridge.initialized = true;
      bridge.adapter = null;
      const result = await bridge.infer('test');
      expect(result).toEqual({
        text: '[LLMBridge] Not initialized',
        success: false
      });
    });

    it('returns successful result with text and stats', async () => {
      await bridge.initialize();
      mockGenerateWithRetry.mockResolvedValue({ response: 'Hello world', tokens: 5 });
      mockGetStats.mockReturnValue({ totalRequests: 1 });

      const result = await bridge.infer('hello');

      expect(result.success).toBe(true);
      expect(result.text).toBe('Hello world');
      expect(result.tokens).toBe(5);
      expect(result.stats).toEqual({ totalRequests: 1 });
    });

    it('extracts text from content field when response is absent', async () => {
      await bridge.initialize();
      mockGenerateWithRetry.mockResolvedValue({ content: 'Content response', tokens: 3 });
      mockGetStats.mockReturnValue({});

      const result = await bridge.infer('test');
      expect(result.text).toBe('Content response');
    });

    it('stringifies result when no response or content field', async () => {
      await bridge.initialize();
      mockGenerateWithRetry.mockResolvedValue({ tokens: 2 });

      const result = await bridge.infer('test');
      expect(result.text).toBe('[object Object]');
    });

    it('defaults tokens to 0 when not in result', async () => {
      await bridge.initialize();
      mockGenerateWithRetry.mockResolvedValue({ response: 'Hi' });

      const result = await bridge.infer('test');
      expect(result.tokens).toBe(0);
    });

    it('delegates to _streamInfer when options.stream is true', async () => {
      await bridge.initialize();
      const streamSpy = jest.spyOn(bridge, '_streamInfer');
      mockStreamGenerate.mockReturnValue((async function* () {
        yield { type: 'content', delta: 'A', done: false };
      })());

      await bridge.infer('test', { stream: true });
      expect(streamSpy).toHaveBeenCalledWith('test', { stream: true });
    });

    it('returns stream errors from adapter', async () => {
      await bridge.initialize();
      mockGenerateWithRetry.mockRejectedValue(new Error('Inference failed'));

      const result = await bridge.infer('test');

      expect(result.success).toBe(false);
      expect(result.text).toBe('Error: Inference failed');
    });
  });

  describe('_streamInfer', () => {
    it('yields content, error, and done events from stream', async () => {
      await bridge.initialize();
      mockStreamGenerate.mockReturnValue((async function* () {
        yield { type: 'content', delta: 'Hello', done: false };
        yield { type: 'error', error: 'Oops' };
        yield { type: 'done', content: 'Hello', tokens: 5 };
      })());

      const gen = await bridge.infer('test', { stream: true });
      const chunks = [];
      for await (const chunk of gen) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ type: 'content', delta: 'Hello', done: false });
      expect(chunks[1]).toEqual({ type: 'error', content: 'Oops' });
      expect(chunks[2]).toEqual({ type: 'done', content: 'Hello', tokens: 5 });
    });

    it('yields error event if adapter is null', async () => {
      bridge.initialized = true;
      bridge.adapter = null;
      const stream = bridge._streamInfer('test');
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({ type: 'error', content: '[LLMBridge] Not initialized' });
    });

    it('handles stream errors gracefully', async () => {
      await bridge.initialize();
      mockStreamGenerate.mockImplementation(() => {
        throw new Error('Stream failure');
      });

      const gen = await bridge.infer('test', { stream: true });
      const chunks = [];
      for await (const chunk of gen) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({ type: 'error', content: 'Stream failure' });
    });

    it('should handle unknown event types from stream', async () => {
      await bridge.initialize();
      mockStreamGenerate.mockReturnValue((async function* () {
        yield { type: 'unknown', data: 'foo' };
        yield { type: 'done', content: 'Bye', tokens: 0 };
      })());

      const gen = await bridge.infer('test', { stream: true });
      const chunks = [];
      for await (const chunk of gen) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('done');
    });

    it('should initialize in _streamInfer if not initialized', async () => {
      bridge.initialized = false;
      bridge.adapter = null;
      mockStreamGenerate.mockReturnValue((async function* () {
        yield { type: 'content', delta: 'Hello', done: true };
      })());

      const spy = jest.spyOn(bridge, 'initialize');
      const stream = bridge._streamInfer('test');
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(spy).toHaveBeenCalled();
      expect(chunks).toHaveLength(1);
    });
  });

  describe('chat', () => {
    it('calls initialize if not initialized', async () => {
      const spy = jest.spyOn(bridge, 'initialize');
      mockChat.mockResolvedValue({ response: 'Chat reply' });
      await bridge.chat([{ role: 'user', content: 'Hi' }]);
      expect(spy).toHaveBeenCalled();
    });

    it('returns error result if adapter is null', async () => {
      bridge.initialized = true;
      bridge.adapter = null;
      const result = await bridge.chat([{ role: 'user', content: 'Hi' }]);
      expect(result).toEqual({
        text: '[LLMBridge] Not initialized',
        success: false
      });
    });

    it('returns chat result from adapter', async () => {
      await bridge.initialize();
      mockChat.mockResolvedValue({ response: 'Chat reply' });

      const result = await bridge.chat([{ role: 'user', content: 'Hi' }]);

      expect(result.success).toBe(true);
      expect(result.text).toBe('Chat reply');
      expect(mockChat).toHaveBeenCalledWith(
        [{ role: 'user', content: 'Hi' }],
        { temperature: 0.7, maxTokens: 2048 }
      );
    });

    it('extracts chat text from content field', async () => {
      await bridge.initialize();
      mockChat.mockResolvedValue({ content: 'Content reply' });

      const result = await bridge.chat([{ role: 'user', content: 'Hi' }]);
      expect(result.text).toBe('Content reply');
    });

    it('handles chat errors gracefully', async () => {
      await bridge.initialize();
      mockChat.mockRejectedValue(new Error('Chat failed'));

      const result = await bridge.chat([{ role: 'user', content: 'Hi' }]);

      expect(result.success).toBe(false);
      expect(result.text).toBe('Error: Chat failed');
    });

    it('should stringify chat result when no response or content field', async () => {
      await bridge.initialize();
      mockChat.mockResolvedValue({ other: 'data' });

      const result = await bridge.chat([{ role: 'user', content: 'Hi' }]);

      expect(result.success).toBe(true);
      expect(result.text).toBe('[object Object]');
    });
  });

  describe('getStats', () => {
    it('returns stats from adapter when initialized', async () => {
      await bridge.initialize();
      mockGetStats.mockReturnValue({ totalRequests: 5 });

      const stats = bridge.getStats();
      expect(stats).toEqual({ totalRequests: 5 });
    });

    it('returns null when adapter is not initialized', () => {
      expect(bridge.getStats()).toBeNull();
    });
  });

  describe('getSupportedProviders', () => {
    it('delegates to LLMAdapter.getSupportedProviders', () => {
      const providers = [{ name: 'ollama' }];
      mockGetSupportedProviders.mockReturnValue(providers);

      const result = bridge.getSupportedProviders();
      expect(result).toBe(providers);
      expect(mockGetSupportedProviders).toHaveBeenCalled();
    });
  });
});
