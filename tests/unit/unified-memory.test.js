const { UnifiedMemory } = require('../../src/memory/index');

const mockLongTermStore = jest.fn(async () => ({ id: 'mem_1', memory: {} }));
const mockLongTermRetrieve = jest.fn(async () => [{ id: 'mem_1', memory: { content: 'lt' }, similarity: 0.8 }]);

jest.mock('../../src/memory/LongTermMemory', () => ({
  LongTermMemory: jest.fn().mockImplementation(() => ({
    store: mockLongTermStore,
    retrieve: mockLongTermRetrieve
  }))
}));

const mockSemanticSearch = jest.fn(async () => [{ id: 'mem_2', content: 'sem', similarity: 0.9 }]);
const mockSemanticAdd = jest.fn(async () => {});
const mockSemanticInitialize = jest.fn(async () => {});

jest.mock('../../src/memory/SemanticMemory', () => ({
  SemanticMemory: jest.fn().mockImplementation(() => ({
    add: mockSemanticAdd,
    search: mockSemanticSearch,
    initialize: mockSemanticInitialize
  }))
}));

const mockGraphCreateNode = jest.fn(() => {});
const mockGraphGetStats = jest.fn(() => ({}));

jest.mock('../../src/memory/GraphMemory', () => ({
  GraphMemory: jest.fn().mockImplementation(() => ({
    createNode: mockGraphCreateNode,
    getStats: mockGraphGetStats
  }))
}));

const mockSessionRecordMessage = jest.fn(() => {});
const mockSessionRecordToolCall = jest.fn(() => {});
const mockSessionGetPromptContext = jest.fn(() => 'context');
const mockSessionExtract = jest.fn(async () => 'extracted');
const mockSessionGetStats = jest.fn(() => ({ totalMessages: 1 }));
const mockSessionLoad = jest.fn(async () => {});

jest.mock('../../src/memory/SessionMemory', () => ({
  SessionMemory: jest.fn().mockImplementation(() => ({
    recordMessage: mockSessionRecordMessage,
    recordToolCall: mockSessionRecordToolCall,
    getPromptContext: mockSessionGetPromptContext,
    extract: mockSessionExtract,
    getStats: mockSessionGetStats,
    load: mockSessionLoad
  })),
  MemorySections: {}
}));

