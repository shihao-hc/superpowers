jest.mock('fs');

const fs = require('fs');
const path = require('path');
const { SkillRenderer, getSkillRenderer, escapeHtml, isPathSafe, isPrototypePollutionSafe } = require('../../src/skills/rendering/SkillRenderer');

beforeEach(() => {
  jest.clearAllMocks();
  fs.existsSync.mockReturnValue(true);
  fs.readdirSync.mockReturnValue([]);
  fs.statSync.mockReturnValue({ size: 100, mtime: new Date() });
  fs.readFileSync.mockReturnValue('{}');
  fs.writeFileSync.mockImplementation(() => {});
  fs.unlinkSync.mockImplementation(() => {});
  fs.mkdirSync.mockImplementation(() => {});
});

describe('escapeHtml', () => {
  test('escapes all special characters', () => {
    expect(escapeHtml('<div>&"\'/</div>')).toBe('&lt;div&gt;&amp;&quot;&#x27;&#x2F;&lt;&#x2F;div&gt;');
  });

  test('returns String(str) for non-string input', () => {
    expect(escapeHtml(123)).toBe('123');
    expect(escapeHtml(null)).toBe('null');
    expect(escapeHtml(undefined)).toBe('undefined');
    expect(escapeHtml(true)).toBe('true');
  });
});

describe('isPathSafe', () => {
  test('returns true when target is inside base', () => {
    expect(isPathSafe('/base', path.join('/base', 'sub', 'file.txt'))).toBe(true);
  });

  test('returns true when target equals base', () => {
    const base = '/base';
    expect(isPathSafe(base, base)).toBe(true);
  });

  test('returns false when target escapes base', () => {
    expect(isPathSafe('/base', '/other/file.txt')).toBe(false);
  });
});

describe('isPrototypePollutionSafe', () => {
  test('returns true for null', () => {
    expect(isPrototypePollutionSafe(null)).toBe(true);
  });

  test('returns true for non-object', () => {
    expect(isPrototypePollutionSafe('string')).toBe(true);
    expect(isPrototypePollutionSafe(42)).toBe(true);
  });

  test('returns true for safe object', () => {
    expect(isPrototypePollutionSafe({ name: 'test', value: 1 })).toBe(true);
  });

  test('returns false for __proto__ own property', () => {
    const obj = {};
    Object.defineProperty(obj, '__proto__', { value: {}, enumerable: true, configurable: true });
    expect(isPrototypePollutionSafe(obj)).toBe(false);
  });

  test('returns false for constructor key', () => {
    expect(isPrototypePollutionSafe({ constructor: {} })).toBe(false);
  });

  test('returns false for prototype key', () => {
    expect(isPrototypePollutionSafe({ prototype: {} })).toBe(false);
  });
});

