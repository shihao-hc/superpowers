/**
 * Token 预算管理 - 基于 Claude Code 源码
 * 
 * Claude Code 常量参考:
 * - AUTOCOMPACT_BUFFER_TOKENS = 13000
 * - WARNING_THRESHOLD_BUFFER_TOKENS = 20000
 * - ERROR_THRESHOLD_BUFFER_TOKENS = 20000
 * - POST_COMPACT_TOKEN_BUDGET = 50000
 * - MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20000
 */

export interface TokenBudgetConfig {
  total: number;
  warningThreshold?: number;
  errorThreshold?: number;
  outputReserved?: number;
}

export type BudgetStatus = 'ok' | 'warning' | 'error' | 'exceeded';

export class TokenBudget {
  private total: number;
  private used: number = 0;
  private warningThreshold: number;
  private errorThreshold: number;
  private outputReserved: number;

  constructor(config: TokenBudgetConfig) {
    this.total = config.total;
    this.warningThreshold = config.warningThreshold ?? 20000;
    this.errorThreshold = config.errorThreshold ?? 5000;
    this.outputReserved = config.outputReserved ?? 5000;
  }

  /**
   * 分配 Token
   */
  allocate(amount: number): boolean {
    if (this.used + amount > this.total - this.outputReserved) {
      return false;
    }
    this.used += amount;
    return true;
  }

  /**
   * 释放 Token
   */
  release(amount: number): void {
    this.used = Math.max(0, this.used - amount);
  }

  /**
   * 检查是否可以通过
   */
  check(): boolean {
    return this.getRemaining() > this.errorThreshold;
  }

  /**
   * 获取状态
   */
  getStatus(): BudgetStatus {
    const remaining = this.getRemaining();
    
    if (remaining <= 0) return 'exceeded';
    if (remaining < this.errorThreshold) return 'error';
    if (remaining < this.warningThreshold) return 'warning';
    return 'ok';
  }

  /**
   * 获取剩余 Token 数
   */
  getRemaining(): number {
    return this.total - this.used - this.outputReserved;
  }

  /**
   * 获取最大输出 Token 数
   */
  getMaxOutputTokens(): number {
    const remaining = this.getRemaining();
    return Math.min(remaining, 20000); // MAX_OUTPUT_TOKENS_FOR_SUMMARY
  }

  /**
   * 获取使用率
   */
  getUsagePercent(): number {
    return (this.used / this.total) * 100;
  }

  /**
   * 估算消息的 Token 数
   */
  static estimateMessageTokens(message: unknown): number {
    // 简单的估算：1 token ≈ 4 字符
    const content = JSON.stringify(message);
    return Math.ceil(content.length / 4);
  }

  /**
   * 重置预算
   */
  reset(): void {
    this.used = 0;
  }

  /**
   * 设置总量
   */
  setTotal(total: number): void {
    this.total = total;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    used: number;
    remaining: number;
    usagePercent: number;
    status: BudgetStatus;
  } {
    return {
      total: this.total,
      used: this.used,
      remaining: this.getRemaining(),
      usagePercent: this.getUsagePercent(),
      status: this.getStatus(),
    };
  }
}

/**
 * 多轮次 Token 追踪
 */
export class MultiTurnBudgetTracker {
  private budgets: TokenBudget[] = [];
  private turnIndex: number = 0;

  constructor(
    private totalBudget: number,
    private maxTurns: number
  ) {
    this.reset();
  }

  /**
   * 获取当前轮次的预算
   */
  getCurrentBudget(): TokenBudget {
    return this.budgets[this.turnIndex];
  }

  /**
   * 移动到下一轮
   */
  nextTurn(): void {
    if (this.turnIndex < this.maxTurns - 1) {
      this.turnIndex++;
      
      // 从剩余预算中分配新轮次
      const remaining = this.getTotalRemaining();
      const perTurnBudget = remaining / (this.maxTurns - this.turnIndex);
      
      this.budgets[this.turnIndex] = new TokenBudget({
        total: perTurnBudget,
        warningThreshold: perTurnBudget * 0.2,
        errorThreshold: perTurnBudget * 0.05,
      });
    }
  }

  /**
   * 获取总剩余
   */
  getTotalRemaining(): number {
    return this.budgets.reduce((sum, b) => sum + b.getRemaining(), 0);
  }

  /**
   * 检查所有轮次是否都已耗尽
   */
  isExhausted(): boolean {
    return this.turnIndex >= this.maxTurns - 1 && 
           !this.budgets[this.turnIndex].check();
  }

  /**
   * 重置追踪器
   */
  reset(): void {
    this.turnIndex = 0;
    this.budgets = [
      new TokenBudget({
        total: this.totalBudget,
        warningThreshold: this.totalBudget * 0.2,
        errorThreshold: this.totalBudget * 0.05,
      }),
    ];
  }

  /**
   * 获取当前轮次索引
   */
  getTurnIndex(): number {
    return this.turnIndex;
  }

  /**
   * 获取轮次使用情况
   */
  getTurnUsage(): Array<{ turn: number; stats: ReturnType<TokenBudget['getStats']> }> {
    return this.budgets.map((budget, index) => ({
      turn: index,
      stats: budget.getStats(),
    }));
  }
}
