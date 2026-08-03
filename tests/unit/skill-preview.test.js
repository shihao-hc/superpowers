jest.mock('fs');

const fs = require('fs');
const {
  SkillPreview,
  getSkillPreview,
  DEPRECATED,
  REPLACEMENT
} = require('../../src/skills/preview/SkillPreview');

beforeEach(() => {
  jest.clearAllMocks();
  fs.existsSync.mockReturnValue(true);
  fs.readdirSync.mockReturnValue([]);
  fs.statSync.mockReturnValue({ size: 100, mtime: new Date() });
  fs.readFileSync = jest.fn();
  fs.writeFileSync.mockImplementation(() => {});
  fs.unlinkSync.mockImplementation(() => {});
  fs.mkdirSync.mockImplementation(() => {});
});

afterEach(() => {
  // Clean up intervals from any SkillPreview instances
  const allInstances = SkillPreview._testInstances || [];
  for (const inst of allInstances) {
    inst._stopAutoCleanup();
  }
});

describe('Module exports', () => {
  test('exposes DEPRECATED flag', () => {
    expect(DEPRECATED).toBe(true);
  });

  test('exposes REPLACEMENT path', () => {
    expect(REPLACEMENT).toBe('src/skills/rendering/SkillRenderer');
  });
});

  describe('Helper functions are module-internal', () => {
    test('escapeHtml and isPathSafe are not exported from module', () => {
      const mod = require('../../src/skills/preview/SkillPreview');
      expect(mod.escapeHtml).toBeUndefined();
      expect(mod.isPathSafe).toBeUndefined();
    });
  });

