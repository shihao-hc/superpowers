const ToolExecutor = require('../../src/core/ToolExecutor');
const { safeSpawn } = require('../../src/utils/SafeExec');
const fs = require('fs');

jest.mock('../../src/utils/SafeExec', () => ({ safeSpawn: jest.fn() }));

describe('ToolExecutor', () => {
  let executor;
  let mockChild;

  function createMockChild() {
    const h = {};
    const mock = {
      stdout: { on: jest.fn((e, fn) => { if (e === 'data') h.stdout = fn; }) },
      stderr: { on: jest.fn((e, fn) => { if (e === 'data') h.stderr = fn; }) },
      on: jest.fn((e, fn) => { h[e] = fn; }),
      _h: h
    };
    return mock;
  }

  function setupChildHandlers(mock) {
    return {
      stdoutHandler: mock.stdout.on.mock.calls.find(c => c[0] === 'data')[1],
      stderrHandler: mock.stderr.on.mock.calls.find(c => c[0] === 'data')[1],
      closeHandler: mock.on.mock.calls.find(c => c[0] === 'close')[1],
      errorHandler: mock.on.mock.calls.find(c => c[0] === 'error')[1]
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockChild = createMockChild();
    safeSpawn.mockReturnValue(mockChild);
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(fs, 'mkdirSync').mockReturnValue();
    jest.spyOn(fs, 'writeFileSync').mockReturnValue();
    jest.spyOn(fs, 'unlinkSync').mockReturnValue();
    executor = new ToolExecutor({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('stores brain reference', () => {
      expect(executor.brain).toEqual({});
    });

    test('creates 4 tools', () => {
      expect(Object.keys(executor.tools)).toHaveLength(4);
      expect(executor.tools).toHaveProperty('node');
      expect(executor.tools).toHaveProperty('command');
      expect(executor.tools).toHaveProperty('test');
      expect(executor.tools).toHaveProperty('lint');
    });

    test('initializes empty history', () => {
      expect(executor.history).toEqual([]);
      expect(executor.maxHistory).toBe(50);
    });

    test('safeCommands contains basic commands', () => {
      expect(executor.safeCommands.has('node')).toBe(true);
      expect(executor.safeCommands.has('npm')).toBe(true);
      expect(executor.safeCommands.has('git')).toBe(true);
      expect(executor.safeCommands.has('echo')).toBe(true);
      expect(executor.safeCommands.has('pwd')).toBe(true);
      expect(executor.safeCommands.has('ls')).toBe(true);
      expect(executor.safeCommands.has('dir')).toBe(true);
      expect(executor.safeCommands.has('type')).toBe(true);
      expect(executor.safeCommands.has('cat')).toBe(true);
      expect(executor.safeCommands.has('cd')).toBe(true);
    });

    test('safeCommands does not contain dangerous commands', () => {
      expect(executor.safeCommands.has('rm')).toBe(false);
      expect(executor.safeCommands.has('del')).toBe(false);
      expect(executor.safeCommands.has('format')).toBe(false);
    });

    test('console.log on init', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation();
      new ToolExecutor({});
      expect(spy).toHaveBeenCalledWith('[ToolExecutor] 工具执行器已初始化');
      spy.mockRestore();
    });
  });

  describe('_detectLanguage', () => {
    test('returns javascript for function keyword', () => {
      expect(executor._detectLanguage('function foo() {}')).toBe('javascript');
    });

    test('returns javascript for const keyword', () => {
      expect(executor._detectLanguage('const x = 1;')).toBe('javascript');
    });

    test('returns javascript for require call', () => {
      expect(executor._detectLanguage('require("fs")')).toBe('javascript');
    });

    test('returns shell for echo command', () => {
      expect(executor._detectLanguage('echo hello')).toBe('shell');
    });

    test('returns shell for ls command', () => {
      expect(executor._detectLanguage('ls -la')).toBe('shell');
    });

    test('returns shell for git command', () => {
      expect(executor._detectLanguage('git status')).toBe('shell');
    });

    test('returns unknown for unrecognized code', () => {
      expect(executor._detectLanguage('xyzzy plugh')).toBe('unknown');
    });

    test('JS check takes priority over shell', () => {
      expect(executor._detectLanguage('function() { git pull; }')).toBe('javascript');
    });
  });

  describe('_isSafeCommand', () => {
    test('rejects commands containing dangerous patterns', () => {
      expect(executor._isSafeCommand('rm -rf')).toBe(false);
      expect(executor._isSafeCommand('format')).toBe(false);
      expect(executor._isSafeCommand('mkfs')).toBe(false);
      expect(executor._isSafeCommand('dd if=')).toBe(false);
    });

    test('allows whitelisted commands', () => {
      expect(executor._isSafeCommand('node')).toBe(true);
      expect(executor._isSafeCommand('npm')).toBe(true);
      expect(executor._isSafeCommand('git')).toBe(true);
      expect(executor._isSafeCommand('echo')).toBe(true);
      expect(executor._isSafeCommand('pwd')).toBe(true);
    });

    test('allows commands starting with echo', () => {
      expect(executor._isSafeCommand('echo_test')).toBe(true);
    });

    test('rejects unknown commands', () => {
      expect(executor._isSafeCommand('blarg')).toBe(false);
      expect(executor._isSafeCommand('somerandom')).toBe(false);
    });

    test('del alone is not in whitelist', () => {
      expect(executor._isSafeCommand('del')).toBe(false);
    });

    test('allows npm script commands via startsWith', () => {
      expect(executor._isSafeCommand('npm test')).toBe(true);
      expect(executor._isSafeCommand('npm run build')).toBe(true);
    });
  });

  describe('_record', () => {
    test('adds execution to history', () => {
      executor._record({ id: '1', success: true });
      expect(executor.history).toHaveLength(1);
      expect(executor.history[0]).toEqual({ id: '1', success: true });
    });

    test('enforces maxHistory limit', () => {
      for (let i = 0; i < 55; i++) {
        executor._record({ id: `${i}`, success: true });
      }
      expect(executor.history).toHaveLength(50);
      expect(executor.history[0].id).toBe('5');
      expect(executor.history[49].id).toBe('54');
    });

    test('handles under maxHistory normally', () => {
      for (let i = 0; i < 3; i++) {
        executor._record({ id: `${i}`, success: true });
      }
      expect(executor.history).toHaveLength(3);
    });
  });

  describe('getStats', () => {
    test('returns zeros when no history', () => {
      expect(executor.getStats()).toEqual({ total: 0, success: 0, successRate: '0%' });
    });

    test('computes success rate', () => {
      executor.history = [
        { success: true }, { success: true }, { success: false }, { success: true }
      ];
      expect(executor.getStats()).toEqual({ total: 4, success: 3, successRate: '75%' });
    });

    test('handles all success', () => {
      executor.history = [{ success: true }, { success: true }];
      expect(executor.getStats()).toEqual({ total: 2, success: 2, successRate: '100%' });
    });

    test('handles all failure', () => {
      executor.history = [{ success: false }, { success: false }];
      expect(executor.getStats()).toEqual({ total: 2, success: 0, successRate: '0%' });
    });
  });

  describe('diagnose', () => {
    test('returns operational status with tools and history', () => {
      executor.history.push({ id: '1' });
      const info = executor.diagnose();
      expect(info.tools).toBe(4);
      expect(info.scripts).toBe(0);
      expect(info.history).toBe(1);
      expect(info.health).toBe('operational');
    });
  });

  describe('_initAutoTest', () => {
    test('reads scripts from package.json when it exists', () => {
      jest.restoreAllMocks();
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => p.endsWith('package.json'));
      jest.spyOn(fs, 'readFileSync').mockReturnValue('{"scripts":{"test":"jest","start":"node index.js"}}');
      jest.spyOn(fs, 'mkdirSync').mockReturnValue();
      jest.spyOn(fs, 'writeFileSync').mockReturnValue();
      jest.spyOn(fs, 'unlinkSync').mockReturnValue();
      const spy = jest.spyOn(console, 'log').mockImplementation();
      const exe = new ToolExecutor({});
      expect(exe.scripts).toEqual(['test', 'start']);
      expect(spy).toHaveBeenCalledWith('[ToolExecutor] 发现 2 个可执行脚本');
      spy.mockRestore();
    });

    test('handles missing package.json gracefully', () => {
      expect(executor.scripts).toBeUndefined();
    });

    test('handles package.json without scripts field', () => {
      jest.restoreAllMocks();
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => p.endsWith('package.json'));
      jest.spyOn(fs, 'readFileSync').mockReturnValue('{"name":"test"}');
      jest.spyOn(fs, 'mkdirSync').mockReturnValue();
      jest.spyOn(fs, 'writeFileSync').mockReturnValue();
      jest.spyOn(fs, 'unlinkSync').mockReturnValue();
      const exe = new ToolExecutor({});
      expect(exe.scripts).toEqual([]);
    });
  });

  describe('execute', () => {
    test('executes shell code via _executeCommand', async () => {
      const promise = executor.execute('echo hello');
      const { closeHandler, stdoutHandler } = setupChildHandlers(mockChild);
      stdoutHandler('hello world');
      closeHandler(0);
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.output).toBe('hello world');
      expect(result.error).toBeNull();
      expect(safeSpawn).toHaveBeenCalledWith('echo', ['hello'], expect.any(Object));
    });

    test('executes javascript code via _executeNode', async () => {
      const promise = executor.execute('const x = 1;');
      const { closeHandler, stdoutHandler } = setupChildHandlers(mockChild);
      stdoutHandler('1');
      closeHandler(0);
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.output).toBe('1');
    });

    test('handles shell command failure with stderr', async () => {
      const promise = executor.execute('echo fail');
      const { closeHandler, stderrHandler } = setupChildHandlers(mockChild);
      stderrHandler('command not found');
      closeHandler(1);
      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('command not found');
    });

    test('handles shell command failure without stderr', async () => {
      const promise = executor.execute('echo fail');
      const { closeHandler } = setupChildHandlers(mockChild);
      closeHandler(127);
      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Exit code: 127');
    });

    test('handles unsafe shell command', async () => {
      // 'format' is detected as shell (contains 'echo') but first word 'format' is dangerous
      const promise = executor.execute('format c: /q; echo done');
      await expect(promise).resolves.toMatchObject({
        success: false,
        error: '不安全命令: format'
      });
    });

    test('handles error event on child process', async () => {
      const promise = executor.execute('echo hello');
      const { errorHandler } = setupChildHandlers(mockChild);
      errorHandler(new Error('spawn error'));
      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('spawn error');
    });

    test('returns unknown language message for unrecognized code', async () => {
      const result = await executor.execute('xyzzy');
      expect(result.success).toBe(true);
      expect(result.output).toBe('不支持的语言类型');
    });

    test('records execution in history', async () => {
      const promise = executor.execute('echo hi');
      const { closeHandler, stdoutHandler } = setupChildHandlers(mockChild);
      stdoutHandler('hi');
      closeHandler(0);
      await promise;
      expect(executor.history).toHaveLength(1);
      expect(executor.history[0].success).toBe(true);
      expect(executor.history[0].code).toBe('echo hi');
    });

    test('sets execution id from timestamp', async () => {
      const promise = executor.execute('echo hi');
      const { closeHandler, stdoutHandler } = setupChildHandlers(mockChild);
      stdoutHandler('hi');
      closeHandler(0);
      const result = await promise;
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
    });

    test('sets duration', async () => {
      const promise = executor.execute('echo hi');
      const { closeHandler, stdoutHandler } = setupChildHandlers(mockChild);
      stdoutHandler('hi');
      closeHandler(0);
      const result = await promise;
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    test('truncates code to 100 chars in execution record', async () => {
      const longCode = 'a'.repeat(200);
      safeSpawn.mockReset();
      const promise = executor.execute(longCode);
      await expect(promise).resolves.toMatchObject({
        code: 'a'.repeat(100)
      });
    });

    test('passes timeout option to _executeCommand', async () => {
      const promise = executor.execute('echo hi', { timeout: 5000 });
      const { closeHandler, stdoutHandler } = setupChildHandlers(mockChild);
      stdoutHandler('hi');
      closeHandler(0);
      await promise;
      expect(safeSpawn).toHaveBeenCalledWith('echo', ['hi'], expect.objectContaining({
        timeout: 5000
      }));
    });
  });

  describe('_executeNode failure paths', () => {
    test('handles node execution non-zero exit', async () => {
      const promise = executor.execute('const x = 1;');
      const { closeHandler, stderrHandler } = setupChildHandlers(mockChild);
      stderrHandler('ReferenceError: x is not defined');
      closeHandler(1);
      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('ReferenceError: x is not defined');
    });

    test('handles error event on node child process', async () => {
      const promise = executor.execute('const x = 1;');
      const { errorHandler } = setupChildHandlers(mockChild);
      errorHandler(new Error('node spawn error'));
      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('node spawn error');
    });

    test('handles node execution non-zero exit without stderr', async () => {
      const promise = executor.execute('const x = 1;');
      const { closeHandler } = setupChildHandlers(mockChild);
      closeHandler(1);
      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Exit code: 1');
    });

    test('handles node execution when temp dir already exists', async () => {
      fs.existsSync.mockReturnValue(true);
      const promise = executor.execute('const x = 1;');
      const { closeHandler, stdoutHandler } = setupChildHandlers(mockChild);
      stdoutHandler('result');
      closeHandler(0);
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.output).toBe('result');
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('_executeTest', () => {
    test('resolves on success', async () => {
      const promise = executor.tools.test.execute();
      const { closeHandler, stdoutHandler } = setupChildHandlers(mockChild);
      stdoutHandler('PASS all');
      closeHandler(0);
      await expect(promise).resolves.toBe('PASS all');
    });

    test('rejects on failure with stderr', async () => {
      const promise = executor.tools.test.execute();
      const { closeHandler, stderrHandler } = setupChildHandlers(mockChild);
      stderrHandler('FAIL');
      closeHandler(1);
      await expect(promise).rejects.toThrow('FAIL');
    });

    test('rejects on failure without stderr', async () => {
      const promise = executor.tools.test.execute();
      const { closeHandler } = setupChildHandlers(mockChild);
      closeHandler(2);
      await expect(promise).rejects.toThrow('Exit code: 2');
    });

    test('handles error event', async () => {
      const promise = executor.tools.test.execute();
      const { errorHandler } = setupChildHandlers(mockChild);
      errorHandler(new Error('test spawn error'));
      await expect(promise).rejects.toThrow('test spawn error');
    });
  });

  describe('_executeLint', () => {
    test('resolves on success', async () => {
      const promise = executor.tools.lint.execute();
      const { closeHandler, stdoutHandler } = setupChildHandlers(mockChild);
      stdoutHandler('No errors');
      closeHandler(0);
      await expect(promise).resolves.toBe('No errors');
    });

    test('rejects on failure with stderr', async () => {
      const promise = executor.tools.lint.execute();
      const { closeHandler, stderrHandler } = setupChildHandlers(mockChild);
      stderrHandler('Lint errors');
      closeHandler(1);
      await expect(promise).rejects.toThrow('Lint errors');
    });

    test('rejects on failure without stderr', async () => {
      const promise = executor.tools.lint.execute();
      const { closeHandler } = setupChildHandlers(mockChild);
      closeHandler(2);
      await expect(promise).rejects.toThrow('Exit code: 2');
    });

    test('handles error event', async () => {
      const promise = executor.tools.lint.execute();
      const { errorHandler } = setupChildHandlers(mockChild);
      errorHandler(new Error('lint spawn error'));
      await expect(promise).rejects.toThrow('lint spawn error');
    });
  });

  describe('default parameter branches', () => {
    test('_executeNode defaults options to {} when not provided', async () => {
      const promise = executor._executeNode('console.log("hi")');
      const { closeHandler, stdoutHandler } = setupChildHandlers(mockChild);
      stdoutHandler('hi');
      closeHandler(0);
      await expect(promise).resolves.toBe('hi');
      expect(safeSpawn).toHaveBeenCalledWith('node', [expect.any(String)], expect.objectContaining({ timeout: 30000 }));
    });

    test('_executeCommand defaults options to {} when not provided', async () => {
      const promise = executor._executeCommand('echo hello');
      const { closeHandler, stdoutHandler } = setupChildHandlers(mockChild);
      stdoutHandler('hello');
      closeHandler(0);
      await expect(promise).resolves.toBe('hello');
      expect(safeSpawn).toHaveBeenCalledWith('echo', ['hello'], expect.objectContaining({ timeout: 30000 }));
    });
  });
});
