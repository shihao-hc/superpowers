import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  PluginManager,
  PluginRegistry,
  PluginLifecycle,
  PluginSandbox,
} from '../src/plugins/index.js'

describe('PluginRegistry', () => {
  let registry: PluginRegistry

  beforeEach(() => {
    registry = new PluginRegistry()
  })

  describe('register', () => {
    it('should register a plugin', () => {
      const pluginDef = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin',
      }

      registry.register(pluginDef)
      expect(registry.get('test-plugin')).toMatchObject({ name: 'test-plugin' })
    })

    it('should register with dependencies', () => {
      registry.register({ name: 'dep', description: '' })
      registry.register({ name: 'main', dependencies: ['dep'], description: '' })

      expect(registry.hasDependencies('dep')).toBe(true)
      expect(registry.getDependents('dep')).toContain('main')
    })

    it('should register hooks', () => {
      const hook = vi.fn()
      registry.register({
        name: 'test',
        hooks: { onMessage: hook },
        description: '',
      })

      const hooks = registry.getByHook('onMessage')
      expect(hooks).toHaveLength(1)
    })
  })

  describe('resolveDependencies', () => {
    it('should resolve dependencies in order', () => {
      registry.register({ name: 'a', description: '' })
      registry.register({ name: 'b', dependencies: ['a'], description: '' })
      registry.register({ name: 'c', dependencies: ['b'], description: '' })

      const { resolved } = registry.resolveDependencies('c')
      expect(Array.from(resolved)).toEqual(['a', 'b', 'c'])
    })

    it('should handle non-existent plugin', () => {
      const { unresolved } = registry.resolveDependencies('nonexistent')
      expect(unresolved.has('nonexistent')).toBe(true)
    })
  })

  describe('unregister', () => {
    it('should unregister plugin and dependents', () => {
      registry.register({ name: 'dep', description: '' })
      registry.register({ name: 'main', dependencies: ['dep'], description: '' })

      registry.unregister('dep')

      expect(registry.get('main')).toBeUndefined()
      expect(registry.get('dep')).toBeUndefined()
    })
  })

  describe('getAll', () => {
    it('should return all plugins', () => {
      registry.register({ name: 'plugin1', description: '' })
      registry.register({ name: 'plugin2', description: '' })

      expect(registry.getAll()).toHaveLength(2)
    })
  })
})

describe('PluginLifecycle', () => {
  let lifecycle: PluginLifecycle

  beforeEach(() => {
    lifecycle = new PluginLifecycle()
  })

  it('should register and emit hooks', async () => {
    const handler = vi.fn()
    lifecycle.registerHook('beforeInit', handler)

    await lifecycle.emitHook('beforeInit', { test: true })

    expect(handler).toHaveBeenCalledWith({ test: true })
  })

  it('should support all lifecycle hooks', async () => {
    const hooks = [
      'beforeInit', 'afterInit',
      'beforeMessage', 'afterMessage',
      'beforeMemory', 'afterMemory',
      'beforeEvent', 'afterEvent',
      'beforeDestroy', 'afterDestroy',
    ]

    for (const hook of hooks) {
      lifecycle.registerHook(hook, vi.fn())
    }

    for (const hook of hooks) {
      await lifecycle.emitHook(hook, {})
    }

    for (const hook of hooks) {
      expect(lifecycle.hooks[hook]).toBeDefined()
    }
  })
})

describe('PluginSandbox', () => {
  let sandbox: PluginSandbox

  beforeEach(() => {
    sandbox = new PluginSandbox(1000)
  })

  it('should create context for plugin', () => {
    const context = sandbox.createContext('test-plugin')

    expect(context.name).toBe('test-plugin')
    expect(context.allowedModules).toEqual([])
  })

  it('should destroy context', async () => {
    sandbox.createContext('test-plugin')
    sandbox.destroy('test-plugin')

    await expect(sandbox.run('test-plugin', 'test')).rejects.toThrow()
  })

  it('should create context with custom config', () => {
    const context = sandbox.createContext('test-plugin', {
      allowedModules: ['fs', 'path'],
      allowedAPIs: ['console', 'setTimeout'],
    })

    expect(context.allowedModules).toEqual(['fs', 'path'])
    expect(context.allowedAPIs).toEqual(['console', 'setTimeout'])
  })
})

describe('PluginManager', () => {
  let manager: PluginManager

  beforeEach(() => {
    manager = new PluginManager({ basePath: '/tmp', useSandbox: false })
  })

  afterEach(async () => {
    await manager.destroyAll()
  })

  it('should load plugin', async () => {
    const pluginDef = {
      name: 'test-plugin',
      path: 'nonexistent',
      description: 'Test',
    }

    const result = await manager.loadPlugin(pluginDef)
    expect(result.name).toBe('test-plugin')
  })

  it('should track enabled plugins', () => {
    expect(manager.isEnabled('test')).toBe(false)
    manager.enabledPlugins.add('test')
    expect(manager.isEnabled('test')).toBe(true)
  })

  it('should get stats', async () => {
    manager.registry.register({ name: 'plugin1', description: '' })
    manager.registry.register({ name: 'plugin2', description: '' })

    const stats = manager.getStats()
    expect(stats.total).toBe(2)
  })

  it('should get all plugins', async () => {
    await manager.loadPlugin({ name: 'test', description: '' })

    const plugins = manager.getAllPlugins()
    expect(plugins.length).toBeGreaterThanOrEqual(1)
  })
})
