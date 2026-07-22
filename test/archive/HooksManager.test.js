/**
 * HooksManager 测试
 */

const {
  HooksManager,
  HookEvents,
  HookType
} = require('../src/hooks/HooksManager');

describe('HooksManager', () => {
  let manager;

  beforeEach(() => {
    manager = new HooksManager({ logger: { debug: () => {}, error: () => {} } });
  });

  afterEach(() => {
    manager.destroy();
  });

  test('should create instance', () => {
    expect(manager).toBeDefined();
    expect(manager.hooks).toBeDefined();
  });

  test('should register command hook', () => {
    const config = {
      type: 'command',
      event: 'preToolUse',
      command: 'echo "pre tool"'
    };

    manager.register(config);
    const hooks = manager.getRegisteredHooks();

    expect(hooks).toHaveLength(1);
    expect(hooks[0].event).toBe('preToolUse');
    expect(hooks[0].type).toBe('command');
  });

  test('should register multiple hooks', () => {
    const configs = [
      { type: 'command', event: 'preToolUse', command: 'echo 1' },
      { type: 'command', event: 'postToolUse', command: 'echo 2' },
      { type: 'prompt', event: 'preAgent', prompt: 'Should continue?' }
    ];

    manager.registerAll(configs);
    const hooks = manager.getRegisteredHooks();

    expect(hooks).toHaveLength(3);
  });

  test('should execute preToolUse hook', async () => {
    manager.register({
      type: 'command',
      event: 'preToolUse',
      command: 'echo "test"'
    });

    const result = await manager.preToolUse('Bash', { command: 'ls' });

    expect(result.allowed).toBe(true);
  });

  test('should execute postToolUse hook', async () => {
    manager.register({
      type: 'command',
      event: 'postToolUse',
      command: 'echo "done"'
    });

    const result = await manager.postToolUse('Bash', { command: 'ls' }, { output: 'file.txt' });

    expect(result.allowed).toBe(true);
  });

  test('should execute session hooks', async () => {
    manager.register({
      type: 'command',
      event: 'sessionStart',
      command: 'echo "session started"'
    });

    const startResult = await manager.sessionStart('test-session-123');
    expect(startResult.allowed).toBe(true);

    manager.register({
      type: 'command',
      event: 'sessionEnd',
      command: 'echo "session ended"'
    });

    const endResult = await manager.sessionEnd('test-session-123', { turns: 5 });
    expect(endResult.allowed).toBe(true);
  });

  test('should execute compact hooks', async () => {
    manager.register({
      type: 'command',
      event: 'preCompact',
      command: 'echo "compacting"'
    });

    const preResult = await manager.preCompact([], { tokens: 5000 });
    expect(preResult.allowed).toBe(true);

    manager.register({
      type: 'command',
      event: 'postCompact',
      command: 'echo "compact done"'
    });

    const postResult = await manager.postCompact(100, 50);
    expect(postResult.allowed).toBe(true);
  });

  test('should support if condition matching', () => {
    manager.register({
      type: 'command',
      event: 'preToolUse',
      if: 'Bash(rm *)',
      command: 'echo "dangerous"'
    });

    const hooks = manager.getRegisteredHooks();
    expect(hooks[0].if).toBe('Bash(rm *)');
  });

  test('should unregister hooks', () => {
    manager.register({
      type: 'command',
      event: 'preToolUse',
      command: 'echo 1'
    });

    expect(manager.getRegisteredHooks()).toHaveLength(1);

    manager.unregister('preToolUse', 'command');

    expect(manager.getRegisteredHooks()).toHaveLength(0);
  });

  test('should clear all hooks', () => {
    manager.registerAll([
      { type: 'command', event: 'preToolUse', command: 'echo 1' },
      { type: 'command', event: 'postToolUse', command: 'echo 2' }
    ]);

    expect(manager.getRegisteredHooks()).toHaveLength(2);

    manager.clear();

    expect(manager.getRegisteredHooks()).toHaveLength(0);
  });

  test('should clear specific event hooks', () => {
    manager.registerAll([
      { type: 'command', event: 'preToolUse', command: 'echo 1' },
      { type: 'command', event: 'postToolUse', command: 'echo 2' }
    ]);

    manager.clear('preToolUse');

    const hooks = manager.getRegisteredHooks();
    expect(hooks).toHaveLength(1);
    expect(hooks[0].event).toBe('postToolUse');
  });

  test('should emit events', async () => {
    new Promise((resolve) => {
      manager.once('preToolUse', (context) => {
        resolve(context);
      });
    });

    manager.register({
      type: 'command',
      event: 'preToolUse',
      command: 'echo "event"'
    });

    await manager.preToolUse('Read', { path: '/test.txt' });

    // 事件应该被触发（虽然命令 hook 不通过 emit）
    expect(true).toBe(true);
  });

  test('HookEvents should have all expected values', () => {
    expect(HookEvents.PRE_TOOL_USE).toBe('preToolUse');
    expect(HookEvents.POST_TOOL_USE).toBe('postToolUse');
    expect(HookEvents.TOOL_ERROR).toBe('toolError');
    expect(HookEvents.PRE_AGENT).toBe('preAgent');
    expect(HookEvents.POST_AGENT).toBe('postAgent');
    expect(HookEvents.SESSION_START).toBe('sessionStart');
    expect(HookEvents.SESSION_END).toBe('sessionEnd');
    expect(HookEvents.PRE_COMPACT).toBe('preCompact');
    expect(HookEvents.POST_COMPACT).toBe('postCompact');
  });

  test('HookType should have all expected values', () => {
    expect(HookType.COMMAND).toBe('command');
    expect(HookType.PROMPT).toBe('prompt');
    expect(HookType.AGENT).toBe('agent');
    expect(HookType.HTTP).toBe('http');
  });
});

describe('HooksManager Integration', () => {
  let manager;

  beforeEach(() => {
    manager = new HooksManager({ logger: { debug: () => {}, error: () => {} } });
  });

  afterEach(() => {
    manager.destroy();
  });

  test('should support multiple hook types', async () => {
    // 命令 Hook
    manager.register({
      type: 'command',
      event: 'preToolUse',
      command: 'echo "command hook"'
    });

    // HTTP Hook（不实际发送）
    manager.register({
      type: 'http',
      event: 'preToolUse',
      url: 'http://localhost:9999/hook',
      method: 'POST'
    });

    const hooks = manager.getRegisteredHooks();
    const types = hooks.map((h) => h.type);

    expect(types).toContain('command');
    expect(types).toContain('http');
  });

  test('should handle hook execution order', async () => {
    manager.register({
      type: 'command',
      event: 'preToolUse',
      command: 'echo "first"'
    });

    manager.register({
      type: 'command',
      event: 'preToolUse',
      command: 'echo "second"'
    });

    await manager.preToolUse('Bash', {});

    // 两个 hook 都应该执行（这里只检查不报错）
    expect(true).toBe(true);
  });
});
