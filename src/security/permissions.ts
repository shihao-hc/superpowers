/**
 * Permission Manager - 权限管理器
 * 
 * 基于 Claude Code 权限架构
 */

import type { PermissionMode, PermissionRule, PermissionDecision, ToolPermissionContext } from './types.js';

const DANGEROUS_PATTERNS = [
  /\.\.\//,
  /\.\.\\/,
  /^\/etc/,
  /^\/sys/,
  /^\/proc/,
  /^\\\\/,
  /\$[\(\{]/,
  /%[\(\{]/,
  /\`[^`]*\`/,
  /\$\([^\)]*\)/,
];

export class PermissionManager {
  private mode: PermissionMode;
  private rules: PermissionRule[];
  private listeners: Set<(decision: PermissionDecision) => void> = new Set();

  constructor(mode: PermissionMode = 'default', rules: PermissionRule[] = []) {
    this.mode = mode;
    this.rules = rules;
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode;
  }

  getMode(): PermissionMode {
    return this.mode;
  }

  addRule(rule: PermissionRule): void {
    this.rules.push(rule);
  }

  setRules(rules: PermissionRule[]): void {
    this.rules = rules;
  }

  getRules(): PermissionRule[] {
    return [...this.rules];
  }

  checkPermission(tool: string, input?: Record<string, unknown>): PermissionDecision {
    let decision: PermissionDecision = { behavior: 'passthrough' };

    if (this.mode === 'bypassPermissions') {
      decision = { behavior: 'allow', reason: 'mode:bypass' };
    } else if (this.mode === 'plan') {
      decision = { behavior: 'deny', reason: 'mode:plan', message: 'Plan mode: file modifications are disabled' };
    } else if (this.mode === 'acceptEdits' && this.isFileModificationTool(tool)) {
      decision = { behavior: 'allow', reason: 'mode:acceptEdits' };
    } else if (this.mode === 'dontAsk') {
      decision = { behavior: 'deny', reason: 'mode:dontAsk', message: 'Permission denied in dontAsk mode' };
    } else {
      for (const rule of this.rules) {
        if (this.ruleMatches(rule, tool)) {
          if (rule.allow) {
            decision = { behavior: 'allow', reason: 'rule:allow' };
            break;
          }
          if (rule.deny) {
            decision = { behavior: 'deny', reason: 'rule:deny', message: `Tool ${tool} is denied by rule` };
            break;
          }
        }
      }
    }

    this.notifyListeners(decision);
    return decision;
  }

  private ruleMatches(rule: PermissionRule, tool: string): boolean {
    if (rule.tool && rule.tool !== tool) {
      return false;
    }
    return true;
  }

  private isFileModificationTool(tool: string): boolean {
    const modTools = ['Write', 'Bash', 'Edit', 'MultiEdit', 'WebSearch', 'WebFetch'];
    return modTools.includes(tool);
  }

  subscribe(listener: (decision: PermissionDecision) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(decision: PermissionDecision): void {
    for (const listener of this.listeners) {
      try {
        listener(decision);
      } catch (error) {
        console.error('[PermissionManager] Listener error:', error);
      }
    }
  }

  validatePath(path: string, cwd: string): { valid: boolean; error?: string } {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(path)) {
        return { valid: false, error: `Path contains dangerous pattern: ${pattern}` };
      }
    }

    if (path.startsWith('/etc/') || path.startsWith('/sys/') || path.startsWith('/proc/')) {
      return { valid: false, error: 'Access to system directories is denied' };
    }

    if (path.startsWith('\\\\')) {
      return { valid: false, error: 'UNC paths are not allowed' };
    }

    return { valid: true };
  }

  sanitizeInput(input: string): string {
    return input
      .replace(/[\u0000-\u001F]/g, '')
      .replace(/[\u200B-\u200F\uFEFF]/g, '');
  }

  validateCommand(command: string): { valid: boolean; error?: string } {
    if (command.includes('rm -rf /') || command.includes('rm -rf /*')) {
      return { valid: false, error: 'Dangerous recursive delete command' };
    }

    if (command.includes('dd if=') && command.includes('of=/dev/')) {
      return { valid: false, error: 'Direct device write is not allowed' };
    }

    return { valid: true };
  }
}

export const globalPermissionManager = new PermissionManager();

export function createPermissionManager(mode?: PermissionMode, rules?: PermissionRule[]): PermissionManager {
  return new PermissionManager(mode, rules);
}
