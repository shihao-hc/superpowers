const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncBatchWriter, BufferedAuditWriter } = require('../../src/performance/AsyncBatchWriter');

function makeStream(overrides = {}) {
  return {
    write: jest.fn(() => true),
    once: jest.fn(),
    on: jest.fn(),
    end: jest.fn((cb) => { if (cb) cb(); }),
    ...overrides
  };
}

describe('AsyncBatchWriter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const writer = new AsyncBatchWriter();
      expect(writer.batchSize).toBe(100);
      expect(writer.flushInterval).toBe(5000);
      expect(writer.maxQueueSize).toBe(10000);
      expect(writer.encoding).toBe('utf8');
      expect(writer.queue).toEqual([]);
      expect(writer.writeStream).toBeNull();
      expect(writer.flushTimer).toBeNull();
      expect(writer.isWriting).toBe(false);
      expect(writer._pendingWrites).toBe(0);
      expect(writer.stats).toEqual({
        totalWritten: 0,
        batchesFlushed: 0,
        avgBatchSize: 0,
        totalFlushTime: 0,
        lastFlushTime: 0
      });
    });

    it('should accept custom options', () => {
      const writer = new AsyncBatchWriter({
        batchSize: 5,
        flushInterval: 100,
        maxQueueSize: 50,
        encoding: 'ascii'
      });
      expect(writer.batchSize).toBe(5);
      expect(writer.flushInterval).toBe(100);
      expect(writer.maxQueueSize).toBe(50);
      expect(writer.encoding).toBe('ascii');
    });
  });

  describe('setWriteStream', () => {
    it('should store the stream', () => {
      const writer = new AsyncBatchWriter();
      const stream = makeStream();
      writer.setWriteStream(stream);
      expect(writer.writeStream).toBe(stream);
    });
  });

  describe('setLogPath', () => {
    let existsSpy;
    let mkdirSpy;
    let createSpy;

    beforeEach(() => {
      existsSpy = jest.spyOn(fs, 'existsSync');
      mkdirSpy = jest.spyOn(fs, 'mkdirSync');
      createSpy = jest.spyOn(fs, 'createWriteStream');
    });

    it('should reject an invalid log path', () => {
      const writer = new AsyncBatchWriter();
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(writer.setLogPath('')).toBe(false);
      expect(writer.setLogPath(42)).toBe(false);
      expect(writer.setLogPath(null)).toBe(false);
      expect(errSpy).toHaveBeenCalledTimes(3);
    });

    it('should reject path traversal', () => {
      const writer = new AsyncBatchWriter();
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const result = writer.setLogPath('../outside/escape.json');
      expect(result).toBe(false);
      expect(errSpy).toHaveBeenCalledWith('[AsyncBatchWriter] Path traversal detected:', '../outside/escape.json');
    });

    it('should create a write stream for a valid absolute path', () => {
      const writer = new AsyncBatchWriter();
      const validPath = path.join(process.cwd(), 'logs', 'audit.jsonl');
      existsSpy.mockReturnValue(true);
      createSpy.mockReturnValue(makeStream());
      expect(writer.setLogPath(validPath)).toBe(true);
      expect(createSpy).toHaveBeenCalledWith(validPath, { flags: 'a', encoding: 'utf8' });
      expect(writer.writeStream).toBeTruthy();
    });

    it('should create the directory when missing', () => {
      const writer = new AsyncBatchWriter();
      const validPath = path.join(process.cwd(), 'logs', 'audit.jsonl');
      existsSpy.mockReturnValue(false);
      createSpy.mockReturnValue(makeStream());
      expect(writer.setLogPath(validPath)).toBe(true);
      expect(mkdirSpy).toHaveBeenCalledWith(path.dirname(validPath), { recursive: true });
    });

    it('should end the existing stream before replacing it', () => {
      const writer = new AsyncBatchWriter();
      const oldStream = makeStream();
      writer.setWriteStream(oldStream);
      const validPath = path.join(process.cwd(), 'logs', 'audit.jsonl');
      existsSpy.mockReturnValue(true);
      createSpy.mockReturnValue(makeStream());
      expect(writer.setLogPath(validPath)).toBe(true);
      expect(oldStream.end).toHaveBeenCalled();
    });

    it('should log write stream error events', () => {
      const writer = new AsyncBatchWriter();
      let errorCb;
      const stream = makeStream();
      stream.on.mockImplementation((evt, cb) => {
        if (evt === 'error') errorCb = cb;
      });
      createSpy.mockReturnValue(stream);
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const validPath = path.join(process.cwd(), 'logs', 'audit.jsonl');
      existsSpy.mockReturnValue(true);
      writer.setLogPath(validPath);
      errorCb(new Error('stream broke'));
      expect(errSpy).toHaveBeenCalledWith('[AsyncBatchWriter] Write error:', 'stream broke');
    });

    it('should return false when setup throws', () => {
      const writer = new AsyncBatchWriter();
      existsSpy.mockReturnValue(false);
      mkdirSpy.mockImplementation(() => { throw new Error('mkdir denied'); });
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const validPath = path.join(process.cwd(), 'logs', 'audit.jsonl');
      expect(writer.setLogPath(validPath)).toBe(false);
      expect(errSpy).toHaveBeenCalledWith('[AsyncBatchWriter] Failed to set log path:', 'mkdir denied');
    });
  });

  describe('add', () => {
    it('should push data onto the queue', () => {
      const writer = new AsyncBatchWriter();
      expect(writer.add({ a: 1 })).toBe(true);
      expect(writer.getQueueSize()).toBe(1);
      expect(writer.queue[0]).toEqual({ a: 1 });
    });

    it('should force flush and reject when the queue is full', () => {
      const writer = new AsyncBatchWriter({ maxQueueSize: 2, batchSize: 100 });
      const flushSpy = jest.spyOn(writer, 'flush').mockResolvedValue(2);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      expect(writer.add({ a: 1 })).toBe(true);
      expect(writer.add({ a: 2 })).toBe(true);
      expect(writer.add({ a: 3 })).toBe(false);
      expect(flushSpy).toHaveBeenCalledWith(true);
      expect(warnSpy).toHaveBeenCalledWith('[AsyncBatchWriter] Queue full, forcing flush');
    });

    it('should auto-flush when batch size is reached', () => {
      const writer = new AsyncBatchWriter({ batchSize: 2 });
      const flushSpy = jest.spyOn(writer, 'flush').mockResolvedValue(2);
      writer.add({ a: 1 });
      expect(flushSpy).not.toHaveBeenCalled();
      writer.add({ a: 2 });
      expect(flushSpy).toHaveBeenCalled();
    });

    it('should not flush below the batch size', () => {
      const writer = new AsyncBatchWriter({ batchSize: 100 });
      const flushSpy = jest.spyOn(writer, 'flush').mockResolvedValue(1);
      writer.add({ a: 1 });
      expect(flushSpy).not.toHaveBeenCalled();
      expect(writer.getQueueSize()).toBe(1);
    });
  });

  describe('flush', () => {
    it('should return 0 for an empty queue', async () => {
      const writer = new AsyncBatchWriter();
      expect(await writer.flush()).toBe(0);
    });

    it('should return 0 when already writing and not forced', async () => {
      const writer = new AsyncBatchWriter();
      writer.isWriting = true;
      writer.add({ a: 1 });
      expect(await writer.flush()).toBe(0);
    });

    it('should proceed when forced while writing', async () => {
      const writer = new AsyncBatchWriter();
      writer.isWriting = true;
      writer.add({ a: 1 });
      expect(await writer.flush(true)).toBe(1);
      expect(writer.getStats().totalWritten).toBe(1);
      expect(writer.isWriting).toBe(false);
    });

    it('should write lines and update stats when canWrite', async () => {
      const writer = new AsyncBatchWriter();
      const stream = makeStream();
      writer.setWriteStream(stream);
      writer.add({ a: 1 });
      writer.add({ b: 2 });
      const count = await writer.flush();
      expect(count).toBe(2);
      expect(stream.write).toHaveBeenCalledWith('{"a":1}\n{"b":2}\n');
      const s = writer.getStats();
      expect(s.totalWritten).toBe(2);
      expect(s.batchesFlushed).toBe(1);
      expect(s.avgBatchSize).toBe(2);
      expect(s.pendingWrites).toBe(0);
    });

    it('should wait for drain under backpressure', async () => {
      let drainCb;
      const writer = new AsyncBatchWriter();
      const stream = makeStream({
        write: jest.fn(() => false),
        once: jest.fn((evt, cb) => {
          if (evt === 'drain') drainCb = cb;
        })
      });
      writer.setWriteStream(stream);
      writer.add({ a: 1 });
      const promise = writer.flush();
      expect(drainCb).toBeDefined();
      drainCb();
      await promise;
      expect(writer.getStats().totalWritten).toBe(1);
      expect(writer._pendingWrites).toBe(0);
    });

    it('should flush without a write stream', async () => {
      const writer = new AsyncBatchWriter();
      writer.add({ a: 1 });
      expect(await writer.flush()).toBe(1);
      expect(writer.getStats().totalWritten).toBe(1);
    });

    it('should restore the queue on write failure', async () => {
      const writer = new AsyncBatchWriter();
      const stream = makeStream({ write: jest.fn(() => { throw new Error('disk full'); }) });
      writer.setWriteStream(stream);
      writer.add({ a: 1 });
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(await writer.flush()).toBe(0);
      expect(writer.queue).toHaveLength(1);
      expect(errSpy).toHaveBeenCalledWith('[AsyncBatchWriter] Flush error:', 'disk full');
    });
  });

  describe('auto flush', () => {
    it('should start an interval and flush when queued', () => {
      jest.useFakeTimers();
      const writer = new AsyncBatchWriter({ flushInterval: 1000 });
      const flushSpy = jest.spyOn(writer, 'flush').mockResolvedValue(1);
      writer.add({ a: 1 });
      writer.startAutoFlush();
      expect(writer.flushTimer).toBeTruthy();
      jest.advanceTimersByTime(1000);
      expect(flushSpy).toHaveBeenCalled();
    });

    it('should not flush on an empty queue', () => {
      jest.useFakeTimers();
      const writer = new AsyncBatchWriter({ flushInterval: 1000 });
      const flushSpy = jest.spyOn(writer, 'flush').mockResolvedValue(0);
      writer.startAutoFlush();
      jest.advanceTimersByTime(1000);
      expect(flushSpy).not.toHaveBeenCalled();
    });

    it('should be idempotent when already started', () => {
      jest.useFakeTimers();
      const writer = new AsyncBatchWriter();
      writer.startAutoFlush();
      const timer = writer.flushTimer;
      writer.startAutoFlush();
      expect(writer.flushTimer).toBe(timer);
    });

    it('should clear the timer on stopAutoFlush', () => {
      jest.useFakeTimers();
      const writer = new AsyncBatchWriter();
      writer.startAutoFlush();
      expect(writer.flushTimer).toBeTruthy();
      writer.stopAutoFlush();
      expect(writer.flushTimer).toBeNull();
    });

    it('should be safe to stop without a timer', () => {
      const writer = new AsyncBatchWriter();
      writer.stopAutoFlush();
      expect(writer.flushTimer).toBeNull();
    });
  });

  describe('close', () => {
    it('should flush and end the stream', async () => {
      const writer = new AsyncBatchWriter();
      const stream = makeStream();
      writer.setWriteStream(stream);
      writer.add({ a: 1 });
      const flushSpy = jest.spyOn(writer, 'flush').mockResolvedValue(1);
      await writer.close();
      expect(flushSpy).toHaveBeenCalledWith(true);
      expect(stream.end).toHaveBeenCalled();
      expect(writer.writeStream).toBeNull();
    });

    it('should close without a stream', async () => {
      const writer = new AsyncBatchWriter();
      writer.add({ a: 1 });
      await writer.close();
      expect(writer.writeStream).toBeNull();
    });
  });

  describe('utility methods', () => {
    it('getStats should return a snapshot', () => {
      const writer = new AsyncBatchWriter();
      writer.add({ a: 1 });
      const s = writer.getStats();
      expect(s).toMatchObject({
        totalWritten: 0,
        batchesFlushed: 0,
        avgBatchSize: 0,
        queueSize: 1,
        pendingWrites: 0,
        isWriting: false
      });
    });

    it('clear should empty the queue', () => {
      const writer = new AsyncBatchWriter();
      writer.add({ a: 1 });
      writer.add({ a: 2 });
      writer.clear();
      expect(writer.getQueueSize()).toBe(0);
    });

    it('getQueueSize should return the current size', () => {
      const writer = new AsyncBatchWriter();
      expect(writer.getQueueSize()).toBe(0);
      writer.add({ a: 1 });
      expect(writer.getQueueSize()).toBe(1);
    });
  });
});

