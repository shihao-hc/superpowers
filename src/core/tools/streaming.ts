/**
 * Streaming Tool Executor
 * 流式工具执行，支持进度回调和中断
 */

import type { Tool, ToolContext, ToolProgress } from './index.js';
import { EventEmitter } from 'events';

export interface StreamingOptions {
  onProgress?: (progress: ToolProgress) => void;
  onChunk?: (chunk: unknown) => void;
  signal?: AbortSignal;
}

export interface StreamingTask {
  tool: Tool;
  input: unknown;
  context: ToolContext;
  options?: StreamingOptions;
}

export class StreamingToolExecutor extends EventEmitter {
  private tasks: Map<string, StreamingTask> = new Map();
  private progress: Map<string, ToolProgress> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();

  async execute(
    tool: Tool,
    input: unknown,
    context: ToolContext,
    options: StreamingOptions = {}
  ): Promise<unknown> {
    const taskId = this.generateTaskId();
    const controller = new AbortController();

    this.tasks.set(taskId, { tool, input, context, options });
    this.progress.set(taskId, {
      taskId,
      toolName: tool.name,
      status: 'queued',
      progress: 0,
      chunks: []
    });

    this.abortControllers.set(taskId, controller);

    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        this.abort(taskId);
      });
    }

    try {
      this.updateProgress(taskId, { status: 'executing', progress: 0 });

      if (this.isGeneratorFunction(tool.call)) {
        return await this.executeStreaming(taskId, input, context, options);
      } else {
        return await this.executeRegular(taskId, input, context, options);
      }
    } catch (error) {
      this.updateProgress(taskId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      this.tasks.delete(taskId);
      this.abortControllers.delete(taskId);
    }
  }

  private async executeStreaming(
    taskId: string,
    input: unknown,
    context: ToolContext,
    options: StreamingOptions
  ): Promise<unknown> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('Task not found');

    const tool = task.tool;
    const controller = this.abortControllers.get(taskId);
    let result: unknown;
    let lastProgress = 0;

    try {
      const generator = tool.call(input, context);

      for await (const chunk of generator as AsyncIterable<unknown>) {
        if (controller?.signal.aborted) {
          this.updateProgress(taskId, { status: 'cancelled' });
          break;
        }

        const currentProgress = Math.min(lastProgress + 10, 90);
        this.updateProgress(taskId, { progress: currentProgress });
        lastProgress = currentProgress;

        options.onChunk?.(chunk);
        this.emit('chunk', { taskId, chunk });
      }

      result = undefined;
    } catch (error) {
      throw error;
    }

    this.updateProgress(taskId, { status: 'completed', progress: 100 });
    return result;
  }

  private async executeRegular(
    taskId: string,
    input: unknown,
    context: ToolContext,
    options: StreamingOptions
  ): Promise<unknown> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('Task not found');

    const tool = task.tool;
    const controller = this.abortControllers.get(taskId);

    const result = await tool.call(input, context);

    this.updateProgress(taskId, { status: 'completed', progress: 100 });
    options.onProgress?.(this.progress.get(taskId)!);

    return result;
  }

  abort(taskId: string): void {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.updateProgress(taskId, { status: 'cancelled' });
    }
  }

  abortAll(): void {
    for (const [taskId, controller] of this.abortControllers) {
      controller.abort();
      this.updateProgress(taskId, { status: 'cancelled' });
    }
  }

  getProgress(taskId: string): ToolProgress | undefined {
    return this.progress.get(taskId);
  }

  private updateProgress(taskId: string, updates: Partial<ToolProgress>): void {
    const current = this.progress.get(taskId);
    if (current) {
      Object.assign(current, updates);
      this.emit('progress', current);

      const task = this.tasks.get(taskId);
      task?.options?.onProgress?.(current);
    }
  }

  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private isGeneratorFunction(fn: unknown): boolean {
    if (typeof fn !== 'function') return false;
    const fnString = fn.toString();
    return fnString.includes('function*') || 
           fnString.includes('async function*') ||
           fnString.includes('=>') && fnString.includes('yield');
  }

  getActiveTasks(): string[] {
    return Array.from(this.tasks.keys());
  }

  clear(): void {
    this.abortAll();
    this.tasks.clear();
    this.progress.clear();
  }
}

export const globalStreamingExecutor = new StreamingToolExecutor();
