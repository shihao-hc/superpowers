/**
 * Compact Token Budget
 * 上下文压缩的 Token 预算管理
 */

import { EventEmitter } from 'events';

export interface CompactBudgetConfig {
  maxTokens: number;
  warningThreshold: number;
  criticalThreshold: number;
  autoCompactThreshold: number;
}

export interface BudgetUsage {
  current: number;
  max: number;
  remaining: number;
  percentage: number;
  status: 'ok' | 'warning' | 'critical';
}

export class CompactTokenBudget extends EventEmitter {
  private config: CompactBudgetConfig;
  private current: number = 0;
  private sessionStart: number = Date.now();

  constructor(config: Partial<CompactBudgetConfig> = {}) {
    super();
    this.config = {
      maxTokens: config.maxTokens || 100000,
      warningThreshold: config.warningThreshold || 0.8,
      criticalThreshold: config.criticalThreshold || 0.95,
      autoCompactThreshold: config.autoCompactThreshold || 0.7
    };
  }

  set(current: number): void {
    this.current = current;
    this.checkThresholds();
  }

  add(amount: number): void {
    this.current += amount;
    this.checkThresholds();
  }

  subtract(amount: number): void {
    this.current = Math.max(0, this.current - amount);
  }

  reset(): void {
    this.current = 0;
    this.sessionStart = Date.now();
    this.emit('reset');
  }

  getUsage(): BudgetUsage {
    const remaining = Math.max(0, this.config.maxTokens - this.current);
    const percentage = this.current / this.config.maxTokens;

    let status: 'ok' | 'warning' | 'critical' = 'ok';
    if (percentage >= this.config.criticalThreshold) {
      status = 'critical';
    } else if (percentage >= this.config.warningThreshold) {
      status = 'warning';
    }

    return {
      current: this.current,
      max: this.config.maxTokens,
      remaining,
      percentage,
      status
    };
  }

  shouldCompact(): boolean {
    return this.current / this.config.maxTokens >= this.config.autoCompactThreshold;
  }

  canAdd(amount: number): boolean {
    return (this.current + amount) <= this.config.maxTokens;
  }

  getConfig(): CompactBudgetConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<CompactBudgetConfig>): void {
    Object.assign(this.config, updates);
  }

  private checkThresholds(): void {
    const usage = this.getUsage();

    if (usage.status === 'critical') {
      this.emit('critical', usage);
    } else if (usage.status === 'warning') {
      this.emit('warning', usage);
    }

    this.emit('update', usage);
  }

  getSessionDuration(): number {
    return Date.now() - this.sessionStart;
  }

  static fromPercentage(percentage: number, maxTokens: number): CompactTokenBudget {
    const budget = new CompactTokenBudget({ maxTokens });
    budget.set(Math.floor(maxTokens * percentage));
    return budget;
  }
}

export interface TokenBudgetSnapshot {
  current: number;
  max: number;
  timestamp: number;
}

export class TokenBudgetHistory {
  private snapshots: TokenBudgetSnapshot[] = [];
  private maxSnapshots: number = 100;

  addSnapshot(usage: BudgetUsage): void {
    this.snapshots.push({
      current: usage.current,
      max: usage.max,
      timestamp: Date.now()
    });

    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  getSnapshots(): TokenBudgetSnapshot[] {
    return [...this.snapshots];
  }

  getAverageUsage(): number {
    if (this.snapshots.length === 0) return 0;
    const sum = this.snapshots.reduce((acc, s) => acc + s.current, 0);
    return sum / this.snapshots.length;
  }

  getPeakUsage(): number {
    if (this.snapshots.length === 0) return 0;
    return Math.max(...this.snapshots.map(s => s.current));
  }

  clear(): void {
    this.snapshots = [];
  }
}

export const defaultCompactBudgetConfig: CompactBudgetConfig = {
  maxTokens: 100000,
  warningThreshold: 0.8,
  criticalThreshold: 0.95,
  autoCompactThreshold: 0.7
};
