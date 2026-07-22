import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  log,
  debug,
  info,
  warn,
  error,
  getInMemoryLogs,
  getInMemoryErrors,
  clearInMemoryLogs,
  clearInMemoryErrors,
  subscribe,
  setMinLogLevel,
} from '../src/utils/log.js'

describe('Log Utils', () => {
  beforeEach(() => {
    clearInMemoryLogs()
    clearInMemoryErrors()
    setMinLogLevel('debug')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('log levels', () => {
    it('should log debug messages', () => {
      log('debug message', 'debug')
      const logs = getInMemoryLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe('debug')
      expect(logs[0].message).toBe('debug message')
    })

    it('should log info messages', () => {
      info('info message')
      const logs = getInMemoryLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe('info')
    })

    it('should log warn messages', () => {
      warn('warning message')
      const logs = getInMemoryLogs('warn')
      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe('warn')
    })

    it('should log error messages', () => {
      error('error message')
      const logs = getInMemoryLogs('error')
      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe('error')
    })

    it('should add errors to in-memory error log', () => {
      error('error message')
      const errors = getInMemoryErrors()
      expect(errors).toHaveLength(1)
      expect(errors[0].error).toContain('error message')
    })
  })

  describe('log filtering', () => {
    it('should filter by minimum log level', () => {
      setMinLogLevel('error')

      log('debug', 'debug')
      log('info', 'info')
      log('warn', 'warn')
      log('error', 'error')

      const logs = getInMemoryLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe('error')
    })
  })

  describe('subscribe', () => {
    it('should notify subscribers of new logs', () => {
      const listener = vi.fn()
      subscribe(listener)

      log('test message', 'info')

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'test message',
        }),
      )
    })

    it('should return unsubscribe function', () => {
      const listener = vi.fn()
      const unsubscribe = subscribe(listener)
      unsubscribe()

      log('test', 'info')
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('timestamp', () => {
    it('should include timestamp in log entry', () => {
      const before = Date.now()
      log('test', 'info')
      const after = Date.now()

      const logs = getInMemoryLogs()
      expect(logs[0].timestamp).toBeGreaterThanOrEqual(before)
      expect(logs[0].timestamp).toBeLessThanOrEqual(after)
    })
  })
})

describe('Error Utils', () => {
  it('should convert unknown to Error', async () => {
    const { toError } = await import('../src/utils/errors.js')
    
    expect(toError(new Error('test')).message).toBe('test')
    expect(toError('string error').message).toBe('string error')
    expect(toError({ message: 'obj' } as any).message).toBe('[object Object]')
  })

  it('should extract error message', async () => {
    const { errorMessage } = await import('../src/utils/errors.js')
    
    expect(errorMessage(new Error('test'))).toBe('test')
    expect(errorMessage('string')).toBe('string')
  })

  it('should get errno code', async () => {
    const { getErrnoCode } = await import('../src/utils/errors.js')
    
    const err = { code: 'ENOENT' } as any
    expect(getErrnoCode(err)).toBe('ENOENT')
    expect(getErrnoCode(new Error('test'))).toBeUndefined()
  })

  it('should check if ENOENT', async () => {
    const { isENOENT } = await import('../src/utils/errors.js')
    
    expect(isENOENT({ code: 'ENOENT' } as any)).toBe(true)
    expect(isENOENT({ code: 'EACCES' } as any)).toBe(false)
  })
})
