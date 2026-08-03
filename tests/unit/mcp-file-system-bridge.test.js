const fs = require('fs');
const path = require('path');

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    mkdir: jest.fn(),
    rename: jest.fn(),
    unlink: jest.fn(),
    rm: jest.fn(),
    rmdir: jest.fn(),
    watch: jest.fn()
  },
  watch: jest.fn()
}));
jest.mock('path');

jest.mock('../../src/utils/UltraWorkUtils', () => ({
  splitLines: jest.fn((content) => content.split('\n'))
}));

jest.mock('../../src/mcp/engines/RootsManager', () => {
  const resolveImpl = (root, filePath) => ({ path: `${root}/${filePath}`, valid: true });
  return {
    rootsManager: {
      setRoots: jest.fn(),
      getRoots: jest.fn(() => ['/allowed/root1', '/allowed/root2']),
      safeResolve: jest.fn(resolveImpl)
    }
  };
});

jest.mock('../../src/mcp/engines/DryRunEngine', () => ({
  dryRunEngine: {
    previewWrite: jest.fn((p, c) => ({ preview: true, path: p, contentLength: c.length })),
    previewDelete: jest.fn((p) => ({ preview: true, path: p })),
    previewDeleteDirectory: jest.fn((p) => ({ preview: true, path: p })),
    previewEdit: jest.fn((p, edits) => ({ preview: true, path: p, edits }))
  }
}));

jest.mock('../../src/mcp/engines/ThinkingChain', () => ({
  thinkingChain: {
    addThought: jest.fn()
  }
}));

const { rootsManager } = require('../../src/mcp/engines/RootsManager');
const { dryRunEngine } = require('../../src/mcp/engines/DryRunEngine');
const { thinkingChain } = require('../../src/mcp/engines/ThinkingChain');


// We need to mock path.join to behave like normal path.join
path.join.mockImplementation((...args) => args.join('/'));
path.basename.mockImplementation((p) => {
  const parts = p.split('/');
  return parts[parts.length - 1] || parts[parts.length - 2];
});
// Default safeResolve for all tests unless overridden
rootsManager.safeResolve.mockImplementation((root, filePath) => ({ path: `${root}/${filePath}`, valid: true }));

const { FileSystemBridge } = require('../../src/mcp/bridges/FileSystemBridge');

const makeContext = () => ({
  thinking: {
    getCurrentChain: () => ({ id: 'chain-1' })
  }
});

let bridge;

