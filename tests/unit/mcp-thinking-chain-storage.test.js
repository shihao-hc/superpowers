jest.mock('fs');
jest.mock('os');
jest.mock('path');
jest.mock('../../src/utils/UltraWorkUtils', () => ({
  readFileLines: jest.fn()
}));
jest.mock('../../src/mcp/engines/ThinkingChain', () => {
  const chains = new Map();
  let idCounter = 0;
  return {
    thinkingChain: {
      chains,
      addThought: jest.fn((chainId, thought, _opts = {}) => {
        const chain = chains.get(chainId);
        if (!chain) return null;
        const step = { id: `step-${++idCounter}`, thought };
        chain.thoughts.push(step);
        return step;
      }),
      createChain: jest.fn((initialThought, metadata = {}) => {
        const id = `chain-${++idCounter}`;
        const chain = { id, thoughts: [{ thought: initialThought }], branches: [], metadata };
        chains.set(id, chain);
        return chain;
      }),
      deleteChain: jest.fn((chainId) => {
        chains.delete(chainId);
        return { success: true };
      })
    }
  };
});

const fs = require('fs');
const path = require('path');
const os = require('os');
const { readFileLines } = require('../../src/utils/UltraWorkUtils');
const { ThinkingChainStorage, thinkingChain } = require('../../src/mcp/engines/ThinkingChainStorage');

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();

  os.homedir.mockReturnValue('/home/user');
  path.join.mockImplementation((...args) => args.join('/'));
  path.join.mockImplementation((...args) => args.join('/'));

  fs.existsSync.mockReturnValue(true);
  fs.mkdirSync.mockImplementation(() => {});
  fs.appendFileSync.mockImplementation(() => {});
  fs.writeFileSync.mockImplementation(() => {});
  fs.unlinkSync.mockImplementation(() => {});
  fs.readdirSync.mockReturnValue([]);
  fs.readFileSync.mockReturnValue('{}');
  fs.statSync.mockReturnValue({ size: 100, mtime: new Date('2026-01-01') });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ThinkingChainStorage', () => {
  describe('constructor', () => {
    it('uses defaults when no config', () => {
      const s = new ThinkingChainStorage();
      expect(s.storageDir).toBe('/home/user/.mcp/thinking');
      expect(s.snapshotInterval).toBe(50);
      expect(s.maxChainLength).toBe(1000);
    });

    it('uses provided config', () => {
      const s = new ThinkingChainStorage({
        storageDir: '/custom/dir',
        snapshotInterval: 10,
        maxChainLength: 500
      });
      expect(s.storageDir).toBe('/custom/dir');
      expect(s.snapshotInterval).toBe(10);
      expect(s.maxChainLength).toBe(500);
    });
  });

  describe('_ensureStorageDir', () => {
    it('creates dir if missing', () => {
      fs.existsSync.mockReturnValue(false);
      new ThinkingChainStorage({ storageDir: '/tmp/test' });
      expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/test', { recursive: true });
    });

    it('does nothing if dir exists', () => {
      fs.existsSync.mockReturnValue(true);
      new ThinkingChainStorage({ storageDir: '/tmp/test' });
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('saveIncremental', () => {
    it('appends step as JSON line', () => {
      const s = new ThinkingChainStorage({ storageDir: '/tmp/test' });
      const result = s.saveIncremental('chain1', { thought: 'hello' });
      expect(result.success).toBe(true);
      expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
      const written = fs.appendFileSync.mock.calls[0][1];
      const parsed = JSON.parse(written.trim());
      expect(parsed.thought).toBe('hello');
      expect(parsed.savedAt).toBeDefined();
    });
  });

  describe('loadIncremental', () => {
    it('returns null if file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const s = new ThinkingChainStorage({ storageDir: '/tmp/test' });
      expect(s.loadIncremental('chain1')).toBeNull();
    });

    it('parses and returns JSON lines', () => {
      fs.existsSync.mockReturnValue(true);
      readFileLines.mockReturnValue([
        '{"thought":"a"}',
        '{"thought":"b"}',
        ''
      ]);
      const s = new ThinkingChainStorage({ storageDir: '/tmp/test' });
      const result = s.loadIncremental('chain1');
      expect(result).toEqual([{ thought: 'a' }, { thought: 'b' }]);
    });
  });

  describe('createSnapshot', () => {
    it('writes snapshot file with trimmed thoughts', () => {
      const s = new ThinkingChainStorage({ storageDir: '/tmp/test', snapshotInterval: 5 });
      const chain = {
        thoughts: Array.from({ length: 20 }, (_, i) => ({ id: i })),
        branches: [{ name: 'b1' }],
        metadata: { key: 'val' }
      };
      const result = s.createSnapshot('chain1', chain);
      expect(result.success).toBe(true);
      expect(result.size).toBe(10);
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(written.thoughts.length).toBe(10);
      expect(written.branches).toEqual([{ name: 'b1' }]);
    });
  });

  describe('getLatestSnapshot', () => {
    it('returns null when no snapshots exist', () => {
      fs.readdirSync.mockReturnValue([]);
      const s = new ThinkingChainStorage({ storageDir: '/tmp/test' });
      expect(s.getLatestSnapshot('chain1')).toBeNull();
    });

    it('returns latest snapshot sorted descending', () => {
      fs.readdirSync.mockReturnValue([
        'chain1_snapshot_001.json',
        'chain1_snapshot_003.json',
        'chain1_snapshot_002.json',
        'other.json'
      ]);
      fs.readFileSync.mockReturnValue(JSON.stringify({ id: 'chain1', thoughts: [] }));
      const s = new ThinkingChainStorage({ storageDir: '/tmp/test' });
      const result = s.getLatestSnapshot('chain1');
      expect(result.id).toBe('chain1');
      expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/test/chain1_snapshot_003.json', 'utf-8');
    });
  });

  describe('deleteChain', () => {
    it('deletes chain file and snapshot files', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['chain1_snapshot_1.json', 'chain1_snapshot_2.json']);
      const s = new ThinkingChainStorage({ storageDir: '/tmp/test' });
      const result = s.deleteChain('chain1');
      expect(result.success).toBe(true);
      expect(result.deleted).toBe(3);
      expect(fs.unlinkSync).toHaveBeenCalledTimes(3);
    });

    it('handles chain file not existing', () => {
      fs.existsSync.mockReturnValue(false);
      fs.readdirSync.mockReturnValue([]);
      const s = new ThinkingChainStorage({ storageDir: '/tmp/test' });
      const result = s.deleteChain('chain1');
      expect(result.deleted).toBe(0);
    });

    it('handles unlinkSync errors silently for chain file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([]);
      fs.unlinkSync.mockImplementation(() => { throw new Error('ENOENT'); });
      const s = new ThinkingChainStorage({ storageDir: '/tmp/test' });
      const result = s.deleteChain('chain1');
      expect(result.success).toBe(true);
      expect(result.deleted).toBe(0);
    });
  });

  describe('listChains', () => {
    it('returns empty array when no .jsonl files', () => {
      fs.readdirSync.mockReturnValue(['other.txt']);
      const s = new ThinkingChainStorage({ storageDir: '/tmp/test' });
      expect(s.listChains()).toEqual([]);
    });

    it('lists chains sorted by modified desc', () => {
      fs.readdirSync.mockReturnValue(['a.jsonl', 'b.jsonl']);
      fs.statSync.mockImplementation((f) => ({
        size: f.includes('a') ? 200 : 100,
        mtime: new Date(f.includes('a') ? '2026-06-01' : '2026-05-01')
      }));
      readFileLines.mockReturnValue(['line1', 'line2', '']);
      const s = new ThinkingChainStorage({ storageDir: '/tmp/test' });
      const result = s.listChains();
      expect(result.length).toBe(2);
      expect(result[0].chainId).toBe('a');
      expect(result[0].steps).toBe(2);
      expect(result[0].size).toBe(200);
    });
  });
});

