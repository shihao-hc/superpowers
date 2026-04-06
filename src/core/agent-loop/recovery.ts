/**
 * 错误恢复机制 - 基于 Claude Code 源码
 * 
 * 支持的错误类型:
 * - FallbackTriggeredError: 备用模型切换
 * - prompt_too_long: 上下文超限
 * - max_output_tokens: 输出超限
 * - model_error: 模型错误
 */

import type { LoopState } from './types.js';

export interface ErrorRecoveryConfig {
  enable: boolean;
  fallbackModel?: string;
  maxRetries?: number;
  retryDelay?: number;
}

export interface RecoveryResult {
  shouldRetry: boolean;
  newModel?: string;
  recovered?: boolean;
  action?: RecoveryAction;
  error?: Error;
}

export type RecoveryAction = 
  | 'retry'
  | 'switch_model'
  | 'compact'
  | 'fail';

export type RecoverableError = 
  | FallbackTriggeredError
  | PromptTooLongError
  | MaxOutputTokensError
  | ModelError
  | RateLimitError
  | NetworkError;

export class FallbackTriggeredError extends Error {
  constructor(
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'FallbackTriggeredError';
  }
}

export class PromptTooLongError extends Error {
  constructor(
    message: string,
    public tokenCount?: number,
    public maxTokens?: number
  ) {
    super(message);
    this.name = 'PromptTooLongError';
  }
}

export class MaxOutputTokensError extends Error {
  constructor(
    message: string,
    public outputTokens?: number
  ) {
    super(message);
    this.name = 'MaxOutputTokensError';
  }
}

export class ModelError extends Error {
  constructor(
    message: string,
    public model?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'ModelError';
  }
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ErrorRecovery {
  private retryCount: Map<string, number> = new Map();
  private config: Required<ErrorRecoveryConfig>;

  constructor(config: ErrorRecoveryConfig) {
    this.config = {
      enable: config.enable ?? true,
      fallbackModel: config.fallbackModel ?? 'claude-3-haiku',
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
    };
  }

  /**
   * 处理错误并返回恢复策略
   */
  async handle(
    error: Error,
    state: LoopState
  ): Promise<RecoveryResult> {
    if (!this.config.enable) {
      return { shouldRetry: false, error };
    }

    // 分类错误
    const errorType = this.classifyError(error);
    
    switch (errorType) {
      case 'fallback':
        return this.handleFallback(error as FallbackTriggeredError, state);
      
      case 'prompt_too_long':
        return this.handlePromptTooLong(error as PromptTooLongError, state);
      
      case 'max_output_tokens':
        return this.handleMaxOutputTokens(error as MaxOutputTokensError, state);
      
      case 'rate_limit':
        return this.handleRateLimit(error as RateLimitError);
      
      case 'network':
        return this.handleNetwork(error as NetworkError);
      
      case 'model':
        return this.handleModelError(error as ModelError, state);
      
      default:
        return this.handleGenericError(error);
    }
  }

  /**
   * 错误分类
   */
  private classifyError(error: Error): string {
    const name = error.constructor.name;
    const message = error.message.toLowerCase();
    
    if (name === 'FallbackTriggeredError' || message.includes('fallback')) {
      return 'fallback';
    }
    if (name === 'PromptTooLongError' || message.includes('prompt_too_long') || message.includes('too long')) {
      return 'prompt_too_long';
    }
    if (name === 'MaxOutputTokensError' || message.includes('max_output_tokens') || message.includes('output limit')) {
      return 'max_output_tokens';
    }
    if (name === 'RateLimitError' || message.includes('rate limit') || message.includes('429')) {
      return 'rate_limit';
    }
    if (name === 'NetworkError' || message.includes('network') || message.includes('connection')) {
      return 'network';
    }
    if (name === 'ModelError' || message.includes('model') || message.includes('api')) {
      return 'model';
    }
    
    return 'unknown';
  }

  /**
   * 处理 Fallback 错误
   */
  private handleFallback(
    error: FallbackTriggeredError,
    state: LoopState
  ): RecoveryResult {
    if (!this.config.fallbackModel) {
      return { shouldRetry: false, error, action: 'fail' };
    }

    return {
      shouldRetry: true,
      newModel: this.config.fallbackModel,
      action: 'switch_model',
      recovered: true,
    };
  }

  /**
   * 处理上下文超限
   */
  private handlePromptTooLong(
    error: PromptTooLongError,
    state: LoopState
  ): RecoveryResult {
    const key = 'prompt_too_long';
    const count = (this.retryCount.get(key) ?? 0) + 1;
    this.retryCount.set(key, count);

    if (count >= this.config.maxRetries) {
      return { 
        shouldRetry: false, 
        error,
        action: 'fail',
        recovered: false,
      };
    }

    return {
      shouldRetry: true,
      action: 'compact',
      recovered: false,
    };
  }

  /**
   * 处理输出超限
   */
  private handleMaxOutputTokens(
    error: MaxOutputTokensError,
    state: LoopState
  ): RecoveryResult {
    return {
      shouldRetry: true,
      action: 'retry',
      recovered: true,
    };
  }

  /**
   * 处理速率限制
   */
  private async handleRateLimit(error: RateLimitError): Promise<RecoveryResult> {
    const delay = error.retryAfter ?? this.config.retryDelay;
    
    // 等待后重试
    await this.delay(delay);
    
    return {
      shouldRetry: true,
      action: 'retry',
      recovered: true,
    };
  }

  /**
   * 处理网络错误
   */
  private handleNetwork(error: NetworkError): RecoveryResult {
    const key = 'network';
    const count = (this.retryCount.get(key) ?? 0) + 1;
    this.retryCount.set(key, count);

    if (count >= this.config.maxRetries) {
      return { shouldRetry: false, error, action: 'fail' };
    }

    return {
      shouldRetry: true,
      action: 'retry',
    };
  }

  /**
   * 处理模型错误
   */
  private handleModelError(
    error: ModelError,
    state: LoopState
  ): RecoveryResult {
    // 尝试切换到备用模型
    if (this.config.fallbackModel && state.currentModel !== this.config.fallbackModel) {
      return {
        shouldRetry: true,
        newModel: this.config.fallbackModel,
        action: 'switch_model',
        recovered: true,
      };
    }

    return { shouldRetry: false, error, action: 'fail' };
  }

  /**
   * 处理通用错误
   */
  private handleGenericError(error: Error): RecoveryResult {
    const key = 'generic';
    const count = (this.retryCount.get(key) ?? 0) + 1;
    this.retryCount.set(key, count);

    if (count >= this.config.maxRetries) {
      return { shouldRetry: false, error, action: 'fail' };
    }

    return { shouldRetry: true, action: 'retry' };
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 重置重试计数
   */
  reset(): void {
    this.retryCount.clear();
  }

  /**
   * 获取重试统计
   */
  getStats(): Record<string, number> {
    return Object.fromEntries(this.retryCount);
  }
}
