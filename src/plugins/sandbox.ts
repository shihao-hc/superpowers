/**
 * Plugin Sandbox
 * 沙箱隔离执行环境
 */

export interface SandboxConfig {
  timeout?: number;
  memoryLimit?: number;
  allowedModules?: string[];
  allowedAPIs?: string[];
  restrictedGlobals?: string[];
}

export interface SandboxContext {
  name: string;
  allowedModules: string[];
  allowedAPIs: string[];
  memory: Map<string, unknown>;
  createdAt: number;
}

export interface SandboxResult {
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
}

export class PluginSandboxImpl {
  private contexts: Map<string, SandboxContext> = new Map();
  private timeout: number;
  private memoryLimit: number;
  private allowedModules: string[];
  private allowedAPIs: string[];

  constructor(config: SandboxConfig = {}) {
    this.timeout = config.timeout || 5000;
    this.memoryLimit = config.memoryLimit || 100 * 1024 * 1024;
    this.allowedModules = config.allowedModules || [];
    this.allowedAPIs = config.allowedAPIs || ['console', 'setTimeout', 'clearTimeout', 'Promise'];
  }

  createContext(name: string, config?: Partial<SandboxConfig>): SandboxContext {
    const context: SandboxContext = {
      name,
      allowedModules: config?.allowedModules || this.allowedModules,
      allowedAPIs: config?.allowedAPIs || this.allowedAPIs,
      memory: new Map(),
      createdAt: Date.now()
    };

    this.contexts.set(name, context);
    return context;
  }

  async run(
    pluginName: string,
    fn: string | Function,
    args: unknown[] = []
  ): Promise<SandboxResult> {
    const context = this.contexts.get(pluginName);
    if (!context) {
      throw new Error(`Sandbox context not found: ${pluginName}`);
    }

    const startTime = Date.now();

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          success: false,
          error: `Execution timeout after ${this.timeout}ms`,
          duration: Date.now() - startTime
        });
      }, this.timeout);

      try {
        let result: unknown;

        if (typeof fn === 'function') {
          result = fn(...args);
        } else {
          throw new Error('Invalid function');
        }

        clearTimeout(timer);
        resolve({
          success: true,
          result,
          duration: Date.now() - startTime
        });
      } catch (error) {
        clearTimeout(timer);
        resolve({
          success: false,
          error: String(error),
          duration: Date.now() - startTime
        });
      }
    });
  }

  async runAsync(
    pluginName: string,
    fn: string | Function,
    args: unknown[] = []
  ): Promise<SandboxResult> {
    const context = this.contexts.get(pluginName);
    if (!context) {
      throw new Error(`Sandbox context not found: ${pluginName}`);
    }

    const startTime = Date.now();

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          success: false,
          error: `Execution timeout after ${this.timeout}ms`,
          duration: Date.now() - startTime
        });
      }, this.timeout);

      Promise.resolve()
        .then(() => {
          if (typeof fn === 'function') {
            return fn(...args);
          }
          throw new Error('Invalid function');
        })
        .then((result) => {
          clearTimeout(timer);
          resolve({
            success: true,
            result,
            duration: Date.now() - startTime
          });
        })
        .catch((error) => {
          clearTimeout(timer);
          resolve({
            success: false,
            error: String(error),
            duration: Date.now() - startTime
          });
        });
    });
  }

  getContext(name: string): SandboxContext | undefined {
    return this.contexts.get(name);
  }

  setValue(pluginName: string, key: string, value: unknown): void {
    const context = this.contexts.get(pluginName);
    if (context) {
      context.memory.set(key, value);
    }
  }

  getValue(pluginName: string, key: string): unknown {
    const context = this.contexts.get(pluginName);
    return context?.memory.get(key);
  }

  clearMemory(pluginName: string): void {
    const context = this.contexts.get(pluginName);
    if (context) {
      context.memory.clear();
    }
  }

  destroy(pluginName: string): void {
    this.contexts.delete(pluginName);
  }

  destroyAll(): void {
    this.contexts.clear();
  }

  getMemoryUsage(pluginName: string): number {
    const context = this.contexts.get(pluginName);
    if (!context) return 0;

    let size = 0;
    for (const [, value] of context.memory) {
      size += JSON.stringify(value).length;
    }
    return size;
  }

  isMemoryLimitExceeded(pluginName: string): boolean {
    return this.getMemoryUsage(pluginName) > this.memoryLimit;
  }
}

export const globalSandbox = new PluginSandboxImpl();
