const crypto = require('crypto');

class PluginManager {
  constructor(options = {}) {
    this.plugins = new Map();
    this.loadedPlugins = new Map();
    this.hooks = new Map();
    this.maxPlugins = options.maxPlugins || 100;
    this.mcpBridge = null;
    this.mcpRegistry = null;
  }

  setMCPServices(bridge, registry) {
    this.mcpBridge = bridge;
    this.mcpRegistry = registry;
  }

  register(plugin) {
    const pluginId = plugin.id || `plugin_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    const pluginData = {
      id: pluginId,
      name: plugin.name,
      version: plugin.version || '1.0.0',
      description: plugin.description || '',
      author: plugin.author || 'unknown',
      nodeTypes: plugin.nodeTypes || [],
      hooks: plugin.hooks || {},
      config: plugin.config || {},
      status: 'registered',
      registeredAt: Date.now()
    };

    this.plugins.set(pluginId, pluginData);
    return pluginData;
  }

  async load(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error('Plugin not found');

    try {
      if (plugin.hooks.onLoad) {
        await plugin.hooks.onLoad(plugin.config);
      }

      plugin.status = 'loaded';
      this.loadedPlugins.set(pluginId, plugin);

      return { success: true, plugin };
    } catch (error) {
      plugin.status = 'error';
      plugin.error = error.message;
      return { success: false, error: error.message };
    }
  }

  async unload(pluginId) {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin) return { success: false, error: 'Plugin not loaded' };

    try {
      if (plugin.hooks.onUnload) {
        await plugin.hooks.onUnload();
      }

      plugin.status = 'unloaded';
      this.loadedPlugins.delete(pluginId);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executeHook(hookName, ...args) {
    const results = [];

    for (const [pluginId, plugin] of this.loadedPlugins) {
      if (plugin.hooks[hookName]) {
        try {
          const result = await plugin.hooks[hookName](...args);
          results.push({ pluginId, result });
        } catch (error) {
          results.push({ pluginId, error: error.message });
        }
      }
    }

    return results;
  }

  getNodeTypes() {
    const types = [];

    for (const [pluginId, plugin] of this.loadedPlugins) {
      for (const nodeType of plugin.nodeTypes) {
        types.push({
          ...nodeType,
          pluginId,
          pluginName: plugin.name
        });
      }
    }

    return types;
  }

  getPlugin(pluginId) {
    return this.plugins.get(pluginId) || this.loadedPlugins.get(pluginId);
  }

  getAllPlugins() {
    return Array.from(this.plugins.values());
  }

  getLoadedPlugins() {
    return Array.from(this.loadedPlugins.values());
  }

  isLoaded(pluginId) {
    return this.loadedPlugins.has(pluginId);
  }

  getStats() {
    return {
      registered: this.plugins.size,
      loaded: this.loadedPlugins.size,
      nodeTypes: this.getNodeTypes().length
    };
  }

  destroy() {
    for (const [pluginId] of this.loadedPlugins) {
      this.unload(pluginId);
    }
    this.plugins.clear();
    this.loadedPlugins.clear();
    this.hooks.clear();
  }
}

module.exports = { PluginManager };
