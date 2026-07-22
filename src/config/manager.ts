/**
 * Config Manager - 配置管理器
 * 
 * 支持多源配置合并、验证和热更新
 */

import { z } from 'zod';
import { SettingsSchema, type Settings, type SettingSource, type SettingsWithErrors } from './types.js';

const SOURCE_PRIORITY: Record<SettingSource, number> = {
  userSettings: 1,
  projectSettings: 2,
  localSettings: 3,
  flagSettings: 4,
  policySettings: 5,
};

export class ConfigManager {
  private sources: Map<SettingSource, Settings> = new Map();
  private listeners: Set<(settings: Settings) => void> = new Set();
  private cache: Settings | null = null;

  setSource(source: SettingSource, settings: Settings): void {
    this.sources.set(source, settings);
    this.cache = null;
    this.notifyListeners();
  }

  getSource(source: SettingSource): Settings | undefined {
    return this.sources.get(source);
  }

  getMerged(): Settings {
    if (this.cache) {
      return { ...this.cache };
    }

    const sortedSources = Array.from(this.sources.entries())
      .sort((a, b) => SOURCE_PRIORITY[a[0]] - SOURCE_PRIORITY[b[0]]);

    const merged: Record<string, unknown> = {};
    for (const [, settings] of sortedSources) {
      Object.assign(merged, settings);
    }

    this.cache = merged as Settings;
    return { ...this.cache };
  }

  validate(): SettingsWithErrors {
    const merged = this.getMerged();
    
    try {
      const result = SettingsSchema.parse(merged);
      return { settings: result, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          settings: merged,
          errors: error.issues.map((e: any) => ({
            path: e.path.join('.'),
            message: e.message,
            value: e.code,
          })),
        };
      }
      return {
        settings: merged,
        errors: [{ path: 'unknown', message: String(error), value: null }],
      };
    }
  }

  get<T extends keyof Settings>(key: T): Settings[T] | undefined {
    const merged = this.getMerged();
    return merged[key];
  }

  set<T extends keyof Settings>(key: T, value: Settings[T]): void {
    const localSettings = this.sources.get('localSettings') || {};
    this.sources.set('localSettings', { ...localSettings, [key]: value });
    this.cache = null;
    this.notifyListeners();
  }

  subscribe(listener: (settings: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const settings = this.getMerged();
    for (const listener of this.listeners) {
      try {
        listener(settings);
      } catch (error) {
        console.error('[ConfigManager] Listener error:', error);
      }
    }
  }

  reset(): void {
    this.sources.clear();
    this.cache = null;
    this.notifyListeners();
  }

  getAllSources(): SettingSource[] {
    return Array.from(this.sources.keys());
  }
}

export const globalConfigManager = new ConfigManager();

export function mergeSettings(...sources: (Settings | undefined)[]): Settings {
  const merged: Record<string, unknown> = {};
  
  for (const source of sources) {
    if (source) {
      Object.assign(merged, source);
    }
  }
  
  return merged as Settings;
}

export function getSettingValue<T>(
  settings: Settings,
  key: string,
  defaultValue: T
): T {
  const value = (settings as Record<string, unknown>)[key];
  return value !== undefined ? (value as T) : defaultValue;
}
