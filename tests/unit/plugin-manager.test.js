const { PluginManager } = require('../../src/workflow/PluginManager');

describe('PluginManager', () => {
  let pm;

  beforeEach(() => {
    pm = new PluginManager();
  });

  describe('constructor', () => {
    it('creates empty maps and default maxPlugins', () => {
      expect(pm.plugins).toBeInstanceOf(Map);
      expect(pm.loadedPlugins).toBeInstanceOf(Map);
      expect(pm.hooks).toBeInstanceOf(Map);
      expect(pm.maxPlugins).toBe(100);
      expect(pm.mcpBridge).toBeNull();
      expect(pm.mcpRegistry).toBeNull();
    });

    it('accepts custom maxPlugins', () => {
      const pm2 = new PluginManager({ maxPlugins: 50 });
      expect(pm2.maxPlugins).toBe(50);
    });
  });

  describe('setMCPServices', () => {
    it('sets mcpBridge and mcpRegistry', () => {
      const bridge = { name: 'bridge' };
      const registry = { name: 'registry' };
      pm.setMCPServices(bridge, registry);
      expect(pm.mcpBridge).toBe(bridge);
      expect(pm.mcpRegistry).toBe(registry);
    });
  });

  describe('register', () => {
    const basicPlugin = {
      name: 'TestPlugin',
      version: '2.0.0',
      description: 'A test plugin',
      author: 'Tester',
      nodeTypes: [{ type: 'test-node' }],
      hooks: { onLoad: jest.fn() },
      config: { key: 'val' }
    };

    it('stores all fields and returns pluginData', () => {
      const result = pm.register({ id: 'my-pid', ...basicPlugin });
      expect(result.id).toBe('my-pid');
      expect(result.name).toBe('TestPlugin');
      expect(result.version).toBe('2.0.0');
      expect(result.description).toBe('A test plugin');
      expect(result.author).toBe('Tester');
      expect(result.nodeTypes).toEqual([{ type: 'test-node' }]);
      expect(result.hooks).toEqual({ onLoad: expect.any(Function) });
      expect(result.config).toEqual({ key: 'val' });
      expect(result.status).toBe('registered');
      expect(result.registeredAt).toBeDefined();
      expect(pm.plugins.get('my-pid')).toBe(result);
    });

    it('generates plugin ID with plugin_ prefix when id not provided', () => {
      const result = pm.register({ name: 'NoId' });
      expect(result.id).toMatch(/^plugin_/);
    });

    it('fills default values for optional fields', () => {
      const result = pm.register({ name: 'Minimal' });
      expect(result.version).toBe('1.0.0');
      expect(result.description).toBe('');
      expect(result.author).toBe('unknown');
      expect(result.nodeTypes).toEqual([]);
      expect(result.hooks).toEqual({});
      expect(result.config).toEqual({});
    });
  });

  describe('load', () => {
    it('throws if plugin not found', async () => {
      await expect(pm.load('nonexistent')).rejects.toThrow('Plugin not found');
    });

    it('calls onLoad hook with config and sets status to loaded', async () => {
      const onLoad = jest.fn();
      pm.register({ id: 'p1', name: 'P1', hooks: { onLoad }, config: { x: 1 } });
      const result = await pm.load('p1');
      expect(onLoad).toHaveBeenCalledWith({ x: 1 });
      expect(result.success).toBe(true);
      expect(result.plugin.status).toBe('loaded');
      expect(pm.loadedPlugins.has('p1')).toBe(true);
    });

    it('works without onLoad hook', async () => {
      pm.register({ id: 'p1', name: 'P1' });
      const result = await pm.load('p1');
      expect(result.success).toBe(true);
      expect(result.plugin.status).toBe('loaded');
    });

    it('returns error when hook throws', async () => {
      const onLoad = jest.fn().mockRejectedValue(new Error('Hook failed'));
      pm.register({ id: 'p1', name: 'P1', hooks: { onLoad } });
      const result = await pm.load('p1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Hook failed');
      expect(pm.plugins.get('p1').status).toBe('error');
    });
  });

  describe('unload', () => {
    it('returns error if plugin not loaded', async () => {
      const result = await pm.unload('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Plugin not loaded');
    });

    it('calls onUnload hook and removes from loadedPlugins', async () => {
      const onUnload = jest.fn();
      pm.register({ id: 'p1', name: 'P1', hooks: { onUnload } });
      await pm.load('p1');
      expect(pm.loadedPlugins.has('p1')).toBe(true);

      const result = await pm.unload('p1');
      expect(onUnload).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(pm.plugins.get('p1').status).toBe('unloaded');
      expect(pm.loadedPlugins.has('p1')).toBe(false);
    });

    it('works without onUnload hook', async () => {
      pm.register({ id: 'p1', name: 'P1' });
      await pm.load('p1');
      const result = await pm.unload('p1');
      expect(result.success).toBe(true);
    });

    it('returns error when onUnload throws', async () => {
      const onUnload = jest.fn().mockRejectedValue(new Error('Unload failed'));
      pm.register({ id: 'p1', name: 'P1', hooks: { onUnload } });
      await pm.load('p1');
      const result = await pm.unload('p1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unload failed');
    });
  });

  describe('executeHook', () => {
    it('returns empty array when no loaded plugins', async () => {
      const results = await pm.executeHook('onMessage');
      expect(results).toEqual([]);
    });

    it('calls hook for all loaded plugins that have it', async () => {
      const fn1 = jest.fn().mockResolvedValue('r1');
      const fn2 = jest.fn().mockResolvedValue('r2');
      pm.register({ id: 'p1', name: 'P1', hooks: { onMessage: fn1 } });
      pm.register({ id: 'p2', name: 'P2', hooks: { onMessage: fn2 } });
      pm.register({ id: 'p3', name: 'P3' });
      await pm.load('p1');
      await pm.load('p2');
      await pm.load('p3');

      const results = await pm.executeHook('onMessage', 'arg1', 'arg2');
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ pluginId: 'p1', result: 'r1' });
      expect(results[1]).toEqual({ pluginId: 'p2', result: 'r2' });
      expect(fn1).toHaveBeenCalledWith('arg1', 'arg2');
      expect(fn2).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('captures errors per plugin', async () => {
      const fnGood = jest.fn().mockResolvedValue('ok');
      const fnBad = jest.fn().mockRejectedValue(new Error('boom'));
      pm.register({ id: 'p1', name: 'P1', hooks: { onMessage: fnGood } });
      pm.register({ id: 'p2', name: 'P2', hooks: { onMessage: fnBad } });
      await pm.load('p1');
      await pm.load('p2');

      const results = await pm.executeHook('onMessage');
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ pluginId: 'p1', result: 'ok' });
      expect(results[1]).toEqual({ pluginId: 'p2', error: 'boom' });
    });
  });

  describe('getNodeTypes', () => {
    it('returns empty array when no loaded plugins', () => {
      expect(pm.getNodeTypes()).toEqual([]);
    });

    it('merges node types with pluginId and pluginName', async () => {
      pm.register({ id: 'p1', name: 'P1', nodeTypes: [{ type: 'a' }, { type: 'b' }] });
      pm.register({ id: 'p2', name: 'P2', nodeTypes: [{ type: 'c' }] });
      await pm.load('p1');
      await pm.load('p2');

      const types = pm.getNodeTypes();
      expect(types).toHaveLength(3);
      expect(types[0]).toEqual({ type: 'a', pluginId: 'p1', pluginName: 'P1' });
      expect(types[1]).toEqual({ type: 'b', pluginId: 'p1', pluginName: 'P1' });
      expect(types[2]).toEqual({ type: 'c', pluginId: 'p2', pluginName: 'P2' });
    });
  });

  describe('getPlugin', () => {
    it('returns from plugins map', () => {
      pm.register({ id: 'p1', name: 'P1' });
      const p = pm.getPlugin('p1');
      expect(p).toBeDefined();
      expect(p.name).toBe('P1');
    });

    it('returns from loadedPlugins map', async () => {
      pm.register({ id: 'p1', name: 'P1' });
      await pm.load('p1');
      const p = pm.getPlugin('p1');
      expect(p).toBeDefined();
    });

    it('returns undefined if not found', () => {
      expect(pm.getPlugin('ghost')).toBeUndefined();
    });
  });

  describe('getAllPlugins', () => {
    it('returns all registered plugins', () => {
      pm.register({ id: 'p1', name: 'P1' });
      pm.register({ id: 'p2', name: 'P2' });
      const all = pm.getAllPlugins();
      expect(all).toHaveLength(2);
      expect(all.map(p => p.id)).toEqual(['p1', 'p2']);
    });
  });

  describe('getLoadedPlugins', () => {
    it('returns only loaded plugins', async () => {
      pm.register({ id: 'p1', name: 'P1' });
      pm.register({ id: 'p2', name: 'P2' });
      await pm.load('p1');
      const loaded = pm.getLoadedPlugins();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('p1');
    });
  });

  describe('isLoaded', () => {
    it('returns true for loaded plugin', async () => {
      pm.register({ id: 'p1', name: 'P1' });
      await pm.load('p1');
      expect(pm.isLoaded('p1')).toBe(true);
    });

    it('returns false for unloaded or non-existent plugin', () => {
      expect(pm.isLoaded('ghost')).toBe(false);
      pm.register({ id: 'p1', name: 'P1' });
      expect(pm.isLoaded('p1')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('returns zeroes when empty', () => {
      expect(pm.getStats()).toEqual({ registered: 0, loaded: 0, nodeTypes: 0 });
    });

    it('returns correct counts', async () => {
      pm.register({ id: 'p1', name: 'P1', nodeTypes: [{ type: 'x' }] });
      pm.register({ id: 'p2', name: 'P2', nodeTypes: [{ type: 'y' }, { type: 'z' }] });
      await pm.load('p1');
      const stats = pm.getStats();
      expect(stats.registered).toBe(2);
      expect(stats.loaded).toBe(1);
      expect(stats.nodeTypes).toBe(1);
    });
  });

  describe('destroy', () => {
    it('unloads all loaded plugins and clears maps', async () => {
      const onUnload = jest.fn();
      pm.register({ id: 'p1', name: 'P1', hooks: { onUnload } });
      pm.register({ id: 'p2', name: 'P2' });
      await pm.load('p1');
      await pm.load('p2');
      pm.hooks.set('custom', () => {});

      pm.destroy();
      expect(pm.plugins.size).toBe(0);
      expect(pm.loadedPlugins.size).toBe(0);
      expect(pm.hooks.size).toBe(0);
    });
  });
});
