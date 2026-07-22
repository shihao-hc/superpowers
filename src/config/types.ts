/**
 * Config Types - 配置类型定义
 */

import { z } from 'zod';

export const EnvironmentVariablesSchema = z.record(z.string(), z.string());

export const PermissionRuleSchema = z.object({
  tool: z.string(),
  allow: z.boolean().optional(),
  deny: z.boolean().optional(),
});

export const SettingsSchema = z.object({
  model: z.string().optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  thinkingBudget: z.enum(['off', 'low', 'medium', 'high']).optional(),
  permissionMode: z.enum(['accept', 'deny', 'bypassPermissions']).optional(),
  mcpServers: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  env: EnvironmentVariablesSchema.optional(),
  autoDebug: z.boolean().optional(),
  verbose: z.boolean().optional(),
  outputFormat: z.enum(['text', 'json', 'stream-json']).optional(),
  permissions: z.array(PermissionRuleSchema).optional(),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type EnvironmentVariables = z.infer<typeof EnvironmentVariablesSchema>;

export type SettingSource = 
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'flagSettings'
  | 'policySettings';

export interface SettingsWithSources {
  settings: Settings;
  sources: Partial<Record<SettingSource, Settings>>;
}

export interface SettingsWithErrors {
  settings: Settings;
  errors: Array<{
    path: string;
    message: string;
    value: unknown;
  }>;
}
