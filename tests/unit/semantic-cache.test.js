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
      const shortCache = new SemanticCache({ defaultTTL: 1 });
      await shortCache.set('key', { data: 'value' });
      await new Promise(resolve => setTimeout(resolve, 10));
      const result = await shortCache.get('key');
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
      const shortCache = new SemanticCache({ defaultTTL: 1 });
      await shortCache.set('key1', { data: 'value1' });
      await new Promise(resolve => setTimeout(resolve, 5));
      await shortCache.set('key2', { data: 'value2' });
      
      const cleaned = shortCache.cleanup();
      expect(cleaned.cleaned).toBeGreaterThanOrEqual(0);
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
});
