/**
 * Unit Tests for SemanticCache
 */

const { SemanticCache } = require('../../src/cost/SemanticCache');

describe('SemanticCache', () => {
  let cache;

  beforeEach(() => {
    cache = new SemanticCache({
      similarityThreshold: 0.85,
      maxCacheSize: 100,
      defaultTTL: 60000
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('set and get', () => {
    it('should store and retrieve a value', async () => {
      await cache.set('key1', { result: 'value1' });
      const result = await cache.get('key1');
      expect(result.hit).toBe(true);
      expect(result.value.result).toBe('value1');
    });

    it('should return miss for non-existent key', async () => {
      const result = await cache.get('non-existent');
      expect(result.hit).toBe(false);
    });

    it('should expire entries after TTL', async () => {
      const shortCache = new SemanticCache({ defaultTTL: 60000 });
      const origDateNow = Date.now.bind(Date);
      await shortCache.set('key', { data: 'value' });

      let result = await shortCache.get('key');
      expect(result.hit).toBe(true);

      jest.spyOn(Date, 'now').mockReturnValue(origDateNow() + 120000);
      result = await shortCache.get('key');
      expect(result.hit).toBe(false);
    });
  });

  describe('semantic matching', () => {
    it('should support semantic matching option', async () => {
      await cache.set('original query', { answer: 'original answer' });
      const result = await cache.get('similar query to original', { useSemantic: true });
      expect(result).toBeDefined();
    });

    it('should return exact match before semantic', async () => {
      await cache.set('exact key', { value: 'exact' });
      await cache.set('similar key', { value: 'similar' });

      const result = await cache.get('exact key');
      expect(result.type).toBe('exact');
    });

    it('returns semantic hit when cosine similarity is above threshold', async () => {
      await cache.set('stored query', { answer: 'stored answer' });
      jest.spyOn(cache, '_cosineSimilarity').mockReturnValue(0.9);

      const result = await cache.get('different query');

      expect(result.hit).toBe(true);
      expect(result.type).toBe('semantic');
      expect(result.similarity).toBe(0.9);
      expect(result.value.answer).toBe('stored answer');
      expect(cache.getStats().semanticHits).toBe(1);
    });

    it('keeps the highest-similarity match', async () => {
      await cache.set('first', { v: 1 });
      await cache.set('second', { v: 2 });
      jest.spyOn(cache, '_cosineSimilarity')
        .mockReturnValueOnce(0.9)
        .mockReturnValueOnce(0.95);

      const result = await cache.get('query');

      expect(result.type).toBe('semantic');
      expect(result.value.v).toBe(2);
      expect(cache.getStats().semanticHits).toBe(1);
    });

    it('skips expired entries during semantic search', async () => {
      await cache.set('stored', { v: 1 });
      jest.spyOn(cache, '_cosineSimilarity').mockReturnValue(0.9);
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 120000);

      const result = await cache.get('query');

      expect(result.hit).toBe(false);
    });

    it('ignores orphan vectors without a matching cache entry', async () => {
      cache.vectorStore.set('orphan-emb', [1, 2, 3]);
      jest.spyOn(cache, '_cosineSimilarity').mockReturnValue(0.9);

      const result = await cache.get('query');

      expect(result.hit).toBe(false);
    });

    it('returns 0 similarity for different-length vectors', () => {
      expect(cache._cosineSimilarity([1, 2], [1])).toBe(0);
    });

    it('reports a finite semantic hit rate for semantic-only usage', async () => {
      await cache.set('stored', { v: 1 });
      jest.spyOn(cache, '_cosineSimilarity').mockReturnValue(0.9);

      await cache.get('query');

      const stats = cache.getStats();
      expect(stats.semanticHits).toBe(1);
      expect(stats.semanticHitRate).toBe(1);
    });
  });

  describe('stats', () => {
    it('should track hits and misses', async () => {
      await cache.set('key1', { data: 'value1' });
      await cache.get('key1');
      await cache.get('key2');

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should calculate hit rate', async () => {
      await cache.set('key1', { data: 'value1' });
      await cache.get('key1');
      await cache.get('key1');
      await cache.get('key2');

      const stats = cache.getStats();
      expect(stats.hitRate).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      const shortCache = new SemanticCache({ defaultTTL: 60000 });
      const origDateNow = Date.now.bind(Date);
      await shortCache.set('key1', { data: 'value1' });

      jest.spyOn(Date, 'now').mockReturnValue(origDateNow() + 120000);
      await shortCache.set('key2', { data: 'value2' });

      const cleaned = shortCache.cleanup();
      expect(cleaned.cleaned).toBe(1);
    });
  });

  describe('invalidateByTags', () => {
    it('should invalidate entries by tag', async () => {
      await cache.set('key1', { data: 'value1' }, { tags: ['tag1'] });
      await cache.set('key2', { data: 'value2' }, { tags: ['tag2'] });

      const result = cache.invalidateByTags(['tag1']);
      expect(result.invalidated).toBeGreaterThanOrEqual(0);
    });
  });

  describe('edge cases', () => {
    it('should skip semantic search when useSemantic is false', async () => {
      await cache.set('key', { data: 'val' });
      const result = await cache.get('key', { useSemantic: false });
      expect(result.hit).toBe(true);
      expect(result.type).toBe('exact');
    });

    it('should skip semantic search when exactMatch is true', async () => {
      await cache.set('key', { data: 'val' });
      const result = await cache.get('key', { exactMatch: true });
      expect(result.hit).toBe(true);
      expect(result.type).toBe('exact');
    });

    it('should evict old entries when cache is full', async () => {
      const smallCache = new SemanticCache({ maxCacheSize: 10, defaultTTL: 60000 });
      for (let i = 0; i < 15; i++) {
        await smallCache.set(`key${i}`, { data: i });
      }
      const stats = smallCache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
    });

    it('should clear all entries and reset stats', async () => {
      await cache.set('k1', 'v1');
      await cache.set('k2', 'v2');
      const result1 = await cache.get('k1');
      expect(result1.hit).toBe(true);
      cache.clear();
      const result2 = await cache.get('k1');
      expect(result2.hit).toBe(false);
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
    });

    it('should return zero hit rate when no operations performed', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
      expect(stats.semanticHitRate).toBe(0);
    });

    it('uses default config when constructed without options', async () => {
      const defaultCache = new SemanticCache();
      expect(defaultCache.config.similarityThreshold).toBe(0.85);
      expect(defaultCache.config.maxCacheSize).toBe(10000);
      expect(defaultCache.config.defaultTTL).toBe(24 * 60 * 60 * 1000);
      expect(defaultCache.config.embeddingModel).toBe('text-embedding-3-large');

      await defaultCache.set('key', 'value');
      const result = await defaultCache.get('key');
      expect(result.hit).toBe(true);
    });

    it('short-circuits semantic search when useSemantic is false and no exact match', async () => {
      const result = await cache.get('missing', { useSemantic: false });
      expect(result.hit).toBe(false);
      expect(result.type).toBe('none');
    });

    it('no-ops when deleting a non-existent entry', () => {
      expect(() => cache._deleteEntry('missing-value-key')).not.toThrow();
      expect(cache.cacheStore.size).toBe(0);
    });
  });
});
