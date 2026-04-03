/**
 * OpenClaw 集成模块
 * 免费使用各种大模型
 * 
 * 支持的模型:
 * - DeepSeek, Claude, ChatGPT, Gemini, Qwen
 * - Kimi, Doubao, Grok, GLM, Manus
 */

const { OpenClawClient } = require('./OpenClawClient');
const { AuthManager } = require('./AuthManager');
const { MultiModelManager } = require('./MultiModelManager');
const { ModelServiceAdapter, createModelService, getModelService } = require('./ModelServiceAdapter');
const { OpenClawRouter, createOpenClawRouter } = require('./OpenClawRouter');
const { ResponseCache, createResponseCache } = require('./ResponseCache');

module.exports = {
  // 核心客户端
  OpenClawClient,
  AuthManager,
  MultiModelManager,
  ModelServiceAdapter,
  OpenClawRouter,
  ResponseCache,
  
  // 创建方法
  createModelService,
  getModelService,
  createOpenClawRouter,
  createResponseCache,
  
  // 常量
  DEFAULT_PROVIDERS: require('./MultiModelManager').DEFAULT_PROVIDERS,
  MODEL_ALIASES: require('./MultiModelManager').MODEL_ALIASES,
  
  /**
   * 创建默认实例
   */
  createClient(options = {}) {
    return {
      client: new OpenClawClient(options),
      auth: new AuthManager(options),
      manager: new MultiModelManager({ client: new OpenClawClient(options) }),
      service: new ModelServiceAdapter(options)
    };
  },
  
  /**
   * 快速开始 - 初始化模型服务
   */
  async quickStart(options = {}) {
    const { gatewayUrl = 'http://127.0.0.1:3002' } = options;
    
    const client = new OpenClawClient({ gatewayUrl });
    const manager = new MultiModelManager({ client });
    const service = new ModelServiceAdapter({ gatewayUrl });
    
    try {
      await manager.initialize();
      await service.initialize();
      
      return {
        success: true,
        client,
        manager,
        service,
        models: manager.models,
        providers: manager.getProviders()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        hint: '确保 OpenClaw Gateway 已启动: ./server.sh'
      };
    }
  },
  
  /**
   * 一问多答
   */
  async askOnce(prompt, models = [], options = {}) {
    const manager = new MultiModelManager(options);
    await manager.initialize();
    return manager.askOnce(prompt, models, options);
  },
  
  /**
   * 启动路由服务
   */
  async startRouter(options = {}) {
    const router = createOpenClawRouter(options);
    await router.start();
    return router;
  },
  
  /**
   * 创建模型服务（OpenAI 兼容）
   */
  createService(options = {}) {
    return createModelService(options);
  }
};
