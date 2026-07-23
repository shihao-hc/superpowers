/**
 * Dead Code Elimination (DCE) Utilities
 * 基于 Claude Code 的 bun:bundle DCE 实现
 */

export interface DCEConfig {
  enabled: boolean;
  removeConsole?: boolean;
  removeDebug?: boolean;
  minify?: boolean;
}

export interface BuildFlags {
  [key: string]: boolean;
}

export class DCEOptimizer {
  private config: DCEConfig;
  private buildFlags: BuildFlags;

  constructor(config: DCEConfig = { enabled: true }) {
    this.config = {
      enabled: true,
      removeConsole: false,
      removeDebug: false,
      minify: false,
      ...config
    };
    this.buildFlags = {};
  }

  setBuildFlag(name: string, value: boolean): void {
    this.buildFlags[name] = value;
  }

  getBuildFlag(name: string): boolean {
    return this.buildFlags[name] ?? false;
  }

  process(source: string): string {
    if (!this.config.enabled) return source;

    let processed = source;

    processed = this.removeDisabledBlocks(processed);
    processed = this.removeUnusedExports(processed);

    if (this.config.removeConsole) {
      processed = this.removeConsoleLogs(processed);
    }

    if (this.config.removeDebug) {
      processed = this.removeDebugCode(processed);
    }

    return processed;
  }

  private removeDisabledBlocks(source: string): string {
    return source
      .replace(/\/\/#if\s+!([\w]+)[\s\S]*?\/\/#endif/g, '')
      .replace(/\/\*#if\s+!([\w]+)[\s\S]*?#endif\*\//g, '');
  }

  private removeUnusedExports(source: string): string {
    return source
      .replace(/export\s+(const|let|var|function|class)\s+\w+\s*=\s*(?![^;]*\bif\b)/g, 'const ');
  }

  private removeConsoleLogs(source: string): string {
    return source
      .replace(/console\.(log|debug|info|warn|error)\s*\([^)]*\)\s*;?/g, '')
      .replace(/console\.\w+\s*\([^)]*\)\s*;?/gm, '');
  }

  private removeDebugCode(source: string): string {
    return source
      .replace(/debugger\s*;?/g, '')
      .replace(/\/\/\s*debug:.*$/gm, '')
      .replace(/\/\*[\s\S]*?debug[\s\S]*?\*\//g, '');
  }

  getFeatureCode(featureName: string, source: string, enabledCode: string, disabledCode: string): string {
    if (this.buildFlags[featureName]) {
      return source.replace(disabledCode, '');
    }
    return source.replace(enabledCode, '');
  }

  treeShake(imports: string[], source: string): string {
    const usedExports = new Set<string>();

    for (const importStatement of imports) {
      const match = importStatement.match(/import\s+\{?\s*(\w+)/);
      if (match) {
        usedExports.add(match[1]);
      }
    }

    return source;
  }
}

export function conditionalImport(
  module: string,
  flagName: string,
  buildFlags: BuildFlags
): unknown | null {
  if (buildFlags[flagName]) {
    try {
      return require(module);
    } catch {
      return null;
    }
  }
  return null;
}

export function featureGuard<T>(
  featureName: string,
  enabledFn: () => T,
  disabledFn?: () => T,
  buildFlags?: BuildFlags
): T | undefined {
  if (buildFlags && !buildFlags[featureName]) {
    return disabledFn?.();
  }
  return enabledFn();
}

export const dceOptimizer = new DCEOptimizer();

export const BUNDLE_CONDITIONALS = {
  AGENT_LOOP: 'AGENT_LOOP_ENABLED',
  TOOL_SYSTEM: 'TOOL_SYSTEM_ENABLED',
  COMPACT: 'COMPACT_ENABLED',
  PERMISSIONS: 'PERMISSIONS_ENABLED',
  STREAMING: 'STREAMING_ENABLED'
} as const;
