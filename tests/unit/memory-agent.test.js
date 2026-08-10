const fs = require('fs');
const os = require('os');
const path = require('path');

describe('src/agents/MemoryAgent', () => {
  let tmpDir;
  let memoryPath;
  let MemoryAgent;
  let agent;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-agent-'));
    memoryPath = path.join(tmpDir, '.opencode', 'memory.json');
    jest.isolateModules(() => {
      MemoryAgent = require('../../src/agents/MemoryAgent');
    });
    agent = new MemoryAgent({ memoryPath });
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  });

  describe('constructor', () => {
    test('creates agent with empty memory', () => {
      expect(agent.memory).toEqual({});
      expect(agent.pageSize).toBe(50);
    });

    test('uses custom pageSize', () => {
      const a = new MemoryAgent({ memoryPath, pageSize: 10 });
      expect(a.pageSize).toBe(10);
    });

    test('defaults to cwd memory path', () => {
      const a = new MemoryAgent();
      expect(a.memoryPath).toBe(path.resolve(process.cwd(), '.opencode', 'memory.json'));
    });
  });

  describe('remember / retrieve', () => {
    test('stores and retrieves value', () => {
      expect(agent.remember('name', 'ultrawork')).toBe(true);
      expect(agent.retrieve('name')).toBe('ultrawork');
    });

    test('rejects invalid keys', () => {
      expect(agent.remember('__proto__', 'x')).toBe(false);
      expect(agent.remember('constructor', 'x')).toBe(false);
      expect(agent.remember('has spaces', 'x')).toBe(false);
      expect(agent.remember('', 'x')).toBe(false);
    });

    test('rejects keys longer than 200 chars', () => {
      const longKey = 'a'.repeat(201);
      expect(agent.remember(longKey, 'x')).toBe(false);
    });

    test('rejects non-string keys', () => {
      expect(agent.remember(123, 'x')).toBe(false);
    });

    test('rejects oversized values', () => {
      const big = 'x'.repeat(50001);
      expect(agent.remember('big', big)).toBe(false);
    });

    test('accepts null values', () => {
      expect(agent.remember('empty', null)).toBe(true);
    });

    test('persists to file', () => {
      agent.remember('k', 'v');
      expect(fs.existsSync(memoryPath)).toBe(true);
    });

    test('loads persisted memory on construction', () => {
      agent.remember('k', 'v');
      const a2 = new MemoryAgent({ memoryPath });
      expect(a2.retrieve('k')).toBe('v');
    });
  });

  describe('deepSanitize on values', () => {
    test('strips prototype pollution keys from objects', () => {
      const dirty = JSON.parse('{"safe":1,"__proto__":{"polluted":true}}');
      agent.remember('dirty', dirty);
      expect(agent.retrieve('dirty')).toEqual({ safe: 1 });
      expect({}.polluted).toBeUndefined();
    });

    test('deep sanitizes arrays', () => {
      const dirtyArr = [{ a: 1 }, { b: 2 }];
      agent.remember('arr', dirtyArr);
      expect(agent.retrieve('arr')).toEqual([{ a: 1 }, { b: 2 }]);
    });

    test('passes through primitives', () => {
      expect(agent.remember('n', 42)).toBe(true);
      expect(agent.retrieve('n')).toBe(42);
    });
  });

  describe('remove / clear / dump', () => {
    test('remove deletes key and persists', () => {
      agent.remember('a', '1');
      agent.remember('b', '2');
      agent.remove('a');
      expect(agent.retrieve('a')).toBeUndefined();
      expect(agent.retrieve('b')).toBe('2');
    });

    test('clear empties memory', () => {
      agent.remember('a', '1');
      agent.clear();
      expect(agent.dump()).toEqual({});
    });

    test('dump returns all entries', () => {
      agent.remember('a', '1');
      expect(agent.dump()).toEqual({ a: '1' });
    });
  });

  describe('list', () => {
    test('returns all with pagination', () => {
      for (let i = 0; i < 3; i++) agent.remember(`key${i}`, `value${i}`);
      const res = agent.list();
      expect(res.items).toHaveLength(3);
      expect(res.pagination.total).toBe(3);
      expect(res.pagination.page).toBe(1);
    });

    test('filters by query', () => {
      agent.remember('alpha', 'one');
      agent.remember('beta', 'two');
      const res = agent.list({ query: 'beta' });
      expect(res.items).toHaveLength(1);
      expect(res.items[0].key).toBe('beta');
    });

    test('paginates with page and pageSize', () => {
      for (let i = 0; i < 10; i++) agent.remember(`key${i}`, i);
      const page1 = agent.list({ page: 1, pageSize: 4 });
      expect(page1.items).toHaveLength(4);
      expect(page1.pagination.hasNext).toBe(true);
      const page3 = agent.list({ page: 3, pageSize: 4 });
      expect(page3.items).toHaveLength(2);
      expect(page3.pagination.hasPrev).toBe(true);
    });

    test('caps pageSize at 100', () => {
      for (let i = 0; i < 5; i++) agent.remember(`key${i}`, i);
      const res = agent.list({ pageSize: 1000 });
      expect(res.pagination.pageSize).toBe(100);
    });

    test('clamps page to minimum 1', () => {
      for (let i = 0; i < 5; i++) agent.remember(`key${i}`, i);
      const res = agent.list({ page: 0 });
      expect(res.pagination.page).toBe(1);
    });

    test('includes timestamp from value.at', () => {
      agent.remember('dated', { at: '2026-01-01', val: 1 });
      const res = agent.list();
      expect(res.items[0].timestamp).toBe('2026-01-01');
    });
  });

  describe('export', () => {
    test('exports JSON by default', () => {
      agent.remember('k', 'v');
      const out = agent.export();
      expect(JSON.parse(out)).toEqual({ k: 'v' });
    });

    test('exports CSV', () => {
      agent.remember('k', 'v');
      const out = agent.export('csv');
      expect(out).toContain('key,value,timestamp');
      expect(out).toContain('"k"');
      expect(out).toContain('"v"');
    });

    test('exports CSV with timestamp for dated value', () => {
      agent.remember('dated', { at: '2026-01-01' });
      const out = agent.export('csv');
      expect(out).toContain('2026-01-01');
    });

    test('exports JSON with pretty formatting', () => {
      agent.remember('k', 'v');
      const out = agent.export('json');
      expect(out).toBe('{\n  "k": "v"\n}');
    });
  });

  describe('streamExport', () => {
    test('streams JSON entries', () => {
      agent.remember('a', '1');
      agent.remember('b', '2');
      const chunks = [...agent.streamExport('json')];
      expect(chunks[0]).toBe('{"data":\n');
      expect(chunks[chunks.length - 1]).toBe('}');
      const joined = chunks.join('');
      expect(joined).toContain('"key":"a"');
      expect(joined).toContain('"key":"b"');
    });

    test('defaults to JSON streaming when format omitted', () => {
      agent.remember('a', '1');
      const chunks = [...agent.streamExport()];
      expect(chunks[0]).toBe('{"data":\n');
    });

    test('streams CSV rows', () => {
      agent.remember('a', '1');
      const chunks = [...agent.streamExport('csv')].join('');
      expect(chunks.startsWith('key,value,timestamp')).toBe(true);
      expect(chunks).toContain('"a"');
      expect(chunks).toContain('"1"');
    });

    test('streams CSV with timestamp column', () => {
      agent.remember('dated', { at: '2026-01-01' });
      const chunks = [...agent.streamExport('csv')].join('');
      expect(chunks).toContain('2026-01-01');
    });
  });

  describe('getStats', () => {
    test('returns total and keys', () => {
      agent.remember('a', '1');
      agent.remember('b', '2');
      const stats = agent.getStats();
      expect(stats.total).toBe(2);
      expect(stats.keys.sort()).toEqual(['a', 'b']);
    });
  });

  describe('error tolerance', () => {
    test('load handles missing file', () => {
      expect(agent.memory).toEqual({});
    });

    test('load handles corrupt file', () => {
      fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
      fs.writeFileSync(memoryPath, 'not json{{');
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const a = new MemoryAgent({ memoryPath });
      expect(a.memory).toEqual({});
      warnSpy.mockRestore();
    });

    test('persist handles write failure', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('denied');
      });
      agent.remember('k', 'v');
      expect(errorSpy).toHaveBeenCalled();
      writeSpy.mockRestore();
      errorSpy.mockRestore();
    });

    test('load handles readFileSync throw', () => {
      fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
      fs.writeFileSync(memoryPath, '{}');
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('io error');
      });
      const a = new MemoryAgent({ memoryPath });
      expect(a.memory).toEqual({});
      readSpy.mockRestore();
      warnSpy.mockRestore();
    });

    test('rejects remember when memory limit reached', () => {
      for (let i = 0; i < 10000; i++) agent.memory[`k${i}`] = i;
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      expect(agent.remember('overflow', 'x')).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});

