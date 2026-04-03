/**
 * LLMAdapter - 统一 LLM 接口规范
 * 借鉴 ocbot 的 lib/llm/ 适配器设计
 * 
 * 为所有 LLM 提供统一接口:
 * - generate(): 文本生成
 * - chat(): 对话生成
 * - generateWithVision(): 视觉理解
 * - embed(): 文本嵌入
 */

class LLMAdapter {
  constructor(config = {}) {
    this.provider = config.provider || 'ollama';
    this.model = config.model || 'llama3.2';
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.apiKey = config.apiKey || null;
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 1000;
    this.timeout = config.timeout || 30000;
  }

  async generate(prompt, options = {}) {
    const merged = { ...this, ...options };
    return this._callProvider('generate', prompt, merged);
  }

  async chat(messages, options = {}) {
    const merged = { ...this, ...options };
    return this._callProvider('chat', messages, merged);
  }

  async generateWithVision(imageBase64, prompt, options = {}) {
    const merged = { ...this, ...options };
    return this._callProvider('vision', { image: imageBase64, prompt }, merged);
  }

  async embed(text, options = {}) {
    const merged = { ...this, ...options };
    return this._callProvider('embed', text, merged);
  }

  async _callProvider(method, input, options) {
    switch (options.provider) {
      case 'ollama':
        return this._ollamaCall(method, input, options);
      case 'openai':
        return this._openaiCall(method, input, options);
      case 'anthropic':
        return this._anthropicCall(method, input, options);
      case 'deepseek':
        return this._deepseekCall(method, input, options);
      case 'gemini':
        return this._geminiCall(method, input, options);
      default:
        throw new Error(`Unknown provider: ${options.provider}`);
    }
  }

  async _ollamaCall(method, input, options) {
    const baseUrl = options.baseUrl || 'http://localhost:11434';

    if (method === 'generate') {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model,
          prompt: input,
          stream: false,
          options: { temperature: options.temperature }
        })
      });
      const data = await response.json();
      return data.response;
    }

    if (method === 'chat') {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model,
          messages: input,
          stream: false
        })
      });
      const data = await response.json();
      return data.message?.content || '';
    }

    if (method === 'vision') {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.visionModel || 'llava',
          prompt: input.prompt,
          images: [input.image],
          stream: false
        })
      });
      const data = await response.json();
      return data.response;
    }

    if (method === 'embed') {
      const response = await fetch(`${baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.embedModel || 'nomic-embed-text',
          prompt: input
        })
      });
      const data = await response.json();
      return data.embedding;
    }
  }

  async _openaiCall(method, input, options) {
    const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    const baseUrl = options.baseUrl || 'https://api.openai.com/v1';

    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    if (method === 'generate' || method === 'chat') {
      const messages = method === 'generate'
        ? [{ role: 'user', content: input }]
        : input;

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options.model || 'gpt-4o-mini',
          messages,
          temperature: options.temperature,
          max_tokens: options.maxTokens
        })
      });
      const data = await response.json();
      return data.choices[0].message.content;
    }

    if (method === 'vision') {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options.visionModel || 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: input.prompt },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${input.image}` } }
            ]
          }]
        })
      });
      const data = await response.json();
      return data.choices[0].message.content;
    }

    if (method === 'embed') {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options.embedModel || 'text-embedding-ada-002',
          input
        })
      });
      const data = await response.json();
      return data.data[0].embedding;
    }
  }

  async _anthropicCall(method, input, options) {
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    if (method === 'generate' || method === 'chat') {
      const messages = method === 'generate'
        ? [{ role: 'user', content: input }]
        : input;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: options.model || 'claude-3-haiku-20240307',
          messages,
          max_tokens: options.maxTokens
        })
      });
      const data = await response.json();
      return data.content[0].text;
    }

    throw new Error(`Anthropic does not support ${method}`);
  }

  async _deepseekCall(method, input, options) {
    const apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

    if (method === 'generate' || method === 'chat') {
      const messages = method === 'generate'
        ? [{ role: 'user', content: input }]
        : input;

      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: options.model || 'deepseek-chat',
          messages,
          temperature: options.temperature,
          max_tokens: options.maxTokens
        })
      });
      const data = await response.json();
      return data.choices[0].message.content;
    }

    throw new Error(`DeepSeek does not support ${method}`);
  }

  async _geminiCall(method, input, options) {
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');

    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

    if (method === 'generate' || method === 'chat') {
      const model = (options.model || 'gemini-pro').replace(/[^a-zA-Z0-9._-]/g, '');
      const response = await fetch(
        `${baseUrl}/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: typeof input === 'string' ? input : JSON.stringify(input) }] }],
            generationConfig: { temperature: options.temperature }
          })
        }
      );
      if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    }

    if (method === 'vision') {
      const response = await fetch(
        `${baseUrl}/models/gemini-pro-vision:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: input.prompt },
                { inline_data: { mime_type: 'image/jpeg', data: input.image } }
              ]
            }]
          })
        }
      );
      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    }

    throw new Error(`Gemini does not support ${method}`);
  }

  async healthCheck() {
    try {
      switch (this.provider) {
        case 'ollama':
          const res = await fetch(`${this.baseUrl}/api/tags`);
          return { ok: res.ok, provider: 'ollama' };
        default:
          return { ok: true, provider: this.provider };
      }
    } catch (e) {
      return { ok: false, provider: this.provider, error: e.message };
    }
  }

  static getSupportedProviders() {
    return [
      { name: 'ollama', models: ['llama3.2', 'qwen2.5', 'deepseek-coder', 'llava'], vision: true },
      { name: 'openai', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'], vision: true },
      { name: 'anthropic', models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'], vision: false },
      { name: 'deepseek', models: ['deepseek-chat', 'deepseek-reasoner'], vision: false },
      { name: 'gemini', models: ['gemini-pro', 'gemini-pro-vision'], vision: true }
    ];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LLMAdapter;
}
