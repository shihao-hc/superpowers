/**
 * UltraWork AI Inference Service
 * LLM inference with Ollama and fallback support
 */

const { EventEmitter } = require('events');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { escapeHtml } = require('../utils/logger');

const MAX_INPUT_LENGTH = 10000;
const MAX_MESSAGE_HISTORY = 20;
const DEFAULT_TIMEOUT = 60000;

const MOOD_DESCRIPTIONS = {
  happy: '开心、活泼、语气轻快、喜欢用颜文字',
  curious: '好奇、喜欢探索、经常提问',
  calm: '平静、沉稳、说话简洁专业',
  excited: '兴奋、激动、感叹号较多',
  playful: '调皮、幽默、爱开玩笑',
  shy: '害羞、腼腆、语气轻柔',
  proud: '自豪、骄傲、自信',
  neutral: '中性、自然'
};

class InferenceService extends EventEmitter {
  constructor() {
    super();
    
    this.config = {
      host: process.env.OLLAMA_HOST || 'localhost',
      port: process.env.OLLAMA_PORT || '11434',
      protocol: process.env.OLLAMA_PROTOCOL || 'http',
      defaultModel: process.env.OLLAMA_MODEL || 'llama3.2',
      maxTokens: parseInt(process.env.MAX_TOKENS) || 256,
      temperature: parseFloat(process.env.DEFAULT_TEMPERATURE) || 0.8,
      timeout: parseInt(process.env.OLLAMA_TIMEOUT) || DEFAULT_TIMEOUT
    };

    this.connected = false;
    this.models = [];
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      averageLatency: 0
    };

