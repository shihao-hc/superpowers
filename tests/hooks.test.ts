import { describe, it, expect, beforeEach, vi } from 'vitest'
import { 
  HookRegistry, 
  globalHookRegistry,
  registerHook, 
  unregisterHook,
  triggerHook 
} from '../src/hooks'

describe('HookRegistry', () => {
  let registry: HookRegistry

  beforeEach(() => {
    registry = new HookRegistry()
  })

  describe('register', () => {
    it('should register a hook', () => {
      registry.register({
        name: 'test',
        event: 'BeforeTool',
        handler: async () => {},
      })
      expect(registry.hasHook('test')).toBe(true)
    })

    it('should sort hooks by order', () => {
      registry.register({ name: 'first', event: 'BeforeTool', handler: async () => {}, order: 2 })
      registry.register({ name: 'second', event: 'BeforeTool', handler: async () => {}, order: 1 })
      
      const hooks = registry.getHooks('BeforeTool')
      expect(hooks[0].name).toBe('second')
      expect(hooks[1].name).toBe('first')
    })
  })

  describe('unregister', () => {
    it('should unregister a hook', () => {
      registry.register({ name: 'test', event: 'BeforeTool', handler: async () => {} })
      expect(registry.unregister('test')).toBe(true)
      expect(registry.hasHook('test')).toBe(false)
    })

    it('should return false for non-existent hook', () => {
      expect(registry.unregister('nonexistent')).toBe(false)
    })
  })

  describe('trigger', () => {
    it('should execute hooks for event', async () => {
      const handler = vi.fn().mockResolvedValue({ modified: true })
      registry.register({ name: 'test', event: 'BeforeTool', handler })
      
      const results = await registry.trigger('BeforeTool', { timestamp: Date.now() })
      
      expect(handler).toHaveBeenCalled()
      expect(results).toHaveLength(1)
      expect(results[0].modified).toBe(true)
    })

    it('should return empty array for no hooks', async () => {
      const results = await registry.trigger('BeforeTool', { timestamp: Date.now() })
      expect(results).toHaveLength(0)
    })

    it('should handle hook errors', async () => {
      registry.register({
        name: 'error',
        event: 'BeforeTool',
        handler: async () => { throw new Error('hook failed') },
      })
      
      const results = await registry.trigger('BeforeTool', { timestamp: Date.now() })
      
      expect(results).toHaveLength(1)
      expect(results[0].error).toBe('hook failed')
    })
  })

  describe('getHooks', () => {
    it('should get hooks for specific event', () => {
      registry.register({ name: 'a', event: 'BeforeTool', handler: async () => {} })
      registry.register({ name: 'b', event: 'AfterTool', handler: async () => {} })
      
      const beforeHooks = registry.getHooks('BeforeTool')
      const afterHooks = registry.getHooks('AfterTool')
      
      expect(beforeHooks).toHaveLength(1)
      expect(afterHooks).toHaveLength(1)
    })

    it('should get all hooks when no event specified', () => {
      registry.register({ name: 'a', event: 'BeforeTool', handler: async () => {} })
      registry.register({ name: 'b', event: 'AfterTool', handler: async () => {} })
      
      const all = registry.getHooks()
      expect(all).toHaveLength(2)
    })
  })

  describe('clear', () => {
    it('should clear all hooks', () => {
      registry.register({ name: 'a', event: 'BeforeTool', handler: async () => {} })
      registry.register({ name: 'b', event: 'AfterTool', handler: async () => {} })
      
      registry.clear()
      
      expect(registry.getHooks()).toHaveLength(0)
    })
  })
})

describe('globalHookRegistry', () => {
  it('should be a HookRegistry instance', () => {
    expect(globalHookRegistry).toBeInstanceOf(HookRegistry)
  })
})

describe('registerHook', () => {
  it('should register a hook to global registry', () => {
    registerHook({ name: 'global-test', event: 'SessionStart', handler: async () => {} })
    expect(globalHookRegistry.hasHook('global-test')).toBe(true)
    globalHookRegistry.unregister('global-test')
  })
})

describe('unregisterHook', () => {
  it('should unregister a hook from global registry', () => {
    registerHook({ name: 'to-remove', event: 'SessionStart', handler: async () => {} })
    expect(unregisterHook('to-remove')).toBe(true)
    expect(globalHookRegistry.hasHook('to-remove')).toBe(false)
  })
})

describe('triggerHook', () => {
  it('should trigger hooks for event', async () => {
    registerHook({
      name: 'trigger-test',
      event: 'SessionStart',
      handler: async () => ({ output: 'triggered' }),
    })
    
    const results = await triggerHook('SessionStart')
    
    expect(results).toHaveLength(1)
    expect(results[0].output).toBe('triggered')
    
    globalHookRegistry.unregister('trigger-test')
  })
})
