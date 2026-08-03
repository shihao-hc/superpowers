const mockRouter = {
  get: jest.fn().mockReturnThis(),
  post: jest.fn().mockReturnThis(),
  put: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  use: jest.fn().mockReturnThis()
};

jest.mock('express', () => ({
  Router: jest.fn(() => mockRouter)
}));

const mockUploadSingle = jest.fn((req, res, next) => next());

const mockMulterInstance = {
  single: jest.fn(() => mockUploadSingle),
  memoryStorage: jest.fn()
};

jest.mock('multer', () => {
  const m = jest.fn(() => mockMulterInstance);
  m.memoryStorage = jest.fn();
  return m;
}, { virtual: true });

const mockLimiterMiddleware = jest.fn((req, res, next) => next());

const mockRateLimiters = {
  general: { middleware: jest.fn(() => mockLimiterMiddleware), getStats: jest.fn(() => ({ requests: 0 })) },
  upload: { middleware: jest.fn(() => mockLimiterMiddleware), getStats: jest.fn(() => ({ requests: 0 })) },
  export: { middleware: jest.fn(() => mockLimiterMiddleware), getStats: jest.fn(() => ({ requests: 0 })) },
  login: { middleware: jest.fn(() => mockLimiterMiddleware), getStats: jest.fn(() => ({ requests: 0 })) }
};

jest.mock('../../src/middleware/rateLimiter', () => ({
  createRateLimiters: jest.fn(() => mockRateLimiters)
}));

const mockRequireRole = jest.fn(() => jest.fn((req, res, next) => next()));

const mockAuth = {
  authenticate: jest.fn((req, res, next) => next()),
  requireRole: mockRequireRole,
  loginHandler: jest.fn((req, res) => res.json({ ok: true })),
  verifyHandler: jest.fn((req, res) => res.json({ ok: true }))
};

jest.mock('../../src/middleware/auth', () => ({
  createAuthMiddleware: jest.fn(() => mockAuth)
}));

const mockPreview = {
  createPreview: jest.fn(),
  getPreview: jest.fn(),
  deletePreview: jest.fn(),
  getStats: jest.fn(),
  getSupportedFormats: jest.fn()
};

jest.mock('../../src/skills/preview/SkillPreview', () => ({
  getSkillPreview: jest.fn(() => mockPreview)
}));

const mockTemplates = {
  listTemplates: jest.fn(),
  listCategories: jest.fn(),
  getTemplate: jest.fn(),
  createTemplate: jest.fn(),
  updateTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
  renderTemplate: jest.fn(),
  validateTemplateData: jest.fn(),
  getStats: jest.fn()
};

jest.mock('../../src/skills/templates/SkillTemplates', () => ({
  getSkillTemplates: jest.fn(() => mockTemplates)
}));

const mockStorage = {
  upload: jest.fn(),
  getSignedURL: jest.fn(),
  delete: jest.fn(),
  list: jest.fn()
};

const mockExporter = {
  export: jest.fn(),
  getSupportedFormats: jest.fn(),
  getStorageStats: jest.fn(),
  storage: mockStorage
};

jest.mock('../../src/skills/export/StorageAdapter', () => ({
  MultiFormatExporter: jest.fn(() => mockExporter)
}));

const { EnhancedSkillsApi } = require('../../src/skills/enhancedApi');

function getHandler(method, path) {
  const calls = mockRouter[method].mock.calls;
  for (const call of calls) {
    if (call[0] === path) {
      return call[call.length - 1];
    }
  }
  return null;
}

function makeRes() {
  return {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    sendFile: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis()
  };
}

async function callRoute(method, path, opts = {}) {
  const handler = getHandler(method, path);
  const req = {
    params: opts.params || {},
    query: opts.query || {},
    body: opts.body || {},
    headers: opts.headers || {},
    file: opts.file,
    user: opts.user
  };
  const res = makeRes();
  await handler(req, res);
  return { req, res };
}

