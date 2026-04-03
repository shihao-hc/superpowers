/**
 * AI Model Gateway
 * 统一模型接入层 - 支持 OpenAI, Anthropic, 本地模型, 垂直领域模型
 */

const crypto = require('crypto');

class ModelGateway {
  constructor() {
    this.models = new Map();
    this.routers = new Map();
    this.loadBalancers = new Map();
    this.caches = new Map();
    this.fallbacks = new Map();
    
    this._initDefaultModels();
  }

  _initDefaultModels() {
    // OpenAI 系列
    this.registerModel({
      id: 'openai-gpt-4',
      provider: 'openai',
      name: 'GPT-4',
      type: 'chat',
      contextWindow: 128000,
      inputCost: 0.03,
      outputCost: 0.06,
      capabilities: ['chat', 'function-calling', 'vision', 'json-mode'],
      latency: { p50: 2000, p95: 5000 },
      status: 'active'
    });

    this.registerModel({
      id: 'openai-gpt-4-turbo',
      provider: 'openai',
      name: 'GPT-4 Turbo',
      type: 'chat',
      contextWindow: 128000,
      inputCost: 0.01,
      outputCost: 0.03,
      capabilities: ['chat', 'function-calling', 'vision', 'json-mode'],
      latency: { p50: 1500, p95: 3000 },
      status: 'active'
    });

    this.registerModel({
      id: 'openai-gpt-35-turbo',
      provider: 'openai',
      name: 'GPT-3.5 Turbo',
      type: 'chat',
      contextWindow: 16385,
      inputCost: 0.0005,
      outputCost: 0.0015,
      capabilities: ['chat', 'function-calling', 'json-mode'],
      latency: { p50: 800, p95: 1500 },
      status: 'active'
    });

    // Anthropic 系列
    this.registerModel({
      id: 'anthropic-claude-3-opus',
      provider: 'anthropic',
      name: 'Claude 3 Opus',
      type: 'chat',
      contextWindow: 200000,
      inputCost: 0.015,
      outputCost: 0.075,
      capabilities: ['chat', 'vision', 'json-mode', 'extended-thinking'],
      latency: { p50: 3000, p95: 8000 },
      status: 'active'
    });

    this.registerModel({
      id: 'anthropic-claude-3-sonnet',
      provider: 'anthropic',
      name: 'Claude 3 Sonnet',
      type: 'chat',
      contextWindow: 200000,
      inputCost: 0.003,
      outputCost: 0.015,
      capabilities: ['chat', 'vision', 'json-mode'],
      latency: { p50: 1500, p95: 4000 },
      status: 'active'
    });

    // 本地推理模型
    this.registerModel({
      id: 'local-llama-3-70b',
      provider: 'local',
      name: 'Llama 3 70B',
      type: 'chat',
      contextWindow: 8192,
      inputCost: 0,
      outputCost: 0,
      capabilities: ['chat', 'function-calling'],
      latency: { p50: 5000, p95: 15000 },
      requiresGpu: true,
      status: 'active'
    });

    this.registerModel({
      id: 'local-mistral-7b',
      provider: 'local',
      name: 'Mistral 7B',
      type: 'chat',
      contextWindow: 8192,
      inputCost: 0,
      outputCost: 0,
      capabilities: ['chat'],
      latency: { p50: 2000, p95: 5000 },
      requiresGpu: true,
      status: 'active'
    });

    // 垂直领域模型
    this.registerModel({
      id: 'domain-medical-gpt',
      provider: 'custom',
      name: '医疗大模型',
      type: 'chat',
      contextWindow: 32000,
      inputCost: 0.02,
      outputCost: 0.04,
      capabilities: ['chat', 'medical-ner', 'diagnosis-assist', 'medical-qa'],
      domain: 'healthcare',
      compliance: ['HIPAA'],
      status: 'active'
    });

    this.registerModel({
      id: 'domain-legal-gpt',
      provider: 'custom',
      name: '法律大模型',
      type: 'chat',
      contextWindow: 32000,
      inputCost: 0.02,
      outputCost: 0.04,
      capabilities: ['chat', 'contract-analysis', 'legal-research', 'case-prediction'],
      domain: 'legal',
      compliance: ['GDPR'],
      status: 'active'
    });

    this.registerModel({
      id: 'domain-finance-gpt',
      provider: 'custom',
      name: '金融大模型',
      type: 'chat',
      contextWindow: 32000,
      inputCost: 0.02,
      outputCost: 0.04,
      capabilities: ['chat', 'financial-analysis', 'risk-assessment', 'report-gen'],
      domain: 'finance',
      compliance: ['SEC', 'FINRA'],
      status: 'active'
    });

    // Embedding 模型
    this.registerModel({
      id: 'openai-text-embedding-3-large',
      provider: 'openai',
      name: 'Text Embedding 3 Large',
      type: 'embedding',
      contextWindow: 8192,
      dimensions: 3072,
      inputCost: 0.00013,
      outputCost: 0,
      capabilities: ['embeddings'],
      latency: { p50: 500, p95: 1000 },
      status: 'active'
    });

    // 图像模型
    this.registerModel({
      id: 'openai-dalle-3',
      provider: 'openai',
      name: 'DALL-E 3',
      type: 'image',
      inputCost: 0.04,
      outputCost: 0,
      capabilities: ['image-generation', 'image-edit'],
      sizes: ['1024x1024', '1792x1024', '1024x1792'],
      latency: { p50: 10000, p95: 30000 },
      status: 'active'
    });
  }