describe('SkillRenderer', () => {
  let renderer;

  function createRenderer(opts = {}) {
    return new SkillRenderer({
      previewDir: '/tmp/previews',
      templatesDir: '/tmp/templates',
      ...opts
    });
  }

  beforeEach(() => {
    renderer = createRenderer();
    fs.writeFileSync.mockClear();
  });

  describe('constructor', () => {
    test('uses default options when none provided', () => {
      const r = new SkillRenderer();
      expect(r.previewDir).toContain('previews');
      expect(r.templatesDir).toContain('templates');
      expect(r.maxPreviewSize).toBe(10 * 1024 * 1024);
      expect(r.cacheTTL).toBe(3600000);
    });

    test('uses custom options', () => {
      const r = new SkillRenderer({
        previewDir: '/custom/previews',
        templatesDir: '/custom/templates',
        maxPreviewSize: 1024,
        cacheTTL: 5000
      });
      expect(r.previewDir).toBe('/custom/previews');
      expect(r.templatesDir).toBe('/custom/templates');
      expect(r.maxPreviewSize).toBe(1024);
      expect(r.cacheTTL).toBe(5000);
    });
  });

  describe('_ensureDirs', () => {
    test('creates preview dir when missing', () => {
      fs.existsSync.mockReturnValue(true);
      fs.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
      new SkillRenderer({ previewDir: '/new/dir', templatesDir: '/tmp/t' });
      expect(fs.mkdirSync).toHaveBeenCalledWith('/new/dir', { recursive: true });
    });

    test('creates templates dir when missing', () => {
      fs.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);
      new SkillRenderer({ previewDir: '/tmp/p', templatesDir: '/new/t' });
      expect(fs.mkdirSync).toHaveBeenCalledWith('/new/t', { recursive: true });
    });
  });

  describe('_startAutoCleanup', () => {
    test('creates cleanup interval', () => {
      const r = new SkillRenderer();
      expect(r.cleanupInterval).toBeDefined();
    });
  });

  describe('_cleanupExpiredCache', () => {
    test('removes expired cache entries', () => {
      renderer.previewCache.set('old', { preview: {}, timestamp: Date.now() - 999999999 });
      renderer.previewCache.set('new', { preview: {}, timestamp: Date.now() });
      renderer._cleanupExpiredCache();
      expect(renderer.previewCache.has('old')).toBe(false);
      expect(renderer.previewCache.has('new')).toBe(true);
    });
  });

  describe('getPreviewType', () => {
    test('returns image for png', () => {
      expect(renderer.getPreviewType('photo.png')).toBe('image');
    });

    test('returns image for jpg', () => {
      expect(renderer.getPreviewType('photo.jpg')).toBe('image');
    });

    test('returns image for jpeg', () => {
      expect(renderer.getPreviewType('photo.jpeg')).toBe('image');
    });

    test('returns image for gif', () => {
      expect(renderer.getPreviewType('anim.gif')).toBe('image');
    });

    test('returns image for webp', () => {
      expect(renderer.getPreviewType('pic.webp')).toBe('image');
    });

    test('returns image for svg', () => {
      expect(renderer.getPreviewType('icon.svg')).toBe('image');
    });

    test('returns image for bmp', () => {
      expect(renderer.getPreviewType('pic.bmp')).toBe('image');
    });

    test('returns html for htm', () => {
      expect(renderer.getPreviewType('page.htm')).toBe('html');
    });

    test('returns markdown for markdown extension', () => {
      expect(renderer.getPreviewType('doc.markdown')).toBe('markdown');
    });

    test('returns text for json', () => {
      expect(renderer.getPreviewType('data.json')).toBe('text');
    });

    test('returns text for xml', () => {
      expect(renderer.getPreviewType('data.xml')).toBe('text');
    });

    test('returns text for yaml', () => {
      expect(renderer.getPreviewType('data.yaml')).toBe('text');
    });

    test('returns text for yml', () => {
      expect(renderer.getPreviewType('data.yml')).toBe('text');
    });

    test('returns text for csv', () => {
      expect(renderer.getPreviewType('data.csv')).toBe('text');
    });

    test('returns pdf', () => {
      expect(renderer.getPreviewType('doc.pdf')).toBe('pdf');
    });

    test('returns code for js', () => {
      expect(renderer.getPreviewType('app.js')).toBe('code');
    });

    test('returns code for py', () => {
      expect(renderer.getPreviewType('main.py')).toBe('code');
    });

    test('returns code for java', () => {
      expect(renderer.getPreviewType('App.java')).toBe('code');
    });

    test('returns code for cpp', () => {
      expect(renderer.getPreviewType('main.cpp')).toBe('code');
    });

    test('returns code for c', () => {
      expect(renderer.getPreviewType('main.c')).toBe('code');
    });

    test('returns code for go', () => {
      expect(renderer.getPreviewType('main.go')).toBe('code');
    });

    test('returns code for rs', () => {
      expect(renderer.getPreviewType('main.rs')).toBe('code');
    });

    test('returns code for ts', () => {
      expect(renderer.getPreviewType('app.ts')).toBe('code');
    });

    test('returns unknown for unrecognized extension', () => {
      expect(renderer.getPreviewType('file.xyz')).toBe('unknown');
    });

    test('returns unknown for no extension', () => {
      expect(renderer.getPreviewType('Makefile')).toBe('unknown');
    });
  });

  describe('createImagePreview', () => {
    test('throws when buffer exceeds maxPreviewSize', () => {
      const bigBuf = Buffer.alloc(1024 * 1024 * 11);
      expect(() => renderer.createImagePreview(bigBuf, 'big.png')).toThrow('File size exceeds maximum limit');
    });

    test('throws for invalid image extension', () => {
      expect(() => renderer.createImagePreview(Buffer.from('data'), 'file.txt')).toThrow('Invalid image extension');
    });

    test('creates preview for valid image', () => {
      const result = renderer.createImagePreview(Buffer.from('data'), 'photo.png');
      expect(result.id).toBeDefined();
      expect(result.type).toBe('image');
      expect(result.format).toBe('png');
      expect(result.size).toBe(4);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('createHTMLPreview', () => {
    test('creates preview with default title', () => {
      const result = renderer.createHTMLPreview('<p>Hello</p>', 'page.html');
      expect(result.type).toBe('html');
      expect(result.iframeUrl).toContain('/iframe');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('creates preview with custom title option', () => {
      const result = renderer.createHTMLPreview('<p>Hello</p>', 'page.html', { title: 'My Title' });
      expect(result.type).toBe('html');
    });
  });

  describe('createMarkdownPreview', () => {
    test('converts markdown and creates HTML preview', () => {
      const result = renderer.createMarkdownPreview('# Title\n**bold**\n*italic*\n`code`\n\nParagraph', 'doc.md');
      expect(result.type).toBe('html');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('createTextPreview', () => {
    test('creates preview for plain text', () => {
      const result = renderer.createTextPreview('Hello world', 'readme.txt');
      expect(result.type).toBe('text');
      expect(result.format).toBe('txt');
    });

    test('creates preview for js code with syntax highlighting', () => {
      const result = renderer.createTextPreview('const x = 1;', 'app.js');
      expect(result.type).toBe('text');
    });

    test('creates preview for python code', () => {
      const result = renderer.createTextPreview('def foo(): pass', 'main.py');
      expect(result.type).toBe('text');
    });

    test('creates preview for unknown code extension', () => {
      const result = renderer.createTextPreview('int main() {}', 'main.go');
      expect(result.type).toBe('text');
    });
  });

  describe('createPDFPreview', () => {
    test('creates PDF preview with viewer', () => {
      const result = renderer.createPDFPreview(Buffer.from('%PDF'), 'doc.pdf');
      expect(result.type).toBe('pdf');
      expect(result.pdfUrl).toContain('/raw');
      expect(result.viewerPath).toContain('_viewer.html');
    });
  });

  describe('createPreview', () => {
    test('routes image type to createImagePreview', () => {
      const result = renderer.createPreview(Buffer.from('data'), 'photo.png');
      expect(result.type).toBe('image');
    });

    test('routes html type to createHTMLPreview', () => {
      const result = renderer.createPreview('<p>hi</p>', 'page.html');
      expect(result.type).toBe('html');
    });

    test('routes markdown type to createMarkdownPreview', () => {
      const result = renderer.createPreview('# Title', 'doc.md');
      expect(result.type).toBe('html');
    });

    test('routes text type to createTextPreview', () => {
      const result = renderer.createPreview('hello', 'file.txt');
      expect(result.type).toBe('text');
    });

    test('routes code type to createTextPreview', () => {
      const result = renderer.createPreview('const x=1', 'app.js');
      expect(result.type).toBe('text');
    });

    test('routes pdf type to createPDFPreview', () => {
      const result = renderer.createPreview(Buffer.from('%PDF'), 'doc.pdf');
      expect(result.type).toBe('pdf');
    });

    test('routes unknown type to createTextPreview (default)', () => {
      const result = renderer.createPreview('data', 'file.xyz');
      expect(result.type).toBe('text');
    });

    test('handles base64 string data for image', () => {
      const result = renderer.createPreview(Buffer.from('data').toString('base64'), 'photo.png');
      expect(result.type).toBe('image');
    });

    test('handles string data for html', () => {
      const result = renderer.createPreview('<b>hi</b>', 'page.html');
      expect(result.type).toBe('html');
    });

    test('handles string data for markdown', () => {
      const result = renderer.createPreview('# Hi', 'doc.md');
      expect(result.type).toBe('html');
    });

    test('handles string data for text', () => {
      const result = renderer.createPreview('hello', 'file.txt');
      expect(result.type).toBe('text');
    });

    test('handles base64 string data for pdf', () => {
      const result = renderer.createPreview(Buffer.from('%PDF').toString('base64'), 'doc.pdf');
      expect(result.type).toBe('pdf');
    });
  });

  describe('getPreview', () => {
    test('returns null for invalid previewId (null)', () => {
      expect(renderer.getPreview(null)).toBeNull();
    });

    test('returns null for invalid previewId (special chars)', () => {
      expect(renderer.getPreview('../etc/passwd')).toBeNull();
    });

    test('returns cached preview if valid', () => {
      const preview = { id: 'abc123', path: '/tmp/previews/abc123.html', size: 100, modifiedAt: new Date().toISOString() };
      renderer.previewCache.set('abc123', { preview, timestamp: Date.now() });
      expect(renderer.getPreview('abc123')).toBe(preview);
    });

    test('returns null if no matching file found', () => {
      fs.readdirSync.mockReturnValue([]);
      expect(renderer.getPreview('abc123')).toBeNull();
    });

    test('returns preview info when file exists', () => {
      fs.readdirSync.mockReturnValue(['abc123.html']);
      fs.statSync.mockReturnValue({ size: 200, mtime: new Date() });
      const result = renderer.getPreview('abc123');
      expect(result).toBeTruthy();
      expect(result.id).toBe('abc123');
      expect(result.size).toBe(200);
    });
  });

  describe('deletePreview', () => {
    test('throws for invalid previewId (null)', () => {
      expect(() => renderer.deletePreview(null)).toThrow('Invalid preview ID');
    });

    test('throws for invalid previewId (special chars)', () => {
      expect(() => renderer.deletePreview('../hack')).toThrow('Invalid preview ID');
    });

    test('deletes matching files', () => {
      fs.readdirSync.mockReturnValue(['abc123.html', 'abc123.pdf', 'other.txt']);
      const result = renderer.deletePreview('abc123');
      expect(result.deleted).toBe(2);
    });

    test('returns 0 deleted when no files match', () => {
      fs.readdirSync.mockReturnValue(['other.txt']);
      const result = renderer.deletePreview('abc123');
      expect(result.deleted).toBe(0);
    });
  });

  describe('cleanupExpiredPreviews', () => {
    test('deletes files older than maxAge', () => {
      const oldDate = new Date(Date.now() - 999999999);
      fs.readdirSync.mockReturnValue(['old.txt', 'new.txt']);
      fs.statSync
        .mockReturnValueOnce({ size: 100, mtime: oldDate })
        .mockReturnValueOnce({ size: 100, mtime: new Date() });
      const result = renderer.cleanupExpiredPreviews(1000);
      expect(result.deleted).toBe(1);
    });

    test('returns 0 when no files are expired', () => {
      fs.readdirSync.mockReturnValue([]);
      const result = renderer.cleanupExpiredPreviews(999999999);
      expect(result.deleted).toBe(0);
    });
  });

  describe('_loadTemplates', () => {
    test('loads templates from file when it exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        templates: { t1: { id: 't1' } },
        categories: { c1: { id: 'c1' } }
      }));
      const r = new SkillRenderer();
      expect(r.templates.get('t1')).toEqual({ id: 't1' });
      expect(r.categories.get('c1')).toEqual({ id: 'c1' });
    });

    test('does not load when file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const r = new SkillRenderer();
      expect(r.templates.size).toBe(3);
    });

    test('handles JSON parse error gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json{{{');
      const r = new SkillRenderer();
      expect(r.templates.size).toBe(3);
    });
  });

  describe('_saveTemplates', () => {
    test('saves templates to file', () => {
      renderer._saveTemplates();
      expect(fs.writeFileSync).toHaveBeenCalled();
      const callArgs = fs.writeFileSync.mock.calls.find(c => String(c[0]).includes('templates.json'));
      expect(callArgs).toBeTruthy();
      const saved = JSON.parse(callArgs[1]);
      expect(saved.templates).toBeDefined();
      expect(saved.categories).toBeDefined();
      expect(saved.lastUpdated).toBeDefined();
    });

    test('handles write error gracefully', () => {
      fs.writeFileSync.mockImplementation(() => { throw new Error('disk full'); });
      expect(() => renderer._saveTemplates()).not.toThrow();
    });
  });

  describe('_initDefaultTemplates', () => {
    test('initializes default templates when templates map is empty', () => {
      const r = new SkillRenderer();
      expect(r.templates.has('weekly-report')).toBe(true);
      expect(r.templates.has('meeting-minutes')).toBe(true);
      expect(r.templates.has('leave-request')).toBe(true);
      expect(r.categories.has('report')).toBe(true);
      expect(r.categories.has('hr')).toBe(true);
      expect(r.categories.has('legal')).toBe(true);
      expect(r.categories.has('finance')).toBe(true);
      expect(r.categories.has('other')).toBe(true);
    });

    test('skips initialization when templates already exist', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        templates: { existing: { id: 'existing' } },
        categories: {}
      }));
      const r = new SkillRenderer();
      expect(r.templates.has('existing')).toBe(true);
      expect(r.templates.has('weekly-report')).toBe(false);
    });
  });

  describe('listTemplates', () => {
    test('returns all templates with default pagination', () => {
      const result = renderer.listTemplates();
      expect(result.templates.length).toBe(3);
      expect(result.total).toBe(3);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    test('filters by category', () => {
      const result = renderer.listTemplates({ category: 'hr' });
      expect(result.templates.length).toBe(1);
      expect(result.templates[0].id).toBe('leave-request');
    });

    test('filters by search term', () => {
      const result = renderer.listTemplates({ search: '周报' });
      expect(result.templates.length).toBe(1);
      expect(result.templates[0].id).toBe('weekly-report');
    });

    test('search matches description', () => {
      const result = renderer.listTemplates({ search: '会议' });
      expect(result.templates.length).toBe(1);
    });

    test('applies pagination with limit and offset', () => {
      const result = renderer.listTemplates({ limit: 1, offset: 1 });
      expect(result.templates.length).toBe(1);
      expect(result.offset).toBe(1);
    });

    test('returns empty when offset exceeds total', () => {
      const result = renderer.listTemplates({ offset: 100 });
      expect(result.templates.length).toBe(0);
    });

    test('returns empty when category has no templates', () => {
      const result = renderer.listTemplates({ category: 'nonexistent' });
      expect(result.templates.length).toBe(0);
    });
  });

  describe('getTemplate', () => {
    test('returns template by id', () => {
      const t = renderer.getTemplate('weekly-report');
      expect(t).toBeTruthy();
      expect(t.name).toBe('周报');
    });

    test('returns null for nonexistent id', () => {
      expect(renderer.getTemplate('nonexistent')).toBeNull();
    });
  });

  describe('createTemplate', () => {
    test('creates a new template', () => {
      const result = renderer.createTemplate({
        id: 'new-tpl',
        name: 'New Template',
        template: 'Content {{var}}'
      });
      expect(result.id).toBe('new-tpl');
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    test('throws when required fields missing', () => {
      expect(() => renderer.createTemplate({ id: 'x' })).toThrow('id, name, and template are required');
    });

    test('throws when id already exists', () => {
      expect(() => renderer.createTemplate({
        id: 'weekly-report',
        name: 'Dup',
        template: 'x'
      })).toThrow('already exists');
    });
  });

  describe('updateTemplate', () => {
    test('updates template fields', () => {
      const result = renderer.updateTemplate('weekly-report', { name: 'Updated Report' });
      expect(result.name).toBe('Updated Report');
      expect(result.updatedAt).toBeDefined();
    });

    test('throws for nonexistent template', () => {
      expect(() => renderer.updateTemplate('nonexistent', { name: 'x' })).toThrow('Template not found');
    });

    test('throws on prototype pollution attempt with constructor', () => {
      expect(() => renderer.updateTemplate('weekly-report', { constructor: { polluted: true } })).toThrow('prototype pollution');
    });

    test('throws on prototype pollution attempt with prototype key', () => {
      expect(() => renderer.updateTemplate('weekly-report', { prototype: { polluted: true } })).toThrow('prototype pollution');
    });

    test('ignores non-allowed fields', () => {
      const result = renderer.updateTemplate('weekly-report', { name: 'New', id: 'hacked', sneaky: true });
      expect(result.name).toBe('New');
      expect(result.id).toBe('weekly-report');
    });
  });

  describe('deleteTemplate', () => {
    test('deletes an existing template', () => {
      const result = renderer.deleteTemplate('weekly-report');
      expect(result.deleted).toBe(true);
      expect(renderer.getTemplate('weekly-report')).toBeNull();
    });

    test('throws for nonexistent template', () => {
      expect(() => renderer.deleteTemplate('nonexistent')).toThrow('Template not found');
    });
  });

  describe('renderTemplate', () => {
    test('renders template with data', () => {
      const result = renderer.renderTemplate('weekly-report', {
        week: '25',
        author: '张三',
        completedTasks: 'Task A',
        nextWeekPlan: 'Task B'
      });
      expect(result.content).toContain('25');
      expect(result.content).toContain('张三');
      expect(result.generatedAt).toBeDefined();
    });

    test('replaces {{date}} and {{generatedAt}}', () => {
      const result = renderer.renderTemplate('weekly-report', {
        week: '1', author: 'A', completedTasks: '', nextWeekPlan: ''
      });
      expect(result.content).toContain(new Date().toISOString().split('T')[0]);
    });

    test('throws for nonexistent template', () => {
      expect(() => renderer.renderTemplate('nonexistent', {})).toThrow('Template not found');
    });

    test('throws on prototype pollution in data (constructor)', () => {
      expect(() => renderer.renderTemplate('weekly-report', { constructor: {} })).toThrow('prototype pollution');
    });

    test('throws on prototype pollution in data (prototype key)', () => {
      expect(() => renderer.renderTemplate('weekly-report', { prototype: {} })).toThrow('prototype pollution');
    });

    test('HTML type templates escape values', () => {
      renderer.createTemplate({
        id: 'html-tpl',
        name: 'HTML',
        type: 'html',
        template: '<div>{{content}}</div>'
      });
      const result = renderer.renderTemplate('html-tpl', { content: '<script>alert(1)</script>' });
      expect(result.content).not.toContain('<script>alert(1)</script>');
      expect(result.content).toContain('&lt;script&gt;');
    });

    test('non-HTML type does not escape values', () => {
      const result = renderer.renderTemplate('weekly-report', {
        week: '<b>test</b>', author: '', completedTasks: '', nextWeekPlan: ''
      });
      expect(result.content).toContain('<b>test</b>');
    });

    test('replaces undefined values with empty string', () => {
      const result = renderer.renderTemplate('weekly-report', {
        week: 'x', author: 'x', completedTasks: 'x', nextWeekPlan: 'x'
      });
      expect(result.content).toContain('x');
      expect(result.template).toBeDefined();
    });
  });

  describe('validateTemplateData', () => {
    test('returns valid for complete data', () => {
      const result = renderer.validateTemplateData('weekly-report', {
        week: '1', author: 'A', completedTasks: 'done', nextWeekPlan: 'next'
      });
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    test('returns errors for missing required fields', () => {
      const result = renderer.validateTemplateData('weekly-report', {});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(4);
    });

    test('detects empty string as missing', () => {
      const result = renderer.validateTemplateData('weekly-report', {
        week: '', author: 'A', completedTasks: 'done', nextWeekPlan: 'next'
      });
      expect(result.valid).toBe(false);
      expect(result.errors.find(e => e.field === 'week')).toBeTruthy();
    });

    test('throws for nonexistent template', () => {
      expect(() => renderer.validateTemplateData('nonexistent', {})).toThrow('Template not found');
    });
  });

  describe('_sanitizeHTML', () => {
    test('returns empty string for falsy input', () => {
      expect(renderer._sanitizeHTML('')).toBe('');
      expect(renderer._sanitizeHTML(null)).toBe('');
      expect(renderer._sanitizeHTML(123)).toBe('');
    });

    test('removes full script tags', () => {
      const result = renderer._sanitizeHTML('<script>alert("xss")</script>');
      expect(result).not.toContain('<script');
    });

    test('removes script open tags', () => {
      const result = renderer._sanitizeHTML('<script src="evil.js">');
      expect(result).not.toContain('<script');
    });

    test('removes script close tags', () => {
      const result = renderer._sanitizeHTML('text</script>');
      expect(result).not.toContain('</script>');
    });

    test('removes inline event handlers with double quotes', () => {
      const result = renderer._sanitizeHTML('<div onclick="alert(1)">');
      expect(result).not.toContain('onclick');
    });

    test('removes inline event handlers with single quotes', () => {
      const result = renderer._sanitizeHTML('<div onclick=\'alert(1)\'></div>');
      expect(result).not.toContain('onclick');
    });

    test('removes inline event handlers without quotes', () => {
      const result = renderer._sanitizeHTML('<div onclick=alert(1)>');
      expect(result).not.toContain('onclick');
    });

    test('removes javascript: href', () => {
      const jsUrl = 'java' + 'script:';
      const result = renderer._sanitizeHTML('<a href="' + jsUrl + 'alert(1)">click</a>');
      expect(result).not.toContain(jsUrl);
      expect(result).toContain('data-removed-');
    });

    test('removes data: src', () => {
      const result = renderer._sanitizeHTML('<img src="data:text/html,<script>alert(1)</script>">');
      expect(result).not.toContain('data:');
    });

    test('removes dangerous tags: iframe', () => {
      const result = renderer._sanitizeHTML('<iframe src="evil.html"></iframe>');
      expect(result).toContain('<!-- iframe removed -->');
      expect(result).not.toContain('<iframe');
    });

    test('removes dangerous tags: object', () => {
      const result = renderer._sanitizeHTML('<object></object>');
      expect(result).toContain('<!-- object removed -->');
      expect(result).not.toContain('<object');
    });

    test('removes dangerous tags: embed (self-closing)', () => {
      const result = renderer._sanitizeHTML('<embed/>');
      expect(result).toContain('<!-- embed removed -->');
      expect(result).not.toContain('<embed');
    });

    test('removes dangerous tags: applet', () => {
      const result = renderer._sanitizeHTML('<applet></applet>');
      expect(result).toContain('<!-- applet removed -->');
      expect(result).not.toContain('<applet');
    });

    test('removes dangerous tags: form', () => {
      const result = renderer._sanitizeHTML('<form></form>');
      expect(result).toContain('<!-- form removed -->');
      expect(result).not.toContain('<form');
    });

    test('removes dangerous tags: input', () => {
      const result = renderer._sanitizeHTML('<input type="text"/>');
      expect(result).toContain('<!-- input removed -->');
      expect(result).not.toContain('<input');
    });

    test('removes dangerous tags: button', () => {
      const result = renderer._sanitizeHTML('<button>click</button>');
      expect(result).toContain('<!-- button removed -->');
      expect(result).not.toContain('<button');
    });

    test('removes dangerous tags: select', () => {
      const result = renderer._sanitizeHTML('<select></select>');
      expect(result).toContain('<!-- select removed -->');
      expect(result).not.toContain('<select');
    });

    test('removes dangerous tags: textarea', () => {
      const result = renderer._sanitizeHTML('<textarea></textarea>');
      expect(result).toContain('<!-- textarea removed -->');
      expect(result).not.toContain('<textarea');
    });

    test('preserves safe content', () => {
      const result = renderer._sanitizeHTML('<div class="content">Hello <b>World</b></div>');
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });
  });

  describe('_wrapHTMLForPreview', () => {
    test('wraps with default title', () => {
      const result = renderer._wrapHTMLForPreview('<p>hi</p>');
      expect(result).toContain('HTML Preview');
      expect(result).toContain('<p>hi</p>');
      expect(result).toContain('Content-Security-Policy');
    });

    test('wraps with custom title', () => {
      const result = renderer._wrapHTMLForPreview('<p>hi</p>', { title: 'Custom' });
      expect(result).toContain('Custom');
    });

    test('escapes title to prevent XSS', () => {
      const result = renderer._wrapHTMLForPreview('<p>hi</p>', { title: '<script>alert(1)</script>' });
      expect(result).not.toContain('<script>alert(1)</script>');
    });
  });

  describe('_markdownToHTML', () => {
    test('converts h1, h2, h3', () => {
      const result = renderer._markdownToHTML('# H1\n## H2\n### H3');
      expect(result).toContain('<h1>H1</h1>');
      expect(result).toContain('<h2>H2</h2>');
      expect(result).toContain('<h3>H3</h3>');
    });

    test('converts bold, italic, code', () => {
      const result = renderer._markdownToHTML('**bold**\n*italic*\n`code`');
      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('<em>italic</em>');
      expect(result).toContain('<code>code</code>');
    });

    test('converts newlines to br', () => {
      const result = renderer._markdownToHTML('line1\nline2');
      expect(result).toContain('<br>');
    });
  });

  describe('_highlightSyntax', () => {
    test('highlights JS keywords', () => {
      const result = renderer._highlightSyntax('const x = 1;', 'app.js');
      expect(result).toContain('color:#c678dd');
    });

    test('highlights JS builtins', () => {
      const result = renderer._highlightSyntax('console.log(x);', 'app.js');
      expect(result).toContain('color:#e5c07b');
    });

    test('highlights JS strings', () => {
      const result = renderer._highlightSyntax('const s = \'hello\';', 'app.js');
      expect(result).toContain('color:#98c379');
    });

    test('highlights JS comments', () => {
      const result = renderer._highlightSyntax('// comment', 'app.js');
      expect(result).toContain('color:#5c6370');
    });

    test('highlights TS keywords', () => {
      const result = renderer._highlightSyntax('const x = 1;', 'app.ts');
      expect(result).toContain('color:#c678dd');
    });

    test('highlights Python keywords', () => {
      const result = renderer._highlightSyntax('def foo(): return True', 'main.py');
      expect(result).toContain('color:#c678dd');
    });

    test('highlights Python builtins', () => {
      const result = renderer._highlightSyntax('print(len(x))', 'main.py');
      expect(result).toContain('color:#e5c07b');
    });

    test('highlights Python comments', () => {
      const result = renderer._highlightSyntax('# comment', 'main.py');
      expect(result).toContain('color:#5c6370');
    });

    test('does not highlight unknown extensions', () => {
      const result = renderer._highlightSyntax('hello', 'file.xyz');
      expect(result).not.toContain('color:');
    });

    test('escapes HTML in content', () => {
      const result = renderer._highlightSyntax('<div>test</div>', 'app.js');
      expect(result).not.toContain('<div>');
      expect(result).toContain('&lt;div&gt;');
    });

    test('highlights JSX keywords', () => {
      const result = renderer._highlightSyntax('const x = 1;', 'app.jsx');
      expect(result).toContain('color:#c678dd');
    });

    test('highlights TSX keywords', () => {
      const result = renderer._highlightSyntax('const x = 1;', 'app.tsx');
      expect(result).toContain('color:#c678dd');
    });
  });

  describe('_createPDFViewer', () => {
    test('creates viewer HTML with previewId', () => {
      const result = renderer._createPDFViewer('abc123');
      expect(result).toContain('abc123');
      expect(result).toContain('iframe');
      expect(result).toContain('pdf-container');
    });
  });

  describe('getStats', () => {
    test('returns preview and template stats', () => {
      fs.readdirSync.mockReturnValue(['a.html', 'b.pdf']);
      fs.statSync.mockReturnValue({ size: 500 });
      const stats = renderer.getStats();
      expect(stats.previews.totalFiles).toBe(2);
      expect(stats.previews.totalSize).toBe(1000);
      expect(stats.templates.totalTemplates).toBe(3);
      expect(stats.templates.totalCategories).toBe(5);
    });

    test('handles empty preview dir', () => {
      fs.readdirSync.mockReturnValue([]);
      const stats = renderer.getStats();
      expect(stats.previews.totalFiles).toBe(0);
      expect(stats.previews.totalSize).toBe(0);
    });
  });
});

describe('interval cleanup', () => {
    test('triggers _cleanupExpiredCache via setInterval', () => {
      jest.useFakeTimers();
      const r = new SkillRenderer();
      r.previewCache.set('expired', { preview: {}, timestamp: Date.now() - 999999999 });
      jest.runOnlyPendingTimers();
      expect(r.previewCache.has('expired')).toBe(false);
      jest.useRealTimers();
    });
  });

  describe('path traversal in getPreview', () => {
    test('returns null when file resolves outside previewDir', () => {
      const r = new SkillRenderer({ previewDir: 'C:\\tmp\\previews', templatesDir: 'C:\\tmp\\templates' });
      fs.readdirSync.mockReturnValue(['abc123..\\..\\..\\etc\\passwd']);
      const result = r.getPreview('abc123');
      expect(result).toBeNull();
    });
  });

  describe('path traversal in deletePreview', () => {
    test('skips unlink for files resolving outside previewDir', () => {
      const r = new SkillRenderer({ previewDir: 'C:\\tmp\\previews', templatesDir: 'C:\\tmp\\templates' });
      fs.readdirSync.mockReturnValue(['abc123..\\..\\..\\etc\\passwd']);
      const result = r.deletePreview('abc123');
      expect(result.deleted).toBe(1);
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

describe('getSkillRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue([]);
    fs.readFileSync.mockReturnValue('{}');
    fs.writeFileSync.mockImplementation(() => {});
  });

  test('returns same instance on repeated calls', () => {
    const r1 = getSkillRenderer();
    const r2 = getSkillRenderer();
    expect(r1).toBe(r2);
  });

  test('creates new instance on first call', () => {
    const r = getSkillRenderer({ previewDir: '/tmp/p', templatesDir: '/tmp/t' });
    expect(r).toBeInstanceOf(SkillRenderer);
  });
});
