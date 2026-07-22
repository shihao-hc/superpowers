const path = require('path');
const fs = require('fs');

jest.mock('fs');
jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  let counter = 0;
  return {
    ...actual,
    randomUUID: jest.fn(() => `uuid-${++counter}`),
    randomBytes: jest.fn((len) => Buffer.from('a'.repeat(len), 'utf-8'))
  };
});

const { RootsManager, rootsManager } = require('../../src/mcp/engines/RootsManager');

let manager;

const rp = (p) => path.resolve(p);

beforeEach(() => {
  manager = new RootsManager();
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('RootConfig', () => {
  it('creates config with default permissions', () => {
    manager.setRoots(['/tmp']);
    const cfg = manager.roots[0];
    expect(cfg.permissions).toEqual(['read', 'write']);
    expect(cfg.readOnly).toBe(false);
    expect(cfg.temporary).toBe(false);
    expect(typeof cfg.id).toBe('string');
    expect(cfg.path).toBe(rp('/tmp'));
  });

  it('sets readOnly=true for read-only permissions', () => {
    manager.setRoots(['/tmp'], ['read']);
    expect(manager.roots[0].readOnly).toBe(true);
  });
});

describe('RootsManager constructor', () => {
  it('initializes empty state', () => {
    const m = new RootsManager();
    expect(m.roots).toEqual([]);
    expect(m.listeners.size).toBe(0);
    expect(m.pathCache.size).toBe(0);
    expect(m.temporaryRoots.size).toBe(0);
  });
});

describe('setRoots', () => {
  it('sets roots and clears cache', () => {
    manager.pathCache.set('key', 'val');
    const result = manager.setRoots(['/a', '/b']);
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe(rp('/a'));
    expect(manager.pathCache.size).toBe(0);
  });

  it('accepts custom permissions', () => {
    manager.setRoots(['/x'], ['read']);
    expect(manager.roots[0].permissions).toEqual(['read']);
    expect(manager.roots[0].readOnly).toBe(true);
  });
});

describe('addRoot', () => {
  it('adds a new root', () => {
    manager.addRoot('/test');
    expect(manager.roots).toHaveLength(1);
    expect(manager.roots[0].path).toBe(rp('/test'));
  });

  it('does not add duplicate root', () => {
    manager.addRoot('/dup');
    manager.addRoot('/dup');
    expect(manager.roots).toHaveLength(1);
  });

  it('adds root with custom permissions', () => {
    manager.addRoot('/ro', ['read']);
    expect(manager.roots[0].permissions).toEqual(['read']);
  });
});

describe('createTemporaryRoot', () => {
  it('creates sandbox directory and tracks it', () => {
    fs.mkdirSync.mockImplementation(() => {});
    const result = manager.createTemporaryRoot('test-prefix');
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('test-prefix'), { recursive: true });
    expect(result.id).toBeDefined();
    expect(result.path).toBeDefined();
    expect(typeof result.cleanup).toBe('function');
    expect(manager.roots).toHaveLength(1);
    expect(manager.roots[0].temporary).toBe(true);
    expect(manager.temporaryRoots.size).toBe(1);
  });

  it('uses default prefix', () => {
    fs.mkdirSync.mockImplementation(() => {});
    manager.createTemporaryRoot();
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('mcp-sandbox'), { recursive: true });
  });
});

describe('cleanupTemporaryRoot', () => {
  it('removes temp dir and root entry', () => {
    fs.mkdirSync.mockImplementation(() => {});
    fs.existsSync.mockReturnValue(true);
    fs.rmSync.mockImplementation(() => {});

    const { id } = manager.createTemporaryRoot();
    const result = manager.cleanupTemporaryRoot(id);
    expect(result.success).toBe(true);
    expect(fs.rmSync).toHaveBeenCalled();
    expect(manager.roots).toHaveLength(0);
    expect(manager.temporaryRoots.size).toBe(0);
  });

  it('handles nonexistent sandbox path gracefully', () => {
    fs.mkdirSync.mockImplementation(() => {});
    fs.existsSync.mockReturnValue(false);
    fs.rmSync.mockImplementation(() => {});

    const { id } = manager.createTemporaryRoot();
    const result = manager.cleanupTemporaryRoot(id);
    expect(result.success).toBe(true);
    expect(fs.rmSync).not.toHaveBeenCalled();
    expect(manager.roots).toHaveLength(0);
  });

  it('handles non-existent id', () => {
    fs.mkdirSync.mockImplementation(() => {});
    fs.existsSync.mockReturnValue(false);
    fs.rmSync.mockImplementation(() => {});
    const result = manager.cleanupTemporaryRoot('nonexistent-id');
    expect(result.success).toBe(true);
    expect(manager.roots).toHaveLength(0);
  });
});

