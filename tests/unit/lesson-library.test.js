describe('LessonLibrary', () => {
  let LessonLibrary;

  beforeAll(() => {
    LessonLibrary = require('../../src/core/LessonLibrary');
    jest.spyOn(LessonLibrary.prototype, '_load').mockImplementation(function () {
      this._lessons = [];
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('initializes with empty lessons', () => {
      const lib = new LessonLibrary();
      expect(lib.lessons).toEqual([]);
      expect(Object.keys(lib.categories)).toHaveLength(6);
    });
  });

  describe('add', () => {
    it('adds a lesson with generated id', () => {
      const lib = new LessonLibrary({ quiet: true });
      const record = lib.add({ title: 'test', problem: 'error', lesson: 'fix it', priority: 'high' });
      expect(record.id).toMatch(/^lesson_/);
      expect(record.title).toBe('test');
      expect(lib.lessons).toHaveLength(1);
    });
  });

  describe('get', () => {
    it('returns lesson by id', () => {
      const lib = new LessonLibrary({ quiet: true });
      const record = lib.add({ title: 'found' });
      expect(lib.get(record.id).title).toBe('found');
    });

    it('returns null for missing id', () => {
      const lib = new LessonLibrary({ quiet: true });
      expect(lib.get('nonexistent')).toBeNull();
    });
  });

  describe('search', () => {
    it('finds lessons matching query', () => {
      const lib = new LessonLibrary({ quiet: true });
      lib.add({ title: 'security fix', tags: ['auth'] });
      lib.add({ title: 'performance', tags: ['speed'] });
      expect(lib.search('security')).toHaveLength(1);
    });

    it('returns all lessons without query', () => {
      const lib = new LessonLibrary({ quiet: true });
      lib.add({ title: 'a' });
      lib.add({ title: 'b' });
      expect(lib.search()).toHaveLength(2);
    });

    it('filters by type success', () => {
      const lib = new LessonLibrary({ quiet: true });
      lib.add({ title: 'a' });
      const record = lib.add({ title: 'b' });
      lib.markApplied(record.id);
      expect(lib.search(null, { type: 'success' })).toHaveLength(1);
    });

    it('respects limit option', () => {
      const lib = new LessonLibrary({ quiet: true });
      lib.add({ title: 'a' });
      lib.add({ title: 'b' });
      expect(lib.search(null, { limit: 1 })).toHaveLength(1);
    });
  });

  describe('getSuggestions', () => {
    it('returns unapplied suggestions', () => {
      const lib = new LessonLibrary({ quiet: true });
      lib.add({ title: 'unapplied', priority: 'high' });
      const record = lib.add({ title: 'applied', priority: 'medium' });
      lib.markApplied(record.id);
      const suggestions = lib.getSuggestions();
      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      expect(suggestions.every(s => s.score !== undefined)).toBe(true);
    });

    it('returns at most 3 suggestions', () => {
      const lib = new LessonLibrary({ quiet: true });
      for (let i = 0; i < 5; i++) lib.add({ title: `lesson-${i}` });
      expect(lib.getSuggestions()).toHaveLength(3);
    });
  });

  describe('getRelated', () => {
    it('returns first N lessons', () => {
      const lib = new LessonLibrary({ quiet: true });
      lib.add({ title: 'a' });
      lib.add({ title: 'b' });
      lib.add({ title: 'c' });
      expect(lib.getRelated('anything', 2)).toHaveLength(2);
    });
  });

  describe('markApplied', () => {
    it('marks lesson as applied', () => {
      const lib = new LessonLibrary({ quiet: true });
      const record = lib.add({ title: 'done' });
      expect(record._applied).toBeUndefined();
      lib.markApplied(record.id);
      expect(record._applied).toBe(true);
    });
  });

  describe('export', () => {
    it('exports as JSON string', () => {
      const lib = new LessonLibrary({ quiet: true });
      lib.add({ title: 'export-me' });
      const json = lib.export('json');
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(1);
    });

    it('exports as object by default', () => {
      const lib = new LessonLibrary({ quiet: true });
      const result = lib.export();
      expect(result.lessons).toBeDefined();
      expect(result.categories).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('returns zero stats initially', () => {
      const lib = new LessonLibrary({ quiet: true });
      const stats = lib.getStats();
      expect(stats.total).toBe(0);
      expect(stats.applied).toBe(0);
    });

    it('counts applied separately', () => {
      const lib = new LessonLibrary({ quiet: true });
      lib.add({ title: 'a' });
      const record = lib.add({ title: 'b' });
      lib.markApplied(record.id);
      const stats = lib.getStats();
      expect(stats.total).toBe(2);
      expect(stats.applied).toBe(1);
    });
  });

  describe('_load (real)', () => {
    let fs;
    let origCwd;
    let tmpDir;

    beforeAll(() => {
      fs = require('fs');
      const os = require('os');
      const path = require('path');
      origCwd = process.cwd();
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'll-load-'));
      process.chdir(tmpDir);
      LessonLibrary.prototype._load.mockRestore();
    });

    afterEach(() => {
      try { fs.unlinkSync('.opencode/lessons.json'); } catch (e) {}
      try { fs.rmdirSync('.opencode'); } catch (e) {}
    });

    afterAll(() => {
      process.chdir(origCwd);
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
      jest.spyOn(LessonLibrary.prototype, '_load').mockImplementation(function () {
        this._lessons = [];
      });
    });

    it('loads from existing file if present', () => {
      const data = [{ id: 't1', title: 'exist' }];
      fs.mkdirSync('.opencode', { recursive: true });
      fs.writeFileSync('.opencode/lessons.json', JSON.stringify({ lessons: data }));
      const lib = new LessonLibrary({ quiet: true });
      expect(lib.lessons).toEqual(data);
    });

    it('starts empty when no file exists', () => {
      const lib = new LessonLibrary({ quiet: true });
      expect(lib.lessons).toEqual([]);
    });

    it('handles corrupt JSON via catch', () => {
      fs.mkdirSync('.opencode', { recursive: true });
      fs.writeFileSync('.opencode/lessons.json', '{corrupt}');
      const lib = new LessonLibrary({ quiet: true });
      expect(lib.lessons).toEqual([]);
    });
  });

  describe('_save catch', () => {
    it('handles write failure gracefully', () => {
      const fs = require('fs');
      const spy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('disk full');
      });
      const lib = new LessonLibrary({ quiet: true });
      expect(() => lib.add({ title: 'test' })).not.toThrow();
      spy.mockRestore();
    });
  });

  describe('markApplied (missing id)', () => {
    it('does not throw for nonexistent id', () => {
      const lib = new LessonLibrary({ quiet: true });
      expect(() => lib.markApplied('nonexistent')).not.toThrow();
    });
  });

  describe('getRelated (default limit)', () => {
    it('uses default limit of 3', () => {
      const lib = new LessonLibrary({ quiet: true });
      for (let i = 0; i < 5; i++) lib.add({ title: `t-${i}` });
      expect(lib.getRelated('anything')).toHaveLength(3);
    });
  });

  describe('search edge cases', () => {
    it('matches by problem field', () => {
      const lib = new LessonLibrary({ quiet: true });
      lib.add({ problem: 'security flaw' });
      expect(lib.search('security')).toHaveLength(1);
    });

    it('matches by lesson field', () => {
      const lib = new LessonLibrary({ quiet: true });
      lib.add({ lesson: 'validate all input' });
      expect(lib.search('validate')).toHaveLength(1);
    });

    it('matches by tags when other fields empty', () => {
      const lib = new LessonLibrary({ quiet: true });
      lib.add({ tags: ['security'] });
      expect(lib.search('security')).toHaveLength(1);
    });

    it('falls through to tags when title has no match', () => {
      const lib = new LessonLibrary({ quiet: true });
      lib.add({ title: 'perf', tags: ['security'] });
      expect(lib.search('security')).toHaveLength(1);
    });

    it('returns empty array when nothing matches', () => {
      const lib = new LessonLibrary({ quiet: true });
      lib.add({ title: 'performance' });
      expect(lib.search('security')).toHaveLength(0);
    });

    it('does not filter by non-success type', () => {
      const lib = new LessonLibrary({ quiet: true });
      lib.add({ title: 'a' });
      lib.add({ title: 'b' });
      expect(lib.search(null, { type: 'failure' })).toHaveLength(2);
    });
  });
});
