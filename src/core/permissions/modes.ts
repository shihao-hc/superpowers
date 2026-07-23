/**
 * Permission Modes
 * 权限模式定义和转换
 */

import type { PermissionMode, PermissionDecision } from './index.js';
import type { PermissionContext } from './context.js';

export interface ModeConfig {
  mode: PermissionMode;
  description: string;
  requiresConfirmation: boolean;
  canBypass: boolean;
  autoDecision?: 'allow' | 'deny' | 'ask';
}

export const PERMISSION_MODES: Record<PermissionMode, ModeConfig> = {
  default: {
    mode: 'default',
    description: 'Default mode - ask for permission on each action',
    requiresConfirmation: true,
    canBypass: false,
    autoDecision: 'ask'
  },
  plan: {
    mode: 'plan',
    description: 'Plan mode - pause execution, require approval',
    requiresConfirmation: true,
    canBypass: false,
    autoDecision: 'pause'
  },
  acceptEdits: {
    mode: 'acceptEdits',
    description: 'Auto-accept code edits',
    requiresConfirmation: false,
    canBypass: true,
    autoDecision: 'allow'
  },
  bypassPermissions: {
    mode: 'bypassPermissions',
    description: 'Bypass all permission checks',
    requiresConfirmation: false,
    canBypass: true,
    autoDecision: 'allow'
  },
  dontAsk: {
    mode: 'dontAsk',
    description: 'Deny all permission requests',
    requiresConfirmation: false,
    canBypass: false,
    autoDecision: 'deny'
  },
  auto: {
    mode: 'auto',
    description: 'Auto mode - use rules to decide',
    requiresConfirmation: false,
    canBypass: false
  }
};

export class PermissionModeManager {
  private currentMode: PermissionMode = 'default';
  private modeStack: PermissionMode[] = [];

  setMode(mode: PermissionMode): void {
    if (mode === this.currentMode) return;
    
    this.modeStack.push(this.currentMode);
    this.currentMode = mode;
  }

  restorePreviousMode(): PermissionMode | undefined {
    const previous = this.modeStack.pop();
    if (previous) {
      this.currentMode = previous;
    }
    return previous;
  }

  getMode(): PermissionMode {
    return this.currentMode;
  }

  getModeConfig(): ModeConfig {
    return PERMISSION_MODES[this.currentMode];
  }

  decide(context: PermissionContext): PermissionDecision {
    const config = this.getModeConfig();

    if (config.autoDecision) {
      return {
        tool: '',
        input: {},
        decision: config.autoDecision,
        reason: `Mode: ${this.currentMode}`,
        timestamp: Date.now()
      };
    }

    if (this.currentMode === 'auto') {
      return this.decideFromRules(context);
    }

    return {
      tool: '',
      input: {},
      decision: 'ask',
      reason: 'Default decision',
      timestamp: Date.now()
    };
  }

  private decideFromRules(context: PermissionContext): PermissionDecision {
    if (context.deniedRules.length > 0) {
      return {
        tool: '',
        input: {},
        decision: 'deny',
        reason: 'Denied in session',
        timestamp: Date.now()
      };
    }

    if (context.sessionAllowRules.length > 0) {
      return {
        tool: '',
        input: {},
        decision: 'allow',
        reason: 'Allowed in session',
        timestamp: Date.now()
      };
    }

    return {
      tool: '',
      input: {},
      decision: 'ask',
      reason: 'No matching rules',
      timestamp: Date.now()
    };
  }

  canUserApprove(mode: PermissionMode): boolean {
    const config = PERMISSION_MODES[mode];
    return config.requiresConfirmation;
  }

  isBypassMode(mode: PermissionMode): boolean {
    return mode === 'bypassPermissions' || mode === 'acceptEdits';
  }

  getAvailableModes(): ModeConfig[] {
    return Object.values(PERMISSION_MODES);
  }

  validateMode(mode: string): mode is PermissionMode {
    return mode in PERMISSION_MODES;
  }

  reset(): void {
    this.currentMode = 'default';
    this.modeStack = [];
  }
}

export function createModeTransition(
  from: PermissionMode,
  to: PermissionMode
): ModeTransition {
  return {
    from,
    to,
    timestamp: Date.now(),
    reason: PERMISSION_MODES[to].description
  };
}

export interface ModeTransition {
  from: PermissionMode;
  to: PermissionMode;
  timestamp: number;
  reason: string;
}

export const globalModeManager = new PermissionModeManager();
