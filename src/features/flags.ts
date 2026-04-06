/**
 * Feature Flags Management
 */

import { EventEmitter } from 'events';

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description?: string;
  category?: string;
  rollout?: RolloutConfig;
}

export interface RolloutConfig {
  percentage?: number;
  userIds?: string[];
  environments?: string[];
}

export class FeatureFlagManager extends EventEmitter {
  private flags: Map<string, FeatureFlag> = new Map();
  private defaults: Map<string, boolean> = new Map();

  register(name: string, config: FeatureFlagConfig): void {
    const flag: FeatureFlag = {
      name,
      enabled: config.enabled ?? false,
      description: config.description,
      category: config.category,
      rollout: config.rollout
    };

    this.flags.set(name, flag);
    this.emit('flag:registered', flag);
  }

  enable(name: string): boolean {
    const flag = this.flags.get(name);
    if (!flag) {
      this.register(name, { enabled: true });
      return true;
    }

    flag.enabled = true;
    this.emit('flag:enabled', { name });
    return true;
  }

  disable(name: string): boolean {
    const flag = this.flags.get(name);
    if (!flag) return false;

    flag.enabled = false;
    this.emit('flag:disabled', { name });
    return true;
  }

  isEnabled(name: string, context?: RolloutContext): boolean {
    const flag = this.flags.get(name);
    if (!flag) {
      return this.defaults.get(name) ?? false;
    }

    if (!flag.enabled) return false;

    if (flag.rollout) {
      return this.evaluateRollout(flag.rollout, context);
    }

    return true;
  }

  private evaluateRollout(config: RolloutConfig, context?: RolloutContext): boolean {
    if (config.environments && context?.environment) {
      if (!config.environments.includes(context.environment)) {
        return false;
      }
    }

    if (config.userIds && context?.userId) {
      if (!config.userIds.includes(context.userId)) {
        return false;
      }
    }

    if (config.percentage !== undefined && context?.sessionId) {
      const hash = this.hashSessionId(context.sessionId);
      return (hash % 100) < config.percentage;
    }

    return true;
  }

  private hashSessionId(sessionId: string): number {
    let hash = 0;
    for (let i = 0; i < sessionId.length; i++) {
      hash = ((hash << 5) - hash) + sessionId.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  get(name: string): FeatureFlag | undefined {
    return this.flags.get(name);
  }

  getAll(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  getByCategory(category: string): FeatureFlag[] {
    return this.getAll().filter(f => f.category === category);
  }

  setDefault(name: string, defaultValue: boolean): void {
    this.defaults.set(name, defaultValue);
  }

  export(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const [name, flag] of this.flags) {
      result[name] = flag.enabled;
    }
    return result;
  }

  import(config: Record<string, boolean>): void {
    for (const [name, enabled] of Object.entries(config)) {
      if (enabled) {
        this.enable(name);
      } else {
        this.disable(name);
      }
    }
  }

  reset(): void {
    this.flags.clear();
    this.emit('flags:reset');
  }
}

export interface FeatureFlagConfig {
  enabled?: boolean;
  description?: string;
  category?: string;
  rollout?: RolloutConfig;
}

export interface RolloutContext {
  userId?: string;
  sessionId?: string;
  environment?: string;
}

export const globalFeatureFlagManager = new FeatureFlagManager();
