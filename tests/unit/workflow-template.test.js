const fs = require('fs');

jest.mock('fs');

const mockPathJoin = jest.fn((...args) => args.join('/'));
jest.mock('path', () => {
  const actual = jest.requireActual('path');
  return { ...actual, join: mockPathJoin };
});

jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => Buffer.from('aabbccdd', 'hex'))
}));

const { WorkflowTemplate } = require('../../src/skills/workflows/WorkflowTemplate');

const TEST_DATA_DIR = '/test/workflows';
const TEST_TEMPLATES_FILE = '/test/workflows/templates.json';

function makeTemplate(id, overrides = {}) {
  return {
    id,
    name: `Template ${id}`,
    description: `Description for ${id}`,
    category: 'general',
    icon: '\u26A1',
    difficulty: 'beginner',
    estimatedTime: '5\u5206\u949F',
    skills: [],
    nodes: [],
    connections: [],
    variables: [],
    author: 'test',
    downloads: 0,
    rating: 0,
    ratingCount: 0,
    tags: [],
    isPublic: true,
    status: 'active',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides
  };
}

function createWT(opts = {}) {
  const { dirExists = true, fileExists = false, preloadTemplates = null } = opts;

  fs.existsSync.mockImplementation((p) => {
    if (p === TEST_DATA_DIR) return dirExists;
    if (p === TEST_TEMPLATES_FILE) return fileExists;
    return false;
  });

  if (preloadTemplates) {
    fs.readFileSync.mockImplementation((p) => {
      if (p === TEST_TEMPLATES_FILE) {
        return JSON.stringify({ templates: preloadTemplates });
      }
      return '';
    });
  }

  return new WorkflowTemplate({ dataDir: TEST_DATA_DIR });
}

