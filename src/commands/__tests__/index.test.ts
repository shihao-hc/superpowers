/**
 * Commands Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CommandRegistry } from '../registry.js';
import { CommandParser } from '../parser.js';

describe('CommandRegistry', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  it('should register commands', () => {
    registry.register({
      name: 'test',
      description: 'Test command',
      priority: 10,
      patterns: [/^\/test/],
      execute: async () => ({ success: true })
    });

    expect(registry.has('test')).toBe(true);
  });

  it('should get registered commands', () => {
    registry.register({
      name: 'get-test',
      description: 'Get test',
      priority: 10,
      patterns: [/^\/get-test/],
      execute: async () => ({ success: true })
    });

    const cmd = registry.get('get-test');
    expect(cmd).toBeDefined();
    expect(cmd?.name).toBe('get-test');
  });

  it('should match commands by input', () => {
    registry.register({
      name: 'match-test',
      description: 'Match test',
      priority: 10,
      patterns: [/^\/match-test/],
      execute: async () => ({ success: true })
    });

    const cmd = registry.match('/match-test arg');
    expect(cmd).toBeDefined();
    expect(cmd?.name).toBe('match-test');
  });

  it('should enable and disable commands', () => {
    registry.register({
      name: 'toggle-test',
      description: 'Toggle test',
      priority: 10,
      patterns: [/^\/toggle-test/],
      execute: async () => ({ success: true })
    });

    expect(registry.isEnabled('toggle-test')).toBe(true);
    registry.disable('toggle-test');
    expect(registry.isEnabled('toggle-test')).toBe(false);
  });
});

describe('CommandParser', () => {
  let parser: CommandParser;

  beforeEach(() => {
    parser = new CommandParser();
  });

  it('should parse simple command', () => {
    const result = parser.parse('/test arg1 arg2');
    expect(result.name).toBe('test');
    expect(result.args).toEqual(['arg1', 'arg2']);
  });

  it('should parse flags', () => {
    const result = parser.parse('/test --flag value -x');
    expect(result.flags['flag']).toBe('value');
    expect(result.flags['x']).toBe(true);
  });

  it('should parse quoted arguments', () => {
    const result = parser.parse('/test "hello world"');
    expect(result.args[0]).toBe('hello world');
  });

  it('should handle raw text without slash', () => {
    const result = parser.parse('hello world');
    expect(result.name).toBe('');
    expect(result.raw).toBe('hello world');
  });

  it('should validate arguments', () => {
    const result = parser.validateArgs(['arg1', 'arg2'], {
      minArgs: 2,
      maxArgs: 2
    });
    expect(result.valid).toBe(true);
  });

  it('should fail validation for missing args', () => {
    const result = parser.validateArgs(['arg1'], {
      minArgs: 2
    });
    expect(result.valid).toBe(false);
  });
});
