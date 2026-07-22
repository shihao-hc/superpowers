/**
 * Agent State Management
 * 状态机设计与状态存储
 */

import type { Message, ToolUse } from './types.js';

export interface AgentState {
  id: string;
  sessionId: string;
  turnCount: number;
  messages: Message[];
  toolCalls: ToolCallState[];
  context: StateContext;
  metadata: StateMetadata;
  createdAt: number;
  updatedAt: number;
}

export interface ToolCallState {
  id: string;
  name: string;
  input: unknown;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface StateContext {
  workingDirectory: string;
  environment: 'development' | 'staging' | 'production';
  userId?: string;
  permissions: PermissionState;
  features: FeatureState;
}

export interface PermissionState {
  mode: PermissionMode;
  allowedPaths: string[];
  deniedPaths: string[];
  alwaysAllowRules: string[];
  alwaysDenyRules: string[];
  sessionHistory: PermissionDecision[];
}

export interface FeatureState {
  flags: Record<string, boolean>;
  overrides: Record<string, boolean>;
}

export interface StateMetadata {
  model: string;
  tokenUsage: TokenUsage;
  lastError?: string;
  compactionHistory: CompactionRecord[];
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  lastUpdated: number;
}

export interface CompactionRecord {
  timestamp: number;
  preTokens: number;
  postTokens: number;
  type: 'auto' | 'micro' | 'partial' | 'session';
}

export type PermissionMode = 
  | 'default'
  | 'plan'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'dontAsk'
  | 'auto';

export interface PermissionDecision {
  tool: string;
  input: unknown;
  decision: 'allow' | 'deny' | 'ask' | 'pause';
  reason?: string;
  timestamp: number;
}

export class StateManager {
  private states: Map<string, AgentState> = new Map();
  private listeners: Set<(state: AgentState) => void> = new Set();

  create(sessionId: string, config: StateConfig): AgentState {
    const state: AgentState = {
      id: this.generateId(),
      sessionId,
      turnCount: 0,
      messages: [],
      toolCalls: [],
      context: {
        workingDirectory: config.workingDirectory || process.cwd(),
        environment: config.environment || 'development',
        userId: config.userId,
        permissions: {
          mode: config.permissionMode || 'default',
          allowedPaths: [],
          deniedPaths: [],
          alwaysAllowRules: [],
          alwaysDenyRules: [],
          sessionHistory: []
        },
        features: {
          flags: {},
          overrides: {}
        }
      },
      metadata: {
        model: config.model || 'unknown',
        tokenUsage: { input: 0, output: 0, total: 0, lastUpdated: Date.now() },
        compactionHistory: []
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.states.set(sessionId, state);
    return state;
  }

  get(sessionId: string): AgentState | undefined {
    return this.states.get(sessionId);
  }

  update(sessionId: string, updates: Partial<AgentState>): AgentState | undefined {
    const state = this.states.get(sessionId);
    if (!state) return undefined;

    Object.assign(state, updates, { updatedAt: Date.now() });
    this.notifyListeners(state);
    return state;
  }

  delete(sessionId: string): boolean {
    return this.states.delete(sessionId);
  }

  incrementTurn(sessionId: string): AgentState | undefined {
    const state = this.states.get(sessionId);
    if (!state) return undefined;

    state.turnCount++;
    state.updatedAt = Date.now();
    this.notifyListeners(state);
    return state;
  }

  addMessage(sessionId: string, message: Message): AgentState | undefined {
    const state = this.states.get(sessionId);
    if (!state) return undefined;

    state.messages.push(message);
    state.updatedAt = Date.now();
    this.notifyListeners(state);
    return state;
  }

  addToolCall(sessionId: string, toolCall: ToolCallState): AgentState | undefined {
    const state = this.states.get(sessionId);
    if (!state) return undefined;

    state.toolCalls.push(toolCall);
    state.updatedAt = Date.now();
    this.notifyListeners(state);
    return state;
  }

  updateToolCall(
    sessionId: string, 
    toolCallId: string, 
    updates: Partial<ToolCallState>
  ): AgentState | undefined {
    const state = this.states.get(sessionId);
    if (!state) return undefined;

    const toolCall = state.toolCalls.find(tc => tc.id === toolCallId);
    if (toolCall) {
      Object.assign(toolCall, updates);
      state.updatedAt = Date.now();
      this.notifyListeners(state);
    }
    return state;
  }

  updateTokenUsage(sessionId: string, input: number, output: number): AgentState | undefined {
    const state = this.states.get(sessionId);
    if (!state) return undefined;

    state.metadata.tokenUsage = {
      input: state.metadata.tokenUsage.input + input,
      output: state.metadata.tokenUsage.output + output,
      total: state.metadata.tokenUsage.total + input + output,
      lastUpdated: Date.now()
    };
    state.updatedAt = Date.now();
    this.notifyListeners(state);
    return state;
  }

  recordCompaction(
    sessionId: string, 
    preTokens: number, 
    postTokens: number,
    type: 'auto' | 'micro' | 'partial' | 'session'
  ): AgentState | undefined {
    const state = this.states.get(sessionId);
    if (!state) return undefined;

    state.metadata.compactionHistory.push({
      timestamp: Date.now(),
      preTokens,
      postTokens,
      type
    });
    state.updatedAt = Date.now();
    this.notifyListeners(state);
    return state;
  }

  subscribe(listener: (state: AgentState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(state: AgentState): void {
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  getAll(): AgentState[] {
    return Array.from(this.states.values());
  }

  clear(): void {
    this.states.clear();
  }

  size(): number {
    return this.states.size;
  }
}

export interface StateConfig {
  workingDirectory?: string;
  environment?: 'development' | 'staging' | 'production';
  userId?: string;
  model?: string;
  permissionMode?: PermissionMode;
}

export const globalStateManager = new StateManager();
