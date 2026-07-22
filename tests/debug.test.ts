import { describe, it, expect, beforeEach } from 'vitest'
import { HookRegistry, globalHookRegistry, registerHook, unregisterHook, triggerHook } from '../src/hooks'

describe('Debug', () => {
  it('should import correctly', () => {
    console.log('HookRegistry:', HookRegistry)
    console.log('typeof HookRegistry:', typeof HookRegistry)
    expect(typeof HookRegistry).toBe('function')
  })

  it('should construct', () => {
    const reg = new HookRegistry()
    expect(reg).toBeDefined()
  })
})