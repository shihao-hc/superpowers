/**
 * 实时响应延迟优化器
 * 目标: 输入到响应 < 50ms
 * 
 * 参考: Neuro-sama 的超低延迟交互
 */

class LatencyOptimizer {
  constructor(options = {}) {
    this.options = {
      maxLatency: options.maxLatency || 50,  // ms
      targetLatency: options.targetLatency || 30,
      enablePrecomputation: options.enablePrecomputation !== false,
      enableStreaming: options.enableStreaming !== false,
      ...options
    };

    // 延迟追踪
    this.latencyHistory = [];
    this.inputTimestamp = 0;
    
    // 预计算缓存
    this.responseCache = new Map();
    this.commonResponses = new Map();
    
    // 流式处理
    this.streamBuffer = '';
    this.isStreaming = false;
  }

  /**
   * 优化输入处理
   */
  async processInput(input, context = {}) {
    this.inputTimestamp = performance.now();

    // 1. 快速分类
    const inputType = this._classifyInput(input);
    
    // 2. 检查缓存
    const cachedResponse = this._getCachedResponse(input);
    if (cachedResponse) {
      return this._wrapResponse(cachedResponse, 'cached');
    }

    // 3. 并行处理
    const [intent, emotion, entity] = await Promise.all([
      this._detectIntent(input),
      this._analyzeEmotion(input),
      this._extractEntities(input)
    ]);

    // 4. 生成响应
    const response = await this._generateResponse({
      input,
      intent,
      emotion,
      entity,
      context
    });

    return this._wrapResponse(response, 'generated');
  }

  /**
   * 流式响应处理
   */
  async *streamResponse(input, context) {
    this.isStreaming = true;
    this.streamBuffer = '';

    // 立即返回开始标记
    yield { type: 'start', timestamp: performance.now() };

    // 流式生成
    const stream = this._streamGenerate(input, context);
    
    for await (const chunk of stream) {
      this.streamBuffer += chunk;
      yield {
        type: 'chunk',
        content: chunk,
        accumulated: this.streamBuffer,
        latency: performance.now() - this.inputTimestamp
      };
    }

    // 完成
    yield {
      type: 'complete',
      totalLatency: performance.now() - this.inputTimestamp,
      cached: this._cacheResponse(input, this.streamBuffer)
    };

    this.isStreaming = false;
  }

  /**
   * 预计算常见响应
   */
  precomputeResponses(commonInputs) {
    for (const input of commonInputs) {
      const response = this._generateBasicResponse(input);
      this.commonResponses.set(input, response);
    }
  }

  _classifyInput(input) {
    // 快速分类: 问题/命令/闲聊/情感表达
    const patterns = {
      question: /[?？]|什么|怎么|为什么|如何/i,
      command: /^(开始|停止|设置|切换|播放|显示)/,
      emotion: /[!！]|喜欢|讨厌|开心|难过/,
      greeting: /^(你好|嗨|哈喽|hey|hello)/i
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(input)) return type;
    }
    return 'chat';
  }

  async _detectIntent(input) {
    // 意图识别
    const intents = {
      question: 'answer',
      command: 'execute',
      greeting: 'respond_greeting',
      emotion: 'empathize',
      chat: 'engage'
    };
    return intents[this._classifyInput(input)] || 'engage';
  }

  async _analyzeEmotion(input) {
    // 快速情感分析
    const positiveWords = ['好', '棒', '喜欢', '开心', 'happy', 'love'];
    const negativeWords = ['坏', '讨厌', '难过', 'sad', 'angry'];
    
    let score = 0;
    for (const word of positiveWords) {
      if (input.includes(word)) score += 1;
    }
    for (const word of negativeWords) {
      if (input.includes(word)) score -= 1;
    }

    return {
      sentiment: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral',
      score: Math.max(-1, Math.min(1, score / 3))
    };
  }

  async _extractEntities(input) {
    // 实体提取
    const entities = {
      mentioned: [],
      topics: [],
      actions: []
    };

    // 简单规则提取
    const gameKeywords = ['游戏', '玩', 'Minecraft', 'osu', 'Fortnite'];
    for (const game of gameKeywords) {
      if (input.includes(game)) {
        entities.topics.push('game');
      }
    }

    return entities;
  }

  async _generateResponse({ input, intent, emotion, entity, context }) {
    // 根据意图和情感生成响应
    const templates = {
      answer: `关于${input}，让我想想...`,
      execute: `好的，我来${input}`,
      respond_greeting: this._getGreeting(emotion),
      empathize: this._getEmpathy(emotion),
      engage: `嗯...${input}，我觉得挺有趣的！`
    };

    return templates[intent] || templates.engage;
  }

  _getGreeting(emotion) {
    const greetings = {
      positive: ['你好呀~', '嗨！今天心情不错呢！', '哈喽！'],
      negative: ['你还好吗？', '嗨...有什么我能帮忙的吗？'],
      neutral: ['你好！', '嗨~', '哈喽']
    };
    const list = greetings[emotion.sentiment] || greetings.neutral;
    return list[Math.floor(Math.random() * list.length)];
  }

  _getEmpathy(emotion) {
    if (emotion.sentiment === 'positive') {
      return '太好了！我也很开心~';
    } else if (emotion.sentiment === 'negative') {
      return '别难过，我在呢~';
    }
    return '嗯，我理解~';
  }

  _getCachedResponse(input) {
    // 精确匹配或模糊匹配
    return this.responseCache.get(input) || this.commonResponses.get(input);
  }

  _cacheResponse(input, response) {
    if (this.responseCache.size > 1000) {
      const firstKey = this.responseCache.keys().next().value;
      this.responseCache.delete(firstKey);
    }
    this.responseCache.set(input, response);
    return true;
  }

  _wrapResponse(content, source) {
    const latency = performance.now() - this.inputTimestamp;
    this.latencyHistory.push(latency);
    
    if (this.latencyHistory.length > 100) {
      this.latencyHistory.shift();
    }

    return {
      content,
      source,
      latency,
      withinTarget: latency <= this.options.targetLatency
    };
  }

  getMetrics() {
    const avg = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
    const p95 = this.latencyHistory.sort((a, b) => a - b)[Math.floor(this.latencyHistory.length * 0.95)];
    
    return {
      average: avg,
      p95: p95,
      target: this.options.targetLatency,
      cacheHitRate: this.responseCache.size > 0 ? 
        (this._cacheHits || 0) / (this._totalRequests || 1) : 0
    };
  }
}

module.exports = LatencyOptimizer;
