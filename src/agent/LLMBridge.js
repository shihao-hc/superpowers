/**
 * LLMBridge - LLMAdapter 的简化包装器
 * 提供与 InferenceBridge 兼容的接口，同时支持高级特性
 */

const { LLMAdapter } = require('./LLMAdapter');

class LLMBridge {
  constructor(options = {}) {
    this.adapter = null;
    this.options = {
      provider: options.provider || process.env.LLM_PROVIDER || 'ollama',
      model: options.model || process.env.LLM_MODEL || 'llama3.2',
      baseUrl: options.baseUrl || process.env.LLM_BASE_URL || 'http://localhost:11434',
      apiKey: options.apiKey || process.env.LLM_API_KEY || null,
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 2048,
      enableStreaming: options.enableStreaming !== false
    };
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {return;}

    try {
      this.adapter = new LLMAdapter(this.options);

      this.adapter.on('retry', ({ attempt, delay, error }) => {
        console.log(`[LLMBridge] Retry ${attempt} after ${delay}ms: ${error}`);
      });

      this.initialized = true;
      console.log(`[LLMBridge] Initialized with ${this.options.provider}/${this.options.model}`);
    } catch (e) {
      console.warn('[LLMBridge] Failed to initialize:', e.message);
    }
  }

  async infer(input, options = {}) {
    if (!this.initialized) {await this.initialize();}

    if (!this.adapter) {
      return { text: '[LLMBridge] Not initialized', success: false };
    }

    try {
      if (options.stream) {
        return this._streamInfer(input, options);
      }

      const result = await this.adapter.generateWithRetry(input, {
        temperature: options.temperature || this.options.temperature,
        maxTokens: options.maxTokens || this.options.maxTokens
      });

      return {
        text: result.response || result.content || String(result),
        success: true,
        tokens: result.tokens || 0,
        stats: this.adapter.getStats()
      };
    } catch (e) {
      console.error('[LLMBridge] Inference error:', e.message);
      return { text: `Error: ${e.message}`, success: false };
    }
  }

  async *_streamInfer(input, options = {}) {
    if (!this.initialized) {await this.initialize();}

    if (!this.adapter) {
      yield { type: 'error', content: '[LLMBridge] Not initialized' };
      return;
    }

    try {
      for await (const event of this.adapter.streamGenerate(input, options)) {
        if (event.type === 'content') {
          yield { type: 'content', delta: event.delta, done: event.done };
        } else if (event.type === 'error') {
          yield { type: 'error', content: event.error };
        } else if (event.type === 'done') {
          yield { type: 'done', content: event.content, tokens: event.tokens };
        }
      }
    } catch (e) {
      yield { type: 'error', content: e.message };
    }
  }

  async chat(messages, options = {}) {
    if (!this.initialized) {await this.initialize();}

    if (!this.adapter) {
      return { text: '[LLMBridge] Not initialized', success: false };
    }

    try {
      const result = await this.adapter.chat(messages, {
        temperature: options.temperature || this.options.temperature,
        maxTokens: options.maxTokens || this.options.maxTokens
      });

      return {
        text: result.response || result.content || String(result),
        success: true
      };
    } catch (e) {
      console.error('[LLMBridge] Chat error:', e.message);
      return { text: `Error: ${e.message}`, success: false };
    }
  }

  getStats() {
    return this.adapter?.getStats() || null;
  }

  getSupportedProviders() {
    return LLMAdapter.getSupportedProviders();
  }
}

module.exports = { LLMBridge };
