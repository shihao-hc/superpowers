/**
 * 权限系统 - 基于 Claude Code 源码
 * 
 * 权限模式:
 * - default: 默认模式 - 需要询问
 * - plan: Plan Mode - 暂停执行
 * - acceptEdits: 自动接受编辑
 * - bypassPermissions: 绕过权限
 * - dontAsk: 不询问
 * - auto: 自动模式
 */

export type { PermissionMode, PermissionDecision, PermissionRule, PermissionContext, PERMISSION_MODE_CONFIG } from './types.js';
export type { RuleCondition } from './types.js';

import type { PermissionMode, PermissionDecision, PermissionRule, PermissionContext } from './types.js';

export interface ToolPermissionInput {
  toolName: string;
  input?: Record<string, unknown>;
  path?: string;
}

export class PermissionSystem {
  private context: PermissionContext;
  private decisionHistory: Array<{
    toolName: string;
    decision: PermissionDecision;
    timestamp: number;
  }> = [];

  constructor(context: Partial<PermissionContext> = {}) {
    this.context = {
      mode: context.mode ?? 'default',
      alwaysAllowRules: context.alwaysAllowRules ?? [],
      alwaysDenyRules: context.alwaysDenyRules ?? [],
      sessionAllowRules: context.sessionAllowRules ?? [],
      sessionDenyRules: context.sessionDenyRules ?? [],
      autoAllowedPaths: context.autoAllowedPaths ?? [],
      autoDeniedPaths: context.autoDeniedPaths ?? [],
      deniedRules: context.deniedRules ?? [],
    };
  }

  /**
   * 检查工具权限
   */
  check(input: ToolPermissionInput): PermissionDecision {
    const { toolName, path } = input;

    // 1. 检查会话拒绝规则
    if (this.context.sessionDenyRules.includes(toolName)) {
      return this.deny(`Session denied: ${toolName}`);
    }

    // 2. 检查永久拒绝规则
    if (this.context.deniedRules.includes(toolName)) {
      return this.deny(`Permanently denied: ${toolName}`);
    }

    // 3. 检查 Always Deny 规则
    const denyRule = this.findMatchingRule(
      toolName,
      path,
      this.context.alwaysDenyRules
    );
    if (denyRule) {
      return this.deny(`Rule denied: ${denyRule.source}`);
    }

    // 4. 检查 Always Allow 规则
    const allowRule = this.findMatchingRule(
      toolName,
      path,
      this.context.alwaysAllowRules
    );
    if (allowRule) {
      return this.allow(`Rule allowed: ${allowRule.source}`);
    }

    // 5. 检查会话允许规则
    if (this.context.sessionAllowRules.includes(toolName)) {
      return this.allow('Session allowed');
    }

    // 6. 检查路径白名单
    if (path && this.isPathAllowed(path)) {
      return this.allow('Path allowed');
    }

    // 7. 检查路径黑名单
    if (path && this.isPathDenied(path)) {
      return this.deny('Path denied');
    }

    // 8. 根据模式决定
    return this.decideByMode(toolName);
  }

  /**
   * 根据模式决定
   */
  private decideByMode(toolName: string): PermissionDecision {
    switch (this.context.mode) {
      case 'bypassPermissions':
        return this.allow('Bypass mode');
      
      case 'dontAsk':
        return this.deny('dontAsk mode');
      
      case 'acceptEdits':
        return this.allow('Auto accept mode');
      
      case 'plan':
        return this.pause('Plan mode - waiting for approval');
      
      case 'auto':
        // 自动模式：对于只读操作允许，破坏性操作询问
        if (this.isReadOnlyTool(toolName)) {
          return this.allow('Auto mode: read-only tool');
        }
        return this.ask('Auto mode: requires confirmation');
      
      case 'default':
      default:
        return this.ask(`Default: requires confirmation for ${toolName}`);
    }
  }

