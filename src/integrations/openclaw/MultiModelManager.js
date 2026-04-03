/**
 * OpenClaw 多模型管理器
 * 统一管理多种免费 AI 模型
 */

const EventEmitter = require('events');
const { OpenClawClient } = require('./OpenClawClient');

const DEFAULT_PROVIDERS = [
  'deepseek-web',
  'qwen-web',
  'kimi-web',
  'claude-web',
  'doubao-web',
  'chatgpt-web',
  'gemini-web',
  'grok-web',
  'glm-web',
  'manus-api'
];

const MODEL_ALIASES = {
  'deepseek': 'deepseek-web/deepseek-chat',
  'claude': 'claude-web/claude-sonnet-4-6',
  'chatgpt': 'chatgpt-web/gpt-4',
  'gemini': 'gemini-web/gemini-pro',
  'qwen': 'qwen-web/qwen-3-5-plus',
  'kimi': 'kimi-web/moonshot-v1-8k',
  'doubao': 'doubao-web/doubao-seed-2.0',
  'grok': 'grok-web/grok-2',
  'glm': 'glm-web/glm-4-plus',
  'manus': 'manus-api/manus-1.6'
};

class MultiModelManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.client = options.client || new OpenClawClient(options);
    this.defaultModel = options.defaultModel || 'deepseek-web/deepseek-chat';
    this.currentModel = this.defaultModel;
    
    this.models = [];
    this.providers = new Map();
    this.modelCache = new Map();
    this.cacheTTL = options.cacheTTL || 300000; // 5 分钟
    
    this.initialized = false;
  }
  
  /**
   * 初始化 - 获取模型列表
   */
  async initialize() {
    try {
      const models = await this.client.listModels();
      this.models = models;
      this._buildProviderIndex(models);
      this.initialized = true;
      this.emit('initialized', { modelCount: models.length });
      return models;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * 构建提供商索引
   */
  _buildProviderIndex(models) {
    this.providers.clear();
    
    for (const model of models) {
      const [provider, ...rest] = model.id.split('/');
      const providerId = provider.replace(/-web$|-api$/, '');
      
      if (!this.providers.has(provider)) {
        this.providers.set(provider, {
          id: provider,
          name: this._getProviderName(provider),
          models: []
        });
      }
      
      this.providers.get(provider).models.push(model);
    }
  }
  
  /**
   * 获取提供商显示名称
   */
  _getProviderName(provider) {
    const names = {
      'deepseek-web': 'DeepSeek',
      'qwen-web': '通义千问',
      'kimi-web': 'Kimi',
      'claude-web': 'Claude',
      'doubao-web': '豆包',
      'chatgpt-web': 'ChatGPT',
      'gemini-web': 'Gemini',
      'grok-web': 'Grok',
      'glm-web': 'GLM',
      'manus-api': 'Manus'
    };
    return names[provider] || provider;
  }
  
  /**
   * 解析模型 ID (支持别名)
   */
  resolveModelId(input) {
    // 检查别名
    const lower = input.toLowerCase();
    if (MODEL_ALIASES[lower]) {
      return MODEL_ALIASES[lower];
    }
    
    // 检查是否已经是完整 ID
    if (this.models.find(m => m.id === input)) {
      return input;
    }
    
    // 尝试模糊匹配
    for (const model of this.models) {
      if (model.id.includes(input) || model.id.toLowerCase().includes(lower)) {
        return model.id;
      }
    }
    
    // 返回默认值
    return this.defaultModel;
  }
  
  /**
   * 切换当前模型
   */
  async switchModel(modelId) {
    const resolvedId = this.resolveModelId(modelId);
    const model = this.models.find(m => m.id === resolvedId);
    
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }
    
    this.currentModel = resolvedId;
    this.emit('modelSwitched', { model: resolvedId, details: model });
    return model;
  }
  
  /**
   * 获取当前模型
   */
  getCurrentModel() {
    return this.models.find(m => m.id === this.currentModel);
  }
  
  /**
   * 发送聊天消息
   */
  async chat(messages, options = {}) {
    const modelId = options.model 
      ? this.resolveModelId(options.model) 
      : this.currentModel;
    
    const response = await this.client.chatCompletion({
      model: modelId,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens
    }, options.onChunk || null);
    
    return response;
  }
  
  /**
   * 发送流式聊天消息
   */
  async streamChat(messages, options = {}) {
    const modelId = options.model 
      ? this.resolveModelId(options.model) 
      : this.currentModel;
    
    const chunks = [];
    
    await this.client.streamChatCompletion({
      model: modelId,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens,
      stream: true
    }, (chunk) => {
      chunks.push(chunk);
      if (options.onChunk) {
        options.onChunk(chunk);
      }
    });
    
    return this._mergeChunks(chunks);
  }
  
  /**
   * 合并流式响应块
   */
  _mergeChunks(chunks) {
    let content = '';
    let reasoning = '';
    
    for (const chunk of chunks) {
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) {
        content += delta.content;
      }
      if (delta?.thinking || delta?.reasoning) {
        reasoning += delta.thinking || delta.reasoning;
      }
    }
    
    return {
      content,
      reasoning,
      raw: chunks
    };
  }
  
  /**
   * 简单的问答
   */
  async ask(prompt, options = {}) {
    const messages = [{ role: 'user', content: prompt }];
    
    if (options.stream) {
      return this.streamChat(messages, options);
    }
    
    const response = await this.chat(messages, options);
    return {
      content: response.choices?.[0]?.message?.content || '',
      raw: response
    };
  }
  
  /**
   * AskOnce: 同时向多个模型提问
   */
  async askOnce(prompt, modelIds = [], options = {}) {
    if (modelIds.length === 0) {
      modelIds = [this.currentModel];
    }
    
    const results = await Promise.allSettled(
      modelIds.map(async (modelId) => {
        try {
          const resolved = this.resolveModelId(modelId);
          const response = await this.ask(prompt, { ...options, model: resolved });
          return {
            model: resolved,
            success: true,
            content: response.content
          };
        } catch (error) {
          return {
            model: modelId,
            success: false,
            error: error.message
          };
        }
      })
    );
    
    return results.map(r => r.value || r.reason);
  }
  
  /**
   * 获取提供商列表
   */
  getProviders() {
    return Array.from(this.providers.values()).map(p => ({
      ...p,
      models: p.models.map(m => ({
        id: m.id,
        name: m.name || m.id,
        contextLength: m.context_length,
        supportedFeatures: m.supported_features
      }))
    }));
  }
  
  /**
   * 获取模型列表 (带缓存)
   */
  async getModels(forceRefresh = false) {
    if (!forceRefresh && this.models.length > 0) {
      return this.models;
    }
    return this.initialize();
  }
  
  /**
   * 按类型筛选模型
   */
  filterModels(criteria) {
    return this.models.filter(model => {
      if (criteria.provider) {
        if (!model.id.startsWith(criteria.provider)) return false;
      }
      if (criteria.contextLength) {
        if ((model.context_length || 0) < criteria.contextLength) return false;
      }
      if (criteria.features) {
        for (const feature of criteria.features) {
          if (!model.supported_features?.includes(feature)) return false;
        }
      }
      return true;
    });
  }
  
  /**
   * 搜索模型
   */
  searchModels(query) {
    const lower = query.toLowerCase();
    return this.models.filter(model => 
      model.id.toLowerCase().includes(lower) ||
      (model.name && model.name.toLowerCase().includes(lower))
    );
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      initialized: this.initialized,
      currentModel: this.currentModel,
      totalModels: this.models.length,
      totalProviders: this.providers.size,
      providers: Array.from(this.providers.keys()),
      modelAliases: Object.keys(MODEL_ALIASES)
    };
  }
}

/**
 * 创建多模型管理器
 */
function createMultiModelManager(options) {
  return new MultiModelManager(options);
}

/**
 * 默认实例
 */
let defaultManager = null;

function getMultiModelManager(options) {
  if (!defaultManager) {
    defaultManager = new MultiModelManager(options);
  }
  return defaultManager;
}

module.exports = { 
  MultiModelManager, 
  createMultiModelManager, 
  getMultiModelManager,
  DEFAULT_PROVIDERS,
  MODEL_ALIASES
};
