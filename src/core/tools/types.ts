export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolOutput {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface ToolContext {
  workspaceRoot: string;
  sessionId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    duration?: number;
    tokens?: number;
  };
}

export type ToolExecute<TInput = ToolInput, TOutput = ToolOutput> = (
  input: TInput,
  context: ToolContext
) => Promise<ToolResult<TOutput>>;

export interface Tool<TInput = ToolInput, TOutput = ToolOutput> {
  definition: ToolDefinition;
  execute: ToolExecute<TInput, TOutput>;
  validate?: (input: unknown) => TInput;
}
