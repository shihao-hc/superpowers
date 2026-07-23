/**
 * Plugin System - 基于 Claude Code 插件架构
 * 支持沙箱隔离、热重载、生命周期管理
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

class PluginSandbox {
  constructor(timeout = 5000) {
    this.timeout = timeout;
    this.contexts = new Map();
  }

  createContext(pluginName, sandboxConfig = {}) {
    const context = {
      name: pluginName,
      allowedModules: sandboxConfig.allowedModules || [],
      allowedAPIs: sandboxConfig.allowedAPIs || ['console', 'setTimeout', 'clearTimeout'],
      memory: new Map(),
      createdAt: Date.now()
    };
    this.contexts.set(pluginName, context);
    return context;
  }

  async run(pluginName, fnName, args = []) {
    const context = this.contexts.get(pluginName);
    if (!context) {
      throw new Error(`Plugin ${pluginName} not found`);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Plugin ${pluginName} timeout in ${fnName}`));
      }, this.timeout);

      try {
        resolve();
        clearTimeout(timer);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  destroy(pluginName) {
    this.contexts.delete(pluginName);
  }
}

class PluginLifecycle extends EventEmitter {
  constructor() {
    super();
    this.hooks = {
      beforeInit: [],
      afterInit: [],
      beforeMessage: [],
      afterMessage: [],
      beforeMemory: [],
      afterMemory: [],
      beforeEvent: [],
      afterEvent: [],
      beforeDestroy: [],
      afterDestroy: []
    };
  }

  registerHook(hookName, handler) {
    if (this.hooks[hookName]) {
      this.hooks[hookName].push(handler);
    }
  }

  async emitHook(hookName, data) {
    const handlers = this.hooks[hookName] || [];
    for (const handler of handlers) {
      await handler(data);
    }
  }
}

class PluginRegistry extends EventEmitter {
  constructor() {
    super();
    this.plugins = new Map();
    this.dependencies = new Map();
    this.hooks = new Map();
  }

  register(pluginDef) {
    const plugin = {
      name: pluginDef.name,
      version: pluginDef.version || '1.0.0',
      description: pluginDef.description || '',
      author: pluginDef.author || '',
      dependencies: pluginDef.dependencies || [],
      hooks: pluginDef.hooks || {},
      lifecycle: pluginDef.lifecycle || {},
      config: pluginDef.config || {},
      status: 'registered',
      registeredAt: Date.now()
    };

    this.plugins.set(plugin.name, plugin);
    
    for (const dep of plugin.dependencies) {
      if (!this.dependencies.has(dep)) {
        this.dependencies.set(dep, []);
      }
      this.dependencies.get(dep).push(plugin.name);
    }

    for (const [hookName, handler] of Object.entries(plugin.hooks)) {
      if (!this.hooks.has(hookName)) {
        this.hooks.set(hookName, []);
      }
      this.hooks.get(hookName).push({ plugin: plugin.name, handler });
    }

    this.emit('pluginRegistered', plugin);
    return plugin;
  }

  get(name) {
    return this.plugins.get(name);
  }

  getAll() {
    return Array.from(this.plugins.values());
  }

  getByHook(hookName) {
    return this.hooks.get(hookName) || [];
  }

  hasDependencies(name) {
    return this.dependencies.has(name);
  }

  getDependents(name) {
    return this.dependencies.get(name) || [];
  }

  resolveDependencies(pluginName, resolved = new Set(), unresolved = new Set()) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      unresolved.add(pluginName);
      return { resolved, unresolved };
    }

    if (resolved.has(pluginName)) return { resolved, unresolved };
    if (unresolved.has(pluginName)) return { resolved, unresolved };

    unresolved.add(pluginName);

    for (const dep of plugin.dependencies) {
      this.resolveDependencies(dep, resolved, unresolved);
    }

    unresolved.delete(pluginName);
    resolved.add(pluginName);

    return { resolved, unresolved };
  }

  unregister(name) {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;

    const dependents = this.getDependents(name);
    for (const dep of dependents) {
      this.unregister(dep);
    }

    this.plugins.delete(name);
    this.emit('pluginUnregistered', { name });
    return true;
  }
}

class PluginManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.basePath = options.basePath || process.cwd();
    this.pluginDir = path.resolve(this.basePath, options.pluginDir || 'plugins');
    this.useSandbox = options.useSandbox !== false;
    
    this.registry = new PluginRegistry();
    this.lifecycle = new PluginLifecycle();
    this.sandbox = this.useSandbox ? new PluginSandbox(options.sandboxTimeout || 5000) : null;
    
    this.instances = new Map();
    this.enabledPlugins = new Set();
  }

  async loadPlugin(pluginDef) {
    const { name, path: pluginPath, enabled = true, config = {} } = pluginDef;

    const plugin = this.registry.register({
      name,
      ...pluginDef
    });

    if (!enabled) {
      return plugin;
    }

    try {
      const fullPath = path.resolve(this.basePath, pluginPath || `plugins/${name}`);
      const entryPath = path.join(fullPath, 'index.js');

      if (!fs.existsSync(entryPath)) {
        throw new Error(`Plugin entry not found: ${entryPath}`);
      }

      await this.lifecycle.emitHook('beforeInit', { name, plugin });

      if (this.sandbox) {
        this.sandbox.createContext(name, config.sandbox || {});
      }

      const PluginClass = require(entryPath);
      const instance = new PluginClass(config);

      if (typeof instance.init === 'function') {
        await instance.init(config);
      }

      this.instances.set(name, instance);
      this.enabledPlugins.add(name);
      plugin.status = 'initialized';

      await this.lifecycle.emitHook('afterInit', { name, plugin });

      this.emit('pluginLoaded', { name, instance });
    } catch (err) {
      plugin.status = 'error';
      plugin.error = err.message;
      this.emit('pluginError', { name, error: err });
    }

    return plugin;
  }

  async loadPlugins(manifest) {
    const plugins = manifest.plugins || [];
    const results = [];

    for (const pluginDef of plugins) {
      const { resolved, unresolved } = this.registry.resolveDependencies(pluginDef.name);
      
      if (unresolved.size > 0) {
        this.emit('dependencyError', { 
          plugin: pluginDef.name, 
          unresolved: Array.from(unresolved) 
        });
        continue;
      }

      for (const depName of resolved) {
        if (!this.enabledPlugins.has(depName)) {
          const depDef = plugins.find(p => p.name === depName);
          if (depDef) {
            await this.loadPlugin(depDef);
          }
        }
      }

      results.push(await this.loadPlugin(pluginDef));
    }

    return results;
  }

  async onMessage(message, context = {}) {
    let msg = message;
    const hookData = { message: msg, context };

    await this.lifecycle.emitHook('beforeMessage', hookData);

    for (const [name, instance] of this.instances) {
      if (typeof instance.onMessage === 'function') {
        await this.lifecycle.emitHook('beforeMessage', { plugin: name, ...hookData });
        
        try {
          const result = instance.onMessage(msg, context);
          if (result && typeof result.message === 'string') {
            msg = result.message;
          }
        } catch (err) {
          this.emit('pluginMessageError', { plugin: name, error: err });
        }

        await this.lifecycle.emitHook('afterMessage', { plugin: name, result: msg });
      }
    }

    await this.lifecycle.emitHook('afterMessage', hookData);
    return { message: msg };
  }

  async onMemory(memory, context = {}) {
    await this.lifecycle.emitHook('beforeMemory', { memory, context });

    for (const [name, instance] of this.instances) {
      if (typeof instance.onMemory === 'function') {
        try {
          await instance.onMemory(memory, context);
        } catch (err) {
          this.emit('pluginMemoryError', { plugin: name, error: err });
        }
      }
    }

    await this.lifecycle.emitHook('afterMemory', { memory, context });
  }

  async onEvent(event, context = {}) {
    await this.lifecycle.emitHook('beforeEvent', { event, context });

    for (const [name, instance] of this.instances) {
      if (typeof instance.onEvent === 'function') {
        try {
          await instance.onEvent(event, context);
        } catch (err) {
          this.emit('pluginEventError', { plugin: name, error: err });
        }
      }
    }

    await this.lifecycle.emitHook('afterEvent', { event, context });
  }

  enable(name) {
    if (this.instances.has(name)) {
      this.enabledPlugins.add(name);
      this.emit('pluginEnabled', { name });
      return true;
    }
    return false;
  }

  disable(name) {
    this.enabledPlugins.delete(name);
    this.emit('pluginDisabled', { name });
    return true;
  }

  isEnabled(name) {
    return this.enabledPlugins.has(name);
  }

  async destroy(name) {
    await this.lifecycle.emitHook('beforeDestroy', { name });

    const instance = this.instances.get(name);
    if (instance && typeof instance.destroy === 'function') {
      await instance.destroy();
    }

    this.instances.delete(name);
    this.enabledPlugins.delete(name);
    this.registry.unregister(name);

    if (this.sandbox) {
      this.sandbox.destroy(name);
    }

    await this.lifecycle.emitHook('afterDestroy', { name });
    this.emit('pluginDestroyed', { name });
  }

  async destroyAll() {
    for (const name of this.instances.keys()) {
      await this.destroy(name);
    }
  }

  getPlugin(name) {
    return {
      registry: this.registry.get(name),
      instance: this.instances.get(name),
      enabled: this.enabledPlugins.has(name)
    };
  }

  getAllPlugins() {
    return Array.from(this.registry.getAll()).map(p => ({
      ...p,
      instance: this.instances.get(p.name),
      enabled: this.enabledPlugins.has(p.name)
    }));
  }

  getStats() {
    const plugins = this.registry.getAll();
    return {
      total: plugins.length,
      initialized: this.instances.size,
      enabled: this.enabledPlugins.size,
      byStatus: plugins.reduce((acc, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

module.exports = {
  PluginSandbox,
  PluginLifecycle,
  PluginRegistry,
  PluginManager
};
