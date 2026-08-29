const BrainSystem = require('../../src/core/BrainSystem');
const SmartMemory = require('../../src/core/SmartMemory');

jest.mock('../../src/core/MetaCognition', () => jest.fn().mockImplementation(() => ({
  analyze: jest.fn().mockReturnValue({ questions: [], score: 0.5 }),
  getAnalysis: jest.fn().mockReturnValue({}),
  addKnowledge: jest.fn(),
  getKnowledge: jest.fn().mockReturnValue([]),
  analyzePattern: jest.fn().mockReturnValue({}),
  identifyGap: jest.fn().mockReturnValue(null),
  suggestImprovement: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({}),
  getStatus: jest.fn().mockReturnValue('ok')
})));
jest.mock('../../src/core/Thinking', () => jest.fn().mockImplementation(() => ({
  think: jest.fn().mockReturnValue({ perspectives: [], conclusion: '' }),
  solve: jest.fn().mockReturnValue({ solution: '' }),
  combinePerspectives: jest.fn().mockReturnValue([]),
  calculateConfidence: jest.fn().mockReturnValue(0.5),
  question: jest.fn().mockReturnValue(''),
  associate: jest.fn().mockReturnValue([]),
  reverseEngineer: jest.fn().mockReturnValue({}),
  orangePractice: jest.fn().mockReturnValue({})
})));
jest.mock('../../src/core/Evolution', () => jest.fn().mockImplementation(() => ({
  record: jest.fn(),
  getHistory: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({}),
  adjustStrategy: jest.fn(),
  evolve: jest.fn()
})));
jest.mock('../../src/core/ReverseThinking', () => jest.fn().mockImplementation(() => ({
  analyze: jest.fn().mockReturnValue({ reverse: true }),
  getInsights: jest.fn().mockReturnValue([])
})));
jest.mock('../../src/core/ToolManager', () => jest.fn().mockImplementation(() => ({
  register: jest.fn(),
  get: jest.fn().mockReturnValue(null),
  list: jest.fn().mockReturnValue([]),
  selectTools: jest.fn().mockReturnValue([]),
  execute: jest.fn(),
  compose: jest.fn()
})));
jest.mock('../../src/core/LessonLibrary', () => jest.fn().mockImplementation(() => {
  const lessons = [];
  return {
    lessons,
    search: jest.fn().mockReturnValue([]),
    get: jest.fn().mockReturnValue(null),
    add: jest.fn().mockImplementation(l => { lessons.push(l); return l; }),
    markApplied: jest.fn(),
    getSuggestions: jest.fn().mockReturnValue([]),
    getRelated: jest.fn().mockReturnValue([]),
    getStats: jest.fn().mockReturnValue({ total: 0, applied: 0 }),
    export: jest.fn().mockReturnValue('[]'),
    categories: {}
  };
}));

