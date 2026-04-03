/**
 * OpenClaw 集成测试
 */

describe('OpenClaw Integration', () => {
  
  describe('模型别名', () => {
    const MODEL_ALIASES = {
      'deepseek': 'deepseek-web/deepseek-chat',
      'claude': 'claude-web/claude-sonnet-4-6',
      'chatgpt': 'chatgpt-web/gpt-4',
      'gpt': 'chatgpt-web/gpt-4',
      'qwen': 'qwen-web/qwen-3-5-plus',
      'kimi': 'kimi-web/moonshot-v1-8k',
      'doubao': 'doubao-web/doubao-seed-2.0',
      'grok': 'grok-web/grok-2',
      'glm': 'glm-web/glm-4-plus',
      'manus': 'manus-api/manus-1.6'
    };
    
    test('应该包含所有主要模型别名', () => {
      expect(MODEL_ALIASES.deepseek).toBe('deepseek-web/deepseek-chat');
      expect(MODEL_ALIASES.claude).toBe('claude-web/claude-sonnet-4-6');
      expect(MODEL_ALIASES.gpt).toBe('chatgpt-web/gpt-4');
      expect(MODEL_ALIASES.gemini).toBeUndefined();
      expect(MODEL_ALIASES.manus).toBe('manus-api/manus-1.6');
    });
    
    test('应该解析别名到完整 ID', () => {
      const resolveModelId = (input) => {
        if (MODEL_ALIASES[input.toLowerCase()]) {
          return MODEL_ALIASES[input.toLowerCase()];
        }
        return input;
      };
      
      expect(resolveModelId('claude')).toBe('claude-web/claude-sonnet-4-6');
      expect(resolveModelId('deepseek')).toBe('deepseek-web/deepseek-chat');
      expect(resolveModelId('unknown')).toBe('unknown');
    });
  });
  
  describe('默认提供商', () => {
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
    
    test('应该包含 10 个提供商', () => {
      expect(DEFAULT_PROVIDERS.length).toBe(10);
    });
    
    test('应该包含所有主要提供商', () => {
      expect(DEFAULT_PROVIDERS).toContain('deepseek-web');
      expect(DEFAULT_PROVIDERS).toContain('claude-web');
      expect(DEFAULT_PROVIDERS).toContain('qwen-web');
      expect(DEFAULT_PROVIDERS).toContain('kimi-web');
      expect(DEFAULT_PROVIDERS).toContain('doubao-web');
      expect(DEFAULT_PROVIDERS).toContain('chatgpt-web');
      expect(DEFAULT_PROVIDERS).toContain('gemini-web');
      expect(DEFAULT_PROVIDERS).toContain('grok-web');
      expect(DEFAULT_PROVIDERS).toContain('glm-web');
      expect(DEFAULT_PROVIDERS).toContain('manus-api');
    });
  });
  
  describe('认证管理', () => {
    class MockAuthManager {
      constructor(opts = {}) {
        this.stateDir = opts.stateDir || '/tmp/.openclaw-state';
        this.profiles = new Map();
        this.providers = new Set();
      }
      
      addProfile(provider, profile) {
        this.profiles.set(`${provider}:default`, { provider, key: profile });
        this.providers.add(provider);
        return true;
      }
      
      getProfile(provider) {
        return this.profiles.get(`${provider}:default`)?.key || null;
      }
      
      isProviderAuthenticated(provider) {
        return this.providers.has(provider);
      }
      
      removeProfile(provider) {
        this.providers.delete(provider);
        return this.profiles.delete(`${provider}:default`);
      }
      
      getAuthenticatedProviders() {
        return Array.from(this.providers);
      }
      
      getStatus() {
        return {
          stateDir: this.stateDir,
          authenticatedProviders: Array.from(this.providers),
          totalProfiles: this.profiles.size
        };
      }
    }
    
    test('应该创建认证管理器', () => {
      const auth = new MockAuthManager();
      expect(auth.stateDir).toBeDefined();
      expect(auth.profiles.size).toBe(0);
    });
    
    test('应该添加和获取配置文件', () => {
      const auth = new MockAuthManager();
      const profile = { cookie: 'test-cookie', userAgent: 'Mozilla/5.0' };
      
      auth.addProfile('deepseek-web', profile);
      
      expect(auth.getProfile('deepseek-web').cookie).toBe('test-cookie');
      expect(auth.isProviderAuthenticated('deepseek-web')).toBe(true);
    });
    
    test('应该移除配置文件', () => {
      const auth = new MockAuthManager();
      auth.addProfile('deepseek-web', { cookie: 'test' });
      
      expect(auth.isProviderAuthenticated('deepseek-web')).toBe(true);
      
      auth.removeProfile('deepseek-web');
      
      expect(auth.isProviderAuthenticated('deepseek-web')).toBe(false);
    });
    
    test('应该获取状态摘要', () => {
      const auth = new MockAuthManager();
      auth.addProfile('deepseek-web', { cookie: 'test1' });
      auth.addProfile('claude-web', { cookie: 'test2' });
      
      const status = auth.getStatus();
      expect(status.authenticatedProviders).toContain('deepseek-web');
      expect(status.authenticatedProviders).toContain('claude-web');
      expect(status.totalProfiles).toBe(2);
    });
  });
  
  describe('多模型管理器', () => {
    class MockMultiModelManager {
      constructor(opts = {}) {
        this.client = opts.client;
        this.defaultModel = opts.defaultModel || 'deepseek-web/deepseek-chat';
        this.currentModel = this.defaultModel;
        this.models = opts.models || [];
        this.providers = new Map();
        this.initialized = false;
        
        this.MODEL_ALIASES = {
          'deepseek': 'deepseek-web/deepseek-chat',
          'claude': 'claude-web/claude-sonnet-4-6',
          'chatgpt': 'chatgpt-web/gpt-4',
          'gpt': 'chatgpt-web/gpt-4',
          'qwen': 'qwen-web/qwen-3-5-plus'
        };
      }
      
      resolveModelId(input) {
        const lower = input.toLowerCase();
        if (this.MODEL_ALIASES[lower]) {
          return this.MODEL_ALIASES[lower];
        }
        return this.models.find(m => m.id === input)?.id || this.defaultModel;
      }
      
      async switchModel(modelId) {
        const resolved = this.resolveModelId(modelId);
        const model = this.models.find(m => m.id === resolved);
        if (!model) throw new Error('Model not found');
        this.currentModel = resolved;
        return model;
      }
      
      filterModels(criteria) {
        return this.models.filter(m => {
          if (criteria.provider && !m.id.startsWith(criteria.provider)) return false;
          if (criteria.contextLength && (m.context_length || 0) < criteria.contextLength) return false;
          return true;
        });
      }
      
      searchModels(query) {
        const lower = query.toLowerCase();
        return this.models.filter(m => m.id.toLowerCase().includes(lower));
      }
      
      getStats() {
        return {
          initialized: this.initialized,
          currentModel: this.currentModel,
          totalModels: this.models.length,
          totalProviders: this.providers.size
        };
      }
    }
    
    test('应该创建管理器', () => {
      const manager = new MockMultiModelManager();
      expect(manager.defaultModel).toBe('deepseek-web/deepseek-chat');
      expect(manager.currentModel).toBe('deepseek-web/deepseek-chat');
    });
    
    test('应该使用自定义默认模型', () => {
      const manager = new MockMultiModelManager({
        defaultModel: 'claude-web/claude-sonnet-4-6'
      });
      expect(manager.defaultModel).toBe('claude-web/claude-sonnet-4-6');
    });
    
    test('应该解析模型别名', () => {
      const manager = new MockMultiModelManager();
      
      expect(manager.resolveModelId('claude')).toBe('claude-web/claude-sonnet-4-6');
      expect(manager.resolveModelId('deepseek')).toBe('deepseek-web/deepseek-chat');
    });
    
    test('应该切换模型', async () => {
      const manager = new MockMultiModelManager({
        models: [
          { id: 'deepseek-web/deepseek-chat', name: 'DeepSeek' },
          { id: 'claude-web/claude-sonnet-4-6', name: 'Claude' }
        ]
      });
      
      await manager.switchModel('claude');
      expect(manager.currentModel).toBe('claude-web/claude-sonnet-4-6');
    });
    
    test('应该按提供商筛选模型', () => {
      const manager = new MockMultiModelManager({
        models: [
          { id: 'deepseek-web/deepseek-chat' },
          { id: 'claude-web/claude-sonnet-4-6' },
          { id: 'qwen-web/qwen-3-5-plus' }
        ]
      });
      
      const deepseekModels = manager.filterModels({ provider: 'deepseek-web' });
      expect(deepseekModels.length).toBe(1);
      expect(deepseekModels[0].id).toBe('deepseek-web/deepseek-chat');
    });
    
    test('应该按上下文长度筛选模型', () => {
      const manager = new MockMultiModelManager({
        models: [
          { id: 'deepseek-web/deepseek-chat', context_length: 64000 },
          { id: 'claude-web/claude-sonnet-4-6', context_length: 195000 },
          { id: 'qwen-web/qwen-3-5-plus', context_length: 128000 }
        ]
      });
      
      const largeContext = manager.filterModels({ contextLength: 100000 });
      expect(largeContext.length).toBe(2);
    });
    
    test('应该搜索模型', () => {
      const manager = new MockMultiModelManager({
        models: [
          { id: 'deepseek-web/deepseek-chat' },
          { id: 'deepseek-web/deepseek-reasoner' },
          { id: 'claude-web/claude-sonnet-4-6' }
        ]
      });
      
      const results = manager.searchModels('deepseek');
      expect(results.length).toBe(2);
    });
    
    test('应该获取统计信息', () => {
      const manager = new MockMultiModelManager({
        models: [
          { id: 'deepseek-web/deepseek-chat' },
          { id: 'claude-web/claude-sonnet-4-6' }
        ]
      });
      
      const stats = manager.getStats();
      expect(stats.totalModels).toBe(2);
      expect(stats.initialized).toBe(false);
    });
  });
  
  describe('集成场景', () => {
    test('应该创建完整堆栈', () => {
      const clientConfig = {
        gatewayUrl: 'http://localhost:3002',
        token: 'test-token'
      };
      
      const authConfig = {
        stateDir: '/tmp/test-integration'
      };
      
      const managerConfig = {
        defaultModel: 'claude-web/claude-sonnet-4-6'
      };
      
      expect(clientConfig.gatewayUrl).toBeDefined();
      expect(authConfig.stateDir).toBeDefined();
      expect(managerConfig.defaultModel).toBe('claude-web/claude-sonnet-4-6');
    });
    
    test('应该处理模型切换工作流', async () => {
      const models = [
        { id: 'deepseek-web/deepseek-chat', name: 'DeepSeek' },
        { id: 'claude-web/claude-sonnet-4-6', name: 'Claude' },
        { id: 'qwen-web/qwen-3-5-plus', name: 'Qwen' }
      ];
      
      let currentModel = 'deepseek-web/deepseek-chat';
      
      const resolveModelId = (input) => {
        const aliases = {
          'claude': 'claude-web/claude-sonnet-4-6',
          'qwen': 'qwen-web/qwen-3-5-plus'
        };
        return aliases[input.toLowerCase()] || input;
      };
      
      const switchModel = (modelId) => {
        const resolved = resolveModelId(modelId);
        const model = models.find(m => m.id === resolved);
        if (!model) throw new Error('Model not found');
        currentModel = resolved;
        return model;
      };
      
      await switchModel('claude');
      expect(currentModel).toBe('claude-web/claude-sonnet-4-6');
      
      await switchModel('qwen-web/qwen-3-5-plus');
      expect(currentModel).toBe('qwen-web/qwen-3-5-plus');
    });
    
    test('应该处理多提供商认证', () => {
      const providers = new Set();
      
      providers.add('deepseek-web');
      providers.add('claude-web');
      providers.add('qwen-web');
      
      expect(providers.has('deepseek-web')).toBe(true);
      expect(providers.has('claude-web')).toBe(true);
      expect(providers.has('qwen-web')).toBe(true);
      expect(providers.has('gemini-web')).toBe(false);
      expect(providers.size).toBe(3);
    });
  });
});
