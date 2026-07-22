import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  CommandRegistry,
  globalCommandRegistry,
  CommandParser,
  CommandExecutor,
  type Command,
  type CommandParams,
  type CommandResult,
} from '../src/commands/index.js'

describe('CommandRegistry', () => {
  let registry: CommandRegistry

  beforeEach(() => {
    registry = new CommandRegistry()
    vi.clearAllMocks()
  })

  describe('register', () => {
    it('should register a command', () => {
      const command: Command = {
        name: 'test',
        description: 'Test command',
        priority: 0,
        patterns: [/^\/test/],
        execute: async () => ({ success: true }),
      }

      registry.register(command)
      expect(registry.get('test')).toBe(command)
    })

    it('should register aliases', () => {
      const command: Command = {
        name: 'test',
        aliases: ['t', 'testing'],
        description: 'Test command',
        priority: 0,
        patterns: [/^\/test/],
        execute: async () => ({ success: true }),
      }

      registry.register(command)

      expect(registry.get('t')).toBe(command)
      expect(registry.get('testing')).toBe(command)
    })

    it('should warn on duplicate registration', () => {
      const command: Command = {
        name: 'test',
        description: 'Test command',
        priority: 0,
        patterns: [/^\/test/],
        execute: async () => ({ success: true }),
      }

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      registry.register(command)
      registry.register(command)

      expect(warnSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('getAll', () => {
    it('should return all registered commands', () => {
      const commands: Command[] = [
        {
          name: 'cmd1',
          description: 'Command 1',
          priority: 0,
          patterns: [/^\/cmd1/],
          execute: async () => ({ success: true }),
        },
        {
          name: 'cmd2',
          description: 'Command 2',
          priority: 0,
          patterns: [/^\/cmd2/],
          execute: async () => ({ success: true }),
        },
      ]

      registry.registerMany(commands)
      const initialCount = registry.getAll().length
      registry.registerMany(commands)
      expect(registry.getAll().length).toBeGreaterThanOrEqual(2)
    })

    it('should exclude pattern-based entries', () => {
      const command: Command = {
        name: 'test',
        description: 'Test',
        priority: 0,
        patterns: [/^\/test/],
        execute: async () => ({ success: true }),
      }

      registry.register(command)
      const all = registry.getAll()
      expect(all.every(c => !c.name.startsWith('pattern:'))).toBe(true)
    })
  })

  describe('match', () => {
    it('should match by pattern', () => {
      const command: Command = {
        name: 'test',
        description: 'Test',
        priority: 0,
        patterns: [/^\/test\s+(.+)/],
        execute: async () => ({ success: true }),
      }

      registry.register(command)
      expect(registry.match('/test arg')).toBe(command)
    })

    it('should match by name prefix', () => {
      const command: Command = {
        name: 'test',
        description: 'Test',
        priority: 0,
        patterns: [/^\/test/],
        execute: async () => ({ success: true }),
      }

      registry.register(command)
      expect(registry.match('/test')).toBe(command)
    })

    it('should match by alias', () => {
      const command: Command = {
        name: 'test',
        aliases: ['t'],
        description: 'Test',
        priority: 0,
        patterns: [/^\/test/],
        execute: async () => ({ success: true }),
      }

      registry.register(command)
      expect(registry.match('/t')).toBe(command)
    })

    it('should match by shouldTrigger', () => {
      const command: Command = {
        name: 'test',
        description: 'Test',
        priority: 0,
        patterns: [],
        shouldTrigger: (input) => input.startsWith('trigger:'),
        execute: async () => ({ success: true }),
      }

      registry.register(command)
      expect(registry.match('trigger:action')).toBe(command)
    })

    it('should return undefined for unknown command', () => {
      expect(registry.match('/unknown')).toBeUndefined()
    })
  })

  describe('search', () => {
    it('should search by name', () => {
      const command: Command = {
        name: 'readFile',
        description: 'Read a file',
        priority: 0,
        patterns: [/^\/read/],
        execute: async () => ({ success: true }),
      }

      registry.register(command)
      const results = registry.search('read')
      expect(results).toContain(command)
    })

    it('should search by description', () => {
      const command: Command = {
        name: 'git',
        description: 'Git operations',
        priority: 0,
        patterns: [/^\/git/],
        execute: async () => ({ success: true }),
      }

      registry.register(command)
      const results = registry.search('git operations')
      expect(results).toContain(command)
    })

    it('should search by alias', () => {
      const command: Command = {
        name: 'commit',
        aliases: ['ci'],
        description: 'Commit changes',
        priority: 0,
        patterns: [/^\/commit/],
        execute: async () => ({ success: true }),
      }

      registry.register(command)
      const results = registry.search('ci')
      expect(results).toContain(command)
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', () => {
      registry.registerMany([
        {
          name: 'stats1',
          description: 'Stats 1',
          priority: 0,
          patterns: [/^\/stats1/],
          execute: async () => ({ success: true }),
        },
        {
          name: 'stats2',
          description: 'Stats 2',
          priority: 0,
          patterns: [/^\/stats2/],
          execute: async () => ({ success: true }),
        },
      ])

      const stats = registry.getStats()
      expect(stats.total).toBeGreaterThanOrEqual(2)
    })
  })
})

describe('CommandParser', () => {
  let parser: CommandParser

  beforeEach(() => {
    parser = new CommandParser()
  })

  describe('parse', () => {
    it('should parse command name', () => {
      const result = parser.parse('/test')
      expect(result.command).toBe('test')
    })

    it('should parse arguments', () => {
      const result = parser.parse('/test arg1 arg2')
      expect(result.args).toEqual(['arg1', 'arg2'])
    })

    it('should parse flags', () => {
      const result = parser.parse('/test --verbose --name=value')
      expect(result.flags.verbose).toBe(true)
      expect(result.flags.name).toBe('value')
    })

    it('should handle quoted arguments', () => {
      const result = parser.parse('/test "hello world"')
      expect(result.args).toContain('hello world')
    })

    it('should handle mixed args and flags', () => {
      const result = parser.parse('/test file.txt --verbose')
      expect(result.args).toContain('file.txt')
      expect(result.flags.verbose).toBe(true)
    })
  })
})

describe('CommandExecutor', () => {
  let executor: CommandExecutor
  let registry: CommandRegistry

  beforeEach(() => {
    registry = new CommandRegistry()
    executor = new CommandExecutor(registry)
  })

  describe('execute', () => {
    it('should execute registered command', async () => {
      const executeFn = vi.fn().mockResolvedValue({ success: true })
      registry.register({
        name: 'test',
        description: 'Test',
        priority: 0,
        patterns: [/^\/test/],
        execute: executeFn,
      })

      const result = await executor.execute('/test arg', {
        workingDirectory: '/tmp',
      })

      expect(result.success).toBe(true)
      expect(executeFn).toHaveBeenCalled()
    })

    it('should return error for unknown command', async () => {
      const result = await executor.execute('/unknown', {
        workingDirectory: '/tmp',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('should return error for empty input', async () => {
      const result = await executor.execute('', {
        workingDirectory: '/tmp',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('No command')
    })

    it('should handle execution errors', async () => {
      registry.register({
        name: 'fail',
        description: 'Fail',
        priority: 0,
        patterns: [/^\/fail/],
        execute: async () => {
          throw new Error('Execution failed')
        },
      })

      const result = await executor.execute('/fail', {
        workingDirectory: '/tmp',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Execution failed')
    })
  })
})

describe('globalCommandRegistry', () => {
  it('should exist', () => {
    expect(globalCommandRegistry).toBeDefined()
  })
})