describe('WorkflowTemplate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockImplementation((p) => {
      if (p === TEST_DATA_DIR) return true;
      if (p === TEST_TEMPLATES_FILE) return false;
      return false;
    });
    mockPathJoin.mockImplementation((...args) => args.join('/'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('creates data directory when it does not exist', () => {
      fs.existsSync.mockImplementation((p) => {
        if (p === TEST_DATA_DIR) return false;
        if (p === TEST_TEMPLATES_FILE) return false;
        return false;
      });
      const wt = new WorkflowTemplate({ dataDir: TEST_DATA_DIR });
      expect(fs.mkdirSync).toHaveBeenCalledWith(TEST_DATA_DIR, { recursive: true });
      expect(wt.getTemplate('weekly-report-workflow')).toBeTruthy();
    });

    test('uses default dataDir when not provided', () => {
      fs.existsSync.mockReturnValue(false);
      const wt = new WorkflowTemplate();
      expect(wt.dataDir).toContain('workflows');
      expect(wt.templates.size).toBeGreaterThan(0);
    });

    test('loads existing templates from file', () => {
      const existing = { 'custom-1': makeTemplate('custom-1') };
      const wt = createWT({ fileExists: true, preloadTemplates: existing });
      expect(wt.getTemplate('custom-1')).toBeTruthy();
      expect(wt.getTemplate('weekly-report-workflow')).toBeNull();
    });

    test('skips default initialization when templates already exist', () => {
      const existing = { 'custom-1': makeTemplate('custom-1') };
      const wt = createWT({ fileExists: true, preloadTemplates: existing });
      expect(wt.listTemplates().total).toBe(1);
    });

    test('handles JSON parse errors gracefully', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      fs.existsSync.mockImplementation(() => true);
      fs.readFileSync.mockImplementation(() => 'not valid json');
      const wt = new WorkflowTemplate({ dataDir: TEST_DATA_DIR });
      expect(wt.listTemplates().total).toBe(4);
    });

    test('does not create data directory when it already exists', () => {
      createWT({ dirExists: true });
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    test('uses provided dataDir option', () => {
      const customDir = '/custom/path';
      fs.existsSync.mockImplementation((p) => {
        if (p === customDir) return true;
        return false;
      });
      mockPathJoin.mockImplementation((...args) => args.join('/'));
      new WorkflowTemplate({ dataDir: customDir });
      expect(mockPathJoin).toHaveBeenCalledWith(customDir, 'templates.json');
    });
  });

  describe('getTemplate', () => {
    test('returns template by id', () => {
      const wt = createWT();
      expect(wt.getTemplate('weekly-report-workflow').name).toBe('\u81EA\u52A8\u751F\u6210\u5468\u62A5');
    });

    test('returns null for nonexistent id', () => {
      const wt = createWT();
      expect(wt.getTemplate('nonexistent-id')).toBeNull();
    });
  });

  describe('createTemplate', () => {
    test('creates template with all provided fields', () => {
      const wt = createWT();
      const result = wt.createTemplate({
        name: 'My Workflow',
        description: 'Test description',
        category: 'data',
        icon: '\uD83D\uDCCA',
        difficulty: 'intermediate',
        estimatedTime: '10\u5206\u949F',
        skills: [{ skillId: 'csv-parser', action: 'parse' }],
        nodes: [{ id: 'n1', type: 'skill' }],
        connections: [{ from: 'n1', to: 'n2' }],
        variables: [{ name: 'var1', type: 'string' }],
        author: 'user1',
        tags: ['test'],
        isPublic: false
      });

      expect(result.name).toBe('My Workflow');
      expect(result.description).toBe('Test description');
      expect(result.category).toBe('data');
      expect(result.author).toBe('user1');
      expect(result.isPublic).toBe(false);
      expect(result.status).toBe('active');
      expect(result.downloads).toBe(0);
      expect(result.rating).toBe(0);
      expect(result.ratingCount).toBe(0);
      expect(result.id).toMatch(/^user1-my-workflow-/);
      expect(result.createdAt).toBeTruthy();
      expect(result.updatedAt).toBeTruthy();
    });

    test('applies defaults for missing optional fields', () => {
      const wt = createWT();
      const result = wt.createTemplate({ name: 'Minimal' });
      expect(result.description).toBe('');
      expect(result.category).toBe('general');
      expect(result.author).toBe('anonymous');
      expect(result.icon).toBe('\u26A1');
      expect(result.difficulty).toBe('beginner');
      expect(result.estimatedTime).toBe('5\u5206\u949F');
      expect(result.isPublic).toBe(true);
    });

    test('throws when name is missing', () => {
      const wt = createWT();
      expect(() => wt.createTemplate({})).toThrow('Template name is required');
      expect(() => wt.createTemplate({ name: '' })).toThrow('Template name is required');
    });

    test('generates unique ID for each template', () => {
      const wt = createWT();
      const a = wt.createTemplate({ name: 'A', author: 'u' });
      const b = wt.createTemplate({ name: 'B', author: 'u' });
      expect(a.id).not.toBe(b.id);
    });

    test('persists new template to file', () => {
      const wt = createWT();
      wt.createTemplate({ name: 'Persisted' });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        TEST_TEMPLATES_FILE,
        expect.stringContaining('"Persisted"')
      );
    });
  });

  describe('updateTemplate', () => {
    test('updates existing template fields', () => {
      const wt = createWT();
      const updated = wt.updateTemplate('weekly-report-workflow', {
        name: 'Updated Name',
        category: 'new-cat'
      });
      expect(updated.name).toBe('Updated Name');
      expect(updated.category).toBe('new-cat');
      expect(updated.id).toBe('weekly-report-workflow');
      expect(updated.updatedAt).toBeTruthy();
      expect(updated.updatedAt).not.toBe(updated.createdAt);
    });

    test('throws when template not found', () => {
      const wt = createWT();
      expect(() => wt.updateTemplate('nonexistent', { name: 'X' }))
        .toThrow('Template not found: nonexistent');
    });

    test('does not overwrite template id', () => {
      const wt = createWT();
      const updated = wt.updateTemplate('weekly-report-workflow', { id: 'new-id' });
      expect(updated.id).toBe('weekly-report-workflow');
    });

    test('persists after update', () => {
      const wt = createWT();
      wt.updateTemplate('weekly-report-workflow', { name: 'New' });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('deleteTemplate', () => {
    test('deletes existing template', () => {
      const wt = createWT();
      expect(wt.getTemplate('weekly-report-workflow')).toBeTruthy();
      const result = wt.deleteTemplate('weekly-report-workflow');
      expect(result).toEqual({ deleted: true });
      expect(wt.getTemplate('weekly-report-workflow')).toBeNull();
    });

    test('throws when template not found', () => {
      const wt = createWT();
      expect(() => wt.deleteTemplate('nonexistent')).toThrow('Template not found: nonexistent');
    });

    test('persists after delete', () => {
      const wt = createWT();
      wt.deleteTemplate('weekly-report-workflow');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('listTemplates', () => {
    test('returns all public templates with pagination info', () => {
      const wt = createWT();
      const result = wt.listTemplates();
      expect(Array.isArray(result.templates)).toBe(true);
      expect(result.total).toBe(4);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    test('respects limit parameter', () => {
      const wt = createWT();
      const result = wt.listTemplates({ limit: 2 });
      expect(result.templates.length).toBe(2);
      expect(result.limit).toBe(2);
    });

    test('respects offset parameter', () => {
      const wt = createWT();
      const page2 = wt.listTemplates({ limit: 2, offset: 2 });
      expect(page2.templates.length).toBe(2);
      expect(page2.offset).toBe(2);
    });

    test('sorts by score descending (rating*20 + downloads*0.1)', () => {
      const wt = createWT();
      const all = wt.listTemplates({ limit: 50 });
      const ids = all.templates.map(function (t) { return t.id; });
      expect(ids[0]).toBe('weekly-report-workflow');
      expect(ids[1]).toBe('document-conversion-workflow');
      expect(ids[2]).toBe('data-pipeline-workflow');
      expect(ids[3]).toBe('content-generation-workflow');
    });

    test('filters by category', () => {
      const wt = createWT();
      const result = wt.listTemplates({ category: 'data' });
      expect(result.templates.length).toBe(1);
      expect(result.templates[0].id).toBe('data-pipeline-workflow');
    });

    test('filters by category returns empty for non-matching', () => {
      const wt = createWT();
      const result = wt.listTemplates({ category: 'nonexistent' });
      expect(result.templates.length).toBe(0);
    });

    test('filters by difficulty', () => {
      const wt = createWT();
      const result = wt.listTemplates({ difficulty: 'intermediate' });
      expect(result.templates.length).toBe(2);
    });

    test('filters by author', () => {
      const wt = createWT();
      const result = wt.listTemplates({ author: 'system' });
      expect(result.total).toBe(4);
    });

    test('filters by search text matching name', () => {
      const wt = createWT();
      const result = wt.listTemplates({ search: '\u6570\u636E' });
      expect(result.templates.length).toBeGreaterThanOrEqual(1);
    });

    test('filters by search text matching tags', () => {
      const wt = createWT();
      const result = wt.listTemplates({ search: 'ETL' });
      expect(result.templates.length).toBe(1);
      expect(result.templates[0].id).toBe('data-pipeline-workflow');
    });

    test('filters by skills', () => {
      const wt = createWT();
      const result = wt.listTemplates({ skills: ['pdf-generator'] });
      expect(result.templates.length).toBe(2);
    });

    test('filters by multiple skills (OR logic)', () => {
      const wt = createWT();
      const result = wt.listTemplates({ skills: ['csv-parser', 'seo-optimizer'] });
      expect(result.templates.length).toBe(2);
    });

    test('excludes non-public templates', () => {
      const wt = createWT();
      wt.createTemplate({ name: 'Private', isPublic: false });
      const result = wt.listTemplates();
      expect(result.total).toBe(4);
    });

    test('search is case-insensitive', () => {
      const wt = createWT();
      const result = wt.listTemplates({ search: 'etl' });
      expect(result.templates.length).toBe(1);
    });
  });

  describe('recordDownload', () => {
    test('increments download count by 1', () => {
      const wt = createWT();
      const result = wt.recordDownload('weekly-report-workflow');
      expect(result.downloads).toBe(521);
    });

    test('throws when template not found', () => {
      const wt = createWT();
      expect(() => wt.recordDownload('nonexistent')).toThrow('Template not found: nonexistent');
    });

    test('handles zero downloads correctly', () => {
      const wt = createWT();
      const tpl = wt.createTemplate({ name: 'Fresh' });
      const result = wt.recordDownload(tpl.id);
      expect(result.downloads).toBe(1);
    });

    test('persists after download', () => {
      const wt = createWT();
      wt.recordDownload('weekly-report-workflow');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('addRating', () => {
    test('calculates correct weighted average for first rating', () => {
      const wt = createWT();
      const tpl = wt.createTemplate({ name: 'Rated' });
      const result = wt.addRating(tpl.id, 4);
      expect(result.rating).toBe(4);
      expect(result.ratingCount).toBe(1);
    });

    test('calculates correct weighted average for subsequent ratings', () => {
      const wt = createWT();
      const tpl = wt.createTemplate({ name: 'Rated' });
      wt.addRating(tpl.id, 4);
      const result = wt.addRating(tpl.id, 3);
      expect(result.rating).toBe(3.5);
      expect(result.ratingCount).toBe(2);
    });

    test('rounds rating to one decimal place', () => {
      const wt = createWT();
      const tpl = wt.createTemplate({ name: 'Rated' });
      wt.addRating(tpl.id, 5);
      wt.addRating(tpl.id, 4);
      const result = wt.addRating(tpl.id, 3);
      expect(result.rating).toBe(4);
    });

    test('throws when template not found', () => {
      const wt = createWT();
      expect(() => wt.addRating('nonexistent', 4))
        .toThrow('Template not found: nonexistent');
    });

    test('throws when rating is below 1', () => {
      const wt = createWT();
      const tpl = wt.createTemplate({ name: 'Rated' });
      expect(() => wt.addRating(tpl.id, 0))
        .toThrow('Rating must be between 1 and 5');
      expect(() => wt.addRating(tpl.id, -1))
        .toThrow('Rating must be between 1 and 5');
    });

    test('throws when rating is above 5', () => {
      const wt = createWT();
      const tpl = wt.createTemplate({ name: 'Rated' });
      expect(() => wt.addRating(tpl.id, 6))
        .toThrow('Rating must be between 1 and 5');
    });

    test('accepts boundary ratings of 1 and 5', () => {
      const wt = createWT();
      const tpl = wt.createTemplate({ name: 'Rated' });
      expect(() => wt.addRating(tpl.id, 1)).not.toThrow();
      expect(() => wt.addRating(tpl.id, 5)).not.toThrow();
    });

    test('persists after rating', () => {
      const wt = createWT();
      const tpl = wt.createTemplate({ name: 'Rated' });
      wt.addRating(tpl.id, 4);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('exportTemplate', () => {
    test('exports template with correct format metadata', () => {
      const wt = createWT();
      const result = wt.exportTemplate('weekly-report-workflow');
      expect(result.format).toBe('ultrawork-workflow');
      expect(result.version).toBe('1.0.0');
    });

    test('includes exportedAt timestamp', () => {
      const wt = createWT();
      const result = wt.exportTemplate('weekly-report-workflow');
      expect(result.template.exportedAt).toBeTruthy();
      expect(typeof result.template.exportedAt).toBe('string');
    });

    test('includes full template data', () => {
      const wt = createWT();
      const result = wt.exportTemplate('weekly-report-workflow');
      expect(result.template.name).toBe('\u81EA\u52A8\u751F\u6210\u5468\u62A5');
      expect(result.template.nodes.length).toBe(5);
    });

    test('throws when template not found', () => {
      const wt = createWT();
      expect(() => wt.exportTemplate('nonexistent'))
        .toThrow('Template not found: nonexistent');
    });
  });

  describe('importTemplate', () => {
    const validImportData = {
      format: 'ultrawork-workflow',
      version: '1.0.0',
      template: makeTemplate('imported-1', { name: 'Imported', author: 'original' })
    };

    test('imports valid template', () => {
      const wt = createWT();
      const result = wt.importTemplate(validImportData);
      expect(result.name).toBe('Imported');
      expect(wt.getTemplate('imported-1')).toBe(result);
    });

    test('overrides author with imported value', () => {
      const wt = createWT();
      const result = wt.importTemplate(validImportData, { author: 'my-user' });
      expect(result.author).toBe('my-user');
    });

    test('resets downloads, rating, and ratingCount on import', () => {
      const data = {
        format: 'ultrawork-workflow',
        version: '1.0.0',
        template: makeTemplate('imported-1', {
          downloads: 999,
          rating: 4.5,
          ratingCount: 100
        })
      };
      const wt = createWT();
      const result = wt.importTemplate(data);
      expect(result.downloads).toBe(0);
      expect(result.rating).toBe(0);
      expect(result.ratingCount).toBe(0);
    });

    test('throws when format is invalid', () => {
      const wt = createWT();
      const badData = { format: 'unknown', template: {} };
      expect(() => wt.importTemplate(badData))
        .toThrow('Invalid template format');
    });

    test('throws when template already exists and overwrite is false', () => {
      const wt = createWT();
      wt.importTemplate(validImportData);
      expect(() => wt.importTemplate(validImportData))
        .toThrow('Template already exists: imported-1');
    });

    test('overwrites existing template when overwrite is true', () => {
      const wt = createWT();
      wt.importTemplate(validImportData);
      const updated = {
        format: 'ultrawork-workflow',
        version: '1.0.0',
        template: makeTemplate('imported-1', { name: 'Overwritten' })
      };
      const result = wt.importTemplate(updated, { overwrite: true });
      expect(result.name).toBe('Overwritten');
    });

    test('persists after import', () => {
      const wt = createWT();
      wt.importTemplate(validImportData);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('getCategories', () => {
    test('returns unique categories with counts', () => {
      const wt = createWT();
      const cats = wt.getCategories();
      expect(cats.length).toBe(4);
      const dataCat = cats.find(function (c) { return c.id === 'data'; });
      expect(dataCat).toBeTruthy();
      expect(dataCat.count).toBe(1);
    });

    test('excludes non-public templates from category counts', () => {
      const wt = createWT();
      wt.createTemplate({ name: 'Secret', category: 'secret-cat', isPublic: false });
      const cats = wt.getCategories();
      expect(cats.find(function (c) { return c.id === 'secret-cat'; })).toBeUndefined();
    });

    test('returns empty array when no public templates', () => {
      const wt = createWT();
      wt.listTemplates().templates.forEach(function (t) {
        wt.updateTemplate(t.id, { isPublic: false });
      });
      expect(wt.getCategories()).toEqual([]);
    });
  });

  describe('getRecommendedTemplates', () => {
    test('returns top N templates sorted by score', () => {
      const wt = createWT();
      const recs = wt.getRecommendedTemplates(2);
      expect(recs.length).toBe(2);
      expect(recs[0].id).toBe('weekly-report-workflow');
      expect(recs[1].id).toBe('document-conversion-workflow');
    });

    test('respects custom limit', () => {
      const wt = createWT();
      expect(wt.getRecommendedTemplates(1).length).toBe(1);
      expect(wt.getRecommendedTemplates(10).length).toBe(4);
    });

    test('excludes non-public templates', () => {
      const wt = createWT();
      wt.updateTemplate('weekly-report-workflow', { isPublic: false });
      const recs = wt.getRecommendedTemplates(5);
      expect(recs.some(function (t) { return t.id === 'weekly-report-workflow'; })).toBe(false);
    });
  });

  describe('getStats', () => {
    test('returns total and public template counts', () => {
      const wt = createWT();
      const stats = wt.getStats();
      expect(stats.totalTemplates).toBe(4);
      expect(stats.publicTemplates).toBe(4);
    });

    test('calculates average rating correctly', () => {
      const wt = createWT();
      const stats = wt.getStats();
      expect(stats.averageRating).toBe(4.4);
    });

    test('sums total downloads', () => {
      const wt = createWT();
      const stats = wt.getStats();
      expect(stats.totalDownloads).toBe(520 + 380 + 290 + 450);
    });

    test('returns category count', () => {
      const wt = createWT();
      const stats = wt.getStats();
      expect(stats.categories).toBe(4);
    });

    test('handles zero public templates gracefully', () => {
      const wt = createWT();
      wt.listTemplates().templates.forEach(function (t) {
        wt.updateTemplate(t.id, { isPublic: false });
      });
      const stats = wt.getStats();
      expect(stats.publicTemplates).toBe(0);
      expect(stats.averageRating).toBe(0);
      expect(stats.totalDownloads).toBe(0);
    });
  });

  describe('generateVisualization', () => {
    test('generates nodes with calculated positions', () => {
      const wt = createWT();
      const viz = wt.generateVisualization('weekly-report-workflow');
      expect(viz.nodes.length).toBe(5);
      expect(viz.nodes[0].position).toEqual({ x: 0, y: 100 });
      expect(viz.nodes[1].position).toEqual({ x: 250, y: 100 });
      expect(viz.nodes[4].position).toEqual({ x: 1000, y: 100 });
    });

    test('generates edges from connections', () => {
      const wt = createWT();
      const viz = wt.generateVisualization('weekly-report-workflow');
      expect(viz.edges.length).toBe(4);
      expect(viz.edges[0]).toEqual({
        id: 'start-collect',
        source: 'start',
        target: 'collect',
        type: 'smoothstep'
      });
    });

    test('includes viewport defaults', () => {
      const wt = createWT();
      const viz = wt.generateVisualization('weekly-report-workflow');
      expect(viz.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    });

    test('throws when template not found', () => {
      const wt = createWT();
      expect(() => wt.generateVisualization('nonexistent'))
        .toThrow('Template not found: nonexistent');
    });
  });

  describe('_generateTemplateId', () => {
    test('generates id from name and author', () => {
      const wt = createWT();
      const id = wt._generateTemplateId('Test Workflow', 'dev');
      expect(id).toBe('dev-test-workflow-aabbccdd');
    });

    test('strips special characters', () => {
      const wt = createWT();
      const id = wt._generateTemplateId('Hello World! @#$', 'user');
      expect(id).toBe('user-hello-world------aabbccdd');
    });
  });

  describe('missing-field fallbacks', () => {
    test('getCategories defaults missing category to general', () => {
      const wt = createWT({ fileExists: true, preloadTemplates: {
        'no-cat': { id: 'no-cat', name: 'No Cat', isPublic: true }
      } });
      const cats = wt.getCategories();
      expect(cats.some((c) => c.id === 'general')).toBe(true);
    });

    test('listTemplates sorts templates without rating/downloads', () => {
      const wt = createWT({ fileExists: true, preloadTemplates: {
        'bare1': { id: 'bare1', name: 'Bare One', isPublic: true },
        'bare2': { id: 'bare2', name: 'Bare Two', isPublic: true }
      } });
      const result = wt.listTemplates();
      expect(result.templates.some((t) => t.id === 'bare1')).toBe(true);
      expect(result.total).toBe(2);
    });

    test('loads templates file without templates key and initializes defaults', () => {
      fs.readFileSync.mockImplementation((p) => {
        if (p === TEST_TEMPLATES_FILE) {
          return JSON.stringify({ otherKey: 'x' });
        }
        return '';
      });
      const wt = createWT({ fileExists: true });
      expect(wt.templates.size).toBeGreaterThan(0);
    });

    test('getCategories aggregates duplicate categories', () => {
      const wt = createWT({ fileExists: true, preloadTemplates: {
        'a': { id: 'a', name: 'A', category: 'data', isPublic: true },
        'b': { id: 'b', name: 'B', category: 'data', isPublic: true }
      } });
      const cats = wt.getCategories();
      const dataCat = cats.find((c) => c.id === 'data');
      expect(dataCat.count).toBe(2);
    });

    test('getRecommendedTemplates handles templates without rating/downloads', () => {
      const wt = createWT({ fileExists: true, preloadTemplates: {
        'bare': { id: 'bare', name: 'Bare', isPublic: true }
      } });
      const recs = wt.getRecommendedTemplates(5);
      expect(recs.some((t) => t.id === 'bare')).toBe(true);
    });

    test('getRecommendedTemplates uses default limit of 5', () => {
      const wt = createWT({ fileExists: true, preloadTemplates: {
        'a': { id: 'a', name: 'A', isPublic: true },
        'b': { id: 'b', name: 'B', isPublic: true },
        'c': { id: 'c', name: 'C', isPublic: true },
        'd': { id: 'd', name: 'D', isPublic: true },
        'e': { id: 'e', name: 'E', isPublic: true },
        'f': { id: 'f', name: 'F', isPublic: true }
      } });
      const recs = wt.getRecommendedTemplates();
      expect(recs.length).toBe(5);
    });

    test('getStats handles templates without downloads/rating', () => {
      const wt = createWT({ fileExists: true, preloadTemplates: {
        'bare': { id: 'bare', name: 'Bare', isPublic: true }
      } });
      const stats = wt.getStats();
      expect(stats.totalTemplates).toBe(1);
      expect(stats.totalDownloads).toBe(0);
      expect(stats.averageRating).toBe(0);
    });
  });

  describe('_saveData error handling', () => {
    test('warns when save fails', () => {
      fs.writeFileSync.mockImplementation(() => { throw new Error('disk full'); });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const wt = createWT();
      wt.createTemplate({ name: 'Test Save', author: 'me' });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to save workflow templates'), expect.any(String));
      warnSpy.mockRestore();
    });
  });
});
