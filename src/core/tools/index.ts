/**
 * 工具系统 - 基于 Claude Code 源码
 * 
 * 核心组件:
 * - ToolRegistry: 工具注册表
 * - StreamingToolExecutor: 流式工具执行器
 * - 泛型工具接口
 */

import { EventEmitter } from 'events';

// 泛型工具定义
export interface Tool<
  Input extends Record<string, unknown> = Record<string, unknown>,
  Output = unknown
> {
  name: string;
  description: string;
  inputSchema: unknown; // Zod schema
  
  // 核心方法
  call(input: Input, context: ToolContext): Promise<Output>;
  
  // 生命周期钩子
  validateInput?: (input: Input, context: ToolContext) => Promise<ValidationResult>;
  checkPermissions?: (input: Input, context: ToolContext) => Promise<PermissionResult>;
  
  // 状态标志
  isEnabled: () => boolean;
  isConcurrencySafe: (input: Input) => boolean;
  isReadOnly: (input: Input) => boolean;
  isDestructive?: (input: Input) => boolean;
  
  // 中断控制
  interruptBehavior?: 'cancel' | 'block';
}

export interface ToolContext {
  workingDirectory?: string;
  canUseTool: (toolName: string) => boolean;
  permissionMode: PermissionMode;
  sessionId?: string;
}

export type PermissionMode = 
  | 'default'
  | 'plan'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'dontAsk'
  | 'auto';

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
}

export interface ToolResult<Output = unknown> {
  success: boolean;
  output?: Output;
  error?: string;
  duration?: number;
  toolName: string;
}

export type ToolStatus = 'queued' | 'executing' | 'completed' | 'failed' | 'cancelled';

export interface ToolExecutionState {
  id: string;
  toolName: string;
  status: ToolStatus;
  startTime?: number;
  endTime?: number;
  result?: ToolResult;
  abortController?: AbortController;
}

/**
 * 工具注册表
 */
export class ToolRegistry extends EventEmitter {
  private tools: Map<string, Tool> = new Map();
  private toolNames: Map<string, string> = new Map(); // 别名映射

  /**
   * 注册工具
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool ${tool.name} is already registered, overwriting`);
    }
    this.tools.set(tool.name, tool);
    this.emit('register', tool);
  }

  /**
   * 批量注册工具
   */
  registerMany(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 注销工具
   */
  unregister(name: string): boolean {
    const tool = this.tools.get(name);
    if (tool) {
      this.tools.delete(name);
      this.emit('unregister', tool);
      return true;
    }
    return false;
  }

  /**
   * 获取工具
   */
  get(name: string): Tool | undefined {
    // 检查别名
    const actualName = this.toolNames.get(name) ?? name;
    return this.tools.get(actualName);
  }

  /**
   * 获取所有工具
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 根据条件过滤
   */
  filter(predicate: (tool: Tool) => boolean): Tool[] {
    return this.getAll().filter(predicate);
  }

  /**
   * 获取只读工具
   */
  getReadOnly(): Tool[] {
    return this.filter(tool => tool.isReadOnly({} as any));
  }

  /**
   * 获取可并发工具
   */
  getConcurrencySafe(): Tool[] {
    return this.filter(tool => tool.isConcurrencySafe({} as any));
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name) || this.toolNames.has(name);
  }

  /**
   * 获取工具数量
   */
  size(): number {
    return this.tools.size;
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.tools.clear();
    this.toolNames.clear();
    this.emit('clear');
  }

  /**
   * 添加别名
   */
  addAlias(alias: string, toolName: string): void {
    if (this.tools.has(toolName)) {
      this.toolNames.set(alias, toolName);
    }
  }

  /**
   * 搜索工具
   */
  search(query: string): Tool[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(tool => 
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.description.toLowerCase().includes(lowerQuery)
    );
  }
}

/**
 * 流式工具执行器
 */
export class StreamingToolExecutor extends EventEmitter {
  private registry: ToolRegistry;
  private queue: ToolExecutionState[] = [];
  private maxConcurrency: number = 3;
  private executing: Map<string, ToolExecutionState> = new Map();

  constructor(registry: ToolRegistry) {
    super();
    this.registry = registry;
  }

