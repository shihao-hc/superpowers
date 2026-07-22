const { HooksManager, HookEvents, HookResult, HookType, globalHookRegistry, registerHook, unregisterHook, triggerHook, getDefaultManager, defaultManager } = require('../../src/hooks/index');

describe('HookEvents constants', () => {
  it('defines all hook events', () => {
    expect(HookEvents).toEqual({
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
    });
  });
});

describe('HookResult constants', () => {
  it('ALLOWED has modified false', () => {
    expect(HookResult.ALLOWED).toEqual({ modified: false });
  });

  it('BLOCKED returns modified true with error', () => {
    const result = HookResult.BLOCKED('access denied');
    expect(result).toEqual({ modified: true, output: 'access denied', error: 'blocked' });
  });

  it('ASYNC has modified false', () => {
    expect(HookResult.ASYNC).toEqual({ modified: false });
  });
});

describe('HookType constants', () => {
  it('defines all hook types', () => {
    expect(HookType).toEqual({
      COMMAND: 'command',
      PROMPT: 'prompt',
      AGENT: 'agent',
      HTTP: 'http'
    });
  });
});

describe('HooksManager', () => {
  let manager;

  beforeEach(() => {
    manager = new HooksManager();
  });

  describe('constructor', () => {
    it('initializes empty hooks map and enabled=true', () => {
      expect(manager.hooks).toBeInstanceOf(Map);
      expect(manager.hooks.size).toBe(0);
      expect(manager.enabled).toBe(true);
    });
  });

  describe('register', () => {
    it('registers a hook config for an event', () => {
      const config = { event: HookEvents.PRE_TOOL_USE, name: 'test-hook', handler: jest.fn() };
      const result = manager.register(config);

      expect(result).toBe(true);
      const hooks = manager.hooks.get(HookEvents.PRE_TOOL_USE);
      expect(hooks).toHaveLength(1);
      expect(hooks[0]).toEqual(config);
    });

    it('sorts hooks by order', () => {
      manager.register({ event: HookEvents.PRE_TOOL_USE, name: 'second', handler: jest.fn(), order: 2 });
      manager.register({ event: HookEvents.PRE_TOOL_USE, name: 'first', handler: jest.fn(), order: 1 });

      const hooks = manager.hooks.get(HookEvents.PRE_TOOL_USE);
      expect(hooks[0].name).toBe('first');
      expect(hooks[1].name).toBe('second');
    });

    it('defaults order to 0', () => {
      manager.register({ event: HookEvents.PRE_TOOL_USE, name: 'b', handler: jest.fn() });
      manager.register({ event: HookEvents.PRE_TOOL_USE, name: 'a', handler: jest.fn(), order: -1 });

      const hooks = manager.hooks.get(HookEvents.PRE_TOOL_USE);
      expect(hooks[0].name).toBe('a');
      expect(hooks[1].name).toBe('b');
    });

    it('handles order 0 explicitly alongside positive order', () => {
      manager.register({ event: HookEvents.PRE_TOOL_USE, name: 'low', handler: jest.fn(), order: 0 });
      manager.register({ event: HookEvents.PRE_TOOL_USE, name: 'high', handler: jest.fn(), order: 5 });

      const hooks = manager.hooks.get(HookEvents.PRE_TOOL_USE);
      expect(hooks[0].name).toBe('low');
      expect(hooks[1].name).toBe('high');
    });

    it('handles positive order registered before zero order', () => {
      manager.register({ event: HookEvents.PRE_TOOL_USE, name: 'pos', handler: jest.fn(), order: 5 });
      manager.register({ event: HookEvents.PRE_TOOL_USE, name: 'zero', handler: jest.fn(), order: 0 });

      const hooks = manager.hooks.get(HookEvents.PRE_TOOL_USE);
      expect(hooks[0].name).toBe('zero');
      expect(hooks[1].name).toBe('pos');
    });

    it('registers hooks for different events separately', () => {
      manager.register({ event: HookEvents.SESSION_START, name: 's1', handler: jest.fn() });
      manager.register({ event: HookEvents.SESSION_END, name: 's2', handler: jest.fn() });

      expect(manager.hooks.get(HookEvents.SESSION_START)).toHaveLength(1);
      expect(manager.hooks.get(HookEvents.SESSION_END)).toHaveLength(1);
    });
  });

  describe('unregister', () => {
    it('removes a hook by name', () => {
      manager.register({ event: HookEvents.PRE_TOOL_USE, name: 'test-hook', handler: jest.fn() });

      const result = manager.unregister('test-hook');
      expect(result).toBe(true);
      expect(manager.hooks.get(HookEvents.PRE_TOOL_USE)).toHaveLength(0);
    });

    it('returns false if hook not found', () => {
      const result = manager.unregister('nonexistent');
      expect(result).toBe(false);
    });

    it('removes hook from event that has it when multiple events exist', () => {
      manager.register({ event: HookEvents.SESSION_START, name: 's1', handler: jest.fn() });
      manager.register({ event: HookEvents.SESSION_END, name: 's2', handler: jest.fn() });

      manager.unregister('s1');
      expect(manager.hooks.get(HookEvents.SESSION_START)).toHaveLength(0);
      expect(manager.hooks.get(HookEvents.SESSION_END)).toHaveLength(1);
    });

    it('traverses multiple events when name is not in first', () => {
      manager.register({ event: HookEvents.SESSION_START, name: 'other', handler: jest.fn() });
      manager.register({ event: HookEvents.SESSION_END, name: 'target', handler: jest.fn() });

      const result = manager.unregister('target');
      expect(result).toBe(true);
      expect(manager.hooks.get(HookEvents.SESSION_START)).toHaveLength(1);
      expect(manager.hooks.get(HookEvents.SESSION_END)).toHaveLength(0);
    });
  });

  describe('hasHook', () => {
    it('returns true if hook exists', () => {
      manager.register({ event: HookEvents.PRE_TOOL_USE, name: 'test-hook', handler: jest.fn() });
      expect(manager.hasHook('test-hook')).toBe(true);
    });

    it('returns false if hook does not exist', () => {
      expect(manager.hasHook('nonexistent')).toBe(false);
    });
  });

  describe('trigger', () => {
    it('executes handlers for an event', async () => {
      const handler = jest.fn().mockResolvedValue('ok');
      manager.register({ event: HookEvents.PRE_TOOL_USE, name: 'test-hook', handler });

      const results = await manager.trigger(HookEvents.PRE_TOOL_USE, { some: 'context' });

      expect(handler).toHaveBeenCalledWith({ some: 'context' });
      expect(results).toEqual(['ok']);
    });

    it('returns empty array if no hooks for event', async () => {
      const results = await manager.trigger(HookEvents.PRE_TOOL_USE);
      expect(results).toEqual([]);
    });

    it('catches handler errors and returns them', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('hook failed'));
      manager.register({ event: HookEvents.PRE_TOOL_USE, name: 'failing', handler });

      const results = await manager.trigger(HookEvents.PRE_TOOL_USE);

      expect(results).toEqual([{ error: 'hook failed' }]);
    });

    it('executes multiple hooks in order', async () => {
      const order = [];
      manager.register({ event: HookEvents.PRE_TOOL_USE, name: 'a', order: 1, handler: jest.fn().mockImplementation(async () => order.push('a')) });
      manager.register({ event: HookEvents.PRE_TOOL_USE, name: 'b', order: 2, handler: jest.fn().mockImplementation(async () => order.push('b')) });

      await manager.trigger(HookEvents.PRE_TOOL_USE);
      expect(order).toEqual(['a', 'b']);
    });

    it('skips non-function handlers', async () => {
      manager.register({ event: HookEvents.PRE_TOOL_USE, name: 'no-fn', handler: 'not a function' });

      const results = await manager.trigger(HookEvents.PRE_TOOL_USE);
      expect(results).toEqual([]);
    });
  });

  describe('getHooks', () => {
    it('returns hooks for a specific event', () => {
      manager.register({ event: HookEvents.SESSION_START, name: 's1', handler: jest.fn() });
      const hooks = manager.getHooks(HookEvents.SESSION_START);
      expect(hooks).toHaveLength(1);
    });

    it('returns empty array for event with no hooks', () => {
      const hooks = manager.getHooks(HookEvents.SESSION_START);
      expect(hooks).toEqual([]);
    });

    it('returns all hooks flattened when no event given', () => {
      manager.register({ event: HookEvents.SESSION_START, name: 's1', handler: jest.fn() });
      manager.register({ event: HookEvents.SESSION_END, name: 's2', handler: jest.fn() });

      const all = manager.getHooks();
      expect(all).toHaveLength(2);
    });

    it('returns empty array when no hooks registered', () => {
      const all = manager.getHooks();
      expect(all).toEqual([]);
    });
  });

  describe('clear', () => {
    it('removes all hooks', () => {
      manager.register({ event: HookEvents.SESSION_START, name: 's1', handler: jest.fn() });
      manager.clear();
      expect(manager.hooks.size).toBe(0);
    });
  });
});

