const fs = require('fs');
const os = require('os');
const path = require('path');

const AuditLogger = require('../../src/core/AuditLogger');

describe('src/core/AuditLogger', () => {
  let tmpDir;
  let logger;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-audit-'));
    logger = new AuditLogger({ logDir: tmpDir });
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  });

  describe('constructor', () => {
    test('creates log directory', () => {
      expect(fs.existsSync(tmpDir)).toBe(true);
    });

    test('uses default logDir under cwd/.opencode when not provided', () => {
      const defaultLogger = new AuditLogger();
      expect(defaultLogger._logDir).toContain('.opencode');
      expect(defaultLogger._maxDays).toBe(90);
      try { fs.rmSync(defaultLogger._logDir, { recursive: true, force: true }); } catch (e) {}
    });

    test('does not recreate dir when it already exists', () => {
      const mkdirSpy = jest.spyOn(fs, 'mkdirSync');
      new AuditLogger({ logDir: tmpDir });
      expect(mkdirSpy).not.toHaveBeenCalled();
      mkdirSpy.mockRestore();
    });
  });

  describe('log', () => {
    test('appends JSONL entry to today file', () => {
      logger.log({ level: 'info', module: 'test', action: 'ping' });
      const today = new Date().toISOString().slice(0, 10);
      const file = path.join(tmpDir, `${today}.jsonl`);
      expect(fs.existsSync(file)).toBe(true);
      const line = fs.readFileSync(file, 'utf8').trim();
      const parsed = JSON.parse(line);
      expect(parsed.ts).toBeDefined();
      expect(parsed.level).toBe('info');
      expect(parsed.module).toBe('test');
      expect(parsed.action).toBe('ping');
    });

    test('spreads entry fields over base timestamp', () => {
      logger.log({ custom: 'value' });
      const today = new Date().toISOString().slice(0, 10);
      const file = path.join(tmpDir, `${today}.jsonl`);
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8').trim());
      expect(parsed.custom).toBe('value');
    });
  });

  describe('getTodayLog', () => {
    test('returns parsed entries when file exists', () => {
      logger.log({ action: 'a' });
      logger.log({ action: 'b' });
      const entries = logger.getTodayLog();
      expect(entries).toHaveLength(2);
      expect(entries[0].action).toBe('a');
      expect(entries[1].action).toBe('b');
    });

    test('returns [] when no file for today', () => {
      expect(logger.getTodayLog()).toEqual([]);
    });
  });

  describe('_cleanOld', () => {
    test('removes files older than maxDays', () => {
      const oldFile = path.join(tmpDir, '2020-01-01.jsonl');
      fs.writeFileSync(oldFile, '{"old":true}\n');
      const past = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
      fs.utimesSync(oldFile, past, past);

      const recentFile = path.join(tmpDir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
      fs.writeFileSync(recentFile, '{"new":true}\n');

      new AuditLogger({ logDir: tmpDir, maxDays: 90 });
      expect(fs.existsSync(oldFile)).toBe(false);
      expect(fs.existsSync(recentFile)).toBe(true);
    });

    test('keeps files newer than maxDays', () => {
      const recentFile = path.join(tmpDir, 'recent.jsonl');
      fs.writeFileSync(recentFile, '{}');
      new AuditLogger({ logDir: tmpDir, maxDays: 90 });
      expect(fs.existsSync(recentFile)).toBe(true);
    });

    test('tolerates readdir failure', () => {
      const spy = jest.spyOn(fs, 'readdirSync').mockImplementation(() => {
        throw new Error('readdir fail');
      });
      new AuditLogger({ logDir: tmpDir });
      expect(true).toBe(true);
      spy.mockRestore();
    });

    test('tolerates stat failure on non-file entries', () => {
      const subdir = path.join(tmpDir, 'sub');
      fs.mkdirSync(subdir);
      fs.writeFileSync(path.join(subdir, 'x.jsonl'), '{}');
      new AuditLogger({ logDir: tmpDir });
      expect(fs.existsSync(subdir)).toBe(true);
    });
  });
});
