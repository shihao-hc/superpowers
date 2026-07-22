/**
 * Compact Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AutoCompaction } from '../auto.js';
import { MicroCompaction } from '../micro.js';
import { SessionCompaction } from '../session.js';
import { CompactTokenBudget } from '../token-budget.js';

describe('AutoCompaction', () => {
  let compactor: AutoCompaction;

  beforeEach(() => {
    compactor = new AutoCompaction({
      enabled: true,
      maxTokens: 8000,
      minTokensToCompact: 2000,
      autoCompactBufferTokens: 13000,
      warningThresholdBuffer: 20000,
      errorThresholdBuffer: 20000,
      postCompactTokenBudget: 50000,
      maxTokensPerFile: 5000,
      maxTokensPerSkill: 5000,
      skillsTokenBudget: 25000
    });
  });

  it('should detect when compaction is needed', () => {
    expect(compactor.shouldCompact(10000, 1)).toBe(true);
    expect(compactor.shouldCompact(5000, 1)).toBe(false);
  });

  it('should track last compact turn', () => {
    compactor.shouldCompact(15000, 1);
    expect(compactor.getLastCompactTurn()).toBe(1);
  });
});

describe('MicroCompaction', () => {
  let compactor: MicroCompaction;

  beforeEach(() => {
    compactor = new MicroCompaction();
  });

  it('should compact messages', () => {
    const messages = Array(100).fill(null).map((_, i) => ({
      role: 'user' as const,
      content: `Message ${i}`
    }));

    const result = compactor.compact(messages);
    expect(result.removedCount).toBeGreaterThan(0);
    expect(result.messages.length).toBeLessThan(messages.length);
  });

  it('should preserve last N messages', () => {
    const messages = Array(20).fill(null).map((_, i) => ({
      role: 'user' as const,
      content: `Message ${i}`
    }));

    const result = compactor.compact(messages);
    expect(result.messages.length).toBeGreaterThanOrEqual(5);
  });
});

describe('SessionCompaction', () => {
  let compactor: SessionCompaction;

  beforeEach(() => {
    compactor = new SessionCompaction();
  });

  it('should compact session', async () => {
    const messages = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there!' },
      { role: 'user' as const, content: 'Help me' }
    ];

    const result = await compactor.compact('session-1', messages);
    expect(result.memory).toBeDefined();
    expect(result.memory.sessionId).toBe('session-1');
  });

  it('should get existing memory', async () => {
    const messages = [{ role: 'user' as const, content: 'Test' }];
    await compactor.compact('session-2', messages);

    const memory = compactor.getMemory('session-2');
    expect(memory).toBeDefined();
    expect(memory?.sessionId).toBe('session-2');
  });
});

describe('CompactTokenBudget', () => {
  let budget: CompactTokenBudget;

  beforeEach(() => {
    budget = new CompactTokenBudget({
      maxTokens: 10000,
      warningThreshold: 0.8,
      criticalThreshold: 0.95,
      autoCompactThreshold: 0.7
    });
  });

  it('should track usage', () => {
    budget.set(5000);
    const usage = budget.getUsage();
    expect(usage.current).toBe(5000);
    expect(usage.percentage).toBe(0.5);
  });

  it('should detect warning threshold', () => {
    const warnings: number[] = [];
    budget.on('warning', () => warnings.push(budget.getUsage().percentage));

    budget.set(8500);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('should detect critical threshold', () => {
    const critical: number[] = [];
    budget.on('critical', () => critical.push(budget.getUsage().percentage));

    budget.set(9600);
    expect(critical.length).toBeGreaterThan(0);
  });

  it('should indicate when compaction is needed', () => {
    budget.set(8000);
    expect(budget.shouldCompact()).toBe(true);

    budget.set(3000);
    expect(budget.shouldCompact()).toBe(false);
  });
});
