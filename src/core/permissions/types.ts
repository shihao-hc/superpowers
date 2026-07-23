/**
 * Shared Permission Types
 */

export type PermissionMode = 
  | 'default'
  | 'plan'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'dontAsk'
  | 'auto';

export interface PermissionDecision {
  decision: 'allow' | 'deny' | 'ask' | 'pause';
  reason?: string;
  action?: 'continue' | 'wait_for_approval' | 'block';
}

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

export interface PermissionContext {
  mode: PermissionMode;
  alwaysAllowRules: PermissionRule[];
  alwaysDenyRules: PermissionRule[];
  sessionAllowRules: string[];
  sessionDenyRules: string[];
  autoAllowedPaths: string[];
  autoDeniedPaths: string[];
  deniedRules: string[];
}

export const PERMISSION_MODE_CONFIG: Record<PermissionMode, {
  title: string;
  symbol: string;
  color: string;
}> = {
  default: { title: 'Default', symbol: '', color: 'text' },
  plan: { title: 'Plan Mode', symbol: '⏸', color: 'planMode' },
  acceptEdits: { title: 'Accept edits', symbol: '⏵⏵', color: 'autoAccept' },
  bypassPermissions: { title: 'Bypass Permissions', symbol: '⏵⏵', color: 'error' },
  dontAsk: { title: "Don't Ask", symbol: '⏵⏵', color: 'error' },
  auto: { title: 'Auto mode', symbol: '⏵⏵', color: 'warning' },
};
