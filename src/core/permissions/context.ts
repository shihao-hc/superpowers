/**
 * Permission Context
 * 权限决策上下文管理
 */

import type { PermissionMode, PermissionDecision, PermissionRule } from './index.js';

export interface PermissionContext {
  mode: PermissionMode;
  alwaysAllowRules: PermissionRule[];
  alwaysDenyRules: PermissionRule[];
  deniedRules: string[];
  sessionAllowRules: string[];
  autoAllowedPaths: string[];
  sessionHistory: PermissionDecision[];
}

export interface ToolPermissionContext {
  toolName: string;
  toolInput: unknown;
  requestedPaths?: string[];
  isDestructive?: boolean;
  isReadOnly?: boolean;
}

export class PermissionContextManager {
  private contexts: Map<string, PermissionContext> = new Map();
  private currentContext?: string;

  create(sessionId: string, mode: PermissionMode = 'default'): PermissionContext {
    const context: PermissionContext = {
      mode,
      alwaysAllowRules: [],
      alwaysDenyRules: [],
      deniedRules: [],
      sessionAllowRules: [],
      autoAllowedPaths: [],
      sessionHistory: []
    };

    this.contexts.set(sessionId, context);
    this.currentContext = sessionId;
    return context;
  }

  get(sessionId?: string): PermissionContext | undefined {
    const id = sessionId || this.currentContext;
    return id ? this.contexts.get(id) : undefined;
  }

  setMode(sessionId: string, mode: PermissionMode): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.mode = mode;
    }
  }

  addAlwaysAllowRule(sessionId: string, rule: PermissionRule): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.alwaysAllowRules.push(rule);
    }
  }

  addAlwaysDenyRule(sessionId: string, rule: PermissionRule): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.alwaysDenyRules.push(rule);
    }
  }

  addSessionAllowRule(sessionId: string, ruleId: string): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.sessionAllowRules.push(ruleId);
    }
  }

  addDeniedRule(sessionId: string, ruleId: string): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.deniedRules.push(ruleId);
    }
  }

  addAutoAllowedPath(sessionId: string, path: string): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.autoAllowedPaths.push(path);
    }
  }

  recordDecision(sessionId: string, decision: PermissionDecision): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.sessionHistory.push(decision);
    }
  }

  getHistory(sessionId: string): PermissionDecision[] {
    const context = this.contexts.get(sessionId);
    return context?.sessionHistory || [];
  }

  clearHistory(sessionId: string): void {
    const context = this.contexts.get(sessionId);
    if (context) {
      context.sessionHistory = [];
    }
  }

  delete(sessionId: string): boolean {
    return this.contexts.delete(sessionId);
  }

  switchContext(sessionId: string): void {
    if (this.contexts.has(sessionId)) {
      this.currentContext = sessionId;
    }
  }

  getCurrent(): PermissionContext | undefined {
    return this.currentContext ? this.contexts.get(this.currentContext) : undefined;
  }

  clone(sourceSessionId: string, targetSessionId: string): void {
    const source = this.contexts.get(sourceSessionId);
    if (source) {
      this.contexts.set(targetSessionId, {
        ...source,
        sessionHistory: []
      });
    }
  }

  getAll(): Map<string, PermissionContext> {
    return new Map(this.contexts);
  }
}

export const globalPermissionContextManager = new PermissionContextManager();
