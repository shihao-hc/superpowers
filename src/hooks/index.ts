export type HookEvent = 
  | 'SessionStart'
  | 'Setup'
  | 'BeforeTool'
  | 'AfterTool'
  | 'BeforeMessage'
  | 'AfterMessage'
  | 'BeforeAgent'
  | 'AfterAgent'
  | 'OnError'
  | 'BeforeCompact'
  | 'AfterCompact'

export interface HookResult {
  modified?: boolean
  output?: string
  error?: string
}

export interface HookContext {
  sessionId?: string
  taskId?: string
  toolName?: string
  message?: string
  timestamp: number
}

export type HookHandler = (
  context: HookContext,
  data?: unknown
) => Promise<HookResult | void>

export interface HookDefinition {
  name: string
  event: HookEvent
  handler: HookHandler
  timeout?: number
  order?: number
}

export class HookRegistry {
  private hooks: Map<HookEvent, HookDefinition[]> = new Map()
  private pendingHooks: Map<string, { startTime: number; timeout: number }> = new Map()

  register(hook: HookDefinition): void {
    const hooks = this.hooks.get(hook.event) || []
    hooks.push(hook)
    hooks.sort((a, b) => (a.order || 0) - (b.order || 0))
    this.hooks.set(hook.event, hooks)
  }

  unregister(name: string): boolean {
    for (const [event, hooks] of this.hooks.entries()) {
      const index = hooks.findIndex(h => h.name === name)
      if (index !== -1) {
        hooks.splice(index, 1)
        return true
      }
    }
    return false
  }

  async trigger(event: HookEvent, context: HookContext, data?: unknown): Promise<HookResult[]> {
    const hooks = this.hooks.get(event) || []
    const results: HookResult[] = []

    for (const hook of hooks) {
      try {
        const result = await this.executeWithTimeout(hook, context, data)
        if (result) results.push(result)
      } catch (err) {
        results.push({
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return results
  }

  private async executeWithTimeout(
    hook: HookDefinition,
    context: HookContext,
    data?: unknown,
  ): Promise<HookResult | void> {
    const timeout = hook.timeout || 30000
    const hookId = `${hook.name}_${Date.now()}`
    this.pendingHooks.set(hookId, { startTime: Date.now(), timeout })

    try {
      const result = await Promise.race([
        hook.handler(context, data),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Hook ${hook.name} timed out`)), timeout)
        ),
      ])

      this.pendingHooks.delete(hookId)
      return result as HookResult | void
    } catch (err) {
      this.pendingHooks.delete(hookId)
      throw err
    }
  }

  getHooks(event?: HookEvent): HookDefinition[] {
    if (event) {
      return this.hooks.get(event) || []
    }
    return Array.from(this.hooks.values()).flat()
  }

  hasHook(name: string): boolean {
    return this.getHooks().some(h => h.name === name)
  }

  clear(): void {
    this.hooks.clear()
    this.pendingHooks.clear()
  }

  getPendingCount(): number {
    return this.pendingHooks.size
  }
}

export const globalHookRegistry = new HookRegistry()

export function registerHook(hook: HookDefinition): void {
  globalHookRegistry.register(hook)
}

export function unregisterHook(name: string): boolean {
  return globalHookRegistry.unregister(name)
}

export async function triggerHook(
  event: HookEvent,
  context: Partial<HookContext> = {},
  data?: unknown,
): Promise<HookResult[]> {
  return globalHookRegistry.trigger(event, {
    timestamp: Date.now(),
    ...context,
  } as HookContext, data)
}