describe('src/agents/MemoryAgent (encryption enabled)', () => {
  let tmpDir;
  let memoryPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-agent-enc-'));
    memoryPath = path.join(tmpDir, 'mem.json');
    process.env.MEMORY_ENCRYPTION_KEY = 'test-secret-key';
  });

  afterEach(() => {
    delete process.env.MEMORY_ENCRYPTION_KEY;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  });

  test('writes encrypted payload and decrypts on load', () => {
    let MemoryAgent;
    jest.isolateModules(() => {
      MemoryAgent = require('../../src/agents/MemoryAgent');
    });
    const agent = new MemoryAgent({ memoryPath });
    agent.remember('secret', 'value');

    const raw = fs.readFileSync(memoryPath, 'utf8');
    expect(raw).not.toContain('value');
    expect(raw).toContain('"iv"');

    const agent2 = new MemoryAgent({ memoryPath });
    expect(agent2.retrieve('secret')).toBe('value');
  });

  test('decrypt falls back to plaintext when payload unencrypted', () => {
    let MemoryAgent;
    jest.isolateModules(() => {
      MemoryAgent = require('../../src/agents/MemoryAgent');
    });
    fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
    fs.writeFileSync(memoryPath, '{"plain":"text"}');
    const agent = new MemoryAgent({ memoryPath });
    expect(agent.retrieve('plain')).toBe('text');
  });

  test('decrypt returns {} on garbage payload', () => {
    let MemoryAgent;
    jest.isolateModules(() => {
      MemoryAgent = require('../../src/agents/MemoryAgent');
    });
    fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
    fs.writeFileSync(memoryPath, 'garbage-not-json');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const agent = new MemoryAgent({ memoryPath });
    expect(agent.memory).toEqual({});
    warnSpy.mockRestore();
  });

  test('encrypt falls back to plaintext when cipher fails', () => {
    const crypto = require('crypto');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const cipherSpy = jest.spyOn(crypto, 'createCipheriv').mockImplementation(() => {
      throw new Error('cipher unavailable');
    });
    let MemoryAgent;
    jest.isolateModules(() => {
      MemoryAgent = require('../../src/agents/MemoryAgent');
    });
    const agent = new MemoryAgent({ memoryPath });
    expect(agent.remember('k', 'v')).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      '[MemoryAgent] Encryption failed, storing unencrypted:',
      'cipher unavailable'
    );
    const raw = fs.readFileSync(memoryPath, 'utf8');
    expect(JSON.parse(raw)).toEqual({ k: 'v' });
    cipherSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