  registerModel(model) {
    this.models.set(model.id, {
      ...model,
      registeredAt: Date.now(),
      stats: {
        totalRequests: 0,
        totalTokens: { input: 0, output: 0 },
        totalCost: 0,
        errors: 0,
        avgLatency: 0
      }
    });
  }

  getModel(modelId) {
    return this.models.get(modelId);
  }

  listModels(filters = {}) {
    let models = Array.from(this.models.values());
    
    if (filters.provider) {
      models = models.filter(m => m.provider === filters.provider);
    }
    if (filters.type) {
      models = models.filter(m => m.type === filters.type);
    }
    if (filters.domain) {
      models = models.filter(m => m.domain === filters.domain);
    }
    if (filters.capability) {
      models = models.filter(m => m.capabilities.includes(filters.capability));
    }
    if (filters.status) {
      models = models.filter(m => m.status === filters.status);
    }
    
    return models;
  }

  async route(request) {
    const { task, domain, complexity, budget, latency, preferences } = request;
    
    // 1. 任务匹配
    const suitableModels = this._findSuitableModels(task, domain, complexity);
    
    // 2. 约束过滤
    let candidates = suitableModels;
    
    if (budget) {
      candidates = candidates.filter(m => this._withinBudget(m, budget));
    }
    
    if (latency) {
      candidates = candidates.filter(m => m.latency.p95 <= latency);
    }
    
    // 3. 负载均衡
    const selected = this._selectModel(candidates);
    
    // 4. 记录统计
    this._updateStats(selected.id);
    
    return {
      modelId: selected.id,
      model: selected.name,
      provider: selected.provider,
      reasoning: this._explainSelection(selected, request),
      cost: this._estimateCost(selected, request)
    };
  }

  _findSuitableModels(task, domain, complexity) {
    const capabilityMap = {
      'chat': ['chat'],
      'code': ['chat', 'code-generation'],
      'analysis': ['chat', 'analysis'],
      'embedding': ['embeddings'],
      'image': ['image-generation'],
      'medical': ['medical-ner', 'diagnosis-assist', 'medical-qa'],
      'legal': ['contract-analysis', 'legal-research'],
      'finance': ['financial-analysis', 'risk-assessment']
    };

    let requiredCaps = capabilityMap[task] || ['chat'];
    
    // 如果指定领域，优先使用领域模型
    if (domain) {
      const domainModels = this.listModels({ domain, status: 'active' });
      if (domainModels.length > 0) {
        return domainModels.filter(m => 
          requiredCaps.some(cap => m.capabilities.includes(cap))
        );
      }
    }
    
    // 复杂度匹配
    if (complexity === 'high') {
      return this.listModels({ 
        type: 'chat', 
        status: 'active' 
      }).filter(m => m.contextWindow >= 100000);
    }
    
    if (complexity === 'low') {
      return this.listModels({ 
        provider: 'local',
        status: 'active' 
      }).concat(
        this.listModels({ 
          id: 'openai-gpt-35-turbo',
          status: 'active' 
        })
      );
    }
    
    return this.listModels({ type: 'chat', status: 'active' });
  }

  _withinBudget(model, budget) {
    const estimatedCost = (model.inputCost + model.outputCost) * 1000;
    return estimatedCost <= budget;
  }

  _selectModel(models) {
    if (models.length === 0) {
      throw new Error('No suitable model found');
    }
    
    // 按延迟排序，选择p95最低的
    models.sort((a, b) => a.latency.p95 - b.latency.p95);
    
    // 加权随机选择
    const weights = models.map((m, i) => 1 / (i + 1));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const random = Math.random() * totalWeight;
    
    let sum = 0;
    for (let i = 0; i < models.length; i++) {
      sum += weights[i];
      if (random <= sum) {
        return models[i];
      }
    }
    
    return models[0];
  }