describe('cleanupAllTemporary', () => {
  it('cleans up all temporary roots', () => {
    fs.mkdirSync.mockImplementation(() => {});
    fs.existsSync.mockReturnValue(true);
    fs.rmSync.mockImplementation(() => {});

    manager.createTemporaryRoot('a');
    manager.createTemporaryRoot('b');
    expect(manager.roots).toHaveLength(2);

    const result = manager.cleanupAllTemporary();
    expect(result.success).toBe(true);
    expect(result.cleaned).toBe(0);
    expect(manager.roots).toHaveLength(0);
  });
});

describe('getRoots', () => {
  it('returns array of path strings', () => {
    manager.setRoots(['/a', '/b']);
    expect(manager.getRoots()).toEqual([rp('/a'), rp('/b')]);
  });
});

describe('getRootsConfig', () => {
  it('returns copy of root configs', () => {
    manager.setRoots(['/x']);
    const configs = manager.getRootsConfig();
    expect(configs).toHaveLength(1);
    expect(configs[0].path).toBe(rp('/x'));
    expect(configs).not.toBe(manager.roots);
  });
});

describe('removeRoot', () => {
  it('removes an existing root', () => {
    manager.setRoots(['/a', '/b']);
    const result = manager.removeRoot('/a');
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe(rp('/b'));
  });

  it('handles non-existent root', () => {
    manager.setRoots(['/a']);
    const result = manager.removeRoot('/z');
    expect(result).toHaveLength(1);
  });
});

describe('hasPermission', () => {
  it('returns true when path in root and has permission', () => {
    const root = rp('/project');
    manager.setRoots([root], ['read', 'write']);
    expect(manager.hasPermission(rp('/project/file.txt'), 'write')).toBe(true);
    expect(manager.hasPermission(rp('/project/file.txt'), 'read')).toBe(true);
  });

  it('returns false when permission not in list', () => {
    const root = rp('/project');
    manager.setRoots([root], ['read']);
    expect(manager.hasPermission(rp('/project/file.txt'), 'write')).toBe(false);
  });

  it('returns false when path outside roots', () => {
    const root = rp('/project');
    manager.setRoots([root]);
    expect(manager.hasPermission(rp('/other/file.txt'), 'read')).toBe(false);
  });
});

