String.prototype.hashCode = function () {
  let hash = 0;
  for (let i = 0; i < this.length; i++) {
    const char = this.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
};

const { MultimodalPresenter } = require('../../src/skills/agent/MultimodalPresenter');

describe('MultimodalPresenter', () => {
  let presenter;

  beforeEach(() => {
    presenter = new MultimodalPresenter();
  });

  describe('constructor', () => {
    it('initializes default formats map', () => {
      expect(presenter.formats).toBeInstanceOf(Map);
      expect(presenter.formats.size).toBeGreaterThan(0);
    });

    it('registers all default formats', () => {
      const formatNames = ['text', 'html', 'json', 'image', 'pdf', 'excel', 'ppt', 'video', 'audio', 'file'];
      formatNames.forEach((name) => {
        expect(presenter.formats.has(name)).toBe(true);
        const fmt = presenter.formats.get(name);
        expect(fmt.name).toBeDefined();
        expect(fmt.mimeTypes).toBeInstanceOf(Array);
        expect(fmt.renderer).toBeInstanceOf(Function);
        expect(fmt.supports).toBeInstanceOf(Array);
        expect(typeof fmt.priority).toBe('number');
      });
    });

    it('applies custom options', () => {
      const p = new MultimodalPresenter({
        defaultFormat: 'json',
        maxContentSize: 512,
        enableCompression: false,
        enableCaching: false,
        cacheTTL: 60000
      });
      expect(p.defaultFormat).toBe('json');
      expect(p.maxContentSize).toBe(512);
      expect(p.enableCompression).toBe(false);
      expect(p.enableCaching).toBe(false);
      expect(p.cacheTTL).toBe(60000);
    });

    it('uses defaults for unspecified options', () => {
      expect(presenter.defaultFormat).toBe('auto');
      expect(presenter.maxContentSize).toBe(1024 * 1024);
      expect(presenter.enableCompression).toBe(true);
      expect(presenter.enableCaching).toBe(true);
      expect(presenter.cacheTTL).toBe(300000);
    });
  });

  describe('registerFormat', () => {
    it('registers a custom format', () => {
      const renderer = jest.fn();
      presenter.registerFormat('custom', {
        name: 'Custom',
        mimeTypes: ['text/custom'],
        renderer,
        supports: ['custom-data'],
        priority: 10
      });
      const fmt = presenter.formats.get('custom');
      expect(fmt.name).toBe('Custom');
      expect(fmt.mimeTypes).toEqual(['text/custom']);
      expect(fmt.renderer).toBe(renderer);
      expect(fmt.supports).toEqual(['custom-data']);
      expect(fmt.priority).toBe(10);
    });

    it('overrides an existing format', () => {
      const renderer = jest.fn();
      presenter.registerFormat('text', { renderer });
      const fmt = presenter.formats.get('text');
      expect(fmt.renderer).toBe(renderer);
    });

    it('applies defaults for missing fields', () => {
      presenter.registerFormat('foo', {});
      const fmt = presenter.formats.get('foo');
      expect(fmt.name).toBe('foo');
      expect(fmt.mimeTypes).toEqual(['application/octet-stream']);
      expect(fmt.renderer).toBeInstanceOf(Function);
      expect(fmt.supports).toEqual([]);
      expect(fmt.priority).toBe(0);
    });
  });

  describe('_determineFormat', () => {
    it('uses format from options when valid', () => {
      const fmt = presenter._determineFormat({}, { format: 'json' });
      expect(fmt.name).toBe('JSON');
    });

    it('uses result.format when specified', () => {
      const fmt = presenter._determineFormat({ format: 'html' }, {});
      expect(fmt.name).toBe('HTML');
    });

    it('detects format from contentType via supports', () => {
      const result = { contentType: 'markdown content here' };
      const fmt = presenter._determineFormat(result, {});
      expect(fmt.name).toBe('Text');
    });

    it('detects format from result.content when contentType has no match', () => {
      const result = { contentType: 'unknown', content: 'some markdown content' };
      const fmt = presenter._determineFormat(result, {});
      expect(fmt.name).toBe('Text');
    });

    it('detects format from mimeType', () => {
      const result = { mimeType: 'application/json' };
      const fmt = presenter._determineFormat(result, {});
      expect(fmt.name).toBe('JSON');
    });

    it('falls back to default format', () => {
      const p = new MultimodalPresenter({ defaultFormat: 'json' });
      const fmt = p._determineFormat({}, {});
      expect(fmt.name).toBe('JSON');
    });

    it('falls back to text when all else fails', () => {
      const p = new MultimodalPresenter({ defaultFormat: 'nonexistent' });
      const fmt = p._determineFormat({}, {});
      expect(fmt.name).toBe('Text');
    });
  });

  describe('_renderText', () => {
    it('renders result.text', async () => {
      const r = await presenter._renderText({ text: 'hello world' }, {});
      expect(r.content).toBe('hello world');
      expect(r.metadata.wordCount).toBe(2);
    });

    it('renders result.message', async () => {
      const r = await presenter._renderText({ message: 'a message' }, {});
      expect(r.content).toBe('a message');
    });

    it('renders result.output as string', async () => {
      const r = await presenter._renderText({ output: 'output text' }, {});
      expect(r.content).toBe('output text');
    });

    it('renders result.output as object', async () => {
      const r = await presenter._renderText({ output: { key: 'val' } }, {});
      expect(r.content).toContain('"key"');
    });

    it('renders result.data as string', async () => {
      const r = await presenter._renderText({ data: 'data text' }, {});
      expect(r.content).toBe('data text');
    });

    it('renders result.data as object', async () => {
      const r = await presenter._renderText({ data: { a: 1 } }, {});
      expect(r.content).toContain('"a"');
    });

    it('fallbacks to JSON.stringify of the result', async () => {
      const r = await presenter._renderText({ foo: 'bar' }, {});
      expect(r.content).toContain('"foo"');
    });

    it('detects markdown when enableMarkdown is true', async () => {
      const r = await presenter._renderText({ text: '# Header\n- list' }, { enableMarkdown: true });
      expect(r.metadata.isMarkdown).toBe(true);
    });

    it('includes lineCount when not markdown', async () => {
      const r = await presenter._renderText({ text: 'line1\nline2\nline3' }, {});
      expect(r.metadata.lineCount).toBe(3);
    });
  });

  describe('_renderHTML', () => {
    it('uses result.html when provided', async () => {
      const r = await presenter._renderHTML({ html: '<b>bold</b>' }, {});
      expect(r.content).toBe('<b>bold</b>');
    });

    it('converts text to HTML when no result.html', async () => {
      const r = await presenter._renderHTML({ text: 'hello <world>' }, {});
      expect(r.content).toContain('&lt;world&gt;');
      expect(r.content).toContain('<div class="skill-result">');
    });

    it('wraps with styles when enableStyles is true', async () => {
      const r = await presenter._renderHTML({ text: 'styled' }, { enableStyles: true });
      expect(r.content).toContain('<style>');
      expect(r.metadata.hasStyles).toBe(true);
    });
  });

  describe('_renderJSON', () => {
    it('stringifies result with indent', async () => {
      const r = await presenter._renderJSON({ a: 1, b: 2 }, { indent: 4 });
      expect(r.content).toContain('"a": 1');
      expect(r.content).toContain('    '); // 4-space indent
    });

    it('throws on circular references (source catch block re-stringifies result)', async () => {
      const circular = { a: 1 };
      circular.self = circular;
      await expect(presenter._renderJSON(circular, {}))
        .rejects.toThrow();
    });

    it('includes metadata with keyCount', async () => {
      const r = await presenter._renderJSON({ x: 1, y: 2, z: 3 }, {});
      expect(r.metadata.keyCount).toBe(3);
    });
  });

  describe('_renderImage', () => {
    it('renders image from URL', async () => {
      const r = await presenter._renderImage({ imageUrl: 'https://example.com/img.png', alt: 'test' }, {});
      expect(r.content).toContain('src="https://example.com/img.png"');
      expect(r.attachments[0].type).toBe('image');
    });

    it('renders image from base64', async () => {
      const r = await presenter._renderImage({ base64: 'abc123', mimeType: 'image/jpeg' }, {});
      expect(r.content).toContain('data:image/jpeg;base64,abc123');
      expect(r.metadata.isBase64).toBe(true);
    });

    it('renders image from buffer', async () => {
      const r = await presenter._renderImage({ buffer: Buffer.from('xyz'), mimeType: 'image/gif' }, {});
      expect(r.content).toContain('data:image/gif;base64,');
      expect(r.metadata.isBuffer).toBe(true);
    });

    it('falls back to text when no image data', async () => {
      const r = await presenter._renderImage({ text: 'no image' }, {});
      expect(r.content).toBe('no image');
    });

    it('renders image from base64 without mimeType', async () => {
      const r = await presenter._renderImage({ base64: 'xyz' }, {});
      expect(r.content).toContain('data:image/png;base64,xyz');
    });

    it('renders image from buffer without mimeType', async () => {
      const r = await presenter._renderImage({ buffer: Buffer.from('img') }, {});
      expect(r.content).toContain('data:image/png;base64,');
    });
  });

  describe('_renderPDF', () => {
    it('renders PDF from URL', async () => {
      const r = await presenter._renderPDF({ pdfUrl: 'https://example.com/doc.pdf' }, {});
      expect(r.content).toContain('<iframe');
      expect(r.attachments[0].type).toBe('pdf');
      expect(r.actions[0].type).toBe('download');
    });

    it('renders PDF from buffer', async () => {
      const r = await presenter._renderPDF({ buffer: Buffer.from('pdf-data') }, {});
      expect(r.content).toContain('<iframe');
      expect(r.metadata.isBase64).toBe(true);
    });

    it('falls back to text when no PDF data', async () => {
      const r = await presenter._renderPDF({ text: 'no pdf' }, {});
      expect(r.content).toBe('no pdf');
    });
  });

  describe('_renderExcel', () => {
    it('renders Excel from URL', async () => {
      const r = await presenter._renderExcel({ excelUrl: 'https://example.com/data.xlsx' }, {});
      expect(r.content).toContain('Download Excel File');
      expect(r.attachments[0].type).toBe('excel');
      expect(r.actions[0].type).toBe('download');
    });

    it('renders Excel from buffer', async () => {
      const r = await presenter._renderExcel({ buffer: Buffer.from('excel-data'), filename: 'report.xlsx' }, {});
      expect(r.content).toContain('report.xlsx');
      expect(r.metadata.isBase64).toBe(true);
    });

    it('falls back to text when no Excel data', async () => {
      const r = await presenter._renderExcel({ text: 'no excel' }, {});
      expect(r.content).toBe('no excel');
    });

    it('renders Excel from buffer without filename', async () => {
      const r = await presenter._renderExcel({ buffer: Buffer.from('xlsx') }, {});
      expect(r.content).toContain('spreadsheet.xlsx');
    });
  });

  describe('_renderPPT', () => {
    it('renders PPT from URL', async () => {
      const r = await presenter._renderPPT({ pptUrl: 'https://example.com/deck.pptx' }, {});
      expect(r.content).toContain('Download PowerPoint');
      expect(r.attachments[0].type).toBe('ppt');
    });

    it('renders PPT from buffer', async () => {
      const r = await presenter._renderPPT({ buffer: Buffer.from('ppt-data') }, {});
      expect(r.content).toContain('Download PowerPoint');
      expect(r.metadata.isBase64).toBe(true);
    });

    it('falls back to text', async () => {
      const r = await presenter._renderPPT({ text: 'no ppt' }, {});
      expect(r.content).toBe('no ppt');
    });
  });

  describe('_renderVideo', () => {
    it('renders video from URL', async () => {
      const r = await presenter._renderVideo({ videoUrl: 'https://example.com/vid.mp4', duration: 120 }, {});
      expect(r.content).toContain('<video controls');
      expect(r.attachments[0].type).toBe('video');
      expect(r.metadata.duration).toBe(120);
    });

    it('falls back to text when no video URL', async () => {
      const r = await presenter._renderVideo({ text: 'no video' }, {});
      expect(r.content).toBe('no video');
    });
  });

  describe('_renderAudio', () => {
    it('renders audio from URL', async () => {
      const r = await presenter._renderAudio({ audioUrl: 'https://example.com/sound.mp3', duration: 60 }, {});
      expect(r.content).toContain('<audio controls');
      expect(r.attachments[0].type).toBe('audio');
      expect(r.metadata.duration).toBe(60);
    });

    it('falls back to text when no audio URL', async () => {
      const r = await presenter._renderAudio({ text: 'no audio' }, {});
      expect(r.content).toBe('no audio');
    });
  });

  describe('_renderFile', () => {
    it('renders file from URL', async () => {
      const r = await presenter._renderFile({ fileUrl: 'https://example.com/file.zip', filename: 'archive.zip' }, {});
      expect(r.content).toContain('archive.zip');
      expect(r.attachments[0].type).toBe('file');
      expect(r.metadata.filename).toBe('archive.zip');
    });

    it('renders file from buffer', async () => {
      const r = await presenter._renderFile({ buffer: Buffer.from('file-data'), filename: 'data.bin' }, {});
      expect(r.content).toContain('data.bin');
      expect(r.metadata.isBase64).toBe(true);
    });

    it('renders file from URL without filename', async () => {
      const r = await presenter._renderFile({ fileUrl: 'https://example.com/f.dat' }, {});
      expect(r.content).toContain('Download File');
      expect(r.content).toContain('file');
    });

    it('renders file from buffer without filename', async () => {
      const r = await presenter._renderFile({ buffer: Buffer.from('data') }, {});
      expect(r.content).toContain('Download File');
      expect(r.content).toContain('file');
    });

    it('falls back to text', async () => {
      const r = await presenter._renderFile({ text: 'no file' }, {});
      expect(r.content).toBe('no file');
    });
  });

  describe('_renderDefault', () => {
    it('delegates to _renderText', async () => {
      const r = await presenter._renderDefault({ text: 'fallback text' }, {});
      expect(r.content).toBe('fallback text');
    });
  });

  describe('_isMarkdown', () => {
    it('detects headers', () => {
      expect(presenter._isMarkdown('# Title')).toBe(true);
      expect(presenter._isMarkdown('###### small')).toBe(true);
    });

    it('detects unordered lists', () => {
      expect(presenter._isMarkdown('- item')).toBe(true);
      expect(presenter._isMarkdown('* item')).toBe(true);
    });

    it('detects ordered lists', () => {
      expect(presenter._isMarkdown('1. item')).toBe(true);
    });

    it('detects links', () => {
      expect(presenter._isMarkdown('[text](url)')).toBe(true);
    });

    it('detects bold', () => {
      expect(presenter._isMarkdown('**bold**')).toBe(true);
    });

    it('detects italic', () => {
      expect(presenter._isMarkdown('_italic_')).toBe(true);
    });

    it('returns false for plain text', () => {
      expect(presenter._isMarkdown('just plain text')).toBe(false);
    });
  });

  describe('present', () => {
    it('returns a presentation with correct shape', async () => {
      const p = new MultimodalPresenter({ enableCaching: false });
      const result = await p.present({ text: 'hello' });
      expect(result).toHaveProperty('presentationId');
      expect(result).toHaveProperty('format');
      expect(result).toHaveProperty('mimeType');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('attachments');
      expect(result).toHaveProperty('actions');
    });

    it('renders text by default', async () => {
      const p = new MultimodalPresenter({ enableCaching: false });
      const result = await p.present({ text: 'hello world' });
      expect(result.content).toBe('hello world');
      expect(result.format).toBe('Text');
    });

    it('renders in specified format from options', async () => {
      const p = new MultimodalPresenter({ enableCaching: false });
      const result = await p.present({ text: 'data' }, { format: 'json' });
      expect(result.format).toBe('JSON');
    });

    it('renders HTML format', async () => {
      const p = new MultimodalPresenter({ enableCaching: false });
      const result = await p.present({ text: 'hello' }, { format: 'html' });
      expect(result.format).toBe('HTML');
      expect(result.mimeType).toBe('text/html');
    });

    it('renders image format via options', async () => {
      const p = new MultimodalPresenter({ enableCaching: false });
      const result = await p.present({ imageUrl: 'https://example.com/i.png' }, { format: 'image' });
      expect(result.format).toBe('Image');
      expect(result.content).toContain('src="https://example.com/i.png"');
    });

    it('handles unsupported format gracefully', async () => {
      const p = new MultimodalPresenter({ enableCaching: false });
      const result = await p.present({ text: 'fallback' }, { format: 'nonexistent' });
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it('enforces content size limit', async () => {
      const p = new MultimodalPresenter({ enableCaching: false, maxContentSize: 10 });
      const result = await p.present({ text: 'a'.repeat(100) });
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('exceeds limit');
    });

    it('returns presentationId in error case', async () => {
      const p = new MultimodalPresenter({ enableCaching: false, maxContentSize: 1 });
      const result = await p.present({ text: 'too long' });
      expect(result).toHaveProperty('presentationId');
      expect(result.metadata.isError).toBe(true);
    });

    it('uses entire rendered object when renderer returns no content property', async () => {
      const p = new MultimodalPresenter({ enableCaching: false });
      p.registerFormat('nocontent', {
        renderer: async (_r, _opts) => ({ metadata: { custom: true } }),
        supports: ['nocontent']
      });
      const result = await p.present({ contentType: 'nocontent', id: 'nc' });
      expect(result.content).toEqual({ metadata: { custom: true } });
    });
  });

  describe('caching', () => {
    beforeEach(() => {
      presenter = new MultimodalPresenter({ enableCaching: true, maxContentSize: 999999 });
    });

    it('caches presentation results', async () => {
      const result = await presenter.present({ id: 'cache-test-1', text: 'cached content' });
      expect(result.fromCache).toBeUndefined();
      expect(presenter.cache.size).toBe(1);
    });

    it('returns cached result on repeat call', async () => {
      const result = await presenter.present({ id: 'cache-test-2', text: 'repeat' });
      const cached = await presenter.present({ id: 'cache-test-2', text: 'repeat' });
      expect(cached.fromCache).toBe(true);
      expect(cached.presentationId).not.toBe(result.presentationId);
    });

    it('respects cacheTTL', async () => {
      const p = new MultimodalPresenter({ enableCaching: true, maxContentSize: 999999 });
      p.cacheTTL = -1;
      const result = await p.present({ id: 'cache-ttl', text: 'expired' });
      expect(result.fromCache).toBeUndefined();
      const second = await p.present({ id: 'cache-ttl', text: 'expired' });
      expect(second.fromCache).toBeUndefined();
    });
  });

  describe('clearCache', () => {
    it('clears all cached entries', async () => {
      const p = new MultimodalPresenter({ enableCaching: true, maxContentSize: 999999 });
      await p.present({ id: 'clear-test', text: 'to clear' });
      expect(p.cache.size).toBe(1);
      p.clearCache();
      expect(p.cache.size).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('returns cache size and entries', async () => {
      const p = new MultimodalPresenter({ enableCaching: true, maxContentSize: 999999 });
      let stats = p.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.entries).toBe(0);

      await p.present({ id: 'stats-1', text: 'a' });
      await p.present({ id: 'stats-2', text: 'b' });
      stats = p.getCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.entries).toBe(2);
    });
  });

  describe('_generateCacheKey', () => {
    it('generates key from result id and format', () => {
      const fmt = presenter.formats.get('text');
      const key = presenter._generateCacheKey({ id: 'test-1' }, fmt, { indent: 2 });
      expect(key).toMatch(/^cache_/);
      expect(typeof key).toBe('string');
    });

    it('falls back to unknown when no id', () => {
      const fmt = presenter.formats.get('text');
      const key = presenter._generateCacheKey({}, fmt, {});
      expect(key).toMatch(/^cache_/);
    });
  });

  describe('_getContentSize', () => {
    it('returns size for string content', () => {
      const size = presenter._getContentSize('hello');
      expect(typeof size).toBe('number');
      expect(size).toBe(5);
    });

    it('returns JSON length for object content', () => {
      const size = presenter._getContentSize({ a: 1 });
      expect(typeof size).toBe('number');
      expect(size).toBe(JSON.stringify({ a: 1 }).length);
    });
  });
});
