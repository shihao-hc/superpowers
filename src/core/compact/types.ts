/**
 * Compact Types
 */

export type CompactType = 
  | 'auto'        // 自动压缩
  | 'micro'       // 微压缩
  | 'partial'     // 部分压缩
  | 'session';    // 会话记忆压缩

export interface CompactCheckResult {
  shouldCompact: boolean;
  type: CompactType;
  reason?: string;
}

export interface CompactConfig {
  enabled: boolean;
  maxTokens: number;
  minTokensToCompact: number;
  autoCompactBufferTokens: number;
  warningThresholdBuffer: number;
  errorThresholdBuffer: number;
  postCompactTokenBudget: number;
  maxTokensPerFile: number;
  maxTokensPerSkill: number;
  skillsTokenBudget: number;
}

export interface CompactionRecord {
  timestamp: number;
  type: CompactType;
  beforeTokens: number;
  afterTokens: number;
  messagesRemoved: number;
}

export interface CompactResult {
  didCompact: boolean;
  messages: import('../agent-loop/types.js').Message[];
  beforeTokens: number;
  afterTokens: number;
  boundaryMarker?: import('../agent-loop/types.js').Message;
}
