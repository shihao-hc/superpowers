/**
 * OpenCode Agent Loop - 基于 Claude Code 源码分析
 * 
 * 核心架构:
 * - 流式异步执行
 * - Token 预算管理
 * - 错误恢复机制
 * - 上下文压缩
 */

import { EventEmitter } from 'events';
import type { Message, ToolUse, ModelResponse } from './types.js';
import { TokenBudget } from './token-budget.js';
import { ErrorRecovery } from './recovery.js';
import { ContextManager } from '../compact/index.js';

export interface AgentLoopConfig {
  /** 最大轮次限制 */
  maxTurns?: number;
  /** 任务 Token 预算 */
  taskBudget?: { total: number };
  /** 备用模型 */
  fallbackModel?: string;
  /** 启用流式处理 */
  enableStreaming: boolean;
  /** 启用错误恢复 */
  enableErrorRecovery: boolean;
  /** 系统提示 */
  systemPrompt?: string;
  /** 用户上下文 */
  userContext?: Record<string, string>;
  /** 工具上下文 */
  toolContext?: ToolContext;
}

export interface ToolContext {
  canUseTool: (toolName: string) => boolean;
  permissionMode: PermissionMode;
}

export type PermissionMode = 
  | 'default'
  | 'plan'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'dontAsk'
  | 'auto';

export interface LoopState {
  messages: Message[];
  turnCount: number;
  autoCompactTracking?: AutoCompactState;
  tokenBudget: TokenBudget;
  stopReason?: StopReason;
  currentModel: string;
  error?: Error;
}

export type StopReason = 
  | 'completed'
  | 'max_turns'
  | 'prompt_too_long'
  | 'model_error'
  | 'token_budget_exceeded'
  | 'stop_hook_prevented'
  | 'user_interruption';

export interface AutoCompactState {
  compacted: boolean;
  turnCounter: number;
  turnId: string;
  consecutiveFailures?: number;
}

export interface LoopEvent {
  type: LoopEventType;
  data?: unknown;
  timestamp: number;
}

export type LoopEventType = 
  | 'start'
  | 'turn_start'
  | 'chunk'
  | 'tool_call'
  | 'tool_result'
  | 'compact'
  | 'error'
  | 'warning'
  | 'completed'
  | 'budget_exceeded';

export class AgentLoop extends EventEmitter {
  private config: AgentLoopConfig;
  private state: LoopState;
  private contextManager: ContextManager;
  private errorRecovery: ErrorRecovery;
  private abortController: AbortController | null = null;
  private isRunning: boolean = false;

  constructor(config: AgentLoopConfig) {
    super();
    this.config = config;
    this.state = this.initState();
    this.contextManager = new ContextManager({
      maxTokens: config.taskBudget?.total ?? 100000,
    });
    this.errorRecovery = new ErrorRecovery({
      enable: config.enableErrorRecovery,
      fallbackModel: config.fallbackModel,
    });
  }

  private initState(): LoopState {
    return {
      messages: [],
      turnCount: 0,
      tokenBudget: new TokenBudget(
        this.config.taskBudget?.total ?? 100000
      ),
      currentModel: 'claude-sonnet-4-20250514',
    };
  }