beforeEach(() => {
  jest.clearAllMocks();
  rootsManager.safeResolve.mockImplementation((root, filePath) => ({ path: `${root}/${filePath}`, valid: true }));
  bridge = new FileSystemBridge({ roots: ['/workspace'] });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('FileSystemBridge', () => {
  describe('constructor', () => {
    it('uses provided roots', () => {
      expect(bridge.allowedRoots).toEqual(['/workspace']);
      expect(rootsManager.setRoots).toHaveBeenCalledWith(['/workspace']);
    });

    it('defaults to process.cwd()', () => {
      const b = new FileSystemBridge();
      expect(b.allowedRoots).toEqual([process.cwd()]);
    });
  });

  describe('getTools', () => {
    it('returns 17 tool definitions', () => {
      const tools = bridge.getTools();
      expect(tools).toHaveLength(17);
    });

    it('each tool has name, description, inputSchema, and handler', () => {
      const tools = bridge.getTools();
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(typeof tool.handler).toBe('function');
      }
    });

    it('maps all expected tool names', () => {
      const names = bridge.getTools().map((t) => t.name);
      expect(names).toContain('read_text_file');
      expect(names).toContain('write_file');
      expect(names).toContain('list_allowed_directories');
    });
  });

  describe('readTextFile', () => {
    it('reads a file and returns content with line count', async () => {
      fs.promises.readFile.mockResolvedValue('line1\nline2\nline3');
      const result = await bridge.readTextFile({ path: 'test.txt' }, makeContext());
      expect(result.content).toBe('line1\nline2\nline3');
      expect(result.lines).toBe(3);
      expect(result.path).toBe('/workspace/test.txt');
      expect(thinkingChain.addThought).toHaveBeenCalled();
    });

    it('throws when file does not exist', async () => {
      fs.promises.readFile.mockRejectedValue(new Error('ENOENT'));
      await expect(bridge.readTextFile({ path: 'missing.txt' }, makeContext())).rejects.toThrow('ENOENT');
    });
  });

  describe('readMultipleFiles', () => {
    it('reads multiple files successfully', async () => {
      fs.promises.readFile.mockResolvedValue('content');
      const result = await bridge.readMultipleFiles({ paths: ['a.txt', 'b.txt'] }, makeContext());
      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.files[0].success).toBe(true);
    });

    it('handles mixed success and failure', async () => {
      fs.promises.readFile
        .mockResolvedValueOnce('ok')
        .mockRejectedValueOnce(new Error('ENOENT'));
      const result = await bridge.readMultipleFiles({ paths: ['ok.txt', 'bad.txt'] }, makeContext());
      expect(result.total).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.files[1].success).toBe(false);
      expect(result.files[1].error).toBe('ENOENT');
    });
  });

  describe('listDirectory', () => {
    it('returns directory entries with types', async () => {
      fs.promises.readdir.mockResolvedValue([
        { name: 'file.txt', isDirectory: () => false },
        { name: 'subdir', isDirectory: () => true }
      ]);
      const result = await bridge.listDirectory({ path: 'mydir' }, makeContext());
      expect(result.count).toBe(2);
      expect(result.items[0].type).toBe('file');
      expect(result.items[1].type).toBe('directory');
    });
  });

  describe('directoryTree', () => {
    it('builds a tree with file and directory nodes', async () => {
      fs.promises.stat
        .mockResolvedValueOnce({ isDirectory: () => true })   // root
        .mockResolvedValueOnce({ isDirectory: () => false })  // file.txt
        .mockResolvedValueOnce({ isDirectory: () => true })   // subdir
        .mockResolvedValueOnce({ isDirectory: () => false }); // subdir/nested.txt
      fs.promises.readdir
        .mockResolvedValueOnce([
          { name: 'file.txt', isDirectory: () => false },
          { name: 'subdir', isDirectory: () => true }
        ])
        .mockResolvedValueOnce([
          { name: 'nested.txt', isDirectory: () => false }
        ]);
      const result = await bridge.directoryTree({ path: 'root' }, makeContext());
      expect(result.tree).toBeDefined();
      expect(result.tree.type).toBe('directory');
      expect(result.tree.children).toHaveLength(2);
    });

    it('returns null when maxDepth exceeded at root', async () => {
      const result = await bridge.directoryTree({ path: 'root', maxDepth: -1 }, makeContext());
      expect(result.tree).toBeNull();
    });

    it('prunes children beyond maxDepth', async () => {
      fs.promises.stat.mockResolvedValue({ isDirectory: () => true });
      fs.promises.readdir.mockResolvedValue([{ name: 'child', isDirectory: () => true }]);
      const result = await bridge.directoryTree({ path: 'root', maxDepth: 0 }, makeContext());
      expect(result.tree).not.toBeNull();
      expect(result.tree.children).toHaveLength(0);
    });

    it('returns file node for non-directory', async () => {
      fs.promises.stat.mockResolvedValue({ isDirectory: () => false });
      const result = await bridge.directoryTree({ path: 'root/file.txt' }, makeContext());
      expect(result.tree.type).toBe('file');
    });
  });

  describe('searchFiles', () => {
    it('finds matching files recursively', async () => {
      fs.promises.readdir
        .mockResolvedValueOnce([
          { name: 'src', isDirectory: () => true },
          { name: 'readme.md', isDirectory: () => false }
        ])
        .mockResolvedValueOnce([
          { name: 'app.js', isDirectory: () => false }
        ]);
      const result = await bridge.searchFiles({ path: 'root', pattern: '\\.js$' }, makeContext());
      expect(result.count).toBe(1);
      expect(result.matches[0].name).toBe('app.js');
      expect(result.pattern).toBe('\\.js$');
    });

    it('sanitizes overly complex patterns to .*', async () => {
      fs.promises.readdir.mockResolvedValue([]);
      const result = await bridge.searchFiles({ path: 'root', pattern: '(ab+)+cd*' }, makeContext());
      expect(result.pattern).toBe('.*');
    });

    it('sanitizes patterns exceeding 100 chars', async () => {
      fs.promises.readdir.mockResolvedValue([]);
      const longPattern = 'x'.repeat(101);
      const result = await bridge.searchFiles({ path: 'root', pattern: longPattern }, makeContext());
      expect(result.pattern).toBe('.*');
    });

    it('rejects non-string patterns', async () => {
      fs.promises.readdir.mockResolvedValue([]);
      const result = await bridge.searchFiles({ path: 'root', pattern: 123 }, makeContext());
      expect(result.pattern).toBe('.*');
    });
  });

  describe('getFileInfo', () => {
    it('returns file metadata including sizeFormatted', async () => {
      fs.promises.stat.mockResolvedValue({
        size: 2048,
        birthtime: new Date('2026-01-01'),
        mtime: new Date('2026-06-01'),
        isDirectory: () => false
      });
      const result = await bridge.getFileInfo({ path: 'file.txt' }, makeContext());
      expect(result.size).toBe(2048);
      expect(result.sizeFormatted).toBe('2.0 KB');
      expect(result.type).toBe('file');
    });

    it('formats bytes correctly for MB range', async () => {
      fs.promises.stat.mockResolvedValue({
        size: 2 * 1024 * 1024,
        birthtime: new Date(),
        mtime: new Date(),
        isDirectory: () => false
      });
      const result = await bridge.getFileInfo({ path: 'big.bin' }, makeContext());
      expect(result.sizeFormatted).toBe('2.0 MB');
    });

    it('formats bytes correctly for GB range', async () => {
      fs.promises.stat.mockResolvedValue({
        size: 3 * 1024 * 1024 * 1024,
        birthtime: new Date(),
        mtime: new Date(),
        isDirectory: () => false
      });
      const result = await bridge.getFileInfo({ path: 'huge.bin' }, makeContext());
      expect(result.sizeFormatted).toBe('3.0 GB');
    });

    it('formats bytes correctly for small B range', async () => {
      fs.promises.stat.mockResolvedValue({
        size: 100,
        birthtime: new Date(),
        mtime: new Date(),
        isDirectory: () => false
      });
      const result = await bridge.getFileInfo({ path: 'tiny.txt' }, makeContext());
      expect(result.sizeFormatted).toBe('100 B');
    });

    it('detects directory type', async () => {
      fs.promises.stat.mockResolvedValue({
        size: 4096,
        birthtime: new Date(),
        mtime: new Date(),
        isDirectory: () => true
      });
      const result = await bridge.getFileInfo({ path: 'dir' }, makeContext());
      expect(result.type).toBe('directory');
    });
  });

  describe('writeFile', () => {
    it('writes file and returns success', async () => {
      fs.promises.writeFile.mockResolvedValue();
      const result = await bridge.writeFile({ path: 'out.txt', content: 'hello' }, makeContext());
      expect(result.success).toBe(true);
      expect(result.bytes).toBe(5);
      expect(fs.promises.writeFile).toHaveBeenCalledWith('/workspace/out.txt', 'hello', 'utf-8');
      expect(thinkingChain.addThought).toHaveBeenCalled();
    });

    it('returns dry_run preview without writing', async () => {
      const result = await bridge.writeFile({ path: 'out.txt', content: 'hi', dry_run: true }, makeContext());
      expect(result.preview).toBe(true);
      expect(fs.promises.writeFile).not.toHaveBeenCalled();
      expect(dryRunEngine.previewWrite).toHaveBeenCalled();
    });

    it('supports dryRun alias', async () => {
      const result = await bridge.writeFile({ path: 'out.txt', content: 'hi', dryRun: true }, makeContext());
      expect(result.preview).toBe(true);
      expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('editFile', () => {
    it('applies edits and writes file', async () => {
      fs.promises.readFile.mockResolvedValue('hello world');
      fs.promises.writeFile.mockResolvedValue();
      const edits = [{ oldText: 'world', newText: 'universe' }];
      const result = await bridge.editFile({ path: 'edit.txt', edits }, makeContext());
      expect(result.success).toBe(true);
      expect(result.editsApplied).toBe(1);
      expect(fs.promises.writeFile).toHaveBeenCalledWith('/workspace/edit.txt', 'hello universe', 'utf-8');
    });

    it('returns dry_run preview without editing', async () => {
      fs.promises.readFile.mockResolvedValue('hello world');
      const result = await bridge.editFile({ path: 'edit.txt', edits: [{ oldText: 'a', newText: 'b' }], dry_run: true }, makeContext());
      expect(result.preview).toBe(true);
      expect(fs.promises.writeFile).not.toHaveBeenCalled();
      expect(dryRunEngine.previewEdit).toHaveBeenCalled();
    });

    it('supports dryRun alias for edit', async () => {
      fs.promises.readFile.mockResolvedValue('content');
      const result = await bridge.editFile({ path: 'f.txt', edits: [], dryRun: true }, makeContext());
      expect(result.preview).toBe(true);
    });
  });

  describe('createDirectory', () => {
    it('creates directory with recursive', async () => {
      fs.promises.mkdir.mockResolvedValue();
      const result = await bridge.createDirectory({ path: 'newdir' }, makeContext());
      expect(result.success).toBe(true);
      expect(fs.promises.mkdir).toHaveBeenCalledWith('/workspace/newdir', { recursive: true });
    });

    it('returns dry_run preview', async () => {
      const result = await bridge.createDirectory({ path: 'newdir', dry_run: true }, makeContext());
      expect(result._meta.dryRun).toBe(true);
      expect(result.action).toBe('create_directory');
      expect(fs.promises.mkdir).not.toHaveBeenCalled();
    });
  });

  describe('moveFile', () => {
    it('moves file by renaming', async () => {
      fs.promises.rename.mockResolvedValue();
      const result = await bridge.moveFile({ source: 'a.txt', destination: 'b.txt' }, makeContext());
      expect(result.success).toBe(true);
      expect(fs.promises.rename).toHaveBeenCalledWith('/workspace/a.txt', '/workspace/b.txt');
      expect(thinkingChain.addThought).toHaveBeenCalled();
    });

    it('returns dry_run preview', async () => {
      const result = await bridge.moveFile({ source: 'a.txt', destination: 'b.txt', dry_run: true }, makeContext());
      expect(result._meta.dryRun).toBe(true);
      expect(result.action).toBe('move_file');
      expect(fs.promises.rename).not.toHaveBeenCalled();
    });

    it('supports dryRun alias for move', async () => {
      const result = await bridge.moveFile({ source: 'a.txt', destination: 'b.txt', dryRun: true }, makeContext());
      expect(result._meta.dryRun).toBe(true);
    });
  });

  describe('deleteFile', () => {
    it('deletes file', async () => {
      fs.promises.unlink.mockResolvedValue();
      const result = await bridge.deleteFile({ path: 'del.txt' }, makeContext());
      expect(result.success).toBe(true);
      expect(fs.promises.unlink).toHaveBeenCalledWith('/workspace/del.txt');
      expect(thinkingChain.addThought).toHaveBeenCalled();
    });

    it('returns dry_run preview', async () => {
      const result = await bridge.deleteFile({ path: 'del.txt', dry_run: true }, makeContext());
      expect(result.preview).toBe(true);
      expect(fs.promises.unlink).not.toHaveBeenCalled();
      expect(dryRunEngine.previewDelete).toHaveBeenCalled();
    });
  });

  describe('deleteDirectory', () => {
    it('deletes directory non-recursively', async () => {
      fs.promises.rmdir.mockResolvedValue();
      const result = await bridge.deleteDirectory({ path: 'deldir' }, makeContext());
      expect(result.success).toBe(true);
      expect(fs.promises.rmdir).toHaveBeenCalledWith('/workspace/deldir');
      expect(fs.promises.rm).not.toHaveBeenCalled();
    });

    it('deletes directory recursively', async () => {
      fs.promises.rm.mockResolvedValue();
      const result = await bridge.deleteDirectory({ path: 'deldir', recursive: true }, makeContext());
      expect(result.success).toBe(true);
      expect(fs.promises.rm).toHaveBeenCalledWith('/workspace/deldir', { recursive: true });
    });

    it('returns dry_run preview', async () => {
      const result = await bridge.deleteDirectory({ path: 'deldir', dry_run: true }, makeContext());
      expect(result.preview).toBe(true);
      expect(dryRunEngine.previewDeleteDirectory).toHaveBeenCalled();
      expect(fs.promises.rmdir).not.toHaveBeenCalled();
      expect(fs.promises.rm).not.toHaveBeenCalled();
    });
  });

  describe('multiWrite', () => {
    it('writes multiple files', async () => {
      fs.promises.writeFile.mockResolvedValue();
      const result = await bridge.multiWrite({
        files: [
          { path: 'a.txt', content: 'aaa' },
          { path: 'b.txt', content: 'bbb' }
        ]
      }, makeContext());
      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
      expect(thinkingChain.addThought).toHaveBeenCalled();
    });

    it('returns dry_run previews', async () => {
      const result = await bridge.multiWrite({
        files: [{ path: 'a.txt', content: 'x' }],
        dry_run: true
      }, makeContext());
      expect(result._meta.dryRun).toBe(true);
      expect(result.previews).toHaveLength(1);
      expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('multiDelete', () => {
    it('deletes multiple files', async () => {
      fs.promises.unlink.mockResolvedValue();
      const result = await bridge.multiDelete({ paths: ['a.txt', 'b.txt'] }, makeContext());
      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
      expect(thinkingChain.addThought).toHaveBeenCalled();
    });

    it('returns dry_run previews', async () => {
      const result = await bridge.multiDelete({ paths: ['a.txt'], dry_run: true }, makeContext());
      expect(result._meta.dryRun).toBe(true);
      expect(result.previews).toHaveLength(1);
      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
  });

  describe('watchDirectory', () => {
    it('starts watching a directory and fires callback', async () => {
      let watchCb;
      const mockWatcher = { close: jest.fn() };
      fs.watch.mockImplementation((p, opts, cb) => { watchCb = cb; return mockWatcher; });
      const result = await bridge.watchDirectory({ path: 'dir' }, makeContext());
      expect(result.success).toBe(true);
      expect(result.message).toBe('Now watching for changes');
      expect(bridge.watchers.has('/workspace/dir')).toBe(true);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      watchCb('change', 'file.txt');
      expect(consoleSpy).toHaveBeenCalledWith('File change: file.txt');
      consoleSpy.mockRestore();
    });

    it('returns already watching if already watching', async () => {
      const mockWatcher = { close: jest.fn() };
      fs.watch.mockReturnValue(mockWatcher);
      await bridge.watchDirectory({ path: 'dir' }, makeContext());
      const result2 = await bridge.watchDirectory({ path: 'dir' }, makeContext());
      expect(result2.message).toBe('Already watching');
      expect(fs.watch).toHaveBeenCalledTimes(1);
    });
  });

  describe('unwatchDirectory', () => {
    it('stops watching a directory', async () => {
      const mockWatcher = { close: jest.fn() };
      fs.watch.mockReturnValue(mockWatcher);
      await bridge.watchDirectory({ path: 'dir' }, makeContext());
      const result = await bridge.unwatchDirectory({ path: 'dir' }, makeContext());
      expect(result.success).toBe(true);
      expect(result.message).toBe('Stopped watching');
      expect(mockWatcher.close).toHaveBeenCalled();
      expect(bridge.watchers.has('/workspace/dir')).toBe(false);
    });

    it('returns failure if not watching', async () => {
      const result = await bridge.unwatchDirectory({ path: 'dir' }, makeContext());
      expect(result.success).toBe(false);
      expect(result.message).toBe('Not watching this directory');
    });
  });

  describe('listAllowedDirectories', () => {
    it('returns roots from rootsManager', async () => {
      const result = await bridge.listAllowedDirectories({}, makeContext());
      expect(result.roots).toEqual(['/allowed/root1', '/allowed/root2']);
      expect(rootsManager.getRoots).toHaveBeenCalled();
    });
  });
});
