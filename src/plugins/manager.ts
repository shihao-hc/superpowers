/**
 * Plugin Manager
 */

import { EventEmitter } from 'events';
import { PluginRegistry, PluginLifecycle, PluginSandbox } from './index.js';

export interface PluginManagerConfig {
  basePath: string;
  pluginDir?: string;
  useSandbox?: boolean;
  sandboxTimeout?: number;
}

export class PluginManagerImpl extends EventEmitter {
  private config: PluginManagerConfig;
  private registry: PluginRegistry;
  private lifecycle: PluginLifecycle;
  private sandbox: PluginSandbox;
  private instances: Map<string, unknown> = new Map();
  private enabledPlugins: Set<string> = new Set();

  constructor(config: PluginManagerConfig) {
    super();
    this.config = {
      basePath: config.basePath,
      pluginDir: config.pluginDir || 'plugins',
      useSandbox: config.useSandbox ?? true,
      sandboxTimeout: config.sandboxTimeout || 5000
    };

    this.registry = new PluginRegistry() as unknown as PluginRegistry;
    this.lifecycle = new PluginLifecycle();
    this.sandbox = new PluginSandbox(this.config.sandboxTimeout);
  }

  async loadPlugin(definition: PluginDefinition): Promise<PluginInstance> {
    const { name, path, enabled = true, config = {} } = definition;

    const plugin = (this.registry as unknown as { register: Function }).register({
      name,
      ...definition
    });

    if (!enabled) {
      return { name, status: 'disabled' };
    }

    try {
      const entryPath = this.resolvePath(path);

      if (this.config.useSandbox) {
        this.sandbox.createContext(name, config.sandbox || {});
      }

      const PluginClass = require(entryPath);
      const instance = new PluginClass(config);

      if (typeof instance.init === 'function') {
        await instance.init(config);
      }

      this.instances.set(name, instance);
      this.enabledPlugins.add(name);

      this.emit('plugin:loaded', { name, instance });
      return { name, instance, status: 'loaded' };
    } catch (error) {
      this.emit('plugin:error', { name, error });
      return { name, status: 'error', error: String(error) };
    }
  }

  async unloadPlugin(name: string): Promise<boolean> {
    const instance = this.instances.get(name);
    if (!instance) return false;

    if (typeof (instance as { destroy?: Function }).destroy === 'function') {
      await (instance as { destroy: Function }).destroy();
    }

    this.instances.delete(name);
    this.enabledPlugins.delete(name);
    this.sandbox.destroy(name);

    this.emit('plugin:unloaded', { name });
    return true;
  }

  getPlugin(name: string): PluginInstance | undefined {
    const instance = this.instances.get(name);
    if (!instance) return undefined;
    return { name, instance, status: 'loaded' };
  }

  isEnabled(name: string): boolean {
    return this.enabledPlugins.has(name);
  }

  enable(name: string): void {
    this.enabledPlugins.add(name);
    this.emit('plugin:enabled', { name });
  }

  disable(name: string): void {
    this.enabledPlugins.delete(name);
    this.emit('plugin:disabled', { name });
  }

  private resolvePath(path: string): string {
    const pathModule = require('path');
    return pathModule.resolve(this.config.basePath, path);
  }

  getAllPlugins(): PluginInstance[] {
    return Array.from(this.instances.keys()).map(name => ({
      name,
      instance: this.instances.get(name),
      status: 'loaded'
    }));
  }
}

export interface PluginDefinition {
  name: string;
  path: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export interface PluginInstance {
  name: string;
  instance?: unknown;
  status: 'loaded' | 'disabled' | 'error';
  error?: string;
}

export function createPluginManager(config: PluginManagerConfig): PluginManagerImpl {
  return new PluginManagerImpl(config);
}
