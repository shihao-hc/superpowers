const fs = require('fs');

jest.mock('fs');
jest.mock('../../src/utils/UltraWorkUtils', () => ({
  splitLines: jest.fn((content) => content.split('\n')),
}));

const { DryRunEngine, dryRunEngine } = require('../../src/mcp/engines/DryRunEngine');

describe('DryRunEngine', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('uses defaults when no options', () => {
      const engine = new DryRunEngine();
      expect(engine.maxHistorySize).toBe(1000);
      expect(engine.maxFileSize).toBe(10 * 1024 * 1024);
      expect(engine.maxPreviewLength).toBe(5000);
      expect(engine.previewCache).toBeInstanceOf(Map);
      expect(engine.history).toEqual([]);
    });

    test('accepts custom options', () => {
      const engine = new DryRunEngine({ maxHistorySize: 50, maxFileSize: 1024, maxPreviewLength: 200 });
      expect(engine.maxHistorySize).toBe(50);
      expect(engine.maxFileSize).toBe(1024);
      expect(engine.maxPreviewLength).toBe(200);
    });
  });

  describe('singleton export', () => {
    test('dryRunEngine is an instance of DryRunEngine', () => {
      expect(dryRunEngine).toBeInstanceOf(DryRunEngine);
    });
  });

  describe('validateFilePath', () => {
    let engine;
    beforeEach(() => { engine = new DryRunEngine(); });

    test('throws on empty string', () => {
      expect(() => engine.validateFilePath('')).toThrow('Invalid file path: must be a non-empty string');
    });

    test('throws on non-string', () => {
      expect(() => engine.validateFilePath(null)).toThrow('Invalid file path: must be a non-empty string');
      expect(() => engine.validateFilePath(123)).toThrow('Invalid file path: must be a non-empty string');
    });

    test('throws on path traversal', () => {
      expect(() => engine.validateFilePath('../secret')).toThrow('Path traversal or invalid characters not allowed');
    });

    test('throws on invalid characters', () => {
      expect(() => engine.validateFilePath('file<name')).toThrow('Path traversal or invalid characters not allowed');
      expect(() => engine.validateFilePath('file>name')).toThrow('Path traversal or invalid characters not allowed');
      expect(() => engine.validateFilePath('file|name')).toThrow('Path traversal or invalid characters not allowed');
    });

    test('returns resolved path for valid input', () => {
      const result = engine.validateFilePath('src/file.js');
      expect(typeof result).toBe('string');
      expect(result).toContain('src');
    });

    test('normalizes backslashes (Windows paths)', () => {
      const result = engine.validateFilePath('src\\file.js');
      expect(result).toContain('src');
    });
  });

  describe('validateFileSize', () => {
    let engine;
    beforeEach(() => { engine = new DryRunEngine({ maxFileSize: 100 }); });

    test('returns size when within limit', () => {
      fs.statSync.mockReturnValue({ size: 50 });
      expect(engine.validateFileSize('file.txt')).toBe(50);
    });

    test('throws when exceeds limit', () => {
      fs.statSync.mockReturnValue({ size: 200 });
      expect(() => engine.validateFileSize('file.txt')).toThrow('File size exceeds limit: 200 > 100');
    });
  });

  describe('checkDryRun', () => {
    let engine;
    beforeEach(() => { engine = new DryRunEngine(); });

    test('returns true when dry_run is true', () => {
      expect(engine.checkDryRun({ dry_run: true }, 'test')).toBe(true);
    });

    test('returns true when dryRun is true', () => {
      expect(engine.checkDryRun({ dryRun: true }, 'test')).toBe(true);
    });

    test('returns false when neither is set', () => {
      expect(engine.checkDryRun({}, 'test')).toBe(false);
    });

    test('returns false when dry_run is false', () => {
      expect(engine.checkDryRun({ dry_run: false }, 'test')).toBe(false);
    });
  });

  describe('previewEdit', () => {
    let engine;
    beforeEach(() => { engine = new DryRunEngine({ maxPreviewLength: 100 }); });

    test('uses provided currentContent without reading file', () => {
      const result = engine.previewEdit('src/file.js', [{ oldText: 'old', newText: 'new' }], 'old content here');
      expect(result._meta.dryRun).toBe(true);
      expect(result._meta.tool).toBe('edit_file');
      expect(result.preview).toBe('new content here');
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    test('reads file when currentContent not provided', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 50 });
      fs.readFileSync.mockReturnValue('file content');

      const result = engine.previewEdit('src/file.js', [{ oldText: 'file', newText: 'updated' }]);
      expect(fs.readFileSync).toHaveBeenCalled();
      expect(result.preview).toBe('updated content');
    });

    test('truncates long content', () => {
      const longContent = 'a'.repeat(200);
      const result = engine.previewEdit('src/file.js', [{ oldText: 'zzz', newText: 'new' }], longContent);
      expect(result._meta.truncated).toBe(true);
    });

    test('does not truncate short content', () => {
      const result = engine.previewEdit('src/file.js', [], 'short');
      expect(result._meta.truncated).toBe(false);
    });

    test('records history entry', () => {
      engine.previewEdit('src/file.js', [], 'content');
      const history = engine.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('edit_file');
      expect(history[0].filePath).toBe('src/file.js');
      expect(history[0].dryRun).toBe(true);
    });

    test('trims history when exceeds maxHistorySize', () => {
      engine = new DryRunEngine({ maxHistorySize: 2 });
      engine.previewEdit('f1.js', [], 'c');
      engine.previewEdit('f2.js', [], 'c');
      engine.previewEdit('f3.js', [], 'c');
      expect(engine.getHistory()).toHaveLength(2);
      expect(engine.getHistory()[0].filePath).toBe('f2.js');
    });

    test('lineCount delta is computed', () => {
      const result = engine.previewEdit('f.js', [{ oldText: 'a', newText: 'b\nc' }], 'a');
      expect(result._meta.lineCount.before).toBe(1);
      expect(result._meta.lineCount.after).toBe(2);
      expect(result._meta.lineCount.delta).toBe(1);
    });
  });

  describe('previewWrite', () => {
    let engine;
    beforeEach(() => { engine = new DryRunEngine(); });

    test('creates new file when not exists', () => {
      fs.existsSync.mockReturnValue(false);
      const result = engine.previewWrite('new.txt', 'hello');
      expect(result._meta.willCreate).toBe(true);
      expect(result._meta.willOverwrite).toBe(false);
      expect(result.warning).toBe('This will create a new file');
      expect(result.existingContent).toBeNull();
    });

    test('overwrites existing file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('old content');
      const result = engine.previewWrite('existing.txt', 'new content');
      expect(result._meta.willCreate).toBe(false);
      expect(result._meta.willOverwrite).toBe(true);
      expect(result.warning).toBe('This will overwrite the existing file');
      expect(result.existingContent).toBe('old content');
    });

    test('truncates existing content preview at 500 chars', () => {
      fs.existsSync.mockReturnValue(true);
      const longContent = 'x'.repeat(600);
      fs.readFileSync.mockReturnValue(longContent);
      const result = engine.previewWrite('f.txt', 'new');
      expect(result.existingContent).toHaveLength(503); // 500 + '...'
      expect(result.existingContent).toMatch(/\.\.\.$/);
    });

    test('does not add ellipsis to short existing content', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('short');
      const result = engine.previewWrite('f.txt', 'new');
      expect(result.existingContent).toBe('short');
    });

    test('records history', () => {
      fs.existsSync.mockReturnValue(false);
      engine.previewWrite('f.txt', 'c');
      expect(engine.getHistory()).toHaveLength(1);
      expect(engine.getHistory()[0].type).toBe('write_file');
    });
  });

  describe('previewDelete', () => {
    let engine;
    beforeEach(() => { engine = new DryRunEngine(); });

    test('shows file info when file exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({
        size: 1024,
        mtime: '2026-01-01',
        birthtime: '2025-01-01',
        isDirectory: () => false,
      });
      const result = engine.previewDelete('file.txt');
      expect(result._meta.exists).toBe(true);
      expect(result.fileInfo.size).toBe(1024);
      expect(result.fileInfo.type).toBe('file');
      expect(result.warning).toBe('This action cannot be undone!');
    });

    test('fileInfo is null when file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const result = engine.previewDelete('missing.txt');
      expect(result._meta.exists).toBe(false);
      expect(result.fileInfo).toBeNull();
    });

    test('shows directory type for directory', () => {
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({
        size: 0,
        mtime: '',
        birthtime: '',
        isDirectory: () => true,
      });
      const result = engine.previewDelete('dir');
      expect(result.fileInfo.type).toBe('directory');
    });

    test('records history', () => {
      fs.existsSync.mockReturnValue(false);
      engine.previewDelete('f.txt');
      expect(engine.getHistory()).toHaveLength(1);
      expect(engine.getHistory()[0].type).toBe('delete_file');
    });
  });

  describe('previewDeleteDirectory', () => {
    let engine;
    beforeEach(() => { engine = new DryRunEngine(); });

    test('counts files in existing directory', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['a.txt', 'b.txt']);
      fs.statSync.mockReturnValue({ isDirectory: () => false, size: 100 });

      const result = engine.previewDeleteDirectory('mydir');
      expect(result._meta.exists).toBe(true);
      expect(result.directoryInfo.fileCount).toBe(2);
      expect(result.directoryInfo.totalSize).toBe('200 B');
    });

    test('handles non-existing directory', () => {
      fs.existsSync.mockReturnValue(false);
      const result = engine.previewDeleteDirectory('missing');
      expect(result._meta.exists).toBe(false);
      expect(result.directoryInfo.fileCount).toBe(0);
    });

    test('recursively counts files in subdirectories', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync
        .mockReturnValueOnce(['sub'])
        .mockReturnValueOnce(['deep.txt']);
      fs.statSync
        .mockReturnValueOnce({ isDirectory: () => true })
        .mockReturnValueOnce({ isDirectory: () => false, size: 50 });

      const result = engine.previewDeleteDirectory('root');
      expect(result.directoryInfo.fileCount).toBe(1);
    });

    test('records history', () => {
      fs.existsSync.mockReturnValue(false);
      engine.previewDeleteDirectory('d');
      expect(engine.getHistory()).toHaveLength(1);
      expect(engine.getHistory()[0].type).toBe('delete_directory');
    });
  });

  describe('previewCreateIssue', () => {
    let engine;
    beforeEach(() => { engine = new DryRunEngine(); });

    test('creates issue preview with all params', () => {
      const result = engine.previewCreateIssue({
        owner: 'user', repo: 'repo', title: 'Bug', body: 'desc', labels: ['bug'],
      });
      expect(result._meta.tool).toBe('create_issue');
      expect(result._meta.endpoint).toBe('POST /repos/user/repo/issues');
      expect(result.requestPreview.title).toBe('Bug');
      expect(result.requestPreview.body).toBe('desc');
      expect(result.requestPreview.labels).toEqual(['bug']);
    });

    test('defaults body and labels when not provided', () => {
      const result = engine.previewCreateIssue({ owner: 'u', repo: 'r', title: 'T' });
      expect(result.requestPreview.body).toBe('');
      expect(result.requestPreview.labels).toEqual([]);
    });

    test('records history', () => {
      engine.previewCreateIssue({ owner: 'u', repo: 'r', title: 'T' });
      expect(engine.getHistory()).toHaveLength(1);
      expect(engine.getHistory()[0].type).toBe('create_issue');
    });
  });

  describe('previewMergePR', () => {
    let engine;
    beforeEach(() => { engine = new DryRunEngine(); });

    test('merges with specified method', () => {
      const result = engine.previewMergePR({
        owner: 'u', repo: 'r', prNumber: 42, mergeMethod: 'squash',
      });
      expect(result._meta.tool).toBe('merge_pr');
      expect(result._meta.destructive).toBe(true);
      expect(result._meta.endpoint).toBe('PUT /repos/u/r/pulls/42/merge');
      expect(result.requestPreview.mergeMethod).toBe('squash');
    });

    test('defaults mergeMethod to merge', () => {
      const result = engine.previewMergePR({ owner: 'u', repo: 'r', prNumber: 1 });
      expect(result.requestPreview.mergeMethod).toBe('merge');
    });

    test('records history', () => {
      engine.previewMergePR({ owner: 'u', repo: 'r', prNumber: 1 });
      expect(engine.getHistory()).toHaveLength(1);
      expect(engine.getHistory()[0].type).toBe('merge_pr');
    });
  });

  describe('previewDeleteMemo', () => {
    let engine;
    beforeEach(() => { engine = new DryRunEngine(); });

    test('shows full content when short', () => {
      const result = engine.previewDeleteMemo('m1', 'hello');
      expect(result.memoPreview.id).toBe('m1');
      expect(result.memoPreview.content).toBe('hello');
    });

    test('truncates content at 200 chars', () => {
      const long = 'x'.repeat(300);
      const result = engine.previewDeleteMemo('m1', long);
      expect(result.memoPreview.content).toHaveLength(203);
      expect(result.memoPreview.content).toMatch(/\.\.\.$/);
    });

    test('content is null when not provided', () => {
      const result = engine.previewDeleteMemo('m1');
      expect(result.memoPreview.content).toBeNull();
    });

    test('records history', () => {
      engine.previewDeleteMemo('m1', 'c');
      expect(engine.getHistory()).toHaveLength(1);
      expect(engine.getHistory()[0].type).toBe('delete_memo');
    });
  });

  describe('previewCdpCommand', () => {
    let engine;
    beforeEach(() => { engine = new DryRunEngine(); });

    test('returns command preview with warnings', () => {
      const result = engine.previewCdpCommand('Page.inject', {});
      expect(result._meta.tool).toBe('cdp_command');
      expect(result.warnings).toContain('This command executes code in the browser context');
    });

    test('records history', () => {
      engine.previewCdpCommand('Page.navigate', {});
      expect(engine.getHistory()).toHaveLength(1);
      expect(engine.getHistory()[0].type).toBe('cdp_command');
    });
  });

  describe('analyzeCdpRisks', () => {
    let engine;
    beforeEach(() => { engine = new DryRunEngine(); });

    test('detects inject/evaluate risk', () => {
      expect(engine.analyzeCdpRisks('Runtime.evaluate', {})).toContain('This command executes code in the browser context');
    });

    test('detects click/type risk', () => {
      expect(engine.analyzeCdpRisks('DOM.click', {})).toContain('This will interact with page elements');
      expect(engine.analyzeCdpRisks('Input.type', {})).toContain('This will interact with page elements');
    });

    test('detects delete/remove risk', () => {
      expect(engine.analyzeCdpRisks('DOM.remove', {})).toContain('This will modify or remove page content');
      expect(engine.analyzeCdpRisks('deleteNode', {})).toContain('This will modify or remove page content');
    });

    test('returns empty for safe command', () => {
      expect(engine.analyzeCdpRisks('Page.navigate', {})).toEqual([]);
    });

    test('detects multiple risks', () => {
      const warnings = engine.analyzeCdpRisks('clickandinject', {});
      expect(warnings).toHaveLength(2);
    });
  });

  describe('applyEdits', () => {
    let engine;
    beforeEach(() => { engine = new DryRunEngine(); });

    test('applies matching edit', () => {
      expect(engine.applyEdits('hello world', [{ oldText: 'world', newText: 'earth' }])).toBe('hello earth');
    });

    test('skips non-matching edit', () => {
      expect(engine.applyEdits('hello', [{ oldText: 'xyz', newText: 'abc' }])).toBe('hello');
    });

    test('applies multiple edits in order', () => {
      const result = engine.applyEdits('a b c', [
        { oldText: 'a', newText: 'X' },
        { oldText: 'c', newText: 'Z' },
      ]);
      expect(result).toBe('X b Z');
    });

    test('handles empty edits array', () => {
      expect(engine.applyEdits('content', [])).toBe('content');
    });

    test('handles edit with falsy oldText', () => {
      expect(engine.applyEdits('content', [{ oldText: '', newText: 'x' }])).toBe('content');
    });
  });

  describe('generateDiff', () => {
    let engine;
    beforeEach(() => { engine = new DryRunEngine(); });

    test('detects added lines', () => {
      const diff = engine.generateDiff('line1', 'line1\nline2', 'f.js');
      expect(diff.added).toBe(1);
      expect(diff.removed).toBe(0);
      expect(diff.summary).toBe('+1 -0');
    });

    test('detects removed lines', () => {
      const diff = engine.generateDiff('line1\nline2', 'line1', 'f.js');
      expect(diff.removed).toBe(1);
      expect(diff.added).toBe(0);
    });

    test('detects modified lines', () => {
      const diff = engine.generateDiff('old', 'new', 'f.js');
      expect(diff.added).toBe(1);
      expect(diff.removed).toBe(1);
    });

    test('detects unchanged lines', () => {
      const diff = engine.generateDiff('a\nb', 'a\nb', 'f.js');
      expect(diff.unchanged).toBe(2);
      expect(diff.added).toBe(0);
      expect(diff.removed).toBe(0);
      expect(diff.hunks).toEqual([]);
    });

    test('handles different lengths - after longer', () => {
      const diff = engine.generateDiff('a', 'a\nb\nc', 'f.js');
      expect(diff.added).toBe(2);
    });

    test('handles different lengths - before longer', () => {
      const diff = engine.generateDiff('a\nb\nc', 'a', 'f.js');
      expect(diff.removed).toBe(2);
    });

    test('includes file path in result', () => {
      const diff = engine.generateDiff('a', 'b', 'test.js');
      expect(diff.file).toBe('test.js');
    });

    test('limits hunk lines to 50', () => {
      const manyLines = Array.from({ length: 60 }, (_, i) => `before${i}`).join('\n');
      const diffLines = Array.from({ length: 60 }, (_, i) => `after${i}`).join('\n');
      const diff = engine.generateDiff(manyLines, diffLines, 'f.js');
      expect(diff.hunks[0].lines.length).toBe(50);
    });
  });

  describe('formatSize', () => {
    let engine;
    beforeEach(() => { engine = new DryRunEngine(); });

    test('formats bytes', () => {
      expect(engine.formatSize(0)).toBe('0 B');
      expect(engine.formatSize(512)).toBe('512 B');
    });

    test('formats kilobytes', () => {
      expect(engine.formatSize(1024)).toBe('1.0 KB');
      expect(engine.formatSize(1536)).toBe('1.5 KB');
    });

    test('formats megabytes', () => {
      expect(engine.formatSize(1024 * 1024)).toBe('1.0 MB');
    });

    test('formats gigabytes', () => {
      expect(engine.formatSize(1024 * 1024 * 1024)).toBe('1.0 GB');
    });

    test('boundary: exactly 1024 bytes', () => {
      expect(engine.formatSize(1024)).toBe('1.0 KB');
    });

    test('boundary: 1024*1024 bytes', () => {
      expect(engine.formatSize(1024 * 1024)).toBe('1.0 MB');
    });

    test('boundary: 1024*1024*1024 bytes', () => {
      expect(engine.formatSize(1024 * 1024 * 1024)).toBe('1.0 GB');
    });
  });

  describe('countFiles', () => {
    let engine;
    beforeEach(() => { engine = new DryRunEngine(); });

    test('returns initial stats when directory does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const result = engine.countFiles('/nonexistent');
      expect(result).toEqual({ count: 0, size: 0 });
    });

    test('counts files in flat directory', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['a.txt', 'b.txt']);
      fs.statSync.mockReturnValue({ isDirectory: () => false, size: 100 });

      const result = engine.countFiles('/dir');
      expect(result.count).toBe(2);
      expect(result.size).toBe(200);
    });

    test('recursively counts nested directories', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync
        .mockReturnValueOnce(['sub'])
        .mockReturnValueOnce(['file.txt']);
      fs.statSync
        .mockReturnValueOnce({ isDirectory: () => true })
        .mockReturnValueOnce({ isDirectory: () => false, size: 50 });

      const result = engine.countFiles('/root');
      expect(result.count).toBe(1);
      expect(result.size).toBe(50);
    });
  });

  describe('getHistory / clearHistory', () => {
    test('getHistory returns a copy', () => {
      const engine = new DryRunEngine();
      const h = engine.getHistory();
      h.push({ fake: true });
      expect(engine.history).toHaveLength(0);
    });

    test('clearHistory empties history', () => {
      const engine = new DryRunEngine();
      engine.history = [{ x: 1 }];
      engine.clearHistory();
      expect(engine.history).toEqual([]);
    });
  });
});