describe('SmartMemory (via BrainSystem static methods)', () => {
  beforeEach(() => {
    BrainSystem.BrainSystem._smartMemory = null;
  });

  test('smartStore stores a value', () => {
    const result = BrainSystem.smartStore('testKey', { data: 'hello' });
    expect(result).toBeDefined();
  });

  test('smartSearch retrieves stored value', () => {
    BrainSystem.smartStore('searchKey', { data: 'world' });
    const results = BrainSystem.smartSearch('searchKey');
    expect(Array.isArray(results)).toBe(true);
  });

  test('smartStore with metadata', () => {
    const result = BrainSystem.smartStore('metaKey', 'value', { tags: ['test'] });
    expect(result).toBeDefined();
  });

  test('smartSearch with limit', () => {
    BrainSystem.smartStore('lim1', 'a');
    BrainSystem.smartStore('lim2', 'b');
    const results = BrainSystem.smartSearch('lim', 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  test('smartSearch returns empty for no match', () => {
    const results = BrainSystem.smartSearch('nonexistent_xyz_abc');
    expect(results).toEqual([]);
  });
});

describe('SmartMemory (direct class)', () => {
  let memory;

  beforeEach(() => {
    jest.clearAllMocks();
    memory = new SmartMemory();
  });

  test('constructor initializes empty state', () => {
    expect(memory._memories).toEqual([]);
    expect(memory._index).toEqual({});
    expect(memory._maxSize).toBe(100);
  });

  test('store adds memory and returns result', () => {
    const result = memory.store('key1', 'value1');
    expect(result).toEqual({ stored: true, key: 'key1' });
    expect(memory._memories).toHaveLength(1);
  });

  test('store evicts oldest when over max size', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-12T00:00:00'));
    memory._maxSize = 2;
    memory.store('a', 'va');
    jest.setSystemTime(new Date('2026-08-12T00:00:01'));
    memory.store('b', 'vb');
    jest.setSystemTime(new Date('2026-08-12T00:00:02'));
    memory.store('c', 'vc');
    jest.useRealTimers();
    expect(memory._memories).toHaveLength(2);
    expect(memory._memories[0].key).toBe('b');
    expect(memory._memories[1].key).toBe('c');
    expect(Object.keys(memory._index)).toHaveLength(2);
  });

  test('search scores key matches higher than value matches', () => {
    memory.store('alpha', 'beta');
    memory.store('gamma', 'alpha');
    const results = memory.search('alpha');
    const alphaKey = results.find((r) => r.key === 'alpha');
    const alphaValue = results.find((r) => r.key === 'gamma');
    expect(alphaKey.score).toBeGreaterThan(alphaValue.score);
  });

  test('search skips single-character query words', () => {
    memory.store('alpha', 'beta');
    const results = memory.search('a alpha');
    expect(results.some((r) => r.key === 'alpha')).toBe(true);
  });

  test('search matches value only', () => {
    memory.store('key1', 'needle-in-value');
    const results = memory.search('needle');
    expect(results.some((r) => r.key === 'key1')).toBe(true);
  });

  test('search returns empty when no words score', () => {
    memory.store('key1', 'value1');
    const results = memory.search('zzz');
    expect(results).toEqual([]);
  });

  test('getRecent returns last N memories', () => {
    memory.store('a', '1');
    memory.store('b', '2');
    memory.store('c', '3');
    const recent = memory.getRecent(2);
    expect(recent.map((m) => m.key)).toEqual(['b', 'c']);
  });

  test('getRecent uses default limit of 10', () => {
    memory.store('a', '1');
    const recent = memory.getRecent();
    expect(recent).toHaveLength(1);
  });

  test('getKeys returns all keys', () => {
    memory.store('a', '1');
    memory.store('b', '2');
    expect(memory.getKeys()).toEqual(['a', 'b']);
  });

  test('_extractTags extracts known keywords', () => {
    const tags = memory._extractTags('fix the bug in the function code');
    expect(tags).toContain('fix');
    expect(tags).toContain('bug');
    expect(tags).toContain('function');
    expect(tags).toContain('code');
  });

  test('_extractTags returns empty for no keywords', () => {
    expect(memory._extractTags('unrelated words')).toEqual([]);
  });

  test('getStats returns total and keys', () => {
    memory.store('a', '1');
    memory.store('b', '2');
    const stats = memory.getStats();
    expect(stats.total).toBe(2);
    expect(stats.keys).toEqual(['a', 'b']);
  });

  test('_hydrateSmartMemory reloads persisted items from disk', () => {
    jest.isolateModules(() => {
      jest.mock('../../src/core/EvolutionPersistence', () => ({
        load: jest.fn().mockReturnValue({
          items: [
            { key: 'k1', value: 'v1', metadata: { tag: 'x' } },
            { key: 'k2', value: { nested: true }, metadata: {} }
          ]
        }),
        save: jest.fn().mockReturnValue(true),
        append: jest.fn().mockReturnValue(true),
        init: jest.fn()
      }));
      const BS = require('../../src/core/BrainSystem');
      BS.BrainSystem._smartMemory = null;
      BS.BrainSystem._smartMemoryHydrated = false;
      const mem = BS.BrainSystem._hydrateSmartMemory();
      const results = BS.smartSearch('k1', 5);
      expect(mem).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].key).toBe('k1');
    });
  });

  test('_hydrateSmartMemory starts empty when load fails', () => {
    jest.isolateModules(() => {
      jest.mock('../../src/core/EvolutionPersistence', () => ({
        load: jest.fn().mockImplementation(() => { throw new Error('disk error'); }),
        save: jest.fn().mockReturnValue(true),
        append: jest.fn().mockReturnValue(true),
        init: jest.fn()
      }));
      const BS = require('../../src/core/BrainSystem');
      BS.BrainSystem._smartMemory = null;
      BS.BrainSystem._smartMemoryHydrated = false;
      const mem = BS.BrainSystem._hydrateSmartMemory();
      expect(mem.getStats().total).toBe(0);
    });
  });

  describe('SmartMemory semanticSearch', () => {
    test('returns keyword results when embedder not provided', async () => {
      const memory = new SmartMemory();
      memory.store('k1', 'alpha beta');
      const results = await memory.semanticSearch('alpha', 5, null);
      expect(results.length).toBe(1);
    });

    test('ranks by semantic similarity via embedder', async () => {
      const memory = new SmartMemory();
      memory.store('profile_李雷', { name: '李雷', 职业: '支付系统后端工程师' });
      memory.store('unrelated', { name: '测试', 职业: '园艺师' });
      // mock embedder: 返回简单的确定性向量，'支付系统后端工程师' 与 '优化代码性能' 更接近
      const embedder = jest.fn((text) => {
        const t = String(text);
        if (t.includes('支付') || t.includes('优化')) { return [1, 0, 0]; }
        return [0, 1, 0];
      });
      const results = await memory.semanticSearch('优化代码性能', 5, embedder);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].key).toBe('profile_李雷');
    });

    test('falls back to keyword search when embedder throws', async () => {
      const memory = new SmartMemory();
      memory.store('k1', 'alpha beta');
      const embedder = jest.fn(() => { throw new Error('embed down'); });
      const results = await memory.semanticSearch('alpha', 5, embedder);
      expect(results.length).toBe(1);
    });

    test('falls back to keyword search when similarity too low', async () => {
      const memory = new SmartMemory();
      memory.store('k1', 'unrelated content');
      // query 向量与记忆向量正交 (cosine = 0 < 0.3) → 语义分低 → 降级关键词 (也不命中)
      const embedder = jest.fn((text) => {
        const t = String(text);
        return t.includes('alpha') ? [1, 0] : [0, 1];
      });
      const results = await memory.semanticSearch('alpha', 5, embedder);
      expect(results.length).toBe(0);
    });
  });
});