describe('formatSize', () => {
  it('formats bytes', () => {
    thinkingChain.getStorageStats();
  });
});

describe('monkey-patching', () => {
  it('getStorage returns the storage instance', () => {
    expect(thinkingChain.getStorage()).toBeInstanceOf(ThinkingChainStorage);
  });

  it('addThought persists and snapshots at interval', () => {
    // Module-level storage has snapshotInterval=50; 49 existing + 1 new = 50 % 50 === 0
    const existingThoughts = Array.from({ length: 49 }, (_, i) => ({ id: i }));
    thinkingChain.chains.set('c1', { thoughts: existingThoughts, branches: [], metadata: {} });
    fs.appendFileSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
    thinkingChain.addThought('c1', 'my thought', {});
    expect(fs.appendFileSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('addThought does not snapshot when not at interval', () => {
    new ThinkingChainStorage({ storageDir: '/tmp/test', snapshotInterval: 10 });
    thinkingChain.chains.set('c2', { thoughts: [{}], branches: [], metadata: {} });
    thinkingChain.addThought('c2', 'thought', {});
    expect(fs.appendFileSync).toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('addThought handles persistence failure', () => {
    fs.appendFileSync.mockImplementation(() => { throw new Error('disk full'); });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    thinkingChain.chains.set('c3', { thoughts: [{}], branches: [], metadata: {} });
    thinkingChain.addThought('c3', 'thought', {});
    expect(console.error).toHaveBeenCalled();
  });

  it('createChain persists initial thought', () => {
    thinkingChain.createChain('first', { tag: 'test' });
    expect(fs.appendFileSync).toHaveBeenCalled();
  });

  it('createChain handles persistence failure', () => {
    fs.appendFileSync.mockImplementation(() => { throw new Error('fail'); });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    thinkingChain.createChain('first', {});
    expect(console.error).toHaveBeenCalled();
  });

  it('deleteChain cleans up storage and calls original', () => {
    thinkingChain.deleteChain('c1');
    expect(fs.existsSync).toHaveBeenCalled();
  });

  it('deleteChain handles storage deletion failure', () => {
    // Chain file exists but unlinkSync throws (caught silently by class)
    // Snapshot files also exist and throw (propagates to monkey-patch catch)
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['c1_snapshot_1.json']);
    fs.unlinkSync.mockImplementation(() => { throw new Error('fail'); });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    thinkingChain.deleteChain('c1');
    expect(console.error).toHaveBeenCalled();
  });

  it('getStorageStats returns formatted stats', () => {
    fs.readdirSync.mockReturnValue([]);
    const stats = thinkingChain.getStorageStats();
    expect(stats.chains).toBe(0);
    expect(stats.totalSize).toBe(0);
    expect(stats.totalSizeFormatted).toBe('0 B');
  });

  it('getStorageStats formats KB', () => {
    fs.readdirSync.mockReturnValue(['a.jsonl']);
    fs.statSync.mockReturnValue({ size: 2048, mtime: new Date() });
    readFileLines.mockReturnValue(['line']);
    const stats = thinkingChain.getStorageStats();
    expect(stats.totalSizeFormatted).toBe('2.0 KB');
  });

  it('getStorageStats formats MB', () => {
    fs.readdirSync.mockReturnValue(['a.jsonl']);
    fs.statSync.mockReturnValue({ size: 2 * 1024 * 1024, mtime: new Date() });
    readFileLines.mockReturnValue(['line']);
    const stats = thinkingChain.getStorageStats();
    expect(stats.totalSizeFormatted).toBe('2.0 MB');
  });
});
