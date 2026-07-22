/**
 * LLMAdapter v2 - 统一 LLM 接口规范 (增强版)
 * 借鉴 Claude Code API Client 设计
 *
 * v2 新增特性:
 * - 流式生成器 (asyncGenerator)
 * - 重试机制 (指数退避 + 抖动)
 * - Pending Request Map (请求追踪)
 * - 错误分类与处理
 * - 预算控制 (CostManager)
 */

const EventEmitter = require('events');

/**
 * LLM 错误分类
 */
class LLMError extends Error {
  constructor(message, type = 'UNKNOWN', retryable = false, originalError = null) {
    super(message);
    this.name = 'LLMError';
    this.type = type;
    this.retryable = retryable;
    this.originalError = originalError;
    this.timestamp = Date.now();
  }
}

const ErrorTypes = {
  RATE_LIMIT: 'RATE_LIMIT',
  AUTH_ERROR: 'AUTH_ERROR',
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONTEXT_OVERFLOW: 'CONTEXT_OVERFLOW',
  UNKNOWN: 'UNKNOWN'
};

/**
 * 流式结果解析器
 * 支持 SSE 和 NDJSON 格式
 */
class StreamParser {
  constructor() {
    this.buffer = '';
  }

  /**
   * 解析 SSE 格式数据
   */
  parseSSE(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    const events = [];
    let currentEvent = null;

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = { type: line.slice(6).trim(), data: '' };
      } else if (line.startsWith('data:')) {
        if (currentEvent) {
          currentEvent.data += `${line.slice(5).trim()}\n`;
        }
      } else if (line === '' && currentEvent) {
        events.push(currentEvent);
        currentEvent = null;
      }
    }

    return events;
  }

  /**
   * 解析 NDJSON 格式数据
   */
  parseNDJSON(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    const events = [];
    for (const line of lines) {
      if (line.trim()) {
        try {
          events.push(JSON.parse(line));
        } catch {
          this.logger?.debug(`Invalid JSON line skipped: ${line.slice(0, 100)}`);
        }
      }
    }
    return events;
  }

  reset() {
    this.buffer = '';
  }
}

/**
 * 流式生成器类
 * 封装 asyncGenerator 模式
 */
class LLMStream {
  constructor(response, parser, options = {}) {
    this.response = response;
    this.parser = parser;
    this.reader = null;
    this.decoder = new TextDecoder();
    this.options = options;
    this.fullContent = '';
    this.tokens = 0;
    this.startTime = Date.now();
    this._done = false;
    this._controller = null;
  }

  async *[Symbol.asyncIterator]() {
    this.reader = this.response.body.getReader();

    try {
      while (true) {
        const { done, value } = await this.reader.read();

        if (done) {
          this._done = true;
          yield { type: 'done', content: this.fullContent, tokens: this.tokens };
          break;
        }

        const chunk = this.decoder.decode(value, { stream: true });

        // 根据格式解析
        const events = this.options.format === 'sse'
          ? this.parser.parseSSE(chunk)
          : this.parser.parseNDJSON(chunk);

        for (const event of events) {
          const parsed = this._parseEvent(event);
          if (parsed) {
            this.fullContent += parsed.delta || '';
            this.tokens++;
            yield parsed;
          }
        }
      }
    } finally {
      this.reader.releaseLock();
    }
  }

  _parseEvent(event) {
    // OpenAI 格式
    if (event.choices?.[0]?.delta?.content) {
      return {
        type: 'content',
        delta: event.choices?.[0]?.delta?.content ?? '',
        done: event.choices?.[0]?.finish_reason === 'stop'
      };
    }

    // Anthropic 格式
    if (event.type === 'content_block_delta') {
      return {
        type: 'content',
        delta: event.delta?.text || '',
        done: false
      };
    }

    // Ollama 格式
    if (event.response !== undefined) {
      return {
        type: 'content',
        delta: event.response,
        done: event.done
      };
    }

    // 错误事件
    if (event.error) {
      return {
        type: 'error',
        error: event.error
      };
    }

    return null;
  }

