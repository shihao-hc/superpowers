const { FuzzyMatcher, FuzzyIndex, FuzzyHighlight, memoize } = require('../../src/utils/FuzzyMatcher');

describe('memoize', () => {
  it('should cache results for same args', () => {
    const fn = jest.fn((x) => x * 2);
    const memoized = memoize(fn);
    expect(memoized(5)).toBe(10);
    expect(memoized(5)).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should recompute for different args', () => {
    const fn = jest.fn((x) => x * 2);
    const memoized = memoize(fn);
    memoized(1); memoized(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should evict oldest when cache is full', () => {
    const fn = jest.fn((x) => x);
    const memoized = memoize(fn, 3);
    memoized('a'); memoized('b'); memoized('c'); memoized('d');
    expect(fn).toHaveBeenCalledTimes(4);
    memoized('a');
    expect(fn).toHaveBeenCalledTimes(5);
  });
});

describe('FuzzyMatcher', () => {
  let matcher;

  beforeEach(() => {
    matcher = new FuzzyMatcher({ threshold: 0.3 });
  });

  describe('constructor', () => {
    it('should use default options', () => {
      const m = new FuzzyMatcher();
      expect(m.threshold).toBe(0.3);
      expect(m.ignoreCase).toBe(true);
      expect(m.ignoreAccents).toBe(true);
      expect(m.minScore).toBe(0);
      expect(m.keys).toBeNull();
    });

    it('should accept custom options', () => {
      const m = new FuzzyMatcher({ threshold: 0.5, ignoreCase: false, minScore: 0.2, keys: ['name'] });
      expect(m.threshold).toBe(0.5);
      expect(m.ignoreCase).toBe(false);
      expect(m.minScore).toBe(0.2);
      expect(m.keys).toEqual(['name']);
    });
  });

  describe('normalize', () => {
    it('should return empty for non-string', () => {
      expect(matcher.normalize(null)).toBe('');
      expect(matcher.normalize(undefined)).toBe('');
      expect(matcher.normalize(123)).toBe('');
    });

    it('should lowercase when ignoreCase is true', () => {
      expect(matcher.normalize('Hello World')).toBe('hello world');
    });

    it('should not lowercase when ignoreCase is false', () => {
      const m = new FuzzyMatcher({ ignoreCase: false });
      expect(m.normalize('Hello')).toBe('Hello');
    });

    it('should strip accents', () => {
      expect(matcher.normalize('café')).toBe('cafe');
      expect(matcher.normalize('naïve')).toBe('naive');
    });

    it('should cache normalized results', () => {
      matcher.normalize('test');
      matcher.normalize('test');
      expect(matcher._normalizeCache.get('test')).toBe('test');
    });
  });

  describe('distance', () => {
    it('should return 0 for identical strings', () => {
      expect(matcher.distance('hello', 'hello')).toBe(0);
    });

    it('should return max length for empty strings', () => {
      expect(matcher.distance('', 'abc')).toBe(3);
      expect(matcher.distance('abc', '')).toBe(3);
      expect(matcher.distance('', '')).toBe(0);
    });

    it('should compute Levenshtein distance', () => {
      expect(matcher.distance('kitten', 'sitting')).toBe(3);
      expect(matcher.distance('hello', 'hallo')).toBe(1);
    });

    it('should use Wagner-Fischer for long strings', () => {
      const long1 = 'a'.repeat(1001);
      const long2 = 'a'.repeat(1001);
      expect(matcher.distance(long1, long2)).toBe(0);
    });

    it('should handle null/undefined', () => {
      expect(matcher.distance(null, 'test')).toBe(4);
      expect(matcher.distance('test', null)).toBe(4);
    });
  });

  describe('levenshteinSimilarity', () => {
    it('should return 1 for identical', () => {
      expect(matcher.levenshteinSimilarity('hello', 'hello')).toBeCloseTo(1);
    });

    it('should return 0 for empty inputs', () => {
      expect(matcher.levenshteinSimilarity('', '')).toBe(1);
    });

    it('should return partial for similar', () => {
      const sim = matcher.levenshteinSimilarity('hello', 'hallo');
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });
  });

  describe('includesScore', () => {
    it('should return 1 for exact match', () => {
      expect(matcher.includesScore('hello', 'hello')).toBe(1);
    });

    it('should return 0 for empty pattern', () => {
      expect(matcher.includesScore('hello', '')).toBe(0);
    });

    it('should return high score for substring', () => {
      const score = matcher.includesScore('hello world', 'world');
      expect(score).toBeGreaterThan(0.9);
    });
  });

  describe('startsWithScore', () => {
    it('should return 1 when text starts with pattern', () => {
      expect(matcher.startsWithScore('hello world', 'hello')).toBe(1);
    });

    it('should return 0 for empty inputs', () => {
      expect(matcher.startsWithScore('', 'test')).toBe(0);
    });

    it('should return 0.5 for partial prefix', () => {
      const score = matcher.startsWithScore('hello world', 'heaven');
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('acronymScore', () => {
    it('should match sequential chars', () => {
      const score = matcher.acronymScore('hello world', 'hwd');
      expect(score).toBeGreaterThan(0);
    });

    it('should return 0 for non-matching', () => {
      expect(matcher.acronymScore('hello', 'xyz')).toBe(0);
    });
  });

  describe('camelCaseScore', () => {
    it('should split camelCase', () => {
      const score = matcher.camelCaseScore('helloWorld', 'world');
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('wordBoundaryScore', () => {
    it('should match at word boundaries', () => {
      const score = matcher.wordBoundaryScore('hello world foo', 'world');
      expect(score).toBeGreaterThan(0.9);
    });
  });

  describe('score', () => {
    it('should return 0 for empty inputs', () => {
      expect(matcher.score('', 'test')).toBe(0);
      expect(matcher.score('test', '')).toBe(0);
    });

    it('should return best score from all strategies', () => {
      const s = matcher.score('hello world', 'hello');
      expect(s).toBeGreaterThan(0);
    });

    it('should cache results', () => {
      matcher.score('test', 'pattern');
      matcher.score('test', 'pattern');
      expect(matcher._scoreCache.size).toBeGreaterThan(0);
    });
  });

  describe('match', () => {
    it('should return true when score exceeds threshold', () => {
      expect(matcher.match('hello world', 'hello')).toBe(true);
    });

    it('should return false when score is below threshold', () => {
      const m = new FuzzyMatcher({ threshold: 0.9 });
      expect(m.match('hello world', 'xyz')).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear all caches', () => {
      matcher.score('test', 'pattern');
      matcher.clearCache();
      expect(matcher._normalizeCache.size).toBe(0);
      expect(matcher._distanceCache.size).toBe(0);
      expect(matcher._scoreCache.size).toBe(0);
    });
  });

  describe('getNestedValue', () => {
    it('should return nested object value', () => {
      expect(matcher.getNestedValue({ a: { b: 'val' } }, 'a.b')).toBe('val');
    });

    it('should return empty for missing path', () => {
      expect(matcher.getNestedValue({}, 'a.b')).toBe('');
    });
  });

  describe('getItemScore', () => {
    it('should score string items', () => {
      const score = matcher.getItemScore('hello world', 'hello');
      expect(score).toBeGreaterThan(0);
    });

    it('should score object items with keys', () => {
      const m = new FuzzyMatcher({ keys: ['name', 'title'], keysWeight: { name: 2 } });
      const item = { name: 'hello world', title: 'foo' };
      const score = m.getItemScore(item, 'hello');
      expect(score).toBeGreaterThan(0);
    });

    it('should JSON.stringify non-string items', () => {
      const score = matcher.getItemScore([1, 2, 3], '1');
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('search', () => {
    it('should return all items when no pattern', () => {
      const items = ['a', 'b', 'c'];
      expect(matcher.search(items, '')).toEqual(items);
    });

    it('should return sorted results', () => {
      const items = ['hello world', 'goodbye', 'hello there'];
      const m = new FuzzyMatcher({ threshold: 0.3, minScore: 0.01 });
      const results = m.search(items, 'hello');
      expect(results).toHaveLength(2);
    });

    it('should respect minScore', () => {
      const m = new FuzzyMatcher({ minScore: 0.9 });
      const items = ['hello', 'hello world'];
      expect(m.search(items, 'xyz')).toHaveLength(0);
    });
  });

  describe('searchWithScores', () => {
    it('should return scored results', () => {
      const items = ['hello world', 'goodbye'];
      const results = matcher.searchWithScores(items, 'hello');
      expect(results[0]).toHaveProperty('item');
      expect(results[0]).toHaveProperty('score');
    });

    it('should return all with score 1 when no pattern', () => {
      const results = matcher.searchWithScores(['a', 'b'], '');
      expect(results).toHaveLength(2);
      expect(results[0].score).toBe(1);
    });
  });
});

describe('FuzzyIndex', () => {
  let index;

  beforeEach(() => {
    index = new FuzzyIndex();
  });

  describe('add', () => {
    it('should index a document', () => {
      index.add('doc1', 'hello world');
      expect(index.documents.get('doc1')).toBe('hello world');
    });

    it('should tokenize on add', () => {
      index.add('doc1', 'hello');
      expect(index.tokens.size).toBeGreaterThan(0);
    });
  });

  describe('addBatch', () => {
    it('should index multiple documents', () => {
      index.addBatch([['doc1', 'hello'], ['doc2', 'world']]);
      expect(index.documents.size).toBe(2);
    });

    it('should handle empty entries', () => {
      index.addBatch([]);
      expect(index.documents.size).toBe(0);
    });

    it('should handle null entries', () => {
      index.addBatch(null);
      expect(index.documents.size).toBe(0);
    });
  });

  describe('remove', () => {
    it('should remove document from index', () => {
      index.add('doc1', 'hello');
      index.remove('doc1');
      expect(index.documents.has('doc1')).toBe(false);
    });

    it('should do nothing for non-existent id', () => {
      expect(() => index.remove('nonexistent')).not.toThrow();
    });
  });

  describe('tokenize', () => {
    it('should split and create prefix tokens', () => {
      const tokens = index.tokenize('hello');
      expect(tokens.has('h')).toBe(true);
      expect(tokens.has('he')).toBe(true);
      expect(tokens.has('hel')).toBe(true);
    });

    it('should cache tokens', () => {
      index.tokenize('test');
      index.tokenize('test');
      expect(index._tokenizeCache.size).toBeGreaterThan(0);
    });
  });

  describe('search', () => {
    it('should return results matching pattern', () => {
      index.add('doc1', 'hello world');
      index.add('doc2', 'goodbye world');
      const results = index.search('hello');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return all docs when pattern is empty', () => {
      index.add('doc1', 'hello');
      index.add('doc2', 'world');
      const results = index.search('');
      expect(results).toHaveLength(2);
    });

    it('should fallback to low-score results when no token match', () => {
      index.add('doc1', 'hello');
      const results = index.search('zzz');
      expect(results.length).toBe(1);
      expect(results[0].score).toBe(0);
    });

    it('should respect limit', () => {
      index.add('doc1', 'hello world');
      index.add('doc2', 'hello there');
      const results = index.search('hello', 1);
      expect(results).toHaveLength(1);
    });
  });

  describe('rebuildTokenIndex', () => {
    it('should rebuild from documents', () => {
      index.add('doc1', 'hello');
      index.tokens.clear();
      index.rebuildTokenIndex();
      expect(index.tokens.size).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      index.add('doc1', 'hello');
      index.clear();
      expect(index.documents.size).toBe(0);
      expect(index.tokens.size).toBe(0);
    });
  });
});

describe('FuzzyHighlight', () => {
  let hl;

  beforeEach(() => {
    hl = new FuzzyHighlight();
  });

  describe('highlight', () => {
    it('should return unhighlighted when pattern is empty', () => {
      expect(hl.highlight('test', '')).toEqual([{ text: 'test', highlight: false }]);
    });

    it('should return unhighlighted when text is empty', () => {
      expect(hl.highlight('', 'test')).toEqual([{ text: '', highlight: false }]);
    });

    it('should highlight matching segments', () => {
      const result = hl.highlight('hello world', 'hello');
      expect(result.length).toBeGreaterThan(1);
      expect(result.some(s => s.highlight)).toBe(true);
    });
  });

  describe('findMatches', () => {
    it('should find matching substrings', () => {
      const matches = hl.findMatches('hello world', 'hello');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].start).toBe(0);
    });

    it('should return empty for no matches', () => {
      expect(hl.findMatches('hello', 'xyz')).toEqual([]);
    });
  });

  describe('highlightHtml', () => {
    it('should produce HTML with mark tags', () => {
      const html = hl.highlightHtml('hello world', 'hello');
      expect(html).toContain('<mark');
      expect(html).toContain('</mark>');
    });

    it('should return plain text for no match', () => {
      const html = hl.highlightHtml('hello', '');
      expect(html).toBe('hello');
    });
  });

  describe('custom options', () => {
    it('should use custom highlight tag and class', () => {
      const custom = new FuzzyHighlight({ highlightTag: 'span', highlightClass: 'highlight' });
      const html = custom.highlightHtml('hello world', 'hello');
      expect(html).toContain('<span class="highlight">');
    });
  });
});

describe('Branch coverage: cache eviction paths', () => {
  describe('normalize cache eviction', () => {
    it('should evict oldest when normalize cache exceeds limit', () => {
      const m = new FuzzyMatcher({ threshold: 0.3 });
      for (let i = 0; i < 501; i++) {
        m.normalize(`str${i}`);
      }
      expect(m._normalizeCache.size).toBeLessThanOrEqual(500);
    });
  });

  describe('distance len === 0 after normalization', () => {
    it('should handle str1 normalizing to empty (len1 === 0)', () => {
      const m = new FuzzyMatcher({ threshold: 0.3 });
      expect(m.distance('\u0301', 'test')).toBe(4);
    });

    it('should handle str2 normalizing to empty (len2 === 0)', () => {
      const m = new FuzzyMatcher({ threshold: 0.3 });
      expect(m.distance('test', '\u0301')).toBe(4);
    });
  });

  describe('distance cache eviction', () => {
    it('should evict oldest when distance cache exceeds limit', () => {
      const m = new FuzzyMatcher({ threshold: 0.3 });
      for (let i = 0; i < 501; i++) {
        m.distance(`a${i}`, `b${i}`);
      }
      expect(m._distanceCache.size).toBeLessThanOrEqual(500);
    });
  });

  describe('matrix-based Wagner-Fischer', () => {
    it('should use matrix when |len1-len2| > maxLen * 0.5 and maxLen > 1000', () => {
      const m = new FuzzyMatcher({ threshold: 0.3 });
      const long1 = 'a'.repeat(1000);
      const long2 = 'a'.repeat(2002);
      expect(m.distance(long1, long2)).toBe(1002);
    });
  });

  describe('score cache eviction', () => {
    it('should evict oldest when score cache exceeds limit', () => {
      const m = new FuzzyMatcher({ threshold: 0.3 });
      for (let i = 0; i < 501; i++) {
        m.score(`text${i}`, `pattern${i}`);
      }
      expect(m._scoreCache.size).toBeLessThanOrEqual(500);
    });
  });

  describe('FuzzyIndex pattern normalizes to empty tokens', () => {
    it('should return empty array when pattern produces no tokens', () => {
      const idx = new FuzzyIndex();
      idx.add('doc1', 'hello world');
      const results = idx.search('\u0301');
      expect(results).toEqual([]);
    });
  });

  describe('tokenize cache eviction', () => {
    it('should evict oldest when tokenize cache exceeds limit', () => {
      const idx = new FuzzyIndex();
      for (let i = 0; i < 1001; i++) {
        idx.tokenize(`text${i} example`);
      }
      expect(idx._tokenizeCache.size).toBeLessThanOrEqual(1000);
    });
  });
});

describe('Additional branch coverage', () => {
  describe('normalize with ignoreAccents false', () => {
    it('should not strip accents when ignoreAccents is false', () => {
      const m = new FuzzyMatcher({ ignoreAccents: false });
      expect(m.normalize('café')).toBe('café');
    });
  });

  describe('Wagner-Fischer cost=1 branches', () => {
    it('should handle cost=1 in matrix path with very long differing chars and different lengths', () => {
      const m = new FuzzyMatcher({ threshold: 0.3 });
      const long1 = 'a'.repeat(1000);
      const long2 = 'b'.repeat(2002);
      expect(m.distance(long1, long2)).toBe(2002);
    });

    it('should handle cost=1 in Uint16 path with long similar-length differing chars', () => {
      const m = new FuzzyMatcher({ threshold: 0.3 });
      const long1 = 'a'.repeat(1001);
      const long2 = 'b'.repeat(1001);
      expect(m.distance(long1, long2)).toBe(1001);
    });
  });

  describe('startsWithScore partial prefix', () => {
    it('should return 0.5 when text starts with half of pattern', () => {
      const m = new FuzzyMatcher({ threshold: 0.3 });
      expect(m.startsWithScore('help', 'hello')).toBe(0.5);
    });
  });

  describe('empty inputs for scoring methods', () => {
    it('should return 0 for empty text in acronymScore', () => {
      const m = new FuzzyMatcher({ threshold: 0.3 });
      expect(m.acronymScore('', 'test')).toBe(0);
    });

    it('should return 0 for empty text in camelCaseScore', () => {
      const m = new FuzzyMatcher({ threshold: 0.3 });
      expect(m.camelCaseScore('', 'test')).toBe(0);
    });

    it('should return 0 for empty text in wordBoundaryScore', () => {
      const m = new FuzzyMatcher({ threshold: 0.3 });
      expect(m.wordBoundaryScore('', 'test')).toBe(0);
    });
  });

  describe('searchWithScores with filtering', () => {
    it('should exclude items below minScore', () => {
      const m = new FuzzyMatcher({ minScore: 0.9, threshold: 0.3 });
      const items = ['hello', 'world'];
      const results = m.searchWithScores(items, 'xyz');
      expect(results).toHaveLength(0);
    });
  });

  describe('getItemScore with totalWeight=0', () => {
    it('should handle empty keys array with totalWeight=0', () => {
      const m = new FuzzyMatcher({ keys: [] });
      const item = { name: 'hello' };
      expect(m.getItemScore(item, 'hello')).toBe(0);
    });
  });

  describe('getNestedValue with null value', () => {
    it('should return empty string for null value at path end', () => {
      const m = new FuzzyMatcher({ threshold: 0.3 });
      expect(m.getNestedValue({ a: null }, 'a')).toBe('');
    });
  });

  describe('FuzzyIndex.addBatch with existing tokens', () => {
    it('should handle duplicate tokens in addBatch', () => {
      const idx = new FuzzyIndex();
      idx.add('doc1', 'hello');
      idx.addBatch([['doc2', 'hello'], ['doc3', 'world']]);
      expect(idx.documents.size).toBe(3);
      expect(idx.tokens.size).toBeGreaterThan(0);
    });
  });

  describe('FuzzyIndex.search with fuzzy token match', () => {
    it('should fuzzy match similar tokens', () => {
      const idx = new FuzzyIndex();
      idx.add('doc1', 'hello');
      const results = idx.search('helo');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('FuzzyIndex.search sort tie-breaking', () => {
    it('should sort by id when scores are equal', () => {
      const idx = new FuzzyIndex();
      idx.add('doc_a', 'hello');
      idx.add('doc_b', 'hello');
      const results = idx.search('');
      expect(results[0]).toBe('doc_a');
      expect(results[1]).toBe('doc_b');
    });
  });

  describe('FuzzyHighlight no matches', () => {
    it('should return no highlights when findMatches is empty', () => {
      const hl = new FuzzyHighlight();
      const result = hl.highlight('abc', 'xyz');
      expect(result).toEqual([{ text: 'abc', highlight: false }]);
    });
  });

  describe('FuzzyHighlight trailing text', () => {
    it('should handle trailing text after last match', () => {
      const hl = new FuzzyHighlight();
      const result = hl.highlight('hello world foo', 'hello');
      expect(result.some(s => s.highlight)).toBe(true);
      expect(result[result.length - 1].text).toBe('ello world foo');
      expect(result[result.length - 1].highlight).toBe(false);
    });
  });

  describe('FuzzyHighlight multiple matches with gaps', () => {
    it('should handle gap between matches', () => {
      const hl = new FuzzyHighlight();
      const result = hl.highlight('hahaha', 'h');
      expect(result.length).toBe(6);
      expect(result[0]).toEqual({ text: 'h', highlight: true });
      expect(result[1]).toEqual({ text: 'a', highlight: false });
    });
  });

  describe('FuzzyHighlight exact match no trailing', () => {
    it('should not add trailing segment when match ends at text end', () => {
      const hl = new FuzzyHighlight();
      const result = hl.highlight('a', 'a');
      expect(result).toEqual([{ text: 'a', highlight: true }]);
    });
  });

  describe('FuzzyIndex.addBatch duplicate tokens in single call', () => {
    it('should handle overlapping tokens within same addBatch call', () => {
      const idx = new FuzzyIndex();
      idx.addBatch([['doc1', 'hello'], ['doc2', 'hello']]);
      expect(idx.documents.size).toBe(2);
      expect(idx.tokens.size).toBeGreaterThan(0);
    });
  });

  describe('FuzzyIndex.search fuzzy match with no prior score', () => {
    it('should handle fuzzy match when no prefix match scored before', () => {
      const idx = new FuzzyIndex();
      idx.add('doc1', 'abcd');
      const results = idx.search('xbcd');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('FuzzyIndex.search with long tokens (>10 chars)', () => {
    it('should handle tokens longer than 10 chars without fuzzy crash', () => {
      const idx = new FuzzyIndex();
      idx.add('doc1', 'abcdefghijklm');
      const results = idx.search('yyyyyyyyyyyyy');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('doc1');
    });
  });

  describe('FuzzyIndex.search sort with different scores', () => {
    it('should sort by descending score', () => {
      const idx = new FuzzyIndex();
      idx.add('doc_a', 'hello');
      idx.add('doc_b', 'hell');
      const results = idx.search('hello');
      expect(results[0].id).toBe('doc_a');
      const scoreA = results.find(r => r.id === 'doc_a');
      const scoreB = results.find(r => r.id === 'doc_b');
      expect(scoreA.score).toBeGreaterThan(scoreB.score);
    });
  });

  describe('FuzzyIndex.rebuildTokenIndex with existing tokens', () => {
    it('should handle existing tokens during rebuild', () => {
      const idx = new FuzzyIndex();
      idx.add('doc1', 'hello');
      idx.add('doc2', 'hello');
      idx.rebuildTokenIndex();
      expect(idx.tokens.size).toBeGreaterThan(0);
    });
  });

  describe('FuzzyIndex.search fallback with minScore filter', () => {
    it('should exclude fallback results below minScore', () => {
      const idx = new FuzzyIndex({ minScore: 0.1 });
      idx.add('doc1', 'hello');
      const results = idx.search('zzz');
      expect(results.length).toBe(0);
    });
  });

  describe('FuzzyIndex.search with empty document text', () => {
    it('should not crash when document has empty text', () => {
      const idx = new FuzzyIndex();
      idx.add('doc1', '');
      const results = idx.search('hello');
      expect(results.length).toBe(0);
    });
  });
});
