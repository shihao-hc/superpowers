const { ModelGateway } = require('../../src/ai/models/ModelGateway');

jest.mock('openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'mock openai response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          model: 'gpt-4',
          id: 'openai-mock-id'
        })
      }
    }
  }))
}), { virtual: true });

jest.mock('../../src/localInferencing/OllamaBridge', () => ({
  OllamaBridge: jest.fn().mockImplementation(() => ({
    generate: jest.fn().mockResolvedValue({
      response: 'mock local response',
      prompt_eval_count: 15,
      eval_count: 7
    })
  }))
}));

jest.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ text: 'mock anthropic response' }],
        usage: { input_tokens: 20, output_tokens: 8 },
        model: 'claude-3-opus',
        id: 'anthropic-mock-id'
      })
    }
  }));
  return MockAnthropic;
}, { virtual: true });

describe('ModelGateway', () => {
  let gateway;

  beforeEach(() => {
    gateway = new ModelGateway();
  });

  describe('constructor', () => {
    it('registers 12 default models', () => {
      expect(gateway.models.size).toBe(12);
    });

    it('registers models with stats tracking', () => {
      const model = gateway.getModel('openai-gpt-4');
      expect(model.stats).toBeDefined();
      expect(model.stats.totalRequests).toBe(0);
      expect(model.stats.totalTokens).toEqual({ input: 0, output: 0 });
      expect(model.stats.totalCost).toBe(0);
      expect(model.stats.errors).toBe(0);
      expect(model.stats.avgLatency).toBe(0);
    });
  });

  describe('registerModel', () => {
    it('registers a custom model', () => {
      gateway.registerModel({
        id: 'custom-test',
        provider: 'openai',
        name: 'Test Model',
        type: 'chat',
        contextWindow: 4096,
        inputCost: 0.01,
        outputCost: 0.02,
        capabilities: ['chat'],
        status: 'active'
      });
      const model = gateway.getModel('custom-test');
      expect(model).toBeDefined();
      expect(model.name).toBe('Test Model');
      expect(model.registeredAt).toBeDefined();
    });

    it('overwrites existing model on re-register', () => {
      gateway.registerModel({
        id: 'openai-gpt-4',
        provider: 'openai',
        name: 'GPT-4 Updated',
        type: 'chat',
        contextWindow: 128000,
        inputCost: 0.03,
        outputCost: 0.06,
        capabilities: ['chat'],
        status: 'active'
      });
      expect(gateway.getModel('openai-gpt-4').name).toBe('GPT-4 Updated');
    });
  });

  describe('getModel', () => {
    it('retrieves model by id', () => {
      const model = gateway.getModel('openai-gpt-4');
      expect(model).toBeDefined();
      expect(model.name).toBe('GPT-4');
    });

    it('returns undefined for non-existent model', () => {
      expect(gateway.getModel('non-existent')).toBeUndefined();
    });
  });

  describe('listModels', () => {
    it('returns all models without filters', () => {
      expect(gateway.listModels()).toHaveLength(12);
    });

    it('filters by provider', () => {
      const openaiModels = gateway.listModels({ provider: 'openai' });
      expect(openaiModels.length).toBeGreaterThan(0);
      openaiModels.forEach(m => expect(m.provider).toBe('openai'));
    });

    it('filters by type', () => {
      const embeddingModels = gateway.listModels({ type: 'embedding' });
      expect(embeddingModels).toHaveLength(1);
      expect(embeddingModels[0].id).toBe('openai-text-embedding-3-large');
    });

    it('filters by domain', () => {
      const medicalModels = gateway.listModels({ domain: 'healthcare' });
      expect(medicalModels).toHaveLength(1);
      expect(medicalModels[0].id).toBe('domain-medical-gpt');
    });

    it('filters by capability', () => {
      const visionModels = gateway.listModels({ capability: 'vision' });
      expect(visionModels.length).toBeGreaterThan(0);
      visionModels.forEach(m => expect(m.capabilities).toContain('vision'));
    });

    it('filters by status', () => {
      const activeModels = gateway.listModels({ status: 'active' });
      expect(activeModels).toHaveLength(12);
    });

    it('combines multiple filters', () => {
      const result = gateway.listModels({ provider: 'openai', type: 'chat' });
      result.forEach(m => {
        expect(m.provider).toBe('openai');
        expect(m.type).toBe('chat');
      });
    });
  });

  describe('route', () => {
    it('routes a basic chat request', async () => {
      const result = await gateway.route({ task: 'chat' });
      expect(result.modelId).toBeDefined();
      expect(result.model).toBeDefined();
      expect(result.provider).toBeDefined();
      expect(result.reasoning).toBeDefined();
      expect(result.cost).toBeDefined();
      expect(typeof result.cost.totalCost).toBe('number');
    });

    it('routes to domain-specific model when domain is specified', async () => {
      const result = await gateway.route({ task: 'chat', domain: 'healthcare' });
      expect(result.modelId).toBe('domain-medical-gpt');
    });

    it('routes to large context models for high complexity', async () => {
      const result = await gateway.route({ task: 'chat', complexity: 'high' });
      const model = gateway.getModel(result.modelId);
      expect(model.contextWindow).toBeGreaterThanOrEqual(100000);
    });

    it('routes without crashing for low complexity', async () => {
      const result = await gateway.route({ task: 'chat', complexity: 'low' });
      expect(result.modelId).toBeDefined();
      expect(result.cost).toBeDefined();
    });

    it('respects budget constraint', async () => {
      const result = await gateway.route({ task: 'chat', budget: 0.001 });
      const model = gateway.getModel(result.modelId);
      const estimatedCost = (model.inputCost + model.outputCost) * 1000;
      expect(estimatedCost).toBeLessThanOrEqual(0.001);
    });

    it('respects latency constraint', async () => {
      const result = await gateway.route({ task: 'chat', latency: 2000 });
      const model = gateway.getModel(result.modelId);
      expect(model.latency.p95).toBeLessThanOrEqual(2000);
    });

    it('throws when no suitable model found', async () => {
      await expect(gateway.route({
        task: 'chat',
        budget: 0.000001,
        latency: 1
      })).rejects.toThrow('No suitable model found');
    });

    it('updates stats on route', async () => {
      await gateway.route({ task: 'chat' });
      const anyIncreased = Array.from(gateway.models.values())
        .some(m => m.stats.totalRequests > 0);
      expect(anyIncreased).toBe(true);
    });
  });

  describe('registerRouter and routeWithStrategy', () => {
    it('calls registered custom router', async () => {
      const customRouter = jest.fn().mockResolvedValue({
        modelId: 'custom', model: 'Custom', provider: 'test',
        reasoning: 'test', cost: { totalCost: 0 }
      });
      gateway.registerRouter('custom', customRouter);
      await gateway.routeWithStrategy('custom', { task: 'chat' });
      expect(customRouter).toHaveBeenCalledWith(gateway, { task: 'chat' });
    });

    it('falls back to default route when strategy not registered', async () => {
      const result = await gateway.routeWithStrategy('non-existent', { task: 'chat' });
      expect(result.modelId).toBeDefined();
    });
  });

  describe('routing strategies', () => {
    it('routeByCost selects cheapest model', async () => {
      const router = gateway.routeByCost();
      const result = await router(gateway, { task: 'chat', inputTokens: 100, outputTokens: 50 });
      const model = gateway.getModel(result.modelId);
      expect(model.inputCost).toBe(0);
    });

    it('routeByLatency selects fastest model', async () => {
      const router = gateway.routeByLatency();
      const result = await router(gateway, { task: 'chat' });
      const model = gateway.getModel(result.modelId);
      expect(model.latency.p95).toBe(1500);
    });

    it('routeByQuality selects model with largest context', async () => {
      const router = gateway.routeByQuality();
      const result = await router(gateway, { task: 'chat' });
      const model = gateway.getModel(result.modelId);
      expect(model.contextWindow).toBe(200000);
    });

    it('routeByIntelligence selects opus for high complexity high budget', async () => {
      const router = gateway.routeByIntelligence();
      const result = await router(gateway, {
        task: 'chat', complexity: 'high', budget: 0.2
      });
      expect(result.modelId).toBe('anthropic-claude-3-opus');
    });

    it('routeByIntelligence selects sonnet for medium complexity', async () => {
      const router = gateway.routeByIntelligence();
      const result = await router(gateway, { task: 'chat', complexity: 'medium' });
      expect(result.modelId).toBe('anthropic-claude-3-sonnet');
    });

    it('routeByIntelligence selects gpt-35 for low latency requirement', async () => {
      const router = gateway.routeByIntelligence();
      const result = await router(gateway, { task: 'chat', latency: 1000 });
      expect(result.modelId).toBe('openai-gpt-35-turbo');
    });
  });

  describe('call', () => {
    it('throws for non-existent model', async () => {
      await expect(gateway.call('non-existent', []))
        .rejects.toThrow('Model not found: non-existent');
    });

    it('calls OpenAI provider and returns response', async () => {
      const result = await gateway.call('openai-gpt-4', [
        { role: 'user', content: 'hello' }
      ]);
      expect(result.content).toBe('mock openai response');
      expect(result.usage).toBeDefined();
      expect(result.usage.inputTokens).toBe(10);
    });

    it('calls Anthropic provider and returns response', async () => {
      const result = await gateway.call('anthropic-claude-3-opus', [
        { role: 'user', content: 'hello' }
      ]);
      expect(result.content).toBe('mock anthropic response');
      expect(result.usage).toBeDefined();
      expect(result.usage.inputTokens).toBe(20);
    });

    it('throws for unsupported provider', async () => {
      gateway.registerModel({
        id: 'unknown-provider-model',
        provider: 'unknown',
        name: 'Unknown',
        type: 'chat',
        contextWindow: 4096,
        inputCost: 0,
        outputCost: 0,
        capabilities: ['chat'],
        status: 'active'
      });
      await expect(gateway.call('unknown-provider-model', []))
        .rejects.toThrow('Unsupported provider: unknown');
    });

    it('records stats on successful call', async () => {
      const statsBefore = gateway.getModel('openai-gpt-4').stats.totalRequests;
      await gateway.call('openai-gpt-4', [{ role: 'user', content: 'hello' }]);
      const statsAfter = gateway.getModel('openai-gpt-4').stats;
      expect(statsAfter.totalRequests).toBe(statsBefore + 1);
      expect(statsAfter.totalTokens.input).toBe(10);
      expect(statsAfter.totalTokens.output).toBe(5);
    });

    it('records error on failed call', async () => {
      jest.spyOn(gateway, '_callOpenAI')
        .mockRejectedValueOnce(new Error('API error'));
      const statsBefore = gateway.getModel('openai-gpt-4').stats.errors;
      await expect(gateway.call('openai-gpt-4', []))
        .rejects.toThrow('API error');
      expect(gateway.getModel('openai-gpt-4').stats.errors)
        .toBe(statsBefore + 1);
    });
  });

  describe('getModelStats', () => {
    it('returns stats for existing model', () => {
      const stats = gateway.getModelStats('openai-gpt-4');
      expect(stats.modelId).toBe('openai-gpt-4');
      expect(stats.name).toBe('GPT-4');
      expect(stats.provider).toBe('openai');
      expect(stats.stats).toBeDefined();
      expect(stats.errorRate).toBe(0);
    });

    it('returns null for non-existent model', () => {
      expect(gateway.getModelStats('non-existent')).toBeNull();
    });
  });

  describe('getTotalCost', () => {
    it('returns zero cost structure initially', () => {
      const cost = gateway.getTotalCost();
      expect(cost.totalCostUSD).toBe(0);
      expect(cost.byProvider).toBeDefined();
      expect(cost.byModel).toBeDefined();
    });

    it('returns accumulated cost by provider', async () => {
      await gateway.call('openai-gpt-4', [{ role: 'user', content: 'hello' }]);
      const cost = gateway.getTotalCost();
      expect(cost.totalCostUSD).toBeGreaterThan(0);
      expect(cost.byProvider.openai).toBeGreaterThan(0);
    });
  });

  describe('healthCheck', () => {
    it('returns all healthy initially', () => {
      const health = gateway.healthCheck();
      expect(health.total).toBe(12);
      expect(health.healthy).toBe(12);
      expect(health.degraded).toBe(0);
      expect(health.unhealthy).toBe(0);
    });

    it('returns correct structure for each model', () => {
      const health = gateway.healthCheck();
      expect(health.models).toHaveLength(12);
      health.models.forEach(m => {
        expect(m.id).toBeDefined();
        expect(m.name).toBeDefined();
        expect(m.status).toBe('healthy');
        expect(m.errorRate).toBe(0);
        expect(m.avgLatency).toBe(0);
      });
    });

    it('reports degraded and unhealthy models based on error rates', () => {
      const gpt4 = gateway.getModel('openai-gpt-4');
      gpt4.stats.totalRequests = 10;
      gpt4.stats.errors = 3;

      const gpt35 = gateway.getModel('openai-gpt-35-turbo');
      gpt35.stats.totalRequests = 10;
      gpt35.stats.errors = 6;

      const health = gateway.healthCheck();
      expect(health.degraded).toBe(1);
      expect(health.unhealthy).toBe(1);
      expect(health.healthy).toBe(10);
      expect(health.total).toBe(12);
    });
  });

  describe('_findSuitableModels - domain fallthrough', () => {
    it('falls through domain filter when no matching domain models exist', async () => {
      const result = await gateway.route({ task: 'chat', domain: 'unknown' });
      expect(result.modelId).toBeDefined();
      expect(result.reasoning).toBeDefined();
    });
  });

  describe('routeByIntelligence - fallback', () => {
    it('falls through to default route when no special conditions match', async () => {
      const router = gateway.routeByIntelligence();
      const result = await router(gateway, { task: 'chat' });
      expect(result.modelId).toBeDefined();
      expect(result.model).toBeDefined();
    });
  });

  describe('call - local provider', () => {
    it('calls local provider and returns response', async () => {
      const result = await gateway.call('local-mistral-7b', [
        { role: 'user', content: 'hello' }
      ]);
      expect(result.content).toBe('mock local response');
      expect(result.usage.inputTokens).toBe(15);
      expect(result.usage.outputTokens).toBe(7);
    });
  });

  describe('getModelStats - error rate', () => {
    it('returns correct error rate after mixed success and failure', async () => {
      await gateway.call('openai-gpt-4', [{ role: 'user', content: 'hello' }]);
      jest.spyOn(gateway, '_callOpenAI').mockRejectedValueOnce(new Error('API error'));
      await expect(gateway.call('openai-gpt-4', [])).rejects.toThrow('API error');
      const stats = gateway.getModelStats('openai-gpt-4');
      expect(stats.errorRate).toBeGreaterThan(0);
    });
  });
});
