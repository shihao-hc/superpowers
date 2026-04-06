/**
 * Permission Rules
 * 权限规则引擎
 */

export interface PermissionRule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  condition: RuleCondition;
  action: 'allow' | 'deny';
  expiresAt?: number;
}

export interface RuleCondition {
  toolName?: string | string[];
  pathPattern?: string | string[];
  inputPattern?: Record<string, unknown>;
  userId?: string | string[];
  environment?: string[];
  timeRange?: {
    start: string;
    end: string;
  };
}

export interface RuleMatch {
  rule: PermissionRule;
  matched: boolean;
  reason: string;
}

export class RuleEngine {
  private rules: Map<string, PermissionRule> = new Map();
  private ruleOrder: string[] = [];

  addRule(rule: PermissionRule): void {
    this.rules.set(rule.id, rule);
    this.rebuildOrder();
  }

  removeRule(ruleId: string): boolean {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      this.rebuildOrder();
    }
    return deleted;
  }

  getRule(ruleId: string): PermissionRule | undefined {
    return this.rules.get(ruleId);
  }

  updateRule(ruleId: string, updates: Partial<PermissionRule>): void {
    const existing = this.rules.get(ruleId);
    if (existing) {
      this.rules.set(ruleId, { ...existing, ...updates });
      this.rebuildOrder();
    }
  }

  match(ruleId: string, context: RuleMatchContext): RuleMatch {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return {
        rule: null as unknown as PermissionRule,
        matched: false,
        reason: 'Rule not found'
      };
    }

    if (rule.expiresAt && rule.expiresAt < Date.now()) {
      return {
        rule,
        matched: false,
        reason: 'Rule expired'
      };
    }

    const { matched, reason } = this.evaluateCondition(rule.condition, context);
    return { rule, matched, reason };
  }

  matchAll(context: RuleMatchContext): RuleMatch[] {
    return this.ruleOrder.map(id => this.match(id, context));
  }

  findMatchingRule(context: RuleMatchContext, action: 'allow' | 'deny'): PermissionRule | undefined {
    for (const id of this.ruleOrder) {
      const rule = this.rules.get(id);
      if (!rule || rule.action !== action) continue;

      const { matched } = this.evaluateCondition(rule.condition, context);
      if (matched) {
        return rule;
      }
    }
    return undefined;
  }

  private evaluateCondition(condition: RuleCondition, context: RuleMatchContext): { matched: boolean; reason: string } {
    if (condition.toolName) {
      const toolNames = Array.isArray(condition.toolName) ? condition.toolName : [condition.toolName];
      if (!toolNames.includes(context.toolName)) {
        return { matched: false, reason: `Tool ${context.toolName} not in ${toolNames.join(', ')}` };
      }
    }

    if (condition.pathPattern) {
      const patterns = Array.isArray(condition.pathPattern) ? condition.pathPattern : [condition.pathPattern];
      const pathMatch = patterns.some(p => this.matchPath(context.requestedPath || '', p));
      if (!pathMatch && context.requestedPath) {
        return { matched: false, reason: `Path ${context.requestedPath} doesn't match any pattern` };
      }
    }

    if (condition.userId) {
      const users = Array.isArray(condition.userId) ? condition.userId : [condition.userId];
      if (!context.userId || !users.includes(context.userId)) {
        return { matched: false, reason: `User ${context.userId} not allowed` };
      }
    }

    if (condition.environment) {
      if (!condition.environment.includes(context.environment)) {
        return { matched: false, reason: `Environment ${context.environment} not allowed` };
      }
    }

    if (condition.timeRange) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const { start, end } = condition.timeRange;
      if (currentTime < start || currentTime > end) {
        return { matched: false, reason: `Time ${currentTime} outside range ${start}-${end}` };
      }
    }

    return { matched: true, reason: 'All conditions matched' };
  }

  private matchPath(path: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regexPattern}$`).test(path);
  }

  private rebuildOrder(): void {
    this.ruleOrder = Array.from(this.rules.values())
      .sort((a, b) => b.priority - a.priority)
      .map(r => r.id);
  }

  getAllRules(): PermissionRule[] {
    return this.ruleOrder.map(id => this.rules.get(id)!).filter(Boolean);
  }

  clear(): void {
    this.rules.clear();
    this.ruleOrder = [];
  }
}

export interface RuleMatchContext {
  toolName: string;
  toolInput?: unknown;
  requestedPath?: string;
  userId?: string;
  environment?: string;
}

export const commonRules = {
  readonlyFileAccess: {
    id: 'readonly-file-access',
    name: 'Read-only file access',
    priority: 100,
    condition: {
      toolName: ['Read', 'Glob', 'Grep'],
    },
    action: 'allow' as const
  },
  safeGitOperations: {
    id: 'safe-git-operations',
    name: 'Safe Git operations',
    priority: 90,
    condition: {
      toolName: ['Bash'],
      inputPattern: {
        command: /^(git (status|log|diff|show|branch|tag))/
      }
    },
    action: 'allow' as const
  },
  blockDestructive: {
    id: 'block-destructive',
    name: 'Block destructive operations',
    priority: 200,
    condition: {
      toolName: ['Bash'],
      inputPattern: {
        command: /(rm|del|format|wipe)/i
      }
    },
    action: 'deny' as const
  }
};

export const globalRuleEngine = new RuleEngine();
