const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpRoot;
let originalCwd;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evop-'));
  originalCwd = process.cwd();
  process.chdir(tmpRoot);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  jest.restoreAllMocks();
});

function freshPersistence() {
  jest.resetModules();
  return require('../../src/core/EvolutionPersistence');
}

describe('EvolutionPersistence', () => {
  test('init creates persistence dir', () => {
    const Persistence = freshPersistence();
    const dir = path.join(tmpRoot, '.opencode', 'evolution');
    expect(fs.existsSync(dir)).toBe(false);
    Persistence.init();
    expect(fs.existsSync(dir)).toBe(true);
  });

  test('save and load round-trip JSON', () => {
    const Persistence = freshPersistence();
    const result = Persistence.save('profile', { name: '测试', level: 3 });
    expect(result.success).toBe(true);
    const loaded = Persistence.load('profile');
    expect(loaded).toEqual({ name: '测试', level: 3 });
  });

  test('load returns default when file missing', () => {
    const Persistence = freshPersistence();
    expect(Persistence.load('missing', { d: 1 })).toEqual({ d: 1 });
    expect(Persistence.load('also-missing')).toEqual({});
  });

  test('load returns default on corrupt json', () => {
    const Persistence = freshPersistence();
    const dir = path.join(tmpRoot, '.opencode', 'evolution');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'broken.json'), '{not json');
    expect(Persistence.load('broken', { fallback: true })).toEqual({ fallback: true });
  });

  test('saveLessons writes lessons file', () => {
    const Persistence = freshPersistence();
    const log = jest.spyOn(console, 'warn').mockImplementation(() => {});
    Persistence.saveLessons({ total: 3 });
    expect(Persistence.load('lessons')).toEqual({ total: 3 });
    expect(log).not.toHaveBeenCalled();
  });

  test('saveLessons swallows write errors', () => {
    const Persistence = freshPersistence();
    const log = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const spy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() => Persistence.saveLessons({ total: 3 })).not.toThrow();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('SaveLessons failed'), 'disk full');
    spy.mockRestore();
  });

  test('loadLessons prefers curated lessons.json', () => {
    const Persistence = freshPersistence();
    const curated = path.join(tmpRoot, '.opencode', 'lessons.json');
    fs.mkdirSync(path.dirname(curated), { recursive: true });
    fs.writeFileSync(curated, JSON.stringify({ lessons: [{ id: 'curated' }] }));
    expect(Persistence.loadLessons()).toEqual([{ id: 'curated' }]);
  });

  test('loadLessons handles curated array form', () => {
    const Persistence = freshPersistence();
    const curated = path.join(tmpRoot, '.opencode', 'lessons.json');
    fs.mkdirSync(path.dirname(curated), { recursive: true });
    fs.writeFileSync(curated, JSON.stringify([{ id: 'array' }]));
    expect(Persistence.loadLessons()).toEqual([{ id: 'array' }]);
  });

  test('loadLessons returns [] for missing curated and missing persisted', () => {
    const Persistence = freshPersistence();
    const curated = path.join(tmpRoot, '.opencode', 'lessons.json');
    fs.rmSync(curated, { force: true });
    expect(Persistence.loadLessons()).toEqual([]);
  });

  test('loadLessons returns [] on corrupt curated and corrupted persisted', () => {
    const Persistence = freshPersistence();
    const curated = path.join(tmpRoot, '.opencode', 'lessons.json');
    fs.mkdirSync(path.dirname(curated), { recursive: true });
    fs.writeFileSync(curated, '{bad');
    const dir = path.join(tmpRoot, '.opencode', 'evolution');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'lessons.json'), '{also bad');
    expect(Persistence.loadLessons()).toEqual([]);
  });

  test('loadLessons falls back to persisted lessons when curated missing', () => {
    const Persistence = freshPersistence();
    const curated = path.join(tmpRoot, '.opencode', 'lessons.json');
    fs.rmSync(curated, { force: true });
    Persistence.saveLessons({ total: 7 });
    expect(Persistence.loadLessons()).toEqual({ total: 7 });
  });

  test('saveUserProfile and loadUserProfile round-trip', () => {
    const Persistence = freshPersistence();
    Persistence.saveUserProfile({ name: 'u', tags: ['a'] });
    expect(Persistence.loadUserProfile()).toEqual({ name: 'u', tags: ['a'] });
  });

  test('loadUserProfile returns {} on missing and corrupt', () => {
    const Persistence = freshPersistence();
    expect(Persistence.loadUserProfile()).toEqual({});
    const dir = path.join(tmpRoot, '.opencode', 'evolution');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'user_profile.json'), '{bad');
    expect(Persistence.loadUserProfile()).toEqual({});
  });

  test('saveGrowth and loadGrowth round-trip', () => {
    const Persistence = freshPersistence();
    Persistence.saveGrowth({ totalInteractions: 1 });
    expect(Persistence.loadGrowth()).toEqual({ totalInteractions: 1 });
  });

  test('loadGrowth returns defaults for missing/corrupt', () => {
    const Persistence = freshPersistence();
    const defaults = { totalInteractions: 0, lessonsLearned: 0, improvements: [] };
    expect(Persistence.loadGrowth()).toEqual(defaults);
    const dir = path.join(tmpRoot, '.opencode', 'evolution');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'growth.json'), '{bad');
    expect(Persistence.loadGrowth()).toEqual(defaults);
  });

  test('persistAll persists lessons, profile, increments growth', () => {
    const Persistence = freshPersistence();
    const brain = {
      lessonLibrary: { getStats: () => ({ total: 5 }) },
      memory: { getUserProfile: () => ({ name: 'x' }) }
    };
    const result = Persistence.persistAll(brain);
    expect(result.saved).toBe(true);
    expect(Persistence.loadLessons()).toEqual({ total: 5 });
    expect(Persistence.loadUserProfile()).toEqual({ name: 'x' });
    expect(Persistence.loadGrowth().totalInteractions).toBe(1);
    Persistence.persistAll(brain);
    expect(Persistence.loadGrowth().totalInteractions).toBe(2);
  });

  test('persistAll skips absent optional modules', () => {
    const Persistence = freshPersistence();
    const result = Persistence.persistAll({});
    expect(result.saved).toBe(true);
    expect(Persistence.loadGrowth().totalInteractions).toBe(1);
  });

  test('incrementalUpdate throws on invalid key', () => {
    const Persistence = freshPersistence();
    expect(() => Persistence.incrementalUpdate('nope', {})).toThrow('Invalid key: nope');
  });

  test('incrementalUpdate merges into existing key', () => {
    const Persistence = freshPersistence();
    Persistence.saveGrowth({ totalInteractions: 1, lessonsLearned: 2, improvements: [] });
    const result = Persistence.incrementalUpdate('growth', { lessonsLearned: 9 });
    expect(result).toEqual({ key: 'growth', updated: true, timestamp: expect.any(Number) });
    expect(Persistence.loadGrowth()).toEqual({ totalInteractions: 1, lessonsLearned: 9, improvements: [] });
  });

  test('incrementalUpdate works for lessons and userProfile keys', () => {
    const Persistence = freshPersistence();
    Persistence.incrementalUpdate('lessons', { total: 2 });
    expect(Persistence.load('lessons')).toEqual({ total: 2 });
    Persistence.incrementalUpdate('userProfile', { name: 'n' });
    expect(Persistence.load('user_profile')).toEqual({ name: 'n' });
  });

  test('_deepMerge merges nested objects, arrays replaced', () => {
    const Persistence = freshPersistence();
    const merged = Persistence._deepMerge(
      { a: { x: 1, y: 2 }, arr: [1], top: 'keep' },
      { a: { y: 9 }, arr: [9], new: 'added' }
    );
    expect(merged).toEqual({ a: { x: 1, y: 9 }, arr: [9], top: 'keep', new: 'added' });
  });

  test('getStats and loadAll return all three datasets', () => {
    const Persistence = freshPersistence();
    Persistence.saveLessons({ total: 1 });
    Persistence.saveUserProfile({ name: 'p' });
    Persistence.saveGrowth({ totalInteractions: 3 });
    const stats = Persistence.getStats();
    expect(stats.lessons).toEqual({ total: 1 });
    expect(stats.userProfile).toEqual({ name: 'p' });
    expect(stats.growth.totalInteractions).toBe(3);
    expect(stats.storageDir).toBe(path.join(tmpRoot, '.opencode', 'evolution'));
    const all = Persistence.loadAll();
    expect(all.lessons.total).toBe(1);
    expect(all.userProfile.name).toBe('p');
    expect(all.growth.totalInteractions).toBe(3);
  });

  test('append adds item with timestamp and total', () => {
    const Persistence = freshPersistence();
    const result = Persistence.append('logs', { msg: 'hello' });
    expect(result).toEqual({ appended: true, total: 1 });
    const data = Persistence.load('logs');
    expect(data.total).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({ msg: 'hello' });
    expect(data.items[0].timestamp).toEqual(expect.any(Number));
  });

  test('append truncates to last 100 items', () => {
    const Persistence = freshPersistence();
    for (let i = 0; i < 105; i++) {
      Persistence.append('biglog', { i });
    }
    const data = Persistence.load('biglog');
    expect(data.total).toBe(105);
    expect(data.items).toHaveLength(100);
    expect(data.items[99].i).toBe(104);
  });

  test('append handles corrupt existing file and missing items field', () => {
    const Persistence = freshPersistence();
    const dir = path.join(tmpRoot, '.opencode', 'evolution');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'log2.json'), '{corrupt');
    const log = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = Persistence.append('log2', { msg: 'x' });
    expect(result.total).toBe(1);
    expect(log).toHaveBeenCalled();
  });
});