  /**
   * 主循环 - 异步生成器模式
   * 基于 Claude Code query.ts 的实现
   */
  async *run(
    initialMessages: Message[] = []
  ): AsyncGenerator<LoopEvent, LoopState, void> {
    if (this.isRunning) {
      throw new Error('Agent loop is already running');
    }
    
    this.isRunning = true;
    this.state.messages = initialMessages;
    
    yield { type: 'start', timestamp: Date.now() };
    
    try {
      while (true) {
        // 1. 检查终止条件
        const stopCheck = this.checkStopConditions();
        if (stopCheck.shouldStop) {
          this.state.stopReason = stopCheck.reason;
          break;
        }
        
        // 2. Token 预算检查
        if (!this.state.tokenBudget.check()) {
          yield { type: 'budget_exceeded', timestamp: Date.now() };
          this.state.stopReason = 'token_budget_exceeded';
          break;
        }
        
        // 3. 触发轮次开始事件
        yield { type: 'turn_start', data: { turn: this.state.turnCount }, timestamp: Date.now() };
        
        // 4. 上下文压缩检查
        const compactResult = await this.contextManager.checkAndCompact(
          this.state.messages,
          this.state.tokenBudget
        );
        if (compactResult.didCompact) {
          this.state.messages = compactResult.messages;
          this.state.autoCompactTracking = {
            compacted: true,
            turnCounter: this.state.turnCount,
            turnId: this.generateTurnId(),
          };
          yield { 
            type: 'compact', 
            data: {
              before: compactResult.beforeTokens,
              after: compactResult.afterTokens,
            },
            timestamp: Date.now() 
          };
        }
        
        // 5. 调用模型
        const response = await this.queryModel();
        
        // 6. 处理流式输出
        if (this.config.enableStreaming && response.stream) {
          for await (const chunk of response.stream) {
            yield { type: 'chunk', data: chunk, timestamp: Date.now() };
          }
        }
        
        // 7. 检查停止原因
        if (response.stopReason === 'end_turn') {
          this.state.messages.push(response.message);
          yield { type: 'completed', data: response.message, timestamp: Date.now() };
          break;
        }
        
        // 8. 执行工具
        if (response.stopReason === 'tool_use') {
          const toolUses = response.toolUses ?? [];
          
          for (const toolUse of toolUses) {
            yield { type: 'tool_call', data: toolUse, timestamp: Date.now() };
            
            const result = await this.executeTool(toolUse);
            yield { type: 'tool_result', data: result, timestamp: Date.now() };
            
            this.state.messages.push(response.message);
            this.state.messages.push({
              type: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: result,
              }],
            });
          }
        }
        
        // 9. 错误处理
        if (response.error) {
          const recovery = await this.errorRecovery.handle(
            response.error,
            this.state
          );
          
          if (recovery.shouldRetry) {
            this.state.currentModel = recovery.newModel ?? this.state.currentModel;
            yield { type: 'error', data: response.error, timestamp: Date.now() };
            continue;
          } else {
            this.state.error = response.error;
            yield { type: 'error', data: response.error, timestamp: Date.now() };
            break;
          }
        }
        
        this.state.turnCount++;
      }
    } finally {
      this.isRunning = false;
    }
    
    return this.state;
  }

  private checkStopConditions(): { shouldStop: boolean; reason?: StopReason } {
    // 最大轮次检查
    if (this.config.maxTurns && this.state.turnCount >= this.config.maxTurns) {
      return { shouldStop: true, reason: 'max_turns' };
    }
    
    // Token 预算检查
    if (!this.state.tokenBudget.check()) {
      return { shouldStop: true, reason: 'token_budget_exceeded' };
    }
    
    return { shouldStop: false };
  }

  private async queryModel(): Promise<ModelResponse> {
    this.abortController = new AbortController();
    
    try {
      // 构建请求
      const request = {
        model: this.state.currentModel,
        messages: this.state.messages,
        maxTokens: this.state.tokenBudget.getMaxOutputTokens(),
        system: this.config.systemPrompt,
        tools: this.getAvailableTools(),
      };
      
      // 调用模型 API (实际实现需要接入 LLM)
      const response = await this.callModelAPI(request);
      
      return response;
    } catch (error) {
      // 错误分类和恢复
      if (error instanceof Error) {
        if (error.message.includes('prompt_too_long')) {
          return { 
            stopReason: 'end_turn', 
            error: error,
            message: { type: 'user', content: 'Context limit exceeded' }
          };
        }
      }
      throw error;
    }
  }

  private async callModelAPI(request: unknown): Promise<ModelResponse> {
    // TODO: 实现实际的模型调用
    // 基于 this.config 中的配置调用 LLM API
    throw new Error('Model API not implemented - integrate with your LLM provider');
  }

  private getAvailableTools(): ToolUse[] {
    // TODO: 从工具注册表获取可用工具
    return [];
  }

  private async executeTool(toolUse: ToolUse): Promise<unknown> {
    // TODO: 实现工具执行
    throw new Error('Tool execution not implemented');
  }

  private generateTurnId(): string {
    return `turn_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  /**
   * 中断当前循环
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isRunning = false;
  }

  /**
   * 获取当前状态
   */
  getState(): Readonly<LoopState> {
    return { ...this.state };
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.abort();
    this.state = this.initState();
  }
}

export default AgentLoop;