describe('UnifiedMemory', () => {
  let mem;

  beforeEach(() => {
    jest.clearAllMocks();
    mem = new UnifiedMemory();
  });

  test('constructor instantiates all four memory subsystems', () => {
    expect(mem.longTerm).toBeTruthy();
    expect(mem.semantic).toBeTruthy();
    expect(mem.graph).toBeTruthy();
    expect(mem.session).toBeTruthy();
    expect(mem.initialized).toBe(false);
  });

  test('initialize runs semantic init and session load', async () => {
    await mem.initialize();
    expect(mockSemanticInitialize).toHaveBeenCalled();
    expect(mockSessionLoad).toHaveBeenCalled();
    expect(mem.initialized).toBe(true);
  });

  test('store persists via longTerm and semantic', async () => {
    const result = await mem.store('hello', { userId: 'u1' });
    expect(mockLongTermStore).toHaveBeenCalledWith('hello', { userId: 'u1' });
    expect(mockSemanticAdd).toHaveBeenCalledWith('hello', { memoryId: { id: 'mem_1', memory: {} }, userId: 'u1' });
    expect(result).toEqual({ id: 'mem_1', memory: {} });
    expect(mockGraphCreateNode).not.toHaveBeenCalled();
  });

  test('store works with no options', async () => {
    const result = await mem.store('bare');
    expect(mockLongTermStore).toHaveBeenCalledWith('bare', {});
    expect(result).toEqual({ id: 'mem_1', memory: {} });
  });

  test('store creates graph node when entityId provided', async () => {
    await mem.store('long text about an entity', { entityId: 'ent-1', tags: ['t1'] });
    expect(mockGraphCreateNode).toHaveBeenCalledWith('ent-1', 'entity', { name: 'long text about an entity' }, ['t1']);
  });

  test('store passes tags array when tags omitted', async () => {
    await mem.store('entity without tags', { entityId: 'ent-2' });
    expect(mockGraphCreateNode).toHaveBeenCalledWith('ent-2', 'entity', { name: 'entity without tags' }, []);
  });

  test('retrieve aggregates semantic, longTerm, and session results', async () => {
    const result = await mem.retrieve('query', { limit: 5 });
    expect(mockSemanticSearch).toHaveBeenCalledWith('query', { limit: 5 });
    expect(mockLongTermRetrieve).toHaveBeenCalledWith('query', { limit: 5 });
    expect(mockSessionGetPromptContext).toHaveBeenCalled();
    expect(result.semantic).toHaveLength(1);
    expect(result.longTerm).toHaveLength(1);
    expect(result.session).toBe('context');
    expect(result.unified).toHaveLength(2);
  });

  test('retrieve works with no options', async () => {
    const result = await mem.retrieve('bare');
    expect(mockSemanticSearch).toHaveBeenCalledWith('bare', {});
    expect(mockLongTermRetrieve).toHaveBeenCalledWith('bare', {});
    expect(result.unified).toHaveLength(2);
  });

  test('mergeResults combines both sources, dedupes by id, keeps higher similarity', () => {
    const semantic = [
      { id: 'same', content: 's1', similarity: 0.5 },
      { id: 'only-sem', content: 's2', similarity: 0.3 }
    ];
    const longTerm = [
      { id: 'same', content: 's1', similarity: 0.9 },
      { id: 'only-lt', content: 's3', similarity: 0.7 }
    ];
    const merged = mem.mergeResults(semantic, longTerm);
    expect(merged).toHaveLength(3);
    const same = merged.find((m) => m.id === 'same');
    expect(same.source).toBe('semantic');
    expect(same.longTermSimilarity).toBe(0.9);
    const onlySem = merged.find((m) => m.id === 'only-sem');
    expect(onlySem.source).toBe('semantic');
    const onlyLt = merged.find((m) => m.id === 'only-lt');
    expect(onlyLt.source).toBe('longTerm');
  });

  test('mergeResults sorts by similarity descending and caps at 10', () => {
    const semantic = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, similarity: i / 10 }));
    const longTerm = Array.from({ length: 8 }, (_, i) => ({ id: `l${i}`, similarity: (i + 1) / 10 }));
    const merged = mem.mergeResults(semantic, longTerm);
    expect(merged).toHaveLength(10);
    const sims = merged.map((m) => m.similarity || 0);
    expect(sims).toEqual([...sims].sort((a, b) => b - a));
  });

  test('mergeResults handles empty sources', () => {
    expect(mem.mergeResults([], [])).toEqual([]);
  });

  test('mergeResults tolerates missing similarity values', () => {
    const merged = mem.mergeResults(
      [{ id: 'no-sim-a', content: 'x' }, { id: 'no-sim-b', content: 'y' }],
      []
    );
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.id).sort()).toEqual(['no-sim-a', 'no-sim-b']);
  });

  test('recordActivity delegates to session', () => {
    mem.recordActivity('user', 'hello', 12);
    expect(mockSessionRecordMessage).toHaveBeenCalledWith('user', 'hello', 12);
  });

  test('recordActivity defaults tokens to 0', () => {
    mem.recordActivity('assistant', 'hi');
    expect(mockSessionRecordMessage).toHaveBeenCalledWith('assistant', 'hi', 0);
  });

  test('recordToolCall delegates to session', () => {
    mem.recordToolCall('search', { q: 'x' });
    expect(mockSessionRecordToolCall).toHaveBeenCalledWith('search', { q: 'x' });
  });

  test('extractIfNeeded delegates to session', async () => {
    const result = await mem.extractIfNeeded({ session: true });
    expect(mockSessionExtract).toHaveBeenCalledWith({ session: true });
    expect(result).toBe('extracted');
  });

  test('getSessionStats delegates to session', () => {
    expect(mem.getSessionStats()).toEqual({ totalMessages: 1 });
  });

  test('getGraph returns the graph instance', () => {
    expect(mem.getGraph()).toBe(mem.graph);
  });

  test('getSession returns the session instance', () => {
    expect(mem.getSession()).toBe(mem.session);
  });
});
