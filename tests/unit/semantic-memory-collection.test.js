jest.mock('chromadb', () => {
  const makeCollection = () => ({
    add: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue({
      ids: [['id1', 'id2']],
      documents: [['doc1', 'doc2']],
      metadatas: [[{ createdAt: 100 }, { createdAt: 200 }]],
      distances: [[0.1, 0.3]]
    }),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(7)
  });
  const ChromaClient = jest.fn().mockImplementation(() => {
    const collection = makeCollection();
    return {
      collection,
      getOrCreateCollection: jest.fn().mockResolvedValue(collection),
      close: jest.fn().mockResolvedValue(undefined)
    };
  });
  return { ChromaClient };
});

const { SemanticMemory } = require('../../src/memory/SemanticMemory');

describe('SemanticMemory (collection mode)', () => {
  let coll;
  let mem;

  beforeEach(async () => {
    jest.clearAllMocks();
    mem = new SemanticMemory({ persistDirectory: '/tmp/ok', collectionName: 'test' });
    await mem.initialize();
    coll = mem.client.collection;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initialize', () => {
    test('creates client and collection successfully', () => {
      expect(mem.collection).toBe(coll);
      expect(mem.initialized).toBe(true);
    });
  });

  describe('add (collection)', () => {
    test('adds document to collection and returns id', async () => {
      const id = await mem.add('hello', { tag: 'greet' });
      expect(id).toMatch(/^smem_/);
      expect(coll.add).toHaveBeenCalledWith({
        ids: [id],
        documents: ['hello'],
        metadatas: [{ tag: 'greet', createdAt: expect.any(Number) }]
      });
    });
  });

  describe('search (collection)', () => {
    test('returns mapped results with id, text, metadata, distance', async () => {
      const results = await mem.search('query');
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: 'id1',
        text: 'doc1',
        metadata: { createdAt: 100 },
        distance: 0.1
      });
      expect(results[1].id).toBe('id2');
      expect(results[1].distance).toBe(0.3);
    });

    test('passes where filter when provided', async () => {
      await mem.search('query', { filter: { tag: 'x' }, whereDocument: { $contains: 'y' } });
      expect(coll.query).toHaveBeenCalledWith({
        queryTexts: ['query'],
        nResults: 10,
        where: { tag: 'x' },
        whereDocument: { $contains: 'y' }
      });
    });

    test('omits where when filter is empty', async () => {
      await mem.search('query', {});
      expect(coll.query).toHaveBeenCalledWith({
        queryTexts: ['query'],
        nResults: 10,
        where: undefined,
        whereDocument: null
      });
    });

    test('handles missing distances gracefully', async () => {
      coll.query.mockResolvedValueOnce({
        ids: [['id9']],
        documents: [['doc9']],
        metadatas: [[{}]]
      });
      const results = await mem.search('query');
      expect(results[0].distance).toBeUndefined();
    });
  });

  describe('update (collection)', () => {
    test('updates collection and returns true', async () => {
      const result = await mem.update('id1', 'new text', { tag: 'u' });
      expect(result).toBe(true);
      expect(coll.update).toHaveBeenCalledWith({
        ids: ['id1'],
        documents: ['new text'],
        metadatas: [{ tag: 'u' }]
      });
    });

    test('returns false when update fails', async () => {
      coll.update.mockRejectedValueOnce(new Error('fail'));
      const result = await mem.update('id1', 'x');
      expect(result).toBe(false);
    });
  });

  describe('delete (collection)', () => {
    test('deletes from collection and returns true', async () => {
      const result = await mem.delete('id1');
      expect(result).toBe(true);
      expect(coll.delete).toHaveBeenCalledWith({ ids: ['id1'] });
    });

    test('returns false when delete fails', async () => {
      coll.delete.mockRejectedValueOnce(new Error('fail'));
      const result = await mem.delete('id1');
      expect(result).toBe(false);
    });
  });

  describe('addBatch (collection)', () => {
    test('adds string and object items via collection.add', async () => {
      const ids = await mem.addBatch(['a', { text: 'b', metadata: { tag: 'x' } }]);
      expect(ids).toHaveLength(2);
      expect(coll.add).toHaveBeenCalledWith({
        ids,
        documents: ['a', 'b'],
        metadatas: [{}, { tag: 'x' }]
      });
    });
  });

  describe('count (collection)', () => {
    test('returns collection count', async () => {
      expect(await mem.count()).toBe(7);
    });

    test('returns 0 when collection count is falsy', async () => {
      coll.count.mockResolvedValueOnce(0);
      expect(await mem.count()).toBe(0);
    });
  });

  describe('close with client', () => {
    test('calls client.close and resets initialized', async () => {
      const closeSpy = jest.spyOn(mem.client, 'close');
      await mem.close();
      expect(closeSpy).toHaveBeenCalled();
      expect(mem.initialized).toBe(false);
    });
  });

  describe('auto-initialize paths', () => {
    test('add auto-initializes when not initialized', async () => {
      const fresh = new SemanticMemory();
      const id = await fresh.add('auto');
      expect(id).toMatch(/^smem_/);
    });

    test('search auto-initializes when not initialized', async () => {
      const fresh = new SemanticMemory();
      const results = await fresh.search('auto');
      expect(Array.isArray(results)).toBe(true);
    });

    test('count auto-initializes when not initialized', async () => {
      const fresh = new SemanticMemory();
      const n = await fresh.count();
      expect(typeof n).toBe('number');
    });
  });

  describe('searchByTag with collection', () => {
    test('delegates to search with tag filter', async () => {
      const results = await mem.searchByTag('tagname', 5);
      expect(results).toHaveLength(2);
      expect(coll.query).toHaveBeenCalledWith(expect.objectContaining({ nResults: 5, where: { tag: 'tagname' } }));
    });
  });
});