describe('validatePath', () => {
  it('returns valid for exact root match', () => {
    manager.setRoots(['/project']);
    const result = manager.validatePath(rp('/project'));
    expect(result.valid).toBe(true);
    expect(result.root).toBe(rp('/project'));
    expect(result.relative).toBe('');
    expect(result.readOnly).toBe(false);
  });

  it('returns valid for child path', () => {
    manager.setRoots(['/project']);
    const result = manager.validatePath(path.join(rp('/project'), 'src', 'file.js'));
    expect(result.valid).toBe(true);
    expect(result.relative).toBe(path.join('src', 'file.js'));
  });

  it('returns PATH_OUTSIDE_ROOTS for unregistered path', () => {
    manager.setRoots(['/project']);
    const result = manager.validatePath(rp('/etc/passwd'));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('PATH_OUTSIDE_ROOTS');
    expect(result.allowedRoots).toEqual([rp('/project')]);
  });

  it('returns PERMISSION_DENIED when permission required but missing', () => {
    manager.setRoots(['/project'], ['read']);
    const result = manager.validatePath(path.join(rp('/project'), 'file.txt'), 'write');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('PERMISSION_DENIED');
    expect(result.requiredPermission).toBe('write');
  });

  it('uses cache on second call', () => {
    manager.setRoots(['/project']);
    const filePath = path.join(rp('/project'), 'file.txt');
    const first = manager.validatePath(filePath);
    const second = manager.validatePath(filePath);
    expect(first).toBe(second);
  });

  it('returns valid with null requirePermission', () => {
    manager.setRoots(['/project']);
    const result = manager.validatePath(path.join(rp('/project'), 'file.txt'), null);
    expect(result.valid).toBe(true);
  });

  it('caches denied results', () => {
    manager.setRoots(['/project']);
    const filePath = rp('/etc/passwd');
    const first = manager.validatePath(filePath);
    const second = manager.validatePath(filePath);
    expect(first).toBe(second);
  });

  it('caches permission denied results', () => {
    manager.setRoots(['/project'], ['read']);
    const filePath = path.join(rp('/project'), 'f');
    const first = manager.validatePath(filePath, 'write');
    const second = manager.validatePath(filePath, 'write');
    expect(first).toBe(second);
  });
});

describe('safeResolve', () => {
  it('returns valid result for empty userPath', () => {
    const result = manager.safeResolve('/base', null);
    expect(result.valid).toBe(true);
    expect(result.path).toBe('/base');
    expect(result.relative).toBe('');
  });

  it('resolves valid path within root', () => {
    manager.setRoots(['/project']);
    const result = manager.safeResolve(rp('/project'), 'src/file.js');
    expect(result.valid).toBe(true);
    expect(result.path).toBe(path.join(rp('/project'), 'src', 'file.js'));
  });

  it('throws PATH_TRAVERSAL for path outside roots', () => {
    manager.setRoots(['/project']);
    expect(() => manager.safeResolve(rp('/project'), '../../etc/passwd')).toThrow('Path traversal detected');
    try {
      manager.safeResolve(rp('/project'), '../../etc/passwd');
    } catch (e) {
      expect(e.code).toBe('PATH_TRAVERSAL');
      expect(e.details).toBeDefined();
    }
  });

  it('resolves with permission check', () => {
    manager.setRoots(['/project'], ['read']);
    expect(() => manager.safeResolve(rp('/project'), 'file.js', 'write')).toThrow('Path traversal detected');
  });
});

describe('validateMiddleware', () => {
  it('validates path param', () => {
    manager.setRoots(['/project']);
    const params = { path: path.join(rp('/project'), 'file.js') };
    const result = manager.validateMiddleware('write_file', params);
    expect(result).toBeNull();
    expect(params._path_validated).toBeDefined();
  });

  it('validates file param', () => {
    manager.setRoots(['/project']);
    const params = { file: path.join(rp('/project'), 'file.js') };
    const result = manager.validateMiddleware('write_file', params);
    expect(result).toBeNull();
    expect(params._file_validated).toBeDefined();
  });

  it('validates filePath param', () => {
    manager.setRoots(['/project']);
    const params = { filePath: path.join(rp('/project'), 'file.js') };
    const result = manager.validateMiddleware('write_file', params);
    expect(result).toBeNull();
    expect(params._filePath_validated).toBeDefined();
  });

  it('validates directory param', () => {
    manager.setRoots(['/project']);
    const params = { directory: path.join(rp('/project'), 'dir') };
    const result = manager.validateMiddleware('write_file', params);
    expect(result).toBeNull();
    expect(params._directory_validated).toBeDefined();
  });

  it('validates dir param', () => {
    manager.setRoots(['/project']);
    const params = { dir: path.join(rp('/project'), 'dir') };
    const result = manager.validateMiddleware('write_file', params);
    expect(result).toBeNull();
    expect(params._dir_validated).toBeDefined();
  });

  it('validates source param', () => {
    manager.setRoots(['/project']);
    const params = { source: path.join(rp('/project'), 'src') };
    const result = manager.validateMiddleware('write_file', params);
    expect(result).toBeNull();
    expect(params._source_validated).toBeDefined();
  });

  it('validates destination param', () => {
    manager.setRoots(['/project']);
    const params = { destination: path.join(rp('/project'), 'dest') };
    const result = manager.validateMiddleware('write_file', params);
    expect(result).toBeNull();
    expect(params._destination_validated).toBeDefined();
  });

  it('validates root param', () => {
    manager.setRoots(['/project']);
    const params = { root: rp('/project') };
    const result = manager.validateMiddleware('write_file', params);
    expect(result).toBeNull();
    expect(params._root_validated).toBeDefined();
  });

  it('throws for path outside roots (non-read-only tool) — safeResolve throws', () => {
    manager.setRoots(['/project']);
    const params = { path: rp('/etc/passwd') };
    expect(() => manager.validateMiddleware('write_file', params)).toThrow('Path traversal detected');
  });

  it('returns null for read-only tool with valid path', () => {
    manager.setRoots(['/project']);
    const params = { path: path.join(rp('/project'), 'file.js') };
    const result = manager.validateMiddleware('read_file', params);
    expect(result).toBeNull();
  });

  it('throws for read-only tool with path outside roots', () => {
    manager.setRoots(['/project']);
    const params = { path: rp('/etc/passwd') };
    expect(() => manager.validateMiddleware('read_file', params)).toThrow('Path traversal detected');
  });

  it('returns null when no path params present', () => {
    manager.setRoots(['/project']);
    const params = { name: 'test', count: 5 };
    const result = manager.validateMiddleware('write_file', params);
    expect(result).toBeNull();
  });
});

