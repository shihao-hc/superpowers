'use strict';

const { VisionAgent } = require('../../src/agents/VisionAgent');

describe('VisionAgent', () => {
  let agent;

  beforeEach(() => {
    agent = new VisionAgent();
  });

  describe('constructor', () => {
    it('defaults to localhost:11434', () => {
      expect(agent.ollamaEndpoint).toBe('http://localhost:11434');
    });

    it('defaults model to llava', () => {
      expect(agent.defaultModel).toBe('llava');
    });

    it('defaults maxImageSize to 1024', () => {
      expect(agent.maxImageSize).toBe(1024);
    });

    it('defaults timeout to 60000', () => {
      expect(agent.timeout).toBe(60000);
    });

    it('defaults memoryAgent to null', () => {
      expect(agent.memoryAgent).toBeNull();
    });

    it('accepts custom options', () => {
      const memory = { remember: jest.fn() };
      const a = new VisionAgent({
        ollamaEndpoint: 'http://custom:11434',
        defaultModel: 'bakllava',
        maxImageSize: 512,
        timeout: 30000,
        memoryAgent: memory
      });
      expect(a.ollamaEndpoint).toBe('http://custom:11434');
      expect(a.defaultModel).toBe('bakllava');
      expect(a.maxImageSize).toBe(512);
      expect(a.timeout).toBe(30000);
      expect(a.memoryAgent).toBe(memory);
    });
  });

  describe('_validateEndpoint', () => {
    it('returns valid localhost endpoint unchanged', () => {
      const result = agent._validateEndpoint('http://localhost:11434');
      expect(result).toBe('http://localhost:11434');
    });

    it('strips trailing slash', () => {
      const result = agent._validateEndpoint('http://localhost:11434/');
      expect(result).toBe('http://localhost:11434');
    });

    it('returns 127.0.0.1 endpoint unchanged', () => {
      const result = agent._validateEndpoint('http://127.0.0.1:11434');
      expect(result).toBe('http://127.0.0.1:11434');
    });

    it('warns on non-localhost endpoint', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const result = agent._validateEndpoint('http://example.com:11434');
      expect(result).toBe('http://example.com:11434');
      expect(warnSpy).toHaveBeenCalledWith(
        '[VisionAgent] Non-localhost endpoint:',
        'http://example.com:11434'
      );
      warnSpy.mockRestore();
    });

    it('returns default for invalid URL', () => {
      const result = agent._validateEndpoint('::not-a-valid-url::');
      expect(result).toBe('http://localhost:11434');
    });
  });

  describe('_buildPrompt', () => {
    it('includes personality and mood', () => {
      const prompt = agent._buildPrompt('What is this?', 'AI助手', 'happy');
      expect(prompt).toContain('AI助手');
      expect(prompt).toContain('开心');
      expect(prompt).toContain('What is this?');
    });

    it('uses default mood description for unknown mood', () => {
      const prompt = agent._buildPrompt('test', 'Bot', 'unknown');
      expect(prompt).toContain('自然');
    });

    it('uses default question when prompt is empty', () => {
      const prompt = agent._buildPrompt('', 'Bot', 'neutral');
      expect(prompt).toContain('请描述这张图片');
    });

    it('contains style instructions', () => {
      const prompt = agent._buildPrompt('test', 'Bot', 'neutral');
      expect(prompt).toContain('简洁有力');
      expect(prompt).toContain('100字以内');
      expect(prompt).toContain('详细描述');
    });
  });

  describe('_extractBase64', () => {
    it('handles plain base64 string', () => {
      const result = agent._extractBase64('abc123');
      expect(result).toBe('abc123');
    });

    it('extracts base64 from data URL', () => {
      const result = agent._extractBase64('data:image/png;base64,iVBORw0KGgo=');
      expect(result).toBe('iVBORw0KGgo=');
    });

    it('throws for non-string input', () => {
      expect(() => agent._extractBase64(null)).toThrow('Invalid image format');
      expect(() => agent._extractBase64(123)).toThrow('Invalid image format');
      expect(() => agent._extractBase64({})).toThrow('Invalid image format');
    });
  });

  describe('_inferMoodFromDescription', () => {
    it('returns happy for happy keywords', () => {
      expect(agent._inferMoodFromDescription('这张图片很漂亮')).toBe('happy');
      expect(agent._inferMoodFromDescription('amazing view')).toBe('happy');
    });

    it('returns excited for excited keywords', () => {
      expect(agent._inferMoodFromDescription('哇，这个太厉害了')).toBe('excited');
      expect(agent._inferMoodFromDescription('incredible!')).toBe('excited');
    });

    it('returns curious for curious keywords', () => {
      expect(agent._inferMoodFromDescription('这个很有趣')).toBe('curious');
      expect(agent._inferMoodFromDescription('interesting!')).toBe('curious');
    });

    it('returns worried for worried keywords', () => {
      expect(agent._inferMoodFromDescription('太危险了')).toBe('worried');
      expect(agent._inferMoodFromDescription('dangerous!')).toBe('worried');
    });

    it('returns calm for calm keywords', () => {
      expect(agent._inferMoodFromDescription('宁静的风景')).toBe('calm');
      expect(agent._inferMoodFromDescription('peaceful scene')).toBe('calm');
    });

    it('returns sad for sad keywords', () => {
      expect(agent._inferMoodFromDescription('好悲伤')).toBe('sad');
      expect(agent._inferMoodFromDescription('lonely place')).toBe('sad');
    });

    it('returns neutral when no mood keywords match', () => {
      expect(agent._inferMoodFromDescription('这个桌子是木头的')).toBe('neutral');
    });

    it('returns neutral for empty description', () => {
      expect(agent._inferMoodFromDescription('')).toBe('neutral');
    });

    it('returns happy when emoji is present', () => {
      expect(agent._inferMoodFromDescription('🎉 celebration')).toBe('happy');
      expect(agent._inferMoodFromDescription('😊 smile')).toBe('happy');
    });
  });

  describe('isSupported', () => {
    it('returns ollama true in node environment', () => {
      const result = agent.isSupported();
      expect(result.ollama).toBe(true);
    });

    it('returns camera and screen falsy in node', () => {
      const result = agent.isSupported();
      expect(result.camera).toBeFalsy();
      expect(result.screen).toBeFalsy();
      expect(result.ollama).toBe(true);
    });

    it('returns camera and screen truthy when mediaDevices available', () => {
      const origNavigator = global.navigator;
      global.navigator = {
        mediaDevices: {
          getUserMedia: jest.fn(),
          getDisplayMedia: jest.fn()
        }
      };

      const result = agent.isSupported();
      expect(result.camera).toBeTruthy();
      expect(result.screen).toBeTruthy();

      global.navigator = origNavigator;
    });
  });

  describe('analyzeScreenshot', () => {
    it('delegates to analyze with game prompt', async () => {
      const analyzeSpy = jest.spyOn(agent, 'analyze')
        .mockResolvedValue({ ok: true, description: 'test', mood: 'neutral' });

      const result = await agent.analyzeScreenshot('base64data', 'What danger?', { personality: 'Bot' });
      expect(analyzeSpy).toHaveBeenCalledWith('base64data', 'What danger?', { personality: 'Bot' });
      expect(result.description).toBe('test');
      analyzeSpy.mockRestore();
    });

    it('uses default task prompt when task is empty', async () => {
      const analyzeSpy = jest.spyOn(agent, 'analyze')
        .mockResolvedValue({ ok: true, description: 'test', mood: 'neutral' });

      await agent.analyzeScreenshot('base64data', '', {});
      expect(analyzeSpy.mock.calls[0][1]).toContain('什么');
      analyzeSpy.mockRestore();
    });

    it('defaults context to empty object when not provided', async () => {
      const analyzeSpy = jest.spyOn(agent, 'analyze')
        .mockResolvedValue({ ok: true, description: 'test', mood: 'neutral' });

      await agent.analyzeScreenshot('base64data');
      expect(analyzeSpy.mock.calls[0][2]).toEqual({});
      analyzeSpy.mockRestore();
    });
  });

  describe('analyze', () => {
    afterEach(() => {
      if (global.fetch) {
        delete global.fetch;
      }
    });

    it('returns success response from ollama', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          response: 'A beautiful mountain landscape',
          model: 'llava',
          total_duration: 1500000000,
          eval_count: 120
        })
      });

      const result = await agent.analyze('base64img', 'What is this?', { personality: 'Bot' });
      expect(result.ok).toBe(true);
      expect(result.description).toBe('A beautiful mountain landscape');
      expect(result.model).toBe('llava');
      expect(result.totalDuration).toBe(1500000000);
      expect(result.evalCount).toBe(120);
    });

    it('returns error on HTTP failure', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503
      });

      const result = await agent.analyze('img', 'test');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('503');
    });

    it('returns error on network failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await agent.analyze('img', 'test');
      expect(result.ok).toBe(false);
      expect(result.error).toBe('ECONNREFUSED');
    });

    it('stores interaction in memory agent when configured', async () => {
      const memory = { remember: jest.fn().mockResolvedValue(undefined) };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          response: 'A mountain',
          model: 'llava',
          total_duration: 1000,
          eval_count: 50
        })
      });

      const a = new VisionAgent({ memoryAgent: memory });
      await a.analyze('img', 'describe', { personality: 'Bot' });
      expect(memory.remember).toHaveBeenCalledWith('vision_interaction', expect.objectContaining({
        prompt: 'describe',
        model: 'llava'
      }));
    });

    it('infers mood from description', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          response: 'This is beautiful!',
          model: 'llava',
          total_duration: 1000,
          eval_count: 10
        })
      });

      const result = await agent.analyze('img', 'test');
      expect(result.mood).toBe('happy');
    });

    it('uses context personality and mood defaults', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          response: 'A scene',
          model: 'llava',
          total_duration: 1000,
          eval_count: 10
        })
      });

      const result = await agent.analyze('img', 'test');
      expect(result.ok).toBe(true);
    });
  });

  describe('chatWithImage', () => {
    afterEach(() => {
      if (global.fetch) {
        delete global.fetch;
      }
    });

    it('returns chat response from ollama', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          message: { content: 'I see a cat in the image' },
          model: 'llava'
        })
      });

      const messages = [
        { role: 'system', content: 'You are a helpful AI.' },
        { role: 'user', content: 'What is in this image?' }
      ];

      const result = await agent.chatWithImage('base64img', messages);
      expect(result.ok).toBe(true);
      expect(result.text).toBe('I see a cat in the image');
      expect(result.model).toBe('llava');
    });

    it('attaches image only to last user message', async () => {
      let capturedBody;
      global.fetch = jest.fn().mockImplementation(async (_url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: () => Promise.resolve({ message: { content: 'ok' }, model: 'llava' })
        };
      });

      const messages = [
        { role: 'system', content: 'Be helpful.' },
        { role: 'user', content: 'What is this?' }
      ];

      await agent.chatWithImage('imgdata', messages);
      expect(capturedBody.messages[0].images).toBeUndefined();
      expect(capturedBody.messages[1].images).toEqual(['imgdata']);
    });

    it('returns error on HTTP failure', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500
      });

      const result = await agent.chatWithImage('img', []);
      expect(result.ok).toBe(false);
    });

    it('returns error on network failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));

      const result = await agent.chatWithImage('img', []);
      expect(result.ok).toBe(false);
    });

    it('handles empty message content gracefully', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ message: {}, model: 'llava' })
      });

      const result = await agent.chatWithImage('img', [{ role: 'user', content: 'hi' }]);
      expect(result.text).toBe('');
    });
  });

  describe('listAvailableModels', () => {
    afterEach(() => {
      if (global.fetch) {
        delete global.fetch;
      }
    });

    it('returns vision models from tags endpoint', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          models: [
            { name: 'llava:latest' },
            { name: 'bakllava:latest' },
            { name: 'mistral:latest' },
            { name: 'moondream:latest' }
          ]
        })
      });

      const models = await agent.listAvailableModels();
      const names = models.map((m) => m.name);
      expect(names).toContain('llava:latest');
      expect(names).toContain('bakllava:latest');
      expect(names).toContain('moondream:latest');
      expect(names).not.toContain('mistral:latest');
    });

    it('returns empty array on fetch failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed'));

      const models = await agent.listAvailableModels();
      expect(models).toEqual([]);
    });

    it('returns empty array on HTTP error', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false });

      const models = await agent.listAvailableModels();
      expect(models).toEqual([]);
    });

    it('returns empty array when no models in response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({})
      });

      const models = await agent.listAvailableModels();
      expect(models).toEqual([]);
    });

    it('case-insensitively matches vision keywords', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          models: [
            { name: 'LLAVA-v2' },
            { name: 'MiniCPM-vision' },
            { name: 'glm-4v' }
          ]
        })
      });

      const models = await agent.listAvailableModels();
      expect(models.length).toBe(3);
    });
  });
});