describe('EnhancedSkillsApi', () => {
  let api;

  beforeEach(() => {
    jest.clearAllMocks();
    api = new EnhancedSkillsApi({});
  });

  describe('constructor and getRouter', () => {
    it('sets up express Router', () => {
      expect(mockRouter.get).toHaveBeenCalled();
      expect(mockRouter.post).toHaveBeenCalled();
      expect(mockRouter.put).toHaveBeenCalled();
      expect(mockRouter.delete).toHaveBeenCalled();
    });

    it('applies general rate limiter and auth middleware', () => {
      expect(mockRouter.use).toHaveBeenCalledWith(mockLimiterMiddleware);
      expect(mockRouter.use).toHaveBeenCalledWith(mockAuth.authenticate);
    });

    it('getRouter returns the router', () => {
      expect(api.getRouter()).toBe(mockRouter);
    });
  });

  describe('POST /preview/create', () => {
    it('creates preview from file upload', async () => {
      mockPreview.createPreview.mockReturnValue({ id: 'abc', path: '/tmp/p.html' });
      const { res } = await callRoute('post', '/preview/create', {
        body: { title: 'Test' },
        file: { buffer: Buffer.from('data'), originalname: 'test.html', size: 100 }
      });
      expect(mockPreview.createPreview).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ ok: true, preview: { id: 'abc', path: '/tmp/p.html' } });
    });

    it('creates preview from content+filename', async () => {
      mockPreview.createPreview.mockReturnValue({ id: 'def', path: '/tmp/q.html' });
      const { res } = await callRoute('post', '/preview/create', {
        body: { content: '# Hello', filename: 'hello.md' }
      });
      expect(mockPreview.createPreview).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ ok: true, preview: { id: 'def', path: '/tmp/q.html' } });
    });

    it('returns 400 when neither file nor content+filename provided', async () => {
      const { res } = await callRoute('post', '/preview/create', { body: {} });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Either file or content+filename is required' });
    });

    it('returns 500 on error', async () => {
      mockPreview.createPreview.mockImplementation(() => { throw new Error('fail'); });
      const { res } = await callRoute('post', '/preview/create', {
        body: { content: 'x', filename: 'x.md' }
      });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  describe('GET /preview/:previewId', () => {
    it('returns HTML preview with correct headers', async () => {
      mockPreview.getPreview.mockReturnValue({ path: '/tmp/test.html' });
      const { res } = await callRoute('get', '/preview/:previewId', { params: { previewId: 'abc123' } });
      expect(mockPreview.getPreview).toHaveBeenCalledWith('abc123');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
      expect(res.sendFile).toHaveBeenCalledWith('/tmp/test.html');
    });

    it('returns image preview for PNG', async () => {
      mockPreview.getPreview.mockReturnValue({ path: '/tmp/img.png' });
      const { res } = await callRoute('get', '/preview/:previewId', { params: { previewId: 'abc' } });
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
      expect(res.sendFile).toHaveBeenCalledWith('/tmp/img.png');
    });

    it('returns PDF preview', async () => {
      mockPreview.getPreview.mockReturnValue({ path: '/tmp/doc.pdf' });
      const { res } = await callRoute('get', '/preview/:previewId', { params: { previewId: 'abc' } });
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.sendFile).toHaveBeenCalledWith('/tmp/doc.pdf');
    });

    it('returns text preview for unknown extensions', async () => {
      mockPreview.getPreview.mockReturnValue({ path: '/tmp/notes.txt' });
      const { res } = await callRoute('get', '/preview/:previewId', { params: { previewId: 'abc' } });
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain; charset=utf-8');
      expect(res.sendFile).toHaveBeenCalledWith('/tmp/notes.txt');
    });

    it('returns 400 for invalid preview ID', async () => {
      const { res } = await callRoute('get', '/preview/:previewId', { params: { previewId: '' } });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid preview ID format' });
    });

    it('returns 404 when preview not found', async () => {
      mockPreview.getPreview.mockReturnValue(null);
      const { res } = await callRoute('get', '/preview/:previewId', { params: { previewId: 'abc' } });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Preview not found' });
    });

    it('returns 500 on error', async () => {
      mockPreview.getPreview.mockImplementation(() => { throw new Error('err'); });
      const { res } = await callRoute('get', '/preview/:previewId', { params: { previewId: 'abc' } });
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /preview/:previewId/iframe', () => {
    it('returns HTML iframe', async () => {
      mockPreview.getPreview.mockReturnValue({ path: '/tmp/frame.html' });
      const { res } = await callRoute('get', '/preview/:previewId/iframe', { params: { previewId: 'abc' } });
      expect(mockPreview.getPreview).toHaveBeenCalledWith('abc');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
      expect(res.sendFile).toHaveBeenCalledWith('/tmp/frame.html');
    });

    it('returns 404 when preview not found', async () => {
      mockPreview.getPreview.mockReturnValue(null);
      const { res } = await callRoute('get', '/preview/:previewId/iframe', { params: { previewId: 'abc' } });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 500 on error', async () => {
      mockPreview.getPreview.mockImplementation(() => { throw new Error('err'); });
      const { res } = await callRoute('get', '/preview/:previewId/iframe', { params: { previewId: 'abc' } });
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /preview/:previewId/raw', () => {
    it('sends raw file', async () => {
      mockPreview.getPreview.mockReturnValue({ path: '/tmp/raw.pdf' });
      const { res } = await callRoute('get', '/preview/:previewId/raw', { params: { previewId: 'abc' } });
      expect(mockPreview.getPreview).toHaveBeenCalledWith('abc');
      expect(res.sendFile).toHaveBeenCalledWith('/tmp/raw.pdf');
    });

    it('returns 404 when preview not found', async () => {
      mockPreview.getPreview.mockReturnValue(null);
      const { res } = await callRoute('get', '/preview/:previewId/raw', { params: { previewId: 'abc' } });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 500 on error', async () => {
      mockPreview.getPreview.mockImplementation(() => { throw new Error('err'); });
      const { res } = await callRoute('get', '/preview/:previewId/raw', { params: { previewId: 'abc' } });
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('DELETE /preview/:previewId', () => {
    it('deletes a preview', async () => {
      mockPreview.deletePreview.mockReturnValue({ deleted: true });
      const { res } = await callRoute('delete', '/preview/:previewId', { params: { previewId: 'abc' } });
      expect(mockPreview.deletePreview).toHaveBeenCalledWith('abc');
      expect(res.json).toHaveBeenCalledWith({ ok: true, deleted: true });
    });

    it('returns 500 on error', async () => {
      mockPreview.deletePreview.mockImplementation(() => { throw new Error('err'); });
      const { res } = await callRoute('delete', '/preview/:previewId', { params: { previewId: 'abc' } });
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /preview/stats', () => {
    it('returns preview stats', async () => {
      mockPreview.getStats.mockReturnValue({ total: 5 });
      mockPreview.getSupportedFormats.mockReturnValue(['html', 'png']);
      const { res } = await callRoute('get', '/preview/stats');
      expect(res.json).toHaveBeenCalledWith({ stats: { total: 5 }, formats: ['html', 'png'] });
    });

    it('returns 500 on error', async () => {
      mockPreview.getStats.mockImplementation(() => { throw new Error('err'); });
      const { res } = await callRoute('get', '/preview/stats');
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /templates', () => {
    it('lists templates with query filters', async () => {
      mockTemplates.listTemplates.mockReturnValue({ items: [], total: 0 });
      const { res } = await callRoute('get', '/templates', {
        query: { category: 'doc', search: 'test', tags: 'a,b', limit: '10', offset: '0' }
      });
      expect(mockTemplates.listTemplates).toHaveBeenCalledWith({
        category: 'doc', search: 'test', tags: ['a', 'b'], limit: 10, offset: 0
      });
      expect(res.json).toHaveBeenCalledWith({ items: [], total: 0 });
    });

    it('returns 500 on error', async () => {
      mockTemplates.listTemplates.mockImplementation(() => { throw new Error('err'); });
      const { res } = await callRoute('get', '/templates');
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /templates/categories', () => {
    it('lists template categories', async () => {
      mockTemplates.listCategories.mockReturnValue(['doc', 'code']);
      const { res } = await callRoute('get', '/templates/categories');
      expect(res.json).toHaveBeenCalledWith({ categories: ['doc', 'code'] });
    });

    it('returns 500 on error', async () => {
      mockTemplates.listCategories.mockImplementation(() => { throw new Error('err'); });
      const { res } = await callRoute('get', '/templates/categories');
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /templates/:templateId', () => {
    it('returns a template by ID', async () => {
      mockTemplates.getTemplate.mockReturnValue({ id: 't1', name: 'Test' });
      const { res } = await callRoute('get', '/templates/:templateId', { params: { templateId: 't1' } });
      expect(mockTemplates.getTemplate).toHaveBeenCalledWith('t1');
      expect(res.json).toHaveBeenCalledWith({ template: { id: 't1', name: 'Test' } });
    });

    it('returns 400 for invalid template ID', async () => {
      const { res } = await callRoute('get', '/templates/:templateId', { params: { templateId: '' } });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid template ID format' });
    });

    it('returns 404 when template not found', async () => {
      mockTemplates.getTemplate.mockReturnValue(null);
      const { res } = await callRoute('get', '/templates/:templateId', { params: { templateId: 'nonexist' } });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 500 on error', async () => {
      mockTemplates.getTemplate.mockImplementation(() => { throw new Error('err'); });
      const { res } = await callRoute('get', '/templates/:templateId', { params: { templateId: 't1' } });
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /templates', () => {
    it('creates a template with admin role', async () => {
      mockTemplates.createTemplate.mockReturnValue({ id: 'new-tpl' });
      const { res } = await callRoute('post', '/templates', {
        body: { id: 'new-tpl', name: 'My Template', template: 'Hello {{name}}', description: 'A template', category: 'doc', type: 'markdown', tags: ['tag1'], fields: [] },
        user: { role: 'admin' }
      });
      expect(mockTemplates.createTemplate).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ ok: true, template: { id: 'new-tpl' } });
    });

    it('returns 403 for non-admin/developer role', async () => {
      const { res } = await callRoute('post', '/templates', {
        body: { id: 't', name: 'T', template: 'x' },
        user: { role: 'user' }
      });
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 400 when required fields missing', async () => {
      const { res } = await callRoute('post', '/templates', {
        body: { id: 't', name: 'T' },
        user: { role: 'admin' }
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'id, name, and template are required' });
    });

    it('returns 400 for invalid template ID format', async () => {
      const { res } = await callRoute('post', '/templates', {
        body: { id: 'bad id!', name: 'T', template: 'x' },
        user: { role: 'admin' }
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid template ID format' });
    });

    it('returns 500 on error', async () => {
      mockTemplates.createTemplate.mockImplementation(() => { throw new Error('err'); });
      const { res } = await callRoute('post', '/templates', {
        body: { id: 't', name: 'T', template: 'x' },
        user: { role: 'admin' }
      });
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('PUT /templates/:templateId', () => {
    it('updates a template with admin role', async () => {
      mockTemplates.updateTemplate.mockReturnValue({ id: 't1', name: 'Updated' });
      const { res } = await callRoute('put', '/templates/:templateId', {
        params: { templateId: 't1' },
        body: { name: 'Updated' },
        headers: { 'x-role': 'admin' }
      });
      expect(mockTemplates.updateTemplate).toHaveBeenCalledWith('t1', { name: 'Updated' });
      expect(res.json).toHaveBeenCalledWith({ ok: true, template: { id: 't1', name: 'Updated' } });
    });

    it('returns 403 for user role', async () => {
      const { res } = await callRoute('put', '/templates/:templateId', {
        params: { templateId: 't1' },
        headers: { 'x-role': 'user' }
      });
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 500 on error', async () => {
      mockTemplates.updateTemplate.mockImplementation(() => { throw new Error('err'); });
      const { res } = await callRoute('put', '/templates/:templateId', {
        params: { templateId: 't1' },
        headers: { 'x-role': 'admin' }
      });
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('DELETE /templates/:templateId', () => {
    it('deletes a template with admin role', async () => {
      mockTemplates.deleteTemplate.mockReturnValue({ deleted: true });
      const { res } = await callRoute('delete', '/templates/:templateId', {
        params: { templateId: 't1' },
        headers: { 'x-role': 'admin' }
      });
      expect(mockTemplates.deleteTemplate).toHaveBeenCalledWith('t1');
      expect(res.json).toHaveBeenCalledWith({ ok: true, deleted: true });
    });

    it('returns 403 for non-admin role', async () => {
      const { res } = await callRoute('delete', '/templates/:templateId', {
        params: { templateId: 't1' },
        headers: { 'x-role': 'developer' }
      });
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 500 on error', async () => {
      mockTemplates.deleteTemplate.mockImplementation(() => { throw new Error('err'); });
      const { res } = await callRoute('delete', '/templates/:templateId', {
        params: { templateId: 't1' },
        headers: { 'x-role': 'admin' }
      });
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /templates/:templateId/render', () => {
    it('renders a template with valid data', async () => {
      mockTemplates.validateTemplateData.mockReturnValue({ valid: true });
      mockTemplates.renderTemplate.mockReturnValue({ content: 'Hello World' });
      const { res } = await callRoute('post', '/templates/:templateId/render', {
        params: { templateId: 't1' },
        body: { data: { name: 'World' } }
      });
      expect(mockTemplates.validateTemplateData).toHaveBeenCalled();
      expect(mockTemplates.renderTemplate).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ ok: true, content: 'Hello World' });
    });

    it('returns 400 for invalid template ID', async () => {
      const { res } = await callRoute('post', '/templates/:templateId/render', {
        params: { templateId: '' },
        body: { data: { name: 'World' } }
      });
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when data is missing', async () => {
      const { res } = await callRoute('post', '/templates/:templateId/render', {
        params: { templateId: 't1' },
        body: {}
      });
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when validation fails', async () => {
      mockTemplates.validateTemplateData.mockReturnValue({ valid: false, errors: ['name required'], warnings: [] });
      const { res } = await callRoute('post', '/templates/:templateId/render', {
        params: { templateId: 't1' },
        body: { data: {} }
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Validation failed', errors: ['name required'], warnings: [] });
    });

    it('returns 500 on error', async () => {
      mockTemplates.validateTemplateData.mockImplementation(() => { throw new Error('err'); });
      const { res } = await callRoute('post', '/templates/:templateId/render', {
        params: { templateId: 't1' },
        body: { data: { name: 'World' } }
      });
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /templates/:templateId/validate', () => {
    it('validates template data', async () => {
      mockTemplates.validateTemplateData.mockReturnValue({ valid: true });
      const { res } = await callRoute('post', '/templates/:templateId/validate', {
        params: { templateId: 't1' },
        body: { data: { name: 'World' } }
      });
      expect(mockTemplates.validateTemplateData).toHaveBeenCalledWith('t1', { name: 'World' });
      expect(res.json).toHaveBeenCalledWith({ ok: true, valid: true });
    });

    it('returns 500 on error', async () => {
      mockTemplates.validateTemplateData.mockImplementation(() => { throw new Error('err'); });
      const { res } = await callRoute('post', '/templates/:templateId/validate', {
        params: { templateId: 't1' },
        body: { data: {} }
      });
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /templates/stats', () => {
    it('returns template stats', async () => {
      mockTemplates.getStats.mockReturnValue({ total: 10, categories: 3 });
      const { res } = await callRoute('get', '/templates/stats');
      expect(res.json).toHaveBeenCalledWith({ total: 10, categories: 3 });
    });

    it('returns 500 on error', async () => {
      mockTemplates.getStats.mockImplementation(() => { throw new Error('err'); });
      const { res } = await callRoute('get', '/templates/stats');
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /export', () => {
    it('exports data with valid options', async () => {
      mockExporter.export.mockResolvedValue({ url: 'https://example.com/export' });
      const { res } = await callRoute('post', '/export', {
        body: { data: { key: 'value' }, format: 'json', filename: 'export.json', metadata: { author: 'test' } }
      });
      expect(mockExporter.export).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ ok: true, url: 'https://example.com/export' });
    });

    it('returns 400 when data is missing', async () => {
      const { res } = await callRoute('post', '/export', { body: { format: 'json' } });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Data is required' });
    });

    it('returns 400 for invalid format', async () => {
      const { res } = await callRoute('post', '/export', {
        body: { data: { x: 1 }, format: 'exe' }
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid export format' });
    });

    it('returns 400 for invalid filename', async () => {
      const { res } = await callRoute('post', '/export', {
        body: { data: { x: 1 }, filename: '../../etc/passwd' }
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid filename' });
    });

    it('returns 500 on error', async () => {
      mockExporter.export.mockRejectedValue(new Error('err'));
      const { res } = await callRoute('post', '/export', {
        body: { data: { x: 1 } }
      });
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('POST /export/file', () => {
    it('uploads a file and returns URL', async () => {
      mockStorage.upload.mockResolvedValue({ key: 'exports/test.txt' });
      mockStorage.getSignedURL.mockResolvedValue({ url: 'https://bucket.com/file', expiresAt: '2027-01-01' });
      const { res } = await callRoute('post', '/export/file', {
        file: { buffer: Buffer.from('data'), originalname: 'test.txt', mimetype: 'text/plain' },
        body: { metadata: '{}' }
      });
      expect(mockStorage.upload).toHaveBeenCalled();
      expect(mockStorage.getSignedURL).toHaveBeenCalledWith('exports/test.txt', { expiresIn: 365 * 24 * 60 * 60 });
      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        key: 'exports/test.txt',
        permanentUrl: 'https://bucket.com/file',
        expiresAt: '2027-01-01'
      });
    });

    it('returns 400 when file is missing', async () => {
      const { res } = await callRoute('post', '/export/file', { body: {} });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'File is required' });
    });

    it('returns 500 on error', async () => {
      mockStorage.upload.mockRejectedValue(new Error('upload fail'));
      const { res } = await callRoute('post', '/export/file', {
        file: { buffer: Buffer.from('data'), originalname: 't.txt', mimetype: 'text/plain' },
        body: { metadata: '{}' }
      });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Export failed' });
    });
  });

  describe('GET /export/formats', () => {
    it('returns supported export formats', async () => {
      mockExporter.getSupportedFormats.mockReturnValue(['json', 'csv']);
      const { res } = await callRoute('get', '/export/formats');
      expect(res.json).toHaveBeenCalledWith({ formats: ['json', 'csv'] });
    });

    it('returns 500 on error', async () => {
      mockExporter.getSupportedFormats.mockImplementation(() => { throw new Error('err'); });
      const { res } = await callRoute('get', '/export/formats');
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /export/stats', () => {
    it('returns export storage stats', async () => {
      mockExporter.getStorageStats.mockResolvedValue({ files: 10, size: 1024 });
      const { res } = await callRoute('get', '/export/stats');
      expect(res.json).toHaveBeenCalledWith({ files: 10, size: 1024 });
    });

    it('returns 500 on error', async () => {
      mockExporter.getStorageStats.mockRejectedValue(new Error('err'));
      const { res } = await callRoute('get', '/export/stats');
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /export/:key/url', () => {
    it('returns signed URL for a key', async () => {
      mockStorage.getSignedURL.mockResolvedValue({ url: 'https://bucket.com/file', expiresAt: '2027-01-01' });
      const { res } = await callRoute('get', '/export/:key/url', {
        params: { key: 'exports/test.txt' },
        query: { expiresIn: '7200' }
      });
      expect(mockStorage.getSignedURL).toHaveBeenCalledWith('exports/test.txt', { expiresIn: 7200 });
      expect(res.json).toHaveBeenCalledWith({ ok: true, url: 'https://bucket.com/file', expiresAt: '2027-01-01' });
    });

    it('returns 500 on error', async () => {
      mockStorage.getSignedURL.mockRejectedValue(new Error('err'));
      const { res } = await callRoute('get', '/export/:key/url', { params: { key: 'exports/test.txt' } });
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('DELETE /export/:key', () => {
    it('deletes an export file', async () => {
      mockStorage.delete.mockResolvedValue({ deleted: true });
      const { res } = await callRoute('delete', '/export/:key', { params: { key: 'exports/test.txt' } });
      expect(mockStorage.delete).toHaveBeenCalledWith('exports/test.txt');
      expect(res.json).toHaveBeenCalledWith({ ok: true, deleted: true });
    });

    it('returns 500 on error', async () => {
      mockStorage.delete.mockRejectedValue(new Error('err'));
      const { res } = await callRoute('delete', '/export/:key', { params: { key: 'exports/test.txt' } });
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /export/list', () => {
    it('lists export files', async () => {
      mockStorage.list.mockResolvedValue({ files: [{ key: 'exports/test.txt' }] });
      const { res } = await callRoute('get', '/export/list', { query: { prefix: 'exports/', limit: '50' } });
      expect(mockStorage.list).toHaveBeenCalledWith('exports/', { limit: 50 });
      expect(res.json).toHaveBeenCalledWith({ files: [{ key: 'exports/test.txt' }] });
    });

    it('uses default prefix exports/ when not provided', async () => {
      mockStorage.list.mockResolvedValue({ files: [] });
      await callRoute('get', '/export/list', { query: {} });
      expect(mockStorage.list).toHaveBeenCalledWith('exports/', { limit: 100 });
    });

    it('returns 500 on error', async () => {
      mockStorage.list.mockRejectedValue(new Error('err'));
      const { res } = await callRoute('get', '/export/list');
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('auth routes', () => {
    it('POST /auth/login handler is loginHandler', () => {
      const handler = getHandler('post', '/auth/login');
      expect(handler).toBe(mockAuth.loginHandler);
    });

    it('GET /auth/verify handler is verifyHandler', () => {
      const handler = getHandler('get', '/auth/verify');
      expect(handler).toBe(mockAuth.verifyHandler);
    });

    it('GET /auth/me returns req.user', async () => {
      const { res } = await callRoute('get', '/auth/me', { user: { id: 1, role: 'admin' } });
      expect(res.json).toHaveBeenCalledWith({ user: { id: 1, role: 'admin' } });
    });
  });

  describe('GET /system/rate-limit-stats', () => {
    it('has rate limiter stats handler', async () => {
      const handler = getHandler('get', '/system/rate-limit-stats');
      expect(handler).toBeDefined();
    });
  });

  describe('argument validation edge cases', () => {
    it('rejects preview IDs longer than 64 chars', async () => {
      const { res } = await callRoute('get', '/preview/:previewId', {
        params: { previewId: 'a'.repeat(65) }
      });
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects preview IDs with special characters', async () => {
      const { res } = await callRoute('get', '/preview/:previewId', {
        params: { previewId: 'abc-123' }
      });
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects template IDs with special characters', async () => {
      const { res } = await callRoute('get', '/templates/:templateId', {
        params: { templateId: 'bad!id' }
      });
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
