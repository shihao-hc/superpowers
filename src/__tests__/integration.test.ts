/**
 * Integration Tests for OpenCode Core Modules
 * 测试 Agent 循环、工具系统、权限系统、上下文压缩、Plugin 系统和特性开关
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentLoop } from '../core/agent-loop/index.js';
import { TokenBudget } from '../core/agent-loop/token-budget.js';
import { ErrorRecovery } from '../core/agent-loop/recovery.js';
import type { AgentConfig, Message, ToolCall } from '../core/agent-loop/types.js';
import { CompactService } from '../core/compact/index.js';
import { PermissionService } from '../core/permissions/index.js';
import { ToolRegistry } from '../core/tools/index.js';
import { PluginManager } from '../plugins/index.js';
import { FeatureFlags } from '../features/index.js';

describe('TokenBudget', () => {
  let budget: TokenBudget;

  beforeEach(() => {
    budget = new TokenBudget({
      maxTokens: 10000,
      warningThreshold: 0.8,
      criticalThreshold: 0.95
    });
  });

  it('should track token usage', () => {
    budget.trackUsage(500, 'input');
    expect(budget.getUsage().input).toBe(500);
    expect(budget.getUsage().output).toBe(0);
    expect(budget.getUsage().total).toBe(500);
  });

  it('should warn at threshold', () => {
    const warnSpy = vi.fn();
    budget.on('warning', warnSpy);
    
    budget.trackUsage(8500, 'input');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('should stop at limit', () => {
    const stopSpy = vi.fn();
    budget.on('stop', stopSpy);
    
    budget.trackUsage(10000, 'input');
    expect(stopSpy).toHaveBeenCalled();
    expect(budget.isExceeded()).toBe(true);
  });

  it('should reset correctly', () => {
    budget.trackUsage(5000, 'input');
    budget.reset();
    expect(budget.getUsage().total).toBe(0);
  });
});

describe('ErrorRecovery', () => {
  let recovery: ErrorRecovery;

  beforeEach(() => {
    recovery = new ErrorRecovery({
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 1000
    });
  });

  it('should retry failed operations', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) throw new Error('Temporary failure');
      return 'success';
    });

    const result = await recovery.execute(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should stop after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Permanent failure'));
    
    await expect(recovery.execute(fn)).rejects.toThrow('Permanent failure');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('should apply exponential backoff', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Retry'));
    const startTime = Date.now();
    
    try {
      await recovery.execute(fn);
    } catch {
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThan(100);
    }
  });
});

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager({
      basePath: process.cwd(),
      useSandbox: false
    });
  });

  afterEach(async () => {
    await manager.destroyAll();
  });

  it('should register plugins', async () => {
    await manager.loadPlugin({
      name: 'test-plugin',
      path: './plugins/test',
      enabled: true
    });

    expect(manager.getPlugin('test-plugin')).toBeDefined();
  });

  it('should track plugin lifecycle', async () => {
    const loadedSpy = vi.fn();
    manager.on('pluginLoaded', loadedSpy);

    await manager.loadPlugin({
      name: 'lifecycle-test',
      path: './plugins/test'
    });

    expect(loadedSpy).toHaveBeenCalled();
  });

  it('should enable and disable plugins', async () => {
    await manager.loadPlugin({
      name: 'toggle-test',
      path: './plugins/test'
    });

    expect(manager.isEnabled('toggle-test')).toBe(true);
    
    manager.disable('toggle-test');
    expect(manager.isEnabled('toggle-test')).toBe(false);
    
    manager.enable('toggle-test');
    expect(manager.isEnabled('toggle-test')).toBe(true);
  });

  it('should get plugin stats', async () => {
    await manager.loadPlugin({ name: 'stats-1', path: './plugins/test' });
    await manager.loadPlugin({ name: 'stats-2', path: './plugins/test' });

    const stats = manager.getStats();
    expect(stats.total).toBeGreaterThanOrEqual(2);
  });
});

describe('FeatureFlags', () => {
  let features: FeatureFlags;

  beforeEach(() => {
    features = new FeatureFlags();
  });

  it('should register features', () => {
    features.register('TEST_FEATURE', { enabled: true, description: 'Test' });
    expect(features.get('TEST_FEATURE')).toBeDefined();
    expect(features.isEnabled('TEST_FEATURE')).toBe(true);
  });

  it('should enable and disable features', () => {
    features.register('TOGGLE_TEST', { enabled: false });
    expect(features.isEnabled('TOGGLE_TEST')).toBe(false);
    
    features.enable('TOGGLE_TEST');
    expect(features.isEnabled('TOGGLE_TEST')).toBe(true);
    
    features.disable('TOGGLE_TEST');
    expect(features.isEnabled('TOGGLE_TEST')).toBe(false);
  });

  it('should toggle features', () => {
    features.register('TOGGLE', { enabled: false });
    features.toggle('TOGGLE');
    expect(features.isEnabled('TOGGLE')).toBe(true);
    features.toggle('TOGGLE');
    expect(features.isEnabled('TOGGLE')).toBe(false);
  });

  it('should get stats', () => {
    const stats = features.getStats();
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.enabled).toBeGreaterThan(0);
  });

  it('should export and import', () => {
    features.enable('EXPORT_TEST');
    const exported = features.export();
    
    const newFeatures = new FeatureFlags();
    newFeatures.import(exported);
    expect(newFeatures.isEnabled('EXPORT_TEST')).toBe(true);
  });

  it('should evaluate rollout percentage', () => {
    features.register('ROLLOUT', {
      enabled: true,
      rollout: { percentage: 50 }
    });

    let enabledCount = 0;
    for (let i = 0; i < 100; i++) {
      if (features.isEnabled('ROLLOUT', { sessionId: `session-${i}` })) {
        enabledCount++;
      }
    }

    expect(enabledCount).toBeGreaterThan(0);
    expect(enabledCount).toBeLessThan(100);
  });

  it('should call callback if enabled', () => {
    features.enable('CALLBACK_TEST');
    const callback = vi.fn();

    features.ifEnabled('CALLBACK_TEST', callback);
    expect(callback).toHaveBeenCalled();
  });

  it('should not call callback if disabled', () => {
    features.disable('CALLBACK_DISABLED');
    const callback = vi.fn();

    features.ifEnabled('CALLBACK_DISABLED', callback);
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('PermissionService', () => {
  let permissions: PermissionService;

  beforeEach(() => {
    permissions = new PermissionService();
  });

  it('should register permissions', () => {
    permissions.registerPermission({
      id: 'test.read',
      name: 'Test Read',
      description: 'Read test data',
      category: 'data'
    });

    expect(permissions.getPermission('test.read')).toBeDefined();
  });

  it('should grant permissions', () => {
    permissions.registerPermission({
      id: 'grant.test',
      name: 'Grant Test'
    });

    permissions.grant('user-1', 'grant.test');
    expect(permissions.hasPermission('user-1', 'grant.test')).toBe(true);
  });

  it('should revoke permissions', () => {
    permissions.registerPermission({
      id: 'revoke.test',
      name: 'Revoke Test'
    });

    permissions.grant('user-1', 'revoke.test');
    permissions.revoke('user-1', 'revoke.test');
    expect(permissions.hasPermission('user-1', 'revoke.test')).toBe(false);
  });
});

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register tools', () => {
    registry.register({
      name: 'test-tool',
      description: 'A test tool',
      inputSchema: { type: 'object' },
      execute: async () => 'result'
    });

    expect(registry.get('test-tool')).toBeDefined();
  });

  it('should execute tools', async () => {
    registry.register({
      name: 'exec-test',
      inputSchema: { type: 'object' },
      execute: async (input) => `executed: ${JSON.stringify(input)}`
    });

    const result = await registry.execute('exec-test', { data: 'test' });
    expect(result).toBe('executed: {"data":"test"}');
  });

  it('should validate input schema', () => {
    registry.register({
      name: 'schema-test',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        required: ['name']
      },
      execute: async () => 'ok'
    });

    const invalid = registry.validate('schema-test', {});
    expect(invalid.valid).toBe(false);
  });
});

describe('CompactService', () => {
  let compact: CompactService;

  beforeEach(() => {
    compact = new CompactService({
      enabled: true,
      maxTokens: 8000,
      minTokensToCompact: 2000
    });
  });

  it('should detect when compaction is needed', () => {
    expect(compact.shouldCompact(10000)).toBe(true);
    expect(compact.shouldCompact(5000)).toBe(false);
  });

  it('should generate compact plan', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    ];

    const plan = compact.createPlan(messages);
    expect(plan).toBeDefined();
    expect(plan.messages).toBeDefined();
  });
});

describe('AgentLoop Integration', () => {
  it('should initialize with all services', () => {
    const config: AgentConfig = {
      model: 'test-model',
      maxTurns: 10,
      systemPrompt: 'You are a test agent',
      tools: [],
      permissions: []
    };

    const loop = new AgentLoop(config);
    expect(loop).toBeDefined();
    expect(loop.getState()).toBeDefined();
  });
});
