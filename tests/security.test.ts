import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PermissionManager, createPermissionManager, globalPermissionManager } from '../src/security/permissions.js'

describe('PermissionManager', () => {
  let manager: PermissionManager

  beforeEach(() => {
    manager = createPermissionManager()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should create manager with default mode', () => {
      expect(manager.getMode()).toBe('default')
    })

    it('should create manager with custom mode', () => {
      const m = createPermissionManager('acceptEdits')
      expect(m.getMode()).toBe('acceptEdits')
    })

    it('should create manager with custom rules', () => {
      const rules = [{ tool: 'Write', allow: true }]
      const m = createPermissionManager('default', rules)
      expect(m.getRules()).toEqual(rules)
    })
  })

  describe('setMode', () => {
    it('should update permission mode', () => {
      manager.setMode('bypassPermissions')
      expect(manager.getMode()).toBe('bypassPermissions')
    })
  })

  describe('rules', () => {
    it('should add rule', () => {
      manager.addRule({ tool: 'Bash', allow: true })
      expect(manager.getRules()).toHaveLength(1)
    })

    it('should set rules', () => {
      const rules = [{ tool: 'Read', allow: true }]
      manager.setRules(rules)
      expect(manager.getRules()).toEqual(rules)
    })
  })

  describe('checkPermission', () => {
    it('should allow in bypassPermissions mode', () => {
      manager.setMode('bypassPermissions')
      const decision = manager.checkPermission('Write')
      expect(decision.behavior).toBe('allow')
    })

    it('should deny file modifications in plan mode', () => {
      manager.setMode('plan')
      const decision = manager.checkPermission('Write')
      expect(decision.behavior).toBe('deny')
    })

    it('should allow file modifications in acceptEdits mode', () => {
      manager.setMode('acceptEdits')
      const decision = manager.checkPermission('Write')
      expect(decision.behavior).toBe('allow')
    })

    it('should deny in dontAsk mode', () => {
      manager.setMode('dontAsk')
      const decision = manager.checkPermission('Bash')
      expect(decision.behavior).toBe('deny')
    })

    it('should respect allow rules', () => {
      manager.addRule({ tool: 'Bash', allow: true })
      const decision = manager.checkPermission('Bash')
      expect(decision.behavior).toBe('allow')
      expect(decision.reason).toBe('rule:allow')
    })

    it('should respect deny rules', () => {
      manager.addRule({ tool: 'Bash', deny: true })
      const decision = manager.checkPermission('Bash')
      expect(decision.behavior).toBe('deny')
      expect(decision.reason).toBe('rule:deny')
    })

    it('should return passthrough for default mode without rules', () => {
      const decision = manager.checkPermission('Read')
      expect(decision.behavior).toBe('passthrough')
    })
  })

  describe('validatePath', () => {
    it('should allow safe paths', () => {
      const result = manager.validatePath('/home/user/file.txt', '/home/user')
      expect(result.valid).toBe(true)
    })

    it('should reject path traversal', () => {
      const result = manager.validatePath('../../etc/passwd', '/home/user')
      expect(result.valid).toBe(false)
    })

    it('should reject UNC paths', () => {
      const result = manager.validatePath('\\\\server\\share', '/home/user')
      expect(result.valid).toBe(false)
    })

    it('should reject system directories', () => {
      const result = manager.validatePath('/etc/passwd', '/home/user')
      expect(result.valid).toBe(false)
    })
  })

  describe('sanitizeInput', () => {
    it('should remove control characters', () => {
      const result = manager.sanitizeInput('hello\x00world')
      expect(result).toBe('helloworld')
    })

    it('should remove zero-width characters', () => {
      const result = manager.sanitizeInput('hello\u200Bworld')
      expect(result).toBe('helloworld')
    })
  })

  describe('validateCommand', () => {
    it('should allow safe commands', () => {
      const result = manager.validateCommand('ls -la')
      expect(result.valid).toBe(true)
    })

    it('should reject dangerous rm commands', () => {
      const result = manager.validateCommand('rm -rf /')
      expect(result.valid).toBe(false)
    })

    it('should reject device writes', () => {
      const result = manager.validateCommand('dd if=/dev/zero of=/dev/null')
      expect(result.valid).toBe(false)
    })
  })

  describe('subscribe', () => {
    it('should notify subscribers', () => {
      const listener = vi.fn()
      manager.subscribe(listener)
      manager.checkPermission('Write')
      expect(listener).toHaveBeenCalled()
    })

    it('should return unsubscribe function', () => {
      const listener = vi.fn()
      const unsubscribe = manager.subscribe(listener)
      unsubscribe()
      manager.checkPermission('Write')
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('globalPermissionManager', () => {
    it('should be instance of PermissionManager', () => {
      expect(globalPermissionManager).toBeInstanceOf(PermissionManager)
    })
  })
})
