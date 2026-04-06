/**
 * Feature Flags System - 基于 Claude Code 特性开关架构
 * 支持 DCE (Dead Code Elimination)、动态特性、A/B 测试
 */

import { EventEmitter } from 'events';
import type { AgentContext } from '../core/agent-loop/types';

export interface FeatureConfig {
  enabled: boolean;
  description?: string;
  category?: FeatureCategory;
  metadata?: Record<string, unknown>;
  rollout?: RolloutConfig;
  dependencies?: string[];
  envVar?: string;
}

export interface RolloutConfig {
  percentage?: number;
  userIds?: string[];
  environment?: 'development' | 'staging' | 'production';
  minVersion?: string;
}

export type FeatureCategory = 
  | 'core'
  | 'agent'
  | 'tool'
  | 'permission'
  | 'telemetry'
  | 'ui'
  | 'experimental'
  | 'runtime';

export interface Feature {
  name: string;
  enabled: boolean;
  description: string;
  category: FeatureCategory;
  metadata: Record<string, unknown>;
  rollout?: RolloutConfig;
  dependencies: string[];
  registeredAt: number;
  lastModified: number;
}

export interface FeatureContext {
  userId?: string;
  environment?: string;
  version?: string;
  sessionId?: string;
}

export class FeatureFlags extends EventEmitter {
  private features: Map<string, Feature> = new Map();
  private categories: Map<FeatureCategory, Set<string>> = new Map();
  private dynamicFlags: Set<string> = new Set();
  private context: FeatureContext = {};

  constructor(context: FeatureContext = {}) {
    super();
    this.context = context;
    this.initCategories();
    this.registerDefaults();
  }

  private initCategories() {
    const cats: FeatureCategory[] = [
      'core', 'agent', 'tool', 'permission', 'telemetry', 'ui', 'experimental', 'runtime'
    ];
    for (const cat of cats) {
      this.categories.set(cat, new Set());
    }
  }

  private registerDefaults() {
    const defaults: Record<string, FeatureConfig> = {
      // Core
      AGENT_LOOP: { 
        enabled: true, 
        category: 'core',
        description: 'Agent 循环架构'
      },
      TOOL_SYSTEM: { 
        enabled: true, 
        category: 'core',
        description: '工具系统'
      },
      CONTEXT_COMPACT: { 
        enabled: true, 
        category: 'core',
        description: '上下文压缩'
      },
      PERMISSION_SYSTEM: { 
        enabled: true, 
        category: 'core',
        description: '权限系统'
      },
      
      // Agent
      STREAMING: { 
        enabled: true, 
        category: 'agent',
        description: '流式响应'
      },
      ERROR_RECOVERY: { 
        enabled: true, 
        category: 'agent',
        description: '错误恢复'
      },
      TOKEN_BUDGET: { 
        enabled: true, 
        category: 'agent',
        description: 'Token 预算管理'
      },
      MODEL_FALLBACK: { 
        enabled: false, 
        category: 'agent',
        description: '模型降级'
      },

      // Tools
      CONCURRENT_TOOLS: { 
        enabled: true, 
        category: 'tool',
        description: '并行工具执行'
      },
      TOOL_CACHING: { 
        enabled: true, 
        category: 'tool',
        description: '工具结果缓存'
      },
      TOOL_RETRY: { 
        enabled: true, 
        category: 'tool',
        description: '工具重试机制'
      },

      // Permission
      AUTO_PERMISSION: { 
        enabled: false, 
        category: 'permission',
        description: '自动权限模式'
      },
      DENY_TRACKING: { 
        enabled: true, 
        category: 'permission',
        description: '拒绝追踪'
      },

      // Telemetry
      TELEMETRY: { 
        enabled: false, 
        category: 'telemetry',
        description: '遥测收集'
      },
      COST_TRACKING: { 
        enabled: true, 
        category: 'telemetry',
        description: '成本追踪'
      },

      // UI
      PROGRESS_UI: { 
        enabled: true, 
        category: 'ui',
        description: '进度显示'
      },
      DARK_MODE: { 
        enabled: true, 
        category: 'ui',
        description: '深色模式'
      },

      // Experimental
      MULTI_AGENT: { 
        enabled: false, 
        category: 'experimental',
        description: '多 Agent 协作'
      },
      DAG_WORKFLOW: { 
        enabled: false, 
        category: 'experimental',
        description: 'DAG 工作流'
      },

      // Runtime
      DEBUG_MODE: { 
        enabled: process.env.DEBUG === 'true', 
        category: 'runtime',
        description: '调试模式',
        envVar: 'DEBUG'
      },
      TEST_MODE: { 
        enabled: process.env.TEST === 'true', 
        category: 'runtime',
        description: '测试模式',
        envVar: 'TEST'
      }
    };

    for (const [name, config] of Object.entries(defaults)) {
      this.register(name, config);
    }
  }

  register(name: string, config: FeatureConfig): Feature {
    const feature: Feature = {
      name,
      enabled: config.enabled,
      description: config.description || '',
      category: config.category || 'experimental',
      metadata: config.metadata || {},
      rollout: config.rollout,
      dependencies: config.dependencies || [],
      registeredAt: Date.now(),
      lastModified: Date.now()
    };

    this.features.set(name, feature);
    this.categories.get(feature.category)?.add(name);

    if (config.envVar) {
      this.dynamicFlags.add(name);
    }

    this.emit('feature:registered', feature);
    return feature;
  }

