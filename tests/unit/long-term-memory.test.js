const fs = require('fs');
const os = require('os');
const path = require('path');

const { LongTermMemory } = require('../../src/memory/LongTermMemory');

describe('LongTermMemory', () => {
  let tmpDir;
  let mem;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltm-'));
    mem = new LongTermMemory({ storageDir: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeMem(overrides = {}) {
    return new LongTermMemory({ storageDir: tmpDir, ...overrides });
  }

  test('constructor creates all memory subdirectories', () => {
    for (const dir of ['episodic', 'semantic', 'working', 'archive']) {
      expect(fs.existsSync(path.join(tmpDir, dir))).toBe(true);
    }
  });

  test('constructor honors options with defaults', () => {
    const m = makeMem({ maxMemorySize: 5, retentionDays: 7, enableCompression: false });
    expect(m.options.maxMemorySize).toBe(5);
    expect(m.options.retentionDays).toBe(7);
    expect(m.options.enableCompression).toBe(false);
    expect(m.options.storageDir).toBe(tmpDir);
  });

  test('constructor defaults compression enabled', () => {
    const m = makeMem();
    expect(m.options.enableCompression).toBe(true);
    expect(m.options.maxMemorySize).toBe(10000);
    expect(m.options.retentionDays).toBe(90);
  });

  test('constructor falls back to default storage dir and options', () => {
    const prev = process.cwd();
    try {
      process.chdir(tmpDir);
      const m = new LongTermMemory();
      expect(m.options.storageDir).toBe('./memory');
      expect(m.options.maxMemorySize).toBe(10000);
      expect(m.options.retentionDays).toBe(90);
      expect(fs.existsSync(path.join(tmpDir, 'memory', 'episodic'))).toBe(true);
    } finally {
      process.chdir(prev);
    }
  });

  test('store persists memory file and updates index', async () => {
    const { id } = await mem.store('hello world', { userId: 'u1', tags: ['greet'], importance: 0.8 });
    expect(id).toMatch(/^mem_\d+/);
    const file = path.join(tmpDir, 'episodic', `${id}.json`);
    expect(fs.existsSync(file)).toBe(true);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(data.content).toBe('hello world');
    expect(data.type).toBe('episodic');
    expect(data.userId).toBe('u1');
    expect(data.tags).toEqual(['greet']);
    expect(data.importance).toBe(0.8);
    expect(data.accessCount).toBe(0);
    expect(Array.isArray(data.embedding)).toBe(true);
    expect(data.embedding.length).toBe(128);
    expect(mem.metadata.totalMemories).toBe(1);
  });

  test('store accepts custom type and embedding', async () => {
    const custom = new Array(128).fill(0.5);
    const { id } = await mem.store('semantic thing', { type: 'semantic', embedding: custom });
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'semantic', `${id}.json`), 'utf8'));
    expect(data.type).toBe('semantic');
    expect(data.embedding).toEqual(custom);
  });

  test('store works with no options', async () => {
    const { id } = await mem.store('plain memory');
    expect(id).toMatch(/^mem_\d+/);
    expect(mem.index.get(id).type).toBe('episodic');
    expect(mem.index.get(id).userId).toBe('default');
  });

  test('store triggers cleanup when exceeding maxMemorySize', async () => {
    const m = makeMem({ maxMemorySize: 3, retentionDays: 1 });
    m.cleanup = jest.fn(async () => 0);
    for (let i = 0; i < 5; i++) {
      await m.store(`memory ${i}`, { userId: 'u1' });
    }
    expect(m.cleanup).toHaveBeenCalled();
  });

  test('retrieve finds matching memory and updates access count', async () => {
    await mem.store('the cat sat on the mat', { userId: 'u1' });
    const results = await mem.retrieve('cat mat', { userId: 'u1' });
    expect(results.length).toBeGreaterThan(0);
    const top = results[0];
    expect(top.memory.content).toContain('cat');
    expect(top.similarity).toBeGreaterThan(0);
    expect(top.score).toBe(top.similarity * top.memory.importance);
    expect(top.memory.accessCount).toBe(1);
  });

  test('retrieve filters by type', async () => {
    await mem.store('hello world', { type: 'episodic', userId: 'u1' });
    await mem.store('hello world', { type: 'semantic', userId: 'u1' });
    const episodic = await mem.retrieve('hello world', { type: 'episodic' });
    const semantic = await mem.retrieve('hello world', { type: 'semantic' });
    expect(episodic.every((r) => r.memory.type === 'episodic')).toBe(true);
    expect(semantic.every((r) => r.memory.type === 'semantic')).toBe(true);
  });

  test('retrieve skips index entries whose file is missing', async () => {
    await mem.store('hello world', { userId: 'u1' });
    mem.index.set('mem_orphan', { type: 'episodic', userId: 'u1', entityId: null, tags: [], importance: 0.5, path: mem.getMemoryPath('mem_orphan', 'episodic') });
    const results = await mem.retrieve('hello world');
    expect(results.some((r) => r.id === 'mem_orphan')).toBe(false);
  });

  test('retrieve filters by userId', async () => {
    await mem.store('shared greeting', { userId: 'alice' });
    await mem.store('shared greeting', { userId: 'bob' });
    const alice = await mem.retrieve('shared greeting', { userId: 'alice' });
    expect(alice).toHaveLength(1);
    expect(alice[0].memory.userId).toBe('alice');
  });

  test('retrieve respects threshold and limit', async () => {
    for (let i = 0; i < 20; i++) {
      await mem.store(`completely unrelated content item number ${i}`, { userId: 'u1' });
    }
    const strict = await mem.retrieve('the cat sat on the mat', { threshold: 0.99, limit: 3 });
    expect(strict.length).toBe(0);
    const loose = await mem.retrieve('the cat sat on the mat', { threshold: -1, limit: 3 });
    expect(loose.length).toBeLessThanOrEqual(3);
  });

  test('retrieve sorts results by score descending', async () => {
    await mem.store('dog barks loudly', { importance: 0.9, userId: 'u1' });
    await mem.store('dog barks loudly too', { importance: 0.1, userId: 'u1' });
    const results = await mem.retrieve('dog barks loudly', { threshold: 0 });
    const scores = results.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  test('retrieve tolerates corrupt memory files', async () => {
    await mem.store('hello world', { userId: 'u1' });
    const dir = path.join(tmpDir, 'episodic');
    fs.writeFileSync(path.join(dir, 'corrupt.json'), '{ not json', 'utf8');
    const results = await mem.retrieve('hello world');
    expect(results).toHaveLength(1);
  });

  test('retrieve catches corrupt memory referenced in index', async () => {
    const { id } = await mem.store('hello world', { userId: 'u1' });
    fs.writeFileSync(mem.getMemoryPath(id, 'episodic'), '{ not json', 'utf8');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const results = await mem.retrieve('hello world');
    expect(results).toHaveLength(0);
    errorSpy.mockRestore();
  });

  test('search matches by tags', async () => {
    await mem.store('alpha', { tags: ['important'], userId: 'u1' });
    await mem.store('beta', { tags: ['other'], userId: 'u1' });
    const results = await mem.search('', { tags: ['important'] });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('alpha');
  });

  test('search works with no options', async () => {
    await mem.store('anything', { userId: 'u1' });
    const results = await mem.search('anything');
    expect(results).toHaveLength(1);
  });

  test('search skips index entries whose file is missing', async () => {
    await mem.store('anything', { userId: 'u1' });
    mem.index.set('mem_orphan2', { type: 'episodic', userId: 'u1', entityId: null, tags: [], importance: 0.5, path: mem.getMemoryPath('mem_orphan2', 'episodic') });
    const results = await mem.search('');
    expect(results.some((r) => r.id === 'mem_orphan2')).toBe(false);
  });

  test('search matches by entityId', async () => {
    await mem.store('alpha', { entityId: 'ent-1', userId: 'u1' });
    await mem.store('beta', { entityId: 'ent-2', userId: 'u1' });
    const results = await mem.search('', { entityId: 'ent-2' });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('beta');
  });

  test('search matches by userId (regression)', async () => {
    await mem.store('alpha', { userId: 'alice' });
    await mem.store('beta', { userId: 'bob' });
    const results = await mem.search('', { userId: 'alice' });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('alpha');
  });

  test('getUserMemories filters by user (regression)', async () => {
    await mem.store('alice note', { userId: 'alice' });
    await mem.store('bob note', { userId: 'bob' });
    const results = await mem.getUserMemories('alice');
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('alice note');
  });

  test('search honors limit', async () => {
    for (let i = 0; i < 5; i++) {
      await mem.store(`item ${i}`, { userId: 'u1' });
    }
    const results = await mem.search('', { userId: 'u1', limit: 2 });
    expect(results).toHaveLength(2);
  });

  test('search skips corrupt memory files', async () => {
    await mem.store('good', { tags: ['t'], userId: 'u1' });
    const goodId = mem.index.keys().next().value;
    const file = mem.getMemoryPath(goodId, 'episodic');
    fs.writeFileSync(file, '{ broken', 'utf8');
    const results = await mem.search('', { tags: ['t'] });
    expect(results).toHaveLength(0);
  });

  test('update modifies an existing memory', async () => {
    const { id } = await mem.store('original', { userId: 'u1' });
    const updated = await mem.update(id, { content: 'revised', importance: 0.9 });
    expect(updated.content).toBe('revised');
    expect(updated.importance).toBe(0.9);
    const reloaded = JSON.parse(fs.readFileSync(mem.getMemoryPath(id, 'episodic'), 'utf8'));
    expect(reloaded.content).toBe('revised');
  });

  test('update returns null when memory not found in any type', async () => {
    const result = await mem.update('mem_00000000_00000000', { content: 'x' });
    expect(result).toBeNull();
  });

  test('delete removes memory file and index entry', async () => {
    const { id } = await mem.store('to delete', { userId: 'u1' });
    expect(await mem.delete(id)).toBe(true);
    expect(fs.existsSync(mem.getMemoryPath(id, 'episodic'))).toBe(false);
    expect(mem.index.has(id)).toBe(false);
    expect(mem.metadata.totalMemories).toBe(0);
  });

  test('delete returns false when memory does not exist', async () => {
    expect(await mem.delete('mem_missing')).toBe(false);
  });

  test('getEntityMemories returns entity-scoped memories', async () => {
    await mem.store('one', { entityId: 'e1', userId: 'u1' });
    await mem.store('two', { entityId: 'e2', userId: 'u1' });
    const results = await mem.getEntityMemories('e1');
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('one');
  });

  test('cleanup archives stale low-access memories', async () => {
    const m = makeMem({ retentionDays: 0 });
    const { id } = await m.store('old memory', { userId: 'u1' });
    const stale = m.loadMemory(id, 'episodic');
    stale.updatedAt = Date.now() - 100000;
    m.saveMemory(stale);
    const count = await m.cleanup();
    expect(count).toBe(1);
    expect(m.index.get(id).type).toBe('archive');
    expect(fs.existsSync(m.getMemoryPath(id, 'archive'))).toBe(true);
  });

  test('cleanup keeps recent or frequently accessed memories', async () => {
    const m = makeMem({ retentionDays: 0 });
    const { id: staleId } = await m.store('old one', { userId: 'u1' });
    const { id } = await m.store('old two', { userId: 'u1' });
    const staleMem = m.loadMemory(staleId, 'episodic');
    staleMem.updatedAt = Date.now() - 100000;
    m.saveMemory(staleMem);
    const fresh = m.loadMemory(id, 'episodic');
    fresh.updatedAt = Date.now() - 100000;
    fresh.accessCount = 5;
    m.saveMemory(fresh);
    const count = await m.cleanup();
    expect(count).toBe(1);
    expect(m.index.get(id).type).toBe('episodic');
    expect(m.index.get(staleId).type).toBe('archive');
  });

  test('cleanup sets lastCleanup timestamp', async () => {
    const before = mem.metadata.lastCleanup;
    await mem.cleanup();
    expect(mem.metadata.lastCleanup).toBeGreaterThanOrEqual(before);
  });

  test('archive moves memory to archive type', async () => {
    const { id } = await mem.store('archived soon', { userId: 'u1' });
    expect(await mem.archive(id)).toBe(true);
    expect(mem.index.get(id).type).toBe('archive');
    expect(fs.existsSync(mem.getMemoryPath(id, 'archive'))).toBe(true);
    expect(fs.existsSync(mem.getMemoryPath(id, 'episodic'))).toBe(false);
  });

  test('archive returns false when memory not found', async () => {
    expect(await mem.archive('mem_missing')).toBe(false);
  });

  test('getMemoryPath builds path under type dir', () => {
    expect(mem.getMemoryPath('mem_1', 'semantic')).toBe(path.join(tmpDir, 'semantic', 'mem_1.json'));
  });

  test('loadMemory returns null for missing file', () => {
    expect(mem.loadMemory('mem_1', 'episodic')).toBeNull();
  });

  test('loadMemory parses existing file', async () => {
    const { id } = await mem.store('loaded', { userId: 'u1' });
    const loaded = mem.loadMemory(id, 'episodic');
    expect(loaded.content).toBe('loaded');
  });

  test('saveMemory writes memory to disk', async () => {
    const memory = { id: 'mem_custom', type: 'working', content: 'saved', embedding: new Array(128).fill(0) };
    mem.saveMemory(memory);
    const onDisk = JSON.parse(fs.readFileSync(mem.getMemoryPath('mem_custom', 'working'), 'utf8'));
    expect(onDisk.content).toBe('saved');
  });

  test('generateSimpleEmbedding is deterministic and normalized', () => {
    const a = mem.generateSimpleEmbedding('the cat');
    const b = mem.generateSimpleEmbedding('the cat');
    expect(a).toEqual(b);
    const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  test('generateSimpleEmbedding handles empty text', () => {
    const e = mem.generateSimpleEmbedding('');
    expect(e).toHaveLength(128);
    expect(e.every((v) => v === e[0])).toBe(true);
  });

  test('hashString is deterministic and non-negative', () => {
    expect(mem.hashString('hello')).toBe(mem.hashString('hello'));
    expect(mem.hashString('hello')).toBeGreaterThanOrEqual(0);
    expect(mem.hashString('')).toBe(0);
  });

  test('cosineSimilarity returns 1 for identical vectors', () => {
    const a = mem.generateSimpleEmbedding('same words here');
    expect(mem.cosineSimilarity(a, a)).toBeCloseTo(1, 5);
  });

  test('cosineSimilarity returns 0 for invalid inputs', () => {
    expect(mem.cosineSimilarity(null, null)).toBe(0);
    expect(mem.cosineSimilarity([1, 2], [1])).toBe(0);
  });

  test('cosineSimilarity handles zero vectors', () => {
    const zero = new Array(128).fill(0);
    const a = mem.generateSimpleEmbedding('some words');
    expect(mem.cosineSimilarity(zero, a)).toBe(0);
    expect(mem.cosineSimilarity(a, zero)).toBe(0);
  });

  test('cosineSimilarity is low for unrelated vectors', () => {
    const a = mem.generateSimpleEmbedding('quick brown fox jumps');
    const b = mem.generateSimpleEmbedding('distant planet orbit');
    expect(mem.cosineSimilarity(a, b)).toBeLessThan(0.5);
  });

  test('generateMemoryId produces unique ids', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(mem.generateMemoryId());
    }
    expect(ids.size).toBe(100);
  });

  test('getStats reports totals and per-type breakdown', async () => {
    await mem.store('a', { type: 'episodic', userId: 'u1' });
    await mem.store('b', { type: 'semantic', userId: 'u1' });
    await mem.store('c', { type: 'episodic', userId: 'u1' });
    const stats = mem.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byType).toEqual({ episodic: 2, semantic: 1 });
    expect(typeof stats.lastCleanup).toBe('number');
  });
});
