const path = require('path');
const { EventEmitter } = require('events');
const fs = require('fs');

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
  SkillToNode: {
    getPythonEnvMetrics: jest.fn(() => ({})),
    getPythonEnvCacheStats: jest.fn(() => ({})),
    clearPythonEnvCache: jest.fn()
  }
}));

jest.mock('../../src/skills/SkillValidator');

jest.mock('../../src/skills/SkillVersionManager');

jest.mock('../../src/skills/SkillMetrics', () => ({
  getSkillMetrics: jest.fn(() => ({
    recordExecution: jest.fn(),
    recordView: jest.fn(),
    recordDownload: jest.fn(),
    track: jest.fn(),
    getStats: jest.fn(() => ({}))
  }))
}));

jest.mock('../../src/skills/metrics', () => ({
  createSkillMetricsHandler: jest.fn(() => jest.fn())
}));

const mockAuthenticate = jest.fn((_r, _rr, next) => next());

jest.mock('../../src/middleware/auth', () => ({
  createAuthMiddleware: jest.fn(() => ({ authenticate: mockAuthenticate }))
}));

jest.mock('../../src/skills/marketplace/SkillMarketplace');

jest.mock('../../src/utils/SafeExec', () => ({
  safeSpawn: jest.fn()
}));

jest.mock('unzipper', () => ({
  Open: {
    buffer: jest.fn(() => Promise.resolve({ extract: jest.fn(() => Promise.resolve()) }))
  }
}), { virtual: true });

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    readdirSync: jest.fn(),
    statSync: jest.fn()
  };
});

const { SkillsApi, SkillAutoRouter } = require('../../src/skills/api');

function executorPath(skillName) {
  return path.join(process.cwd(), 'src', 'skills', 'executors', `${skillName}Executor.js`);
}

function makeGitChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

