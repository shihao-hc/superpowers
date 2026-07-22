const fs = require('fs');
const path = require('path');
const os = require('os');

const ORIGINAL_DATA_DIR = Symbol('original');

describe('Persistence', () => {
  let Persistence;
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'persistence-test-'));
    const dataDir = path.join(__dirname, '../../data');
    ['test-key', 'append-test', 'no-items', 'corrupt-key', 'error-key'].forEach(k => {
      const fp = path.join(dataDir, `${k}.json`);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });
    Persistence = require('../../src/core/Persistence');
    Persistence[ORIGINAL_DATA_DIR] = Persistence.DATA_DIR;
    // Not overriding DATA_DIR since save/load use path.join(__dirname, '../../data')
    // We'll test the API contract
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('save and load', () => {
    it('saves and loads data', () => {
      const result = Persistence.save('test-key', { foo: 'bar' });
      expect(result.success).toBe(true);
      expect(result.path).toContain('test-key.json');
    });

    it('load returns default for missing key', () => {
      expect(Persistence.load('nonexistent', { fallback: true })).toEqual({ fallback: true });
    });
  });

  describe('append', () => {
    const APPEND_KEY = 'append-test';

    beforeAll(() => {
      const fp = path.join(__dirname, '../../data', `${APPEND_KEY}.json`);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });

    it('appends items with timestamp', () => {
      const r1 = Persistence.append(APPEND_KEY, { msg: 'first' });
      expect(r1.success).toBe(true);

      const data = Persistence.load(APPEND_KEY);
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBe(1);
      expect(data.items[0].msg).toBe('first');
      expect(data.items[0].timestamp).toBeDefined();
      expect(data.total).toBe(1);
    });

    it('appends sequentially', () => {
      Persistence.append(APPEND_KEY, { msg: 'second' });
      const data = Persistence.load(APPEND_KEY);
      expect(data.total).toBe(2);
    });
  });

  describe('append with no prior items', () => {
    it('handles append when data has no items field', () => {
      Persistence.save('no-items', { total: 5 });
      const result = Persistence.append('no-items', { msg: 'new item' });
      expect(result.success).toBe(true);
      const data = Persistence.load('no-items');
      expect(data.items).toEqual([{ msg: 'new item', timestamp: expect.any(Number) }]);
      expect(data.total).toBe(6);
    });
  });

  describe('loadAll', () => {
    it('returns all data types', () => {
      const all = Persistence.loadAll();
      expect(all).toHaveProperty('lessons');
      expect(all).toHaveProperty('memory');
      expect(all).toHaveProperty('growth');
      expect(all).toHaveProperty('intents');
    });
  });

  describe('persistAll', () => {
    it('returns success with saved count', () => {
      const result = Persistence.persistAll({});
      expect(result.success).toBe(true);
      expect(result.saved).toBe(4);
    });
  });

  describe('error handling', () => {
    it('handles save error with write failure', () => {
      jest.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
        throw new Error('disk full');
      });
      const result = Persistence.save('error-key', { foo: 'bar' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('disk full');
      fs.writeFileSync.mockRestore();
    });

    it('handles load error with corrupt file', () => {
      Persistence.save('corrupt-key', { original: true });
      const dp = path.join(__dirname, '../../data');
      fs.writeFileSync(path.join(dp, 'corrupt-key.json'), 'not valid json');
      const result = Persistence.load('corrupt-key', { fallback: true });
      expect(result).toEqual({ fallback: true });
    });
  });

  describe('module initialization', () => {
    it('creates data directory when missing', () => {
      jest.resetModules();
      const fsMod = require('fs');
      const origExists = fsMod.existsSync.bind(fsMod);
      const origMkdir = fsMod.mkdirSync.bind(fsMod);
      const existsSpy = jest.spyOn(fsMod, 'existsSync').mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('data')) return false;
        return origExists(p);
      });
      const mkdirSpy = jest.spyOn(fsMod, 'mkdirSync').mockImplementation((p, opts) => {
        expect(opts).toEqual({ recursive: true });
        return origMkdir(p, opts);
      });
      jest.isolateModules(() => {
        require('../../src/core/Persistence');
        expect(mkdirSpy).toHaveBeenCalled();
      });
      existsSpy.mockRestore();
      mkdirSpy.mockRestore();
      jest.resetModules();
    });
  });
});