  enable(name: string): boolean {
    const feature = this.features.get(name);
    if (!feature) {
      this.register(name, { enabled: true });
      return true;
    }

    if (!feature.enabled) {
      feature.enabled = true;
      feature.lastModified = Date.now();
      this.emit('feature:enabled', { name });
    }

    return true;
  }

  disable(name: string): boolean {
    const feature = this.features.get(name);
    if (!feature) return false;

    if (feature.enabled) {
      feature.enabled = false;
      feature.lastModified = Date.now();
      this.emit('feature:disabled', { name });
    }

    return true;
  }

  toggle(name: string): boolean {
    const feature = this.features.get(name);
    if (!feature) return false;

    if (feature.enabled) {
      this.disable(name);
    } else {
      this.enable(name);
    }

    return feature.enabled;
  }

  isEnabled(name: string, context?: FeatureContext): boolean {
    const feature = this.features.get(name);
    if (!feature) return false;

    if (!feature.enabled) return false;

    if (feature.rollout) {
      return this.evaluateRollout(feature, context || this.context);
    }

    if (feature.envVar) {
      return process.env[feature.envVar] === 'true';
    }

    return true;
  }

  private evaluateRollout(feature: Feature, context: FeatureContext): boolean {
    const rollout = feature.rollout;
    if (!rollout) return true;

    if (rollout.environment) {
      if (context.environment && context.environment !== rollout.environment) {
        return false;
      }
    }

    if (rollout.minVersion) {
      if (context.version && this.compareVersions(context.version, rollout.minVersion) < 0) {
        return false;
      }
    }

    if (rollout.userIds && rollout.userIds.length > 0) {
      if (context.userId && !rollout.userIds.includes(context.userId)) {
        return false;
      }
    }

    if (rollout.percentage !== undefined) {
      if (context.sessionId) {
        const hash = this.hashString(context.sessionId);
        const bucket = hash % 100;
        if (bucket >= rollout.percentage) {
          return false;
        }
      }
    }

    return true;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;
      if (numA > numB) return 1;
      if (numA < numB) return -1;
    }
    return 0;
  }

  check(name: string, context?: FeatureContext): boolean {
    return this.isEnabled(name, context);
  }

  ifEnabled<T>(name: string, callback: () => T, fallback?: () => T): T | undefined {
    if (this.isEnabled(name)) {
      return callback();
    }
    return fallback?.();
  }

  requireEnabled(name: string): void {
    if (!this.isEnabled(name)) {
      throw new Error(`Feature ${name} is not enabled`);
    }
  }

  get(name: string): Feature | undefined {
    return this.features.get(name);
  }

  getAll(): Feature[] {
    return Array.from(this.features.values());
  }

  getByCategory(category: FeatureCategory): Feature[] {
    const names = this.categories.get(category);
    if (!names) return [];
    return Array.from(names).map(name => this.features.get(name)!).filter(Boolean);
  }

  getEnabled(): Feature[] {
    return this.getAll().filter(f => f.enabled);
  }

  getStats() {
    const all = this.getAll();
    const enabled = this.getEnabled();
    
    return {
      total: all.length,
      enabled: enabled.length,
      disabled: all.length - enabled.length,
      percentage: Math.round((enabled.length / all.length) * 100),
      byCategory: this.getStatsByCategory()
    };
  }

  private getStatsByCategory(): Record<FeatureCategory, { total: number; enabled: number }> {
    const stats: Record<string, { total: number; enabled: number }> = {};
    
    for (const [category, names] of this.categories) {
      const features = Array.from(names).map(name => this.features.get(name)!).filter(Boolean);
      stats[category] = {
        total: features.length,
        enabled: features.filter(f => f.enabled).length
      };
    }
    
    return stats as Record<FeatureCategory, { total: number; enabled: number }>;
  }

  export(): { features: Record<string, Partial<FeatureConfig>>; exportedAt: number } {
    const features: Record<string, Partial<FeatureConfig>> = {};
    
    for (const [name, feature] of this.features) {
      features[name] = {
        enabled: feature.enabled,
        description: feature.description,
        category: feature.category,
        rollout: feature.rollout
      };
    }
    
    return { features, exportedAt: Date.now() };
  }

  import(config: { features: Record<string, Partial<FeatureConfig>> }): void {
    for (const [name, featureConfig] of Object.entries(config.features)) {
      if (featureConfig.enabled !== undefined) {
        if (featureConfig.enabled) {
          this.enable(name);
        } else {
          this.disable(name);
        }
      }
    }
  }

  reset(): void {
    this.features.clear();
    this.initCategories();
    this.registerDefaults();
    this.emit('features:reset');
  }

  setContext(context: FeatureContext): void {
    this.context = { ...this.context, ...context };
  }

  getContext(): FeatureContext {
    return { ...this.context };
  }
}

export const globalFeatures = new FeatureFlags();

export function feature(name: string) {
  return function _feature(
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const original = descriptor.value;
    
    descriptor.value = function (...args: unknown[]) {
      if (!globalFeatures.isEnabled(name)) {
        return;
      }
      return original.apply(this, args);
    };
    
    return descriptor;
  };
}

export function requiresFeature(name: string) {
  return function _requiresFeature(
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const original = descriptor.value;
    
    descriptor.value = async function (...args: unknown[]) {
      globalFeatures.requireEnabled(name);
      return original.apply(this, args);
    };
    
    return descriptor;
  };
}