  /**
   * 执行工具
   */
  async execute(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.registry.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool ${toolName} not found`,
        toolName,
      };
    }

    // 检查工具是否启用
    if (!tool.isEnabled()) {
      return {
        success: false,
        error: `Tool ${toolName} is disabled`,
        toolName,
      };
    }

    // 权限检查
    if (tool.checkPermissions) {
      const permResult = await tool.checkPermissions(input, context);
      if (!permResult.allowed) {
        return {
          success: false,
          error: permResult.reason ?? 'Permission denied',
          toolName,
        };
      }
    }

    // 输入验证
    if (tool.validateInput) {
      const validResult = await tool.validateInput(input, context);
      if (!validResult.valid) {
        return {
          success: false,
          error: validResult.errors?.join(', ') ?? 'Validation failed',
          toolName,
        };
      }
    }

    // 创建执行状态
    const state: ToolExecutionState = {
      id: `${toolName}_${Date.now()}`,
      toolName,
      status: 'executing',
      startTime: Date.now(),
      abortController: new AbortController(),
    };

    this.executing.set(state.id, state);
    this.emit('start', state);

    try {
      const output = await tool.call(input, context);
      
      state.status = 'completed';
      state.endTime = Date.now();
      state.result = {
        success: true,
        output,
        duration: state.endTime - (state.startTime ?? 0),
        toolName,
      };

      this.emit('complete', state);
      return state.result;
    } catch (error) {
      state.status = 'failed';
      state.endTime = Date.now();
      state.result = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: state.endTime - (state.startTime ?? 0),
        toolName,
      };

      this.emit('error', state, error);
      return state.result;
    } finally {
      this.executing.delete(state.id);
    }
  }

  /**
   * 批量执行
   */
  async executeBatch(
    tools: Array<{ name: string; input: Record<string, unknown> }>,
    context: ToolContext
  ): Promise<ToolResult[]> {
    // 按并发限制分批
    const batches = this.createBatches(tools, this.maxConcurrency);
    const results: ToolResult[] = [];

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(t => this.execute(t.name, t.input, context))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 创建执行批次
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 中断执行
   */
  abort(toolName?: string): void {
    if (toolName) {
      // 中断特定工具
      for (const [id, state] of this.executing) {
        if (state.toolName === toolName) {
          state.abortController?.abort();
          state.status = 'cancelled';
          this.emit('abort', state);
        }
      }
    } else {
      // 中断所有
      for (const [id, state] of this.executing) {
        state.abortController?.abort();
        state.status = 'cancelled';
        this.emit('abort', state);
      }
    }
  }

  /**
   * 获取执行状态
   */
  getExecuting(): ToolExecutionState[] {
    return Array.from(this.executing.values());
  }

  /**
   * 设置最大并发数
   */
  setMaxConcurrency(max: number): void {
    this.maxConcurrency = Math.max(1, max);
  }

  /**
   * 获取统计
   */
  getStats(): {
    queued: number;
    executing: number;
    maxConcurrency: number;
  } {
    return {
      queued: this.queue.length,
      executing: this.executing.size,
      maxConcurrency: this.maxConcurrency,
    };
  }
}

/**
 * 工具构建器 - 基于 Claude Code buildTool 工厂函数
 */
export function buildTool<
  Input extends Record<string, unknown>,
  Output
>(definition: {
  name: string;
  description: string;
  inputSchema?: unknown;
  call: (input: Input, context: ToolContext) => Promise<Output>;
  validateInput?: (input: Input, context: ToolContext) => Promise<ValidationResult>;
  checkPermissions?: (input: Input, context: ToolContext) => Promise<PermissionResult>;
  isEnabled?: () => boolean;
  isConcurrencySafe?: (input: Input) => boolean;
  isReadOnly?: (input: Input) => boolean;
  isDestructive?: (input: Input) => boolean;
  interruptBehavior?: 'cancel' | 'block';
}): Tool<Input, Output> {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema ?? {},
    call: definition.call,
    validateInput: definition.validateInput,
    checkPermissions: definition.checkPermissions,
    isEnabled: definition.isEnabled ?? (() => true),
    isConcurrencySafe: definition.isConcurrencySafe ?? (() => false),
    isReadOnly: definition.isReadOnly ?? (() => false),
    isDestructive: definition.isDestructive,
    interruptBehavior: definition.interruptBehavior,
  };
}

// 默认配置
const TOOL_DEFAULTS = {
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
};

// Re-export from submodules
export { ToolRegistry } from './registry.js';
export { ToolExecutor, ToolQueue } from './executor.js';
export { StreamingToolExecutor } from './streaming.js';
export { SchemaValidator, commonSchemas } from './schemas.js';
export { ToolExecutionError, ToolNotFoundError } from './errors.js';
