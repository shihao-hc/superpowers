import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConfigManager, globalConfigManager, mergeSettings, getSettingValue } from '../src/config/manager.js'

describe('ConfigManager', () => {
  let manager: ConfigManager

  beforeEach(() => {
    manager = new ConfigManager()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('setSource', () => {
    it('should set source settings', () => {
      manager.setSource('userSettings', { model: 'claude-3-sonnet' })
      expect(manager.getSource('userSettings')).toEqual({ model: 'claude-3-sonnet' })
    })

    it('should invalidate cache on source change', () => {
      manager.setSource('userSettings', { model: 'model-1' })
      manager.getMerged()
      manager.setSource('userSettings', { model: 'model-2' })
      expect(manager.getMerged().model).toBe('model-2')
    })
  })

  describe('getMerged', () => {
    it('should return empty object when no sources', () => {
      expect(manager.getMerged()).toEqual({})
    })

    it('should merge sources by priority', () => {
      manager.setSource('userSettings', { model: 'user-model', temperature: 0.5 })
      manager.setSource('projectSettings', { model: 'project-model', maxTokens: 1000 })
      
      const merged = manager.getMerged()
      expect(merged.model).toBe('project-model')
      expect(merged.temperature).toBe(0.5)
      expect(merged.maxTokens).toBe(1000)
    })

    it('should give higher priority to later sources', () => {
      manager.setSource('userSettings', { model: 'model-1' })
      manager.setSource('projectSettings', { model: 'model-2' })
      manager.setSource('flagSettings', { model: 'model-3' })
      
      expect(manager.getMerged().model).toBe('model-3')
    })
  })

  describe('validate', () => {
    it('should return valid settings without errors', () => {
      manager.setSource('userSettings', { model: 'test' })
      const result = manager.validate()
      expect(result.errors).toHaveLength(0)
    })

    it('should validate settings', () => {
      manager.setSource('userSettings', { model: 'test', temperature: 0.7 })
      const result = manager.validate()
      expect(result.settings.model).toBe('test')
    })
  })

  describe('get', () => {
    it('should get specific setting', () => {
      manager.setSource('userSettings', { model: 'claude-3' })
      expect(manager.get('model')).toBe('claude-3')
    })

    it('should return undefined for missing setting', () => {
      expect(manager.get('model')).toBeUndefined()
    })
  })

  describe('set', () => {
    it('should set setting to localSettings', () => {
      manager.set('model', 'new-model')
      expect(manager.getSource('localSettings')?.model).toBe('new-model')
    })
  })

  describe('subscribe', () => {
    it('should notify subscribers on change', () => {
      const listener = vi.fn()
      manager.subscribe(listener)
      manager.setSource('userSettings', { model: 'test' })
      expect(listener).toHaveBeenCalled()
    })

    it('should return unsubscribe function', () => {
      const listener = vi.fn()
      const unsubscribe = manager.subscribe(listener)
      unsubscribe()
      manager.setSource('userSettings', { model: 'test' })
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('reset', () => {
    it('should clear all sources', () => {
      manager.setSource('userSettings', { model: 'test' })
      manager.setSource('projectSettings', { model: 'test2' })
      manager.reset()
      expect(manager.getAllSources()).toHaveLength(0)
    })
  })

  describe('getAllSources', () => {
    it('should return all configured sources', () => {
      manager.setSource('userSettings', { model: 'test' })
      manager.setSource('projectSettings', { model: 'test2' })
      const sources = manager.getAllSources()
      expect(sources).toContain('userSettings')
      expect(sources).toContain('projectSettings')
    })
  })
})

describe('mergeSettings', () => {
  it('should merge multiple settings objects', () => {
    const result = mergeSettings(
      { model: 'model-1', temperature: 0.5 },
      { model: 'model-2', maxTokens: 1000 },
      { maxTokens: 2000, verbose: true }
    )
    expect(result.model).toBe('model-2')
    expect(result.temperature).toBe(0.5)
    expect(result.maxTokens).toBe(2000)
    expect(result.verbose).toBe(true)
  })

  it('should handle undefined sources', () => {
    const result = mergeSettings({ model: 'test' }, undefined, { verbose: true })
    expect(result.model).toBe('test')
    expect(result.verbose).toBe(true)
  })
})

describe('getSettingValue', () => {
  it('should get value with default', () => {
    expect(getSettingValue({}, 'model', 'default-model')).toBe('default-model')
  })

  it('should get actual value when present', () => {
    expect(getSettingValue({ model: 'actual-model' }, 'model', 'default-model')).toBe('actual-model')
  })
})