  getStats() {
    return {
      tokens: this.tokens,
      duration: Date.now() - this.startTime,
      tps: this.tokens / ((Date.now() - this.startTime) / 1000),
      done: this._done
    };
  }
}

/**
 * Pending Request Map
 * 追踪所有等待响应的请求
 */
class PendingRequestMap {
  constructor() {
    this.map = new Map();
    this.requestId = 0;
  }

  /**
   * 创建新的待处理请求
   */
  create(options = {}) {
    const id = ++this.requestId;
    const pending = {
      id,
      resolve: null,
      reject: null,
      promise: null,
      createdAt: Date.now(),
      timeout: options.timeout || 60000,
      request: options.request || null,
      metadata: options.metadata || {}
    };

    pending.promise = new Promise((resolve, reject) => {
      pending.resolve = resolve;
      pending.reject = reject;
    });
    pending.promise.catch(() => {});

    this.map.set(id, pending);

    // 设置超时
    if (pending.timeout > 0) {
      pending.timeoutId = setTimeout(() => {
        this.reject(id, new LLMError('Request timeout', ErrorTypes.TIMEOUT, false));
      }, pending.timeout);
    }

    return { id, promise: pending.promise, pending };
  }

  /**
   * 完成请求
   */
  resolve(id, result) {
    const pending = this.map.get(id);
    if (!pending) {return false;}

    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }
    pending.resolve(result);
    this.map.delete(id);
    return true;
  }

  /**
   * 拒绝请求
   */
  reject(id, error) {
    const pending = this.map.get(id);
    if (!pending) {return false;}

    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }
    pending.reject(error);
    this.map.delete(id);
    return true;
  }

  /**
   * 获取请求
   */
  get(id) {
    return this.map.get(id);
  }

  /**
   * 获取所有请求
   */
  getAll() {
    return Array.from(this.map.values());
  }

  /**
   * 取消所有请求
   */
  cancelAll(error = new LLMError('All requests cancelled', ErrorTypes.UNKNOWN, false)) {
    for (const [id] of this.map) {
      this.reject(id, error);
    }
  }

  /**
   * 获取大小
   */
  size() {
    return this.map.size;
  }

  /**
   * 获取统计
   */
  getStats() {
    const now = Date.now();
    const pending = this.getAll();
    return {
      size: pending.length,
      oldest: pending.length > 0
        ? Math.min(...pending.map((p) => now - p.createdAt))
        : 0,
      newest: pending.length > 0
        ? Math.max(...pending.map((p) => now - p.createdAt))
        : 0
    };
  }
}

/**
 * 重试策略
 */
class RetryStrategy {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelay = options.baseDelay ?? 1000;
    this.maxDelay = options.maxDelay ?? 30000;
    this.jitterFactor = options.jitterFactor ?? 0.25;
    this.retryableErrors = options.retryableErrors ?? [
      ErrorTypes.RATE_LIMIT,
      ErrorTypes.SERVER_ERROR,
      ErrorTypes.NETWORK_ERROR,
      ErrorTypes.TIMEOUT
    ];
  }

  /**
   * 计算延迟
   */
  calculateDelay(attempt) {
    const exponentialDelay = Math.min(
      this.baseDelay * Math.pow(2, attempt - 1),
      this.maxDelay
    );
    const jitter = exponentialDelay * this.jitterFactor * (2 * Math.random() - 1);
    return Math.round(exponentialDelay + jitter);
  }

  /**
   * 是否应该重试
   */
  shouldRetry(error, attempt) {
    if (attempt >= this.maxRetries) {return false;}
    if (error instanceof LLMError) {
      return this.retryableErrors.includes(error.type);
    }
    // 默认网络错误可重试
    return true;
  }
}

