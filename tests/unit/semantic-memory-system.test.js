const { SemanticMemorySystem, RAGContextBuilder, MemoryConsolidator } = require('../../src/memory/SemanticMemorySystem');

jest.mock('chromadb', () => {
  const collection = {
    add: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue({
      documents: [['doc1', 'doc2']],
      distances: [[0.1, 0.3]],
      ids: [['id1', 'id2']],
      metadatas: [[{ createdAt: 100 }, { createdAt: 200 }]]
    }),
    delete: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue({
      documents: ['conv1', 'conv2'],
      metadatas: [{ userId: 'u1', createdAt: 100 }, { userId: 'u1', createdAt: 200 }]
    }),
    count: jest.fn().mockResolvedValue(5)
  };
  globalThis.__mockCollection = collection;

  const ChromaClient = jest.fn().mockImplementation(() => ({
    getOrCreateCollection: jest.fn().mockResolvedValue(collection)
  }));

  return { ChromaClient, ChromaClientError: class extends Error {} };
});

describe('SemanticMemorySystem', () => {
  let memory;
  const mockCollection = globalThis.__mockCollection;

  function resetMockCollection() {
    mockCollection.add.mockReset().mockResolvedValue(undefined);
    mockCollection.query.mockReset().mockResolvedValue({
      documents: [['doc1', 'doc2']],
      distances: [[0.1, 0.3]],
      ids: [['id1', 'id2']],
      metadatas: [[{ createdAt: 100 }, { createdAt: 200 }]]
    });
    mockCollection.delete.mockReset().mockResolvedValue(undefined);
    mockCollection.get.mockReset().mockResolvedValue({
      documents: ['conv1', 'conv2'],
      metadatas: [{ userId: 'u1', createdAt: 100 }, { userId: 'u1', createdAt: 200 }]
    });
    mockCollection.count.mockReset().mockResolvedValue(5);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    memory = new SemanticMemorySystem({ persistDirectory: './test-db' });
    resetMockCollection();
  });

  afterEach(async () => {
    await memory.destroy();
  });

  describe('constructor', () => {
    test('uses default options when none provided', () => {
      const m = new SemanticMemorySystem();
      expect(m.options.persistDirectory).toBe('./data/chromadb');
      expect(m.options.collectionName).toBe('semantic_memory');
      expect(m.options.maxResults).toBe(5);
      expect(m.options.similarityThreshold).toBe(0.7);
      expect(m.isInitialized).toBe(false);
      expect(m.client).toBeNull();
      expect(m.embedder).toBeNull();
    });

    test('merges custom options with defaults', () => {
      const m = new SemanticMemorySystem({
        persistDirectory: '/custom/path',
        maxResults: 10,
        similarityThreshold: 0.8
      });
      expect(m.options.persistDirectory).toBe('/custom/path');
      expect(m.options.maxResults).toBe(10);
      expect(m.options.similarityThreshold).toBe(0.8);
      expect(m.options.collectionName).toBe('semantic_memory');
    });

    test('initializes five collection configs', () => {
      const keys = Object.keys(memory.collectionConfigs);
      expect(keys).toEqual(['conversations', 'facts', 'preferences', 'personality', 'events']);
      expect(memory.collectionConfigs.conversations.name).toBe('conversations');
      expect(memory.collectionConfigs.facts.metadata.type).toBe('fact');
      expect(memory.collectionConfigs.personality.description).toBe('人格特征记忆');
    });

    test('initializes empty collections map', () => {
      expect(memory.collections).toBeInstanceOf(Map);
      expect(memory.collections.size).toBe(0);
    });
  });

  describe('initialize', () => {
    test('creates ChromaDB client and all collections', async () => {
      const { ChromaClient } = require('chromadb');
      const result = await memory.initialize();

      expect(result).toBe(true);
      expect(ChromaClient).toHaveBeenCalledWith({ path: './test-db' });
      expect(memory.isInitialized).toBe(true);
      expect(memory.collections.size).toBe(5);
    });

    test('is idempotent when already initialized', async () => {
      await memory.initialize();
      const { ChromaClient } = require('chromadb');
      ChromaClient.mockClear();

      const result = await memory.initialize();

      expect(result).toBeUndefined();
      expect(ChromaClient).not.toHaveBeenCalled();
    });

    test('returns false when ChromaDB creation fails', async () => {
      const { ChromaClient } = require('chromadb');
      ChromaClient.mockImplementationOnce(() => { throw new Error('Connection refused'); });

      const result = await memory.initialize();

      expect(result).toBe(false);
      expect(memory.isInitialized).toBe(false);
    });

    test('handles individual collection creation failure gracefully', async () => {
      const { ChromaClient } = require('chromadb');
      ChromaClient.mockImplementationOnce(() => ({
        getOrCreateCollection: jest.fn()
          .mockRejectedValueOnce(new Error('permission denied'))
          .mockResolvedValue(mockCollection)
      }));

      const result = await memory.initialize();

      expect(result).toBe(true);
      expect(memory.collections.size).toBe(4);
    });
  });

  describe('addMemory', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    test('adds string content to collection and returns id', async () => {
      const id = await memory.addMemory('conversations', 'Hello world', { userId: 'u1' });

      expect(id).toMatch(/^mem_\d+_/);
      expect(mockCollection.add).toHaveBeenCalledTimes(1);
      const record = mockCollection.add.mock.calls[0][0];
      expect(record.document).toBe('Hello world');
      expect(record.metadata.userId).toBe('u1');
      expect(record.metadata.type).toBe('conversations');
      expect(record.metadata.createdAt).toBeDefined();
    });

    test('serializes object content to JSON string', async () => {
      const obj = { key: 'value', nested: { a: 1 } };
      await memory.addMemory('facts', obj);

      const record = mockCollection.add.mock.calls[0][0];
      expect(record.document).toBe(JSON.stringify(obj));
    });

    test('returns null for unknown collection type', async () => {
      const result = await memory.addMemory('nonexistent', 'content');

      expect(result).toBeNull();
      expect(mockCollection.add).not.toHaveBeenCalled();
    });

    test('auto-initializes when not initialized', async () => {
      const fresh = new SemanticMemorySystem();
      const id = await fresh.addMemory('facts', 'test');

      expect(id).toBeDefined();
      await fresh.destroy();
    });

    test('returns null when collection add fails', async () => {
      mockCollection.add.mockRejectedValueOnce(new Error('Storage full'));

      const result = await memory.addMemory('facts', 'content');

      expect(result).toBeNull();
    });

    test('includes custom metadata along with defaults', async () => {
      await memory.addMemory('events', 'event', { importance: 'high', tags: ['urgent'] });

      const record = mockCollection.add.mock.calls[0][0];
      expect(record.metadata.importance).toBe('high');
      expect(record.metadata.tags).toEqual(['urgent']);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    test('returns filtered results based on similarity threshold', async () => {
      const results = await memory.search('facts', 'query');

      expect(results).toHaveLength(2);
      expect(results[0].content).toBe('doc1');
      expect(results[0].distance).toBe(0.1);
      expect(results[0].id).toBe('id1');
      expect(results[1].content).toBe('doc2');
    });

    test('filters out results below similarity threshold', async () => {
      mockCollection.query.mockResolvedValueOnce({
        documents: [['doc1', 'doc2']],
        distances: [[0.1, 0.5]],
        ids: [['id1', 'id2']],
        metadatas: [[{}, {}]]
      });

      const results = await memory.search('facts', 'query', { similarityThreshold: 0.7 });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('id1');
    });

    test('returns empty array for unknown collection type', async () => {
      const results = await memory.search('nonexistent', 'query');

      expect(results).toEqual([]);
    });

    test('returns empty array when no documents match', async () => {
      mockCollection.query.mockResolvedValueOnce({
        documents: [[]],
        distances: [[]],
        ids: [[]],
        metadatas: [[]]
      });

      const results = await memory.search('facts', 'query');

      expect(results).toEqual([]);
    });

    test('returns empty array when query fails', async () => {
      mockCollection.query.mockRejectedValueOnce(new Error('Query timeout'));

      const results = await memory.search('facts', 'query');

      expect(results).toEqual([]);
    });

    test('uses custom maxResults from options', async () => {
      await memory.search('facts', 'query', { maxResults: 3 });

      expect(mockCollection.query).toHaveBeenCalledWith({
        queryTexts: ['query'],
        nResults: 3
      });
    });

    test('handles missing distances gracefully', async () => {
      mockCollection.query.mockResolvedValueOnce({
        documents: [['doc1']],
        ids: [['id1']],
        metadatas: [[{}]]
      });

      const results = await memory.search('facts', 'query');

      expect(results).toHaveLength(1);
      expect(results[0].distance).toBe(0);
    });
  });

  describe('searchAll', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    test('searches across all collections and returns sorted results', async () => {
      mockCollection.query.mockResolvedValue({
        documents: [['docA']],
        distances: [[0.1]],
        ids: [['idA']],
        metadatas: [[{}]]
      });

      const results = await memory.searchAll('query');

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]).toHaveProperty('collection');
    });

    test('returns empty array when all searches fail', async () => {
      mockCollection.query.mockRejectedValue(new Error('fail'));

      const results = await memory.searchAll('query');

      expect(results).toEqual([]);
    });

    test('respects maxResults limit on results', async () => {
      mockCollection.query.mockResolvedValue({
        documents: [['doc1', 'doc2', 'doc3']],
        distances: [[0.1, 0.2, 0.3]],
        ids: [['id1', 'id2', 'id3']],
        metadatas: [[{}, {}, {}]]
      });

      const results = await memory.searchAll('query', { maxResults: 2 });

      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('deleteMemory', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    test('deletes memory by type and id', async () => {
      const result = await memory.deleteMemory('facts', 'mem_123');

      expect(result).toBe(true);
      expect(mockCollection.delete).toHaveBeenCalledWith({ ids: ['mem_123'] });
    });

    test('returns false for unknown collection type', async () => {
      const result = await memory.deleteMemory('nonexistent', 'mem_123');

      expect(result).toBe(false);
    });

    test('returns false when delete fails', async () => {
      mockCollection.delete.mockRejectedValueOnce(new Error('Not found'));

      const result = await memory.deleteMemory('facts', 'mem_123');

      expect(result).toBe(false);
    });
  });

  describe('getContext', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    test('builds context string from search results', async () => {
      mockCollection.query.mockResolvedValue({
        documents: [['relevant memory content']],
        distances: [[0.1]],
        ids: [['id1']],
        metadatas: [[{}]]
      });

      const context = await memory.getContext('query');

      expect(context).toContain('relevant memory content');
    });

    test('returns empty string when no results', async () => {
      mockCollection.query.mockResolvedValue({
        documents: [[]],
        distances: [[]],
        ids: [[]],
        metadatas: [[]]
      });

      const context = await memory.getContext('query');

      expect(context).toBe('');
    });

    test('respects maxTokens limit', async () => {
      mockCollection.query.mockResolvedValue({
        documents: [['x'.repeat(4000)]],
        distances: [[0.1]],
        ids: [['id1']],
        metadatas: [[{}]]
      });

      const context = await memory.getContext('query', { maxTokens: 100 });

      expect(context.length).toBeLessThan(4000);
    });
  });

  describe('getConversationContext', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    test('returns formatted conversation history', async () => {
      const result = await memory.getConversationContext('u1');

      expect(result).toContain('conv1');
      expect(result).toContain('conv2');
    });

    test('returns empty string when collection.get returns no documents', async () => {
      mockCollection.get.mockResolvedValueOnce({ documents: null });
      const result = await memory.getConversationContext('u1');
      expect(result).toBe('');
    });

    test('returns empty string when get fails', async () => {
      mockCollection.get.mockRejectedValueOnce(new Error('Fail'));

      const result = await memory.getConversationContext('u1');

      expect(result).toBe('');
    });

    test('filters and sorts conversations by userId and createdAt', async () => {
      mockCollection.get.mockResolvedValueOnce({
        documents: ['young', 'old'],
        metadatas: [
          { userId: 'u1', createdAt: 200 },
          { userId: 'u2', createdAt: 100 },
          { userId: 'u1', createdAt: 100 }
        ]
      });

      const result = await memory.getConversationContext('u1');

      expect(result).toContain('young');
    });
  });

  describe('convenience methods', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    test('recordConversation delegates to addMemory', async () => {
      const spy = jest.spyOn(memory, 'addMemory');
      const id = await memory.recordConversation('u1', 'user', 'Hello');

      expect(spy).toHaveBeenCalledWith('conversations', 'Hello', { userId: 'u1', role: 'user' });
      expect(id).toMatch(/^mem_\d+_/);
      spy.mockRestore();
    });

    test('getPersonalityContext delegates to search', async () => {
      const spy = jest.spyOn(memory, 'search');
      const results = await memory.getPersonalityContext('u1');

      expect(spy).toHaveBeenCalledWith('personality', 'user u1 personality preferences', { maxResults: 5 });
      expect(Array.isArray(results)).toBe(true);
      spy.mockRestore();
    });

    test('learnPreference delegates to addMemory', async () => {
      const spy = jest.spyOn(memory, 'addMemory');
      const id = await memory.learnPreference('u1', 'theme', 'dark');

      expect(spy).toHaveBeenCalledWith('preferences', expect.stringContaining('dark'), { userId: 'u1', preferenceType: 'theme', value: 'dark' });
      expect(id).toMatch(/^mem_\d+_/);
      spy.mockRestore();
    });

    test('getUserFacts delegates to search', async () => {
      const spy = jest.spyOn(memory, 'search');
      const results = await memory.getUserFacts('u1');

      expect(spy).toHaveBeenCalledWith('facts', expect.stringContaining('u1'), { maxResults: 20 });
      expect(Array.isArray(results)).toBe(true);
      spy.mockRestore();
    });

    test('addFact delegates to addMemory', async () => {
      const spy = jest.spyOn(memory, 'addMemory');
      const id = await memory.addFact('u1', 'likes pizza', 0.9);

      expect(spy).toHaveBeenCalledWith('facts', expect.stringContaining('pizza'), { userId: 'u1', confidence: 0.9 });
      expect(id).toMatch(/^mem_\d+_/);
      spy.mockRestore();
    });

    test('recordEvent delegates to addMemory', async () => {
      const spy = jest.spyOn(memory, 'addMemory');
      const id = await memory.recordEvent('u1', 'login', 'User logged in', { ip: '127.0.0.1' });

      expect(spy).toHaveBeenCalledWith('events', expect.stringContaining('login'), { userId: 'u1', eventType: 'login', ip: '127.0.0.1' });
      expect(id).toMatch(/^mem_\d+_/);
      spy.mockRestore();
    });
  });

  describe('consolidateMemory', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    test('generates summary and stores in personality collection', async () => {
      const spy = jest.spyOn(memory, 'addMemory');
      const summary = await memory.consolidateMemory('u1');

      expect(summary).toBeTruthy();
      expect(spy).toHaveBeenCalledWith('personality', summary, expect.objectContaining({ userId: 'u1', type: 'consolidated' }));
      spy.mockRestore();
    });

    test('returns empty string when no conversations or facts', async () => {
      mockCollection.get.mockResolvedValueOnce({ documents: null });
      mockCollection.query.mockResolvedValue({
        documents: [[]],
        distances: [[]],
        ids: [[]],
        metadatas: [[]]
      });

      const summary = await memory.consolidateMemory('u1');

      expect(summary).toBe('');
    });
  });

  describe('_generateSummary', () => {
    test('returns empty string when both inputs are falsy', () => {
      expect(memory._generateSummary(null, null)).toBe('');
      expect(memory._generateSummary('', [])).toBe('');
    });

    test('includes conversations when present', () => {
      const result = memory._generateSummary('hello world', null);
      expect(result).toContain('Recent conversations');
      expect(result).toContain('hello world');
    });

    test('includes facts when present', () => {
      const facts = [{ content: 'likes cats' }, { content: 'hates rain' }];
      const result = memory._generateSummary(null, facts);
      expect(result).toContain('Known facts');
      expect(result).toContain('likes cats');
      expect(result).toContain('hates rain');
    });

    test('truncates conversations to 500 chars', () => {
      const long = 'x'.repeat(1000);
      const result = memory._generateSummary(long, null);
      expect(result.length).toBeLessThan(600);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    test('returns count for each collection', async () => {
      const stats = await memory.getStats();

      expect(stats.conversations).toBe(5);
      expect(stats.facts).toBe(5);
      expect(stats.preferences).toBe(5);
      expect(stats.personality).toBe(5);
      expect(stats.events).toBe(5);
    });

    test('reports error for failing collections', async () => {
      mockCollection.count.mockRejectedValue(new Error('fail'));

      const stats = await memory.getStats();

      expect(stats.conversations).toBe('error');
    });
  });

  describe('clear', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    test('clears single collection by type', async () => {
      await memory.clear('facts');

      expect(mockCollection.delete).toHaveBeenCalledWith({ where: {} });
      expect(mockCollection.delete).toHaveBeenCalledTimes(1);
    });

    test('clears all collections when type is null', async () => {
      await memory.clear();

      expect(mockCollection.delete).toHaveBeenCalledWith({ where: {} });
      expect(mockCollection.delete).toHaveBeenCalledTimes(5);
    });

    test('does nothing for unknown type', async () => {
      mockCollection.delete.mockClear();

      await memory.clear('nonexistent');

      expect(mockCollection.delete).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    test('resets state', async () => {
      await memory.initialize();

      await memory.destroy();

      expect(memory.collections.size).toBe(0);
      expect(memory.client).toBeNull();
      expect(memory.isInitialized).toBe(false);
    });
  });
});

describe('RAGContextBuilder', () => {
  let memory;
  let builder;

  beforeEach(async () => {
    memory = new SemanticMemorySystem({ persistDirectory: './test-db' });
    await memory.initialize();
    builder = new RAGContextBuilder(memory);
  });

  describe('constructor', () => {
    test('stores reference to semantic memory', () => {
      expect(builder.memory).toBe(memory);
    });

    test('sets default maxContextLength', () => {
      expect(builder.maxContextLength).toBe(4000);
    });

    test('initializes empty systemPrompt', () => {
      expect(builder.systemPrompt).toBe('');
    });
  });

  describe('buildContext', () => {
    test('returns formatted context object', async () => {
      const context = await builder.buildContext('u1', 'current query');

      expect(context).toContain('[相关记忆]');
      expect(context).toContain('[对话历史]');
    });

    test('does not include personality or facts by default', async () => {
      const context = await builder.buildContext('u1', 'query');

      expect(context).not.toContain('[人格特征]');
      expect(context).not.toContain('[已知事实]');
    });
  });

  describe('_formatContext', () => {
    test('includes semantic block by default', () => {
      const context = { semantic: 'semantic data', conversations: '', personality: [], facts: [] };
      const result = builder._formatContext(context);

      expect(result).toContain('[相关记忆]');
      expect(result).toContain('semantic data');
    });

    test('includes conversation block when present', () => {
      const context = { semantic: '', conversations: 'history', personality: [], facts: [] };
      const result = builder._formatContext(context);

      expect(result).toContain('[对话历史]');
    });

    test('includes personality block when flag set', () => {
      const context = { semantic: '', conversations: '', personality: [{ content: 'friendly' }], facts: [] };
      const result = builder._formatContext(context, { includePersonality: true });

      expect(result).toContain('[人格特征]');
      expect(result).toContain('friendly');
    });

    test('includes facts block when flag set', () => {
      const context = { semantic: '', conversations: '', personality: [], facts: [{ content: 'fact1' }] };
      const result = builder._formatContext(context, { includeFacts: true });

      expect(result).toContain('[已知事实]');
      expect(result).toContain('fact1');
    });

    test('can exclude semantic block', () => {
      const context = { semantic: 'data', conversations: '', personality: [], facts: [] };
      const result = builder._formatContext(context, { includeSemantic: false });

      expect(result).not.toContain('[相关记忆]');
    });

    test('can exclude conversation block', () => {
      const context = { semantic: '', conversations: 'history', personality: [], facts: [] };
      const result = builder._formatContext(context, { includeConversations: false });

      expect(result).not.toContain('[对话历史]');
    });

    test('truncates when exceeding maxContextLength', () => {
      builder.maxContextLength = 10;
      const context = { semantic: 'this is a very long string that should be truncated', conversations: '', personality: [], facts: [] };
      const result = builder._formatContext(context);

      expect(result).toContain('[内容已截断]');
      expect(result.length).toBeLessThan(100);
    });

    test('returns empty string when all context is empty', () => {
      const context = { semantic: '', conversations: '', personality: [], facts: [] };
      const result = builder._formatContext(context);

      expect(result).toBe('');
    });
  });

  describe('setSystemPrompt', () => {
    test('updates system prompt', () => {
      builder.setSystemPrompt('You are a helpful assistant.');
      expect(builder.systemPrompt).toBe('You are a helpful assistant.');
    });
  });

  describe('getSystemPrompt', () => {
    test('returns prompt without context when context falsy', () => {
      builder.setSystemPrompt('Base prompt');
      const result = builder.getSystemPrompt();

      expect(result).toBe('Base prompt\n\n请根据以上上下文信息回答用户的问题。');
    });

    test('includes context when provided', () => {
      builder.setSystemPrompt('Base prompt');
      const result = builder.getSystemPrompt('some context');

      expect(result).toContain('[上下文信息]');
      expect(result).toContain('some context');
    });
  });
});

describe('MemoryConsolidator', () => {
  let memory;
  let consolidator;

  beforeEach(async () => {
    memory = new SemanticMemorySystem({ persistDirectory: './test-db' });
    await memory.initialize();
    consolidator = new MemoryConsolidator(memory);
  });

  describe('constructor', () => {
    test('stores reference to semantic memory', () => {
      expect(consolidator.memory).toBe(memory);
    });

    test('sets consolidation interval to 24 hours', () => {
      expect(consolidator.consolidationInterval).toBe(24 * 60 * 60 * 1000);
    });

    test('sets lastConsolidation to current time', () => {
      expect(consolidator.lastConsolidation).toBeCloseTo(Date.now(), -2);
    });
  });

  describe('shouldConsolidate', () => {
    test('returns false when within interval', async () => {
      const result = await consolidator.shouldConsolidate();
      expect(result).toBe(false);
    });

    test('returns true when past interval', async () => {
      consolidator.lastConsolidation = Date.now() - 25 * 60 * 60 * 1000;
      const result = await consolidator.shouldConsolidate();
      expect(result).toBe(true);
    });
  });

  describe('consolidateUser', () => {
    test('returns null when not enough memories', async () => {
      memory.searchAll = jest.fn().mockResolvedValue(Array.from({ length: 5 }, (_, i) => ({
        content: `memory ${i}`,
        collection: 'conversations'
      })));

      const result = await consolidator.consolidateUser('u1');

      expect(result).toBeNull();
    });

    test('consolidates when enough memories exist', async () => {
      const mockMemories = Array.from({ length: 15 }, (_, i) => ({
        content: `memory ${i} about 喜欢 coding with friends`,
        collection: i % 2 === 0 ? 'conversations' : 'preferences'
      }));
      memory.searchAll = jest.fn().mockResolvedValue(mockMemories);
      memory.addMemory = jest.fn().mockResolvedValue('mem_consolidated');

      const result = await consolidator.consolidateUser('u1');

      expect(result).toBeTruthy();
      expect(memory.addMemory).toHaveBeenCalledWith(
        'personality',
        result,
        expect.objectContaining({
          userId: 'u1',
          type: 'consolidated',
          sourceCount: 15
        })
      );
    });
  });

  describe('_processMemories', () => {
    test('returns null when no topics, preferences, or patterns extracted', () => {
      const memories = [{ content: 'random stuff', collection: 'facts' }];
      const result = consolidator._processMemories(memories);
      expect(result).toBeNull();
    });

    test('returns formatted string with extracted information', () => {
      const memories = [
        { content: '我喜欢 coding', collection: 'conversations' },
        { content: 'User prefers color: blue.', collection: 'preferences' }
      ];
      const result = consolidator._processMemories(memories);
      expect(result).toContain('关注的话题');
      expect(result).toContain('已知偏好');
    });
  });

  describe('_extractTopics', () => {
    test('extracts topics from memories containing keywords', () => {
      const memories = [
        { content: '用户谈论 AI technology' },
        { content: '他喜欢 programming' },
        { content: 'irrelevant content' }
      ];
      const topics = consolidator._extractTopics(memories);
      expect(topics.length).toBeGreaterThanOrEqual(1);
    });

    test('deduplicates and limits to 5 topics', () => {
      const memories = Array.from({ length: 10 }, (_, i) => ({
        content: `谈论 topic${i % 3}`
      }));
      const topics = consolidator._extractTopics(memories);
      expect(topics.length).toBeLessThanOrEqual(5);
      expect(new Set(topics).size).toBe(topics.length);
    });

    test('returns empty array when no keywords match', () => {
      const memories = [{ content: 'nothing matches here' }];
      const topics = consolidator._extractTopics(memories);
      expect(topics).toEqual([]);
    });
  });

  describe('_extractPreferences', () => {
    test('extracts preferences from preference collection', () => {
      const memories = [
        { content: 'prefers dark mode', collection: 'preferences' },
        { content: 'likes cats', collection: 'facts' }
      ];
      const prefs = consolidator._extractPreferences(memories);
      expect(prefs).toHaveLength(1);
      expect(prefs[0]).toBe('prefers dark mode');
    });

    test('limits to 5 preferences', () => {
      const memories = Array.from({ length: 10 }, (_, i) => ({
        content: `pref ${i}`,
        collection: 'preferences'
      }));
      const prefs = consolidator._extractPreferences(memories);
      expect(prefs).toHaveLength(5);
    });

    test('returns empty array when no preferences', () => {
      const memories = [{ content: 'fact', collection: 'facts' }];
      const prefs = consolidator._extractPreferences(memories);
      expect(prefs).toEqual([]);
    });
  });

  describe('_extractPatterns', () => {
    test('identifies active user when more than 20 memories', () => {
      const memories = Array.from({ length: 25 }, (_, i) => ({
        content: `mem ${i}`,
        collection: 'conversations'
      }));
      const patterns = consolidator._extractPatterns(memories);
      expect(patterns).toContain('活跃用户');
    });

    test('identifies diverse interests with 4+ collections', () => {
      const memories = [
        { content: 'a', collection: 'col1' },
        { content: 'b', collection: 'col2' },
        { content: 'c', collection: 'col3' },
        { content: 'd', collection: 'col4' }
      ];
      const patterns = consolidator._extractPatterns(memories);
      expect(patterns).toContain('多样化兴趣');
    });

    test('returns empty for sparse memories', () => {
      const memories = [
        { content: 'a', collection: 'col1' },
        { content: 'b', collection: 'col1' }
      ];
      const patterns = consolidator._extractPatterns(memories);
      expect(patterns).toEqual([]);
    });
  });

  describe('_processMemories with patterns only', () => {
    test('returns formatted string when only patterns are extracted', () => {
      const memories = Array.from({ length: 25 }, (_, _i) => ({
        content: 'random stuff',
        collection: 'conversations'
      }));
      const result = consolidator._processMemories(memories);
      expect(result).toContain('交互模式');
      expect(result).toContain('活跃用户');
    });
  });
});

describe('SemanticMemorySystem - coverage edge cases', () => {
  const mockCollection = globalThis.__mockCollection;

  describe('auto-initialize paths', () => {
    test('search auto-initializes when not initialized', async () => {
      const spy = jest.spyOn(SemanticMemorySystem.prototype, 'initialize');
      const fresh = new SemanticMemorySystem();
      const results = await fresh.search('facts', 'test');
      expect(spy).toHaveBeenCalled();
      expect(Array.isArray(results)).toBe(true);
      spy.mockRestore();
      await fresh.destroy();
    });

    test('searchAll auto-initializes when not initialized', async () => {
      const spy = jest.spyOn(SemanticMemorySystem.prototype, 'initialize');
      const fresh = new SemanticMemorySystem();
      const results = await fresh.searchAll('test');
      expect(spy).toHaveBeenCalled();
      expect(Array.isArray(results)).toBe(true);
      spy.mockRestore();
      await fresh.destroy();
    });

    test('deleteMemory auto-initializes when not initialized', async () => {
      const spy = jest.spyOn(SemanticMemorySystem.prototype, 'initialize');
      const fresh = new SemanticMemorySystem();
      const result = await fresh.deleteMemory('facts', 'test');
      expect(spy).toHaveBeenCalled();
      expect(result).toBe(true);
      spy.mockRestore();
      await fresh.destroy();
    });

    test('getConversationContext auto-initializes when not initialized', async () => {
      const spy = jest.spyOn(SemanticMemorySystem.prototype, 'initialize');
      const fresh = new SemanticMemorySystem();
      const _result = await fresh.getConversationContext('u1');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
      await fresh.destroy();
    });

    test('clear auto-initializes when not initialized', async () => {
      const spy = jest.spyOn(SemanticMemorySystem.prototype, 'initialize');
      const fresh = new SemanticMemorySystem();
      await fresh.clear('facts');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
      await fresh.destroy();
    });
  });

  describe('getConversationContext edge cases', () => {
    let memory;

    beforeEach(async () => {
      jest.clearAllMocks();
      memory = new SemanticMemorySystem({ persistDirectory: './test-db' });
      mockCollection.add.mockReset().mockResolvedValue(undefined);
      mockCollection.query.mockReset().mockResolvedValue({
        documents: [['doc1']],
        distances: [[0.1]],
        ids: [['id1']],
        metadatas: [[{}]]
      });
      mockCollection.delete.mockReset().mockResolvedValue(undefined);
      mockCollection.get.mockResolvedValue({
        documents: ['conv1'],
        metadatas: [{ userId: 'u1', createdAt: 100 }]
      });
      mockCollection.count.mockReset().mockResolvedValue(5);
      await memory.initialize();
    });

    afterEach(async () => {
      await memory.destroy();
    });

    test('returns empty string when conversations collection missing', async () => {
      const originalGet = memory.collections.get.bind(memory.collections);
      jest.spyOn(memory.collections, 'get').mockImplementation((key) => {
        if (key === 'conversations') return undefined;
        return originalGet(key);
      });
      const result = await memory.getConversationContext('u1');
      expect(result).toBe('');
    });

    test('handles missing createdAt in metadata', async () => {
      mockCollection.get.mockResolvedValueOnce({
        documents: ['no-date', 'dated'],
        metadatas: [
          { userId: 'u1' },
          { userId: 'u1', createdAt: 300 }
        ]
      });
      const result = await memory.getConversationContext('u1');
      expect(result).toContain('dated');
    });

    test('handles createdAt equal to 0 in sort', async () => {
      mockCollection.get.mockResolvedValueOnce({
        documents: Array.from({ length: 11 }, (_, i) => `doc${i}`),
        metadatas: Array.from({ length: 11 }, (_, i) => ({
          userId: 'u1',
          createdAt: i * 10
        }))
      });
      const result = await memory.getConversationContext('u1');
      expect(result).toContain('doc1');
      expect(result).toContain('doc10');
    });
  });

  describe('default argument coverage', () => {
    let memory;

    beforeEach(async () => {
      jest.clearAllMocks();
      memory = new SemanticMemorySystem({ persistDirectory: './test-db' });
      mockCollection.add.mockReset().mockResolvedValue(undefined);
      mockCollection.query.mockReset().mockResolvedValue({
        documents: [['doc1']],
        distances: [[0.1]],
        ids: [['id1']],
        metadatas: [[{}]]
      });
      mockCollection.delete.mockReset().mockResolvedValue(undefined);
      mockCollection.get.mockResolvedValue({
        documents: ['conv1'],
        metadatas: [{ userId: 'u1', createdAt: 100 }]
      });
      mockCollection.count.mockReset().mockResolvedValue(5);
      await memory.initialize();
    });

    afterEach(async () => {
      await memory.destroy();
    });

    test('addFact uses default confidence of 1.0', async () => {
      const spy = jest.spyOn(memory, 'addMemory');
      await memory.addFact('u1', 'likes pizza');
      expect(spy).toHaveBeenCalledWith('facts', expect.any(String), { userId: 'u1', confidence: 1.0 });
      spy.mockRestore();
    });

    test('recordEvent uses default empty metadata', async () => {
      const spy = jest.spyOn(memory, 'addMemory');
      await memory.recordEvent('u1', 'login', 'User logged in');
      expect(spy).toHaveBeenCalledWith('events', expect.any(String), { userId: 'u1', eventType: 'login' });
      spy.mockRestore();
    });
  });

  describe('search edge cases - documents null', () => {
    let memory;

    beforeEach(async () => {
      jest.clearAllMocks();
      memory = new SemanticMemorySystem({ persistDirectory: './test-db' });
      mockCollection.add.mockReset().mockResolvedValue(undefined);
      mockCollection.query.mockReset().mockResolvedValue({
        documents: [['doc1']],
        distances: [[0.1]],
        ids: [['id1']],
        metadatas: [[{}]]
      });
      mockCollection.delete.mockReset().mockResolvedValue(undefined);
      mockCollection.get.mockResolvedValue({
        documents: ['conv1'],
        metadatas: [{ userId: 'u1', createdAt: 100 }]
      });
      mockCollection.count.mockReset().mockResolvedValue(5);
      await memory.initialize();
    });

    afterEach(async () => {
      await memory.destroy();
    });

    test('returns empty array when results.documents is null', async () => {
      mockCollection.query.mockResolvedValueOnce({ documents: null });
      const results = await memory.search('facts', 'query');
      expect(results).toEqual([]);
    });

    test('returns empty array when results.documents[0] is null', async () => {
      mockCollection.query.mockResolvedValueOnce({ documents: [null] });
      const results = await memory.search('facts', 'query');
      expect(results).toEqual([]);
    });
  });

  describe('getConversationContext - metadatas null', () => {
    let memory;

    beforeEach(async () => {
      jest.clearAllMocks();
      memory = new SemanticMemorySystem({ persistDirectory: './test-db' });
      mockCollection.add.mockReset().mockResolvedValue(undefined);
      mockCollection.query.mockReset().mockResolvedValue({
        documents: [['doc1']],
        distances: [[0.1]],
        ids: [['id1']],
        metadatas: [[{}]]
      });
      mockCollection.delete.mockReset().mockResolvedValue(undefined);
      mockCollection.get.mockResolvedValue({
        documents: ['conv1'],
        metadatas: [{ userId: 'u1', createdAt: 100 }]
      });
      mockCollection.count.mockReset().mockResolvedValue(5);
      await memory.initialize();
    });

    afterEach(async () => {
      await memory.destroy();
    });

    test('handles null metadatas in getConversationContext', async () => {
      mockCollection.get.mockResolvedValueOnce({
        documents: ['msg1', 'msg2'],
        metadatas: null
      });
      const result = await memory.getConversationContext('u1');
      expect(result).toBe('');
    });
  });

  describe('MemoryConsolidator edge cases', () => {
    let memory;
    let consolidator;

    beforeEach(async () => {
      jest.clearAllMocks();
      memory = new SemanticMemorySystem({ persistDirectory: './test-db' });
      await memory.initialize();
      consolidator = new MemoryConsolidator(memory);
    });

    test('consolidateUser returns null when _processMemories returns null with 10+ memories', async () => {
      const memories = Array.from({ length: 10 }, (_, _i) => ({
        content: 'generic content without keywords',
        collection: 'unknown_collection'
      }));
      memory.searchAll = jest.fn().mockResolvedValue(memories);
      const result = await consolidator.consolidateUser('u1');
      expect(result).toBeNull();
    });

    test('_extractTopics handles keyword at end of content', () => {
      const memories = [{ content: '他们谈论。' }];
      const topics = consolidator._extractTopics(memories);
      expect(topics).toEqual([]);
    });
  });
});
