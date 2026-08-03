jest.mock('express', () => {
  const mockRouter = {
    get: jest.fn().mockReturnThis(),
    post: jest.fn().mockReturnThis(),
    put: jest.fn().mockReturnThis(),
    use: jest.fn().mockReturnThis()
  };
  return { Router: jest.fn(() => mockRouter) };
});

jest.mock('../../src/utils/SafePath', () => ({
  sanitizeFilename: jest.fn((n) => n)
}));

jest.mock('../../src/skills/SkillToNode', () => ({
  SkillToNode: jest.fn(() => ({}))
}));

jest.mock('../../src/skills/SkillValidator');

jest.mock('../../src/skills/SkillVersionManager');

jest.mock('../../src/skills/SkillMetrics', () => ({
  getSkillMetrics: jest.fn(() => ({ track: jest.fn(), getStats: jest.fn(() => ({})), recordExecution: jest.fn() }))
}));

jest.mock('../../src/skills/metrics', () => ({
  createSkillMetricsHandler: jest.fn(() => jest.fn())
}));

jest.mock('../../src/middleware/auth', () => ({
  createAuthMiddleware: jest.fn(() => ({ authenticate: jest.fn((_r, _rr, next) => next()) }))
}));

jest.mock('../../src/skills/marketplace/SkillMarketplace');

const { SkillsApi } = require('../../src/skills/api');

describe('SkillsApi', () => {
  let _skillsApi;
  let mockSkillManager;
  let mockRouter;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter = require('express').Router();
    mockSkillManager = {
      getAllSkills: jest.fn(() => [{ name: 'skill1' }, { name: 'skill2' }]),
      getSkill: jest.fn(),
      enableSkill: jest.fn(),
      disableSkill: jest.fn(),
      skillLoader: { getSkill: jest.fn() },
      getCustom: jest.fn(() => []),
      getMetricsSummary: jest.fn(() => ({})),
      getCategories: jest.fn(() => ['cat1']),
      getPopularSkills: jest.fn(() => []),
      getFeaturedSkills: jest.fn(() => []),
      getSkillExecutionCount: jest.fn(() => 0)
    };
    _skillsApi = new SkillsApi(mockSkillManager);
  });

  describe('constructor', () => {
    it('creates router and instances', () => {
      expect(mockRouter.use).toHaveBeenCalled();
      expect(mockRouter.get).toHaveBeenCalled();
      expect(mockRouter.post).toHaveBeenCalled();
      expect(mockRouter.put).toHaveBeenCalled();
    });
  });

  describe('routes', () => {
    function getHandler(method, pathPattern) {
      const calls = mockRouter[method].mock.calls;
      return calls.find(([p]) => p === pathPattern)?.[1];
    }

    function callHandler(handler, overrides = {}) {
      const req = { body: {}, params: {}, query: {}, headers: {}, ...overrides.req };
      const res = {
        json: jest.fn(),
        status: jest.fn(() => res),
        send: jest.fn(),
        sendStatus: jest.fn()
      };
      handler(req, res);
      return { req, res };
    }

    it('GET / lists skills', async () => {
      const handler = getHandler('get', '/');
      expect(handler).toBeDefined();
      const { res } = await callHandler(handler);
      expect(res.json).toHaveBeenCalledWith({ skills: [{ name: 'skill1' }, { name: 'skill2' }] });
    });

    it('GET / handles error', async () => {
      mockSkillManager.getAllSkills.mockImplementation(() => { throw new Error('fail'); });
      const handler = getHandler('get', '/');
      const { res } = await callHandler(handler);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('POST /:skillName/toggle enables skill', async () => {
      const handler = getHandler('post', '/:skillName/toggle');
      expect(handler).toBeDefined();
      const { res } = await callHandler(handler, { req: { params: { skillName: 'test' }, body: { enable: true } } });
      expect(mockSkillManager.enableSkill).toHaveBeenCalledWith('test');
      expect(res.json).toHaveBeenCalledWith({ ok: true, skill: 'test', enabled: true });
    });

    it('POST /:skillName/toggle disables skill', async () => {
      const handler = getHandler('post', '/:skillName/toggle');
      const { res } = await callHandler(handler, { req: { params: { skillName: 'test' }, body: { enable: false } } });
      expect(mockSkillManager.disableSkill).toHaveBeenCalledWith('test');
      expect(res.json).toHaveBeenCalledWith({ ok: true, skill: 'test', enabled: false });
    });

    it('POST /:skillName/toggle returns 400 for missing enable', async () => {
      const handler = getHandler('post', '/:skillName/toggle');
      const { res } = await callHandler(handler, { req: { params: { skillName: 'test' }, body: {} } });
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('GET /metrics returns metrics', async () => {
      const handler = getHandler('get', '/metrics');
      const { res } = await callHandler(handler);
      expect(res.json).toHaveBeenCalled();
    });

    it('POST /cache/clear clears cache', async () => {
      const handler = getHandler('post', '/cache/clear');
      const { res } = await callHandler(handler);
      expect(res.json).toHaveBeenCalled();
    });

    it('GET /custom returns custom skills', async () => {
      mockSkillManager.getCustom.mockReturnValue([{ name: 'custom1' }]);
      const handler = getHandler('get', '/custom');
      const { res } = await callHandler(handler);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ skills: expect.any(Array) }));
    });

    it('POST /validate triggers validation', () => {
      const handler = getHandler('post', '/validate');
      expect(handler).toBeDefined();
    });

    it('POST /upload handles upload', () => {
      const handler = getHandler('post', '/upload');
      expect(handler).toBeDefined();
    });

    it('GET /marketplace returns marketplace data', async () => {
      const handler = getHandler('get', '/marketplace');
      const { res } = await callHandler(handler);
      expect(res.json).toHaveBeenCalled();
    });

    it('GET /marketplace/featured returns featured', async () => {
      mockSkillManager.getFeaturedSkills.mockReturnValue([{ name: 'f1' }]);
      const handler = getHandler('get', '/marketplace/featured');
      const { res } = await callHandler(handler);
      expect(res.json).toHaveBeenCalled();
    });

    it('GET /marketplace/popular returns popular', async () => {
      mockSkillManager.getPopularSkills.mockReturnValue([{ name: 'p1' }]);
      const handler = getHandler('get', '/marketplace/popular');
      const { res } = await callHandler(handler);
      expect(res.json).toHaveBeenCalled();
    });

    it('GET /marketplace/categories returns categories', async () => {
      const handler = getHandler('get', '/marketplace/categories');
      const { res } = await callHandler(handler);
      expect(res.json).toHaveBeenCalled();
    });

    it('GET /marketplace/stats returns stats', async () => {
      const handler = getHandler('get', '/marketplace/stats');
      const { res } = await callHandler(handler);
      expect(res.json).toHaveBeenCalled();
    });

    it('GET /versions/:skillName/current returns current version', async () => {
      const handler = getHandler('get', '/versions/:skillName/current');
      expect(handler).toBeDefined();
      const { res } = await callHandler(handler, { req: { params: { skillName: 'test' } } });
      expect(res.json).toHaveBeenCalled();
    });

    it('GET /versions/:skillName/history returns history', async () => {
      const handler = getHandler('get', '/versions/:skillName/history');
      const { res } = await callHandler(handler, { req: { params: { skillName: 'test' } } });
      expect(res.json).toHaveBeenCalled();
    });
  });
});
