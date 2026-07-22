const ToolManager = require('../../src/core/ToolManager');

describe('ToolManager', () => {
  let tm;

  beforeEach(() => {
    tm = new ToolManager();
  });

  describe('constructor', () => {
    it('registers 5 built-in tools', () => {
      expect(tm.tools.size).toBe(5);
      expect(tm.tools.has('search')).toBe(true);
      expect(tm.tools.has('grep')).toBe(true);
    });
  });

  describe('register', () => {
    it('registers a custom tool', () => {
      tm.register({
        id: 'custom',
        name: 'Custom',
        description: 'test',
        category: 'test',
        keywords: ['custom'],
        async execute() { return {}; }
      });
      expect(tm.tools.size).toBe(6);
      expect(tm.tools.get('custom').usageCount).toBe(0);
    });
  });

  describe('selectTools', () => {
    it('returns tools matching context keywords', () => {
      const selected = tm.selectTools('need to search something');
      expect(selected).toHaveLength(1);
      expect(selected[0].id).toBe('search');
    });

    it('returns multiple matches when applicable', () => {
      const selected = tm.selectTools('search and debug code');
      const ids = selected.map(s => s.id);
      expect(ids).toContain('search');
      expect(ids).toContain('debug');
    });

    it('returns empty when no match', () => {
      expect(tm.selectTools('irrelevant')).toEqual([]);
    });

    it('prioritizes high-usage tools', () => {
      tm.tools.get('search').usageCount = 10;
      const selected = tm.selectTools('find something');
      expect(selected[0].priority).toBe('high');
    });

    it('sorts by priority correctly', () => {
      tm.tools.get('glob').usageCount = 10;
      const selected = tm.selectTools('find something');
      expect(selected[0].id).toBe('glob');
      expect(selected[0].priority).toBe('high');
    });
  });

  describe('execute', () => {
    it('executes a tool and records usage', async () => {
      const result = await tm.execute('search', { query: 'test' });
      expect(result.success).toBe(true);
      expect(result.result.result).toContain('test');
      expect(tm.tools.get('search').usageCount).toBe(1);
    });

    it('fails for non-existent tool', async () => {
      const result = await tm.execute('ghost', {});
      expect(result.success).toBe(false);
    });

    it('records execution history', async () => {
      await tm.execute('search', { query: 'x' });
      expect(tm.history).toHaveLength(1);
      expect(tm.history[0].toolId).toBe('search');
      expect(tm.history[0].success).toBe(true);
    });

    it('executes read tool', async () => {
      const result = await tm.execute('read', { target: 'file.txt' });
      expect(result.success).toBe(true);
      expect(result.result.result).toContain('file.txt');
    });

    it('executes debug tool', async () => {
      const result = await tm.execute('debug', { target: 'bug' });
      expect(result.success).toBe(true);
      expect(result.result.result).toContain('bug');
    });

    it('executes grep tool', async () => {
      const result = await tm.execute('grep', { pattern: 'foo' });
      expect(result.success).toBe(true);
      expect(result.result.result).toContain('foo');
    });

    it('executes glob tool', async () => {
      const result = await tm.execute('glob', { pattern: '*.js' });
      expect(result.success).toBe(true);
      expect(result.result.result).toContain('*.js');
    });

    it('handles tool execution error', async () => {
      tm.register({
        id: 'broken',
        name: 'Broken',
        description: 'always throws',
        category: 'test',
        keywords: ['broken'],
        async execute() { throw new Error('fail'); }
      });
      const result = await tm.execute('broken', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('fail');
    });
  });

  describe('compose', () => {
    it('returns composed tool chain', () => {
      const result = tm.compose(['search', 'debug'], {});
      expect(result.type).toBe('composed');
      expect(result.tools).toHaveLength(2);
    });

    it('compose falls back to id for unknown tool', () => {
      const result = tm.compose(['unknown-tool'], {});
      expect(result.tools[0].name).toBe('unknown-tool');
    });
  });

  describe('recommendCombination', () => {
    it('recommends code analysis for code context', () => {
      const rec = tm.recommendCombination('fix code');
      expect(rec.recommended).toEqual(['grep', 'glob', 'debug']);
    });

    it('recommends problem solving for errors', () => {
      const rec = tm.recommendCombination('有错误');
      expect(rec.recommended).toEqual(['search', 'debug', 'read']);
    });

    it('recommends research by default', () => {
      const rec = tm.recommendCombination('anything');
      expect(rec.recommended).toEqual(['search', 'read']);
    });
  });

  describe('getStats', () => {
    it('returns empty stats initially', () => {
      const stats = tm.getStats();
      expect(stats.total).toBe(5);
      expect(stats.mostUsed).toHaveLength(5);
      expect(stats.recentlyUsed).toEqual([]);
    });

    it('includes categories', () => {
      const stats = tm.getStats();
      expect(Object.keys(stats.categories)).toContain('research');
      expect(Object.keys(stats.categories)).toContain('code');
    });

    it('returns stats with history', async () => {
      await tm.execute('search', { query: 'test' });
      const stats = tm.getStats();
      expect(stats.recentlyUsed).toHaveLength(1);
      expect(stats.recentlyUsed[0].id).toBe('search');
    });
  });

  describe('listTools', () => {
    it('lists all tools', () => {
      expect(tm.listTools()).toHaveLength(5);
    });

    it('filters by category', () => {
      expect(tm.listTools('code')).toHaveLength(2);
      expect(tm.listTools('research')).toHaveLength(2);
    });
  });

  describe('getHistory', () => {
    it('returns limited history', async () => {
      await tm.execute('search', { query: 'x' });
      expect(tm.getHistory(1)).toHaveLength(1);
    });

    it('getHistory uses default limit', async () => {
      for (let i = 0; i < 30; i++) await tm.execute('search', { query: 'x' });
      expect(tm.getHistory()).toHaveLength(20);
    });
  });

  describe('suggestTools', () => {
    it('suggests search for unknown context', () => {
      const suggestions = tm.suggestTools('不知道怎么做');
      expect(suggestions.some(s => s.tool === 'search')).toBe(true);
    });

    it('suggests debug for errors', () => {
      const suggestions = tm.suggestTools('有错误');
      expect(suggestions.some(s => s.tool === 'debug')).toBe(true);
    });

    it('returns multiple suggestions', () => {
      const suggestions = tm.suggestTools('搜索代码实现解决错误');
      expect(suggestions.length).toBeGreaterThanOrEqual(2);
    });
  });
});