describe('_isReadOnlyTool', () => {
  it('identifies read-only tools', () => {
    expect(manager._isReadOnlyTool('read_file')).toBe(true);
    expect(manager._isReadOnlyTool('read_text_file')).toBe(true);
    expect(manager._isReadOnlyTool('read_multiple_files')).toBe(true);
    expect(manager._isReadOnlyTool('list_directory')).toBe(true);
    expect(manager._isReadOnlyTool('directory_tree')).toBe(true);
    expect(manager._isReadOnlyTool('search_files')).toBe(true);
    expect(manager._isReadOnlyTool('get_file_info')).toBe(true);
  });

  it('identifies non-read-only tools', () => {
    expect(manager._isReadOnlyTool('write_file')).toBe(false);
    expect(manager._isReadOnlyTool('delete_file')).toBe(false);
    expect(manager._isReadOnlyTool('unknown_tool')).toBe(false);
  });
});

describe('onRootsChanged', () => {
  it('registers and calls listener', () => {
    const cb = jest.fn();
    manager.onRootsChanged(cb);
    manager.setRoots(['/a']);
    expect(cb).toHaveBeenCalledWith(manager.roots);
  });

  it('returns unsubscribe function', () => {
    const cb = jest.fn();
    const unsub = manager.onRootsChanged(cb);
    unsub();
    manager.setRoots(['/a']);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('notifyListeners', () => {
  it('catches listener errors', () => {
    const badCb = jest.fn(() => { throw new Error('boom'); });
    manager.onRootsChanged(badCb);
    manager.notifyListeners();
    expect(console.error).toHaveBeenCalledWith('Roots listener error:', expect.any(Error));
  });

  it('notifies multiple listeners', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    manager.onRootsChanged(cb1);
    manager.onRootsChanged(cb2);
    manager.notifyListeners();
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });
});

describe('handleRootsList', () => {
  it('returns formatted roots list', async () => {
    manager.setRoots(['/project'], ['read', 'write']);
    manager.temporaryRoots.set(manager.roots[0].id, '/project');
    manager.roots[0].temporary = true;

    const result = await manager.handleRootsList();
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0].uri).toBe(`file://${rp('/project')}`);
    expect(result.roots[0].name).toBe(path.basename(rp('/project')));
    expect(result.roots[0].description).toContain('read, write');
    expect(result.roots[0].temporary).toBe(true);
  });

  it('returns empty roots list', async () => {
    const result = await manager.handleRootsList();
    expect(result.roots).toEqual([]);
  });
});

describe('handleRootsListChanged', () => {
  it('handles string array', async () => {
    const result = await manager.handleRootsListChanged(['/a', '/b']);
    expect(result.success).toBe(true);
    expect(manager.roots).toHaveLength(2);
    expect(manager.roots[0].permissions).toEqual(['read', 'write']);
  });

  it('handles object array with uri', async () => {
    const result = await manager.handleRootsListChanged([
      { uri: 'file:///test/path', permissions: ['read'] }
    ]);
    expect(result.success).toBe(true);
    expect(manager.roots[0].permissions).toEqual(['read']);
  });

  it('handles object array with path', async () => {
    const result = await manager.handleRootsListChanged([
      { path: '/test/path' }
    ]);
    expect(result.success).toBe(true);
    expect(manager.roots[0].path).toBe(rp('/test/path'));
  });

  it('handles null/undefined roots', async () => {
    const result = await manager.handleRootsListChanged(null);
    expect(result.success).toBe(true);
    expect(manager.roots).toHaveLength(0);
  });

  it('handles non-array input', async () => {
    const result = await manager.handleRootsListChanged('not-an-array');
    expect(result.success).toBe(true);
  });
});

describe('getRelativeInfo', () => {
  it('returns info for child path', () => {
    manager.setRoots(['/project']);
    const childPath = path.join(rp('/project'), 'src', 'file.js');
    const result = manager.getRelativeInfo(childPath);
    expect(result).not.toBeNull();
    expect(result.root).toBe(rp('/project'));
    expect(result.relative).toBe(path.join('src', 'file.js'));
    expect(result.depth).toBe(2);
  });

  it('returns null for path not in any root', () => {
    manager.setRoots(['/project']);
    const result = manager.getRelativeInfo(rp('/other/file.js'));
    expect(result).toBeNull();
  });

  it('returns null for exact root path (no sep after)', () => {
    manager.setRoots(['/project']);
    const result = manager.getRelativeInfo(rp('/project'));
    expect(result).toBeNull();
  });
});

describe('getAllowedPrefixes', () => {
  it('returns prefix info for each root', () => {
    fs.existsSync.mockReturnValue(true);
    manager.setRoots(['/project'], ['read']);
    manager.roots[0].temporary = true;

    const result = manager.getAllowedPrefixes();
    expect(result).toHaveLength(1);
    expect(result[0].prefix).toBe(rp('/project'));
    expect(result[0].name).toBe(path.basename(rp('/project')));
    expect(result[0].permissions).toEqual(['read']);
    expect(result[0].exists).toBe(true);
    expect(result[0].temporary).toBe(true);
  });

  it('reports non-existent root', () => {
    fs.existsSync.mockReturnValue(false);
    manager.setRoots(['/nonexist']);
    const result = manager.getAllowedPrefixes();
    expect(result[0].exists).toBe(false);
  });
});

describe('isWritable', () => {
  it('returns true for writable path', () => {
    manager.setRoots(['/project']);
    expect(manager.isWritable(path.join(rp('/project'), 'file.txt'))).toBe(true);
  });

  it('returns false for read-only root', () => {
    manager.setRoots(['/project'], ['read']);
    expect(manager.isWritable(path.join(rp('/project'), 'file.txt'))).toBe(false);
  });
});

describe('isReadable', () => {
  it('returns true for readable path', () => {
    manager.setRoots(['/project']);
    expect(manager.isReadable(path.join(rp('/project'), 'file.txt'))).toBe(true);
  });

  it('returns true for read-only root', () => {
    manager.setRoots(['/project'], ['read']);
    expect(manager.isReadable(path.join(rp('/project'), 'file.txt'))).toBe(true);
  });
});

describe('clearCache', () => {
  it('clears pathCache', () => {
    manager.pathCache.set('k', 'v');
    manager.clearCache();
    expect(manager.pathCache.size).toBe(0);
  });
});

describe('singleton export', () => {
  it('exports a RootsManager instance', () => {
    expect(rootsManager).toBeInstanceOf(RootsManager);
  });
});