  _explainSelection(model, request) {
    const reasons = [];
    
    if (model.domain === request.domain) {
      reasons.push('领域专用模型匹配');
    }
    if (model.contextWindow >= 100000) {
      reasons.push('支持长上下文');
    }
    if (model.inputCost < 0.01) {
      reasons.push('成本效益高');
    }
    if (model.latency.p95 < 5000) {
      reasons.push('低延迟');
    }
    
    return reasons.join(' | ') || '综合最优选择';
  }

  _estimateCost(model, request) {
    const inputTokens = request.inputTokens || 1000;
    const outputTokens = request.outputTokens || 500;
    
    return {
      inputCost: inputTokens * model.inputCost / 1000,
      outputCost: outputTokens * model.outputCost / 1000,
      totalCost: inputTokens * model.inputCost / 1000 + outputTokens * model.outputCost / 1000,
      currency: 'USD'
    };
  }

  _updateStats(modelId) {
    const model = this.models.get(modelId);
    if (model) {
      model.stats.totalRequests++;
    }
  }

  // 模型路由策略
  registerRouter(name, router) {
    this.routers.set(name, router);
  }

  async routeWithStrategy(strategy, request) {
    const router = this.routers.get(strategy);
    if (!router) {
      return this.route(request);
    }
    return router(this, request);
  }

  // 成本优化路由
  routeByCost() {
    return async (gateway, request) => {
      const models = gateway.listModels({ type: 'chat', status: 'active' });
      const cheapest = models.sort((a, b) => a.inputCost - b.inputCost)[0];
      return {
        modelId: cheapest.id,
        model: cheapest.name,
        provider: cheapest.provider,
        reasoning: '成本最优选择',
        cost: gateway._estimateCost(cheapest, request)
      };
    };
  }

  // 延迟优化路由
  routeByLatency() {
    return async (gateway, request) => {
      const models = gateway.listModels({ type: 'chat', status: 'active' });
      const fastest = models.sort((a, b) => a.latency.p95 - b.latency.p95)[0];
      return {
        modelId: fastest.id,
        model: fastest.name,
        provider: fastest.provider,
        reasoning: '延迟最优选择',
        cost: gateway._estimateCost(fastest, request)
      };
    };
  }

  // 质量优先路由
  routeByQuality() {
    return async (gateway, request) => {
      const models = gateway.listModels({ type: 'chat', status: 'active' });
      // 选择context最大的
      const best = models.sort((a, b) => b.contextWindow - a.contextWindow)[0];
      return {
        modelId: best.id,
        model: best.name,
        provider: best.provider,
        reasoning: '质量最优选择',
        cost: gateway._estimateCost(best, request)
      };
    };
  }

  // 智能路由 (综合考虑)
  routeByIntelligence() {
    return async (gateway, request) => {
      const { complexity, budget, latency } = request;
      
      // 高复杂度 + 高预算 = 最高质量
      if (complexity === 'high' && budget > 0.1) {
        const opus = gateway.getModel('anthropic-claude-3-opus');
        return {
          modelId: opus.id,
          model: opus.name,
          provider: opus.provider,
          reasoning: '高复杂度场景使用旗舰模型',
          cost: gateway._estimateCost(opus, request)
        };
      }
      
      // 中等复杂度 = 平衡选择
      if (complexity === 'medium') {
        const sonnet = gateway.getModel('anthropic-claude-3-sonnet');
        return {
          modelId: sonnet.id,
          model: sonnet.name,
          provider: sonnet.provider,
          reasoning: '中等复杂度使用性价比模型',
          cost: gateway._estimateCost(sonnet, request)
        };
      }
      
      // 低延迟要求 = 快速响应
      if (latency && latency < 2000) {
        const gpt35 = gateway.getModel('openai-gpt-35-turbo');
        return {
          modelId: gpt35.id,
          model: gpt35.name,
          provider: gpt35.provider,
          reasoning: '低延迟场景使用快速模型',
          cost: gateway._estimateCost(gpt35, request)
        };
      }
      
      // 默认智能选择
      return gateway.route(request);
    };
  }