/**
 * LLMAdapter v2
 */
class LLMAdapter extends EventEmitter {
  constructor(config = {}) {
    super();

    // 基础配置
    this.provider = config.provider || 'ollama';
    this.model = config.model || 'llama3.2';
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.apiKey = config.apiKey || null;
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 1000;
    this.timeout = config.timeout || 30000;

    // v2 新增: 重试策略
    this.retryStrategy = new RetryStrategy({
      maxRetries: config.maxRetries || 3,
      baseDelay: config.retryDelay || 1000,
      maxDelay: config.maxRetryDelay || 30000
    });

    // v2 新增: Pending Request Map
    this.pendingRequests = new PendingRequestMap();

    // v2 新增: 流式配置
    this.enableStreaming = config.enableStreaming !== false;
    this.defaultStreamFormat = config.streamFormat || 'ndjson';

    // v2 新增: 预算控制
    this.budget = {
      dailyLimit: config.dailyBudget || Infinity,
      dailySpent: 0,
      lastReset: Date.now()
    };

    // v2 新增: 请求计数
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      retryCount: 0,
      averageLatency: 0
    };
  }

  /**
   * 带重试的生成
   */
  async generateWithRetry(prompt, options = {}) {
    const startTime = Date.now();
    let attempt = 0;
    let lastError = null;

    while (attempt < this.retryStrategy.maxRetries) {
      attempt++;
      this.stats.totalRequests++;

      try {
        const result = await this.generate(prompt, { ...options, attempt });
        this.stats.successfulRequests++;
        this.stats.totalTokens += (result?.tokens || 0);
        this._updateLatencyStats(Date.now() - startTime);
        return result;
      } catch (error) {
        lastError = error;
        this.stats.failedRequests++;

        if (!this.retryStrategy.shouldRetry(error, attempt)) {
          throw error;
        }

        this.stats.retryCount++;
        const delay = this.retryStrategy.calculateDelay(attempt);

        this.emit('retry', {
          attempt,
          delay,
          error: error.message
        });

        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw lastError;
  }

  /**
   * 流式生成
   */
  async *streamGenerate(prompt, options = {}) {
    if (!this.enableStreaming) {
      const result = await this.generate(prompt, options);
      yield { type: 'content', delta: result, done: true };
      return;
    }

    const parser = new StreamParser();
    const response = await this._fetchStream(prompt, options);

    if (!response.ok) {
      const error = await this._parseError(response);
      throw new LLMError(error.message, error.type, error.retryable);
    }

    const stream = new LLMStream(response, parser, {
      format: this.defaultStreamFormat
    });

    for await (const event of stream) {
      yield event;
    }
  }

  /**
   * 流式聊天
   */
  async *streamChat(messages, options = {}) {
    if (!this.enableStreaming) {
      const result = await this.chat(messages, options);
      yield { type: 'content', delta: result, done: true };
      return;
    }

    const parser = new StreamParser();
    const response = await this._fetchStreamChat(messages, options);

    if (!response.ok) {
      const error = await this._parseError(response);
      throw new LLMError(error.message, error.type, error.retryable);
    }

    const stream = new LLMStream(response, parser, {
      format: this.defaultStreamFormat
    });

    for await (const event of stream) {
      yield event;
    }
  }

  // ========== 原有方法保持兼容 ==========

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

  // ========== 内部方法 ==========

  async _fetchStream(prompt, options) {
    const url = options.provider === 'ollama'
      ? `${this.baseUrl}/api/generate`
      : `${this.baseUrl}/chat/completions`;

    const body = options.provider === 'ollama'
      ? {
        model: options.model || this.model,
        prompt,
        stream: true,
        options: { temperature: options.temperature || this.temperature }
      }
      : {
        model: options.model || this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: true
      };

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout)
    });
  }

  async _fetchStreamChat(messages, options) {
    const url = `${this.baseUrl}/chat/completions`;

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: options.model || this.model,
        messages,
        stream: true
      }),
      signal: AbortSignal.timeout(this.timeout)
    });
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
      throw new LLMError(`Unknown provider: ${options.provider}`, ErrorTypes.UNKNOWN);
    }
  }

  async _ollamaCall(method, input, options) {
    const baseUrl = options.baseUrl || this.baseUrl;

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

    if (!apiKey) {throw new Error('OPENAI_API_KEY not set');}

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
          temperature: options.temperature
        })
      });

      if (!response.ok) {
        const error = await this._parseError(response);
        throw new LLMError(error.message, error.type, error.retryable);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content ?? '';
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
      return data.choices?.[0]?.message?.content ?? '';
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
      return data.data?.[0]?.embedding ?? [];
    }
  }

  async _anthropicCall(method, input, options) {
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {throw new Error('ANTHROPIC_API_KEY not set');}

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

      if (!response.ok) {
        const error = await this._parseError(response);
        throw new LLMError(error.message, error.type, error.retryable);
      }

      const data = await response.json();
      return data.content?.[0]?.text ?? '';
    }

    throw new Error(`Anthropic does not support ${method}`);
  }

  async _deepseekCall(method, input, options) {
    const apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {throw new Error('DEEPSEEK_API_KEY not set');}

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
          temperature: options.temperature
        })
      });

      if (!response.ok) {
        const error = await this._parseError(response);
        throw new LLMError(error.message, error.type, error.retryable);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content ?? '';
    }

    throw new Error(`DeepSeek does not support ${method}`);
  }

  async _geminiCall(method, input, options) {
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {throw new Error('GEMINI_API_KEY not set');}

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

      if (!response.ok) {
        const error = await this._parseError(response);
        throw new LLMError(error.message, error.type, error.retryable);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
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
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    }

    throw new Error(`Gemini does not support ${method}`);
  }

  async _parseError(response) {
    let message = `HTTP ${response.status}`;
    let type = ErrorTypes.UNKNOWN;
    let retryable = false;

    try {
      const data = await response.json();
      message = data.error?.message || data.message || message;
    } catch (error) {
      this.logger?.debug(`Failed to parse error response: ${error.message}`);
    }

    if (response.status === 429) {
      type = ErrorTypes.RATE_LIMIT;
      retryable = true;
    } else if (response.status === 401 || response.status === 403) {
      type = ErrorTypes.AUTH_ERROR;
      retryable = false;
    } else if (response.status >= 500) {
      type = ErrorTypes.SERVER_ERROR;
      retryable = true;
    } else if (response.status === 400) {
      type = ErrorTypes.VALIDATION_ERROR;
      if (message.includes('maximum context length') || message.includes('token')) {
        type = ErrorTypes.CONTEXT_OVERFLOW;
      }
    }

    return { message, type, retryable };
  }

  _updateLatencyStats(latency) {
    const n = this.stats.successfulRequests;
    this.stats.averageLatency =
      (this.stats.averageLatency * (n - 1) + latency) / n;
  }

  // ========== 工具方法 ==========

  async healthCheck() {
    try {
      switch (this.provider) {
      case 'ollama': {
        const res = await fetch(`${this.baseUrl}/api/tags`);
        return { ok: res.ok, provider: 'ollama' };
      }
      default:
        return { ok: true, provider: this.provider };
      }
    } catch (e) {
      return { ok: false, provider: this.provider, error: e.message };
    }
  }

  getStats() {
    return {
      ...this.stats,
      pendingRequests: this.pendingRequests.size(),
      budget: this.budget
    };
  }

  resetStats() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      retryCount: 0,
      averageLatency: 0
    };
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

module.exports = {
  LLMAdapter,
  LLMStream,
  LLMError,
  StreamParser,
  PendingRequestMap,
  RetryStrategy,
  ErrorTypes
};
