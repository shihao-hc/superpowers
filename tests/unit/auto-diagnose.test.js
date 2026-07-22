describe('AutoDiagnose', () => {
  let AutoDiagnose;

  beforeAll(() => {
    AutoDiagnose = require('../../src/core/AutoDiagnose');
  });

  function makeMockLib(lessons) {
    return { lessons };
  }

  describe('constructor', () => {
    it('creates instance with default lesson lib', () => {
      const d = new AutoDiagnose();
      expect(d._lessonLib).toBeDefined();
      expect(Array.isArray(d._lessonLib.lessons)).toBe(true);
    });

    it('accepts custom lesson lib', () => {
      const lib = makeMockLib([{ id: '1', problem: 'test', lesson: 'fix it', tags: ['bug'] }]);
      const d = new AutoDiagnose({ lessonLib: lib });
      expect(d._lessonLib.lessons).toHaveLength(1);
    });
  });

  describe('_tokenize', () => {
    it('filters tokens with length <= 2', () => {
      const d = new AutoDiagnose({ lessonLib: makeMockLib([]) });
      expect(d._tokenize('it is ok')).toEqual([]);
    });

    it('keeps Chinese characters even when short', () => {
      const d = new AutoDiagnose({ lessonLib: makeMockLib([]) });
      const tokens = d._tokenize('修复 bug');
      expect(tokens).toContain('修复');
    });

    it('filters pure numbers', () => {
      const d = new AutoDiagnose({ lessonLib: makeMockLib([]) });
      expect(d._tokenize('error 123 at line')).not.toContain('123');
    });
  });

  describe('_computeScore', () => {
    it('returns 0 for no matches', () => {
      const d = new AutoDiagnose({ lessonLib: makeMockLib([]) });
      const lesson = { problem: 'aaa', lesson: 'bbb', tags: [] };
      expect(d._computeScore(['xyz'], lesson)).toBe(0);
    });

    it('computes coverage-based score for matches', () => {
      const d = new AutoDiagnose({ lessonLib: makeMockLib([]) });
      const lesson = { problem: 'bug error', lesson: 'fix it', tags: ['crash'] };
      const score = d._computeScore(['bug', 'error'], lesson);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('uses empty tags gracefully', () => {
      const d = new AutoDiagnose({ lessonLib: makeMockLib([]) });
      const lesson = { problem: 'error in code', lesson: 'fix it', tags: [] };
      expect(d._computeScore(['error'], lesson)).toBeGreaterThan(0);
    });

    it('handles null/undefined lesson fields', () => {
      const d = new AutoDiagnose({ lessonLib: makeMockLib([]) });
      const lesson = { problem: null, lesson: undefined, tags: null };
      expect(d._computeScore(['test'], lesson)).toBe(0);
    });
  });

  describe('diagnose', () => {
    it('returns empty for null input', () => {
      const d = new AutoDiagnose({ lessonLib: makeMockLib([]) });
      expect(d.diagnose(null)).toEqual([]);
    });

    it('returns empty for empty input', () => {
      const d = new AutoDiagnose({ lessonLib: makeMockLib([]) });
      expect(d.diagnose('')).toEqual([]);
    });

    it('returns sorted matches by score', () => {
      const lib = makeMockLib([
        { id: '1', problem: 'crash on startup', lesson: 'fix null', category: 'error', priority: 'high', tags: ['crash'] },
        { id: '2', problem: 'slow query', lesson: 'add index', category: 'performance', priority: 'medium', tags: ['slow'] },
        { id: '3', problem: 'memory leak', lesson: 'free memory', category: 'performance', priority: 'high', tags: ['memory', 'leak'] }
      ]);
      const d = new AutoDiagnose({ lessonLib: lib });
      const results = d.diagnose('null crash startup');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThanOrEqual(results[results.length - 1].score);
    });

    it('respects limit parameter', () => {
      const lib = makeMockLib([
        { id: '1', problem: 'crash error', lesson: 'fix', category: 'error', priority: 'high', tags: [] },
        { id: '2', problem: 'crash bug', lesson: 'fix', category: 'error', priority: 'high', tags: [] }
      ]);
      const d = new AutoDiagnose({ lessonLib: lib });
      expect(d.diagnose('crash error bug', 1)).toHaveLength(1);
    });

    it('returns empty when all tokens are filtered out', () => {
      const d = new AutoDiagnose({ lessonLib: makeMockLib([]) });
      expect(d.diagnose('a b c')).toEqual([]);
    });

    it('returns empty for non-string input', () => {
      const d = new AutoDiagnose({ lessonLib: makeMockLib([]) });
      expect(d.diagnose(123)).toEqual([]);
    });

    it('logs diagnostic info to audit when provided with matches', () => {
      const mockAudit = { log: jest.fn() };
      const lib = makeMockLib([
        { id: '1', problem: 'crash error', lesson: 'fix it', category: 'error', priority: 'high', tags: ['bug'] }
      ]);
      const d = new AutoDiagnose({ lessonLib: lib, audit: mockAudit });
      d.diagnose('crash error');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'info', module: 'diagnose', action: 'diagnose', matches: 1 })
      );
    });

    it('logs zero topScore when audit is provided and no lessons match', () => {
      const mockAudit = { log: jest.fn() };
      const lib = makeMockLib([
        { id: '1', problem: 'aaa', lesson: 'bbb', category: 'error', priority: 'high', tags: [] }
      ]);
      const d = new AutoDiagnose({ lessonLib: lib, audit: mockAudit });
      d.diagnose('xxx yyy');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ matches: 0, topScore: 0 })
      );
    });
  });

  describe('searchByToken', () => {
    it('finds matching lessons', () => {
      const lib = makeMockLib([
        { id: '1', problem: 'stack overflow', lesson: 'increase stack', category: 'error', priority: 'high' },
        { id: '2', problem: 'slow response', lesson: 'optimize query', category: 'performance', priority: 'medium' }
      ]);
      const d = new AutoDiagnose({ lessonLib: lib });
      const found = d.searchByToken('stack');
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe('1');
    });

    it('returns empty for no matches', () => {
      const lib = makeMockLib([]);
      const d = new AutoDiagnose({ lessonLib: lib });
      expect(d.searchByToken('nothing')).toEqual([]);
    });

    it('falls through to lesson text when problem is null', () => {
      const lib = makeMockLib([
        { id: '1', problem: null, lesson: 'memory leak', category: 'error', priority: 'high' }
      ]);
      const d = new AutoDiagnose({ lessonLib: lib });
      const found = d.searchByToken('memory');
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe('1');
    });

    it('handles null lesson field without crash', () => {
      const lib = makeMockLib([
        { id: '1', problem: 'aaa', lesson: null, category: 'error', priority: 'high' }
      ]);
      const d = new AutoDiagnose({ lessonLib: lib });
      expect(d.searchByToken('crash')).toEqual([]);
    });

    it('handles both problem and lesson being null', () => {
      const lib = makeMockLib([
        { id: '1', problem: null, lesson: null, category: 'error', priority: 'high' }
      ]);
      const d = new AutoDiagnose({ lessonLib: lib });
      expect(d.searchByToken('anything')).toEqual([]);
    });
  });
});
