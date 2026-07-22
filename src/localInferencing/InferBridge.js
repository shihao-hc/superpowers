/**
 * InferenceBridge v2 - 智能推理桥接器
 * 自动检测并使用最佳推理引擎
 *
 * 优先级:
 * 1. LLMAdapter (多Provider、流式、重试)
 * 2. 外部端点 (INFER_ENDPOINT)
 * 3. 本地引擎 (LocalEngine)
 */

const LocalEngine = require('./LocalEngine');
const { LLMAdapter } = require('../agent/LLMAdapter');

class InferenceBridge {
  constructor() {
    this.pmBridge = null;
    this.engine = null;
    this.llmAdapter = null;
    this.modelLoaded = false;
    this.externalEndpoint = process.env.INFER_ENDPOINT || null;
    this.useLLMAdapter = process.env.USE_LLM_ADAPTER === 'true';
    this.provider = process.env.LLM_PROVIDER || 'ollama';
    this.model = process.env.LLM_MODEL || 'llama3.2';
    this.baseUrl = process.env.LLM_BASE_URL || 'http://localhost:11434';
  }

  async loadModel() {
    if (this.useLLMAdapter) {
      try {
        this.llmAdapter = new LLMAdapter({
          provider: this.provider,
          model: this.model,
          baseUrl: this.baseUrl,
          enableStreaming: false,
          maxRetries: 3
        });
        this.modelLoaded = true;
        console.log(`[InferenceBridge] Using LLMAdapter: ${this.provider}/${this.model}`);
        return true;
      } catch (e) {
        console.warn('[InferenceBridge] LLMAdapter init failed, falling back:', e.message);
        this.useLLMAdapter = false;
      }
    }

    if (this.externalEndpoint) {
      const { validateURL } = require('../utils/SSRFValidator');
      const result = validateURL(this.externalEndpoint, { allowPrivate: false, allowLoopback: false });
      if (!result.allowed) {
        console.warn(`[InferenceBridge] INFER_ENDPOINT blocked: ${result.reason}`);
        this.externalEndpoint = null;
      } else {
        this.modelLoaded = true;
        console.log(`[InferenceBridge] Using external endpoint: ${this.externalEndpoint}`);
        return true;
      }
    }

    const Eng = LocalEngine;
    this.engine = new Eng();
    this.modelLoaded = await this.engine.loadModel();
    console.log('[InferenceBridge] Using LocalEngine');
    return this.modelLoaded;
  }

  async infer(input, options = {}) {
    if (this.llmAdapter) {
      try {
        const result = await this.llmAdapter.generateWithRetry(input, {
          temperature: options.temperature || 0.7,
          maxTokens: options.maxTokens || 2048
        });
        return {
          ok: true,
          text: result.response || result.content || String(result),
          tokens: result.tokens || 0,
          provider: this.provider
        };
      } catch (e) {
        console.warn('[InferenceBridge] LLMAdapter error:', e.message);
      }
    }

    if (this.externalEndpoint) {
      try {
        const fetch = global.fetch || ((await import('node-fetch')).default);
        const res = await fetch(this.externalEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: input })
        });
        const json = await res.json();
        return json;
      } catch (e) {
        return { ok: false, text: 'external-infer-error', error: e.message };
      }
    }

    if (!this.modelLoaded || !this.engine) {
      return { ok: false, text: 'model-not-loaded' };
    }

    const res = this.engine.infer(input);
    return res;
  }

  async *streamInfer(input, options = {}) {
    if (this.llmAdapter && this.llmAdapter.enableStreaming) {
      try {
        for await (const event of this.llmAdapter.streamGenerate(input, options)) {
          if (event.type === 'content') {
            yield { ok: true, delta: event.delta, done: event.done };
          } else if (event.type === 'error') {
            yield { ok: false, error: event.error };
          } else if (event.type === 'done') {
            yield { ok: true, text: event.content, done: true };
          }
        }
        return;
      } catch (e) {
        yield { ok: false, error: e.message };
        return;
      }
    }

    const result = await this.infer(input, options);
    yield { ok: true, text: result.text, done: true };
  }

  getStatus() {
    return {
      provider: this.llmAdapter ? this.provider : (this.externalEndpoint ? 'external' : 'local'),
      model: this.model,
      loaded: this.modelLoaded,
      streaming: this.llmAdapter?.enableStreaming || false
    };
  }
}

module.exports = InferenceBridge;
