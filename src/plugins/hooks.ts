/**
 * Plugin Hooks System
 */

import { EventEmitter } from 'events';

export type HookEvent = 
  | 'session.start'
  | 'session.end'
  | 'message.before'
  | 'message.after'
  | 'tool.before'
  | 'tool.after'
  | 'error'
  | 'state.update'
  | 'memory.before'
  | 'memory.after';

export interface HookDefinition {
  name: string;
  event: HookEvent;
  handler: HookHandler;
  priority?: number;
  enabled?: boolean;
}

export type HookHandler = (context: HookContext) => Promise<HookResult> | HookResult;

export interface HookContext {
  event: HookEvent;
  data?: unknown;
  sessionId?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface HookResult {
  handled: boolean;
  modified?: unknown;
  error?: string;
}

export class HookSystem extends EventEmitter {
  private hooks: Map<HookEvent, HookDefinition[]> = new Map();
  private globalHooks: HookDefinition[] = [];

  register(hook: HookDefinition): void {
    if (!this.hooks.has(hook.event)) {
      this.hooks.set(hook.event, []);
    }

    const hooks = this.hooks.get(hook.event)!;
    hooks.push({
      ...hook,
      priority: hook.priority ?? 0,
      enabled: hook.enabled ?? true
    });

    hooks.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    this.emit('hook:registered', { event: hook.event, name: hook.name });
  }

  unregister(name: string, event?: HookEvent): boolean {
    if (event) {
      const hooks = this.hooks.get(event);
      if (hooks) {
        const index = hooks.findIndex(h => h.name === name);
        if (index !== -1) {
          hooks.splice(index, 1);
          return true;
        }
      }
      return false;
    }

    for (const [event, hooks] of this.hooks) {
      const index = hooks.findIndex(h => h.name === name);
      if (index !== -1) {
        hooks.splice(index, 1);
        return true;
      }
    }

    return false;
  }

  registerGlobal(hook: HookDefinition): void {
    this.globalHooks.push({
      ...hook,
      priority: hook.priority ?? 0,
      enabled: hook.enabled ?? true
    });
  }

  async emit(event: HookEvent, data?: unknown, context?: Partial<HookContext>): Promise<HookResult[]> {
    const results: HookResult[] = [];
    const hookContext: HookContext = {
      event,
      data,
      timestamp: Date.now(),
      ...context
    };

    const eventHooks = this.hooks.get(event) || [];
    const enabledHooks = eventHooks.filter(h => h.enabled !== false);

    for (const hook of enabledHooks) {
      try {
        const result = await this.executeHook(hook, hookContext);
        results.push(result);
      } catch (error) {
        results.push({
          handled: false,
          error: String(error)
        });
      }
    }

    for (const hook of this.globalHooks) {
      if (hook.enabled !== false) {
        try {
          const result = await this.executeHook(hook, hookContext);
          results.push(result);
        } catch (error) {
          results.push({
            handled: false,
            error: String(error)
          });
        }
      }
    }

    return results;
  }

  private async executeHook(hook: HookDefinition, context: HookContext): Promise<HookResult> {
    try {
      const result = await hook.handler(context);

      if (result && typeof result === 'object' && 'modified' in result) {
        return result as HookResult;
      }

      return {
        handled: true,
        modified: result as unknown
      };
    } catch (error) {
      return {
        handled: false,
        error: String(error)
      };
    }
  }

  getHooks(event?: HookEvent): HookDefinition[] {
    if (event) {
      return this.hooks.get(event) || [];
    }
    return Array.from(this.hooks.values()).flat();
  }

  enableHook(name: string, event?: HookEvent): boolean {
    if (event) {
      const hooks = this.hooks.get(event);
      const hook = hooks?.find(h => h.name === name);
      if (hook) {
        hook.enabled = true;
        return true;
      }
    }

    for (const hooks of this.hooks.values()) {
      const hook = hooks.find(h => h.name === name);
      if (hook) {
        hook.enabled = true;
        return true;
      }
    }

    return false;
  }

  disableHook(name: string, event?: HookEvent): boolean {
    if (event) {
      const hooks = this.hooks.get(event);
      const hook = hooks?.find(h => h.name === name);
      if (hook) {
        hook.enabled = false;
        return true;
      }
    }

    for (const hooks of this.hooks.values()) {
      const hook = hooks.find(h => h.name === name);
      if (hook) {
        hook.enabled = false;
        return true;
      }
    }

    return false;
  }

  clear(): void {
    this.hooks.clear();
    this.globalHooks = [];
  }
}

export const globalHookSystem = new HookSystem();
