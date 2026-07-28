jest.mock('chromadb', () => ({
  ChromaClient: jest.fn().mockImplementation(() => { throw new Error('ChromaDB not available'); })
}));

const { SemanticMemory } = require('../../src/memory/SemanticMemory');

describe('SemanticMemory (fallback mode)', () => {
  let mem;

  beforeEach(async () => {
    mem = new SemanticMemory({ persistDirectory: '/tmp/test-chroma', collectionName: 'test' });
    await mem.initialize();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initialize', () => {
    test('falls back to memory store when ChromaDB fails', () => {
      expect(mem.initialized).toBe(true);
      expect(mem.memoryStore).toBeInstanceOf(Map);
      expect(mem.collection).toBeNull();
    });

    test('returns false in fallback mode', () => {
      const m = new SemanticMemory();
      const result = m.initialized;
      expect(result).toBe(false);
    });
  });

  describe('add', () => {
    test('stores text in memory store', async () => {
      const id = await mem.add('hello world', { tag: 'test' });
      expect(id).toMatch(/^smem_\d+_/);
      expect(mem.memoryStore.size).toBe(1);
      const entry = mem.memoryStore.get(id);
      expect(entry.text).toBe('hello world');
      expect(entry.metadata.tag).toBe('test');
      expect(entry.metadata.createdAt).toBeDefined();
    });

    test('generates unique ids', async () => {
      const id1 = await mem.add('a');
      const id2 = await mem.add('b');
      expect(id1).not.toBe(id2);
    });
  });

  describe('search', () => {
    test('returns all items up to limit', async () => {
      await mem.add('item1');
      await mem.add('item2');
      await mem.add('item3');
      const results = await mem.search('', { limit: 2 });
      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('text');
    });

    test('returns empty array when no items', async () => {
      const results = await mem.search('anything');
      expect(results).toEqual([]);
    });
  });

  describe('addBatch', () => {
    test('adds multiple string items', async () => {
      const ids = await mem.addBatch(['a', 'b', 'c']);
      expect(ids).toHaveLength(3);
      expect(mem.memoryStore.size).toBe(3);
    });

    test('adds object items with text and metadata', async () => {
      const ids = await mem.addBatch([
        { text: 'hello', metadata: { tag: 'greeting' } },
        { text: 'bye', metadata: { tag: 'farewell' } }
      ]);
      expect(ids).toHaveLength(2);
      const entry = mem.memoryStore.get(ids[0]);
      expect(entry.text).toBe('hello');
      expect(entry.metadata.tag).toBe('greeting');
    });

    test('handles mixed string and object items', async () => {
      const ids = await mem.addBatch(['plain', { text: 'structured', metadata: {} }]);
      expect(ids).toHaveLength(2);
    });
  });

  describe('delete', () => {
    test('removes item from memory store', async () => {
      const id = await mem.add('to delete');
      expect(mem.memoryStore.has(id)).toBe(true);
      await mem.delete(id);
      expect(mem.memoryStore.has(id)).toBe(false);
    });

    test('handles deleting non-existent id', async () => {
      await expect(mem.delete('nonexistent')).resolves.toBe(true);
    });
  });

  describe('count', () => {
    test('returns 0 for empty store', async () => {
      expect(await mem.count()).toBe(0);
    });

    test('returns correct count', async () => {
      await mem.add('a');
      await mem.add('b');
      expect(await mem.count()).toBe(2);
    });
  });

  describe('generateId', () => {
    test('generates unique ids with smem prefix', () => {
      const id1 = mem.generateId();
      const id2 = mem.generateId();
      expect(id1).toMatch(/^smem_\d+_\w+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('update', () => {
    test('returns false when no collection', async () => {
      expect(await mem.update('id', 'text')).toBe(false);
    });
  });

  describe('close', () => {
    test('sets initialized to false', async () => {
      expect(mem.initialized).toBe(true);
      await mem.close();
      expect(mem.initialized).toBe(false);
    });
  });

  describe('searchByTag', () => {
    test('delegates to search with filter', async () => {
      await mem.add('tagged', { tag: 'test' });
      const results = await mem.searchByTag('test');
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
