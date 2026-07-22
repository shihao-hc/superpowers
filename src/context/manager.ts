/**
 * Context Manager - 上下文管理器
 * 
 * 管理对话上下文和 Token 预算
 */

export interface TokenBudget {
  total: number;
  used: number;
  remaining: number;
}

export interface ContextWindow {
  maxTokens: number;
  currentTokens: number;
  systemPromptTokens: number;
  messagesTokens: number;
}

export interface ModelLimits {
  maxTokens: number;
  contextWindow: number;
  supportsVision: boolean;
  supportsThinking: boolean;
}

const MODEL_LIMITS: Record<string, ModelLimits> = {
  'claude-opus-4': { maxTokens: 4096, contextWindow: 200000, supportsVision: true, supportsThinking: true },
  'claude-sonnet-4': { maxTokens: 8192, contextWindow: 200000, supportsVision: true, supportsThinking: true },
  'claude-3-5-sonnet': { maxTokens: 8192, contextWindow: 200000, supportsVision: true, supportsThinking: true },
  'claude-3-opus': { maxTokens: 4096, contextWindow: 200000, supportsVision: true, supportsThinking: false },
  'claude-3-sonnet': { maxTokens: 8192, contextWindow: 200000, supportsVision: true, supportsThinking: false },
  'claude-3-haiku': { maxTokens: 8192, contextWindow: 200000, supportsVision: true, supportsThinking: false },
};

const AVERAGE_TOKEN_CHARS = 4;

export class ContextManager {
  private budget: TokenBudget;
  private systemPromptTokens: number;
  private messageTokens: number;

  constructor(maxBudget: number = 100000) {
    this.budget = {
      total: maxBudget,
      used: 0,
      remaining: maxBudget,
    };
    this.systemPromptTokens = 0;
    this.messageTokens = 0;
  }

  getBudget(): TokenBudget {
    return { ...this.budget };
  }

  setBudget(total: number): void {
    this.budget.total = total;
    this.budget.remaining = total - this.budget.used;
  }

  setSystemPromptTokens(tokens: number): void {
    this.systemPromptTokens = tokens;
    this.recalculateUsed();
  }

  setMessageTokens(tokens: number): void {
    this.messageTokens = tokens;
    this.recalculateUsed();
  }

  private recalculateUsed(): void {
    this.budget.used = this.systemPromptTokens + this.messageTokens;
    this.budget.remaining = this.budget.total - this.budget.used;
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / AVERAGE_TOKEN_CHARS);
  }

  canAddMessage(tokens: number): boolean {
    return this.budget.remaining - tokens > 0;
  }

  getContextWindow(model: string): ContextWindow {
    const limits = this.getModelLimits(model);
    return {
      maxTokens: limits.maxTokens,
      currentTokens: this.budget.used,
      systemPromptTokens: this.systemPromptTokens,
      messagesTokens: this.messageTokens,
    };
  }

  getModelLimits(model: string): ModelLimits {
    return MODEL_LIMITS[model] || {
      maxTokens: 4096,
      contextWindow: 100000,
      supportsVision: false,
      supportsThinking: false,
    };
  }

  calculateOutputBudget(model: string, reserved: number = 500): number {
    const limits = this.getModelLimits(model);
    const available = this.budget.remaining - reserved;
    return Math.min(limits.maxTokens, available);
  }

  reset(): void {
    this.budget.used = 0;
    this.budget.remaining = this.budget.total;
    this.systemPromptTokens = 0;
    this.messageTokens = 0;
  }

  compact(messages: Array<{ content: string }>): { content: string }[] {
    const usageRatio = this.budget.used / this.budget.total;
    
    if (usageRatio < 0.8) {
      return messages;
    }

    const preserveCount = Math.max(1, Math.ceil(messages.length * 0.2));
    const removedCount = messages.length - preserveCount;
    
    if (removedCount <= 0) {
      return messages;
    }

    const summary = `[Earlier conversation summarized: ${removedCount} messages removed]`;
    
    return [
      { content: 'summarized: ' + summary },
      ...messages.slice(preserveCount)
    ];
  }
}

export const globalContextManager = new ContextManager();

export function createContextManager(maxBudget?: number): ContextManager {
  return new ContextManager(maxBudget);
}
