/**
 * Tools Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../registry.js';
import { ToolExecutor } from '../executor.js';
import { SchemaValidator } from '../schemas.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register tools', () => {
    registry.register({
      name: 'test-tool',
      description: 'A test tool',
      inputSchema: {},
      isEnabled: () => true,
      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      call: async () => 'result'
    });

    expect(registry.has('test-tool')).toBe(true);
  });

  it('should get registered tools', () => {
    registry.register({
      name: 'get-test',
      description: 'Test get',
      inputSchema: {},
      isEnabled: () => true,
      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      call: async () => 'result'
    });

    const tool = registry.get('get-test');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('get-test');
  });

  it('should enable and disable tools', () => {
    registry.register({
      name: 'toggle-test',
      description: 'Test toggle',
      inputSchema: {},
      isEnabled: () => true,
      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      call: async () => 'result'
    });

    expect(registry.isEnabled('toggle-test')).toBe(true);
    registry.disable('toggle-test');
    expect(registry.isEnabled('toggle-test')).toBe(false);
  });

  it('should filter tools', () => {
    registry.register({
      name: 'read-tool',
      description: 'Read file',
      inputSchema: {},
      isEnabled: () => true,
      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      call: async () => 'result'
    });

    const readOnly = registry.filter(tool => tool.isReadOnly({}));
    expect(readOnly.length).toBeGreaterThan(0);
  });
});

describe('ToolExecutor', () => {
  let executor: ToolExecutor;

  beforeEach(() => {
    executor = new ToolExecutor(3);
  });

  it('should execute single tool', async () => {
    const results = await executor.execute([{
      tool: {
        name: 'exec-test',
        description: 'Test execution',
        inputSchema: {},
        isEnabled: () => true,
        isConcurrencySafe: () => true,
        isReadOnly: () => true,
        call: async () => 'executed'
      },
      input: {},
      context: {}
    }]);

    expect(results[0].success).toBe(true);
    expect(results[0].result).toBe('executed');
  });

  it('should handle errors', async () => {
    const results = await executor.execute([{
      tool: {
        name: 'error-test',
        description: 'Test error',
        inputSchema: {},
        isEnabled: () => true,
        isConcurrencySafe: () => true,
        isReadOnly: () => true,
        call: async () => { throw new Error('Test error'); }
      },
      input: {},
      context: {}
    }]);

    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('Test error');
  });
});

describe('SchemaValidator', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  it('should validate string type', () => {
    const result = validator.validate('hello', { type: 'string' });
    expect(result.valid).toBe(true);
  });

  it('should reject wrong type', () => {
    const result = validator.validate(123, { type: 'string' });
    expect(result.valid).toBe(false);
  });

  it('should validate enum', () => {
    const result = validator.validate('red', { type: 'string', enum: ['red', 'green', 'blue'] });
    expect(result.valid).toBe(true);
  });

  it('should validate minimum', () => {
    const result = validator.validate(5, { type: 'number', minimum: 10 });
    expect(result.valid).toBe(false);
  });

  it('should validate object properties', () => {
    const result = validator.validate(
      { name: 'test', age: 25 },
      {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        },
        required: ['name']
      }
    );
    expect(result.valid).toBe(true);
  });
});