  // 模型调用
  async call(modelId, messages, options = {}) {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const startTime = Date.now();
    
    try {
      let response;
      
      switch (model.provider) {
        case 'openai':
          response = await this._callOpenAI(modelId, messages, options);
          break;
        case 'anthropic':
          response = await this._callAnthropic(modelId, messages, options);
          break;
        case 'local':
          response = await this._callLocal(modelId, messages, options);
          break;
        default:
          throw new Error(`Unsupported provider: ${model.provider}`);
      }
      
      const latency = Date.now() - startTime;
      this._recordCompletion(modelId, response, latency);
      
      return response;
    } catch (error) {
      this._recordError(modelId, error);
      throw error;
    }
  }

  async _callOpenAI(modelId, messages, options) {
    const { OpenAI } = require('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const params = {
      model: modelId.replace('openai-', ''),
      messages,
      ...options
    };
    
    const response = await client.chat.completions.create(params);
    
    return {
      content: response.choices[0].message.content,
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      },
      model: response.model,
      id: response.id
    };
  }

  async _callAnthropic(modelId, messages, options) {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();
    
    const system = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system');
    
    const response = await client.messages.create({
      model: modelId.replace('anthropic-', ''),
      system,
      messages: userMessages,
      ...options
    });
    
    return {
      content: response.content[0].text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      },
      model: response.model,
      id: response.id
    };
  }

  async _callLocal(modelId, messages, options) {
    const { OllamaBridge } = require('../../localInferencing/OllamaBridge');
    const ollama = new OllamaBridge();
    
    const response = await ollama.generate({
      model: model.name,
      messages,
      ...options
    });
    
    return {
      content: response.response,
      usage: {
        inputTokens: response.prompt_eval_count || 0,
        outputTokens: response.eval_count || 0,
        totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0)
      },
      model: model.name,
      id: `local-${Date.now()}`
    };
  }

  _recordCompletion(modelId, response, latency) {
    const model = this.models.get(modelId);
    if (model) {
      model.stats.totalRequests++;
      model.stats.totalTokens.input += response.usage.inputTokens;
      model.stats.totalTokens.output += response.usage.outputTokens;
      model.stats.totalCost += (
        response.usage.inputTokens * model.inputCost / 1000 +
        response.usage.outputTokens * model.outputCost / 1000
      );
      
      // 更新平均延迟
      const prevAvg = model.stats.avgLatency;
      const totalReqs = model.stats.totalRequests;
      model.stats.avgLatency = (prevAvg * (totalReqs - 1) + latency) / totalReqs;
    }
  }

  _recordError(modelId, error) {
    const model = this.models.get(modelId);
    if (model) {
      model.stats.errors++;
    }
  }

  // 获取模型统计
  getModelStats(modelId) {
    const model = this.models.get(modelId);
    if (!model) return null;
    
    return {
      modelId,
      name: model.name,
      provider: model.provider,
      stats: model.stats,
      errorRate: model.stats.totalRequests > 0 
        ? model.stats.errors / model.stats.totalRequests 
        : 0
    };
  }

  // 获取总成本
  getTotalCost() {
    let total = 0;
    for (const model of this.models.values()) {
      total += model.stats.totalCost;
    }
    return {
      totalCostUSD: total,
      byProvider: this._getCostByProvider(),
      byModel: this._getCostByModel()
    };
  }

  _getCostByProvider() {
    const byProvider = {};
    for (const model of this.models.values()) {
      if (!byProvider[model.provider]) {
        byProvider[model.provider] = 0;
      }
      byProvider[model.provider] += model.stats.totalCost;
    }
    return byProvider;
  }

  _getCostByModel() {
    const byModel = {};
    for (const [id, model] of this.models.entries()) {
      byModel[id] = {
        name: model.name,
        cost: model.stats.totalCost,
        requests: model.stats.totalRequests
      };
    }
    return byModel;
  }

  // 健康检查
  healthCheck() {
    const models = Array.from(this.models.values());
    const healthy = models.filter(m => m.stats.errorRate < 0.1);
    const degraded = models.filter(m => m.stats.errorRate >= 0.1 && m.stats.errorRate < 0.5);
    const unhealthy = models.filter(m => m.stats.errorRate >= 0.5);
    
    return {
      total: models.length,
      healthy: healthy.length,
      degraded: degraded.length,
      unhealthy: unhealthy.length,
      models: models.map(m => ({
        id: m.id,
        name: m.name,
        status: m.stats.errorRate < 0.1 ? 'healthy' : 
                m.stats.errorRate < 0.5 ? 'degraded' : 'unhealthy',
        errorRate: m.stats.errorRate,
        avgLatency: m.stats.avgLatency
      }))
    };
  }
}

module.exports = { ModelGateway };