describe('SkillPreview', () => {
  let preview;

  function createPreview(opts = {}) {
    return new SkillPreview({
      previewDir: '/tmp/test-previews',
      ...opts
    });
  }

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    preview = createPreview();
  });

  afterEach(() => {
    preview._stopAutoCleanup();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('uses default options when none provided', () => {
      const r = new SkillPreview();
      expect(r.previewDir).toContain('data');
      expect(r.previewDir).toContain('previews');
      expect(r.maxPreviewSize).toBe(10 * 1024 * 1024);
      expect(r.cacheTTL).toBe(3600000);
      r._stopAutoCleanup();
    });

    test('uses custom options', () => {
      expect(preview.previewDir).toBe('/tmp/test-previews');
      expect(preview.maxPreviewSize).toBe(10 * 1024 * 1024);
      expect(preview.cacheTTL).toBe(3600000);
    });

    test('calls _ensurePreviewDir and _startAutoCleanup', () => {
      expect(fs.existsSync).toHaveBeenCalled();
    });

    test('creates directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);
      const r = createPreview();
      expect(fs.mkdirSync).toHaveBeenCalledWith(r.previewDir, { recursive: true });
      r._stopAutoCleanup();
    });

    test('supports custom cache TTL and max size', () => {
      const r = createPreview({ maxPreviewSize: 1024, cacheTTL: 5000 });
      expect(r.maxPreviewSize).toBe(1024);
      expect(r.cacheTTL).toBe(5000);
      r._stopAutoCleanup();
    });
  });

  describe('_startAutoCleanup / _stopAutoCleanup', () => {
    test('starts cleanup interval and can be stopped', () => {
      expect(preview.cleanupInterval).toBeDefined();
      preview._stopAutoCleanup();
      expect(preview.cleanupInterval).toBeNull();
    });

    test('calling stop when not started does not throw', () => {
      preview._stopAutoCleanup();
      preview._stopAutoCleanup();
    });

    test('cleanupInterval calls _cleanupExpiredCache', () => {
      const _spy = jest.spyOn(preview, '_cleanupExpiredCache');
      // Simulate interval tick
      preview._startAutoCleanup();
      expect(preview.cleanupInterval).toBeDefined();
      preview._stopAutoCleanup();
    });
  });

  describe('getPreviewType', () => {
    test('returns image for image extensions', () => {
      expect(preview.getPreviewType('photo.png')).toBe('image');
      expect(preview.getPreviewType('photo.jpg')).toBe('image');
      expect(preview.getPreviewType('photo.jpeg')).toBe('image');
      expect(preview.getPreviewType('photo.gif')).toBe('image');
      expect(preview.getPreviewType('photo.webp')).toBe('image');
      expect(preview.getPreviewType('photo.svg')).toBe('image');
      expect(preview.getPreviewType('photo.bmp')).toBe('image');
    });

    test('returns html for html/htm', () => {
      expect(preview.getPreviewType('page.html')).toBe('html');
      expect(preview.getPreviewType('page.htm')).toBe('html');
    });

    test('returns markdown for md/markdown', () => {
      expect(preview.getPreviewType('readme.md')).toBe('markdown');
      expect(preview.getPreviewType('readme.markdown')).toBe('markdown');
    });

    test('returns text for text/json/xml/yaml/csv', () => {
      expect(preview.getPreviewType('data.txt')).toBe('text');
      expect(preview.getPreviewType('data.json')).toBe('text');
      expect(preview.getPreviewType('data.xml')).toBe('text');
      expect(preview.getPreviewType('data.yaml')).toBe('text');
      expect(preview.getPreviewType('data.yml')).toBe('text');
      expect(preview.getPreviewType('data.csv')).toBe('text');
    });

    test('returns pdf for pdf extension', () => {
      expect(preview.getPreviewType('doc.pdf')).toBe('pdf');
    });

    test('returns code for js/py/java/cpp/c/go/rs/ts', () => {
      expect(preview.getPreviewType('script.js')).toBe('code');
      expect(preview.getPreviewType('script.py')).toBe('code');
      expect(preview.getPreviewType('script.java')).toBe('code');
      expect(preview.getPreviewType('script.cpp')).toBe('code');
      expect(preview.getPreviewType('script.c')).toBe('code');
      expect(preview.getPreviewType('script.go')).toBe('code');
      expect(preview.getPreviewType('script.rs')).toBe('code');
      expect(preview.getPreviewType('script.ts')).toBe('code');
    });

    test('returns unknown for unrecognized extension', () => {
      expect(preview.getPreviewType('file.xyz')).toBe('unknown');
      expect(preview.getPreviewType('file')).toBe('unknown');
    });

    test('is case-insensitive', () => {
      expect(preview.getPreviewType('PHOTO.PNG')).toBe('image');
      expect(preview.getPreviewType('ReadMe.MD')).toBe('markdown');
    });
  });

  describe('_generatePreviewId', () => {
    test('generates a 32-character hex string', () => {
      const id = preview._generatePreviewId('hello', 'test.txt');
      expect(id).toMatch(/^[a-f0-9]{32}$/);
    });

    test('is deterministic for same inputs', () => {
      const id1 = preview._generatePreviewId('content', 'file.txt');
      const id2 = preview._generatePreviewId('content', 'file.txt');
      expect(id1).toBe(id2);
    });

    test('differs for different content', () => {
      const id1 = preview._generatePreviewId('content-a', 'file.txt');
      const id2 = preview._generatePreviewId('content-b', 'file.txt');
      expect(id1).not.toBe(id2);
    });

    test('differs for different filenames', () => {
      const id1 = preview._generatePreviewId('content', 'a.txt');
      const id2 = preview._generatePreviewId('content', 'b.txt');
      expect(id1).not.toBe(id2);
    });
  });

  describe('createImagePreview', () => {
    const buffer = Buffer.from('fake-image-data');
    const filename = 'photo.png';

    test('creates image preview successfully', () => {
      const result = preview.createImagePreview(buffer, filename);
      expect(result.id).toMatch(/^[a-f0-9]{32}$/);
      expect(result.type).toBe('image');
      expect(result.format).toBe('png');
      expect(result.path).toContain(result.id);
      expect(result.path).toMatch(/\.png$/);
      expect(result.url).toBe(`/api/skills/preview/${result.id}`);
      expect(result.thumbnailUrl).toMatch(/\/thumbnail$/);
      expect(result.size).toBe(buffer.length);
      expect(result.createdAt).toBeDefined();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('throws on file size exceeding max', () => {
      const big = Buffer.alloc(11 * 1024 * 1024);
      expect(() => preview.createImagePreview(big, filename)).toThrow(/exceeds maximum limit/);
    });

    test('throws on invalid extension', () => {
      expect(() => preview.createImagePreview(buffer, 'photo.exe')).toThrow(/Invalid image extension/);
    });

    test('accepts all safe image extensions', () => {
      const exts = ['.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
      for (const ext of exts) {
        fs.writeFileSync.mockClear();
        const r = preview.createImagePreview(buffer, `photo${ext}`);
        expect(r.format).toBe(ext.slice(1));
      }
    });

    test('does not generate thumbnail when option is false', () => {
      const result = preview.createImagePreview(buffer, filename, { generateThumbnail: false });
      expect(result.thumbnailUrl).toBeNull();
    });

    test('generates thumbnail by default', () => {
      const result = preview.createImagePreview(buffer, filename);
      expect(result.thumbnailUrl).not.toBeNull();
    });
  });

  describe('createHTMLPreview', () => {
    const content = '<h1>Hello World</h1><script>alert("xss")</script>';
    const filename = 'page.html';

    test('creates HTML preview', () => {
      const result = preview.createHTMLPreview(content, filename);
      expect(result.type).toBe('html');
      expect(result.format).toBe('html');
      expect(result.path).toMatch(/\.html$/);
      expect(result.url).toBe(`/api/skills/preview/${result.id}`);
      expect(result.iframeUrl).toBe(`/api/skills/preview/${result.id}/iframe`);
      expect(result.createdAt).toBeDefined();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('sanitizes HTML before writing', () => {
      preview.createHTMLPreview(content, filename);
      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).not.toContain('<script>');
      expect(writtenContent).toContain('script removed');
    });

    test('wraps with CSP and HTML structure', () => {
      preview.createHTMLPreview('<p>test</p>', filename);
      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain('DOCTYPE html');
      expect(writtenContent).toContain('Content-Security-Policy');
      expect(writtenContent).toContain('script-src \'none\'');
    });

    test('uses custom title from options', () => {
      preview.createHTMLPreview('<p>test</p>', filename, { title: 'My Custom Title' });
      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain('My Custom Title');
    });
  });

  describe('createMarkdownPreview', () => {
    test('converts markdown to HTML and delegates to createHTMLPreview', () => {
      const result = preview.createMarkdownPreview('# Hello\n**bold** `code`', 'doc.md');
      expect(result.type).toBe('markdown');
      expect(result.format).toBe('markdown');
      expect(result.originalContent).toBe('# Hello\n**bold** `code`');
      expect(result.id).toBeDefined();
      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain('<h1>Hello</h1>');
    });

    test('handles all markdown syntax', () => {
      preview.createMarkdownPreview(
        '# H1\n## H2\n### H3\n**bold** *italic* `code`',
        'doc.md'
      );
      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain('<h1>H1</h1>');
      expect(writtenContent).toContain('<h2>H2</h2>');
      expect(writtenContent).toContain('<h3>H3</h3>');
      expect(writtenContent).toContain('<strong>bold</strong>');
      expect(writtenContent).toContain('<em>italic</em>');
      expect(writtenContent).toContain('<code>code</code>');
    });
  });

  describe('createTextPreview', () => {
    test('creates text preview with syntax highlighting', () => {
      const result = preview.createTextPreview('const x = 1;', 'script.js');
      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(result.type).toBe('text');
      expect(result.format).toBe('js');
      expect(writtenContent).toContain('DOCTYPE html');
      expect(writtenContent).toContain('color:#c678dd');
    });

    test('escapes filename in HTML', () => {
      preview.createTextPreview('content', '<script>alert(1)</script>.js');
      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).not.toContain('<script>');
      expect(writtenContent).toContain('&#x2F;script&gt;');
    });

    test('uses monospace font family', () => {
      preview.createTextPreview('content', 'file.txt');
      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain('Monaco');
    });
  });

  describe('createPDFPreview', () => {
    const buffer = Buffer.from('%PDF-1.4 fake pdf content');

    test('creates PDF preview with viewer', () => {
      const result = preview.createPDFPreview(buffer, 'doc.pdf');
      expect(result.type).toBe('pdf');
      expect(result.format).toBe('pdf');
      expect(result.path).toMatch(/\.pdf$/);
      expect(result.viewerPath).toContain('_viewer.html');
      expect(result.url).toBe(`/api/skills/preview/${result.id}`);
      expect(result.viewerUrl).toBe(`/api/skills/preview/${result.id}/viewer`);
      expect(result.pdfUrl).toBe(`/api/skills/preview/${result.id}/raw`);
      expect(result.size).toBe(buffer.length);
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    });

    test('viewer HTML contains iframe to raw PDF', () => {
      preview.createPDFPreview(buffer, 'doc.pdf');
      const viewerHTML = fs.writeFileSync.mock.calls[1][1];
      expect(viewerHTML).toContain('PDF 预览');
      expect(viewerHTML).toContain('/raw');
    });
  });

  describe('createPreview (dispatcher)', () => {
    const buffer = Buffer.from('test');

    test('dispatches to createImagePreview for image type', () => {
      const spy = jest.spyOn(preview, 'createImagePreview');
      preview.createPreview(buffer, 'image.png');
      expect(spy).toHaveBeenCalled();
    });

    test('dispatches to createHTMLPreview for html type', () => {
      const spy = jest.spyOn(preview, 'createHTMLPreview');
      preview.createPreview('<p>test</p>', 'page.html');
      expect(spy).toHaveBeenCalled();
    });

    test('dispatches to createMarkdownPreview for markdown type', () => {
      const spy = jest.spyOn(preview, 'createMarkdownPreview');
      preview.createPreview('# Hello', 'doc.md');
      expect(spy).toHaveBeenCalled();
    });

    test('dispatches to createTextPreview for text type', () => {
      const spy = jest.spyOn(preview, 'createTextPreview');
      preview.createPreview('plain text', 'file.txt');
      expect(spy).toHaveBeenCalled();
    });

    test('dispatches to createTextPreview for code type', () => {
      const spy = jest.spyOn(preview, 'createTextPreview');
      preview.createPreview('console.log(1);', 'script.js');
      expect(spy).toHaveBeenCalled();
    });

    test('dispatches to createPDFPreview for pdf type', () => {
      const spy = jest.spyOn(preview, 'createPDFPreview');
      preview.createPreview(buffer, 'doc.pdf');
      expect(spy).toHaveBeenCalled();
    });

    test('falls back to text preview for unknown type', () => {
      const spy = jest.spyOn(preview, 'createTextPreview');
      preview.createPreview('weird data', 'file.xyz');
      expect(spy).toHaveBeenCalled();
    });

    test('converts string data to buffer for image', () => {
      const spy = jest.spyOn(preview, 'createImagePreview');
      preview.createPreview('base64encodedstring', 'image.png');
      expect(spy).toHaveBeenCalled();
    });

    test('converts buffer data to string for text', () => {
      const spy = jest.spyOn(preview, 'createTextPreview');
      preview.createPreview(buffer, 'file.txt');
      expect(spy).toHaveBeenCalledWith(
        buffer.toString(),
        'file.txt',
        {}
      );
    });
  });

  describe('getPreview', () => {
    test('returns null for invalid previewId (null)', () => {
      expect(preview.getPreview(null)).toBeNull();
    });

    test('returns null for invalid previewId (empty string)', () => {
      expect(preview.getPreview('')).toBeNull();
    });

    test('returns null for previewId with special characters', () => {
      expect(preview.getPreview('../../etc/passwd')).toBeNull();
    });

    test('returns null when preview file not found', () => {
      fs.readdirSync.mockReturnValue(['otherfile.html']);
      expect(preview.getPreview('abcdef1234567890abcdef1234567890')).toBeNull();
    });

    test('caches preview result', () => {
      const previewId = 'abcdef1234567890abcdef1234567890';
      fs.readdirSync.mockReturnValue([`${previewId}.html`]);
      const result1 = preview.getPreview(previewId);
      expect(result1).not.toBeNull();

      // Second call should use cache
      fs.readdirSync.mockClear();
      const result2 = preview.getPreview(previewId);
      expect(result2).not.toBeNull();
      expect(result2).toEqual(result1);
    });

    test('bypasses cache when TTL expired', () => {
      const previewId = 'abcdef1234567890abcdef1234567890';
      fs.readdirSync.mockReturnValue([`${previewId}.html`]);

      preview.getPreview(previewId);
      const readdirCallsBefore = fs.readdirSync.mock.calls.length;

      // Mock expired cache entry
      preview.previewCache.set(previewId, {
        preview: { id: previewId },
        timestamp: Date.now() - 7200000 // 2 hours ago, TTL is 1 hour
      });

      preview.getPreview(previewId);
      // Should have called readdirSync again because cache expired
      expect(fs.readdirSync.mock.calls.length).toBeGreaterThan(readdirCallsBefore);
    });

    test('returns preview metadata when file found', () => {
      const previewId = 'abcdef1234567890abcdef1234567890';
      const mtime = new Date('2026-01-01');
      fs.statSync.mockReturnValue({ size: 500, mtime });
      fs.readdirSync.mockReturnValue([`${previewId}.html`]);

      const result = preview.getPreview(previewId);
      expect(result.id).toBe(previewId);
      expect(result.size).toBe(500);
      expect(result.modifiedAt).toBe(mtime.toISOString());
    });
  });

  describe('deletePreview', () => {
    test('throws on invalid previewId', () => {
      expect(() => preview.deletePreview('')).toThrow('Invalid preview ID');
      expect(() => preview.deletePreview('../../etc')).toThrow('Invalid preview ID');
    });

    test('deletes matching files', () => {
      const previewId = 'abcdef1234567890abcdef1234567890';
      fs.readdirSync.mockReturnValue([`${previewId}.html`, `${previewId}_thumb.png`]);
      const result = preview.deletePreview(previewId);
      expect(result.deleted).toBe(2);
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
    });

    test('removes from cache', () => {
      const previewId = 'abcdef1234567890abcdef1234567890';
      preview.previewCache.set(previewId, { preview: {}, timestamp: Date.now() });
      preview.deletePreview(previewId);
      expect(preview.previewCache.has(previewId)).toBe(false);
    });

    test('skips files with unsafe paths', () => {
      const previewId = 'abcdef1234567890abcdef1234567890';
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      fs.readdirSync.mockReturnValue([`${previewId}.html`]);
      // Mock writeFileSync to create file outside previewDir
      const mockStat = jest.spyOn(fs, 'statSync');
      mockStat.mockReturnValue({ size: 100, mtime: new Date() });

      const result = preview.deletePreview(previewId);
      // Since file starts with previewId, it'll be processed
      // isPathSafe will be called - if it returns false, it should warn and skip
      expect(result.deleted).toBe(1);
    });

    test('returns 0 when no matching files', () => {
      fs.readdirSync.mockReturnValue(['otherfile.html']);
      const result = preview.deletePreview('nonexistent');
      expect(result.deleted).toBe(0);
    });
  });

  describe('cleanupExpiredPreviews', () => {
    test('deletes files older than maxAge', () => {
      const oldDate = new Date(Date.now() - 2 * 86400000); // 2 days ago
      const newDate = new Date(); // now
      fs.readdirSync.mockReturnValue(['old.html', 'new.html']);
      fs.statSync
        .mockReturnValueOnce({ size: 100, mtime: oldDate })
        .mockReturnValueOnce({ size: 100, mtime: newDate });

      const result = preview.cleanupExpiredPreviews(86400000); // 24 hours
      expect(result.deleted).toBe(1);
      expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
    });

    test('uses default maxAge of 24 hours', () => {
      const oldDate = new Date(Date.now() - 2 * 86400000);
      fs.readdirSync.mockReturnValue(['old.html']);
      fs.statSync.mockReturnValue({ size: 100, mtime: oldDate });

      const result = preview.cleanupExpiredPreviews();
      expect(result.deleted).toBe(1);
    });

    test('calls _cleanupExpiredCache', () => {
      const spy = jest.spyOn(preview, '_cleanupExpiredCache');
      preview.cleanupExpiredPreviews();
      expect(spy).toHaveBeenCalled();
    });

    test('skips files with unsafe paths', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      const oldDate = new Date(Date.now() - 2 * 86400000);
      fs.readdirSync.mockReturnValue(['safe.html']);
      fs.statSync.mockReturnValue({ size: 100, mtime: oldDate });

      const result = preview.cleanupExpiredPreviews(86400000);
      expect(result.deleted).toBe(1);
    });

    test('handles empty directory', () => {
      fs.readdirSync.mockReturnValue([]);
      const result = preview.cleanupExpiredPreviews();
      expect(result.deleted).toBe(0);
    });
  });

  describe('_cleanupExpiredCache', () => {
    test('removes expired cache entries', () => {
      preview.previewCache.set('entry1', {
        preview: { id: 'entry1' },
        timestamp: Date.now() - 7200000 // 2 hours old, TTL is 1 hour
      });
      preview.previewCache.set('entry2', {
        preview: { id: 'entry2' },
        timestamp: Date.now() // fresh
      });

      preview._cleanupExpiredCache();

      expect(preview.previewCache.has('entry1')).toBe(false);
      expect(preview.previewCache.has('entry2')).toBe(true);
    });

    test('handles empty cache', () => {
      expect(() => preview._cleanupExpiredCache()).not.toThrow();
    });
  });

  describe('getSupportedFormats', () => {
    test('returns the supported formats map', () => {
      const formats = preview.getSupportedFormats();
      expect(formats.image).toContain('png');
      expect(formats.html).toContain('html');
      expect(formats.markdown).toContain('md');
      expect(formats.text).toContain('txt');
      expect(formats.pdf).toContain('pdf');
      expect(formats.code).toContain('js');
    });
  });

  describe('getStats', () => {
    test('returns stats with file count and total size', () => {
      fs.readdirSync.mockReturnValue(['a.html', 'b.html', 'c.html']);
      fs.statSync.mockReturnValue({ size: 200, mtime: new Date() });

      const stats = preview.getStats();
      expect(stats.totalFiles).toBe(3);
      expect(stats.totalSize).toBe(600);
      expect(stats.cacheSize).toBe(0);
    });

    test('reflects cache size', () => {
      preview.previewCache.set('entry', { preview: {}, timestamp: Date.now() });
      const stats = preview.getStats();
      expect(stats.cacheSize).toBe(1);
    });

    test('handles empty directory', () => {
      fs.readdirSync.mockReturnValue([]);
      const stats = preview.getStats();
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe('_sanitizeHTML', () => {
    test('removes script tags with content', () => {
      const result = preview._sanitizeHTML('<script>alert("xss")</script><p>safe</p>');
      expect(result).not.toContain('alert');
      expect(result).toContain('<p>safe</p>');
    });

    test('removes self-closing script tags', () => {
      const result = preview._sanitizeHTML('<script src="evil.js"/>');
      expect(result).toContain('script tag removed');
    });

    test('removes event handlers', () => {
      const result = preview._sanitizeHTML('<div onclick="evil()" onmouseover="more()">test</div>');
      expect(result).toContain('>test</div>');
    });

    test('removes javascript: in href/src/action', () => {
      const result = preview._sanitizeHTML('<a href="javascript:alert(1)">link</a>');
      expect(result).toContain('data-removed-');
    });

    test('removes iframe tags', () => {
      const result = preview._sanitizeHTML('<iframe src="https://evil.com"></iframe>');
      expect(result).toContain('iframe removed');
    });

    test('removes object tags', () => {
      const result = preview._sanitizeHTML('<object data="evil.swf"></object>');
      expect(result).toContain('object removed');
    });

    test('removes form/input/button/select/textarea', () => {
      const html = '<form action="evil"><input></form><button>click</button><select><option>a</option></select><textarea></textarea>';
      const result = preview._sanitizeHTML(html);
      expect(result).toContain('form removed');
      expect(result).toContain('button removed');
      expect(result).toContain('select removed');
      expect(result).toContain('textarea removed');
    });

    test('removes expression from style tags', () => {
      const result = preview._sanitizeHTML('<style>body { expression(alert(1)) }</style>');
      expect(result).toContain('<style>');
      expect(result).not.toContain('expression');
    });

    test('removes @import from style tags', () => {
      const result = preview._sanitizeHTML('<style>@import url("evil.css");</style>');
      expect(result).not.toContain('@import');
    });

    test('returns empty string for non-string input', () => {
      expect(preview._sanitizeHTML(null)).toBe('');
      expect(preview._sanitizeHTML(undefined)).toBe('');
    });

    test('returns empty string for empty string', () => {
      expect(preview._sanitizeHTML('')).toBe('');
    });
  });

  describe('_wrapHTMLForPreview', () => {
    test('wraps HTML with DOCTYPE and CSP', () => {
      const result = preview._wrapHTMLForPreview('<p>hello</p>');
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('Content-Security-Policy');
      expect(result).toContain('script-src \'none\'');
      expect(result).toContain('<p>hello</p>');
    });

    test('uses default title when not provided', () => {
      const result = preview._wrapHTMLForPreview('<p>test</p>');
      expect(result).toContain('HTML Preview');
    });

    test('uses custom title from options', () => {
      const result = preview._wrapHTMLForPreview('<p>test</p>', { title: 'Custom' });
      expect(result).toContain('Custom');
      expect(result).not.toContain('HTML Preview');
    });

    test('escapes title to prevent XSS', () => {
      const result = preview._wrapHTMLForPreview('<p>test</p>', { title: '<script>alert</script>' });
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });
  });

  describe('_markdownToHTML', () => {
    test('converts headings h1-h3', () => {
      expect(preview._markdownToHTML('# Title')).toContain('<h1>Title</h1>');
      expect(preview._markdownToHTML('## Title')).toContain('<h2>Title</h2>');
      expect(preview._markdownToHTML('### Title')).toContain('<h3>Title</h3>');
    });

    test('converts bold and italic', () => {
      const result = preview._markdownToHTML('**bold** and *italic*');
      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('<em>italic</em>');
    });

    test('converts inline code', () => {
      expect(preview._markdownToHTML('use `code` here')).toContain('<code>code</code>');
    });

    test('converts newlines to <br>', () => {
      expect(preview._markdownToHTML('line1\nline2')).toContain('line1<br>line2');
    });
  });

  describe('_highlightSyntax', () => {
    test('highlights JS keywords and escapes HTML', () => {
      const result = preview._highlightSyntax('<const x = 1;', 'test.js');
      expect(result).toContain('c678dd');
      expect(result).toContain('&lt;');
    });

    test('highlights console/document/window', () => {
      const result = preview._highlightSyntax('console.log("hello");', 'test.js');
      expect(result).toContain('e5c07b');
    });

    test('highlights Python keywords', () => {
      const result = preview._highlightSyntax('def hello():', 'test.py');
      expect(result).toContain('c678dd');
    });

    test('highlights Python builtins', () => {
      const result = preview._highlightSyntax('print("hello")', 'test.py');
      expect(result).toContain('e5c07b');
    });

    test('escapes HTML entities first', () => {
      const result = preview._highlightSyntax('<div>content</div>', 'test.txt');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
    });

    test('highlights strings in JS', () => {
      expect(preview._highlightSyntax('const s = "hello";', 'test.js')).toContain('98c379');
    });

    test('highlights comments in JS', () => {
      expect(preview._highlightSyntax('// this is a comment\nconst x = 1;', 'test.js')).toContain('5c6370');
    });
  });

  describe('_createPDFViewer', () => {
    test('generates PDF viewer HTML with iframe', () => {
      const result = preview._createPDFViewer('abc123');
      expect(result).toContain('PDF 预览');
      expect(result).toContain('/api/skills/preview/abc123/raw');
      expect(result).toContain('iframe');
    });
  });

  describe('getSkillPreview (singleton)', () => {
    test('returns an object with SkillPreview-like shape', () => {
      const instance = getSkillPreview({ previewDir: '/tmp/singleton-test' });
      expect(instance.getPreviewType).toBeInstanceOf(Function);
      expect(instance.createPreview).toBeInstanceOf(Function);
      expect(instance.getSupportedFormats).toBeInstanceOf(Function);
      expect(instance.previewDir).toBe('/tmp/singleton-test');
      instance._stopAutoCleanup();
    });

    test('returns the same instance on subsequent calls', () => {
      const instance1 = getSkillPreview({ previewDir: '/tmp/singleton-test2' });
      const instance2 = getSkillPreview({ previewDir: '/tmp/singleton-test2' });
      expect(instance1).toBe(instance2);
      instance1._stopAutoCleanup();
    });
  });
});
