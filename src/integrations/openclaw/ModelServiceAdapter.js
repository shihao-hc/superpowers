/**
 * OpenClaw 模型服务适配器
 * 作为 UltraWork 的模型后端服务
 * 
 * 支持 OpenAI 兼容 API 格式
 */

const EventEmitter = require('events');
const { OpenClawClient } = require('./OpenClawClient');

class ModelServiceAdapter extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.gatewayUrl = options.gatewayUrl || process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:3002';
    this.apiKey = options.apiKey || 'ultrawork-local-key';
    this.timeout = options.timeout || 180000;
    
    this.client = null;
    this.initialized = false;
    this.models = [];
    
    this.stats = {
      requests: 0,
      tokens: 0,
      errors: 0,
      lastRequest: null
    };
  }
  
  /**
   * 初始化客户端
   */
  async initialize() {
    if (this.initialized) return;
    
    this.client = new OpenClawClient({
      gatewayUrl: this.gatewayUrl,
      token: this.apiKey,
      timeout: this.timeout
    });
    
    try {
      this.models = await this.client.listModels();
      this.initialized = true;
      this.emit('ready', { modelCount: this.models.length });
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * OpenAI 兼容的 /v1/models 端点
   */
  async listModels() {
    await this.initialize();
    
    return {
      object: 'list',
      data: this.models.map(m => ({
        id: m.id,
        object: 'model',
        created: m.created || Date.now(),
        owned_by: m.owned_by || m.id.split('/')[0],
        permission: [],
        root: m.id,
        parent: null
      }))
    };
  }
  
  /**
   * OpenAI 兼容的 /v1/chat/completions 端点
   */
  async chatCompletions(params, context = {}) {
    await this.initialize();
    
    const startTime = Date.now();
    this.stats.requests++;
    this.stats.lastRequest = new Date().toISOString();
    
    try {
      const { model, messages, temperature = 0.7, max_tokens, stream = false, ...extra } = params;
      
      // 验证模型
      const validModel = this.models.find(m => m.id === model);
      if (!validModel) {
        throw new Error(`Model not found: ${model}`);
      }
      
      // 调用网关
      const response = await this.client.chatCompletion({
        model,
        messages,
        temperature,
        max_tokens,
        stream
      }, null);
      
      this.stats.tokens += response.usage?.total_tokens || 0;
      
      // 返回 OpenAI 兼容格式
      if (stream) {
        return this._createStreamResponse(response, model, context);
      }
      
      return {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: response.choices?.[0]?.message?.content || ''
          },
          finish_reason: response.choices?.[0]?.finish_reason || 'stop'
        }],
        usage: response.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };
    } catch (error) {
      this.stats.errors++;
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * OpenAI 兼容的 /v1/completions 端点
   */
  async completions(params) {
    await this.initialize();
    
    const { prompt, model, max_tokens = 100, temperature = 0.7, stream = false } = params;
    
    // 将文本 prompt 转换为消息格式
    const messages = [
      { role: 'user', content: Array.isArray(prompt) ? prompt.join('') : prompt }
    ];
    
    const response = await this.chatCompletions({
      model,
      messages,
      temperature,
      max_tokens,
      stream
    });
    
    // 转换为 completions 格式
    return {
      id: `cmpl-${Date.now()}`,
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [{
        text: response.choices?.[0]?.message?.content || '',
        index: 0,
        logprobs: null,
        finish_reason: response.choices?.[0]?.finish_reason || 'stop'
      }],
      usage: response.usage
    };
  }
  
  /**
   * 创建流式响应
   */
  _createStreamResponse(response, model, context) {
    const streamId = `chatcmpl-${Date.now()}`;
    
    return {
      id: streamId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          content: ''
        },
        finish_reason: null
      }]
    };
  }
  
  /**
   * 获取服务统计
   */
  getStats() {
    return {
      ...this.stats,
      gatewayUrl: this.gatewayUrl,
      initialized: this.initialized,
      modelCount: this.models.length,
      uptime: this.stats.lastRequest 
        ? Date.now() - new Date(this.stats.lastRequest).getTime() 
        : 0
    };
  }
  
  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      const health = await this.client.healthCheck();
      return {
        status: health.healthy ? 'healthy' : 'unhealthy',
        gateway: health.healthy ? 'connected' : 'disconnected',
        latency: health.latency,
        models: this.models.length
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        gateway: 'disconnected'
      };
    }
  }
  
  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      requests: 0,
      tokens: 0,
      errors: 0,
      lastRequest: null
    };
  }
}

/**
 * 创建服务实例
 */
function createModelService(options = {}) {
  return new ModelServiceAdapter(options);
}

/**
 * 默认实例
 */
let defaultService = null;

function getModelService(options) {
  if (!defaultService) {
    defaultService = new ModelServiceAdapter(options);
  }
  return defaultService;
}

module.exports = { ModelServiceAdapter, createModelService, getModelService };
