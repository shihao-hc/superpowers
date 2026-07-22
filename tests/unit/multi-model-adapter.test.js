'use strict';

const MultiModelAdapter = require('../../src/agent/MultiModelAdapter');

const mockFetchResponse = (data) => ({
  json: jest.fn().mockResolvedValue(data)
});

describe('MultiModelAdapter', () => {
  let adapter;

  beforeAll(() => {
    global.fetch = jest.fn();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new MultiModelAdapter();
  });

  afterAll(() => {
    delete global.fetch;
  });

  describe('constructor', () => {
    it('should register 5 default providers', () => {
      expect(adapter.providers.size).toBe(5);
      expect(adapter.providers.has('ollama')).toBe(true);
      expect(adapter.providers.has('openai')).toBe(true);
      expect(adapter.providers.has('anthropic')).toBe(true);
      expect(adapter.providers.has('deepseek')).toBe(true);
      expect(adapter.providers.has('gemini')).toBe(true);
    });

    it('should set default values', () => {
      expect(adapter.defaultProvider).toBe('ollama');
      expect(adapter.fallbackOrder).toEqual(['ollama', 'openai', 'anthropic', 'deepseek']);
      expect(adapter.timeout).toBe(30000);
      expect(adapter.retryAttempts).toBe(2);
    });

    it('should accept custom options', () => {
      const custom = new MultiModelAdapter({
        defaultProvider: 'openai',
        fallbackOrder: ['openai', 'anthropic'],
        timeout: 5000,
        retryAttempts: 1
      });
      expect(custom.defaultProvider).toBe('openai');
      expect(custom.fallbackOrder).toEqual(['openai', 'anthropic']);
      expect(custom.timeout).toBe(5000);
      expect(custom.retryAttempts).toBe(1);
    });
  });

  describe('registerProvider', () => {
    it('should register a custom provider', () => {
      adapter.registerProvider('custom', {
        name: 'Custom AI',
        baseUrl: 'http://custom:8080',
        models: ['custom-v1'],
        defaultModel: 'custom-v1',
        generate: async (prompt) => `echo: ${prompt}`
      });

      const provider = adapter.providers.get('custom');
      expect(provider.name).toBe('Custom AI');
      expect(provider.baseUrl).toBe('http://custom:8080');
      expect(provider.models).toEqual(['custom-v1']);
      expect(provider.defaultModel).toBe('custom-v1');
      expect(provider.available).toBe(true);
      expect(provider.requestCount).toBe(0);
      expect(provider.errorCount).toBe(0);
    });

    it('should use name when config.name is not provided', () => {
      adapter.registerProvider('anon', {
        baseUrl: 'http://anon',
        defaultModel: 'm1',
        generate: async () => 'ok'
      });
      expect(adapter.providers.get('anon').name).toBe('anon');
    });
  });

  describe('generate', () => {
    it('should generate with default provider (ollama)', async () => {
      global.fetch.mockResolvedValue(mockFetchResponse({ response: 'ollama reply' }));
      const result = await adapter.generate('hello');
      expect(result).toBe('ollama reply');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.any(Object)
      );
    });

    it('should generate with specified provider', async () => {
      adapter.registerProvider('custom', {
        name: 'Custom',
        baseUrl: 'http://custom',
        models: ['m1'],
        defaultModel: 'm1',
        generate: async (prompt) => `echo: ${prompt}`
      });
      const result = await adapter.generate('hello', { provider: 'custom' });
      expect(result).toBe('echo: hello');
    });

    it('should throw when provider does not exist', async () => {
      await expect(adapter.generate('hello', { provider: 'ghost' }))
        .rejects.toThrow('Provider not found: ghost');
    });

    it('should fallback when first provider fails', async () => {
      const fast = new MultiModelAdapter({ retryAttempts: 0 });
      fast.providers.clear();
      fast.registerProvider('primary', {
        name: 'Primary', baseUrl: 'http://a', models: ['m1'], defaultModel: 'm1',
        generate: async () => { throw new Error('Primary down'); }
      });
      fast.registerProvider('backup', {
        name: 'Backup', baseUrl: 'http://b', models: ['m1'], defaultModel: 'm1',
        generate: async (prompt) => `backup: ${prompt}`
      });
      fast.defaultProvider = 'primary';
      fast.fallbackOrder = ['primary', 'backup'];

      const result = await fast.generate('hello');
      expect(result).toBe('backup: hello');
    });

    it('should fail when all providers fail', async () => {
      const fast = new MultiModelAdapter({ retryAttempts: 0 });
      fast.providers.clear();
      fast.registerProvider('p1', {
        name: 'P1', baseUrl: 'http://a', models: ['m1'], defaultModel: 'm1',
        generate: async () => { throw new Error('P1 error'); }
      });
      fast.defaultProvider = 'p1';
      fast.fallbackOrder = ['p1'];

      await expect(fast.generate('hello')).rejects.toThrow('P1 error');
    });

    it('should retry on failure before falling back', async () => {
      let callCount = 0;
      const slow = new MultiModelAdapter({ retryAttempts: 1 });
      slow.providers.clear();
      slow.registerProvider('p1', {
        name: 'P1', baseUrl: 'http://a', models: ['m1'], defaultModel: 'm1',
        generate: async () => {
          callCount++;
          if (callCount < 2) { throw new Error('Temp fail'); }
          return 'success after retry';
        }
      });
      slow.defaultProvider = 'p1';
      slow.fallbackOrder = ['p1'];

      const result = await slow.generate('hello');
      expect(result).toBe('success after retry');
      expect(callCount).toBe(2);
    }, 5000);
  });

  describe('generateWithVision', () => {
    it('should use ollama for vision when it succeeds', async () => {
      global.fetch.mockResolvedValue(mockFetchResponse({ response: 'ollama vision' }));
      const result = await adapter.generateWithVision('base64img', 'describe');
      expect(result).toBe('ollama vision');
    });

    it('should fallback to openai when ollama fails', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      global.fetch
        .mockRejectedValueOnce(new Error('Ollama error'))
        .mockResolvedValueOnce(
          mockFetchResponse({ choices: [{ message: { content: 'openai vision' } }] })
        );
      const result = await adapter.generateWithVision('img', 'describe');
      expect(result).toBe('openai vision');
      delete process.env.OPENAI_API_KEY;
    });

    it('should throw when all vision providers fail', async () => {
      global.fetch.mockRejectedValue(new Error('All down'));
      await expect(
        adapter.generateWithVision('img', 'describe')
      ).rejects.toThrow('No vision provider available');
    });
  });

  describe('getAvailableProviders', () => {
    it('should return all providers with stats', () => {
      const providers = adapter.getAvailableProviders();
      expect(providers).toHaveLength(5);

      const ollama = providers.find((p) => p.key === 'ollama');
      expect(ollama.name).toBe('Ollama');
      expect(ollama.available).toBe(true);
      expect(ollama.models).toContain('llama3.2');
      expect(ollama.defaultModel).toBe('llama3.2');
      expect(ollama.stats).toBeDefined();
      expect(ollama.stats.requests).toBe(0);
      expect(ollama.stats.errors).toBe(0);
    });
  });

  describe('setDefaultProvider', () => {
    it('should change the default provider', () => {
      adapter.setDefaultProvider('openai');
      expect(adapter.defaultProvider).toBe('openai');
    });

    it('should throw for non-existent provider', () => {
      expect(() => adapter.setDefaultProvider('ghost')).toThrow('Provider not found: ghost');
    });
  });

  describe('healthCheck', () => {
    it('should return health status for all providers', () => {
      const health = adapter.healthCheck();
      expect(Object.keys(health)).toHaveLength(5);
      expect(health.ollama).toBeDefined();
      expect(health.ollama.available).toBe(true);
      expect(health.ollama.errorRate).toBe('0%');
    });

    it('should show error rate after failed requests', async () => {
      const fast = new MultiModelAdapter({ retryAttempts: 0 });
      fast.providers.clear();
      fast.registerProvider('p1', {
        name: 'P1', baseUrl: 'http://a', models: ['m1'], defaultModel: 'm1',
        generate: async () => { throw new Error('fail'); }
      });
      fast.defaultProvider = 'p1';
      fast.fallbackOrder = ['p1'];
      await expect(fast.generate('x')).rejects.toThrow();
      const health = fast.healthCheck();
      expect(health.p1.errorRate).toBe('100.00%');
    });

    it('should show zero error rate when no requests made', () => {
      const health = adapter.healthCheck();
      for (const name of Object.keys(health)) {
        expect(health[name].errorRate).toBe('0%');
      }
    });
  });

  describe('generate - openai provider', () => {
    it('should generate with openai provider', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      global.fetch.mockResolvedValue(mockFetchResponse({ choices: [{ message: { content: 'openai reply' } }] }));
      const result = await adapter.generate('hello', { provider: 'openai' });
      expect(result).toBe('openai reply');
      delete process.env.OPENAI_API_KEY;
    });

    it('should throw when OPENAI_API_KEY is not set', async () => {
      delete process.env.OPENAI_API_KEY;
      for (const key of [...adapter.providers.keys()]) {
        if (key !== 'openai') adapter.providers.delete(key);
      }
      adapter.defaultProvider = 'openai';
      adapter.fallbackOrder = ['openai'];
      adapter.retryAttempts = 0;
      await expect(adapter.generate('hello')).rejects.toThrow('OPENAI_API_KEY not set');
    });
  });

  describe('generate - anthropic provider', () => {
    it('should generate with anthropic provider', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      global.fetch.mockResolvedValue(mockFetchResponse({ content: [{ text: 'anthropic reply' }] }));
      const result = await adapter.generate('hello', { provider: 'anthropic' });
      expect(result).toBe('anthropic reply');
      delete process.env.ANTHROPIC_API_KEY;
    });

    it('should throw when ANTHROPIC_API_KEY is not set', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      for (const key of [...adapter.providers.keys()]) {
        if (key !== 'anthropic') adapter.providers.delete(key);
      }
      adapter.defaultProvider = 'anthropic';
      adapter.fallbackOrder = ['anthropic'];
      adapter.retryAttempts = 0;
      await expect(adapter.generate('hello')).rejects.toThrow('ANTHROPIC_API_KEY not set');
    });
  });

  describe('generate - deepseek provider', () => {
    it('should generate with deepseek provider', async () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      global.fetch.mockResolvedValue(mockFetchResponse({ choices: [{ message: { content: 'deepseek reply' } }] }));
      const result = await adapter.generate('hello', { provider: 'deepseek' });
      expect(result).toBe('deepseek reply');
      delete process.env.DEEPSEEK_API_KEY;
    });

    it('should throw when DEEPSEEK_API_KEY is not set', async () => {
      delete process.env.DEEPSEEK_API_KEY;
      for (const key of [...adapter.providers.keys()]) {
        if (key !== 'deepseek') adapter.providers.delete(key);
      }
      adapter.defaultProvider = 'deepseek';
      adapter.fallbackOrder = ['deepseek'];
      adapter.retryAttempts = 0;
      await expect(adapter.generate('hello')).rejects.toThrow('DEEPSEEK_API_KEY not set');
    });
  });

  describe('generate - gemini provider', () => {
    it('should generate with gemini provider', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      global.fetch.mockResolvedValue(mockFetchResponse({ candidates: [{ content: { parts: [{ text: 'gemini reply' }] } }] }));
      const result = await adapter.generate('hello', { provider: 'gemini' });
      expect(result).toBe('gemini reply');
      delete process.env.GEMINI_API_KEY;
    });

    it('should throw when GEMINI_API_KEY is not set', async () => {
      delete process.env.GEMINI_API_KEY;
      for (const key of [...adapter.providers.keys()]) {
        if (key !== 'gemini') adapter.providers.delete(key);
      }
      adapter.defaultProvider = 'gemini';
      adapter.fallbackOrder = ['gemini'];
      adapter.retryAttempts = 0;
      await expect(adapter.generate('hello')).rejects.toThrow('GEMINI_API_KEY not set');
    });
  });

  describe('generate - timeout', () => {
    it('should timeout when provider takes too long', async () => {
      const fast = new MultiModelAdapter({ timeout: 10, retryAttempts: 0 });
      fast.registerProvider('slow', {
        name: 'Slow', baseUrl: 'http://slow', models: ['m1'], defaultModel: 'm1',
        generate: async () => {
          await new Promise(r => setTimeout(r, 1000));
          return 'too late';
        }
      });
      fast.defaultProvider = 'slow';
      fast.fallbackOrder = ['slow'];
      await expect(fast.generate('hello')).rejects.toThrow('Timeout');
    }, 5000);
  });

  describe('generate - fallback edge cases', () => {
    it('should skip unavailable fallback provider', async () => {
      const fast = new MultiModelAdapter({ retryAttempts: 0 });
      fast.registerProvider('p1', {
        name: 'P1', baseUrl: 'http://a', models: ['m1'], defaultModel: 'm1',
        generate: async () => { throw new Error('P1 error'); }
      });
      fast.registerProvider('p2', {
        name: 'P2', baseUrl: 'http://b', models: ['m1'], defaultModel: 'm1',
        generate: async () => { throw new Error('P2 error'); }
      });
      fast.defaultProvider = 'p1';
      fast.fallbackOrder = ['p1', 'p2'];
      fast.providers.get('p2').available = false;
      await expect(fast.generate('hello')).rejects.toThrow('P1 error');
    });

    it('should skip non-existent fallback provider', async () => {
      const fast = new MultiModelAdapter({ retryAttempts: 0 });
      fast.registerProvider('p1', {
        name: 'P1', baseUrl: 'http://a', models: ['m1'], defaultModel: 'm1',
        generate: async () => { throw new Error('P1 error'); }
      });
      fast.defaultProvider = 'p1';
      fast.fallbackOrder = ['p1', 'nonexistent'];
      await expect(fast.generate('hello')).rejects.toThrow('P1 error');
    });
  });

  describe('generateWithVision - gemini', () => {
    it('should use gemini for vision when ollama and openai fail', async () => {
      global.fetch
        .mockRejectedValueOnce(new Error('Ollama down'))
        .mockRejectedValueOnce(new Error('OpenAI down'))
        .mockResolvedValueOnce(
          mockFetchResponse({ candidates: [{ content: { parts: [{ text: 'gemini vision reply' }] } }] })
        );
      const result = await adapter.generateWithVision('img', 'describe');
      expect(result).toBe('gemini vision reply');
    });
  });

  describe('generateWithVision - edge cases', () => {
    it('should skip unavailable vision provider', async () => {
      adapter.providers.get('ollama').available = false;
      global.fetch.mockResolvedValue(
        mockFetchResponse({ choices: [{ message: { content: 'openai vision' } }] })
      );
      const result = await adapter.generateWithVision('img', 'describe');
      expect(result).toBe('openai vision');
    });
  });
});
