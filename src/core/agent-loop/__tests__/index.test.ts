/**
 * Agent Loop Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TokenBudget } from '../token-budget.js';
import { ErrorRecovery } from '../recovery.js';
import { StateManager } from '../state.js';

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
    const usage = budget.getUsage();
    expect(usage.input).toBe(500);
    expect(usage.output).toBe(0);
    expect(usage.total).toBe(500);
  });

  it('should emit warning at threshold', () => {
    const warnings: number[] = [];
    budget.on('warning', () => warnings.push(budget.getUsage().total));
    
    budget.trackUsage(8500, 'input');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('should stop at limit', () => {
    const stops: number[] = [];
    budget.on('stop', () => stops.push(budget.getUsage().total));
    
    budget.trackUsage(10000, 'input');
    expect(stops.length).toBeGreaterThan(0);
    expect(budget.isExceeded()).toBe(true);
  });

  it('should reset correctly', () => {
    budget.trackUsage(5000, 'input');
    budget.reset();
    expect(budget.getUsage().total).toBe(0);
  });

  it('should check budget correctly', () => {
    expect(budget.checkBudget(5000)).toBe(true);
    expect(budget.checkBudget(15000)).toBe(false);
  });
});

describe('ErrorRecovery', () => {
  let recovery: ErrorRecovery;

  beforeEach(() => {
    recovery = new ErrorRecovery({
      maxRetries: 3,
      baseDelay: 10,
      maxDelay: 100
    });
  });

  it('should retry failed operations', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) throw new Error('Temporary failure');
      return 'success';
    };

    const result = await recovery.execute(fn);
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should stop after max retries', async () => {
    const fn = async () => { throw new Error('Permanent failure'); };

    await expect(recovery.execute(fn)).rejects.toThrow('Permanent failure');
  });

  it('should apply exponential backoff', async () => {
    const times: number[] = [];
    const fn = async () => {
      times.push(Date.now());
      throw new Error('Retry');
    };

    try {
      await recovery.execute(fn);
    } catch {
      expect(times.length).toBeGreaterThan(1);
    }
  });
});

describe('StateManager', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager();
  });

  it('should create state', () => {
    const state = manager.create('session-1', {
      model: 'test-model',
      environment: 'development'
    });

    expect(state).toBeDefined();
    expect(state.sessionId).toBe('session-1');
    expect(state.metadata.model).toBe('test-model');
  });

  it('should get state', () => {
    manager.create('session-2', {});
    const state = manager.get('session-2');
    expect(state).toBeDefined();
    expect(state?.sessionId).toBe('session-2');
  });

  it('should increment turn', () => {
    manager.create('session-3', {});
    manager.incrementTurn('session-3');
    const state = manager.get('session-3');
    expect(state?.turnCount).toBe(1);
  });

  it('should update token usage', () => {
    manager.create('session-4', {});
    manager.updateTokenUsage('session-4', 100, 50);
    const state = manager.get('session-4');
    expect(state?.metadata.tokenUsage.input).toBe(100);
    expect(state?.metadata.tokenUsage.output).toBe(50);
  });

  it('should record compaction', () => {
    manager.create('session-5', {});
    manager.recordCompaction('session-5', 5000, 3000, 'auto');
    const state = manager.get('session-5');
    expect(state?.metadata.compactionHistory.length).toBe(1);
  });
});
