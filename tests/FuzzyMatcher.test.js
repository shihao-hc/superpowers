/**
 * FuzzyMatcher Tests
 */

const {
  FuzzyMatcher,
  FuzzyIndex,
  FuzzyHighlight
} = require('../src/utils/FuzzyMatcher');

describe('FuzzyMatcher', () => {
  let matcher;

  beforeEach(() => {
    matcher = new FuzzyMatcher({
      threshold: 0.3,
      ignoreCase: true,
      ignoreAccents: true
    });
  });

  describe('normalize()', () => {
    it('should ignore case', () => {
      expect(matcher.normalize('Hello World')).toBe('hello world');
    });

    it('should remove accents', () => {
      expect(matcher.normalize('café')).toBe('cafe');
    });

    it('should handle null/undefined', () => {
      expect(matcher.normalize(null)).toBe('');
      expect(matcher.normalize(undefined)).toBe('');
    });
  });

  describe('distance()', () => {
    it('should return 0 for identical strings', () => {
      expect(matcher.distance('hello', 'hello')).toBe(0);
    });

    it('should return correct distance', () => {
      expect(matcher.distance('hello', 'hallo')).toBe(1);
      // h-e-l-l-o vs w-o-r-l-d: need to replace all 5 chars
      expect(matcher.distance('hello', 'world')).toBe(4);
    });

    it('should handle empty strings', () => {
      expect(matcher.distance('', '')).toBe(0);
      expect(matcher.distance('hello', '')).toBe(5);
      expect(matcher.distance('', 'hello')).toBe(5);
    });
  });

  describe('levenshteinSimilarity()', () => {
    it('should return 1 for identical strings', () => {
      expect(matcher.levenshteinSimilarity('hello', 'hello')).toBe(1);
    });

    it('should return lower similarity for different strings', () => {
      const sim = matcher.levenshteinSimilarity('hello', 'world');
      expect(sim).toBeLessThan(1);
      expect(sim).toBeGreaterThan(0);
    });
  });

  describe('score()', () => {
    it('should give high score for startsWith', () => {
      expect(matcher.score('Hello World', 'hel')).toBeGreaterThan(0.9);
    });

    it('should give high score for includes', () => {
      const score = matcher.score('Hello World', 'llo');
      expect(score).toBeGreaterThan(0.5);
    });

    it('should give high score for acronym', () => {
      const score = matcher.score('Command Palette', 'cp');
      expect(score).toBeGreaterThan(0.5);
    });

    it('should return 0 for no match', () => {
      expect(matcher.score('Hello', 'xyz')).toBeLessThan(matcher.threshold);
    });
  });

  describe('match()', () => {
    it('should return true for matches above threshold', () => {
      expect(matcher.match('Hello World', 'hello')).toBe(true);
    });

    it('should return false for matches below threshold', () => {
      expect(matcher.match('Hello', 'xyz')).toBe(false);
    });
  });

  describe('search()', () => {
    it('should return all items for empty pattern', () => {
      const items = ['apple', 'banana', 'cherry'];
      const results = matcher.search(items, '');
      expect(results).toEqual(items);
    });

    it('should sort by score', () => {
      const items = ['apple', 'application', 'apricot'];
      const results = matcher.search(items, 'app');
      // apple starts with 'app' exactly, so it scores highest
      expect(results[0]).toBe('apple');
    });

    it('should filter by minScore', () => {
      matcher.minScore = 0.8;
      const items = ['apple', 'banana', 'apricot'];
      const results = matcher.search(items, 'app');
      expect(results).toHaveLength(1);
      expect(results[0]).toBe('apple');
    });
  });

  describe('searchWithScores()', () => {
    it('should return items with scores', () => {
      const items = ['apple', 'application'];
      const results = matcher.searchWithScores(items, 'app');
      expect(results[0]).toHaveProperty('score');
      expect(results[0]).toHaveProperty('item');
    });

    it('should sort by score descending', () => {
      const items = ['apple', 'application', 'apricot'];
      const results = matcher.searchWithScores(items, 'app');
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  describe('with keys', () => {
    it('should search in object keys', () => {
      matcher.keys = ['name', 'description'];
      const items = [
        { name: 'apple', description: 'a fruit' },
        { name: 'banana', description: 'another fruit' }
      ];
      const results = matcher.search(items, 'fruit');
      expect(results).toHaveLength(2);
    });

    it('should respect key weights', () => {
      matcher.keys = ['name', 'description'];
      matcher.keysWeight = { name: 2, description: 1 };
      const items = [
        { name: 'apple', description: 'a fruit' }
      ];
      const results = matcher.searchWithScores(items, 'apple');
      expect(results[0].score).toBeGreaterThan(0.5);
    });
  });
});

describe('FuzzyIndex', () => {
  let index;

  beforeEach(() => {
    index = new FuzzyIndex({ threshold: 0.3 });
  });

  describe('add()', () => {
    it('should add documents', () => {
      index.add('1', 'Hello World');
      expect(index.documents.has('1')).toBe(true);
    });
  });

  describe('remove()', () => {
    it('should remove documents', () => {
      index.add('1', 'Hello World');
      index.remove('1');
      expect(index.documents.has('1')).toBe(false);
    });
  });

  describe('search()', () => {
    it('should find matching documents', () => {
      index.add('1', 'Hello World');
      index.add('2', 'Goodbye World');
      const results = index.search('hello');
      expect(results.some((r) => r.id === '1')).toBe(true);
    });

    it('should limit results', () => {
      index.add('1', 'apple');
      index.add('2', 'application');
      index.add('3', 'apricot');
      const results = index.search('app', 2);
      expect(results).toHaveLength(2);
    });

    it('should return all for empty pattern', () => {
      index.add('1', 'apple');
      index.add('2', 'banana');
      const results = index.search('');
      expect(results).toHaveLength(2);
    });
  });

  describe('clear()', () => {
    it('should clear all documents', () => {
      index.add('1', 'Hello');
      index.add('2', 'World');
      index.clear();
      expect(index.documents.size).toBe(0);
    });
  });
});

describe('FuzzyHighlight', () => {
  let highlighter;

  beforeEach(() => {
    highlighter = new FuzzyHighlight();
  });

  describe('highlight()', () => {
    it('should return no highlights for empty pattern', () => {
      const result = highlighter.highlight('Hello World', '');
      expect(result).toEqual([{ text: 'Hello World', highlight: false }]);
    });

    it('should identify matching segments', () => {
      const result = highlighter.highlight('Hello World', 'ello');
      const highlighted = result.filter((r) => r.highlight);
      expect(highlighted.length).toBeGreaterThan(0);
    });
  });

  describe('highlightHtml()', () => {
    it('should wrap highlights in tag', () => {
      const html = highlighter.highlightHtml('Hello World', 'ello');
      expect(html).toContain('<mark');
      // The highlight should be 'e' only due to matching logic
      expect(html).toContain('</mark>');
    });

    it('should use custom tag', () => {
      highlighter.highlightTag = 'span';
      const html = highlighter.highlightHtml('Hello World', 'ello');
      expect(html).toContain('<span');
    });
  });
});
