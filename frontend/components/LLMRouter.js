/**
 * LLMRouter - 灵活的LLM路由系统
 * 
 * 功能:
 * - 支持多种LLM后端
 * - OpenAI兼容端点
 * - Text Generation WebUI
 * - 本地Ollama
 * - 负载均衡
 * - 故障转移
 * - 流式响应
 */

class LLMRouter {
  constructor(options = {}) {
    this.options = {
      // 默认提供商
      defaultProvider: options.defaultProvider || 'openai',
      // 超时(ms)
      timeout: options.timeout || 30000,
      // 重试次数
      maxRetries: options.maxRetries || 3,
      // 回调
      onProviderChange: options.onProviderChange || null,
      onError: options.onError || null,
      ...options
    };

    // 提供商配置
    this.providers = new Map();
    this.providerStats = new Map();
    
    // 默认提供商配置
    this._initDefaultProviders();
    
    // 当前活跃提供商
    this.activeProvider = null;
    
    // 消息历史
    this.conversationHistory = [];
    this.maxHistoryLength = options.maxHistoryLength || 50;

    // 注册自定义提供商
    if (options.providers) {
      for (const [name, config] of Object.entries(options.providers)) {
        this.registerProvider(name, config);
      }
    }
  }

  /**
   * 初始化默认提供商
   */
  _initDefaultProviders() {
    // OpenAI
    this.registerProvider('openai', {
      name: 'OpenAI',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      headers: (key) => ({
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      }),
      formatRequest: (messages, options) => ({
        model: options.model || this.providers.get('openai')?.model || 'gpt-4o-mini',
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2048,
        stream: options.stream || false
      }),
      parseResponse: (data) => ({
        content: data.choices?.[0]?.message?.content || '',
        role: data.choices?.[0]?.message?.role || 'assistant',
        usage: data.usage
      })
    });

    // Text Generation WebUI (Oobabooga)
    this.registerProvider('textgen', {
      name: 'Text Generation WebUI',
      endpoint: options.textgenEndpoint || 'http://localhost:5000/api/v1/chat',
      model: 'local',
      headers: () => ({
        'Content-Type': 'application/json'
      }),
      formatRequest: (messages, options) => ({
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2048,
        stream: options.stream || false
      }),
      parseResponse: (data) => ({
        content: data.choices?.[0]?.message?.content || data.content || '',
        role: 'assistant'
      })
    });

    // Ollama
    this.registerProvider('ollama', {
      name: 'Ollama',
      endpoint: options.ollamaEndpoint || 'http://localhost:11434/api/chat',
      model: options.ollamaModel || 'llama2',
      headers: () => ({
        'Content-Type': 'application/json'
      }),
      formatRequest: (messages, options) => ({
        model: options.model || this.providers.get('ollama')?.model || 'llama2',
        messages,
        stream: options.stream || false,
        options: {
          temperature: options.temperature || 0.7
        }
      }),
      parseResponse: (data) => ({
        content: data.message?.content || '',
        role: data.message?.role || 'assistant'
      })
    });

    // 兼容OpenAI的其他端点
    this.registerProvider('openai-compatible', {
      name: 'OpenAI Compatible',
      endpoint: options.compatibleEndpoint || 'http://localhost:8000/v1/chat/completions',
      model: options.compatibleModel || 'local',
      headers: (key) => ({
        'Authorization': `Bearer ${key || 'no-key'}`,
        'Content-Type': 'application/json'
      }),
      formatRequest: (messages, options) => ({
        model: options.model || 'local',
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2048,
        stream: options.stream || false
      }),
      parseResponse: (data) => ({
        content: data.choices?.[0]?.message?.content || data.content || '',
        role: data.choices?.[0]?.message?.role || 'assistant',
        usage: data.usage
      })
    });
  }

  /**
   * 注册提供商
   */
  registerProvider(name, config) {
    this.providers.set(name, {
      name: config.name || name,
      endpoint: config.endpoint,
      model: config.model,
      apiKey: config.apiKey || null,
      headers: config.headers || (() => ({ 'Content-Type': 'application/json' })),
      formatRequest: config.formatRequest || this._defaultFormatRequest.bind(this),
      parseResponse: config.parseResponse || this._defaultParseResponse.bind(this),
      enabled: config.enabled !== false,
      priority: config.priority || 5
    });

    this.providerStats.set(name, {
      requests: 0,
      successes: 0,
      failures: 0,
      avgLatency: 0,
      lastUsed: null
    });
  }

