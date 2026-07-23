/**
 * Tool Executor
 * 工具执行器，支持并发控制和错误处理
 */

import type { Tool, ToolContext, ToolResult } from './index.js';
import { ToolExecutionError } from './errors.js';

export interface ExecutionOptions {
  maxConcurrency?: number;
  timeout?: number;
  continueOnError?: boolean;
  abortSignal?: AbortSignal;
}

export interface ExecutionTask {
  tool: Tool;
  input: unknown;
  context: ToolContext;
  priority?: number;
}

export interface ExecutionResult {
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
  timestamp: number;
}

export class ToolExecutor {
  private queue: ExecutionTask[] = [];
  private executing: Map<string, ExecutionResult> = new Map();
  private results: ExecutionResult[] = [];
  private abortController?: AbortController;

  constructor(private maxConcurrency: number = 3) {}

  async execute(
    tasks: ExecutionTask[],
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult[]> {
    this.results = [];
    this.abortController = options.abortSignal ? undefined : new AbortController();

    const mergedSignal = options.abortSignal || this.abortController?.signal;
    
    const batches = this.createBatches(tasks, options.maxConcurrency || this.maxConcurrency);

    for (const batch of batches) {
      if (mergedSignal?.aborted) break;

      const batchResults = await Promise.all(
        batch.map(task => this.executeSingle(task, options))
      );

      this.results.push(...batchResults);

      if (!options.continueOnError && batchResults.some(r => !r.success)) {
        break;
      }
    }

    return this.results;
  }

  async executeSingle(
    task: ExecutionTask,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const toolName = task.tool.name;

    try {
      if (task.tool.validateInput) {
        const validation = await task.tool.validateInput(task.input, task.context);
        if (!validation.valid) {
          throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }
      }

      if (task.tool.checkPermissions) {
        const permission = await task.tool.checkPermissions(task.input, task.context);
        if (!permission.allowed) {
          throw new ToolExecutionError(
            `Permission denied for tool ${toolName}`,
            toolName,
            task.input
          );
        }
      }

      const result = await this.withTimeout(
        task.tool.call(task.input, task.context),
        options.timeout || 30000
      );

      return {
        toolName,
        success: true,
        result,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        toolName,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        timestamp: Date.now()
      };
    }
  }

  private createBatches(tasks: ExecutionTask[], concurrency: number): ExecutionTask[][] {
    const sorted = [...tasks].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const batches: ExecutionTask[][] = [];

    for (let i = 0; i < sorted.length; i += concurrency) {
      batches.push(sorted.slice(i, i + concurrency));
    }

    return batches;
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Execution timeout after ${ms}ms`));
      }, ms);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }

  abort(): void {
    this.abortController?.abort();
  }

  getResults(): ExecutionResult[] {
    return [...this.results];
  }

  getExecuting(): string[] {
    return Array.from(this.executing.keys());
  }
}

export class ToolQueue {
  private queue: ExecutionTask[] = [];
  private processing: boolean = false;

  constructor(
    private executor: ToolExecutor,
    private options: ExecutionOptions = {}
  ) {}

  enqueue(task: ExecutionTask): void {
    this.queue.push(task);
    if (!this.processing) {
      this.process();
    }
  }

  enqueueBatch(tasks: ExecutionTask[]): void {
    this.queue.push(...tasks);
    if (!this.processing) {
      this.process();
    }
  }

  private async process(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const task = this.queue.shift();
    
    if (task) {
      await this.executor.executeSingle(task, this.options);
    }

    this.process();
  }

  size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }
}