describe('BufferedAuditWriter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const writer = new BufferedAuditWriter();
      expect(writer.batchSize).toBe(100);
      expect(writer.flushInterval).toBe(5000);
      expect(writer.maxQueueSize).toBe(10000);
      expect(writer.retentionDays).toBe(30);
      expect(writer.compressionEnabled).toBe(false);
      expect(writer.encryptionKey).toBeNull();
      expect(writer.currentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should map audit-specific options', () => {
      const writer = new BufferedAuditWriter({
        auditBatchSize: 5,
        auditFlushInterval: 100,
        auditMaxMemoryEntries: 50,
        retentionDays: 7,
        compressionEnabled: true,
        encryptionKey: 'secret'
      });
      expect(writer.batchSize).toBe(5);
      expect(writer.flushInterval).toBe(100);
      expect(writer.maxQueueSize).toBe(50);
      expect(writer.retentionDays).toBe(7);
      expect(writer.compressionEnabled).toBe(true);
      expect(writer.encryptionKey).toBe('secret');
    });
  });

  describe('_getDateStr', () => {
    it('should return an ISO date substring', () => {
      const writer = new BufferedAuditWriter();
      expect(writer._getDateStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('_encrypt', () => {
    it('should return data unchanged without an encryption key', () => {
      const writer = new BufferedAuditWriter();
      const data = { action: 'login' };
      expect(writer._encrypt(data)).toBe(data);
    });

    it('should produce iv/data/tag with an encryption key', () => {
      jest.spyOn(crypto, 'createCipheriv').mockReturnValue({
        update: jest.fn(() => 'abc123'),
        final: jest.fn(() => 'def456'),
        getAuthTag: jest.fn(() => Buffer.from('tagval', 'utf8'))
      });
      const writer = new BufferedAuditWriter({ encryptionKey: 'key' });
      const out = writer._encrypt({ action: 'login' });
      expect(out).toEqual({
        iv: expect.any(String),
        data: 'abc123def456',
        tag: '74616776616c'
      });
    });

    it('should throw for AES-CBC which does not support getAuthTag', () => {
      const writer = new BufferedAuditWriter({ encryptionKey: 'key' });
      expect(() => writer._encrypt({ action: 'login' })).toThrow('Invalid state for operation getAuthTag');
    });
  });

  describe('writeEntry', () => {
    it('should add an entry with timestamp metadata', async () => {
      const writer = new BufferedAuditWriter();
      const addSpy = jest.spyOn(writer, 'add').mockReturnValue(true);
      const result = await writer.writeEntry({ action: 'login', user: 'u' });
      expect(result).toBe(true);
      const data = addSpy.mock.calls[0][0];
      expect(data.action).toBe('login');
      expect(data.user).toBe('u');
      expect(typeof data.timestamp).toBe('number');
      expect(data.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should encrypt the entry when an encryption key is set', () => {
      const writer = new BufferedAuditWriter({ encryptionKey: 'key' });
      const encryptSpy = jest.spyOn(writer, '_encrypt').mockReturnValue({});
      writer.writeEntry({ action: 'login' });
      expect(encryptSpy).toHaveBeenCalled();
    });
  });

  describe('rotateLogFile', () => {
    it('should return null on the same date', () => {
      const writer = new BufferedAuditWriter();
      expect(writer.rotateLogFile()).toBeNull();
    });

    it('should switch to a new file when the date changes', () => {
      const writer = new BufferedAuditWriter();
      writer.currentDate = '2026-08-24';
      const dateSpy = jest.spyOn(writer, '_getDateStr').mockReturnValue('2026-08-25');
      const setSpy = jest.spyOn(writer, 'setLogPath').mockReturnValue(true);
      const result = writer.rotateLogFile();
      expect(result).toBe('logs/mcp-audit-2026-08-25.jsonl');
      expect(dateSpy).toHaveBeenCalled();
      expect(setSpy).toHaveBeenCalledWith('logs/mcp-audit-2026-08-25.jsonl');
      expect(writer.currentDate).toBe('2026-08-25');
    });
  });

  describe('cleanupOldFiles', () => {
    it('should return undefined when the dir is missing', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      const writer = new BufferedAuditWriter();
      expect(writer.cleanupOldFiles('logs')).toBeUndefined();
    });

    it('should return 0 when no audit files match', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['other.txt', 'data.json']);
      const writer = new BufferedAuditWriter();
      expect(writer.cleanupOldFiles()).toBe(0);
    });

    it('should delete only expired files', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        'mcp-audit-2020-01-01.jsonl',
        'mcp-audit-2026-08-24.jsonl'
      ]);
      jest.spyOn(fs, 'statSync').mockImplementation((p) => ({
        mtime: String(p).includes('2020')
          ? new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
          : new Date()
      }));
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const writer = new BufferedAuditWriter({ retentionDays: 30 });
      expect(writer.cleanupOldFiles('logs')).toBe(1);
      expect(unlinkSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('[BufferedAuditWriter] Deleted expired log: mcp-audit-2020-01-01.jsonl');
    });

    it('should return 0 when cleanup throws', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockImplementation(() => { throw new Error('read fail'); });
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const writer = new BufferedAuditWriter();
      expect(writer.cleanupOldFiles('logs')).toBe(0);
      expect(errSpy).toHaveBeenCalledWith('[BufferedAuditWriter] Cleanup error:', 'read fail');
    });
  });
});