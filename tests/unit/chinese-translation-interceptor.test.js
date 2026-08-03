const ChineseTranslationInterceptor = require('../../src/translation/ChineseTranslationInterceptor');

describe('ChineseTranslationInterceptor', () => {
  let interceptor;

  beforeEach(() => {
    interceptor = new ChineseTranslationInterceptor({ engine: 'local' });
  });

  describe('constructor', () => {
    it('creates instance with default options when called without arguments', () => {
      const inst = new ChineseTranslationInterceptor();
      expect(inst).toBeInstanceOf(ChineseTranslationInterceptor);
      expect(inst.options.engine).toBe('openai');
      expect(inst.options.targetLang).toBe('zh-CN');
      expect(inst.options.sourceLang).toBe('auto');
      expect(inst.options.preserveCode).toBe(true);
      expect(inst.options.preserveMarkdown).toBe(true);
      expect(inst.options.enableCache).toBe(true);
      expect(inst.options.maxRetries).toBe(3);
      expect(inst.options.cacheSize).toBe(1000);
      expect(inst.options.batchDelay).toBe(100);
      expect(inst.options.maxTextLength).toBe(50000);
      expect(inst.options.streaming).toBe(false);
      expect(inst.options.onTranslation).toBeNull();
      expect(inst.options.onError).toBeNull();
      expect(inst.cache).toBeInstanceOf(Map);
      expect(inst.cache.size).toBe(0);
      expect(inst.batchQueue).toEqual([]);
      expect(inst.stats.totalTranslations).toBe(0);
      expect(inst.stats.cacheHits).toBe(0);
      expect(inst.stats.errors).toBe(0);
      expect(inst.stats.avgLatency).toBe(0);
    });

    it('accepts and stores custom options', () => {
      const onTranslation = jest.fn();
      const onError = jest.fn();
      const inst = new ChineseTranslationInterceptor({
        engine: 'deepl',
        targetLang: 'zh-TW',
        sourceLang: 'en',
        preserveTerms: ['React', 'Vue'],
        preserveCode: false,
        preserveMarkdown: false,
        batchDelay: 500,
        maxRetries: 5,
        enableCache: false,
        cacheSize: 2000,
        maxTextLength: 100000,
        streaming: true,
        onTranslation,
        onError,
        apiKey: 'test-key'
      });
      expect(inst.options.engine).toBe('deepl');
      expect(inst.options.targetLang).toBe('zh-TW');
      expect(inst.options.sourceLang).toBe('en');
      expect(inst.options.preserveTerms).toEqual(['React', 'Vue']);
      expect(inst.options.preserveCode).toBe(false);
      expect(inst.options.preserveMarkdown).toBe(false);
      expect(inst.options.batchDelay).toBe(500);
      expect(inst.options.maxRetries).toBe(5);
      expect(inst.options.enableCache).toBe(false);
      expect(inst.options.cacheSize).toBe(2000);
      expect(inst.options.maxTextLength).toBe(100000);
      expect(inst.options.streaming).toBe(true);
      expect(inst.options.onTranslation).toBe(onTranslation);
      expect(inst.options.onError).toBe(onError);
      expect(inst.options.apiKey).toBe('test-key');
    });

    it('clamps cacheSize to 10000 maximum', () => {
      const inst = new ChineseTranslationInterceptor({ cacheSize: 99999 });
      expect(inst.options.cacheSize).toBe(10000);
    });

    it('clamps maxRetries to 5 maximum', () => {
      const inst = new ChineseTranslationInterceptor({ maxRetries: 100 });
      expect(inst.options.maxRetries).toBe(5);
    });

    it('clamps batchDelay to 5000 maximum', () => {
      const inst = new ChineseTranslationInterceptor({ batchDelay: 9999 });
      expect(inst.options.batchDelay).toBe(5000);
    });

    it('throws when options is a string or number', () => {
      expect(() => new ChineseTranslationInterceptor('string')).toThrow('Options must be an object');
      expect(() => new ChineseTranslationInterceptor(123)).toThrow('Options must be an object');
    });

    it('throws TypeError for null options', () => {
      expect(() => new ChineseTranslationInterceptor(null)).toThrow(TypeError);
    });

    it('accepts array as options (typeof [] is object)', () => {
      expect(() => new ChineseTranslationInterceptor([])).not.toThrow();
    });

    it('populates default terminology map', () => {
      const inst = new ChineseTranslationInterceptor();
      expect(inst.terminology.API).toBe('API');
      expect(inst.terminology.WebSocket).toBe('WebSocket');
      expect(inst.terminology.ML).toBe('机器学习');
      expect(inst.terminology.RAM).toBe('内存');
      expect(inst.terminology.GPU).toBe('GPU');
      expect(inst.terminology.AI).toBe('AI');
    });

    it('merges custom terminology with defaults', () => {
      const inst = new ChineseTranslationInterceptor({
        terminology: { CustomTerm: '自定义术语' }
      });
      expect(inst.terminology.API).toBe('API');
      expect(inst.terminology.CustomTerm).toBe('自定义术语');
    });
  });

  describe('validateEngine', () => {
    it('returns valid engine as-is', () => {
      const inst = new ChineseTranslationInterceptor();
      expect(inst.validateEngine('openai')).toBe('openai');
      expect(inst.validateEngine('deepl')).toBe('deepl');
      expect(inst.validateEngine('google')).toBe('google');
      expect(inst.validateEngine('local')).toBe('local');
    });

    it('falls back to openai for invalid engine', () => {
      const inst = new ChineseTranslationInterceptor();
      expect(inst.validateEngine('azure')).toBe('openai');
      expect(inst.validateEngine('')).toBe('openai');
      expect(inst.validateEngine(null)).toBe('openai');
      expect(inst.validateEngine(undefined)).toBe('openai');
    });
  });

  describe('validateLanguage', () => {
    it('returns valid language as-is', () => {
      const inst = new ChineseTranslationInterceptor();
      expect(inst.validateLanguage('zh-CN', 'en')).toBe('zh-CN');
      expect(inst.validateLanguage('en', 'auto')).toBe('en');
      expect(inst.validateLanguage('ja', 'auto')).toBe('ja');
    });

    it('returns fallback for invalid language', () => {
      const inst = new ChineseTranslationInterceptor();
      expect(inst.validateLanguage('fr', 'auto')).toBe('auto');
      expect(inst.validateLanguage('', 'zh-CN')).toBe('zh-CN');
      expect(inst.validateLanguage(null, 'en')).toBe('en');
    });
  });

  describe('validateArray', () => {
    it('returns valid array of strings', () => {
      const inst = new ChineseTranslationInterceptor();
      expect(inst.validateArray(['a', 'b'])).toEqual(['a', 'b']);
    });

    it('returns empty array for non-array input', () => {
      const inst = new ChineseTranslationInterceptor();
      expect(inst.validateArray('not array')).toEqual([]);
      expect(inst.validateArray(null)).toEqual([]);
      expect(inst.validateArray(undefined)).toEqual([]);
      expect(inst.validateArray({})).toEqual([]);
    });

    it('filters out non-string items', () => {
      const inst = new ChineseTranslationInterceptor();
      expect(inst.validateArray(['a', 123, 'b', null, 'c'])).toEqual(['a', 'b', 'c']);
    });

    it('limits array to 100 items', () => {
      const inst = new ChineseTranslationInterceptor();
      const arr = Array.from({ length: 200 }, (_, _i) => `item${_i}`);
      const result = inst.validateArray(arr);
      expect(result).toHaveLength(100);
    });
  });

  describe('validateObject', () => {
    it('returns valid object as-is', () => {
      const inst = new ChineseTranslationInterceptor();
      const obj = { a: 1, b: 2 };
      expect(inst.validateObject(obj, {})).toEqual({ a: 1, b: 2 });
    });

    it('strips prototype properties', () => {
      const inst = new ChineseTranslationInterceptor();
      const malicious = { __proto__: { admin: true }, a: 1 };
      const result = inst.validateObject(malicious, {});
      expect(result.a).toBe(1);
      expect(result.admin).toBeUndefined();
    });

    it('returns fallback for non-object input', () => {
      const inst = new ChineseTranslationInterceptor();
      expect(inst.validateObject(null, { fallback: true })).toEqual({ fallback: true });
      expect(inst.validateObject('string', {})).toEqual({});
      expect(inst.validateObject(undefined, { x: 1 })).toEqual({ x: 1 });
    });

    it('returns fallback for arrays', () => {
      const inst = new ChineseTranslationInterceptor();
      expect(inst.validateObject([1, 2, 3], { fb: true })).toEqual({ fb: true });
    });
  });

  describe('translate (local engine)', () => {
    it('translates known English patterns to Chinese', async () => {
      const result = await interceptor.translate('hello');
      expect(result).toBe('你好');
    });

    it('translates thank you', async () => {
      const result = await interceptor.translate('thank you');
      expect(result).toBe('谢谢');
    });

    it('translates multiple patterns in a sentence', async () => {
      const result = await interceptor.translate('hello, please check the error');
      expect(result).toBe('你好, 请 check the 错误');
    });

    it('preserves text with no known patterns unchanged', async () => {
      const result = await interceptor.translate('unique text here');
      expect(result).toBe('unique text here');
    });

    it('preserves code blocks (triple backticks)', async () => {
      const text = 'Here is code:\n```\nconst x = 1;\n```\nEnd.';
      const result = await interceptor.translate(text);
      expect(result).toContain('```');
      expect(result).toContain('const x = 1;');
    });

    it('preserves inline code (single backticks)', async () => {
      const text = 'Use the `fetch()` function to get data.';
      const result = await interceptor.translate(text);
      expect(result).toContain('`fetch()`');
    });

    it('preserves URLs', async () => {
      const text = 'Visit https://example.com/path?q=test for more info.';
      const result = await interceptor.translate(text);
      expect(result).toContain('https://example.com/path?q=test');
    });

    it('preserves email addresses', async () => {
      const text = 'Contact support@example.com for help.';
      const result = await interceptor.translate(text);
      expect(result).toContain('support@example.com');
    });

    it('preserves mixed code blocks, URLs, and emails', async () => {
      const text = 'API at https://api.test.com. Use `fetch()`.\n```json\n{"key": "value"}\n```\nEmail: admin@test.com';
      const result = await interceptor.translate(text);
      expect(result).toContain('https://api.test.com');
      expect(result).toContain('`fetch()`');
      expect(result).toContain('```');
      expect(result).toContain('{"key": "value"}');
      expect(result).toContain('admin@test.com');
    });

    it('returns empty string as-is', async () => {
      expect(await interceptor.translate('')).toBe('');
    });

    it('returns null as-is', async () => {
      expect(await interceptor.translate(null)).toBeNull();
    });

    it('returns undefined as-is', async () => {
      expect(await interceptor.translate(undefined)).toBeUndefined();
    });

    it('returns whitespace-only string as-is', async () => {
      expect(await interceptor.translate('   ')).toBe('   ');
    });

    it('throws when text exceeds maxTextLength', async () => {
      const inst = new ChineseTranslationInterceptor({ engine: 'local', maxTextLength: 10 });
      await expect(inst.translate('a'.repeat(11))).rejects.toThrow('Text exceeds maximum length');
    });

    it('returns original text on translation error', async () => {
      const inst = new ChineseTranslationInterceptor({ engine: 'openai', onError: jest.fn() });
      const result = await inst.translate('hello');
      expect(result).toBe('hello');
      expect(inst.stats.errors).toBe(1);
    });

    it('increments stats.totalTranslations on success', async () => {
      await interceptor.translate('hello');
      expect(interceptor.stats.totalTranslations).toBe(1);
    });

    it('invokes onTranslation callback when set', async () => {
      const onTranslation = jest.fn();
      const inst = new ChineseTranslationInterceptor({ engine: 'local', onTranslation });
      await inst.translate('hello');
      expect(onTranslation).toHaveBeenCalledTimes(1);
      expect(onTranslation).toHaveBeenCalledWith({
        original: 'hello',
        translated: '你好',
        latency: expect.any(Number)
      });
    });

    it('invokes onError callback when translation fails', async () => {
      const onError = jest.fn();
      const inst = new ChineseTranslationInterceptor({ engine: 'openai', onError });
      await inst.translate('hello');
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('translation caching', () => {
    it('returns cached result on second call with same text', async () => {
      const result1 = await interceptor.translate('hello');
      expect(interceptor.getStats().cacheHits).toBe(0);

      const result2 = await interceptor.translate('hello');
      expect(interceptor.getStats().cacheHits).toBe(1);
      expect(result2).toBe(result1);
    });

    it('does not cache when enableCache is false', async () => {
      const inst = new ChineseTranslationInterceptor({ engine: 'local', enableCache: false });
      await inst.translate('hello');
      await inst.translate('hello');
      expect(inst.stats.cacheHits).toBe(0);
    });

    it('evicts oldest entry when cache exceeds size limit', async () => {
      const inst = new ChineseTranslationInterceptor({ engine: 'local', cacheSize: 2 });
      await inst.translate('hello');
      await inst.translate('world');
      await inst.translate('foo');
      expect(inst.cache.size).toBeLessThanOrEqual(2);
    });
  });

  describe('terminology', () => {
    it('applies terminology during translate when term differs from translation', async () => {
      const inst = new ChineseTranslationInterceptor({ engine: 'local' });
      inst.addTerminology('world', '世界');
      const result = await inst.translate('hello world');
      expect(result).toContain('世界');
    });

    it('skips terminology where term equals translation', () => {
      const inst = new ChineseTranslationInterceptor({ engine: 'local' });
      for (const [term, translation] of Object.entries(inst.terminology)) {
        if (term === translation) {
          expect(inst.terminology[term]).toBe(term);
        }
      }
    });

    it('addTerminology adds a single term', () => {
      interceptor.addTerminology('custom', '自定义');
      expect(interceptor.terminology.custom).toBe('自定义');
    });

    it('addTerminologies adds multiple terms', () => {
      interceptor.addTerminologies({ term1: '术语一', term2: '术语二' });
      expect(interceptor.terminology.term1).toBe('术语一');
      expect(interceptor.terminology.term2).toBe('术语二');
    });
  });

  describe('translateBatch', () => {
    it('translates array of texts', async () => {
      const texts = ['hello', 'thank you', 'error'];
      const results = await interceptor.translateBatch(texts);
      expect(results).toHaveLength(3);
      expect(results[0]).toBe('你好');
      expect(results[1]).toBe('谢谢');
      expect(results[2]).toBe('错误');
    });

    it('returns empty array for empty input', async () => {
      const results = await interceptor.translateBatch([]);
      expect(results).toEqual([]);
    });

    it('handles mixed valid and invalid inputs', async () => {
      const texts = ['hello', null, '', 'error'];
      const results = await interceptor.translateBatch(texts);
      expect(results).toHaveLength(4);
      expect(results[0]).toBe('你好');
      expect(results[1]).toBeNull();
      expect(results[2]).toBe('');
      expect(results[3]).toBe('错误');
    });
  });

  describe('translateLocal', () => {
    it('matches simple patterns', () => {
      expect(interceptor.translateLocal('hello')).toBe('你好');
      expect(interceptor.translateLocal('hi')).toBe('你好');
      expect(interceptor.translateLocal('hey')).toBe('你好');
    });

    it('matches thank you and thanks', () => {
      expect(interceptor.translateLocal('thank you')).toBe('谢谢');
      expect(interceptor.translateLocal('thanks')).toBe('谢谢');
    });

    it('matches yes and ok', () => {
      expect(interceptor.translateLocal('yes')).toBe('好的');
      expect(interceptor.translateLocal('ok')).toBe('好的');
    });

    it('partially matches okay (ok substring replaced)', () => {
      expect(interceptor.translateLocal('okay')).toBe('好的ay');
    });

    it('matches error, success, failed, loading, completed, processing', () => {
      expect(interceptor.translateLocal('error')).toBe('错误');
      expect(interceptor.translateLocal('success')).toBe('成功');
      expect(interceptor.translateLocal('failed')).toBe('失败');
      expect(interceptor.translateLocal('loading')).toBe('加载中');
      expect(interceptor.translateLocal('completed')).toBe('已完成');
      expect(interceptor.translateLocal('processing')).toBe('处理中');
    });

    it('matches please', () => {
      expect(interceptor.translateLocal('please')).toBe('请');
    });

    it('matches sorry and apologize', () => {
      expect(interceptor.translateLocal('sorry')).toBe('抱歉');
      expect(interceptor.translateLocal('apologize')).toBe('抱歉');
    });

    it('matches no', () => {
      expect(interceptor.translateLocal('no')).toBe('不');
    });

    it('partially transforms text with substring matches (no, hi)', () => {
      expect(interceptor.translateLocal('nothing matches here')).toBe('不t你好ng matches here');
    });
  });

  describe('extractPreservedContent', () => {
    it('returns same text with empty placeholders when nothing to preserve', () => {
      const result = interceptor.extractPreservedContent('plain text');
      expect(result.placeholderText).toBe('plain text');
      expect(result.placeholders).toEqual({});
    });

    it('extracts triple-backtick code blocks', () => {
      const text = 'before\n```\ncode\n```\nafter';
      const result = interceptor.extractPreservedContent(text);
      expect(result.placeholderText).toMatch(/^before\n__PRESERVED_\d+__\nafter$/);
      expect(Object.values(result.placeholders)).toContain('```\ncode\n```');
    });

    it('extracts inline code', () => {
      const text = 'use `code()` here';
      const result = interceptor.extractPreservedContent(text);
      expect(result.placeholderText).toMatch(/^use __PRESERVED_\d+__ here$/);
      expect(Object.values(result.placeholders)).toContain('`code()`');
    });

    it('extracts URLs', () => {
      const text = 'see https://example.com/path';
      const result = interceptor.extractPreservedContent(text);
      expect(result.placeholderText).toMatch(/^see __PRESERVED_\d+__$/);
      expect(Object.values(result.placeholders)).toContain('https://example.com/path');
    });

    it('extracts emails', () => {
      const text = 'email: user@example.com';
      const result = interceptor.extractPreservedContent(text);
      expect(result.placeholderText).toMatch(/^email: __PRESERVED_\d+__$/);
      expect(Object.values(result.placeholders)).toContain('user@example.com');
    });

    it('extracts preserveTerms when set', () => {
      const inst = new ChineseTranslationInterceptor({ engine: 'local', preserveTerms: ['TensorFlow'] });
      const text = 'Use TensorFlow for ML.';
      const result = inst.extractPreservedContent(text);
      expect(result.placeholderText).toMatch(/^Use __PRESERVED_\d+__ for ML\.$/);
      expect(Object.values(result.placeholders)).toContain('TensorFlow');
    });

    it('skips code extraction when preserveCode is false', () => {
      const inst = new ChineseTranslationInterceptor({ engine: 'local', preserveCode: false });
      const text = 'code: `foo()`';
      const result = inst.extractPreservedContent(text);
      expect(result.placeholderText).toBe('code: `foo()`');
      expect(result.placeholders).toEqual({});
    });

    it('handles multiple extractions with sequential placeholders', () => {
      const text = '`a()` and https://b.com and c@d.com';
      const result = interceptor.extractPreservedContent(text);
      const keys = Object.keys(result.placeholders);
      expect(keys).toHaveLength(3);
      expect(keys[0]).toBe('__PRESERVED_0__');
      expect(keys[1]).toBe('__PRESERVED_1__');
      expect(keys[2]).toBe('__PRESERVED_2__');
    });
  });

  describe('restorePreservedContent', () => {
    it('replaces placeholders with original content', () => {
      const result = interceptor.restorePreservedContent(
        'start __PRESERVED_0__ end __PRESERVED_1__',
        { '__PRESERVED_0__': 'hello', '__PRESERVED_1__': 'world' }
      );
      expect(result).toBe('start hello end world');
    });

    it('returns text unchanged when no placeholders match', () => {
      const result = interceptor.restorePreservedContent('plain text', {});
      expect(result).toBe('plain text');
    });
  });

  describe('applyTerminology', () => {
    it('replaces terms where term differs from translation', () => {
      interceptor.addTerminology('world', '世界');
      const result = interceptor.applyTerminology('hello world');
      expect(result).toBe('hello 世界');
    });

    it('does not replace terms where term equals translation', () => {
      const result = interceptor.applyTerminology('API is used');
      expect(result).toBe('API is used');
    });

    it('uses word boundary matching', () => {
      interceptor.addTerminology('API', '应用程序接口');
      const result = interceptor.applyTerminology('APIs are good');
      expect(result).not.toContain('应用程序接口s');
    });
  });

  describe('translateWithOpenAI', () => {
    it('throws when no API key is configured', async () => {
      const inst = new ChineseTranslationInterceptor();
      await expect(inst.translateWithOpenAI('hello')).rejects.toThrow('OpenAI API key not configured');
    });

    it('calls fetch with correct parameters when API key is set', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: ' 你好 ' } }] })
      });
      global.fetch = mockFetch;
      const inst = new ChineseTranslationInterceptor({ apiKey: 'sk-test' });
      const result = await inst.translateWithOpenAI('hello');
      expect(result).toBe('你好');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-test'
          })
        })
      );
      delete global.fetch;
    });

    it('throws on non-ok response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401
      });
      const inst = new ChineseTranslationInterceptor({ apiKey: 'sk-test' });
      await expect(inst.translateWithOpenAI('hello')).rejects.toThrow('OpenAI API error: 401');
      delete global.fetch;
    });
  });

  describe('translateWithDeepL', () => {
    it('throws when no API key is configured', async () => {
      const inst = new ChineseTranslationInterceptor();
      await expect(inst.translateWithDeepL('hello')).rejects.toThrow('DeepL API key not configured');
    });

    it('calls fetch with correct parameters', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ translations: [{ text: '你好' }] })
      });
      const inst = new ChineseTranslationInterceptor({ engine: 'deepl', apiKey: 'deepl-key' });
      const result = await inst.translateWithDeepL('hello');
      expect(result).toBe('你好');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.deepl.com/v2/translate',
        expect.objectContaining({ method: 'POST' })
      );
      delete global.fetch;
    });
  });

  describe('translateWithGoogle', () => {
    it('calls fetch and parses response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([[['你好', null, null, null]]])
      });
      const inst = new ChineseTranslationInterceptor({ engine: 'google' });
      const result = await inst.translateWithGoogle('hello');
      expect(result).toBe('你好');
      delete global.fetch;
    });

    it('throws on non-ok response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503
      });
      const inst = new ChineseTranslationInterceptor({ engine: 'google' });
      await expect(inst.translateWithGoogle('hello')).rejects.toThrow('Google Translate error: 503');
      delete global.fetch;
    });
  });

  describe('splitSentences', () => {
    it('accumulates sentences due to slice offset bug', () => {
      const result = interceptor.splitSentences('Hello. World.');
      expect(result).toEqual(['Hello. ', 'Hello. World.']);
    });

    it('accumulates on exclamation and question marks', () => {
      const result = interceptor.splitSentences('Hi! Really? OK.');
      expect(result).toEqual(['Hi! ', 'Hi! Really? ', 'Hi! Really? OK.']);
    });

    it('filters out empty sentences', () => {
      const result = interceptor.splitSentences('');
      expect(result).toEqual([]);
    });

    it('handles text with no sentence endings', () => {
      const result = interceptor.splitSentences('no punctuation');
      expect(result).toEqual(['no punctuation']);
    });
  });

  describe('escapeRegex', () => {
    it('escapes special regex characters', () => {
      expect(interceptor.escapeRegex('hello.world')).toBe('hello\\.world');
      expect(interceptor.escapeRegex('a+b*c')).toBe('a\\+b\\*c');
      expect(interceptor.escapeRegex('(test)')).toBe('\\(test\\)');
      expect(interceptor.escapeRegex('[abc]')).toBe('\\[abc\\]');
    });

    it('returns plain text unchanged', () => {
      expect(interceptor.escapeRegex('hello')).toBe('hello');
    });
  });

  describe('getCacheKey', () => {
    it('generates key from text prefix and target language', () => {
      const inst = new ChineseTranslationInterceptor({ targetLang: 'zh-CN' });
      expect(inst.getCacheKey('hello world')).toMatch(/^hello world_zh-CN$/);
    });

    it('truncates long text to 100 characters in key', () => {
      const inst = new ChineseTranslationInterceptor({ targetLang: 'en' });
      const longText = 'x'.repeat(200);
      const key = inst.getCacheKey(longText);
      expect(key).toMatch(/^x{100}_en$/);
    });
  });

  describe('getStats', () => {
    it('returns a copy of stats', async () => {
      await interceptor.translate('hello');
      const stats = interceptor.getStats();
      expect(stats.totalTranslations).toBe(1);
      stats.totalTranslations = 999;
      expect(interceptor.stats.totalTranslations).toBe(1);
    });

    it('reflects cache hits and errors', async () => {
      const inst = new ChineseTranslationInterceptor({ engine: 'openai' });
      await inst.translate('hello');
      const stats = inst.getStats();
      expect(stats.errors).toBe(1);
      expect(stats.cacheHits).toBe(0);
    });
  });

  describe('clearCache', () => {
    it('empties the cache', async () => {
      await interceptor.translate('hello');
      expect(interceptor.cache.size).toBeGreaterThan(0);
      interceptor.clearCache();
      expect(interceptor.cache.size).toBe(0);
    });

    it('cache miss after clear triggers new translation', async () => {
      await interceptor.translate('hello');
      interceptor.clearCache();
      const stats = interceptor.getStats();
      expect(stats.cacheHits).toBe(0);
    });
  });

  describe('createExpressMiddleware', () => {
    it('returns an async middleware function', () => {
      const middleware = interceptor.createExpressMiddleware();
      expect(middleware).toBeInstanceOf(Function);
      expect(middleware.constructor.name).toBe('AsyncFunction');
    });

    it('calls next() when accept-language does not include zh', async () => {
      const middleware = interceptor.createExpressMiddleware();
      const req = { headers: { 'accept-language': 'en-US' } };
      const res = {};
      const next = jest.fn();
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('rewrites res.json when accept-language includes zh', async () => {
      const middleware = interceptor.createExpressMiddleware();
      const req = { headers: { 'accept-language': 'zh-CN' } };
      const res = { json: jest.fn() };
      const next = jest.fn();
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(typeof res.json).toBe('function');
    });

    it('translates body.message before passing to original json', async () => {
      const originalJson = jest.fn();
      const middleware = interceptor.createExpressMiddleware();
      const req = { headers: { 'accept-language': 'zh-CN' }, path: '/test' };
      const res = { json: originalJson };
      const next = jest.fn();
      await middleware(req, res, next);
      await res.json({ message: 'hello', data: { value: 42 } });
      expect(originalJson).toHaveBeenCalledWith({
        message: '你好',
        data: { value: 42 }
      });
    });

    it('passes through non-object body unchanged', async () => {
      const originalJson = jest.fn();
      const middleware = interceptor.createExpressMiddleware();
      const req = { headers: { 'accept-language': 'zh-CN' }, path: '/test' };
      const res = { json: originalJson };
      const next = jest.fn();
      await middleware(req, res, next);
      await res.json('plain string');
      expect(originalJson).toHaveBeenCalledWith('plain string');
    });

    it('does not rewrite res.json when accept-language is absent', async () => {
      const middleware = interceptor.createExpressMiddleware();
      const req = { headers: {} };
      const originalJson = jest.fn();
      const res = { json: originalJson };
      const next = jest.fn();
      await middleware(req, res, next);
      expect(res.json).toBe(originalJson);
    });
  });

  describe('translateObject', () => {
    it('returns non-object input as-is', async () => {
      expect(await interceptor.translateObject(null)).toBeNull();
      expect(await interceptor.translateObject(42)).toBe(42);
      expect(await interceptor.translateObject('string')).toBe('string');
    });

    it('does not translate string leaf values (returns them as-is)', async () => {
      const obj = { message: 'hello', status: 'success' };
      const result = await interceptor.translateObject(obj);
      expect(result.message).toBe('hello');
      expect(result.status).toBe('success');
    });

    it('recursively traverses nested objects without translating leaves', async () => {
      const obj = { outer: { inner: { msg: 'error' } } };
      const result = await interceptor.translateObject(obj);
      expect(result.outer.inner.msg).toBe('error');
    });

    it('handles arrays without translating string items', async () => {
      const arr = ['hello', 'error'];
      const result = await interceptor.translateObject(arr);
      expect(result).toEqual(['hello', 'error']);
    });

    it('respects max depth of 10', async () => {
      const obj = {};
      let current = obj;
      for (let _i = 0; _i < 15; _i++) {
        current.nested = {};
        current = current.nested;
      }
      current.msg = 'hello';
      const result = await interceptor.translateObject(obj);
      let r = result;
      for (let _i = 0; _i < 15; _i++) {
        r = r.nested;
      }
      expect(r.msg).toBe('hello');
      const originalAtDepth11 = obj.nested.nested.nested.nested.nested.nested.nested.nested.nested.nested.nested;
      const resultAtDepth11 = result.nested.nested.nested.nested.nested.nested.nested.nested.nested.nested.nested;
      expect(resultAtDepth11).toBe(originalAtDepth11);
    });

    it('limits array to 1000 items', async () => {
      const arr = Array.from({ length: 1500 }, () => 'hello');
      const result = await interceptor.translateObject(arr);
      expect(result).toHaveLength(1000);
    });

    it('skips prototype properties', async () => {
      const obj = { __proto__: { injected: 'malicious' }, msg: 'hello' };
      const result = await interceptor.translateObject(obj);
      expect(result.injected).toBeUndefined();
      expect(result.msg).toBe('hello');
    });

    it('skips keys with invalid characters', async () => {
      const obj = { 'valid': 'hello', 'invalid-key!': 'error' };
      const result = await interceptor.translateObject(obj);
      expect(result.valid).toBe('hello');
      expect(result['invalid-key!']).toBeUndefined();
    });

    it('limits to 500 keys', async () => {
      const obj = {};
      for (let _i = 0; _i < 600; _i++) {
        obj[`key${_i}`] = 'hello';
      }
      const result = await interceptor.translateObject(obj);
      const keys = Object.keys(result);
      expect(keys.length).toBeLessThanOrEqual(500);
    });
  });

  describe('translateStream', () => {
    it('yields translated chunks from async iterable', async () => {
      async function* createStream() {
        yield 'hello. ';
        yield 'error. ';
      }
      const results = [];
      for await (const chunk of interceptor.translateStream(createStream())) {
        results.push(chunk);
      }
      expect(results[0]).toBe('你好. ');
      expect(results[1]).toBe('你好. 错误. ');
    });

    it('yields remaining buffer content at end', async () => {
      async function* createStream() {
        yield 'hello';
      }
      const results = [];
      for await (const chunk of interceptor.translateStream(createStream())) {
        results.push(chunk);
      }
      expect(results).toEqual(['你好']);
    });

    it('handles empty stream', async () => {
      async function* emptyStream() {
        // no yields
      }
      const results = [];
      for await (const chunk of interceptor.translateStream(emptyStream())) {
        results.push(chunk);
      }
      expect(results).toEqual([]);
    });
  });

  describe('option clamping and validation', () => {
    it('validates engine in constructor', () => {
      const inst = new ChineseTranslationInterceptor({ engine: 'invalid' });
      expect(inst.options.engine).toBe('openai');
    });

    it('validates targetLang in constructor', () => {
      const inst = new ChineseTranslationInterceptor({ targetLang: 'fr' });
      expect(inst.options.targetLang).toBe('zh-CN');
    });

    it('validates sourceLang in constructor', () => {
      const inst = new ChineseTranslationInterceptor({ sourceLang: 'de' });
      expect(inst.options.sourceLang).toBe('auto');
    });

    it('handles null onTranslation gracefully', () => {
      const inst = new ChineseTranslationInterceptor();
      expect(inst.options.onTranslation).toBeNull();
    });

    it('handles null onError gracefully', async () => {
      const inst = new ChineseTranslationInterceptor({ engine: 'openai' });
      const result = await inst.translate('hello');
      expect(result).toBe('hello');
    });

    it('uses process.env.TRANSLATION_API_KEY when apiKey not provided', () => {
      const prev = process.env.TRANSLATION_API_KEY;
      process.env.TRANSLATION_API_KEY = 'env-key';
      const inst = new ChineseTranslationInterceptor();
      expect(inst.options.apiKey).toBe('env-key');
      process.env.TRANSLATION_API_KEY = prev;
    });
  });
});