  /**
   * 查找匹配的规则
   */
  private findMatchingRule(
    toolName: string,
    path: string | undefined,
    rules: PermissionRule[]
  ): PermissionRule | undefined {
    return rules.find(rule => {
      // 工具名匹配
      if (rule.toolName) {
        // 支持通配符
        if (rule.toolName.includes('*')) {
          const pattern = rule.toolName.replace('*', '.*');
          const regex = new RegExp(`^${pattern}$`);
          if (!regex.test(toolName)) return false;
        } else if (rule.toolName !== toolName) {
          return false;
        }
      }

      // 路径匹配
      if (rule.pathPattern && path) {
        const regex = new RegExp(rule.pathPattern);
        if (!regex.test(path)) return false;
      }

      return true;
    });
  }

  /**
   * 检查路径是否允许
   */
  private isPathAllowed(path: string): boolean {
    return this.context.autoAllowedPaths.some(pattern => {
      const regex = new RegExp(pattern);
      return regex.test(path);
    });
  }

  /**
   * 检查路径是否拒绝
   */
  private isPathDenied(path: string): boolean {
    return this.context.autoDeniedPaths.some(pattern => {
      const regex = new RegExp(pattern);
      return regex.test(path);
    });
  }

  /**
   * 判断是否为只读工具
   */
  private isReadOnlyTool(toolName: string): boolean {
    const readOnlyTools = [
      'read', 'grep', 'search', 'find', 'glob',
      'ls', 'cat', 'head', 'tail', 'view',
    ];
    return readOnlyTools.includes(toolName);
  }

  /**
   * 允许
   */
  private allow(reason: string): PermissionDecision {
    return { decision: 'allow', reason };
  }

  /**
   * 拒绝
   */
  private deny(reason: string): PermissionDecision {
    return { decision: 'deny', reason, action: 'block' };
  }

  /**
   * 询问
   */
  private ask(reason: string): PermissionDecision {
    return { decision: 'ask', reason, action: 'continue' };
  }

  /**
   * 暂停
   */
  private pause(reason: string): PermissionDecision {
    return { decision: 'pause', reason, action: 'wait_for_approval' };
  }

  /**
   * 添加规则
   */
  addRule(
    rule: PermissionRule,
    behavior: 'allow' | 'deny'
  ): void {
    if (behavior === 'allow') {
      this.context.alwaysAllowRules.push({ ...rule, behavior: 'allow' });
    } else {
      this.context.alwaysDenyRules.push({ ...rule, behavior: 'deny' });
    }
  }

  /**
   * 添加会话规则
   */
  addSessionRule(toolName: string, allow: boolean): void {
    if (allow) {
      this.context.sessionAllowRules.push(toolName);
    } else {
      this.context.sessionDenyRules.push(toolName);
    }
  }

  /**
   * 设置模式
   */
  setMode(mode: PermissionMode): void {
    this.context.mode = mode;
  }

  /**
   * 获取当前模式
   */
  getMode(): PermissionMode {
    return this.context.mode;
  }

  /**
   * 获取决策历史
   */
  getHistory(): Array<{
    toolName: string;
    decision: PermissionDecision;
    timestamp: number;
  }> {
    return [...this.decisionHistory];
  }

  /**
   * 清除历史
   */
  clearHistory(): void {
    this.decisionHistory = [];
  }

  /**
   * 获取统计
   */
  getStats(): {
    totalChecks: number;
    allows: number;
    denies: number;
    asks: number;
  } {
    const stats = {
      totalChecks: this.decisionHistory.length,
      allows: 0,
      denies: 0,
      asks: 0,
    };

    for (const entry of this.decisionHistory) {
      switch (entry.decision.decision) {
        case 'allow': stats.allows++; break;
        case 'deny': stats.denies++; break;
        case 'ask':
        case 'pause': stats.asks++; break;
      }
    }

    return stats;
  }
}

// 别名以保持向后兼容
export { PermissionSystem as PermissionService } from './index.js';
export { RuleEngine } from './rules.js';
export { PermissionModeManager } from './modes.js';
export { PermissionContextManager } from './context.js';

// 权限模式配置
export { PERMISSION_MODE_CONFIG } from './types.js';
