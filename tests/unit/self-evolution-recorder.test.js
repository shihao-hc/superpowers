const fs = require('fs');
const os = require('os');
const path = require('path');

let SelfEvolutionRecorder;

describe('src/core/SelfEvolutionRecorder', () => {
  let tmpDir;
  let originalDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'self-evolution-'));
    originalDir = process.cwd();
    process.chdir(tmpDir);
    jest.isolateModules(() => {
      SelfEvolutionRecorder = require('../../src/core/SelfEvolutionRecorder');
    });
  });

  afterEach(() => {
    process.chdir(originalDir);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  });

  describe('record', () => {
    test('adds improvement and returns it', () => {
      const imp = SelfEvolutionRecorder.record('fix', '修复了 bug');
      expect(imp.type).toBe('fix');
      expect(imp.description).toBe('修复了 bug');
      expect(imp.id).toBeDefined();
      expect(imp.timestamp).toBeDefined();
      expect(imp.version).toBe('15.0');
      expect(SelfEvolutionRecorder._improvements).toHaveLength(1);
    });

    test('stores details', () => {
      SelfEvolutionRecorder.record('fix', 'issue', { fix: 'patch', file: 'x.js' });
      expect(SelfEvolutionRecorder._improvements[0].details).toEqual({ fix: 'patch', file: 'x.js' });
    });

    test('persists improvement to JSON file', () => {
      SelfEvolutionRecorder.record('learning', 'lesson');
      const file = path.join(tmpDir, '.opencode', 'evolution', 'improvements.json');
      expect(fs.existsSync(file)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      expect(parsed).toHaveLength(1);
      expect(parsed[0].description).toBe('lesson');
    });

    test('appends to existing persisted file', () => {
      SelfEvolutionRecorder.record('feature', 'one');
      SelfEvolutionRecorder.record('fix', 'two');
      const file = path.join(tmpDir, '.opencode', 'evolution', 'improvements.json');
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      expect(parsed).toHaveLength(2);
    });

    test('tolerates corrupt persisted file', () => {
      const dir = path.join(tmpDir, '.opencode', 'evolution');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'improvements.json'), 'not json{{');
      SelfEvolutionRecorder.record('fix', 'still works');
      const file = path.join(dir, 'improvements.json');
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      expect(parsed).toHaveLength(1);
    });

    test('tolerates persistence write failure', () => {
      const spy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('disk full');
      });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const imp = SelfEvolutionRecorder.record('fix', 'ok');
      expect(imp).toBeDefined();
      expect(SelfEvolutionRecorder._improvements).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalled();
      spy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  describe('recordCompletion / recordFix / recordLearning', () => {
    test('recordCompletion stores feature with status', () => {
      const imp = SelfEvolutionRecorder.recordCompletion('AgentLoop', 'done');
      expect(imp.type).toBe('feature');
      expect(imp.details).toEqual({ status: 'done' });
    });

    test('recordCompletion defaults status to completed', () => {
      const imp = SelfEvolutionRecorder.recordCompletion('AgentLoop');
      expect(imp.details).toEqual({ status: 'completed' });
    });

    test('recordFix stores fix details', () => {
      const imp = SelfEvolutionRecorder.recordFix('crash', 'added guard');
      expect(imp.type).toBe('fix');
      expect(imp.details).toEqual({ fix: 'added guard' });
    });

    test('recordLearning stores lesson', () => {
      const imp = SelfEvolutionRecorder.recordLearning('always test');
      expect(imp.type).toBe('learning');
      expect(imp.description).toBe('always test');
    });
  });

  describe('getHistory', () => {
    test('returns most recent first, limited', () => {
      for (let i = 1; i <= 15; i++) SelfEvolutionRecorder.record('fix', `fix ${i}`);
      const history = SelfEvolutionRecorder.getHistory(5);
      expect(history).toHaveLength(5);
      expect(history[0].description).toBe('fix 15');
      expect(history[4].description).toBe('fix 11');
    });

    test('defaults to last 10', () => {
      for (let i = 1; i <= 15; i++) SelfEvolutionRecorder.record('fix', `fix ${i}`);
      expect(SelfEvolutionRecorder.getHistory()).toHaveLength(10);
    });

    test('returns all when fewer than limit', () => {
      SelfEvolutionRecorder.record('fix', 'one');
      expect(SelfEvolutionRecorder.getHistory(20)).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    test('counts totals and groups by type', () => {
      SelfEvolutionRecorder.record('fix', 'a');
      SelfEvolutionRecorder.record('fix', 'b');
      SelfEvolutionRecorder.record('learning', 'c');
      const stats = SelfEvolutionRecorder.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byType).toEqual({ fix: 2, learning: 1 });
      expect(stats.version).toBe('15.0');
    });

    test('empty when no records', () => {
      const stats = SelfEvolutionRecorder.getStats();
      expect(stats.total).toBe(0);
      expect(stats.byType).toEqual({});
    });
  });
});
