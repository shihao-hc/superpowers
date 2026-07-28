const { BaseLLMAdapter, OpenAIAdapter, DeepSeekAdapter, GoogleAdapter, DashScopeAdapter, OpenClawAdapter, createLLMAdapter } = require('../../src/multiagent/patterns/BaseLLMAdapter');

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
  });

  describe('generate', () => {
    test('throws when request fails', async () => {
      const adapter = new OpenAIAdapter({ apiKey: 'test', baseUrl: 'http://localhost:1' });
      await expect(adapter.generate([{ role: 'user', content: 'hi' }]))
        .rejects.toThrow();
    });
  });
});

describe('DeepSeekAdapter', () => {
  test('sets type deepseek and default model', () => {
    const adapter = new DeepSeekAdapter({ apiKey: 'test' });
    expect(adapter.type).toBe('deepseek');
    expect(adapter.config.model).toBe('deepseek-chat');
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

  test('creates DashScope adapter for "qwen"', () => {
    expect(createLLMAdapter('qwen', { apiKey: 'k' }).type).toBe('dashscope');
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