describe('global singleton and convenience functions', () => {
  afterEach(() => {
    globalHookRegistry.clear();
  });

  describe('globalHookRegistry', () => {
    it('is a HooksManager instance', () => {
      expect(globalHookRegistry).toBeInstanceOf(HooksManager);
    });

    it('registers and triggers hooks', async () => {
      const handler = jest.fn().mockResolvedValue('global ok');
      globalHookRegistry.register({ event: HookEvents.SESSION_START, name: 'global-hook', handler });

      const results = await globalHookRegistry.trigger(HookEvents.SESSION_START);
      expect(results).toEqual(['global ok']);
    });
  });

  describe('registerHook', () => {
    it('delegates to globalHookRegistry', () => {
      const config = { event: HookEvents.SESSION_START, name: 'via-register', handler: jest.fn() };
      const result = registerHook(config);
      expect(result).toBe(true);
      expect(globalHookRegistry.hasHook('via-register')).toBe(true);
    });
  });

  describe('unregisterHook', () => {
    it('delegates to globalHookRegistry', () => {
      registerHook({ event: HookEvents.SESSION_START, name: 'to-remove', handler: jest.fn() });
      const result = unregisterHook('to-remove');
      expect(result).toBe(true);
      expect(globalHookRegistry.hasHook('to-remove')).toBe(false);
    });

    it('returns false for nonexistent hook', () => {
      const result = unregisterHook('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('triggerHook', () => {
    it('delegates to globalHookRegistry', async () => {
      const handler = jest.fn().mockResolvedValue('triggered');
      registerHook({ event: HookEvents.SESSION_START, name: 'trigger-test', handler });

      const results = await triggerHook(HookEvents.SESSION_START);
      expect(results).toEqual(['triggered']);
    });

    it('returns empty array when no hooks', async () => {
      const results = await triggerHook(HookEvents.SESSION_START);
      expect(results).toEqual([]);
    });
  });

  describe('getDefaultManager', () => {
    it('returns a new HooksManager instance', () => {
      const mgr = getDefaultManager();
      expect(mgr).toBeInstanceOf(HooksManager);
      expect(mgr).not.toBe(globalHookRegistry);
    });
  });

  describe('defaultManager', () => {
    it('is the same as globalHookRegistry', () => {
      expect(defaultManager).toBe(globalHookRegistry);
    });

    it('is a HooksManager instance', () => {
      expect(defaultManager).toBeInstanceOf(HooksManager);
    });
  });
});

describe('module.exports', () => {
  it('has a default export that equals the module itself', () => {
    const mod = require('../../src/hooks/index');
    expect(mod.default).toBe(mod);
  });

  it('exports all expected members', () => {
    const mod = require('../../src/hooks/index');
    expect(mod).toHaveProperty('HooksManager');
    expect(mod).toHaveProperty('HookRegistry');
    expect(mod).toHaveProperty('HookEvents');
    expect(mod).toHaveProperty('HookResult');
    expect(mod).toHaveProperty('HookType');
    expect(mod).toHaveProperty('getDefaultManager');
    expect(mod).toHaveProperty('defaultManager');
    expect(mod).toHaveProperty('globalHookRegistry');
    expect(mod).toHaveProperty('registerHook');
    expect(mod).toHaveProperty('unregisterHook');
    expect(mod).toHaveProperty('triggerHook');
  });

  it('HookRegistry is an alias for HooksManager', () => {
    const mod = require('../../src/hooks/index');
    expect(mod.HookRegistry).toBe(mod.HooksManager);
  });
});
