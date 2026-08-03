jest.mock('fs');

const fs = require('fs');
const { SkillTemplates, getSkillTemplates, DEPRECATED, REPLACEMENT } = require('../../src/skills/templates/SkillTemplates');

const TEST_DIR = 'D:\\test\\templates';
const TEMPLATES_FILE = `${TEST_DIR}\\templates.json`;

describe('SkillTemplates', () => {
  let warnSpy;

  beforeAll(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterAll(() => {
    warnSpy.mockRestore();
    console.log.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockReturnValue(undefined);
    fs.readFileSync.mockReturnValue(JSON.stringify({ templates: {}, categories: {} }));
    fs.writeFileSync.mockReturnValue(undefined);
  });

  // =============================================
  // CONSTRUCTOR
  // =============================================
  describe('constructor', () => {
    it('creates templates dir when not exists', () => {
      new SkillTemplates({ templatesDir: TEST_DIR });
      expect(fs.mkdirSync).toHaveBeenCalledWith(TEST_DIR, { recursive: true });
    });

    it('skips creating templates dir when already exists', () => {
      fs.existsSync.mockImplementation((p) => p === TEST_DIR);
      new SkillTemplates({ templatesDir: TEST_DIR });
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('initializes 6 default templates when no saved data', () => {
      const instance = new SkillTemplates({ templatesDir: TEST_DIR });
      expect(instance.listTemplates().total).toBe(6);
    });

    it('initializes 6 default categories', () => {
      const instance = new SkillTemplates({ templatesDir: TEST_DIR });
      expect(instance.listCategories()).toHaveLength(6);
    });

    it('loads existing templates from saved file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        templates: { custom: { id: 'custom', name: 'Custom', template: 'Hello' } },
        categories: { cat1: { id: 'cat1', name: 'Cat' } }
      }));
      const instance = new SkillTemplates({ templatesDir: TEST_DIR });
      expect(instance.getTemplate('custom')).toBeTruthy();
      expect(instance.listCategories()).toHaveLength(1);
    });

    it('falls back to defaults when saved data is corrupt', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => { throw new Error('Parse error'); });
      const instance = new SkillTemplates({ templatesDir: TEST_DIR });
      expect(instance.listTemplates().total).toBe(6);
    });

    it('saves default templates to file', () => {
      new SkillTemplates({ templatesDir: TEST_DIR });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        TEMPLATES_FILE,
        expect.stringContaining('"weekly-report"')
      );
    });

    it('does not override existing templates with defaults', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        templates: { existing: { id: 'existing', name: 'Existing', template: 'Hi' } },
        categories: {}
      }));
      const instance = new SkillTemplates({ templatesDir: TEST_DIR });
      expect(instance.listTemplates().total).toBe(1);
      expect(instance.getTemplate('existing').name).toBe('Existing');
    });
  });

  // =============================================
  // listTemplates
  // =============================================
  describe('listTemplates', () => {
    let instance;

    beforeEach(() => {
      instance = new SkillTemplates({ templatesDir: TEST_DIR });
      jest.clearAllMocks();
    });

    it('returns all templates with total count', () => {
      const result = instance.listTemplates();
      expect(result.templates).toHaveLength(6);
      expect(result.total).toBe(6);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('filters by category', () => {
      const result = instance.listTemplates({ category: 'report' });
      expect(result.total).toBe(2);
      result.templates.forEach((t) => expect(t.category).toBe('report'));
    });

    it('filters by search matching name', () => {
      const result = instance.listTemplates({ search: '周报' });
      expect(result.total).toBe(1);
      expect(result.templates[0].id).toBe('weekly-report');
    });

    it('filters by search matching description', () => {
      const result = instance.listTemplates({ search: '发票' });
      expect(result.total).toBe(1);
      expect(result.templates[0].id).toBe('invoice');
    });

    it('filters by search matching tags', () => {
      const result = instance.listTemplates({ search: '请假' });
      expect(result.total).toBe(1);
      expect(result.templates[0].id).toBe('leave-request');
    });

    it('filters by tags array', () => {
      const result = instance.listTemplates({ tags: ['法律'] });
      expect(result.total).toBe(1);
      expect(result.templates[0].id).toBe('contract');
    });

    it('filters by multiple tags (OR logic)', () => {
      const result = instance.listTemplates({ tags: ['请假', '周报'] });
      expect(result.total).toBe(2);
    });

    it('applies pagination with limit and offset', () => {
      const result = instance.listTemplates({ limit: 2, offset: 0 });
      expect(result.templates).toHaveLength(2);
      expect(result.total).toBe(6);
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(0);
    });

    it('respects offset for pagination', () => {
      const result = instance.listTemplates({ limit: 2, offset: 5 });
      expect(result.templates).toHaveLength(1);
      expect(result.total).toBe(6);
    });

    it('returns empty for non-existent category', () => {
      const result = instance.listTemplates({ category: 'NONEXISTENT' });
      expect(result.total).toBe(0);
      expect(result.templates).toHaveLength(0);
    });

    it('returns empty for non-matching search', () => {
      const result = instance.listTemplates({ search: 'XYZZYX' });
      expect(result.total).toBe(0);
    });

    it('returns empty for non-matching tags', () => {
      const result = instance.listTemplates({ tags: ['nonexistent'] });
      expect(result.total).toBe(0);
    });
  });

  // =============================================
  // getTemplate
  // =============================================
  describe('getTemplate', () => {
    let instance;

    beforeEach(() => {
      instance = new SkillTemplates({ templatesDir: TEST_DIR });
      jest.clearAllMocks();
    });

    it('returns template by id', () => {
      const tmpl = instance.getTemplate('weekly-report');
      expect(tmpl).toBeTruthy();
      expect(tmpl.id).toBe('weekly-report');
      expect(tmpl.name).toBe('周报');
    });

    it('returns null for non-existent id', () => {
      expect(instance.getTemplate('nonexistent')).toBeNull();
    });
  });

  // =============================================
  // createTemplate
  // =============================================
  describe('createTemplate', () => {
    let instance;

    beforeEach(() => {
      instance = new SkillTemplates({ templatesDir: TEST_DIR });
      jest.clearAllMocks();
    });

    it('creates a new template with required fields', () => {
      const result = instance.createTemplate({
        id: 'custom-template',
        name: 'Custom',
        template: 'Hello {{name}}'
      });
      expect(result.id).toBe('custom-template');
      expect(result.name).toBe('Custom');
      expect(result.template).toBe('Hello {{name}}');
      expect(result.category).toBe('other');
      expect(result.type).toBe('markdown');
      expect(result.tags).toEqual([]);
      expect(result.fields).toEqual([]);
      expect(result.createdAt).toBeTruthy();
      expect(result.updatedAt).toBeTruthy();
    });

    it('throws when id is missing', () => {
      expect(() => instance.createTemplate({ name: 'No ID', template: 'x' }))
        .toThrow('id, name, and template are required');
    });

    it('throws when name is missing', () => {
      expect(() => instance.createTemplate({ id: 'no-name', template: 'x' }))
        .toThrow('id, name, and template are required');
    });

    it('throws when template content is missing', () => {
      expect(() => instance.createTemplate({ id: 'no-tmpl', name: 'x' }))
        .toThrow('id, name, and template are required');
    });

    it('throws on duplicate id', () => {
      instance.createTemplate({ id: 'dup', name: 'First', template: 'x' });
      expect(() => instance.createTemplate({ id: 'dup', name: 'Second', template: 'y' }))
        .toThrow('Template with id dup already exists');
    });

    it('accepts optional fields', () => {
      const result = instance.createTemplate({
        id: 'full',
        name: 'Full',
        description: 'Full desc',
        category: 'report',
        type: 'html',
        tags: ['tag1', 'tag2'],
        fields: [{ name: 'f1', label: 'Field 1', type: 'text' }],
        template: '<div>{{f1}}</div>'
      });
      expect(result.description).toBe('Full desc');
      expect(result.category).toBe('report');
      expect(result.type).toBe('html');
      expect(result.tags).toEqual(['tag1', 'tag2']);
      expect(result.fields).toHaveLength(1);
    });

    it('persists template to disk', () => {
      instance.createTemplate({ id: 'persist', name: 'Persist', template: 'x' });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        TEMPLATES_FILE,
        expect.stringContaining('"persist"')
      );
    });
  });

  // =============================================
  // updateTemplate
  // =============================================
  describe('updateTemplate', () => {
    let instance;

    beforeEach(() => {
      instance = new SkillTemplates({ templatesDir: TEST_DIR });
      jest.clearAllMocks();
    });

    it('updates allowed fields on existing template', () => {
      const updated = instance.updateTemplate('weekly-report', { name: 'Updated Name', description: 'New desc' });
      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('New desc');
      expect(updated.id).toBe('weekly-report');
      expect(updated.category).toBe('report');
    });

    it('throws for non-existent template', () => {
      expect(() => instance.updateTemplate('nonexistent', { name: 'x' }))
        .toThrow('Template not found: nonexistent');
    });

    it('throws on prototype pollution attempt', () => {
      const malicious = {};
      Object.defineProperty(malicious, '__proto__', { value: {}, enumerable: true, configurable: true });
      expect(() => instance.updateTemplate('weekly-report', malicious))
        .toThrow('potential prototype pollution attempt');
    });

    it('throws on constructor key in updates', () => {
      expect(() => instance.updateTemplate('weekly-report', { constructor: {} }))
        .toThrow('potential prototype pollution attempt');
    });

    it('throws on prototype key in updates', () => {
      expect(() => instance.updateTemplate('weekly-report', { prototype: {} }))
        .toThrow('potential prototype pollution attempt');
    });

    it('ignores fields not in allowed list', () => {
      const updated = instance.updateTemplate('weekly-report', { _secret: 'hack', name: 'New' });
      expect(updated.name).toBe('New');
      expect(updated._secret).toBeUndefined();
    });

    it('preserves template id', () => {
      const updated = instance.updateTemplate('weekly-report', { name: 'Renamed' });
      expect(updated.id).toBe('weekly-report');
    });

    it('sets updatedAt timestamp', () => {
      const updated = instance.updateTemplate('weekly-report', { name: 'x' });
      expect(updated.updatedAt).toBeTruthy();
    });

    it('persists changes to disk', () => {
      instance.updateTemplate('weekly-report', { name: 'New' });
      expect(fs.writeFileSync).toHaveBeenCalled();
      const savedData = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedData.templates['weekly-report'].name).toBe('New');
    });
  });

  // =============================================
  // deleteTemplate
  // =============================================
  describe('deleteTemplate', () => {
    let instance;

    beforeEach(() => {
      instance = new SkillTemplates({ templatesDir: TEST_DIR });
      jest.clearAllMocks();
    });

    it('deletes an existing template', () => {
      const result = instance.deleteTemplate('weekly-report');
      expect(result).toEqual({ deleted: true });
      expect(instance.getTemplate('weekly-report')).toBeNull();
      expect(instance.listTemplates().total).toBe(5);
    });

    it('throws for non-existent template', () => {
      expect(() => instance.deleteTemplate('nonexistent'))
        .toThrow('Template not found: nonexistent');
    });

    it('persists deletion to disk', () => {
      instance.deleteTemplate('weekly-report');
      expect(fs.writeFileSync).toHaveBeenCalled();
      const savedData = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedData.templates['weekly-report']).toBeUndefined();
    });
  });

  // =============================================
  // listCategories
  // =============================================
  describe('listCategories', () => {
    it('returns all categories', () => {
      const instance = new SkillTemplates({ templatesDir: TEST_DIR });
      const categories = instance.listCategories();
      expect(categories).toHaveLength(6);
      const ids = categories.map((c) => c.id);
      expect(ids).toContain('report');
      expect(ids).toContain('legal');
      expect(ids).toContain('finance');
      expect(ids).toContain('hr');
      expect(ids).toContain('product');
      expect(ids).toContain('other');
    });
  });

  // =============================================
  // createCategory
  // =============================================
  describe('createCategory', () => {
    let instance;

    beforeEach(() => {
      instance = new SkillTemplates({ templatesDir: TEST_DIR });
      jest.clearAllMocks();
    });

    it('creates a new category', () => {
      const result = instance.createCategory({ id: 'eng', name: 'Engineering' });
      expect(result.id).toBe('eng');
      expect(result.name).toBe('Engineering');
      expect(result.description).toBe('');
    });

    it('creates category with description', () => {
      const result = instance.createCategory({ id: 'eng', name: 'Engineering', description: 'Engineering templates' });
      expect(result.description).toBe('Engineering templates');
    });

    it('throws when id is missing', () => {
      expect(() => instance.createCategory({ name: 'No ID' }))
        .toThrow('id and name are required');
    });

    it('throws when name is missing', () => {
      expect(() => instance.createCategory({ id: 'no-name' }))
        .toThrow('id and name are required');
    });

    it('throws on duplicate id', () => {
      expect(() => instance.createCategory({ id: 'report', name: 'Duplicate' }))
        .toThrow('Category with id report already exists');
    });

    it('persists category to disk', () => {
      instance.createCategory({ id: 'eng', name: 'Engineering' });
      expect(fs.writeFileSync).toHaveBeenCalled();
      const savedData = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedData.categories.eng.name).toBe('Engineering');
    });
  });

  // =============================================
  // renderTemplate
  // =============================================
  describe('renderTemplate', () => {
    let instance;

    beforeEach(() => {
      instance = new SkillTemplates({ templatesDir: TEST_DIR });
      jest.clearAllMocks();
    });

    it('throws for non-existent template', () => {
      expect(() => instance.renderTemplate('nonexistent', {}))
        .toThrow('Template not found: nonexistent');
    });

    it('renders markdown template with data substitution', () => {
      const result = instance.renderTemplate('weekly-report', { week: '2024-W01', author: '张三' });
      expect(result.content).toContain('2024-W01');
      expect(result.content).toContain('张三');
    });

    it('throws on prototype pollution data', () => {
      const malicious = {};
      Object.defineProperty(malicious, '__proto__', { value: {}, enumerable: true, configurable: true });
      expect(() => instance.renderTemplate('weekly-report', malicious))
        .toThrow('potential prototype pollution attempt');
    });

    it('throws on constructor key in data', () => {
      expect(() => instance.renderTemplate('weekly-report', { constructor: {} }))
        .toThrow('potential prototype pollution attempt');
    });

    it('escapes HTML in HTML-type templates', () => {
      instance.createTemplate({
        id: 'html-tmpl',
        name: 'HTML',
        template: '<div>{{content}}</div>',
        type: 'html'
      });
      const result = instance.renderTemplate('html-tmpl', { content: '<script>alert(1)</script>' });
      expect(result.content).toContain('&lt;script&gt;');
      expect(result.content).not.toContain('<script>');
    });

    it('escapes all HTML special chars in HTML templates', () => {
      instance.createTemplate({
        id: 'html-escape',
        name: 'HTML Escape',
        template: '{{x}}{{y}}{{z}}',
        type: 'html'
      });
      const result = instance.renderTemplate('html-escape', {
        x: '<b>bold</b>',
        y: '"quoted"',
        z: '\'single\''
      });
      expect(result.content).toContain('&lt;b&gt;');
      expect(result.content).toContain('&quot;');
      expect(result.content).toContain('&#x27;');
    });

    it('does not escape HTML in markdown templates', () => {
      const result = instance.renderTemplate('weekly-report', {
        week: '<b>bold-week</b>',
        author: '<i>name</i>'
      });
      expect(result.content).toContain('<b>bold-week</b>');
      expect(result.content).toContain('<i>name</i>');
    });

    it('replaces default system variables', () => {
      const result = instance.renderTemplate('weekly-report', { week: 'W01', author: 'T' });
      expect(result.content).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(result.content).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it('returns template metadata and data in result', () => {
      const result = instance.renderTemplate('weekly-report', { week: 'W01', author: 'A' });
      expect(result.template).toBeTruthy();
      expect(result.template.id).toBe('weekly-report');
      expect(result.data).toEqual({ week: 'W01', author: 'A' });
      expect(result.generatedAt).toBeTruthy();
    });

    it('handles undefined values for specified keys', () => {
      const result = instance.renderTemplate('weekly-report', { week: 'W01', author: 'A' });
      expect(result.content).toContain('W01');
      expect(result.content).not.toContain('{{week}}');
    });
  });

  // =============================================
  // validateTemplateData
  // =============================================
  describe('validateTemplateData', () => {
    let instance;

    beforeEach(() => {
      instance = new SkillTemplates({ templatesDir: TEST_DIR });
      jest.clearAllMocks();
    });

    it('throws for non-existent template', () => {
      expect(() => instance.validateTemplateData('nonexistent', {}))
        .toThrow('Template not found: nonexistent');
    });

    it('returns valid for complete data', () => {
      const result = instance.validateTemplateData('weekly-report', {
        week: 'W01',
        author: '张三',
        completedTasks: 'Task A',
        nextWeekPlan: 'Plan A'
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns errors for missing required fields', () => {
      const result = instance.validateTemplateData('weekly-report', {});
      const fieldNames = result.errors.map((e) => e.field);
      expect(fieldNames).toContain('week');
      expect(fieldNames).toContain('author');
      expect(fieldNames).toContain('completedTasks');
      expect(fieldNames).toContain('nextWeekPlan');
      expect(result.valid).toBe(false);
    });

    it('returns warnings for missing optional fields', () => {
      const result = instance.validateTemplateData('weekly-report', {
        week: 'W01',
        author: 'A',
        completedTasks: 'C',
        nextWeekPlan: 'P'
      });
      const warnFields = result.warnings.map((w) => w.field);
      expect(warnFields).toContain('inProgressTasks');
      expect(warnFields).toContain('issues');
      expect(warnFields).toContain('suggestions');
    });

    it('treats empty string required field as error', () => {
      const result = instance.validateTemplateData('weekly-report', {
        week: '',
        author: 'A',
        completedTasks: 'C',
        nextWeekPlan: 'P'
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'week')).toBe(true);
    });
  });

  // =============================================
  // getStats
  // =============================================
  describe('getStats', () => {
    it('returns correct statistics', () => {
      const instance = new SkillTemplates({ templatesDir: TEST_DIR });
      const stats = instance.getStats();
      expect(stats.totalTemplates).toBe(6);
      expect(stats.totalCategories).toBe(6);
      expect(stats.templatesByCategory.report).toBe(2);
      expect(stats.templatesByCategory.legal).toBe(1);
      expect(stats.templatesByCategory.finance).toBe(1);
      expect(stats.templatesByCategory.hr).toBe(1);
      expect(stats.templatesByCategory.product).toBe(1);
    });
  });

  // =============================================
  // getSkillTemplates (singleton)
  // =============================================
  describe('getSkillTemplates', () => {
    it('returns an object with SkillTemplates methods', () => {
      const result = getSkillTemplates({ templatesDir: TEST_DIR });
      expect(result).toBeTruthy();
      expect(typeof result.listTemplates).toBe('function');
      expect(typeof result.getTemplate).toBe('function');
      expect(typeof result.createTemplate).toBe('function');
      expect(typeof result.renderTemplate).toBe('function');
    });

    it('returns the same instance on subsequent calls (singleton)', () => {
      // Use isolateModules to ensure clean module state for singleton test
      const first = getSkillTemplates({ templatesDir: TEST_DIR });
      const second = getSkillTemplates();
      expect(second).toBe(first);
    });

    it('logs deprecation warning', () => {
      warnSpy.mockClear();
      getSkillTemplates({ templatesDir: TEST_DIR });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('getSkillTemplates() 已弃用')
      );
    });
  });

  // =============================================
  // Module exports
  // =============================================
  describe('module exports', () => {
    it('exports DEPRECATED flag as true', () => {
      expect(DEPRECATED).toBe(true);
    });

    it('exports REPLACEMENT path', () => {
      expect(REPLACEMENT).toBe('src/skills/rendering/SkillRenderer');
    });
  });

  // =============================================
  // DeprecatedSkillTemplates class warning
  // =============================================
  describe('DeprecatedSkillTemplates class', () => {
    it('logs deprecation warning on construction', () => {
      warnSpy.mockClear();
      new SkillTemplates({ templatesDir: TEST_DIR });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('SkillTemplates 类已弃用')
      );
    });
  });

  // =============================================
  // Edge cases
  // =============================================
  describe('edge cases', () => {
    it('handles empty templates list after all deletions', () => {
      const instance = new SkillTemplates({ templatesDir: TEST_DIR });
      jest.clearAllMocks();
      const ids = instance.listTemplates().templates.map((t) => t.id);
      ids.forEach((id) => instance.deleteTemplate(id));
      expect(instance.listTemplates().total).toBe(0);
    });

    it('handles search with special regex chars', () => {
      const instance = new SkillTemplates({ templatesDir: TEST_DIR });
      const result = instance.listTemplates({ search: '[report]' });
      expect(result.total).toBe(0);
    });

    it('handles renderTemplate with missing optional data keys', () => {
      const instance = new SkillTemplates({ templatesDir: TEST_DIR });
      instance.createTemplate({
        id: 'simple',
        name: 'Simple',
        template: '{{a}}{{b}}'
      });
      const result = instance.renderTemplate('simple', { a: 'hello' });
      expect(result.content).toBe('hello{{b}}');
    });

    it('handles createTemplate with empty description', () => {
      const instance = new SkillTemplates({ templatesDir: TEST_DIR });
      const result = instance.createTemplate({
        id: 'empty-desc',
        name: 'Empty',
        template: 'x',
        description: ''
      });
      expect(result.description).toBe('');
    });
  });
});
