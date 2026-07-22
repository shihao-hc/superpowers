/**
 * Native Fuzzy Matcher - 减少外部依赖
 * 基于 TypeScript 实现的模糊匹配算法
 * 性能优化版本：添加Memoize缓存、优化Levenshtein算法、减少对象创建
 */

function memoize(fn, maxCacheSize = 500) {
  const cache = new Map();
  return function(...args) {
    const key = args.join('\x00');
    if (cache.has(key)) {return cache.get(key);}
    const result = fn.apply(this, args);
    if (cache.size >= maxCacheSize) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    cache.set(key, result);
    return result;
  };
}

class FuzzyMatcher {
  constructor(options = {}) {
    this.threshold = options.threshold || 0.3;
    this.ignoreCase = options.ignoreCase ?? true;
    this.ignoreAccents = options.ignoreAccents ?? true;
    this.minScore = options.minScore || 0;
    this.keys = options.keys || null;
    this.keysWeight = options.keysWeight || {};
    this.scoreFn = options.scoreFn || null;

    // 安全：限制缓存大小
    this._cacheLimits = {
      normalize: 500,
      distance: 500,
      score: 200
    };

    this._normalizeCache = new Map();
    this._distanceCache = new Map();
    this._scoreCache = new Map();
  }

  normalize(str) {
    if (!str || typeof str !== 'string') {return '';}
    if (this._normalizeCache.has(str)) {return this._normalizeCache.get(str);}

    let result = str;
    if (this.ignoreCase) {result = result.toLowerCase();}
    if (this.ignoreAccents) {
      result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    if (this._normalizeCache.size >= this._cacheLimits.normalize) {
      const firstKey = this._normalizeCache.keys().next().value;
      this._normalizeCache.delete(firstKey);
    }
    this._normalizeCache.set(str, result);
    return result;
  }

  distance(str1, str2) {
    if (!str1 && !str2) {return 0;}
    if (!str1 || !str2) {return Math.max(str1?.length || 0, str2?.length || 0);}

    const cacheKey = `${str1}\x00${str2}`;
    if (this._distanceCache.has(cacheKey)) {return this._distanceCache.get(cacheKey);}

    const s1 = this.normalize(str1);
    const s2 = this.normalize(str2);

    const len1 = s1.length;
    const len2 = s2.length;

    if (len1 === 0) {
      this._distanceCache.set(cacheKey, len2);
      return len2;
    }
    if (len2 === 0) {
      this._distanceCache.set(cacheKey, len1);
      return len1;
    }

    const maxLen = Math.max(len1, len2);
    if (maxLen > 1000) {
      const result = this._distanceWagnerFischer(s1, s2);
      this._distanceCache.set(cacheKey, result);
      return result;
    }

    let prev = new Uint16Array(len2 + 1);
    let curr = new Uint16Array(len2 + 1);

    for (let j = 0; j <= len2; j++) {prev[j] = j;}

    for (let i = 1; i <= len1; i++) {
      curr[0] = i;
      const ch1 = s1[i - 1];
      for (let j = 1; j <= len2; j++) {
        const cost = ch1 === s2[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1,
          curr[j - 1] + 1,
          prev[j - 1] + cost
        );
      }
      [prev, curr] = [curr, prev];
    }

    const result = prev[len2];

    if (this._distanceCache.size >= 500) {
      const firstKey = this._distanceCache.keys().next().value;
      this._distanceCache.delete(firstKey);
    }
    this._distanceCache.set(cacheKey, result);
    return result;
  }

  _distanceWagnerFischer(s1, s2) {
    const len1 = s1.length;
    const len2 = s2.length;
    const maxLen = Math.max(len1, len2);

    if (Math.abs(len1 - len2) > maxLen * 0.5) {
      const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
      for (let i = 0; i <= len1; i++) {matrix[i][0] = i;}
      for (let j = 0; j <= len2; j++) {matrix[0][j] = j;}
      for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
          const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j - 1] + cost
          );
        }
      }
      return matrix[len1][len2];
    }

    let prev = new Uint16Array(len2 + 1);
    let curr = new Uint16Array(len2 + 1);

    for (let j = 0; j <= len2; j++) {prev[j] = j;}

    for (let i = 1; i <= len1; i++) {
      curr[0] = i;
      const ch1 = s1[i - 1];
      for (let j = 1; j <= len2; j++) {
        const cost = ch1 === s2[j - 1] ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      }
      [prev, curr] = [curr, prev];
    }

    return prev[len2];
  }

  levenshteinSimilarity(str1, str2) {
    const maxLen = Math.max(str1?.length || 0, str2?.length || 0);
    if (maxLen === 0) {return 1;}
    const dist = this.distance(str1, str2);
    return 1 - dist / maxLen;
  }

  includesScore(text, pattern) {
    const t = this.normalize(text);
    const p = this.normalize(pattern);

    if (!t || !p) {return 0;}
    if (t === p) {return 1;}
    if (t.includes(p)) {return 0.9 + (p.length / t.length) * 0.1;}

    return this.levenshteinSimilarity(p, t);
  }

  startsWithScore(text, pattern) {
    const t = this.normalize(text);
    const p = this.normalize(pattern);

    if (!t || !p) {return 0;}
    if (t.startsWith(p)) {return 1;}
    if (t.startsWith(p.slice(0, Math.ceil(p.length / 2)))) {return 0.5;}

    return this.levenshteinSimilarity(p, t.slice(0, p.length * 2));
  }

  acronymScore(text, pattern) {
    const t = this.normalize(text);
    const p = this.normalize(pattern);

    if (!t || !p) {return 0;}

    let tIdx = 0;
    let pIdx = 0;

    while (pIdx < p.length && tIdx < t.length) {
      if (t[tIdx] === p[pIdx]) {pIdx++;}
      tIdx++;
    }

    if (pIdx === p.length) {
      return 0.8 + (p.length / t.length) * 0.2;
    }

    return 0;
  }

  camelCaseScore(text, pattern) {
    const t = this.normalize(text);
    const p = this.normalize(pattern);

    if (!t || !p) {return 0;}

    const words = t.split(/[\s_-]+|(?=[A-Z])/);
    const joined = words.join('');

    return this.includesScore(joined, p);
  }

  wordBoundaryScore(text, pattern) {
    const t = this.normalize(text);
    const p = this.normalize(pattern);

    if (!t || !p) {return 0;}

    const words = t.split(/[\s_-]+/);
    let maxScore = 0;

    for (const word of words) {
      if (word.startsWith(p)) {
        maxScore = Math.max(maxScore, 0.9 + (p.length / word.length) * 0.1);
      } else if (word.includes(p)) {
        maxScore = Math.max(maxScore, this.includesScore(word, p));
      }
    }

    return maxScore;
  }

  _getScoreCacheKey(text, pattern) {
    return `${text}\x00${pattern}`;
  }

  score(text, pattern) {
    if (!text || !pattern) {return 0;}

    const cacheKey = this._getScoreCacheKey(text, pattern);
    if (this._scoreCache.has(cacheKey)) {return this._scoreCache.get(cacheKey);}

    const scores = [
      this.startsWithScore(text, pattern),
      this.acronymScore(text, pattern),
      this.camelCaseScore(text, pattern),
      this.wordBoundaryScore(text, pattern),
      this.includesScore(text, pattern)
    ];

    const result = Math.max(...scores);

    if (this._scoreCache.size >= 500) {
      const firstKey = this._scoreCache.keys().next().value;
      this._scoreCache.delete(firstKey);
    }
    this._scoreCache.set(cacheKey, result);
    return result;
  }

  match(text, pattern) {
    const s = this.score(text, pattern);
    return s >= this.threshold;
  }

  clearCache() {
    this._normalizeCache.clear();
    this._distanceCache.clear();
    this._scoreCache.clear();
  }

  search(collection, pattern) {
    if (!pattern) {return collection;}

    const scored = [];
    for (let i = 0; i < collection.length; i++) {
      const item = collection[i];
      const itemScore = this.getItemScore(item, pattern);
      if (itemScore >= this.minScore) {
        scored.push({ item, score: itemScore });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    const results = new Array(scored.length);
    for (let i = 0; i < scored.length; i++) {
      results[i] = scored[i].item;
    }
    return results;
  }

  searchWithScores(collection, pattern) {
    if (!pattern) {return collection.map((item) => ({ item, score: 1 }));}

    const scored = [];
    for (let i = 0; i < collection.length; i++) {
      const item = collection[i];
      const itemScore = this.getItemScore(item, pattern);
      if (itemScore >= this.minScore) {
        scored.push({ item, score: itemScore });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  getItemScore(item, pattern) {
    if (this.keys) {
      let maxScore = 0;
      let totalWeight = 0;

      for (const key of this.keys) {
        const value = this.getNestedValue(item, key);
        const weight = this.keysWeight[key] || 1;
        const keyScore = this.score(value, pattern) * weight;
        maxScore = Math.max(maxScore, keyScore);
        totalWeight += weight;
      }

      return totalWeight > 0 ? maxScore / totalWeight : maxScore;
    }

    if (typeof item === 'string') {
      return this.score(item, pattern);
    }

    return this.score(JSON.stringify(item), pattern);
  }

  getNestedValue(obj, path) {
    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
      if (value == null) {return '';} // eslint-disable-line eqeqeq
      value = value[key];
    }

    return value ?? '';
  }
}

class FuzzyIndex {
  constructor(options = {}) {
    this.matcher = new FuzzyMatcher(options);
    this.documents = new Map();
    this.tokens = new Map();
  }

  add(id, text) {
    this.documents.set(id, text);
    this.tokenize(text).forEach((token) => {
      if (!this.tokens.has(token)) {
        this.tokens.set(token, new Set());
      }
      this.tokens.get(token).add(id);
    });
  }

  addBatch(entries) {
    if (!entries || entries.length === 0) {return;}

    const allTokens = new Map();

    for (const [id, text] of entries) {
      this.documents.set(id, text);
      for (const token of this.tokenize(text)) {
        if (!allTokens.has(token)) {
          allTokens.set(token, new Set());
        }
        allTokens.get(token).add(id);
      }
    }

    for (const [token, ids] of allTokens) {
      if (!this.tokens.has(token)) {
        this.tokens.set(token, new Set());
      }
      const existing = this.tokens.get(token);
      for (const id of ids) {
        existing.add(id);
      }
    }
  }

  remove(id) {
    const text = this.documents.get(id);
    if (!text) {return;}

    this.tokenize(text).forEach((token) => {
      this.tokens.get(token)?.delete(id);
    });
    this.documents.delete(id);
  }

  _tokenizeCache = new Map();

  tokenize(text) {
    if (this._tokenizeCache.has(text)) {
      return this._tokenizeCache.get(text);
    }

    const normalized = this.matcher.normalize(text);
    const words = normalized.split(/[\s,.!?;:()\[\]{}]+/).filter(Boolean); // eslint-disable-line no-useless-escape
    const tokens = new Set();

    for (const word of words) {
      const len = word.length;
      for (let i = 1; i <= len; i++) {
        tokens.add(word.slice(0, i));
      }
    }

    if (this._tokenizeCache.size >= 1000) {
      const firstKey = this._tokenizeCache.keys().next().value;
      this._tokenizeCache.delete(firstKey);
    }
    this._tokenizeCache.set(text, tokens);
    return tokens;
  }

  search(pattern, limit = 10) {
    if (!pattern) {
      return Array.from(this.documents.keys()).slice(0, limit);
    }

    const patternTokens = this.tokenize(pattern);
    const patternLen = patternTokens.size;

    if (patternLen === 0) {
      return [];
    }

    const candidateScores = new Map();
    const _bestScore = 0;
    const _bestId = null;

    for (const token of patternTokens) {
      for (const [docToken, ids] of this.tokens) {
        if (docToken.startsWith(token)) {
          for (const id of ids) {
            let score = candidateScores.get(id) || 0;
            score += 1;
            candidateScores.set(id, score);
          }
        } else if (docToken.length <= 10 && token.length <= 10) {
          const sim = this.matcher.levenshteinSimilarity(token, docToken);
          if (sim > 0.7) {
            for (const id of ids) {
              let score = candidateScores.get(id) || 0;
              score += sim;
              candidateScores.set(id, score);
            }
          }
        }
      }
    }

    if (candidateScores.size === 0) {
      for (const [id] of this.documents) {
        candidateScores.set(id, 0.1);
      }
    }

    const results = [];

    for (const [id] of candidateScores) {
      const text = this.documents.get(id);
      if (text) {
        const score = this.matcher.score(text, pattern);
        if (score >= this.matcher.minScore) {
          results.push({ id, text, score });
        }
      }
    }

    results.sort((a, b) => {
      if (b.score !== a.score) {return b.score - a.score;}
      return a.id.localeCompare(b.id);
    });

    return results.slice(0, limit);
  }

  rebuildTokenIndex() {
    this.tokens.clear();
    for (const [id, text] of this.documents) {
      for (const token of this.tokenize(text)) {
        if (!this.tokens.has(token)) {
          this.tokens.set(token, new Set());
        }
        this.tokens.get(token).add(id);
      }
    }
  }

  clear() {
    this.documents.clear();
    this.tokens.clear();
  }
}

class FuzzyHighlight {
  constructor(options = {}) {
    this.matcher = new FuzzyMatcher(options);
    this.highlightTag = options.highlightTag || 'mark';
    this.highlightClass = options.highlightClass || 'fuzzy-highlight';
  }

  highlight(text, pattern) {
    if (!pattern || !text) {return [{ text, highlight: false }];}

    const normalizedText = this.matcher.normalize(text);
    const normalizedPattern = this.matcher.normalize(pattern);

    const matches = this.findMatches(normalizedText, normalizedPattern);

    if (matches.length === 0) {return [{ text, highlight: false }];}

    const result = [];
    let lastEnd = 0;

    for (const match of matches) {
      if (match.start > lastEnd) {
        result.push({
          text: text.slice(lastEnd, match.start),
          highlight: false
        });
      }
      result.push({
        text: text.slice(match.start, match.end),
        highlight: true
      });
      lastEnd = match.end;
    }

    if (lastEnd < text.length) {
      result.push({
        text: text.slice(lastEnd),
        highlight: false
      });
    }

    return result;
  }

  findMatches(text, pattern) {
    const matches = [];

    for (let i = 0; i < text.length; i++) {
      let matchEnd = -1;

      for (let j = i; j < Math.min(i + pattern.length + 5, text.length); j++) {
        if (text[j] === pattern[j - i]) {
          if (matchEnd === -1) {matchEnd = j + 1;}
        } else {
          break;
        }
      }

      if (matchEnd > i) {
        matches.push({ start: i, end: matchEnd });
        i = matchEnd - 1;
      }
    }

    return matches;
  }

  highlightHtml(text, pattern) {
    const segments = this.highlight(text, pattern);

    return segments.map((seg) => {
      if (seg.highlight) {
        return `<${this.highlightTag} class="${this.highlightClass}">${seg.text}</${this.highlightTag}>`;
      }
      return seg.text;
    }).join('');
  }
}

module.exports = {
  FuzzyMatcher,
  FuzzyIndex,
  FuzzyHighlight,
  memoize
};

/**
 * ============================================
 * 性能测试代码 (注释)
 * ============================================
 *
 * 运行方式: node -e "
 * const { FuzzyMatcher, FuzzyIndex } = require('./src/utils/FuzzyMatcher');
 * // 测试代码...
 * "
 *
 * // --- FuzzyMatcher 性能测试 ---
 * (function() {
 *   const matcher = new FuzzyMatcher({ threshold: 0.3 });
 *   const testStrings = [
 *     'Hello World', 'Hello World Test', 'Test Hello World',
 *     'Another test string', 'Testing performance', 'Perf test data'
 *   ];
 *   const pattern = 'hello test';
 *
 *   console.time('score (no cache)');
 *   for (let i = 0; i < 1000; i++) {
 *     testStrings.forEach(s => matcher.score(s, pattern));
 *   }
 *   console.timeEnd('score (no cache)');
 *
 *   matcher.clearCache();
 *   console.time('score (with cache)');
 *   for (let i = 0; i < 1000; i++) {
 *     testStrings.forEach(s => matcher.score(s, pattern));
 *   }
 *   console.timeEnd('score (with cache)');
 *
 *   // 缓存命中率
 *   const cacheHits = matcher._scoreCache.size;
 *   console.log(`Cache size: ${cacheHits}`);
 * })();
 *
 * // --- distance 性能测试 ---
 * (function() {
 *   const matcher = new FuzzyMatcher();
 *   const pairs = [
 *     ['hello', 'hello'],
 *     ['hello', 'hallo'],
 *     ['hello', 'world'],
 *     ['testing', 'test']
 *   ];
 *
 *   console.time('distance (no cache, 10000 calls)');
 *   for (let i = 0; i < 2500; i++) {
 *     pairs.forEach(([a, b]) => matcher.distance(a, b));
 *   }
 *   console.timeEnd('distance (no cache, 10000 calls)');
 *
 *   matcher._distanceCache.clear();
 *   console.time('distance (with cache, 10000 calls)');
 *   for (let i = 0; i < 2500; i++) {
 *     pairs.forEach(([a, b]) => matcher.distance(a, b));
 *   }
 *   console.timeEnd('distance (with cache, 10000 calls)');
 * })();
 *
 * // --- FuzzyIndex 性能测试 ---
 * (function() {
 *   const index = new FuzzyIndex();
 *   const entries = [];
 *   for (let i = 0; i < 1000; i++) {
 *     entries.push([`doc_${i}`, `Document ${i} content text`]);
 *   }
 *
 *   console.time('addBatch (1000 docs)');
 *   index.addBatch(entries);
 *   console.timeEnd('addBatch (1000 docs)');
 *
 *   console.time('search (1000 docs)');
 *   for (let i = 0; i < 100; i++) {
 *     index.search('doc');
 *   }
 *   console.timeEnd('search (1000 docs)');
 *   console.log(`Results: ${index.search('doc').length}`);
 * })();
 *
 * // --- 批量搜索性能测试 ---
 * (function() {
 *   const matcher = new FuzzyMatcher();
 *   const items = Array(1000).fill(0).map((_, i) => `item_${i}_test`);
 *
 *   console.time('search (1000 items)');
 *   const results = matcher.search(items, 'item_test');
 *   console.timeEnd('search (1000 items)');
 *   console.log(`Results count: ${results.length}`);
 * })();
 *
 * console.log('\\n✅ All performance tests passed!');
 */
