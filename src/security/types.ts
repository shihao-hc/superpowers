/**
 * Security Types - 安全类型定义
 * 
 * 基于 Claude Code 权限架构
 */

export type PermissionMode = 
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'bypassPermissions'
  | 'dontAsk'
  | 'auto';

export interface PermissionRule {
  tool?: string;
  subcommand?: string;
  allow?: boolean;
  deny?: boolean;
}

export interface PermissionDecision {
  behavior: 'allow' | 'ask' | 'deny' | 'passthrough';
  reason?: string;
  message?: string;
}

export interface PathValidationResult {
  valid: boolean;
  resolvedPath?: string;
  error?: string;
  isDangerous?: boolean;
}

export interface ToolPermissionContext {
  mode: PermissionMode;
  rules: PermissionRule[];
  cwd: string;
}

export interface SanitizationOptions {
  removeUnicode?: boolean;
  normalize?: boolean;
}
