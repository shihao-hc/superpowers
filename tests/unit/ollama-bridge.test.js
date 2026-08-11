const mockOllama = jest.fn();
const mockOllamaInstances = [];

class MockOllama {
  constructor(...args) {
    mockOllama(...args);
    this.list = jest.fn();
    this.chat = jest.fn();
    this.generate = jest.fn();
    mockOllamaInstances.push(this);
  }
}

jest.mock('ollama', () => ({
  Ollama: MockOllama,
}));

const { OllamaBridge } = require('../../src/localInferencing/OllamaBridge');

describe('OllamaBridge', () => {
  let originalEnv;
  let consoleErrorSpy;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_PORT;
    delete process.env.OLLAMA_MODEL;
    delete process.env.MAX_TOKENS;
    delete process.env.DEFAULT_TEMPERATURE;
    mockOllama.mockReset();
    mockOllamaInstances.length = 0;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleErrorSpy.mockRestore();
  });

  const makeBridge = () => {
    const bridge = new OllamaBridge();
    return bridge;
  };

  test('constructor builds host from options and env', () => {
    process.env.OLLAMA_HOST = 'http://ollama.local';
    process.env.OLLAMA_PORT = '12345';
    process.env.OLLAMA_MODEL = 'llama3';
    const bridge = new OllamaBridge();
    expect(bridge.host).toBe('http://ollama.local');
    expect(bridge.port).toBe('12345');
    expect(bridge.defaultModel).toBe('llama3');
    expect(mockOllama).toHaveBeenCalledWith({ host: 'http://ollama.local:12345' });
    expect(bridge.connected).toBe(false);
  });

  test('constructor honors explicit options over env', () => {
    process.env.OLLAMA_HOST = 'http://env.local';
    const bridge = new OllamaBridge({ host: 'http://opt.local', model: 'opt-model' });
    expect(bridge.host).toBe('http://opt.local');
    expect(bridge.defaultModel).toBe('opt-model');
  });

  test('constructor parses MAX_TOKENS and DEFAULT_TEMPERATURE', () => {
    process.env.MAX_TOKENS = '512';
    process.env.DEFAULT_TEMPERATURE = '0.3';
    const bridge = new OllamaBridge();
    expect(bridge.maxTokens).toBe(512);
    expect(bridge.defaultTemperature).toBe(0.3);
  });

  test('constructor falls back to defaults when env unset', () => {
    const bridge = makeBridge();
    expect(bridge.maxTokens).toBe(256);
    expect(bridge.defaultTemperature).toBe(0.8);
  });

  describe('checkConnection', () => {
    test('returns true when client.list succeeds', async () => {
      const bridge = makeBridge();
      bridge.client.list.mockResolvedValue({});
      expect(await bridge.checkConnection()).toBe(true);
      expect(bridge.connected).toBe(true);
    });

    test('returns false when client.list throws', async () => {
      const bridge = makeBridge();
      bridge.client.list.mockRejectedValue(new Error('conn refused'));
      expect(await bridge.checkConnection()).toBe(false);
      expect(bridge.connected).toBe(false);
    });
  });

  describe('listModels', () => {
    test('returns models array', async () => {
      const bridge = makeBridge();
      bridge.client.list.mockResolvedValue({ models: [{ name: 'llama3.2' }] });
      expect(await bridge.listModels()).toEqual([{ name: 'llama3.2' }]);
    });

    test('returns empty array when models missing', async () => {
      const bridge = makeBridge();
      bridge.client.list.mockResolvedValue({});
      expect(await bridge.listModels()).toEqual([]);
    });

    test('returns empty array on error', async () => {
      const bridge = makeBridge();
      bridge.client.list.mockRejectedValue(new Error('boom'));
      expect(await bridge.listModels()).toEqual([]);
    });
  });

  describe('chat', () => {
    test('throws on empty messages', async () => {
      const bridge = makeBridge();
      await expect(bridge.chat([])).rejects.toThrow('Invalid messages array');
    });

    test('throws on non-array messages', async () => {
      const bridge = makeBridge();
      await expect(bridge.chat('hello')).rejects.toThrow('Invalid messages array');
    });

    test('sanitizes roles, truncates content, slices history', async () => {
      const bridge = makeBridge();
      bridge.client.chat.mockResolvedValue({
        message: { content: '  response text  ' },
        eval_count: 10,
        prompt_eval_count: 5,
      });
      const longContent = 'x'.repeat(20000);
      const messages = [{ role: 'weird-role', content: longContent }];
      const result = await bridge.chat(messages);
      expect(bridge.client.chat).toHaveBeenCalledWith({
        model: 'llama3.2',
        messages: [{ role: 'user', content: longContent.substring(0, 10000) }],
        options: { temperature: 0.8, num_predict: 256 },
        stream: false,
      });
      expect(result).toEqual({
        ok: true,
        text: 'response text',
        model: 'llama3.2',
        done: true,
        evalCount: 10,
        promptEvalCount: 5,
      });
    });

    test('uses empty string for missing content', async () => {
      const bridge = makeBridge();
      bridge.client.chat.mockResolvedValue({ message: {} });
      const messages = [{ role: 'user', content: null }];
      const result = await bridge.chat(messages);
      expect(bridge.client.chat).toHaveBeenCalledWith({
        model: 'llama3.2',
        messages: [{ role: 'user', content: '' }],
        options: { temperature: 0.8, num_predict: 256 },
        stream: false,
      });
      expect(result.text).toBe('');
    });

    test('slices messages beyond MAX_MESSAGE_HISTORY', async () => {
      const bridge = makeBridge();
      bridge.client.chat.mockResolvedValue({ message: { content: 'ok' } });
      const messages = Array.from({ length: 25 }, (_, i) => ({ role: 'user', content: `m${i}` }));
      await bridge.chat(messages);
      const sent = bridge.client.chat.mock.calls[0][0].messages;
      expect(sent).toHaveLength(20);
      expect(sent[0].content).toBe('m5');
      expect(sent[19].content).toBe('m24');
    });

    test('returns raw response when stream enabled', async () => {
      const bridge = makeBridge();
      bridge.client.chat.mockResolvedValue({ raw: 'stream' });
      const messages = [{ role: 'user', content: 'hi' }];
      const result = await bridge.chat(messages, { stream: true });
      expect(result).toEqual({ raw: 'stream' });
    });

    test('uses custom model, temperature, maxTokens options', async () => {
      const bridge = makeBridge();
      bridge.client.chat.mockResolvedValue({ message: { content: 'x' } });
      await bridge.chat([{ role: 'user', content: 'hi' }], {
        model: 'custom',
        temperature: 0.1,
        maxTokens: 999,
      });
      const call = bridge.client.chat.mock.calls[0][0];
      expect(call.model).toBe('custom');
      expect(call.options).toEqual({ temperature: 0.1, num_predict: 999 });
    });
  });

  describe('infer', () => {
    test('builds system+user messages when no provided messages', async () => {
      const bridge = makeBridge();
      bridge.client.chat.mockResolvedValue({
        message: { content: '你好' },
        eval_count: 7,
        model: 'llama3.2',
      });
      const result = await bridge.infer('你是谁', { name: '小虾', mood: 'happy' });
      expect(result.ok).toBe(true);
      expect(result.text).toBe('你好');
      expect(result.mood).toBe('happy');
      expect(result.tokens).toBe(7);
      const sent = bridge.client.chat.mock.calls[0][0];
      expect(sent.messages[0].role).toBe('system');
      expect(sent.messages[0].content).toContain('小虾');
      expect(sent.messages[1]).toEqual({ role: 'user', content: '你是谁' });
    });

    test('prepends system prompt when provided messages lack system', async () => {
      const bridge = makeBridge();
      bridge.client.chat.mockResolvedValue({ message: { content: 'x' }, eval_count: 0 });
      await bridge.infer('hello', {
        messages: [{ role: 'user', content: 'hi' }],
      });
      const sent = bridge.client.chat.mock.calls[0][0];
      expect(sent.messages).toHaveLength(2);
      expect(sent.messages[0].role).toBe('system');
    });

    test('keeps provided messages when they already have system', async () => {
      const bridge = makeBridge();
      bridge.client.chat.mockResolvedValue({ message: { content: 'x' }, eval_count: 0 });
      await bridge.infer('hello', {
        messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
      });
      const sent = bridge.client.chat.mock.calls[0][0];
      expect(sent.messages).toHaveLength(2);
      expect(sent.messages[0].content).toBe('sys');
    });

    test('returns error object on chat failure', async () => {
      const bridge = makeBridge();
      bridge.client.chat.mockRejectedValue(new Error('api down'));
      const result = await bridge.infer('hello');
      expect(result.ok).toBe(false);
      expect(result.text).toContain('api down');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Ollama inference error:', 'api down'
      );
    });

    test('truncates long input to MAX_INPUT_LENGTH', async () => {
      const bridge = makeBridge();
      bridge.client.chat.mockResolvedValue({ message: { content: 'x' }, eval_count: 0 });
      const longInput = 'y'.repeat(15000);
      await bridge.infer(longInput);
      const sent = bridge.client.chat.mock.calls[0][0];
      expect(sent.messages[1].content).toHaveLength(10000);
    });
  });

  describe('_buildSystemPrompt', () => {
    test('builds prompt with traits and mood', () => {
      const bridge = makeBridge();
      const prompt = bridge._buildSystemPrompt('小虾', 'happy', { 性格: '开朗', 年龄: '18' });
      expect(prompt).toContain('名字是小虾');
      expect(prompt).toContain('性格:开朗, 年龄:18');
      expect(prompt).toContain('开心、活泼');
    });

    test('uses raw mood when unknown', () => {
      const bridge = makeBridge();
      const prompt = bridge._buildSystemPrompt('x', 'mysterious', {});
      expect(prompt).toContain('mysterious - mysterious');
    });

    test('handles empty traits', () => {
      const bridge = makeBridge();
      const prompt = bridge._buildSystemPrompt('x', 'calm', {});
      expect(prompt).toContain('- \n');
    });
  });

  describe('analyzeImage', () => {
    test('throws when no image data', async () => {
      const bridge = makeBridge();
      await expect(bridge.analyzeImage(null, 'desc')).rejects.toThrow('Image data required');
    });

    test('strips data: prefix from base64', async () => {
      const bridge = makeBridge();
      bridge.client.generate.mockResolvedValue({
        response: 'a cat', model: 'llava', total_duration: 100, eval_count: 5,
      });
      const result = await bridge.analyzeImage('data:image/png;base64,AAAA', 'what is this');
      expect(bridge.client.generate).toHaveBeenCalledWith({
        model: 'llava',
        prompt: 'what is this',
        images: ['AAAA'],
        stream: false,
        options: { temperature: 0.3 },
      });
      expect(result).toEqual({
        ok: true,
        description: 'a cat',
        model: 'llava',
        totalDuration: 100,
        evalCount: 5,
      });
    });

    test('throws on invalid base64 format', async () => {
      const bridge = makeBridge();
      await expect(bridge.analyzeImage('!!!not-base64!!!', 'x')).rejects.toThrow('Invalid base64 format');
    });

    test('throws when base64 too large', async () => {
      const bridge = makeBridge();
      const big = 'A'.repeat(15 * 1024 * 1024);
      await expect(bridge.analyzeImage(big, 'x')).rejects.toThrow('Image too large');
    });

    test('uses default prompt when prompt omitted', async () => {
      const bridge = makeBridge();
      bridge.client.generate.mockResolvedValue({ response: 'x', model: 'llava' });
      await bridge.analyzeImage('AAAA');
      const call = bridge.client.generate.mock.calls[0][0];
      expect(call.prompt).toBe('请详细描述这张图片的内容');
    });

    test('returns error object on generate failure', async () => {
      const bridge = makeBridge();
      bridge.client.generate.mockRejectedValue(new Error('vision down'));
      const result = await bridge.analyzeImage('AAAA', 'x');
      expect(result.ok).toBe(false);
      expect(result.description).toContain('vision down');
    });
  });

  describe('chatWithImage', () => {
    test('attaches image to last user message', async () => {
      const bridge = makeBridge();
      bridge.client.chat.mockResolvedValue({ message: { content: 'ok' }, eval_count: 3 });
      const messages = [
        { role: 'system', content: 'sys' },
        { role: 'user', content: '看图片' },
      ];
      const result = await bridge.chatWithImage(messages, 'data:image/png;base64,BASE');
      expect(bridge.client.chat).toHaveBeenCalledWith({
        model: 'llava',
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: '看图片', images: ['data:image/png;base64,BASE'] },
        ],
        options: { temperature: 0.8 },
      });
      expect(result).toEqual({ ok: true, text: 'ok', model: 'llava', evalCount: 3 });
    });

    test('throws on empty messages', async () => {
      const bridge = makeBridge();
      await expect(bridge.chatWithImage([], 'BASE')).rejects.toThrow('Invalid messages array');
    });

    test('sanitizes non-last messages without image', async () => {
      const bridge = makeBridge();
      bridge.client.chat.mockResolvedValue({ message: { content: 'ok' } });
      const messages = [{ role: 'bad-role', content: 'x' }];
      await bridge.chatWithImage(messages, null);
      const sent = bridge.client.chat.mock.calls[0][0].messages;
      expect(sent[0]).toEqual({ role: 'user', content: 'x' });
    });

    test('defaults missing content to empty string for image and non-last messages', async () => {
      const bridge = makeBridge();
      bridge.client.chat.mockResolvedValue({ message: {} });
      const messages = [
        { role: 'system', content: null },
        { role: 'user', content: null },
      ];
      const result = await bridge.chatWithImage(messages, 'data:image/png;base64,BASE');
      const sent = bridge.client.chat.mock.calls[0][0].messages;
      expect(sent[0]).toEqual({ role: 'system', content: '' });
      expect(sent[1]).toEqual({ role: 'user', content: '', images: ['data:image/png;base64,BASE'] });
      expect(result.text).toBe('');
    });
  });

  describe('listVisionModels', () => {
    test('filters vision models by keyword', async () => {
      const bridge = makeBridge();
      bridge.client.list.mockResolvedValue({
        models: [
          { name: 'llama3.2' },
          { name: 'llava:latest' },
          { name: 'moondream' },
          { name: 'gemma' },
        ],
      });
      const result = await bridge.listVisionModels();
      expect(result.map((m) => m.name)).toEqual(['llava:latest', 'moondream']);
    });

    test('returns empty on error', async () => {
      const bridge = makeBridge();
      bridge.client.list.mockRejectedValue(new Error('boom'));
      expect(await bridge.listVisionModels()).toEqual([]);
    });

    test('returns empty when listModels throws', async () => {
      const bridge = makeBridge();
      jest.spyOn(bridge, 'listModels').mockRejectedValue(new Error('internal'));
      expect(await bridge.listVisionModels()).toEqual([]);
    });
  });
});