  /**
   * 生成文本
   */
  async generate(messages, options = {}) {
    const providerName = options.provider || this.options.defaultProvider;
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    // 添加系统提示
    const fullMessages = this._buildMessages(messages, options);

    // 尝试提供商(带重试和故障转移)
    let lastError = null;
    const providersToTry = this._getProvidersToTry(providerName);

    for (const pName of providersToTry) {
      const p = this.providers.get(pName);
      if (!p || !p.enabled) continue;

      for (let retry = 0; retry < this.options.maxRetries; retry++) {
        try {
          const result = await this._callProvider(p, pName, fullMessages, options);
          
          // 更新统计
          this._updateStats(pName, true, Date.now());
          
          // 记录历史
          if (this.options.conversationMemory !== false) {
            this.conversationHistory.push(...fullMessages.slice(-2));
            if (this.conversationHistory.length > this.maxHistoryLength) {
              this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
            }
          }

          return result;

        } catch (error) {
          console.error(`[LLMRouter] ${pName} error (attempt ${retry + 1}):`, error);
          lastError = error;
          this._updateStats(pName, false);
          
          // 等待后重试
          if (retry < this.options.maxRetries - 1) {
            await this._delay(1000 * (retry + 1));
          }
        }
      }
    }

    // 所有提供商都失败
    if (this.options.onError) {
      this.options.onError(lastError);
    }
    throw lastError || new Error('All providers failed');
  }

  /**
   * 流式生成
   */
  async *generateStream(messages, options = {}) {
    const providerName = options.provider || this.options.defaultProvider;
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    const fullMessages = this._buildMessages(messages, options);
    const request = provider.formatRequest(fullMessages, { ...options, stream: true });

    const headers = provider.headers(provider.apiKey || this.options.apiKey);

    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`Stream error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              const parsed = provider.parseResponse(data);
              if (parsed.content) {
                yield parsed.content;
              }
            } catch (e) {
              // 跳过解析错误
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 调用提供商
   */
  async _callProvider(provider, providerName, messages, options) {
    const startTime = Date.now();
    const request = provider.formatRequest(messages, options);
    const headers = provider.headers(provider.apiKey || this.options.apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const parsed = provider.parseResponse(data);
      
      const latency = Date.now() - startTime;
      console.log(`[LLMRouter] ${providerName} responded in ${latency}ms`);

      return {
        ...parsed,
        provider: providerName,
        latency
      };

    } catch (error) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error(`Timeout after ${this.options.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * 构建消息
   */
  _buildMessages(messages, options) {
    const fullMessages = [];

    // 系统提示
    if (options.systemPrompt) {
      fullMessages.push({ role: 'system', content: options.systemPrompt });
    }

    // 历史上下文
    if (this.conversationHistory.length > 0 && options.includeHistory !== false) {
      fullMessages.push(...this.conversationHistory.slice(-10));
    }

    // 当前消息
    if (Array.isArray(messages)) {
      fullMessages.push(...messages);
    } else {
      fullMessages.push({ role: 'user', content: messages });
    }

    return fullMessages;
  }

  /**
   * 获取要尝试的提供商列表
   */
  _getProvidersToTry(primary) {
    const providers = [primary];
    
    // 按优先级添加其他提供商
    const others = Array.from(this.providers.entries())
      .filter(([name, p]) => name !== primary && p.enabled)
      .sort((a, b) => a[1].priority - b[1].priority)
      .map(([name]) => name);
    
    return [...providers, ...others];
  }

  /**
   * 更新统计
   */
  _updateStats(providerName, success, timestamp = null) {
    const stats = this.providerStats.get(providerName);
    if (!stats) return;

    stats.requests++;
    if (success) {
      stats.successes++;
    } else {
      stats.failures++;
    }
    stats.lastUsed = timestamp ? new Date(timestamp) : new Date();
  }

  /**
   * 设置提供商
   */
  setProvider(name) {
    if (this.providers.has(name)) {
      this.options.defaultProvider = name;
      this.activeProvider = name;
      if (this.options.onProviderChange) {
        this.options.onProviderChange(name);
      }
    }
  }

  /**
   * 启用/禁用提供商
   */
  setProviderEnabled(name, enabled) {
    const provider = this.providers.get(name);
    if (provider) {
      provider.enabled = enabled;
    }
  }

  /**
   * 获取提供商列表
   */
  getProviders() {
    return Array.from(this.providers.entries()).map(([name, config]) => ({
      name,
      displayName: config.name,
      endpoint: config.endpoint,
      model: config.model,
      enabled: config.enabled,
      stats: this.providerStats.get(name)
    }));
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const stats = {};
    for (const [name, stat] of this.providerStats) {
      stats[name] = { ...stat };
    }
    return {
      providers: stats,
      activeProvider: this.activeProvider || this.options.defaultProvider,
      historyLength: this.conversationHistory.length
    };
  }

  /**
   * 清除历史
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * 默认请求格式
   */
  _defaultFormatRequest(messages, options) {
    return {
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2048
    };
  }

  /**
   * 默认响应解析
   */
  _defaultParseResponse(data) {
    return {
      content: data.choices?.[0]?.message?.content || data.content || data.text || '',
      role: 'assistant',
      usage: data.usage
    };
  }

  /**
   * 延迟工具
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 销毁
   */
  destroy() {
    this.clearHistory();
    this.providers.clear();
    this.providerStats.clear();
  }
}

if (typeof window !== 'undefined') {
  window.LLMRouter = LLMRouter;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LLMRouter;
}
