class MultiModelAdapter {
  constructor(options = {}) {
    this.providers = new Map();
    this.defaultProvider = options.defaultProvider || 'ollama';
    this.fallbackOrder = options.fallbackOrder || ['ollama', 'openai', 'anthropic', 'deepseek'];
    this.timeout = options.timeout || 30000;
    this.retryAttempts = options.retryAttempts || 2;

    this._registerDefaults();
  }

  _registerDefaults() {
    this.registerProvider('ollama', {
      name: 'Ollama',
      baseUrl: 'http://localhost:11434',
      models: ['llama3.2', 'qwen2.5', 'deepseek-coder'],
      defaultModel: 'llama3.2',
      generate: async (prompt, options) => {
        const response = await fetch(`${this.providers.get('ollama').baseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: options.model || 'llama3.2',
            prompt,
            stream: false,
            options: { temperature: options.temperature || 0.7 }
          })
        });
        const data = await response.json();
        return data.response;
      }
    });

    this.registerProvider('openai', {
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
      defaultModel: 'gpt-4o-mini',
      generate: async (prompt, options) => {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY not set');

        const response = await fetch(`${this.providers.get('openai').baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: options.model || 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 1000
          })
        });
        const data = await response.json();
        return data.choices[0].message.content;
      }
    });

    this.registerProvider('anthropic', {
      name: 'Anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
      defaultModel: 'claude-3-haiku',
      generate: async (prompt, options) => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

        const response = await fetch(`${this.providers.get('anthropic').baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: options.model || 'claude-3-haiku',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: options.maxTokens || 1000
          })
        });
        const data = await response.json();
        return data.content[0].text;
      }
    });

    this.registerProvider('deepseek', {
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      defaultModel: 'deepseek-chat',
      generate: async (prompt, options) => {
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

        const response = await fetch(`${this.providers.get('deepseek').baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: options.model || 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 1000
          })
        });
        const data = await response.json();
        return data.choices[0].message.content;
      }
    });

    this.registerProvider('gemini', {
      name: 'Google Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      models: ['gemini-pro', 'gemini-pro-vision'],
      defaultModel: 'gemini-pro',
      generate: async (prompt, options) => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY not set');

        const model = options.model || 'gemini-pro';
        const response = await fetch(
          `${this.providers.get('gemini').baseUrl}/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: options.temperature || 0.7 }
            })
          }
        );
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
      }
    });
  }

  registerProvider(name, config) {
    this.providers.set(name, {
      name: config.name || name,
      baseUrl: config.baseUrl,
      models: config.models || [],
      defaultModel: config.defaultModel,
      generate: config.generate,
      available: true,
      lastError: null,
      requestCount: 0,
      errorCount: 0
    });
  }

  async generate(prompt, options = {}) {
    const providerName = options.provider || this.defaultProvider;
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        provider.requestCount++;
        const result = await Promise.race([
          provider.generate(prompt, options),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), this.timeout)
          )
        ]);

        provider.available = true;
        provider.lastError = null;
        return result;

      } catch (error) {
        provider.errorCount++;
        provider.lastError = error.message;

        if (attempt === this.retryAttempts) {
          provider.available = false;

          for (const fallback of this.fallbackOrder) {
            if (fallback !== providerName) {
              const fallbackProvider = this.providers.get(fallback);
              if (fallbackProvider && fallbackProvider.available) {
                console.log(`[MultiModel] Falling back to ${fallback}`);
                return this.generate(prompt, { ...options, provider: fallback });
              }
            }
          }

          throw error;
        }

        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  async generateWithVision(imageBase64, prompt, options = {}) {
    const visionProviders = ['ollama', 'openai', 'gemini'];

    for (const providerName of visionProviders) {
      const provider = this.providers.get(providerName);
      if (!provider || !provider.available) continue;

      try {
        if (providerName === 'ollama') {
          const response = await fetch(`${provider.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: options.model || 'llava',
              prompt,
              images: [imageBase64],
              stream: false
            })
          });
          const data = await response.json();
          return data.response;
        }

        if (providerName === 'openai') {
          const apiKey = process.env.OPENAI_API_KEY;
          const response = await fetch(`${provider.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [{
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                ]
              }]
            })
          });
          const data = await response.json();
          return data.choices[0].message.content;
        }

        if (providerName === 'gemini') {
          const apiKey = process.env.GEMINI_API_KEY;
          const response = await fetch(
            `${provider.baseUrl}/models/gemini-pro-vision:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: prompt },
                    { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }
                  ]
                }]
              })
            }
          );
          const data = await response.json();
          return data.candidates[0].content.parts[0].text;
        }
      } catch (error) {
        console.warn(`[MultiModel] Vision failed with ${providerName}:`, error.message);
      }
    }

    throw new Error('No vision provider available');
  }

  getAvailableProviders() {
    const result = [];
    for (const [name, provider] of this.providers) {
      result.push({
        name: provider.name,
        key: name,
        available: provider.available,
        models: provider.models,
        defaultModel: provider.defaultModel,
        stats: {
          requests: provider.requestCount,
          errors: provider.errorCount,
          lastError: provider.lastError
        }
      });
    }
    return result;
  }

  setDefaultProvider(name) {
    if (!this.providers.has(name)) {
      throw new Error(`Provider not found: ${name}`);
    }
    this.defaultProvider = name;
  }

  healthCheck() {
    const results = {};
    for (const [name, provider] of this.providers) {
      results[name] = {
        available: provider.available,
        lastError: provider.lastError,
        errorRate: provider.requestCount > 0
          ? (provider.errorCount / provider.requestCount * 100).toFixed(2) + '%'
          : '0%'
      };
    }
    return results;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MultiModelAdapter;
}
