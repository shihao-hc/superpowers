/**
 * Tool Errors
 */

export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public toolName: string,
    public toolInput?: unknown,
    public code: string = 'TOOL_EXECUTION_ERROR'
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

export class ToolNotFoundError extends Error {
  constructor(toolName: string) {
    super(`Tool ${toolName} not found`);
    this.name = 'ToolNotFoundError';
  }
}

export class ToolValidationError extends Error {
  constructor(
    message: string,
    public toolName: string,
    public errors: string[]
  ) {
    super(message);
    this.name = 'ToolValidationError';
  }
}

export class ToolPermissionError extends Error {
  constructor(
    message: string,
    public toolName: string,
    public decision: 'deny' | 'ask' | 'pause'
  ) {
    super(message);
    this.name = 'ToolPermissionError';
  }
}

export class ToolTimeoutError extends Error {
  constructor(
    message: string,
    public toolName: string,
    public timeout: number
  ) {
    super(message);
    this.name = 'ToolTimeoutError';
  }
}

export class ToolAbortError extends Error {
  constructor(toolName: string) {
    super(`Tool ${toolName} execution aborted`);
    this.name = 'ToolAbortError';
  }
}

export class ToolConcurrencyError extends Error {
  constructor(
    message: string,
    public maxConcurrency: number
  ) {
    super(message);
    this.name = 'ToolConcurrencyError';
  }
}

export interface ToolErrorContext {
  sessionId?: string;
  turnCount?: number;
  timestamp?: number;
}

export function wrapToolError(
  error: Error,
  toolName: string,
  input?: unknown,
  context?: ToolErrorContext
): ToolExecutionError {
  if (error instanceof ToolExecutionError) {
    return error;
  }

  return new ToolExecutionError(
    error.message,
    toolName,
    input
  );
}

export interface ToolErrorReport {
  error: ToolExecutionError;
  toolName: string;
  toolInput?: unknown;
  context?: ToolErrorContext;
  timestamp: number;
  recoverable: boolean;
}
