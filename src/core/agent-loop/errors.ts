/**
 * Agent Error Types and Handling
 * 基于 Claude Code 错误恢复架构
 */

export class AgentError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = true,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export class ModelError extends AgentError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'MODEL_ERROR', true, context);
    this.name = 'ModelError';
  }
}

export class TokenBudgetExceededError extends AgentError {
  constructor(
    message: string,
    public preCompactTokens: number,
    public postCompactTokens?: number,
    context?: Record<string, unknown>
  ) {
    super(message, 'TOKEN_BUDGET_EXCEEDED', false, context);
    this.name = 'TokenBudgetExceededError';
  }
}

export class ToolExecutionError extends AgentError {
  constructor(
    message: string,
    public toolName: string,
    public toolInput: unknown,
    context?: Record<string, unknown>
  ) {
    super(message, 'TOOL_EXECUTION_ERROR', true, context);
    this.name = 'ToolExecutionError';
  }
}

export class PermissionError extends AgentError {
  constructor(
    message: string,
    public toolName: string,
    public decision: PermissionDecision,
    context?: Record<string, unknown>
  ) {
    super(message, 'PERMISSION_ERROR', false, context);
    this.name = 'PermissionError';
  }
}

export class ContextOverflowError extends AgentError {
  constructor(
    message: string,
    public currentTokens: number,
    public maxTokens: number,
    context?: Record<string, unknown>
  ) {
    super(message, 'CONTEXT_OVERFLOW', false, context);
    this.name = 'ContextOverflowError';
  }
}

export class CompactionError extends AgentError {
  constructor(
    message: string,
    public compactionType: 'auto' | 'micro' | 'partial' | 'session',
    context?: Record<string, unknown>
  ) {
    super(message, 'COMPACTION_ERROR', true, context);
    this.name = 'CompactionError';
  }
}

export class FallbackTriggeredError extends AgentError {
  constructor(
    message: string,
    public originalError: Error,
    public fallbackModel?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'FALLBACK_TRIGGERED', true, context);
    this.name = 'FallbackTriggeredError';
  }
}

export type PermissionDecision = 'allow' | 'deny' | 'ask' | 'pause' | 'bypass';

export interface ErrorContext {
  sessionId?: string;
  turnCount?: number;
  model?: string;
  toolName?: string;
  timestamp?: number;
  previousErrors?: Error[];
}

export interface ErrorRecoveryStrategy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export const DEFAULT_RECOVERY_STRATEGY: ErrorRecoveryStrategy = {
  maxRetries: 3,
  baseDelay: 100,
  maxDelay: 5000,
  backoffMultiplier: 2,
  retryableErrors: [
    'MODEL_ERROR',
    'TOOL_EXECUTION_ERROR',
    'COMPACTION_ERROR',
    'NETWORK_ERROR',
    'TIMEOUT'
  ]
};

export class ErrorHandler {
  private strategy: ErrorRecoveryStrategy;

  constructor(strategy: ErrorRecoveryStrategy = DEFAULT_RECOVERY_STRATEGY) {
    this.strategy = strategy;
  }

  isRetryable(error: Error): boolean {
    if (error instanceof AgentError) {
      return this.strategy.retryableErrors.includes(error.code);
    }
    return false;
  }

  shouldRecover(error: Error, attempt: number): boolean {
    if (attempt >= this.strategy.maxRetries) {
      return false;
    }
    return this.isRetryable(error);
  }

  getRetryDelay(attempt: number): number {
    const delay = this.strategy.baseDelay * Math.pow(this.strategy.backoffMultiplier, attempt);
    return Math.min(delay, this.strategy.maxDelay);
  }

  wrapError(error: Error, context: ErrorContext): AgentError {
    if (error instanceof AgentError) {
      return error;
    }

    const code = this.classifyError(error);
    return new AgentError(
      error.message,
      code,
      this.strategy.retryableErrors.includes(code),
      context
    );
  }

  private classifyError(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('model') || message.includes('api')) {
      return 'MODEL_ERROR';
    }
    if (message.includes('token') || message.includes('context')) {
      return 'TOKEN_BUDGET_EXCEEDED';
    }
    if (message.includes('tool') || message.includes('execute')) {
      return 'TOOL_EXECUTION_ERROR';
    }
    if (message.includes('permission') || message.includes('denied')) {
      return 'PERMISSION_ERROR';
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'NETWORK_ERROR';
    }
    
    return 'UNKNOWN_ERROR';
  }

  formatError(error: Error): ErrorReport {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: Date.now(),
      context: error instanceof AgentError ? error.context : undefined,
      code: error instanceof AgentError ? error.code : undefined,
      recoverable: error instanceof AgentError ? error.recoverable : false
    };
  }
}

export interface ErrorReport {
  name: string;
  message: string;
  stack?: string;
  timestamp: number;
  context?: Record<string, unknown>;
  code?: string;
  recoverable: boolean;
}

export const globalErrorHandler = new ErrorHandler();
