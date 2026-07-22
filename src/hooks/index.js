/**
 * Hooks Module - 兼容层
 * 兼容旧的 CommonJS 导入方式
 *
 * 服务器需要: HooksManager, HookEvents, HookResult, HookType 等
 * TypeScript版本有: HookRegistry
 */

// 简化版 HooksManager - 基于 TypeScript 版本的 HookRegistry
const EventEmitter = require('events');

const HookEvents = {
  PRE_TOOL_USE: 'BeforeTool',
  POST_TOOL_USE: 'AfterTool',
  TOOL_ERROR: 'OnError',
  PRE_AGENT: 'BeforeAgent',
  POST_AGENT: 'AfterAgent',
  AGENT_ERROR: 'OnError',
  SESSION_START: 'SessionStart',
  SESSION_END: 'SessionEnd',
  MESSAGE_SEND: 'BeforeMessage',
  MESSAGE_RECEIVE: 'AfterMessage',
  PRE_COMPACT: 'BeforeCompact',
  POST_COMPACT: 'AfterCompact',
  PERMISSION_REQUEST: 'PermissionRequest',
  PERMISSION_DENIED: 'PermissionDenied'
};

const HookResult = {
  ALLOWED: { modified: false },
  BLOCKED: (output) => ({ modified: true, output, error: 'blocked' }),
  ASYNC: { modified: false }
};

const HookType = {
  COMMAND: 'command',
  PROMPT: 'prompt',
  AGENT: 'agent',
  HTTP: 'http'
};

class HooksManager extends EventEmitter {
  constructor() {
    super();
    this.hooks = new Map();
    this.enabled = true;
  }

  register(config) {
    const hooks = this.hooks.get(config.event) || [];
    hooks.push(config);
    hooks.sort((a, b) => (a.order || 0) - (b.order || 0));
    this.hooks.set(config.event, hooks);
    return true;
  }

  unregister(name) {
    for (const [_event, hooks] of this.hooks) {
      const index = hooks.findIndex((h) => h.name === name);
      if (index >= 0) {
        hooks.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  hasHook(name) {
    return this.getHooks().some((h) => h.name === name);
  }

  async trigger(event, context = {}) {
    const hooks = this.hooks.get(event) || [];
    const results = [];

    for (const hook of hooks) {
      try {
        if (typeof hook.handler === 'function') {
          const result = await hook.handler(context);
          results.push(result);
        }
      } catch (error) {
        results.push({ error: error.message });
      }
    }

    return results;
  }

  getHooks(event) {
    if (event) {
      return this.hooks.get(event) || [];
    }
    return Array.from(this.hooks.values()).flat();
  }

  clear() {
    this.hooks.clear();
  }
}

// 导出全局注册表 (兼容测试中的 globalHookRegistry)
const globalHookRegistry = new HooksManager();

function registerHook(config) {
  return globalHookRegistry.register(config);
}

function unregisterHook(name) {
  return globalHookRegistry.unregister(name);
}

async function triggerHook(event, context) {
  return globalHookRegistry.trigger(event, context);
}

module.exports = {
  HooksManager,
  HookRegistry: HooksManager, // 兼容别名
  HookEvents,
  HookResult,
  HookType,
  getDefaultManager: () => new HooksManager(),
  defaultManager: globalHookRegistry,
  globalHookRegistry, // 兼容测试
  registerHook,
  unregisterHook,
  triggerHook
};

// 导出带 default 的兼容模块
module.exports.default = module.exports;