describe('SkillsApi', () => {
  let _skillsApi;
  let mockSkillManager;
  let mockRouter;

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReset();
    fs.mkdirSync.mockReset();
    fs.writeFileSync.mockReset();
    fs.readdirSync.mockReset();
    fs.statSync.mockReset();
    mockRouter = require('express').Router();
    mockSkillManager = {
      getAllSkills: jest.fn(() => [{ name: 'skill1' }, { name: 'skill2' }]),
      getSkill: jest.fn(),
      getSkillInfo: jest.fn(() => ({ name: 'skill1' })),
      enableSkill: jest.fn(),
      disableSkill: jest.fn(),
      skillLoader: { getSkill: jest.fn(), loadSkill: jest.fn() },
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

    it('wires skillLoader from skillManager', () => {
      expect(_skillsApi.skillLoader).toBe(mockSkillManager.skillLoader);
    });

    it('falls back to null when skillManager has no skillLoader', () => {
      const bare = new SkillsApi({ getAllSkills: jest.fn(() => []) });
      expect(bare.skillLoader).toBeNull();
    });
  });

  describe('auth middleware', () => {
    function getAuthMiddleware() {
      return mockRouter.use.mock.calls[0][0];
    }

    it('lets public GET paths through', () => {
      const authMw = getAuthMiddleware();
      const next = jest.fn();
      authMw({ method: 'GET', path: '/' }, {}, next);
      expect(next).toHaveBeenCalled();
      expect(_skillsApi.router.use).toBeDefined();
    });

    it('lets /type/ prefixed GET paths through', () => {
      const authMw = getAuthMiddleware();
      const next = jest.fn();
      authMw({ method: 'GET', path: '/type/coding' }, {}, next);
      expect(next).toHaveBeenCalled();
    });

    it('lets /marketplace GET path through', () => {
      const authMw = getAuthMiddleware();
      const next = jest.fn();
      authMw({ method: 'GET', path: '/marketplace' }, {}, next);
      expect(next).toHaveBeenCalled();
    });

    it('requires auth for non-public GET', () => {
      const authMw = getAuthMiddleware();
      const next = jest.fn();
      authMw({ method: 'GET', path: '/secret' }, {}, next);
      expect(mockAuthenticate).toHaveBeenCalled();
    });

    it('requires auth for mutation methods', () => {
      const authMw = getAuthMiddleware();
      const next = jest.fn();
      authMw({ method: 'POST', path: '/' }, {}, next);
      expect(mockAuthenticate).toHaveBeenCalled();
    });
  });

  describe('routes', () => {
    function getHandler(method, pathPattern) {
      const calls = mockRouter[method].mock.calls;
      return calls.find(([p]) => p === pathPattern)?.[1];
    }

    async function callHandler(handler, overrides = {}) {
      const req = { body: {}, params: {}, query: {}, headers: {}, ...overrides.req };
      const res = {
        json: jest.fn(),
        status: jest.fn(() => res),
        send: jest.fn(),
        sendStatus: jest.fn()
      };
      await handler(req, res);
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

    it('POST /:skillName/toggle handles enable error', async () => {
      mockSkillManager.enableSkill.mockImplementation(() => { throw new Error('enable failed'); });
      const handler = getHandler('post', '/:skillName/toggle');
      const { res } = await callHandler(handler, { req: { params: { skillName: 'test' }, body: { enable: true } } });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(_skillsApi.metrics.recordExecution).not.toHaveBeenCalled();
    });

    describe('POST /:skillName/test', () => {
      it('blocks high-risk skill for non-admin role', async () => {
        mockSkillManager.skillLoader.getSkill.mockReturnValue({ name: 'risky', riskLevel: 'high' });
        const handler = getHandler('post', '/:skillName/test');
        const { res } = await callHandler(handler, { req: { params: { skillName: 'risky' }, headers: { 'x-role': 'user' } } });
        expect(res.status).toHaveBeenCalledWith(403);
        expect(_skillsApi.metrics.recordExecution).toHaveBeenCalledWith('risky', expect.objectContaining({ success: false }));
      });

      it('allows admin through high-risk gate', async () => {
        mockSkillManager.skillLoader.getSkill.mockReturnValue({ name: 'risky', riskLevel: 'high' });
        fs.existsSync.mockReturnValue(false);
        const handler = getHandler('post', '/:skillName/test');
        const { res } = await callHandler(handler, { req: { params: { skillName: 'risky' }, headers: { 'x-role': 'admin' }, body: { inputs: {} } } });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
      });

      it('falls back when no executor exists', async () => {
        mockSkillManager.skillLoader.getSkill.mockReturnValue({ name: 'x', riskLevel: 'low' });
        fs.existsSync.mockReturnValue(false);
        const handler = getHandler('post', '/:skillName/test');
        const { res } = await callHandler(handler, { req: { params: { skillName: 'x' }, headers: {} } });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, message: expect.any(String) }));
        expect(_skillsApi.metrics.recordExecution).toHaveBeenCalledWith('x', expect.objectContaining({ type: 'fallback' }));
      });

      it('uses custom executor execute', async () => {
        const exe = jest.fn(async () => ({ done: true }));
        jest.doMock(executorPath('mockexec'), () => ({ execute: exe }), { virtual: true });
        fs.existsSync.mockReturnValue(true);
        const handler = getHandler('post', '/:skillName/test');
        const { res } = await callHandler(handler, { req: { params: { skillName: 'mockexec' }, headers: {} } });
        expect(exe).toHaveBeenCalledWith(expect.objectContaining({ action: 'test' }));
        expect(res.json).toHaveBeenCalledWith({ ok: true, result: { done: true } });
        expect(_skillsApi.metrics.recordExecution).toHaveBeenCalledWith('mockexec', expect.objectContaining({ type: 'custom' }));
      });

      it('uses DocxExecutor execute', async () => {
        const exe = jest.fn(async () => ({ ok: 1 }));
        jest.doMock(executorPath('mockdocx'), () => ({ DocxExecutor: { execute: exe } }), { virtual: true });
        fs.existsSync.mockReturnValue(true);
        const handler = getHandler('post', '/:skillName/test');
        const { res } = await callHandler(handler, { req: { params: { skillName: 'mockdocx' }, headers: {} } });
        expect(exe).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ ok: true, result: { ok: 1 } });
        expect(_skillsApi.metrics.recordExecution).toHaveBeenCalledWith('mockdocx', expect.objectContaining({ type: 'docx' }));
      });

      it('uses PdfExecutor execute', async () => {
        const exe = jest.fn(async () => ({ ok: 1 }));
        jest.doMock(executorPath('mockpdf'), () => ({ PdfExecutor: { execute: exe } }), { virtual: true });
        fs.existsSync.mockReturnValue(true);
        const handler = getHandler('post', '/:skillName/test');
        const { res } = await callHandler(handler, { req: { params: { skillName: 'mockpdf' }, headers: {} } });
        expect(exe).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ ok: true, result: { ok: 1 } });
        expect(_skillsApi.metrics.recordExecution).toHaveBeenCalledWith('mockpdf', expect.objectContaining({ type: 'pdf' }));
      });

      it('uses CanvasExecutor execute', async () => {
        const exe = jest.fn(async () => ({ ok: 1 }));
        jest.doMock(executorPath('mockcanvas'), () => ({ CanvasExecutor: { execute: exe } }), { virtual: true });
        fs.existsSync.mockReturnValue(true);
        const handler = getHandler('post', '/:skillName/test');
        const { res } = await callHandler(handler, { req: { params: { skillName: 'mockcanvas' }, headers: {} } });
        expect(exe).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ ok: true, result: { ok: 1 } });
        expect(_skillsApi.metrics.recordExecution).toHaveBeenCalledWith('mockcanvas', expect.objectContaining({ type: 'canvas' }));
      });

      it('falls back when executor has no matching function', async () => {
        jest.doMock(executorPath('mocknone'), () => ({}), { virtual: true });
        fs.existsSync.mockReturnValue(true);
        const handler = getHandler('post', '/:skillName/test');
        const { res } = await callHandler(handler, { req: { params: { skillName: 'mocknone' }, headers: {} } });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, message: expect.any(String) }));
      });

      it('handles executor error', async () => {
        mockSkillManager.skillLoader.getSkill.mockReturnValue(null);
        fs.existsSync.mockReturnValue(false);
        mockSkillManager.getSkillInfo.mockImplementation(() => { throw new Error('boom'); });
        const handler = getHandler('post', '/:skillName/test');
        const { res } = await callHandler(handler, { req: { params: { skillName: 'x' }, headers: {} } });
        expect(res.status).toHaveBeenCalledWith(500);
        expect(_skillsApi.metrics.recordExecution).toHaveBeenCalledWith('x', expect.objectContaining({ success: false }));
      });
    });

    describe('GET /:skillName/nodes', () => {
      it('returns 404 when skill not found', async () => {
        mockSkillManager.skillLoader.getSkill.mockReturnValue(null);
        const handler = getHandler('get', '/:skillName/nodes');
        const { res } = await callHandler(handler, { req: { params: { skillName: 'x' } } });
        expect(res.status).toHaveBeenCalledWith(404);
      });

      it('returns nodes with action from inputs', async () => {
        mockSkillManager.skillLoader.getSkill.mockReturnValue({
          name: 's1', inputs: [{ name: 'action', enum: ['run'] }], outputs: [{ name: 'o' }]
        });
        const handler = getHandler('get', '/:skillName/nodes');
        const { res } = await callHandler(handler, { req: { params: { skillName: 's1' } } });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ skill: 's1' }));
      });

      it('defaults action to execute when no action input', async () => {
        mockSkillManager.skillLoader.getSkill.mockReturnValue({ name: 's2', inputs: [], outputs: [] });
        const handler = getHandler('get', '/:skillName/nodes');
        const { res } = await callHandler(handler, { req: { params: { skillName: 's2' } } });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ skill: 's2' }));
      });
    });

    describe('GET /:skillName/dependencies', () => {
      it('returns 404 when skill not found', async () => {
        mockSkillManager.skillLoader.getSkill.mockReturnValue(null);
        const handler = getHandler('get', '/:skillName/dependencies');
        const { res } = await callHandler(handler, { req: { params: { skillName: 'x' } } });
        expect(res.status).toHaveBeenCalledWith(404);
      });

      it('returns skill dependency info', async () => {
        mockSkillManager.skillLoader.getSkill.mockReturnValue({ name: 's', version: '1.0.0', riskLevel: 'high', dependencies: ['a'] });
        const handler = getHandler('get', '/:skillName/dependencies');
        const { res } = await callHandler(handler, { req: { params: { skillName: 's' } } });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: 's', riskLevel: 'high' }));
      });
    });

    it('GET /metrics returns metrics', async () => {
      const handler = getHandler('get', '/metrics');
      const { res } = await callHandler(handler);
      expect(res.json).toHaveBeenCalled();
    });

    it('GET /metrics handles error', async () => {
      require('../../src/skills/SkillToNode').SkillToNode.getPythonEnvMetrics.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/metrics');
      const { res } = await callHandler(handler);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('POST /cache/clear clears cache', async () => {
      const handler = getHandler('post', '/cache/clear');
      const { res } = await callHandler(handler);
      expect(require('../../src/skills/SkillToNode').SkillToNode.clearPythonEnvCache).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
    });

    it('POST /cache/clear handles error', async () => {
      require('../../src/skills/SkillToNode').SkillToNode.clearPythonEnvCache.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('post', '/cache/clear');
      const { res } = await callHandler(handler);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('GET /prometheus returns metrics handler', () => {
      const handler = getHandler('get', '/prometheus');
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    describe('POST /upload', () => {
      it('blocks non-authorized roles', async () => {
        const handler = getHandler('post', '/upload');
        const { res } = await callHandler(handler, { req: { headers: { 'x-role': 'user' } } });
        expect(res.status).toHaveBeenCalledWith(403);
      });

      it('returns 400 when name or payload missing', async () => {
        const handler = getHandler('post', '/upload');
        const { res } = await callHandler(handler, { req: { headers: { 'x-role': 'admin' }, body: {} } });
        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('uploads with validation passing', async () => {
        _skillsApi.validator.validateZipPackage.mockResolvedValue({ valid: true });
        _skillsApi.validator.generateReport.mockReturnValue({ report: 1 });
        fs.existsSync.mockReturnValue(false);
        const handler = getHandler('post', '/upload');
        const { res } = await callHandler(handler, {
          req: { headers: { 'x-role': 'admin' }, body: { name: 'zip1', payloadBase64: Buffer.from('abc').toString('base64'), validate: true, autoLoad: false } }
        });
        expect(fs.writeFileSync).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, name: 'zip1', validation: { report: 1 }, skill: null }));
      });

      it('returns 400 when validation fails', async () => {
        _skillsApi.validator.validateZipPackage.mockResolvedValue({ valid: false });
        _skillsApi.validator.generateReport.mockReturnValue({ report: 0 });
        const handler = getHandler('post', '/upload');
        const { res } = await callHandler(handler, {
          req: { headers: { 'x-role': 'admin' }, body: { name: 'bad', payloadBase64: Buffer.from('abc').toString('base64'), validate: true } }
        });
        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('uploads without validation and auto-loads skill', async () => {
        fs.existsSync.mockReturnValue(false);
        mockSkillManager.skillLoader.loadSkill.mockReturnValue({ name: 'z', version: '1.0.0', description: 'd' });
        const handler = getHandler('post', '/upload');
        const { res } = await callHandler(handler, {
          req: { headers: { 'x-role': 'admin' }, body: { name: 'z', payloadBase64: Buffer.from('abc').toString('base64'), validate: false, autoLoad: true } }
        });
        expect(mockSkillManager.skillLoader.loadSkill).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ skill: expect.objectContaining({ loaded: true }) }));
      });

      it('catches auto-load failure', async () => {
        fs.existsSync.mockReturnValue(false);
        mockSkillManager.skillLoader.loadSkill.mockImplementation(() => { throw new Error('load fail'); });
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const handler = getHandler('post', '/upload');
        const { res } = await callHandler(handler, {
          req: { headers: { 'x-role': 'admin' }, body: { name: 'z', payloadBase64: Buffer.from('abc').toString('base64'), validate: false, autoLoad: true } }
        });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, skill: null }));
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
      });

      it('handles upload error', async () => {
        fs.existsSync.mockReturnValue(false);
        fs.writeFileSync.mockImplementation(() => { throw new Error('disk full'); });
        const handler = getHandler('post', '/upload');
        const { res } = await callHandler(handler, {
          req: { headers: { 'x-role': 'admin' }, body: { name: 'z', payloadBase64: Buffer.from('abc').toString('base64'), validate: false } }
        });
        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('POST /import/git', () => {
      it('blocks non-authorized roles', async () => {
        const handler = getHandler('post', '/import/git');
        const { res } = await callHandler(handler, { req: { headers: { 'x-role': 'user' } } });
        expect(res.status).toHaveBeenCalledWith(403);
      });

      it('returns 400 when repo missing', async () => {
        const handler = getHandler('post', '/import/git');
        const { res } = await callHandler(handler, { req: { headers: { 'x-role': 'admin' }, body: {} } });
        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('returns 400 when validation fails', async () => {
        _skillsApi.validator.validateGitRepository.mockResolvedValue({ valid: false });
        _skillsApi.validator.generateReport.mockReturnValue({ report: 0 });
        const handler = getHandler('post', '/import/git');
        const { res } = await callHandler(handler, {
          req: { headers: { 'x-role': 'admin' }, body: { repo: 'https://github.com/a/b.git', validate: true } }
        });
        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('returns 400 for invalid sanitized name', async () => {
        const handler = getHandler('post', '/import/git');
        const { res } = await callHandler(handler, {
          req: { headers: { 'x-role': 'admin' }, body: { repo: 'https://github.com///.git', validate: false } }
        });
        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('successfully clones repo', async () => {
        const child = makeGitChild();
        require('../../src/utils/SafeExec').safeSpawn.mockReturnValue(child);
        fs.mkdirSync.mockImplementation(() => {});
        const handler = getHandler('post', '/import/git');
        const { res } = await callHandler(handler, {
          req: { headers: { 'x-role': 'admin' }, body: { repo: 'https://github.com/a/b.git', validate: false, autoLoad: false } }
        });
        child.stdout.emit('data', 'out');
        child.stderr.emit('data', 'err');
        child.emit('close', 0);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, name: 'b' }));
      });

      it('auto-loads after successful clone', async () => {
        const child = makeGitChild();
        require('../../src/utils/SafeExec').safeSpawn.mockReturnValue(child);
        mockSkillManager.skillLoader.loadSkill.mockReturnValue({ name: 'b', version: '1.0.0', description: 'd' });
        const handler = getHandler('post', '/import/git');
        const { res } = await callHandler(handler, {
          req: { headers: { 'x-role': 'admin' }, body: { repo: 'https://github.com/a/b.git', validate: false, autoLoad: true } }
        });
        child.emit('close', 0);
        expect(mockSkillManager.skillLoader.loadSkill).toHaveBeenCalledWith('b');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ skill: expect.objectContaining({ loaded: true }) }));
      });

      it('catches auto-load failure after clone', async () => {
        const child = makeGitChild();
        require('../../src/utils/SafeExec').safeSpawn.mockReturnValue(child);
        mockSkillManager.skillLoader.loadSkill.mockImplementation(() => { throw new Error('load fail'); });
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const handler = getHandler('post', '/import/git');
        const { res } = await callHandler(handler, {
          req: { headers: { 'x-role': 'admin' }, body: { repo: 'https://github.com/a/b.git', validate: false, autoLoad: true } }
        });
        child.emit('close', 0);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, skill: null }));
        warn.mockRestore();
      });

      it('handles clone failure code', async () => {
        const child = makeGitChild();
        require('../../src/utils/SafeExec').safeSpawn.mockReturnValue(child);
        const handler = getHandler('post', '/import/git');
        const { res } = await callHandler(handler, {
          req: { headers: { 'x-role': 'admin' }, body: { repo: 'https://github.com/a/b.git', validate: false } }
        });
        child.emit('close', 1);
        expect(res.status).toHaveBeenCalledWith(500);
      });

      it('handles spawn error event', async () => {
        const child = makeGitChild();
        require('../../src/utils/SafeExec').safeSpawn.mockReturnValue(child);
        const handler = getHandler('post', '/import/git');
        const { res } = await callHandler(handler, {
          req: { headers: { 'x-role': 'admin' }, body: { repo: 'https://github.com/a/b.git', validate: false } }
        });
        child.emit('error', new Error('git missing'));
        expect(res.status).toHaveBeenCalledWith(500);
      });

      it('handles outer error', async () => {
        require('../../src/utils/SafeExec').safeSpawn.mockImplementation(() => { throw new Error('spawn fail'); });
        const handler = getHandler('post', '/import/git');
        const { res } = await callHandler(handler, {
          req: { headers: { 'x-role': 'admin' }, body: { repo: 'https://github.com/a/b.git', validate: false } }
        });
        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('POST /validate', () => {
      it('returns 400 when name or payload missing', async () => {
        const handler = getHandler('post', '/validate');
        const { res } = await callHandler(handler);
        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('returns validation report', async () => {
        _skillsApi.validator.validateZipPackage.mockResolvedValue({ valid: true });
        _skillsApi.validator.generateReport.mockReturnValue({ report: 1 });
        const handler = getHandler('post', '/validate');
        const { res } = await callHandler(handler, { req: { body: { name: 'x', payloadBase64: Buffer.from('a').toString('base64') } } });
        expect(res.json).toHaveBeenCalledWith({ ok: true, report: { report: 1 } });
      });

      it('handles validation error', async () => {
        _skillsApi.validator.validateZipPackage.mockRejectedValue(new Error('zip bad'));
        const handler = getHandler('post', '/validate');
        const { res } = await callHandler(handler, { req: { body: { name: 'x', payloadBase64: Buffer.from('a').toString('base64') } } });
        expect(res.status).toHaveBeenCalledWith(500);
      });
    });

    describe('GET /custom', () => {
      it('returns empty list when uploads dir missing', async () => {
        fs.existsSync.mockReturnValue(false);
        const handler = getHandler('get', '/custom');
        const { res } = await callHandler(handler);
        expect(res.json).toHaveBeenCalledWith({ skills: [] });
      });

      it('lists zip files and skill directories', async () => {
        fs.existsSync.mockImplementation((p) => !String(p).includes('plain'));
        fs.readdirSync.mockReturnValue(['a.zip', 'dir1', 'plain']);
        fs.statSync.mockImplementation((p) => {
          if (p.endsWith('a.zip')) return { isFile: () => true, isDirectory: () => false, size: 10, mtime: new Date() };
          return { isFile: () => false, isDirectory: () => true, size: 0, mtime: new Date() };
        });
        const handler = getHandler('get', '/custom');
        const { res } = await callHandler(handler);
        const payload = res.json.mock.calls[0][0];
        expect(payload.skills).toHaveLength(2);
      });

      it('handles readdir error', async () => {
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockImplementation(() => { throw new Error('perm'); });
        const handler = getHandler('get', '/custom');
        const { res } = await callHandler(handler);
        expect(res.status).toHaveBeenCalledWith(500);
      });
    });
  });

  describe('marketplace routes', () => {
    function getHandler(method, pathPattern) {
      const calls = mockRouter[method].mock.calls;
      return calls.find(([p]) => p === pathPattern)?.[1];
    }

    async function callHandler(handler, overrides = {}) {
      const req = { body: {}, params: {}, query: {}, headers: {}, ...overrides.req };
      const res = {
        json: jest.fn(),
        status: jest.fn(() => res),
        send: jest.fn(),
        sendStatus: jest.fn()
      };
      await handler(req, res);
      return { req, res };
    }

    it('GET /marketplace lists skills', async () => {
      _skillsApi.marketplace.listSkills.mockReturnValue({ skills: [], total: 0 });
      const handler = getHandler('get', '/marketplace');
      const { res } = await callHandler(handler);
      expect(res.json).toHaveBeenCalledWith({ skills: [], total: 0 });
    });

    it('GET /marketplace handles error', async () => {
      _skillsApi.marketplace.listSkills.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/marketplace');
      const { res } = await callHandler(handler);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('GET /marketplace/:skillId returns skill details', async () => {
      _skillsApi.marketplace.getSkill.mockReturnValue({ name: 's' });
      _skillsApi.marketplace.getStats.mockReturnValue({ downloads: 1 });
      _skillsApi.marketplace.getReviews.mockReturnValue([]);
      const handler = getHandler('get', '/marketplace/:skillId');
      const { res } = await callHandler(handler, { req: { params: { skillId: 's' }, headers: { 'x-visitor-id': 'v1' } } });
      expect(_skillsApi.marketplace.recordView).toHaveBeenCalledWith('s');
      expect(_skillsApi.metrics.recordView).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ skill: { name: 's' } }));
    });

    it('GET /marketplace/:skillId returns 404 when missing', async () => {
      _skillsApi.marketplace.getSkill.mockReturnValue(null);
      const handler = getHandler('get', '/marketplace/:skillId');
      const { res } = await callHandler(handler, { req: { params: { skillId: 'nope' } } });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('GET /marketplace/:skillId handles error', async () => {
      _skillsApi.marketplace.getSkill.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/marketplace/:skillId');
      const { res } = await callHandler(handler, { req: { params: { skillId: 's' } } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('POST /marketplace/publish blocks unauthorized roles', async () => {
      const handler = getHandler('post', '/marketplace/publish');
      const { res } = await callHandler(handler, { req: { headers: { 'x-role': 'user' } } });
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('POST /marketplace/publish publishes with default author', async () => {
      _skillsApi.marketplace.publishSkill.mockResolvedValue({ id: '1' });
      const handler = getHandler('post', '/marketplace/publish');
      const { res } = await callHandler(handler, { req: { headers: { 'x-role': 'admin' }, body: { name: 's' } } });
      expect(res.json).toHaveBeenCalledWith({ ok: true, skill: { id: '1' } });
    });

    it('POST /marketplace/publish keeps provided author', async () => {
      _skillsApi.marketplace.publishSkill.mockResolvedValue({ id: '1' });
      const handler = getHandler('post', '/marketplace/publish');
      const { res } = await callHandler(handler, {
        req: { headers: { 'x-role': 'admin', 'x-username': 'bob' }, body: { name: 's', author: 'alice' } }
      });
      expect(res.json).toHaveBeenCalledWith({ ok: true, skill: { id: '1' } });
    });

    it('POST /marketplace/publish handles error', async () => {
      _skillsApi.marketplace.publishSkill.mockRejectedValue(new Error('x'));
      const handler = getHandler('post', '/marketplace/publish');
      const { res } = await callHandler(handler, { req: { headers: { 'x-role': 'admin' }, body: { name: 's' } } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('PUT /marketplace/:skillId updates skill', async () => {
      _skillsApi.marketplace.updateSkill.mockResolvedValue({ id: '1' });
      const handler = getHandler('put', '/marketplace/:skillId');
      const { res } = await callHandler(handler, { req: { params: { skillId: '1' }, body: { name: 's' } } });
      expect(res.json).toHaveBeenCalledWith({ ok: true, skill: { id: '1' } });
    });

    it('PUT /marketplace/:skillId handles error', async () => {
      _skillsApi.marketplace.updateSkill.mockRejectedValue(new Error('x'));
      const handler = getHandler('put', '/marketplace/:skillId');
      const { res } = await callHandler(handler, { req: { params: { skillId: '1' }, body: {} } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('POST /marketplace/:skillId/reviews adds review', async () => {
      _skillsApi.marketplace.addReview.mockResolvedValue({ id: 'r1' });
      const handler = getHandler('post', '/marketplace/:skillId/reviews');
      const { res } = await callHandler(handler, { req: { params: { skillId: '1' }, body: { rating: 5 } } });
      expect(res.json).toHaveBeenCalledWith({ ok: true, review: { id: 'r1' } });
    });

    it('POST /marketplace/:skillId/reviews handles error', async () => {
      _skillsApi.marketplace.addReview.mockRejectedValue(new Error('x'));
      const handler = getHandler('post', '/marketplace/:skillId/reviews');
      const { res } = await callHandler(handler, { req: { params: { skillId: '1' }, body: {} } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('GET /marketplace/:skillId/reviews returns reviews', async () => {
      _skillsApi.marketplace.getReviews.mockReturnValue([]);
      const handler = getHandler('get', '/marketplace/:skillId/reviews');
      const { res } = await callHandler(handler, { req: { params: { skillId: '1' }, query: {} } });
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('GET /marketplace/:skillId/reviews handles error', async () => {
      _skillsApi.marketplace.getReviews.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/marketplace/:skillId/reviews');
      const { res } = await callHandler(handler, { req: { params: { skillId: '1' }, query: {} } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('POST /marketplace/:skillId/download records download', async () => {
      _skillsApi.marketplace.getSkill.mockReturnValue({ name: 's' });
      const handler = getHandler('post', '/marketplace/:skillId/download');
      const { res } = await callHandler(handler, { req: { params: { skillId: '1' }, body: { downloader: 'd' } } });
      expect(_skillsApi.marketplace.recordDownload).toHaveBeenCalledWith('1', 'd');
      expect(_skillsApi.metrics.recordDownload).toHaveBeenCalledWith('s', 'd');
      expect(res.json).toHaveBeenCalledWith({ ok: true, message: 'Download recorded' });
    });

    it('POST /marketplace/:skillId/download skips metrics when skill missing', async () => {
      _skillsApi.marketplace.getSkill.mockReturnValue(null);
      const handler = getHandler('post', '/marketplace/:skillId/download');
      const { res } = await callHandler(handler, { req: { params: { skillId: '1' }, body: {} } });
      expect(_skillsApi.metrics.recordDownload).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ ok: true, message: 'Download recorded' });
    });

    it('POST /marketplace/:skillId/download handles error', async () => {
      _skillsApi.marketplace.recordDownload.mockRejectedValue(new Error('x'));
      const handler = getHandler('post', '/marketplace/:skillId/download');
      const { res } = await callHandler(handler, { req: { params: { skillId: '1' }, body: {} } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('GET /marketplace/:skillId/stats returns stats', async () => {
      _skillsApi.marketplace.getStats.mockReturnValue({ downloads: 3 });
      const handler = getHandler('get', '/marketplace/:skillId/stats');
      const { res } = await callHandler(handler, { req: { params: { skillId: '1' } } });
      expect(res.json).toHaveBeenCalledWith({ downloads: 3 });
    });

    it('GET /marketplace/:skillId/stats handles error', async () => {
      _skillsApi.marketplace.getStats.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/marketplace/:skillId/stats');
      const { res } = await callHandler(handler, { req: { params: { skillId: '1' } } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('GET /marketplace/search returns 400 without query', async () => {
      const handler = getHandler('get', '/marketplace/search');
      const { res } = await callHandler(handler, { req: { query: {} } });
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('GET /marketplace/search returns results', async () => {
      _skillsApi.marketplace.searchSkills.mockReturnValue({ skills: [] });
      const handler = getHandler('get', '/marketplace/search');
      const { res } = await callHandler(handler, { req: { query: { q: 'web' } } });
      expect(res.json).toHaveBeenCalledWith({ skills: [] });
    });

    it('GET /marketplace/search handles error', async () => {
      _skillsApi.marketplace.searchSkills.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/marketplace/search');
      const { res } = await callHandler(handler, { req: { query: { q: 'web' } } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('GET /marketplace/featured returns featured', async () => {
      _skillsApi.marketplace.getFeaturedSkills.mockReturnValue([{ name: 'f1' }]);
      const handler = getHandler('get', '/marketplace/featured');
      const { res } = await callHandler(handler);
      expect(res.json).toHaveBeenCalledWith({ skills: [{ name: 'f1' }] });
    });

    it('GET /marketplace/featured handles error', async () => {
      _skillsApi.marketplace.getFeaturedSkills.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/marketplace/featured');
      const { res } = await callHandler(handler);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('GET /marketplace/popular returns popular', async () => {
      _skillsApi.marketplace.getPopularSkills.mockReturnValue([{ name: 'p1' }]);
      const handler = getHandler('get', '/marketplace/popular');
      const { res } = await callHandler(handler);
      expect(res.json).toHaveBeenCalledWith({ skills: [{ name: 'p1' }] });
    });

    it('GET /marketplace/popular handles error', async () => {
      _skillsApi.marketplace.getPopularSkills.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/marketplace/popular');
      const { res } = await callHandler(handler);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('GET /marketplace/categories returns categories', async () => {
      _skillsApi.marketplace.getCategories.mockReturnValue(['a']);
      const handler = getHandler('get', '/marketplace/categories');
      const { res } = await callHandler(handler);
      expect(res.json).toHaveBeenCalledWith({ categories: ['a'] });
    });

    it('GET /marketplace/categories handles error', async () => {
      _skillsApi.marketplace.getCategories.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/marketplace/categories');
      const { res } = await callHandler(handler);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('GET /marketplace/stats returns overall stats', async () => {
      _skillsApi.marketplace.getMarketplaceStats.mockReturnValue({ total: 5 });
      const handler = getHandler('get', '/marketplace/stats');
      const { res } = await callHandler(handler);
      expect(res.json).toHaveBeenCalledWith({ total: 5 });
    });

    it('GET /marketplace/stats handles error', async () => {
      _skillsApi.marketplace.getMarketplaceStats.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/marketplace/stats');
      const { res } = await callHandler(handler);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('POST /marketplace/:skillId/deprecate deprecates skill', async () => {
      _skillsApi.marketplace.deprecateSkill.mockResolvedValue({ id: '1' });
      const handler = getHandler('post', '/marketplace/:skillId/deprecate');
      const { res } = await callHandler(handler, { req: { params: { skillId: '1' }, body: { reason: 'old' } } });
      expect(res.json).toHaveBeenCalledWith({ ok: true, skill: { id: '1' } });
    });

    it('POST /marketplace/:skillId/deprecate handles error', async () => {
      _skillsApi.marketplace.deprecateSkill.mockRejectedValue(new Error('x'));
      const handler = getHandler('post', '/marketplace/:skillId/deprecate');
      const { res } = await callHandler(handler, { req: { params: { skillId: '1' }, body: {} } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('POST /marketplace/:skillId/archive archives skill', async () => {
      _skillsApi.marketplace.archiveSkill.mockResolvedValue({ id: '1' });
      const handler = getHandler('post', '/marketplace/:skillId/archive');
      const { res } = await callHandler(handler, { req: { params: { skillId: '1' } } });
      expect(res.json).toHaveBeenCalledWith({ ok: true, skill: { id: '1' } });
    });

    it('POST /marketplace/:skillId/archive handles error', async () => {
      _skillsApi.marketplace.archiveSkill.mockRejectedValue(new Error('x'));
      const handler = getHandler('post', '/marketplace/:skillId/archive');
      const { res } = await callHandler(handler, { req: { params: { skillId: '1' } } });
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('version routes', () => {
    function getHandler(method, pathPattern) {
      const calls = mockRouter[method].mock.calls;
      return calls.find(([p]) => p === pathPattern)?.[1];
    }

    async function callHandler(handler, overrides = {}) {
      const req = { body: {}, params: {}, query: {}, headers: {}, ...overrides.req };
      const res = {
        json: jest.fn(),
        status: jest.fn(() => res),
        send: jest.fn(),
        sendStatus: jest.fn()
      };
      await handler(req, res);
      return { req, res };
    }

    it('POST /versions/:skillName blocks unauthorized roles', async () => {
      const handler = getHandler('post', '/versions/:skillName');
      const { res } = await callHandler(handler, { req: { headers: { 'x-role': 'user' }, params: { skillName: 's' } } });
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('POST /versions/:skillName rejects invalid semver', async () => {
      const handler = getHandler('post', '/versions/:skillName');
      const { res } = await callHandler(handler, {
        req: { headers: { 'x-role': 'admin' }, params: { skillName: 's' }, body: { version: 'abc' } }
      });
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('POST /versions/:skillName accepts valid semver', async () => {
      _skillsApi.versionManager.createVersion.mockResolvedValue({ version: '1.0.0' });
      const handler = getHandler('post', '/versions/:skillName');
      const { res } = await callHandler(handler, {
        req: { headers: { 'x-role': 'admin' }, params: { skillName: 's' }, body: { version: '1.0.0' } }
      });
      expect(res.json).toHaveBeenCalledWith({ ok: true, version: { version: '1.0.0' } });
    });

    it('POST /versions/:skillName sets author from header', async () => {
      _skillsApi.versionManager.createVersion.mockResolvedValue({ version: '1.0.0' });
      const handler = getHandler('post', '/versions/:skillName');
      const { res } = await callHandler(handler, {
        req: { headers: { 'x-role': 'admin', 'x-username': 'bob' }, params: { skillName: 's' }, body: { version: '1.0.0' } }
      });
      expect(_skillsApi.versionManager.createVersion).toHaveBeenCalledWith('s', expect.objectContaining({ author: 'bob' }));
      expect(res.json).toHaveBeenCalled();
    });

    it('POST /versions/:skillName handles error', async () => {
      _skillsApi.versionManager.createVersion.mockRejectedValue(new Error('x'));
      const handler = getHandler('post', '/versions/:skillName');
      const { res } = await callHandler(handler, {
        req: { headers: { 'x-role': 'admin' }, params: { skillName: 's' }, body: { version: '1.0.0' } }
      });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('GET /versions/:skillName/current returns current version', async () => {
      _skillsApi.versionManager.getCurrentVersion.mockReturnValue({ version: '1.0.0' });
      const handler = getHandler('get', '/versions/:skillName/current');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's' } } });
      expect(res.json).toHaveBeenCalledWith({ version: '1.0.0' });
    });

    it('GET /versions/:skillName/current returns 404 when none', async () => {
      _skillsApi.versionManager.getCurrentVersion.mockReturnValue(null);
      const handler = getHandler('get', '/versions/:skillName/current');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's' } } });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('GET /versions/:skillName/current handles error', async () => {
      _skillsApi.versionManager.getCurrentVersion.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/versions/:skillName/current');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's' } } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('GET /versions/:skillName/history returns history', async () => {
      _skillsApi.versionManager.getVersionHistory.mockReturnValue([]);
      const handler = getHandler('get', '/versions/:skillName/history');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's' }, query: {} } });
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('GET /versions/:skillName/history handles error', async () => {
      _skillsApi.versionManager.getVersionHistory.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/versions/:skillName/history');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's' }, query: {} } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('GET /versions/:skillName/:version returns specific version', async () => {
      _skillsApi.versionManager.getVersion.mockReturnValue({ version: '1.0.0' });
      const handler = getHandler('get', '/versions/:skillName/:version');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's', version: '1.0.0' } } });
      expect(res.json).toHaveBeenCalledWith({ version: '1.0.0' });
    });

    it('GET /versions/:skillName/:version returns 404 when missing', async () => {
      _skillsApi.versionManager.getVersion.mockReturnValue(null);
      const handler = getHandler('get', '/versions/:skillName/:version');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's', version: '9.9.9' } } });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('GET /versions/:skillName/:version handles error', async () => {
      _skillsApi.versionManager.getVersion.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/versions/:skillName/:version');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's', version: '1.0.0' } } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('PUT /versions/:skillName/:version/status updates status', async () => {
      _skillsApi.versionManager.updateVersionStatus.mockResolvedValue({ status: 'active' });
      const handler = getHandler('put', '/versions/:skillName/:version/status');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's', version: '1.0.0' }, body: { status: 'active' } } });
      expect(res.json).toHaveBeenCalledWith({ ok: true, version: { status: 'active' } });
    });

    it('PUT /versions/:skillName/:version/status handles error', async () => {
      _skillsApi.versionManager.updateVersionStatus.mockRejectedValue(new Error('x'));
      const handler = getHandler('put', '/versions/:skillName/:version/status');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's', version: '1.0.0' }, body: { status: 'x' } } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('POST /versions/:skillName/rollback rolls back', async () => {
      _skillsApi.versionManager.rollback.mockResolvedValue({ version: '1.0.0' });
      const handler = getHandler('post', '/versions/:skillName/rollback');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's' }, body: { targetVersion: '1.0.0' } } });
      expect(res.json).toHaveBeenCalledWith({ ok: true, result: { version: '1.0.0' } });
    });

    it('POST /versions/:skillName/rollback handles error', async () => {
      _skillsApi.versionManager.rollback.mockRejectedValue(new Error('x'));
      const handler = getHandler('post', '/versions/:skillName/rollback');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's' }, body: {} } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('GET /versions/:skillName/latest returns latest version', async () => {
      _skillsApi.versionManager.getLatestVersion.mockReturnValue({ version: '2.0.0' });
      const handler = getHandler('get', '/versions/:skillName/latest');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's' } } });
      expect(res.json).toHaveBeenCalledWith({ version: '2.0.0' });
    });

    it('GET /versions/:skillName/latest returns 404 when none', async () => {
      _skillsApi.versionManager.getLatestVersion.mockReturnValue(null);
      const handler = getHandler('get', '/versions/:skillName/latest');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's' } } });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('GET /versions/:skillName/latest handles error', async () => {
      _skillsApi.versionManager.getLatestVersion.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/versions/:skillName/latest');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's' } } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('POST /versions/:skillName/compatible returns versions', async () => {
      _skillsApi.versionManager.getCompatibleVersions.mockReturnValue([]);
      const handler = getHandler('post', '/versions/:skillName/compatible');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's' }, body: {} } });
      expect(res.json).toHaveBeenCalledWith({ versions: [] });
    });

    it('POST /versions/:skillName/compatible handles error', async () => {
      _skillsApi.versionManager.getCompatibleVersions.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('post', '/versions/:skillName/compatible');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's' }, body: {} } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('POST /versions/:skillName/from-package returns 400 without packagePath', async () => {
      const handler = getHandler('post', '/versions/:skillName/from-package');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's' }, body: {} } });
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('POST /versions/:skillName/from-package creates version', async () => {
      _skillsApi.versionManager.createVersionFromPackage.mockResolvedValue({ version: '1.0.0' });
      const handler = getHandler('post', '/versions/:skillName/from-package');
      const { res } = await callHandler(handler, {
        req: { params: { skillName: 's' }, body: { packagePath: '/x.zip', version: '1.0.0' } }
      });
      expect(res.json).toHaveBeenCalledWith({ ok: true, version: { version: '1.0.0' } });
    });

    it('POST /versions/:skillName/from-package handles error', async () => {
      _skillsApi.versionManager.createVersionFromPackage.mockRejectedValue(new Error('x'));
      const handler = getHandler('post', '/versions/:skillName/from-package');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's' }, body: { packagePath: '/x.zip' } } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('GET /versions returns all versions', async () => {
      _skillsApi.versionManager.getAllVersions.mockReturnValue([]);
      const handler = getHandler('get', '/versions');
      const { res } = await callHandler(handler, { req: { query: {} } });
      expect(res.json).toHaveBeenCalledWith({ versions: [] });
    });

    it('GET /versions handles error', async () => {
      _skillsApi.versionManager.getAllVersions.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/versions');
      const { res } = await callHandler(handler, { req: { query: {} } });
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('GET /versions/stats returns stats', async () => {
      _skillsApi.versionManager.getStats.mockReturnValue({ total: 2 });
      const handler = getHandler('get', '/versions/stats');
      const { res } = await callHandler(handler);
      expect(res.json).toHaveBeenCalledWith({ total: 2 });
    });

    it('GET /versions/stats handles error', async () => {
      _skillsApi.versionManager.getStats.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/versions/stats');
      const { res } = await callHandler(handler);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('GET /versions/:skillName/:version/exists checks version', async () => {
      _skillsApi.versionManager.versionExists.mockReturnValue(true);
      const handler = getHandler('get', '/versions/:skillName/:version/exists');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's', version: '1.0.0' } } });
      expect(res.json).toHaveBeenCalledWith({ exists: true });
    });

    it('GET /versions/:skillName/:version/exists handles error', async () => {
      _skillsApi.versionManager.versionExists.mockImplementation(() => { throw new Error('x'); });
      const handler = getHandler('get', '/versions/:skillName/:version/exists');
      const { res } = await callHandler(handler, { req: { params: { skillName: 's', version: '1.0.0' } } });
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

describe('SkillAutoRouter', () => {
  let _autoRouter;
  let mockAutoLoader;
  let mockRouter;

  function makeLoader() {
    return {
      getSkillsForMessage: jest.fn(() => ({ taskType: 'code', skills: [], shouldLoad: true })),
      getConfig: jest.fn(() => ({})),
      isEnabled: jest.fn(() => true),
      getStartupSkills: jest.fn(() => []),
      getRules: jest.fn(() => []),
      getConfiguredSkills: jest.fn(() => []),
      getSkillsForTaskType: jest.fn(() => [])
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReset();
    mockRouter = require('express').Router();
    mockAutoLoader = makeLoader();
    _autoRouter = new SkillAutoRouter(mockAutoLoader);  });

  function getHandler(method, pathPattern) {
    const calls = mockRouter[method].mock.calls;
    return calls.find(([p]) => p === pathPattern)?.[1];
  }

  async function callHandler(handler, overrides = {}) {
    const req = { body: {}, params: {}, query: {}, headers: {}, ...overrides.req };
    const res = {
      json: jest.fn(),
      status: jest.fn(() => res),
      send: jest.fn(),
      sendStatus: jest.fn()
    };
    await handler(req, res);
    return { req, res };
  }

  it('registers routes', () => {
    expect(getHandler('post', '/auto-detect')).toBeDefined();
    expect(getHandler('get', '/startup')).toBeDefined();
    expect(getHandler('get', '/config')).toBeDefined();
    expect(getHandler('get', '/type/:taskType')).toBeDefined();
  });

  it('POST /auto-detect returns 400 without message', async () => {
    const handler = getHandler('post', '/auto-detect');
    const { res } = await callHandler(handler, { req: { body: {} } });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('POST /auto-detect returns detected skills', async () => {
    const handler = getHandler('post', '/auto-detect');
    const { res } = await callHandler(handler, { req: { body: { message: 'write code' } } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, taskType: 'code' }));
  });

  it('POST /auto-detect handles error', async () => {
    mockAutoLoader.getSkillsForMessage.mockImplementation(() => { throw new Error('x'); });
    const handler = getHandler('post', '/auto-detect');
    const { res } = await callHandler(handler, { req: { body: { message: 'hi' } } });
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('GET /startup returns startup config', async () => {
    const handler = getHandler('get', '/startup');
    const { res } = await callHandler(handler);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, enabled: true }));
  });

  it('GET /startup handles error', async () => {
    mockAutoLoader.isEnabled.mockImplementation(() => { throw new Error('x'); });
    const handler = getHandler('get', '/startup');
    const { res } = await callHandler(handler);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('GET /config returns configured skills', async () => {
    const handler = getHandler('get', '/config');
    const { res } = await callHandler(handler);
    expect(res.json).toHaveBeenCalledWith({ ok: true, skills: [] });
  });

  it('GET /config handles error', async () => {
    mockAutoLoader.getConfiguredSkills.mockImplementation(() => { throw new Error('x'); });
    const handler = getHandler('get', '/config');
    const { res } = await callHandler(handler);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('GET /type/:taskType returns skills for type', async () => {
    const handler = getHandler('get', '/type/:taskType');
    const { res } = await callHandler(handler, { req: { params: { taskType: 'code' } } });
    expect(res.json).toHaveBeenCalledWith({ ok: true, taskType: 'code', skills: [] });
  });

  it('GET /type/:taskType handles error', async () => {
    mockAutoLoader.getSkillsForTaskType.mockImplementation(() => { throw new Error('x'); });
    const handler = getHandler('get', '/type/:taskType');
    const { res } = await callHandler(handler, { req: { params: { taskType: 'code' } } });
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
