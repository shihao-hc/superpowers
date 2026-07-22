const path = require('path');
const os = require('os');
const Memory = require('../../src/core/Memory');

describe('Memory', () => {
  let memory;
  let loadSpy;
  let saveSpy;

  beforeEach(() => {
    loadSpy = jest.spyOn(Memory.prototype, '_load').mockReturnValue();
    saveSpy = jest.spyOn(Memory.prototype, '_save').mockReturnValue();
    memory = new Memory({ storagePath: path.join(os.tmpdir(), 'test-memory.json') });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('uses default storage path', () => {
      const m = new Memory();
      expect(m.storagePath).toContain('.opencode');
      expect(m.storagePath).toContain('memory.json');
      loadSpy.mockClear();
    });

    test('uses custom storage path', () => {
      expect(memory.storagePath).toContain(os.tmpdir());
    });

    test('initializes memory containers', () => {
      expect(memory.memories).toEqual({
        user: {}, interaction: [], concept: [], solution: [], insight: []
      });
    });

    test('initializes type labels', () => {
      expect(memory.types.user).toBe('用户偏好');
      expect(memory.types.interaction).toBe('交互模式');
    });

    test('initializes default preferences', () => {
      expect(memory.preferences).toEqual({
        communication: 'direct', pace: 'balanced', detailLevel: 'medium'
      });
    });

    test('calls _load during construction', () => {
      expect(loadSpy).toHaveBeenCalled();
    });
  });

  describe('_simplify', () => {
    test('handles empty string', () => {
      expect(memory._simplify('')).toBe('');
    });

    test('handles null', () => {
      expect(memory._simplify(null)).toBe('');
    });

    test('lowercases text', () => {
      expect(memory._simplify('Hello World')).toBe('hello world');
    });

    test('removes punctuation', () => {
      expect(memory._simplify('hello, world!')).toBe('hello world');
    });

    test('truncates to 100 chars', () => {
      expect(memory._simplify('a'.repeat(150)).length).toBe(100);
    });
  });

  describe('_similar', () => {
    test('returns true when 2+ words overlap', () => {
      expect(memory._similar('hello world test', 'hello world foo')).toBe(true);
    });

    test('returns false when < 2 words overlap', () => {
      expect(memory._similar('hello world', 'foo bar')).toBe(false);
    });

    test('returns false for empty strings', () => {
      expect(memory._similar('', '')).toBe(false);
    });
  });

  describe('_avg', () => {
    test('computes average', () => {
      expect(memory._avg([1, 2, 3, 4])).toBe(3);
    });

    test('returns 0 for empty array', () => {
      expect(memory._avg([])).toBe(0);
    });

    test('rounds result', () => {
      expect(memory._avg([1, 2])).toBe(2);
    });
  });

  describe('_mostFrequent', () => {
    test('returns most frequent item', () => {
      expect(memory._mostFrequent(['a', 'b', 'a', 'c'])).toBe('a');
    });

    test('returns null for empty array', () => {
      expect(memory._mostFrequent([])).toBeNull();
    });
  });

  describe('_createDefaultProfile', () => {
    test('creates profile with default preferences', () => {
      const profile = memory._createDefaultProfile();
      expect(profile.preferences).toEqual(memory.preferences);
      expect(profile.interactions).toBe(0);
      expect(profile.createdAt).toBeDefined();
    });
  });

  describe('getStats', () => {
    test('returns zeros for empty memory', () => {
      const stats = memory.getStats();
      expect(stats).toEqual({ solutions: 0, concepts: 0, insights: 0, interactions: 0, users: 0, milestones: 0 });
    });

    test('returns correct counts after adding data', () => {
      memory.memories.solution.push({});
      memory.memories.concept.push({});
      memory.memories.insight.push({});
      memory.memories.interaction.push({});
      memory.userProfiles.u1 = {};
      memory.milestones.push({});
      expect(memory.getStats()).toEqual({ solutions: 1, concepts: 1, insights: 1, interactions: 1, users: 1, milestones: 1 });
    });
  });

  describe('getSummary', () => {
    test('returns summary shape', () => {
      const summary = memory.getSummary();
      expect(summary.type).toBe('Long-term Memory System');
      expect(summary.stats).toBeDefined();
      expect(Array.isArray(summary.recentInsight)).toBe(true);
    });
  });

  describe('recallSolution', () => {
    test('finds solutions by similarity', () => {
      memory.memories.solution.push({ problem: 'how to fix error' });
      expect(memory.recallSolution('how to fix error')).toHaveLength(1);
    });

    test('returns empty on no match', () => {
      memory.memories.solution.push({ problem: 'hello world' });
      expect(memory.recallSolution('foo bar')).toHaveLength(0);
    });
  });

  describe('recallConcept', () => {
    test('finds concept by exact name', () => {
      memory.memories.concept.push({ concept: 'closure', understanding: {} });
      expect(memory.recallConcept('closure')).toBeDefined();
    });

    test('returns undefined for missing concept', () => {
      expect(memory.recallConcept('unknown')).toBeUndefined();
    });
  });

  describe('recallInsight', () => {
    test('returns insights sorted by importance descending', () => {
      memory.memories.insight.push({ content: 'low', importance: 1 }, { content: 'high', importance: 10 });
      const results = memory.recallInsight(1);
      expect(results[0].content).toBe('high');
    });

    test('respects limit', () => {
      for (let i = 0; i < 10; i++) memory.memories.insight.push({ content: `i${i}`, importance: i });
      expect(memory.recallInsight(3)).toHaveLength(3);
    });
  });

  describe('getMilestones', () => {
    test('returns milestones array', () => {
      expect(memory.getMilestones()).toEqual([]);
    });
  });

  describe('getUserProfile', () => {
    test('returns existing profile', () => {
      memory.userProfiles.u1 = { id: 'u1', interactions: 5 };
      expect(memory.getUserProfile('u1').interactions).toBe(5);
    });

    test('creates default for unknown user', () => {
      const profile = memory.getUserProfile('unknown');
      expect(profile.interactions).toBe(0);
      expect(profile.preferences).toBeDefined();
    });
  });

  describe('getInteractionPattern', () => {
    test('returns null with no interactions', () => {
      expect(memory.getInteractionPattern('u1')).toBeNull();
    });

    test('computes pattern from user interactions', () => {
      memory.memories.interaction.push(
        { userId: 'u1', input: 'hello world', success: true, context: 'general' },
        { userId: 'u1', input: 'foo bar baz', success: true, context: 'general' },
        { userId: 'other', input: 'x', success: false, context: 'other' }
      );
      const pattern = memory.getInteractionPattern('u1');
      expect(pattern.successRate).toBe(1);
      expect(pattern.contextFrequency).toBe('general');
    });
  });

  describe('_checkMilestone', () => {
    test('adds milestone when importance >= 8', () => {
      memory._checkMilestone({ content: 'big', importance: 8, timestamp: 100 });
      expect(memory.milestones).toHaveLength(1);
    });

    test('does not add when importance < 8', () => {
      memory._checkMilestone({ content: 'small', importance: 7, timestamp: 100 });
      expect(memory.milestones).toHaveLength(0);
    });

    test('limits to 10 milestones', () => {
      for (let i = 0; i < 15; i++) {
        memory._checkMilestone({ content: `m${i}`, importance: 8, timestamp: i });
      }
      expect(memory.milestones.length).toBeLessThanOrEqual(10);
    });
  });

  describe('_inferPreferences', () => {
    test('no change with < 5 interactions', () => {
      memory.userProfiles.u1 = { preferences: { detailLevel: 'medium' } };
      memory._inferPreferences('u1');
      expect(memory.userProfiles.u1.preferences.detailLevel).toBe('medium');
    });

    test('high detail when avg input > 100', () => {
      memory.userProfiles.u1 = { preferences: { detailLevel: 'medium' } };
      for (let i = 0; i < 5; i++) {
        memory.memories.interaction.push({ userId: 'u1', input: 'x'.repeat(101), success: true });
      }
      memory._inferPreferences('u1');
      expect(memory.userProfiles.u1.preferences.detailLevel).toBe('high');
    });

    test('low detail when avg input < 30', () => {
      memory.userProfiles.u1 = { preferences: { detailLevel: 'medium' } };
      for (let i = 0; i < 5; i++) {
        memory.memories.interaction.push({ userId: 'u1', input: 'short', success: true });
      }
      memory._inferPreferences('u1');
      expect(memory.userProfiles.u1.preferences.detailLevel).toBe('low');
    });
  });

  describe('_extractPattern', () => {
    test('high detail for long successful input', () => {
      memory._extractPattern({ input: 'x'.repeat(51), success: true });
      expect(memory.preferences.detailLevel).toBe('high');
    });

    test('adaptive flag on failed interaction', () => {
      memory._extractPattern({ input: 'test', success: false });
      expect(memory.preferences.adaptive).toBe(true);
    });
  });

  describe('rememberInteraction', () => {
    test('stores interaction', () => {
      const result = memory.rememberInteraction('u1', { input: 'Hello', output: 'Hi', success: true });
      expect(result.userId).toBe('u1');
      expect(result.input).toBe('hello');
      expect(memory.memories.interaction).toHaveLength(1);
    });

    test('limits to 100 interactions', () => {
      for (let i = 0; i < 101; i++) {
        memory.memories.interaction.push({ id: `old-${i}` });
      }
      memory.rememberInteraction('u1', { input: 'new', success: true });
      expect(memory.memories.interaction.length).toBeLessThanOrEqual(100);
    });

    test('calls _extractPattern', () => {
      const spy = jest.spyOn(memory, '_extractPattern');
      memory.rememberInteraction('u1', { input: 'test', success: true });
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('rememberSolution', () => {
    test('saves new solution', () => {
      const result = memory.rememberSolution('bug crash', 'restart', 'fixed');
      expect(result.problem).toBe('bug crash');
      expect(memory.memories.solution).toHaveLength(1);
      expect(saveSpy).toHaveBeenCalled();
    });

    test('deduplicates similar solutions', () => {
      memory.rememberSolution('bug crash', 'restart', 'fixed');
      saveSpy.mockClear();
      memory.rememberSolution('bug crash error', 'restart', 'fixed');
      expect(memory.memories.solution).toHaveLength(1);
    });
  });

  describe('rememberConcept', () => {
    test('adds new concept', () => {
      const result = memory.rememberConcept('closure', { examples: ['x'] });
      expect(result.concept).toBe('closure');
      expect(memory.memories.concept).toHaveLength(1);
      expect(saveSpy).toHaveBeenCalled();
    });

    test('increments depth for existing concept', () => {
      memory.rememberConcept('closure', { depth: 1 });
      saveSpy.mockClear();
      memory.rememberConcept('closure', { depth: 2 });
      expect(memory.memories.concept).toHaveLength(1);
      expect(memory.memories.concept[0].depth).toBe(2);
    });
  });

  describe('rememberInsight', () => {
    test('uses default importance when not provided', () => {
      const result = memory.rememberInsight({ content: 'insight' });
      expect(result.importance).toBe(5);
      expect(saveSpy).toHaveBeenCalled();
    });

    test('accepts plain string', () => {
      const result = memory.rememberInsight('plain insight');
      expect(result.content).toBe('plain insight');
    });

    test('keeps only top 20 by importance', () => {
      for (let i = 0; i < 25; i++) {
        memory.memories.insight.push({ content: `i${i}`, importance: i });
      }
      memory.rememberInsight({ content: 'new', importance: 100 });
      expect(memory.memories.insight.length).toBeLessThanOrEqual(20);
    });

    test('calls _checkMilestone', () => {
      const spy = jest.spyOn(memory, '_checkMilestone');
      memory.rememberInsight({ content: 'big', importance: 10 });
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('updateUserProfile', () => {
    test('creates profile for new user', () => {
      const profile = memory.updateUserProfile('newuser', { preferences: {} });
      expect(profile.id).toBe('newuser');
      expect(profile.interactions).toBe(1);
      expect(saveSpy).toHaveBeenCalled();
    });

    test('merges preferences', () => {
      memory.userProfiles.u1 = { id: 'u1', preferences: { detailLevel: 'medium' }, interactions: 0 };
      saveSpy.mockClear();
      memory.updateUserProfile('u1', { preferences: { detailLevel: 'high' } });
      expect(memory.userProfiles.u1.preferences.detailLevel).toBe('high');
    });

    test('increments interaction count', () => {
      memory.updateUserProfile('u1', { preferences: {} });
      memory.updateUserProfile('u1', { preferences: {} });
      expect(memory.userProfiles.u1.interactions).toBe(2);
    });
  });

  describe('additional branch coverage', () => {
    test('updateUserProfile without preferences in argument', () => {
      memory.userProfiles.u1 = { id: 'u1', preferences: { detailLevel: 'medium' }, interactions: 0 };
      memory.updateUserProfile('u1', {});
      expect(memory.userProfiles.u1.preferences.detailLevel).toBe('medium');
    });

    test('_inferPreferences medium detail when avg between 30-100', () => {
      memory.userProfiles.u1 = { preferences: { detailLevel: 'medium' } };
      for (let i = 0; i < 5; i++) {
        memory.memories.interaction.push({ userId: 'u1', input: 'x'.repeat(50), success: true });
      }
      memory._inferPreferences('u1');
      expect(memory.userProfiles.u1.preferences.detailLevel).toBe('medium');
    });

    test('_extractPattern long input but failed interaction', () => {
      memory._extractPattern({ input: 'x'.repeat(51), success: false });
      expect(memory.preferences.detailLevel).toBe('medium');
      expect(memory.preferences.adaptive).toBe(true);
    });

    test('_extractPattern short input with success does nothing', () => {
      memory._extractPattern({ input: 'short', success: true });
      expect(memory.preferences.adaptive).toBeUndefined();
      expect(memory.preferences.detailLevel).toBe('medium');
    });

    test('rememberInteraction with undefined input uses empty string', () => {
      const result = memory.rememberInteraction('u1', { success: true });
      expect(result.input).toBe('');
    });

    test('recallInsight uses default limit when not specified', () => {
      for (let i = 0; i < 10; i++) {
        memory.memories.insight.push({ content: `i${i}`, importance: i });
      }
      expect(memory.recallInsight()).toHaveLength(5);
    });

    test('getInteractionPattern handles missing input field', () => {
      memory.memories.interaction.push(
        { userId: 'u1', success: true, context: 'general' },
        { userId: 'u1', success: true, context: 'general' }
      );
      const pattern = memory.getInteractionPattern('u1');
      expect(pattern.inputLength).toBe(0);
    });

    test('_inferPreferences with missing input uses empty string fallback', () => {
      memory.userProfiles.u1 = { preferences: { detailLevel: 'medium' } };
      for (let i = 0; i < 5; i++) {
        memory.memories.interaction.push({ userId: 'u1', success: true });
      }
      memory._inferPreferences('u1');
      expect(memory.userProfiles.u1.preferences.detailLevel).toBe('low');
    });
  });
});

describe('_save/_load real fs operations', () => {
  let fsReal;

  beforeEach(() => {
    jest.restoreAllMocks();
    fsReal = require('fs');
  });

  afterEach(() => {
    const tempDir = os.tmpdir();
    ['save-write.json', 'save-deep.json', 'load-read.json', 'load-corrupt.json', 'load-missing.json', 'load-partial.json'].forEach(f => {
      try { fsReal.unlinkSync(path.join(tempDir, f)); } catch (e) {}
    });
    try {
      const deepDir = path.join(tempDir, 'deep-nested');
      if (fsReal.existsSync(deepDir)) {
        fsReal.rmSync(deepDir, { recursive: true, force: true });
      }
    } catch (e) {}
  });

  test('_save writes to disk correctly', () => {
    const savePath = path.join(os.tmpdir(), 'save-write.json');
    const mem = new Memory({ storagePath: savePath });
    mem._save();
    expect(fsReal.existsSync(savePath)).toBe(true);
    const content = JSON.parse(fsReal.readFileSync(savePath, 'utf8'));
    expect(content.stats).toBeDefined();
  });

  test('_save creates directory tree when missing', () => {
    const deepPath = path.join(os.tmpdir(), 'deep-nested', 'save-deep.json');
    expect(fsReal.existsSync(path.dirname(deepPath))).toBe(false);
    const mem = new Memory({ storagePath: deepPath });
    expect(() => mem._save()).not.toThrow();
    expect(fsReal.existsSync(deepPath)).toBe(true);
  });

  test('_save catches write errors', () => {
    jest.spyOn(fsReal, 'writeFileSync').mockImplementation(() => { throw new Error('disk full'); });
    const mem = new Memory({ storagePath: path.join(os.tmpdir(), 'save-write.json') });
    expect(() => mem._save()).not.toThrow();
  });

  test('_load reads data from saved file', () => {
    const loadPath = path.join(os.tmpdir(), 'load-read.json');
    const mem1 = new Memory({ storagePath: loadPath });
    mem1.userProfiles = { u1: { id: 'u1', interactions: 5 } };
    mem1.milestones = [{ type: 'test', content: 'test', timestamp: 1 }];
    mem1._save();

    const mem2 = new Memory({ storagePath: loadPath });
    expect(mem2.userProfiles.u1.interactions).toBe(5);
    expect(mem2.milestones).toHaveLength(1);
  });

  test('_load handles corrupted JSON gracefully', () => {
    const corruptPath = path.join(os.tmpdir(), 'load-corrupt.json');
    fsReal.writeFileSync(corruptPath, 'not valid json{{{');
    expect(() => new Memory({ storagePath: corruptPath })).not.toThrow();
  });

  test('_load handles missing file gracefully', () => {
    const missingPath = path.join(os.tmpdir(), 'load-missing.json');
    expect(fsReal.existsSync(missingPath)).toBe(false);
    expect(() => new Memory({ storagePath: missingPath })).not.toThrow();
  });

  test('_load uses defaults when saved data has missing fields', () => {
    const loadPath = path.join(os.tmpdir(), 'load-partial.json');
    fsReal.writeFileSync(loadPath, JSON.stringify({ stats: {} }));
    const mem = new Memory({ storagePath: loadPath });
    expect(mem.userProfiles).toEqual({});
    expect(mem.milestones).toEqual([]);
    expect(mem.preferences).toEqual({ communication: 'direct', pace: 'balanced', detailLevel: 'medium' });
  });
});
