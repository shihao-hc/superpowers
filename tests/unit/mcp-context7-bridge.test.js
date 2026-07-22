const fs = require('fs');

const mockThinkingChain = {
  getCurrentChain: jest.fn(),
  addThought: jest.fn()
};

jest.mock('../../src/mcp/engines/ThinkingChain', () => ({
  thinkingChain: mockThinkingChain
}));

jest.mock('../../src/utils/SafePath', () => ({
  sanitizeFilename: (name) => name.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 255)
}));

jest.mock('../../src/utils/UltraWorkUtils', () => ({
  splitLines: jest.fn((content) => content.split('\n')),
  readFileLines: jest.fn()
}));

const { readFileLines } = require('../../src/utils/UltraWorkUtils');
const { Context7Bridge } = require('../../src/mcp/bridges/Context7Bridge');

describe('Context7Bridge', () => {
  let bridge;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'readdirSync').mockReturnValue([]);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('');
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

    readFileLines.mockImplementation((filePath) => {
      const content = fs.readFileSync(filePath, 'utf-8');
      return content.split('\n');
    });

    bridge = new Context7Bridge({ apiUrl: 'https://api.context7.io', cacheDir: '/tmp/cache' });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const b = new Context7Bridge();
      expect(b.apiUrl).toBe('https://mcp.context7.io');
      expect(b.cache).toBeInstanceOf(Map);
    });

    it('should accept custom config', () => {
      expect(bridge.apiUrl).toBe('https://api.context7.io');
      expect(bridge.cacheDir).toBe('/tmp/cache');
    });

    it('should create cacheDir if it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      new Context7Bridge({ cacheDir: '/tmp/test' });
      expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/test', { recursive: true });
    });

    it('should not create cacheDir if it exists', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      new Context7Bridge({ cacheDir: '/tmp/existing' });
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('getTools', () => {
    it('should return 8 tools', () => {
      const tools = bridge.getTools();
      expect(tools).toHaveLength(8);
    });

    it('should return tools with correct structure', () => {
      const tools = bridge.getTools();
      tools.forEach((tool) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool).toHaveProperty('handler');
        expect(typeof tool.handler).toBe('function');
      });
    });

    it('should include all expected tool names', () => {
      const names = bridge.getTools().map((t) => t.name);
      expect(names).toEqual([
        'resolve_library_id', 'query_docs', 'list_cached_libraries',
        'get_library_info', 'refresh_docs', 'invalidate_cache',
        'add_library', 'detect_project_version'
      ]);
    });
  });

  describe('_getHandler', () => {
    it('should return a function for known name', () => {
      const handler = bridge._getHandler('resolve_library_id');
      expect(typeof handler).toBe('function');
    });

    it('should return bound methods for all handler names', () => {
      const names = ['resolve_library_id', 'query_docs', 'list_cached_libraries',
        'get_library_info', 'refresh_docs', 'invalidate_cache',
        'add_library', 'detect_project_version'];
      names.forEach((name) => {
        expect(typeof bridge._getHandler(name)).toBe('function');
      });
    });

    it('should return undefined for unknown name', () => {
      const handler = bridge._getHandler('nonexistent');
      expect(handler).toBeUndefined();
    });
  });

  describe('resolveLibraryId', () => {
    it('should resolve known library from mapping', async () => {
      const result = await bridge.resolveLibraryId({ libraryName: 'react' });
      expect(result.libraryId).toBe('/facebook/react');
      expect(result.source).toBe('mapping');
    });

    it('should normalize library name (lowercase, strip non-alnum)', async () => {
      const result = await bridge.resolveLibraryId({ libraryName: 'Next-JS' });
      expect(result.libraryId).toBe('/vercel/next.js');
    });

    it('should resolve unknown library via API', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ libraryId: '/some/unknown-lib' })
      });
      const result = await bridge.resolveLibraryId({ libraryName: 'unknown-lib', query: 'test' });
      expect(result.libraryId).toBe('/some/unknown-lib');
    });

    it('should fallback to mock when fetch throws', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      const result = await bridge.resolveLibraryId({ libraryName: 'unknown-lib' });
      expect(result.libraryId).toBeUndefined();
      expect(result.source).toBe('api');
    });

    it('should use query param as fallback for missing libraryName', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ libraryId: '/found' })
      });
      const result = await bridge.resolveLibraryId({ query: 'vue' });
      expect(result.libraryId).toBe('/found');
    });

    it('should handle null libraryName', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ libraryId: '/some/lib' })
      });
      const result = await bridge.resolveLibraryId({ libraryName: null });
      expect(result.libraryId).toBe('/some/lib');
    });

    it('should normalize names with dots and spaces', async () => {
      const result = await bridge.resolveLibraryId({ libraryName: 'TailWind CSS' });
      expect(result.libraryId).toBe('/tailwindlabs/tailwindcss');
    });
  });

  describe('queryDocs', () => {
    it('should return fresh API result and cache it', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'docs about react', sources: ['https://docs.react'] })
      });
      mockThinkingChain.getCurrentChain.mockReturnValue(null);

      const result = await bridge.queryDocs({ libraryId: '/react', query: 'hooks' });
      expect(result.content).toBe('docs about react');
      expect(result.fromCache).toBeUndefined();
      expect(bridge.cache.size).toBe(1);
    });

    it('should return cached result when fresh', async () => {
      const cacheKey = '/react:latest:hooks';
      bridge.cache.set(cacheKey, {
        data: { content: 'cached', sources: [] },
        timestamp: Date.now()
      });

      global.fetch = jest.fn();
      const result = await bridge.queryDocs({ libraryId: '/react', query: 'hooks' });
      expect(result.content).toBe('cached');
      expect(result.fromCache).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should re-fetch when cache is expired (>1 hour)', async () => {
      const cacheKey = '/react:latest:hooks';
      bridge.cache.set(cacheKey, {
        data: { content: 'old cached' },
        timestamp: Date.now() - 3600001
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'fresh docs', sources: [] })
      });
      mockThinkingChain.getCurrentChain.mockReturnValue(null);

      const result = await bridge.queryDocs({ libraryId: '/react', query: 'hooks' });
      expect(result.content).toBe('fresh docs');
    });

    it('should include version in cache key', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'v18 docs', sources: [] })
      });
      mockThinkingChain.getCurrentChain.mockReturnValue(null);

      await bridge.queryDocs({ libraryId: '/react', query: 'hooks', version: '18' });
      expect(bridge.cache.has('/react:18:hooks')).toBe(true);
    });

    it('should record to thinking chain when chain exists', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'doc content here', sources: ['src'] })
      });
      const mockChain = { id: 'chain-1' };
      mockThinkingChain.getCurrentChain.mockReturnValue(mockChain);

      await bridge.queryDocs({ libraryId: '/react', query: 'hooks' });
      expect(mockThinkingChain.addThought).toHaveBeenCalledWith(
        'chain-1',
        '查询文档: /react',
        expect.objectContaining({ reasoning: expect.any(String) })
      );
    });

    it('should use "无结果" reasoning when content is empty', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: '', sources: [] })
      });
      mockThinkingChain.getCurrentChain.mockReturnValue({ id: 'chain-2' });

      await bridge.queryDocs({ libraryId: '/empty', query: 'x' });
      expect(mockThinkingChain.addThought).toHaveBeenCalledWith(
        'chain-2',
        expect.any(String),
        expect.objectContaining({ reasoning: '无结果' })
      );
    });

    it('should not record to thinking chain when chain is null', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'result' })
      });
      mockThinkingChain.getCurrentChain.mockReturnValue(null);

      await bridge.queryDocs({ libraryId: '/lib', query: 'q' });
      expect(mockThinkingChain.addThought).not.toHaveBeenCalled();
    });
  });

  describe('detectProjectVersion', () => {
    it('should detect npm dependencies from package.json', async () => {
      fs.existsSync.mockImplementation((p) => p.endsWith('package.json'));
      fs.readFileSync.mockImplementation((p) => {
        if (p.endsWith('package.json')) {
          return JSON.stringify({ dependencies: { react: '^18.0.0' }, devDependencies: { jest: '^29' } });
        }
        return '';
      });

      const result = await bridge.detectProjectVersion({ projectPath: '/project' });
      expect(result.dependencies.npm).toEqual({ react: '^18.0.0', jest: '^29' });
      expect(result.dependencies.packageManager).toBe('npm');
      expect(result.detected).toBe(1);
    });

    it('should handle invalid package.json gracefully', async () => {
      fs.existsSync.mockImplementation((p) => p.endsWith('package.json'));
      fs.readFileSync.mockImplementation((p) => {
        if (p.endsWith('package.json')) return 'invalid json';
        return '';
      });
      bridge.logger = { debug: jest.fn() };

      const result = await bridge.detectProjectVersion({ projectPath: '/project' });
      expect(result.detected).toBe(0);
    });

    it('should detect pip dependencies from requirements.txt', async () => {
      fs.existsSync.mockImplementation((p) => p.endsWith('requirements.txt'));
      fs.readFileSync.mockImplementation((p) => {
        if (p.endsWith('requirements.txt')) return 'flask==2.0\nrequests>=2.25\nnumpy\n';
        return '';
      });

      const result = await bridge.detectProjectVersion({ projectPath: '/project' });
      expect(result.dependencies.pip).toEqual({ flask: '2.0', requests: '2.25', numpy: 'latest' });
      expect(result.dependencies.packageManager).toBe('pip');
    });

    it('should handle invalid requirements.txt gracefully', async () => {
      fs.existsSync.mockImplementation((p) => p.endsWith('requirements.txt'));
      fs.readFileSync.mockImplementation(() => { throw new Error('read error'); });
      bridge.logger = { debug: jest.fn() };

      const result = await bridge.detectProjectVersion({ projectPath: '/project' });
      expect(result.detected).toBe(0);
    });

    it('should detect go dependencies from go.mod', async () => {
      fs.existsSync.mockImplementation((p) => p.endsWith('go.mod'));
      fs.readFileSync.mockImplementation((p) => {
        if (p.endsWith('go.mod')) return 'module myapp\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n\tgolang.org/x/text v0.14.0\n)\n';
        return '';
      });

      const result = await bridge.detectProjectVersion({ projectPath: '/project' });
      expect(result.dependencies.go).toEqual({
        'github.com/gin-gonic/gin': '1.9.1',
        'golang.org/x/text': '0.14.0'
      });
      expect(result.dependencies.packageManager).toBe('go');
    });

    it('should handle invalid go.mod gracefully', async () => {
      fs.existsSync.mockImplementation((p) => p.endsWith('go.mod'));
      fs.readFileSync.mockImplementation(() => { throw new Error('read error'); });
      bridge.logger = { debug: jest.fn() };

      const result = await bridge.detectProjectVersion({ projectPath: '/project' });
      expect(result.detected).toBe(0);
    });

    it('should detect multiple package managers', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((p) => {
        if (p.endsWith('package.json')) return JSON.stringify({ dependencies: { express: '^4' } });
        if (p.endsWith('requirements.txt')) return 'flask==2.0\n';
        if (p.endsWith('go.mod')) return 'module x\nrequire (\n\truntime v1.0\n)\n';
        return '';
      });

      const result = await bridge.detectProjectVersion({ projectPath: '/project' });
      expect(result.detected).toBe(3);
    });

    it('should return no dependencies when no files exist', async () => {
      fs.existsSync.mockReturnValue(false);
      const result = await bridge.detectProjectVersion({ projectPath: '/empty' });
      expect(result.detected).toBe(0);
      expect(result.projectPath).toBe('/empty');
    });

    it('should use process.cwd() as default projectPath', async () => {
      fs.existsSync.mockReturnValue(false);
      const result = await bridge.detectProjectVersion({});
      expect(result.projectPath).toBe(process.cwd());
    });

    it('should skip non-matching requirements lines', async () => {
      fs.existsSync.mockImplementation((p) => p.endsWith('requirements.txt'));
      fs.readFileSync.mockImplementation((p) => {
        if (p.endsWith('requirements.txt')) return '# comment\n\nflask==2.0\n';
        return '';
      });

      const result = await bridge.detectProjectVersion({ projectPath: '/project' });
      expect(result.dependencies.pip).toHaveProperty('flask');
    });
  });

  describe('addLibrary', () => {
    it('should write library entry to cache file', async () => {
      const result = await bridge.addLibrary({ libraryId: '/react', version: '18' });
      expect(result.success).toBe(true);
      expect(result.library.libraryId).toBe('/react');
      expect(result.library.version).toBe('18');
      expect(result.library.addedAt).toBeTruthy();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should default version to latest', async () => {
      const result = await bridge.addLibrary({ libraryId: '/vue' });
      expect(result.library.version).toBe('latest');
    });
  });

  describe('listCachedLibraries', () => {
    it('should return parsed library entries', async () => {
      fs.readdirSync.mockReturnValue(['lib1.json', 'lib2.json', 'readme.txt']);
      fs.readFileSync.mockImplementation((p) => {
        if (p.includes('lib1.json')) return JSON.stringify({ libraryId: '/lib1' });
        if (p.includes('lib2.json')) return JSON.stringify({ libraryId: '/lib2' });
        return '';
      });

      const result = await bridge.listCachedLibraries();
      expect(result.libraries).toHaveLength(2);
      expect(result.count).toBe(2);
    });

    it('should filter out null entries from parse errors', async () => {
      fs.readdirSync.mockReturnValue(['good.json', 'bad.json']);
      fs.readFileSync.mockImplementation((p) => {
        if (p.includes('good.json')) return JSON.stringify({ libraryId: '/good' });
        if (p.includes('bad.json')) return 'not json';
        return '';
      });

      const result = await bridge.listCachedLibraries();
      expect(result.libraries).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it('should return empty list when no files', async () => {
      fs.readdirSync.mockReturnValue([]);
      const result = await bridge.listCachedLibraries();
      expect(result.libraries).toEqual([]);
      expect(result.count).toBe(0);
    });
  });

  describe('getLibraryInfo', () => {
    it('should return cached library info when file exists', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ libraryId: '/react', version: '18' }));

      const result = await bridge.getLibraryInfo({ libraryId: '/react' });
      expect(result.libraryId).toBe('/react');
      expect(result.version).toBe('18');
    });

    it('should return not-found when file does not exist', async () => {
      fs.existsSync.mockReturnValue(false);
      const result = await bridge.getLibraryInfo({ libraryId: '/unknown' });
      expect(result.libraryId).toBe('/unknown');
      expect(result.cached).toBe(false);
    });
  });

  describe('refreshDocs', () => {
    it('should clear matching cache entries', async () => {
      bridge.cache.set('/react:latest:hooks', { data: {}, timestamp: 0 });
      bridge.cache.set('/react:18:refs', { data: {}, timestamp: 0 });
      bridge.cache.set('/vue:latest:guide', { data: {}, timestamp: 0 });

      const result = await bridge.refreshDocs({ libraryId: '/react' });
      expect(result.success).toBe(true);
      expect(result.clearedCache).toBe(2);
      expect(bridge.cache.has('/react:latest:hooks')).toBe(false);
      expect(bridge.cache.has('/vue:latest:guide')).toBe(true);
    });

    it('should return 0 cleared when no matching keys', async () => {
      bridge.cache.set('/vue:latest:guide', { data: {}, timestamp: 0 });
      const result = await bridge.refreshDocs({ libraryId: '/react' });
      expect(result.clearedCache).toBe(0);
    });
  });

  describe('invalidateCache', () => {
    it('should delete cache file when it exists', async () => {
      fs.existsSync.mockReturnValue(true);
      const result = await bridge.invalidateCache({ libraryId: '/react' });
      expect(result.success).toBe(true);
      expect(result.libraryId).toBe('/react');
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should not error when file does not exist', async () => {
      fs.existsSync.mockReturnValue(false);
      const result = await bridge.invalidateCache({ libraryId: '/react' });
      expect(result.success).toBe(true);
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should not throw when unlinkSync fails', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockImplementation(() => { throw new Error('permission denied'); });
      const result = await bridge.invalidateCache({ libraryId: '/react' });
      expect(result.success).toBe(true);
    });
  });

  describe('_apiRequest', () => {
    it('should return JSON response on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ libraryId: '/test', content: 'hello' })
      });

      const result = await bridge._apiRequest('/query', { libraryId: '/test' });
      expect(result.libraryId).toBe('/test');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.context7.io/query',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should return mock data on non-ok response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500
      });

      const result = await bridge._apiRequest('/resolve', { libraryId: '/test' });
      expect(result.libraryId).toBe('/test');
      expect(result.content).toContain('mock response');
      expect(result.sources).toBeDefined();
    });

    it('should return mock data when fetch throws', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network failure'));

      const result = await bridge._apiRequest('/query', { libraryId: '/lib' });
      expect(result.libraryId).toBe('/lib');
      expect(result.content).toContain('mock response');
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when API responds', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' })
      });

      const result = await bridge.healthCheck();
      expect(result.status).toBe('healthy');
      expect(result.api).toBe('https://api.context7.io');
    });

    it('should return degraded when API fails', async () => {
      jest.spyOn(bridge, '_apiRequest').mockRejectedValue(new Error('Connection refused'));

      const result = await bridge.healthCheck();
      expect(result.status).toBe('degraded');
      expect(result.error).toBe('Connection refused');
    });
  });
});
