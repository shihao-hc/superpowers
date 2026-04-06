/**
 * Agent Loop 类型定义
 */

// 消息类型
export interface Message {
  type: 'user' | 'assistant' | 'system' | 'tool_result';
  role?: 'user' | 'assistant' | 'system' | 'tool';
  content: MessageContent[];
  name?: string;
  toolUseId?: string;
  timestamp?: number;
}

export type MessageContent = 
  | TextContent
  | ToolUseContent
  | ToolResultContent
  | ImageContent
  |thinkingContent;

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ToolResultContent[];
  is_error?: boolean;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    media_type: string;
    data: string;
  };
}

export interface thinkingContent {
  type: 'thinking';
  thinking: string;
}

// 工具使用
export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// 模型响应
export interface ModelResponse {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  message: Message;
  toolUses?: ToolUse[];
  stream?: AsyncGenerator<string>;
  error?: Error;
  usage?: TokenUsage;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// 工具定义
export interface ToolDefinition<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: unknown; // Zod schema
  
  call(input: I, context: ToolContext): Promise<O>;
  
  validateInput?: (input: I, context: ToolContext) => ValidationResult;
  checkPermissions?: (input: I, context: ToolContext) => PermissionResult;
  
  isEnabled: () => boolean;
  isConcurrencySafe: (input: I) => boolean;
  isReadOnly: (input: I) => boolean;
  isDestructive?: (input: I) => boolean;
  
  interruptBehavior?: 'cancel' | 'block';
}

export interface ToolContext {
  workingDirectory?: string;
  canUseTool: (toolName: string) => boolean;
  permissionMode: PermissionMode;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
}

export type PermissionMode = 
  | 'default'
  | 'plan'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'dontAsk'
  | 'auto';

// 压缩相关
export interface CompactionResult {
  didCompact: boolean;
  messages: Message[];
  beforeTokens: number;
  afterTokens: number;
  boundaryMarker?: Message;
}

export interface CompactConfig {
  maxTokens: number;
  warningThreshold: number;
  errorThreshold: number;
  autoCompactBuffer: number;
}
