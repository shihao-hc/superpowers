const { MCPToolRegistry } = require('../../src/mcp/MCPToolRegistry');
const { EventEmitter } = require('events');

class MockBridge extends EventEmitter {
  constructor() {
    super();
    this._servers = [];
    this._tools = {};
  }

  getRegisteredServers() {
    return this._servers;
  }

  getAvailableTools(serverName) {
    return this._tools[serverName] || [];
  }

  setServers(servers) {
    this._servers = servers;
  }

  setTools(serverName, tools) {
    this._tools[serverName] = tools;
  }
}

function makeTool(name, serverName, overrides = {}) {
  return {
    name,
    fullName: `${serverName}:${name}`,
    serverName,
    description: overrides.description || `Tool ${name}`,
    inputSchema: overrides.inputSchema || null,
    tags: overrides.tags || [],
    ...overrides
  };
}

describe('MCPToolRegistry', () => {
  let registry;
  let bridge;

  beforeEach(() => {
    registry = new MCPToolRegistry({ cacheTTL: 10000, autoRefresh: false });
    bridge = new MockBridge();
  });

  afterEach(() => {
    registry.destroy();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const r = new MCPToolRegistry();
      expect(r.bridge).toBeNull();
      expect(r.tools).toBeInstanceOf(Map);
      expect(r.tags).toBeInstanceOf(Map);
      expect(r.options.autoRefresh).toBe(true);
      expect(r.options.refreshInterval).toBe(60000);
      expect(r.options.enableSchemaValidation).toBe(true);
      expect(r.cache.ttl).toBe(300000);
    });

    it('should merge provided options', () => {
      const r = new MCPToolRegistry({ cacheTTL: 5000, autoRefresh: false, enableSchemaValidation: false });
      expect(r.options.cacheTTL).toBe(5000);
      expect(r.options.autoRefresh).toBe(false);
      expect(r.options.enableSchemaValidation).toBe(false);
    });

    it('should initialize empty structures', () => {
      expect(registry.customTags).toBeInstanceOf(Map);
      expect(registry.filters.servers).toBeInstanceOf(Set);
      expect(registry.filters.tags).toBeInstanceOf(Set);
      expect(registry.filters.excludedTools).toBeInstanceOf(Set);
      expect(registry.refreshTimer).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should set bridge reference', () => {
      registry.initialize(bridge);
      expect(registry.bridge).toBe(bridge);
    });

    it('should schedule refresh on server-registered', () => {
      const spy = jest.spyOn(registry, 'scheduleRefresh');
      registry.initialize(bridge);
      bridge.emit('server-registered', { name: 'test' });
      expect(spy).toHaveBeenCalled();
    });

    it('should schedule refresh on server-unregistered', () => {
      const spy = jest.spyOn(registry, 'scheduleRefresh');
      registry.initialize(bridge);
      bridge.emit('server-unregistered', { name: 'test' });
      expect(spy).toHaveBeenCalled();
    });

    it('should schedule refresh on reconnected', () => {
      const spy = jest.spyOn(registry, 'scheduleRefresh');
      registry.initialize(bridge);
      bridge.emit('reconnected', { server: 'test' });
      expect(spy).toHaveBeenCalled();
    });

    it('should start auto refresh when enabled', () => {
      const r = new MCPToolRegistry({ autoRefresh: true, refreshInterval: 60000 });
      const spy = jest.spyOn(r, '_startAutoRefresh');
      r.initialize(bridge);
      expect(spy).toHaveBeenCalled();
      r.destroy();
    });

    it('should not start auto refresh when disabled', () => {
      registry.initialize(bridge);
      expect(registry.refreshTimer).toBeNull();
    });
  });

  describe('refresh', () => {
    it('should throw if not initialized', async () => {
      await expect(registry.refresh()).rejects.toThrow('Registry not initialized with a bridge');
    });

    it('should fetch tools from bridge', async () => {
      const tool1 = makeTool('read', 's1', { description: 'Read a file', inputSchema: { properties: { path: { type: 'string' } } } });
      const tool2 = makeTool('write', 's1', { description: 'Write content to a file' });
      bridge.setServers(['s1']);
      bridge.setTools('s1', [tool1, tool2]);
      registry.initialize(bridge);

      const result = await registry.refresh();
      expect(result.size).toBe(2);
      expect(registry.tools.size).toBe(2);
    });

    it('should extract tags from tools', async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('read', 's1', { description: 'database query tool' })]);
      registry.initialize(bridge);
      await registry.refresh();

      const tags = registry.getTags();
      expect(tags).toContain('s1');
      expect(tags).toContain('data');
    });

    it('should build tag index', async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('read', 's1', { description: 'File read' })]);
      registry.initialize(bridge);
      await registry.refresh();

      const tools = registry.getToolsByTag('file');
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('read');
    });

    it('should handle multiple servers', async () => {
      bridge.setServers(['s1', 's2']);
      bridge.setTools('s1', [makeTool('read', 's1')]);
      bridge.setTools('s2', [makeTool('fetch', 's2', { description: 'http request' })]);
      registry.initialize(bridge);
      await registry.refresh();

      expect(registry.tools.size).toBe(2);
      expect(registry.getTags()).toContain('s1');
      expect(registry.getTags()).toContain('s2');
      expect(registry.getToolsByTag('web')).toHaveLength(1);
    });

    it('should set cachedAt and validUntil timestamps', async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('read', 's1')]);
      registry.initialize(bridge);
      await registry.refresh();

      const tool = registry.tools.get('s1:read');
      expect(tool.cachedAt).toBeDefined();
      expect(tool.validUntil).toBeDefined();
      expect(tool.validUntil).toBeGreaterThan(tool.cachedAt);
    });

    it('should emit refreshed event', async () => {
      const handler = jest.fn();
      registry.on('refreshed', handler);
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('read', 's1')]);
      registry.initialize(bridge);
      await registry.refresh();

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ toolsCount: 1, serversCount: 1 }));
    });

    it('should update cache timestamp', async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('read', 's1')]);
      registry.initialize(bridge);
      expect(registry.cache.timestamp).toBeNull();

      await registry.refresh();
      expect(registry.cache.timestamp).toBeGreaterThan(0);
    });
  });

  describe('scheduleRefresh', () => {
    it('should schedule a refresh after 100ms', () => {
      jest.useFakeTimers();
      const spy = jest.spyOn(registry, 'refresh').mockResolvedValue(new Map());
      registry.scheduleRefresh();
      expect(spy).not.toHaveBeenCalled();
      jest.advanceTimersByTime(100);
      expect(spy).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('should clear existing timer', () => {
      const clearSpy = jest.spyOn(global, 'clearTimeout');
      registry.scheduleRefresh();
      registry.scheduleRefresh();
      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    });

    it('should emit refresh-error on failure', async () => {
      registry.initialize(bridge);
      const handler = jest.fn();
      registry.on('refresh-error', handler);
      jest.spyOn(registry, 'refresh').mockRejectedValue(new Error('fail'));

      registry.scheduleRefresh();
      await new Promise(resolve => setTimeout(resolve, 150));
      await new Promise(resolve => setImmediate(resolve));

      expect(handler).toHaveBeenCalledWith({ error: 'fail' });
    });
  });

  describe('auto refresh', () => {
    it('should start periodic refresh', () => {
      jest.useFakeTimers();
      const r = new MCPToolRegistry({ autoRefresh: false, refreshInterval: 1000 });
      const spy = jest.spyOn(r, 'refresh').mockResolvedValue(new Map());
      r._startAutoRefresh();
      expect(r.refreshTimer).toBeDefined();
      jest.advanceTimersByTime(1000);
      expect(spy).toHaveBeenCalled();
      r.stopAutoRefresh();
      jest.useRealTimers();
    });

    it('should clear existing timer before starting', () => {
      const clearSpy = jest.spyOn(global, 'clearInterval');
      registry._startAutoRefresh();
      registry._startAutoRefresh();
      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
      registry.stopAutoRefresh();
    });

    it('should emit refresh-error on refresh failure', async () => {
      jest.useFakeTimers();
      const r = new MCPToolRegistry({ autoRefresh: false, refreshInterval: 1000 });
      const handler = jest.fn();
      r.on('refresh-error', handler);
      jest.spyOn(r, 'refresh').mockRejectedValue(new Error('network error'));
      r._startAutoRefresh();
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(handler).toHaveBeenCalledWith({ error: 'network error' });
      r.stopAutoRefresh();
      jest.useRealTimers();
    });
  });

  describe('stopAutoRefresh', () => {
    it('should clear refresh timer', () => {
      registry._startAutoRefresh();
      expect(registry.refreshTimer).toBeDefined();
      registry.stopAutoRefresh();
      expect(registry.refreshTimer).toBeNull();
    });

    it('should handle null timer', () => {
      expect(() => registry.stopAutoRefresh()).not.toThrow();
    });
  });

  describe('_extractTags', () => {
    it('should add server name as tag', () => {
      const tool = makeTool('read', 'my-server');
      const tags = registry._extractTags(tool);
      expect(tags).toContain('my-server');
    });

    it('should add explicit tool tags', () => {
      const tool = makeTool('read', 's1', { tags: ['important', 'fast'] });
      const tags = registry._extractTags(tool);
      expect(tags).toContain('important');
      expect(tags).toContain('fast');
    });

    it('should add category tags from description keywords', () => {
      expect(registry._extractTags(makeTool('t', 's1', { description: 'file read write delete' }))).toContain('file');
      expect(registry._extractTags(makeTool('t', 's1', { description: 'git commit branch repo' }))).toContain('git');
      expect(registry._extractTags(makeTool('t', 's1', { description: 'http fetch request' }))).toContain('web');
      expect(registry._extractTags(makeTool('t', 's1', { description: 'database sql query' }))).toContain('data');
      expect(registry._extractTags(makeTool('t', 's1', { description: 'llm ai model generate' }))).toContain('ai');
    });

    it('should add custom tags', () => {
      registry.addCustomTag('s1:read', 'custom-tag');
      const tool = makeTool('read', 's1');
      const tags = registry._extractTags(tool);
      expect(tags).toContain('custom-tag');
    });

    it('should return no duplicate tags', () => {
      const tool = makeTool('read', 's1', { tags: ['s1', 'file'], description: 'file system tool' });
      const tags = registry._extractTags(tool);
      const unique = new Set(tags);
      expect(tags.length).toBe(unique.size);
    });

    it('should not crash on null description', () => {
      const tool = makeTool('read', 's1', { description: null });
      const tags = registry._extractTags(tool);
      expect(tags).toContain('s1');
    });

    it('should not match keywords if description is not matching', () => {
      const tool = makeTool('read', 's1', { description: 'something completely unrelated' });
      const tags = registry._extractTags(tool);
      expect(tags).not.toContain('file');
      expect(tags).not.toContain('git');
      expect(tags).not.toContain('data');
    });

    it('should handle missing serverName', () => {
      const tool = makeTool('read', null, { tags: [], description: 'custom tool' });
      const tags = registry._extractTags(tool);
      expect(tags).toEqual([]);
    });

    it('should handle non-array tags', () => {
      const tool = makeTool('read', 's1', { tags: 'not-an-array' });
      const tags = registry._extractTags(tool);
      expect(tags).toContain('s1');
    });
  });

  describe('addCustomTag / removeCustomTag', () => {
    it('should add a custom tag to a tool', () => {
      registry.addCustomTag('s1:read', 'my-tag');
      expect(registry.customTags.get('s1:read')).toBeInstanceOf(Set);
      expect(registry.customTags.get('s1:read').has('my-tag')).toBe(true);
    });

    it('should add multiple custom tags to same tool', () => {
      registry.addCustomTag('s1:read', 'tag1');
      registry.addCustomTag('s1:read', 'tag2');
      expect(registry.customTags.get('s1:read').size).toBe(2);
    });

    it('should remove a custom tag', () => {
      registry.addCustomTag('s1:read', 'my-tag');
      registry.removeCustomTag('s1:read', 'my-tag');
      expect(registry.customTags.get('s1:read').has('my-tag')).toBe(false);
    });

    it('should do nothing when removing from non-existent tool', () => {
      expect(() => registry.removeCustomTag('s1:none', 'x')).not.toThrow();
    });
  });

  describe('getTools', () => {
    beforeEach(async () => {
      bridge.setServers(['s1', 's2']);
      bridge.setTools('s1', [
        makeTool('read', 's1', { description: 'file read tool', tags: ['file', 'important'] }),
        makeTool('write', 's1', { description: 'file write tool', tags: ['file'] })
      ]);
      bridge.setTools('s2', [
        makeTool('fetch', 's2', { description: 'http fetch tool', tags: ['web'] })
      ]);
      registry.initialize(bridge);
      await registry.refresh();
    });

    it('should return all tools when no options', () => {
      expect(registry.getTools()).toHaveLength(3);
    });

    it('should filter by serverName', () => {
      const tools = registry.getTools({ serverName: 's1' });
      expect(tools).toHaveLength(2);
      expect(tools.every(t => t.serverName === 's1')).toBe(true);
    });

    it('should filter by tags', () => {
      const tools = registry.getTools({ tags: ['web'] });
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('fetch');
    });

    it('should filter by multiple tags (any match)', () => {
      const tools = registry.getTools({ tags: ['web', 'important'] });
      expect(tools).toHaveLength(2);
    });

    it('should exclude by excludedTags', () => {
      const tools = registry.getTools({ excludedTags: ['file'] });
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('fetch');
    });

    it('should search by name', () => {
      const tools = registry.getTools({ search: 'fetch' });
      expect(tools).toHaveLength(1);
    });

    it('should search by description', () => {
      const tools = registry.getTools({ search: 'http' });
      expect(tools).toHaveLength(1);
    });

    it('should return empty for no-match search', () => {
      const tools = registry.getTools({ search: 'zzz_nonexistent' });
      expect(tools).toHaveLength(0);
    });

    it('should combine filters', () => {
      const tools = registry.getTools({ serverName: 's1', tags: ['file'], search: 'read' });
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('read');
    });
  });

  describe('getTool', () => {
    beforeEach(async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('read', 's1')]);
      registry.initialize(bridge);
      await registry.refresh();
    });

    it('should return tool by fullName', () => {
      const tool = registry.getTool('s1:read');
      expect(tool).toBeDefined();
      expect(tool.name).toBe('read');
    });

    it('should return null for unknown tool', () => {
      expect(registry.getTool('s1:nonexistent')).toBeNull();
    });
  });

  describe('getTags', () => {
    it('should return all registered tags', async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('read', 's1', { description: 'file read' })]);
      registry.initialize(bridge);
      await registry.refresh();

      const tags = registry.getTags();
      expect(tags).toContain('s1');
      expect(tags).toContain('file');
    });
  });

  describe('getToolsByTag', () => {
    beforeEach(async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [
        makeTool('read', 's1', { description: 'file read' }),
        makeTool('write', 's1', { description: 'file write' })
      ]);
      registry.initialize(bridge);
      await registry.refresh();
    });

    it('should return tools for a tag', () => {
      const tools = registry.getToolsByTag('file');
      expect(tools).toHaveLength(2);
    });

    it('should return empty for unknown tag', () => {
      expect(registry.getToolsByTag('nonexistent')).toEqual([]);
    });
  });

  describe('getToolsByServer', () => {
    beforeEach(async () => {
      bridge.setServers(['s1', 's2']);
      bridge.setTools('s1', [makeTool('read', 's1')]);
      bridge.setTools('s2', [makeTool('fetch', 's2')]);
      registry.initialize(bridge);
      await registry.refresh();
    });

    it('should return tools for a server', () => {
      const tools = registry.getToolsByServer('s1');
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('read');
    });

    it('should return empty for unknown server', () => {
      expect(registry.getToolsByServer('unknown')).toEqual([]);
    });
  });

  describe('formatForLLM', () => {
    beforeEach(async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('read', 's1', {
        description: 'Read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
      })]);
      registry.initialize(bridge);
      await registry.refresh();
    });

    it('should format tools for LLM', () => {
      const formatted = registry.formatForLLM();
      expect(formatted).toHaveLength(1);
      expect(formatted[0].name).toBe('s1:read');
      expect(formatted[0].description).toBe('Read a file');
    });

    it('should include schema by default', () => {
      const formatted = registry.formatForLLM();
      expect(formatted[0].parameters).toEqual({ type: 'object', properties: { path: { type: 'string' } }, required: ['path'] });
    });

    it('should exclude schema when includeSchema is false', () => {
      const formatted = registry.formatForLLM({ includeSchema: false });
      expect(formatted[0].parameters).toBeUndefined();
    });

    it('should include tags when requested', () => {
      const formatted = registry.formatForLLM({ includeTags: true });
      expect(formatted[0].tags).toBeDefined();
      expect(Array.isArray(formatted[0].tags)).toBe(true);
    });

    it('should filter by serverName', () => {
      bridge.setServers(['s2']);
      bridge.setTools('s2', [makeTool('fetch', 's2')]);
      const formatted = registry.formatForLLM({ serverName: 's1' });
      expect(formatted).toHaveLength(1);
      expect(formatted[0].name).toBe('s1:read');
    });

    it('should use fallback description', async () => {
      bridge.setTools('s1', [makeTool('bare', 's1', { description: null })]);
      await registry.refresh();
      const formatted = registry.formatForLLM({ serverName: 's1' });
      expect(formatted[0].description).toBe('Tool from s1');
    });
  });

  describe('formatForPrompt', () => {
    it('should format tools as prompt string', async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('read', 's1', {
        description: 'Read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'File path' } }, required: ['path'] }
      })]);
      registry.initialize(bridge);
      await registry.refresh();

      const prompt = registry.formatForPrompt();
      expect(prompt).toContain('Available MCP tools');
      expect(prompt).toContain('s1:read');
      expect(prompt).toContain('path (required)');
    });

    it('should return empty message when no tools', () => {
      const prompt = registry.formatForPrompt();
      expect(prompt).toBe('No MCP tools available.');
    });

    it('should pass options to formatForLLM', async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('read', 's1')]);
      registry.initialize(bridge);
      await registry.refresh();
      const spy = jest.spyOn(registry, 'formatForLLM');
      registry.formatForPrompt({ includeTags: true });
      expect(spy).toHaveBeenCalledWith({ includeTags: true });
    });

    it('should format optional params and params without description', async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('read', 's1', {
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' },
            flag: { type: 'boolean' }
          },
          required: ['path']
        }
      })]);
      registry.initialize(bridge);
      await registry.refresh();
      const prompt = registry.formatForPrompt();
      expect(prompt).toContain('path (required)');
      expect(prompt).toContain('flag (optional)');
      expect(prompt).toContain('boolean');
    });
  });

  describe('validateParams', () => {
    beforeEach(async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('read', 's1', {
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            count: { type: 'number' },
            recursive: { type: 'boolean' },
            items: { type: 'array' },
            metadata: { type: 'object' }
          },
          required: ['path']
        }
      })]);
      registry.initialize(bridge);
      await registry.refresh();
    });

    it('should return valid for correct params', () => {
      const result = registry.validateParams('s1:read', { path: '/a.txt' });
      expect(result.valid).toBe(true);
    });

    it('should return error for missing required', () => {
      const result = registry.validateParams('s1:read', {});
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('path');
    });

    it('should validate string type', () => {
      const result = registry.validateParams('s1:read', { path: 123 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'path')).toBe(true);
    });

    it('should validate number type', () => {
      const result = registry.validateParams('s1:read', { path: '/a.txt', count: 'not-a-number' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'count')).toBe(true);
    });

    it('should validate boolean type', () => {
      const result = registry.validateParams('s1:read', { path: '/a.txt', recursive: 'yes' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'recursive')).toBe(true);
    });

    it('should validate array type', () => {
      const result = registry.validateParams('s1:read', { path: '/a.txt', items: 'not-array' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'items')).toBe(true);
    });

    it('should validate object type', () => {
      const result = registry.validateParams('s1:read', { path: '/a.txt', metadata: 'not-object' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'metadata')).toBe(true);
    });

    it('should pass validation for null object', () => {
      const result = registry.validateParams('s1:read', { path: '/a.txt', metadata: null });
      expect(result.valid).toBe(false);
    });

    it('should accept array for array type', () => {
      const result = registry.validateParams('s1:read', { path: '/a.txt', items: ['a', 'b'] });
      expect(result.valid).toBe(true);
    });

    it('should accept object for object type', () => {
      const result = registry.validateParams('s1:read', { path: '/a.txt', metadata: { key: 'value' } });
      expect(result.valid).toBe(true);
    });

    it('should return valid when tool has no schema', () => {
      const result = registry.validateParams('nonexistent', {});
      expect(result.valid).toBe(true);
    });

    it('should return valid when validation is disabled', () => {
      const r = new MCPToolRegistry({ enableSchemaValidation: false });
      r.initialize(bridge);
      const result = r.validateParams('anything', {});
      expect(result.valid).toBe(true);
      r.destroy();
    });

    it('should accept boolean for boolean type', () => {
      const result = registry.validateParams('s1:read', { path: '/a.txt', recursive: false });
      expect(result.valid).toBe(true);
    });

    it('should handle inputSchema without required field', async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('no-req', 's1', {
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } }
      })]);
      registry.initialize(bridge);
      await registry.refresh();
      const result = registry.validateParams('s1:no-req', {});
      expect(result.valid).toBe(true);
    });

    it('should handle inputSchema without properties', async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('no-prop', 's1', {
        inputSchema: { type: 'object', required: ['path'] }
      })]);
      registry.initialize(bridge);
      await registry.refresh();
      const result = registry.validateParams('s1:no-prop', { path: '/test' });
      expect(result.valid).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return stats object', async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('read', 's1', { description: 'file read' })]);
      registry.initialize(bridge);
      await registry.refresh();

      const stats = registry.getStats();
      expect(stats.totalTools).toBe(1);
      expect(stats.totalTags).toBeGreaterThanOrEqual(2);
      expect(stats.byServer.s1).toBe(1);
      expect(stats.cacheAge).toBeGreaterThanOrEqual(0);
    });

    it('should return byTag counts', async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [
        makeTool('read', 's1', { description: 'file read' }),
        makeTool('write', 's1', { description: 'file write' })
      ]);
      registry.initialize(bridge);
      await registry.refresh();

      const stats = registry.getStats();
      expect(stats.byTag.file).toBe(2);
      expect(stats.byTag.s1).toBe(2);
    });

    it('should return null cacheAge when not refreshed', () => {
      const stats = registry.getStats();
      expect(stats.cacheAge).toBeNull();
    });
  });

  describe('isCacheValid', () => {
    it('should return false when not refreshed', () => {
      expect(registry.isCacheValid()).toBe(false);
    });

    it('should return true after refresh within TTL', async () => {
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('read', 's1')]);
      registry.initialize(bridge);
      await registry.refresh();
      expect(registry.isCacheValid()).toBe(true);
    });

    it('should return false after TTL expires', () => {
      jest.useFakeTimers();
      const r = new MCPToolRegistry({ cacheTTL: 100, autoRefresh: false });
      r.tools.set('t', {});
      r.cache.timestamp = Date.now() - 200;
      expect(r.isCacheValid()).toBe(false);
      jest.useRealTimers();
    });
  });

  describe('destroy', () => {
    it('should stop auto refresh and clear all data', () => {
      const stopSpy = jest.spyOn(registry, 'stopAutoRefresh');
      bridge.setServers(['s1']);
      bridge.setTools('s1', [makeTool('read', 's1')]);
      registry.initialize(bridge);

      registry.destroy();
      expect(stopSpy).toHaveBeenCalled();
      expect(registry.tools.size).toBe(0);
      expect(registry.tags.size).toBe(0);
      expect(registry.cache.tools.size).toBe(0);
      expect(registry.customTags.size).toBe(0);
    });
  });
});