    this.messageCache = new Map();
    this.maxCacheSize = 100;
  }

  async checkConnection() {
    try {
      const response = await this._makeRequest('/api/tags', 'GET');
      this.connected = true;
      this.models = response.models || [];
      this.emit('connection:status', { connected: true, models: this.models.length });
      return true;
    } catch (error) {
      this.connected = false;
      this.emit('connection:status', { connected: false, error: error.message });
      return false;
    }
  }

  async listModels() {
    if (!this.connected) {
      await this.checkConnection();
    }
    return this.models.map(m => ({
      name: m.name,
      size: m.size,
      modified: m.modified_at
    }));
  }

  async chat(messages, options = {}) {
    const model = options.model || this.config.defaultModel;
    const temperature = options.temperature ?? this.config.temperature;
    const maxTokens = options.maxTokens || this.config.maxTokens;
    const stream = options.stream || false;

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Invalid messages array');
    }

    const sanitizedMessages = messages.map(m => ({
      role: ['system', 'user', 'assistant'].includes(m.role) ? m.role : 'user',
      content: String(m.content || '').substring(0, MAX_INPUT_LENGTH)
    })).slice(-MAX_MESSAGE_HISTORY);

    const startTime = Date.now();
    this.stats.totalRequests++;

    try {
      const response = await this._makeRequest('/api/chat', 'POST', {
        model,
        messages: sanitizedMessages,
        stream,
        options: {
          temperature,
          num_predict: maxTokens
        }
      });

      this.stats.successfulRequests++;
      const latency = Date.now() - startTime;
      this._updateLatencyStats(latency);

      if (response.eval_count) {
        this.stats.totalTokens += response.eval_count;
      }

      this.emit('chat:completed', {
        model,
        latency,
        tokens: response.eval_count
      });

      if (stream) {
        return response;
      }

      return {
        ok: true,
        text: response.message?.content?.trim() || '',
        model,
        done: true,
        evalCount: response.eval_count,
        promptEvalCount: response.prompt_eval_count,
        latency
      };
    } catch (error) {
      this.stats.failedRequests++;
      this.emit('chat:error', { error: error.message, model });
      throw error;
    }
  }

  async infer(input, context = {}) {
    const { 
      name = 'AI',
      mood = 'neutral',
      traits = {},
      personality = 'default',
      model: customModel,
      messages: providedMessages
    } = context;

    const systemPrompt = this._buildSystemPrompt(name, mood, traits, personality);

    let messages;
    if (providedMessages && providedMessages.length > 0) {
      messages = providedMessages;
      if (messages[0].role !== 'system') {
        messages.unshift({ role: 'system', content: systemPrompt });
      }
    } else {
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: String(input).substring(0, MAX_INPUT_LENGTH) }
      ];
    }

    try {
      const result = await this.chat(messages, {
        model: customModel || this.config.defaultModel
      });

      return {
        ok: true,
        text: result.text,
        model: result.model,
        mood,
        personality,
        tokens: result.evalCount,
        latency: result.latency
      };
    } catch (error) {
      this.emit('inference:error', { error: error.message, input: String(input).substring(0, 100) });
      return {
        ok: false,
        text: `AI 回复失败: ${escapeHtml(error.message)}`,
        error: error.message
      };
    }
  }

  async *streamInfer(input, context = {}) {
    const { name = 'AI', mood = 'neutral', traits = {}, personality = 'default' } = context;
    const systemPrompt = this._buildSystemPrompt(name, mood, traits, personality);

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: String(input).substring(0, MAX_INPUT_LENGTH) }
    ];

    const model = context.model || this.config.defaultModel;

    try {
      const response = await this.chat(messages, { model, stream: true });

      let fullText = '';

      for await (const chunk of response) {
        if (chunk.message?.content) {
          fullText += chunk.message.content;
          yield {
            type: 'chunk',
            content: chunk.message.content,
            fullText
          };
        }

        if (chunk.done) {
          yield {
            type: 'done',
            fullText,
            model: chunk.model,
            evalCount: chunk.eval_count
          };
          break;
        }
      }
    } catch (error) {
      yield {
        type: 'error',
        error: error.message
      };
    }
  }

  _buildSystemPrompt(name, mood, traits, personality) {
    const traitStr = Object.entries(traits)
      .map(([k, v]) => `${escapeHtml(String(k))}:${escapeHtml(String(v))}`)
      .join(', ');

    const moodDesc = MOOD_DESCRIPTIONS[mood] || MOOD_DESCRIPTIONS.neutral;

    const personalityInstructions = {
      default: '保持自然，用符合人格的方式回复',
      playful: '活泼开朗，多用颜文字，语气轻快可爱',
      professional: '专业严谨，语言简洁准确',
      creative: '富有创意，思维发散',
      gentle: '温柔体贴，关怀用户'
    };

    const instruction = personalityInstructions[personality] || personalityInstructions.default;

    return `你是一个AI虚拟角色，名字是${escapeHtml(String(name))}。

## 性格设定
- ${traitStr || '默认性格'}
- 当前心情：${mood} - ${moodDesc}
- 人格类型：${personality}

## 回复规则
1. ${instruction}
2. 回复简洁有力，控制在50字以内
3. 直接回答问题，不要过多解释`;
  }

  async analyzeImage(imageBase64, prompt, options = {}) {
    const model = options.model || 'llava';
    const temperature = options.temperature ?? 0.3;

    if (!imageBase64) {
      throw new Error('Image data required');
    }

    const cleanBase64 = typeof imageBase64 === 'string' && imageBase64.startsWith('data:')
      ? imageBase64.split(',')[1]
      : imageBase64;

    if (!/^[A-Za-z0-9+/=\s]+$/.test(cleanBase64)) {
      throw new Error('Invalid base64 format');
    }

    const maxBase64Size = 14 * 1024 * 1024;
    if (cleanBase64.length > maxBase64Size) {
      throw new Error('Image too large (max 10MB)');
    }

    const startTime = Date.now();

    try {
      const response = await this._makeRequest('/api/generate', 'POST', {
        model,
        prompt: prompt || '请详细描述这张图片的内容',
        images: [cleanBase64],
        stream: false,
        options: { temperature }
      });

      return {
        ok: true,
        description: response.response,
        model: response.model,
        totalDuration: response.total_duration,
        evalCount: response.eval_count,
        latency: Date.now() - startTime
      };
    } catch (error) {
      this.emit('vision:error', { error: error.message });
      return {
        ok: false,
        error: error.message,
        description: '图片分析失败: ' + escapeHtml(error.message)
      };
    }
  }

  async chatWithImage(messages, imageBase64, options = {}) {
    const model = options.model || 'llava';
    const temperature = options.temperature ?? this.config.temperature;

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Invalid messages array');
    }

    const cleanBase64 = imageBase64
      ? (imageBase64.startsWith('data:') ? imageBase64.split(',')[1] : imageBase64)
      : null;

    const imageMessages = messages.map((m, i) => {
      if (i === messages.length - 1 && m.role === 'user' && cleanBase64) {
        return {
          role: m.role,
          content: String(m.content || '').substring(0, MAX_INPUT_LENGTH),
          images: [cleanBase64]
        };
      }
      return {
        role: ['system', 'user', 'assistant'].includes(m.role) ? m.role : 'user',
        content: String(m.content || '').substring(0, MAX_INPUT_LENGTH)
      };
    }).slice(-MAX_MESSAGE_HISTORY);

    return this.chat(imageMessages, { model, temperature });
  }

  async listVisionModels() {
    const models = await this.listModels();
    const visionKeywords = ['llava', 'vision', 'bakllava', 'moondream', 'minicpm'];
    return models.filter(m =>
      visionKeywords.some(kw => m.name.toLowerCase().includes(kw))
    );
  }

  async _makeRequest(endpoint, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.config.protocol}://${this.config.host}:${this.config.port}${endpoint}`);
      
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: this.config.timeout
      };

      const protocol = this.config.protocol === 'https' ? https : http;

      const req = protocol.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }

          try {
            if (method === 'GET' && endpoint === '/api/tags') {
              resolve(JSON.parse(data));
            } else if (body?.stream) {
              const lines = data.split('\n').filter(Boolean);
              const lastLine = lines[lines.length - 1];
              if (lastLine) {
                resolve(JSON.parse(lastLine));
              } else {
                resolve({ done: true });
              }
            } else {
              resolve(JSON.parse(data));
            }
          } catch (e) {
            reject(new Error(`Parse error: ${e.message}`));
          }
        });
      });

      req.on('error', (e) => {
        reject(new Error(`Request failed: ${e.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  _updateLatencyStats(latency) {
    const total = this.stats.successfulRequests;
    this.stats.averageLatency = 
      ((this.stats.averageLatency * (total - 1)) + latency) / total;
  }

  getStats() {
    return {
      ...this.stats,
      connected: this.connected,
      models: this.models.length,
      defaultModel: this.config.defaultModel,
      successRate: this.stats.totalRequests > 0
        ? ((this.stats.successfulRequests / this.stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  resetStats() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      averageLatency: 0
    };
    this.emit('stats:reset', {});
  }

  clearCache() {
    this.messageCache.clear();
  }
}

module.exports = new InferenceService();
