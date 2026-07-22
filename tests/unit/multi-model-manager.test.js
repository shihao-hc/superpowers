const { MultiModelManager, createMultiModelManager, getMultiModelManager, DEFAULT_PROVIDERS, MODEL_ALIASES } = require('../../src/integrations/openclaw/MultiModelManager');

const mockModels = [
  { id: 'deepseek-web/deepseek-chat', name: 'DeepSeek Chat', context_length: 32768, supported_features: ['chat', 'streaming'] },
  { id: 'qwen-web/qwen-3-5-plus', name: '通义千问 3.5 Plus', context_length: 65536, supported_features: ['chat', 'streaming', 'reasoning'] },
  { id: 'claude-web/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', context_length: 128000, supported_features: ['chat', 'streaming', 'thinking'] },
  { id: 'gemini-web/gemini-pro', name: 'Gemini Pro', context_length: 32000, supported_features: ['chat', 'streaming'] },
  { id: 'manus-api/manus-1.6', name: 'Manus 1.6', context_length: 16000, supported_features: ['chat', 'streaming', 'code'] }
];

describe('MultiModelManager', () => {
  let manager;
  let mockClient;

  beforeEach(() => {
    mockClient = {
      listModels: jest.fn().mockResolvedValue(mockModels),
      chatCompletion: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'response' } }] }),
      streamChatCompletion: jest.fn().mockImplementation(async (opts, onChunk) => {
        onChunk({ choices: [{ delta: { content: 'Hello' } }] });
        onChunk({ choices: [{ delta: { content: ' world' } }] });
      })
    };
    manager = new MultiModelManager({ client: mockClient });
  });

  describe('constructor', () => {
    it('sets default model and initializes state', () => {
      expect(manager.client).toBe(mockClient);
      expect(manager.defaultModel).toBe('deepseek-web/deepseek-chat');
      expect(manager.currentModel).toBe('deepseek-web/deepseek-chat');
      expect(manager.models).toEqual([]);
      expect(manager.providers).toBeInstanceOf(Map);
      expect(manager.modelCache).toBeInstanceOf(Map);
      expect(manager.cacheTTL).toBe(300000);
      expect(manager.initialized).toBe(false);
    });

    it('accepts custom config', () => {
      const m = new MultiModelManager({ client: mockClient, defaultModel: 'claude-web/claude-sonnet-4-6', cacheTTL: 60000 });
      expect(m.defaultModel).toBe('claude-web/claude-sonnet-4-6');
      expect(m.cacheTTL).toBe(60000);
    });
  });

  describe('initialize', () => {
    it('fetches models and builds provider index', async () => {
      const models = await manager.initialize();
      expect(models).toEqual(mockModels);
      expect(manager.models).toEqual(mockModels);
      expect(manager.initialized).toBe(true);
      expect(manager.providers.size).toBe(5);
    });

    it('groups models under same provider', async () => {
      await manager.initialize();
      manager._buildProviderIndex([
        { id: 'deepseek-web/model-a' },
        { id: 'deepseek-web/model-b' }
      ]);
      expect(manager.providers.size).toBe(1);
      expect(manager.providers.get('deepseek-web').models.length).toBe(2);
    });

    it('emits initialized event', async () => {
      const handler = jest.fn();
      manager.on('initialized', handler);
      await manager.initialize();
      expect(handler).toHaveBeenCalledWith({ modelCount: 5 });
    });

    it('emits error and rethrows on failure', async () => {
      const err = new Error('API error');
      mockClient.listModels.mockRejectedValue(err);
      const handler = jest.fn();
      manager.on('error', handler);
      await expect(manager.initialize()).rejects.toThrow('API error');
      expect(handler).toHaveBeenCalledWith(err);
    });
  });

  describe('resolveModelId', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('resolves aliases', () => {
      expect(manager.resolveModelId('deepseek')).toBe('deepseek-web/deepseek-chat');
      expect(manager.resolveModelId('claude')).toBe('claude-web/claude-sonnet-4-6');
      expect(manager.resolveModelId('gemini')).toBe('gemini-web/gemini-pro');
    });

    it('returns exact match when found', () => {
      expect(manager.resolveModelId('deepseek-web/deepseek-chat')).toBe('deepseek-web/deepseek-chat');
    });

    it('fuzzy matches partial input', () => {
      expect(manager.resolveModelId('sonnet')).toBe('claude-web/claude-sonnet-4-6');
    });

    it('returns default model when no match', () => {
      expect(manager.resolveModelId('nonexistent-model')).toBe('deepseek-web/deepseek-chat');
    });

    it('is case insensitive', () => {
      expect(manager.resolveModelId('DEEPSEEK')).toBe('deepseek-web/deepseek-chat');
    });
  });

  describe('switchModel', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('switches to valid model', async () => {
      const model = await manager.switchModel('claude-web/claude-sonnet-4-6');
      expect(manager.currentModel).toBe('claude-web/claude-sonnet-4-6');
      expect(model.id).toBe('claude-web/claude-sonnet-4-6');
    });

    it('resolves alias and switches', async () => {
      await manager.switchModel('qwen');
      expect(manager.currentModel).toBe('qwen-web/qwen-3-5-plus');
    });

    it('emits modelSwitched event', async () => {
      const handler = jest.fn();
      manager.on('modelSwitched', handler);
      await manager.switchModel('gemini-web/gemini-pro');
      expect(handler).toHaveBeenCalledWith({ model: 'gemini-web/gemini-pro', details: mockModels[3] });
    });

    it('falls back to default model for unknown input', async () => {
      const model = await manager.switchModel('zzzzz-nomatch');
      expect(manager.currentModel).toBe('deepseek-web/deepseek-chat');
      expect(model.id).toBe('deepseek-web/deepseek-chat');
    });

    it('throws when model not found and no models loaded', async () => {
      const fresh = new MultiModelManager({ client: mockClient });
      await expect(fresh.switchModel('any-model')).rejects.toThrow('Model not found: any-model');
    });
  });

  describe('getCurrentModel', () => {
    it('returns the current model', async () => {
      await manager.initialize();
      const model = manager.getCurrentModel();
      expect(model.id).toBe('deepseek-web/deepseek-chat');
    });

    it('returns undefined when no models loaded', () => {
      expect(manager.getCurrentModel()).toBeUndefined();
    });
  });

  describe('chat', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('sends chat with current model', async () => {
      const messages = [{ role: 'user', content: 'hello' }];
      const response = await manager.chat(messages);
      expect(response.choices[0].message.content).toBe('response');
      expect(mockClient.chatCompletion).toHaveBeenCalledWith(
        { model: 'deepseek-web/deepseek-chat', messages, temperature: 0.7, max_tokens: undefined },
        null
      );
    });

    it('sends chat with specified model', async () => {
      await manager.chat([{ role: 'user', content: 'hi' }], { model: 'claude' });
      expect(mockClient.chatCompletion).toHaveBeenCalledWith(
        { model: 'claude-web/claude-sonnet-4-6', messages: [{ role: 'user', content: 'hi' }], temperature: 0.7, max_tokens: undefined },
        null
      );
    });

    it('passes temperature and max_tokens', async () => {
      await manager.chat([{ role: 'user', content: 'hi' }], { temperature: 0.3, max_tokens: 100 });
      expect(mockClient.chatCompletion).toHaveBeenCalledWith(
        { model: 'deepseek-web/deepseek-chat', messages: [{ role: 'user', content: 'hi' }], temperature: 0.3, max_tokens: 100 },
        null
      );
    });
  });

  describe('streamChat', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('streams chunks and merges content', async () => {
      const result = await manager.streamChat([{ role: 'user', content: 'hello' }]);
      expect(result.content).toBe('Hello world');
      expect(result.raw.length).toBe(2);
    });

    it('calls onChunk callback for each chunk', async () => {
      const onChunk = jest.fn();
      await manager.streamChat([{ role: 'user', content: 'hello' }], { onChunk });
      expect(onChunk).toHaveBeenCalledTimes(2);
    });

    it('streams with specified model option', async () => {
      const result = await manager.streamChat([{ role: 'user', content: 'hi' }], { model: 'claude' });
      expect(result.content).toBe('Hello world');
      expect(mockClient.streamChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-web/claude-sonnet-4-6' }),
        expect.any(Function)
      );
    });
  });

  describe('_mergeChunks', () => {
    it('merges content from chunks', () => {
      const chunks = [
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: { content: ' world' } }] }
      ];
      const result = manager._mergeChunks(chunks);
      expect(result.content).toBe('Hello world');
      expect(result.reasoning).toBe('');
    });

    it('merges reasoning from thinking deltas', () => {
      const chunks = [
        { choices: [{ delta: { thinking: 'Let me think...' } }] },
        { choices: [{ delta: { content: 'Answer' } }] }
      ];
      const result = manager._mergeChunks(chunks);
      expect(result.content).toBe('Answer');
      expect(result.reasoning).toBe('Let me think...');
    });

    it('handles reasoning delta field', () => {
      const chunks = [
        { choices: [{ delta: { reasoning: 'Step 1...' } }] }
      ];
      const result = manager._mergeChunks(chunks);
      expect(result.reasoning).toBe('Step 1...');
    });

    it('returns empty content for no chunks', () => {
      const result = manager._mergeChunks([]);
      expect(result.content).toBe('');
      expect(result.reasoning).toBe('');
    });
  });

  describe('ask', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('sends prompt and returns content', async () => {
      const result = await manager.ask('Hello');
      expect(result.content).toBe('response');
    });

    it('streams when stream option set', async () => {
      const result = await manager.ask('Hello', { stream: true });
      expect(result.content).toBe('Hello world');
    });

    it('handles missing message content', async () => {
      mockClient.chatCompletion.mockResolvedValue({ choices: [{ message: {} }] });
      const result = await manager.ask('Hello');
      expect(result.content).toBe('');
    });

    it('handles missing choices', async () => {
      mockClient.chatCompletion.mockResolvedValue({});
      const result = await manager.ask('Hello');
      expect(result.content).toBe('');
    });
  });

  describe('askOnce', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('queries with current model when no modelIds given', async () => {
      const results = await manager.askOnce('Hello');
      expect(results.length).toBe(1);
      expect(results[0].model).toBe('deepseek-web/deepseek-chat');
    });

    it('queries multiple models', async () => {
      const results = await manager.askOnce('Hello', ['deepseek', 'qwen']);
      expect(results.length).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('handles partial failures', async () => {
      mockClient.chatCompletion.mockRejectedValueOnce(new Error('Rate limited'));
      const results = await manager.askOnce('Hello', ['deepseek', 'qwen']);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Rate limited');
      expect(results[1].success).toBe(true);
    });

    it('handles unhandled rejection in askOnce map', async () => {
      const badError = { get message() { throw new Error('chain error'); } };
      mockClient.chatCompletion.mockRejectedValue(badError);
      const results = await manager.askOnce('Hello', ['deepseek', 'qwen']);
      expect(results.length).toBe(2);
      expect(results[0] instanceof Error).toBe(true);
      expect(results[0].message).toBe('chain error');
    });
  });

  describe('getProviders', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('returns provider list with models', () => {
      const providers = manager.getProviders();
      expect(providers.length).toBe(5);
      expect(providers[0].name).toBeDefined();
      expect(providers[0].models).toBeDefined();
      expect(providers[0].models[0].contextLength).toBeDefined();
    });

    it('maps model fields correctly', () => {
      const providers = manager.getProviders();
      const deepseek = providers.find((p) => p.id === 'deepseek-web');
      expect(deepseek.models[0]).toEqual({
        id: 'deepseek-web/deepseek-chat',
        name: 'DeepSeek Chat',
        contextLength: 32768,
        supportedFeatures: ['chat', 'streaming']
      });
    });

    it('handles model without name', () => {
      const provider = manager.providers.get('deepseek-web');
      provider.models.push({ id: 'deepseek-web/unnamed-model' });
      const providers = manager.getProviders();
      const unnamed = providers.find(p => p.id === 'deepseek-web')
        .models.find(m => m.id === 'deepseek-web/unnamed-model');
      expect(unnamed.name).toBe('deepseek-web/unnamed-model');
    });
  });

  describe('getModels', () => {
    it('returns cached models when available', async () => {
      manager.models = [{ id: 'cached-model' }];
      const models = await manager.getModels();
      expect(models).toEqual([{ id: 'cached-model' }]);
      expect(mockClient.listModels).not.toHaveBeenCalled();
    });

    it('initializes when no cached models', async () => {
      const models = await manager.getModels();
      expect(mockClient.listModels).toHaveBeenCalled();
      expect(models).toEqual(mockModels);
    });

    it('refreshes when forceRefresh is true', async () => {
      manager.models = [{ id: 'old' }];
      const models = await manager.getModels(true);
      expect(mockClient.listModels).toHaveBeenCalled();
      expect(models).toEqual(mockModels);
    });
  });

  describe('filterModels', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('filters by provider', () => {
      const results = manager.filterModels({ provider: 'deepseek-web' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('deepseek-web/deepseek-chat');
    });

    it('filters by minimum context length', () => {
      const results = manager.filterModels({ contextLength: 64000 });
      expect(results).toHaveLength(2);
      expect(results.map((m) => m.id)).toContain('qwen-web/qwen-3-5-plus');
      expect(results.map((m) => m.id)).toContain('claude-web/claude-sonnet-4-6');
    });

    it('filters by required features', () => {
      const results = manager.filterModels({ features: ['thinking'] });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('claude-web/claude-sonnet-4-6');
    });

    it('returns all models when no criteria given', () => {
      const results = manager.filterModels({});
      expect(results).toHaveLength(5);
    });

    it('combines multiple criteria', () => {
      const results = manager.filterModels({ features: ['streaming', 'chat'] });
      expect(results.length).toBeGreaterThanOrEqual(4);
    });

    it('handles model without context_length', () => {
      manager.models = [...manager.models, { id: 'new-provider/new-model', name: 'New', supported_features: [] }];
      const results = manager.filterModels({ contextLength: 100 });
      expect(results).toHaveLength(5);
    });
  });

  describe('searchModels', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('finds models by id substring', () => {
      const results = manager.searchModels('deepseek');
      expect(results).toHaveLength(1);
    });

    it('finds models by name substring', () => {
      const results = manager.searchModels('Claude');
      expect(results).toHaveLength(1);
    });

    it('returns empty array for no match', () => {
      const results = manager.searchModels('zzzzz');
      expect(results).toHaveLength(0);
    });

    it('is case insensitive', () => {
      const results = manager.searchModels('SONNET');
      expect(results).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    it('returns current state', async () => {
      await manager.initialize();
      const stats = manager.getStats();
      expect(stats.initialized).toBe(true);
      expect(stats.currentModel).toBe('deepseek-web/deepseek-chat');
      expect(stats.totalModels).toBe(5);
      expect(stats.totalProviders).toBe(5);
      expect(stats.providers).toContain('deepseek-web');
      expect(stats.modelAliases).toContain('deepseek');
    });

    it('returns uninitialized state', () => {
      const stats = manager.getStats();
      expect(stats.initialized).toBe(false);
      expect(stats.totalModels).toBe(0);
    });
  });

  describe('_getProviderName', () => {
    it('returns display name for known providers', () => {
      expect(manager._getProviderName('deepseek-web')).toBe('DeepSeek');
      expect(manager._getProviderName('qwen-web')).toBe('通义千问');
      expect(manager._getProviderName('manus-api')).toBe('Manus');
    });

    it('returns provider id for unknown providers', () => {
      expect(manager._getProviderName('unknown-provider')).toBe('unknown-provider');
    });
  });

  describe('EventEmitter', () => {
    it('inherits from EventEmitter', () => {
      expect(manager).toBeInstanceOf(require('events').EventEmitter);
    });

    it('emits and listens to events', () => {
      const handler = jest.fn();
      manager.on('test', handler);
      manager.emit('test', { data: 1 });
      expect(handler).toHaveBeenCalledWith({ data: 1 });
    });
  });
});

describe('exports', () => {
  describe('createMultiModelManager', () => {
    it('creates a new manager instance', () => {
      const mockClient = { listModels: jest.fn().mockResolvedValue([]) };
      const m = createMultiModelManager({ client: mockClient });
      expect(m).toBeInstanceOf(MultiModelManager);
    });
  });

  describe('getMultiModelManager', () => {
    it('returns singleton instance', () => {
      const m1 = getMultiModelManager();
      const m2 = getMultiModelManager();
      expect(m1).toBe(m2);
    });
  });

  describe('constants', () => {
    it('exports DEFAULT_PROVIDERS', () => {
      expect(DEFAULT_PROVIDERS).toContain('deepseek-web');
      expect(DEFAULT_PROVIDERS).toContain('claude-web');
    });

    it('exports MODEL_ALIASES', () => {
      expect(MODEL_ALIASES.deepseek).toBe('deepseek-web/deepseek-chat');
      expect(MODEL_ALIASES.claude).toBe('claude-web/claude-sonnet-4-6');
    });
  });
});
