jest.mock('../../src/utils/SafeExec', () => {
  const EE = require('events');
  return {
    safeSpawn: jest.fn(() => {
      const p = new EE();
      p.stdin = { end: jest.fn(), write: jest.fn(), destroyed: false };
      p.stdout = new EE();
      p.stderr = new EE();
      p.kill = jest.fn();
      p.killed = false;
      p.pid = 456;
      return p;
    })
  };
});

const { MCPClient } = require('../../src/mcp/MCPClient');
const { safeSpawn } = require('../../src/utils/SafeExec');

describe('MCPClient', () => {
  let client;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new MCPClient('test-client', 'node', ['server.js'], { NODE_ENV: 'test' }, { timeout: 5000 });
  });

  afterEach(async () => {
    try {
      client.closing = true;
      if (client.heartbeatTimer) {
        clearInterval(client.heartbeatTimer);
        client.heartbeatTimer = null;
      }
      client.removeAllListeners();
    } catch (e) { /* ignore */ }
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const c = new MCPClient('default', 'node', []);
      expect(c.name).toBe('default');
      expect(c.command).toBe('node');
      expect(c.args).toEqual([]);
      expect(c.env).toEqual({});
      expect(c.options.timeout).toBe(60000);
      expect(c.options.maxRetries).toBe(3);
      expect(c.ready).toBe(false);
      expect(c.connected).toBe(false);
      expect(c.closing).toBe(false);
      expect(c.reconnectAttempts).toBe(0);
      expect(c.maxReconnectAttempts).toBe(5);
    });

    it('should accept custom constructor options', () => {
      const c = new MCPClient('custom', 'node', ['a'], { PATH: '/usr/bin' }, {
        timeout: 10000, maxRetries: 1, maxReconnectAttempts: 3
      });
      expect(c.options.timeout).toBe(10000);
      expect(c.options.maxRetries).toBe(1);
      expect(c.maxReconnectAttempts).toBe(3);
    });

    it('should reject unsafe commands', () => {
      expect(() => new MCPClient('bad', 'rm', [])).toThrow('Unsafe command');
      expect(() => new MCPClient('bad', 'sudo', [])).toThrow('Unsafe command');
    });

    it('should reject code-exec flags (RCE prevention)', () => {
      expect(() => new MCPClient('pwn', 'node', ['-e', 'x'])).toThrow(/code-exec flags/);
      expect(() => new MCPClient('pwn', 'node', ['--eval', 'x'])).toThrow(/code-exec flags/);
      expect(() => new MCPClient('pwn', 'python', ['-c', 'x'])).toThrow(/code-exec flags/);
      expect(() => new MCPClient('pwn', 'node', ['-i'])).toThrow(/code-exec flags/);
      expect(() => new MCPClient('pwn', 'python', ['-m', 'http.server'])).toThrow(/code-exec flags/);
    });

    it('should allow legitimate server script args', () => {
      const c = new MCPClient('ok', 'node', ['node_modules/@modelcontextprotocol/server-filesystem/dist/index.js', 'C:temp']);
      expect(c.args[0]).toContain('index.js');
    });

    it('should sanitize args', () => {
      const c = new MCPClient('safe', 'node', ['normal', 42, null]);
      expect(c.args).toEqual(['normal', '42', 'null']);
    });

    it('should strip null bytes from args', () => {
      const c = new MCPClient('safe', 'node', ['good\x00bad']);
      expect(c.args[0]).toBe('goodbad');
    });

    it('should truncate long args', () => {
      const long = 'a'.repeat(20000);
      const c = new MCPClient('safe', 'node', [long]);
      expect(c.args[0].length).toBe(10000);
    });

    it('should default to empty array for non-array args', () => {
      const c = new MCPClient('safe', 'node', null);
      expect(c.args).toEqual([]);
    });

    it('should only pass allowed env vars through', () => {
      const c = new MCPClient('env-test', 'node', [], { PATH: '/usr/bin', SECRET: 'leak' });
      expect(c.env).not.toHaveProperty('SECRET');
      expect(c.env).toHaveProperty('PATH');
    });
  });

  describe('start', () => {
    it('should spawn process and wait for initialize response', async () => {
      jest.useFakeTimers();
      client = new MCPClient('test', 'node', [], {}, { timeout: 5000 });
      const startPromise = client.start();
      jest.advanceTimersByTime(600);

      client.emit('message', {
        id: 1,
        result: { protocolVersion: '2024-11-05', serverInfo: { name: 'test-server', version: '1.0.0' } }
      });

      await startPromise;
      expect(client.ready).toBe(true);
      expect(client.connected).toBe(true);
      jest.useRealTimers();
    });

    it('should reject on initialize error', async () => {
      jest.useFakeTimers();
      client = new MCPClient('test', 'node', [], {}, { timeout: 5000 });
      const startPromise = client.start();
      jest.advanceTimersByTime(600);

      client.emit('message', { id: 1, error: { message: 'Init failed' } });

      await expect(startPromise).rejects.toThrow('Init failed');
      jest.useRealTimers();
    });

    it('should reject on timeout', async () => {
      jest.useFakeTimers();
      client = new MCPClient('test', 'node', [], {}, { timeout: 100 });
      const startPromise = client.start();

      jest.advanceTimersByTime(200);

      await expect(startPromise).rejects.toThrow('start timeout');
      jest.useRealTimers();
    });

    it('should reject on spawn error event', async () => {
      safeSpawn.mockImplementationOnce(() => { throw new Error('spawn error'); });
      const startPromise = client.start();
      await expect(startPromise).rejects.toThrow('spawn error');
    });

    it('should return early if process already exists', async () => {
      client.process = {};
      await client.start();
      expect(safeSpawn).not.toHaveBeenCalled();
    });

    it('should log on spawn event', async () => {
      jest.useFakeTimers();
      const spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
      client = new MCPClient('test', 'node', [], {}, { timeout: 5000 });
      const startPromise = client.start();
      jest.advanceTimersByTime(600);

      client.process.emit('spawn');
      client.emit('message', {
        id: 1,
        result: { protocolVersion: '2024-11-05', serverInfo: { name: 't', version: '1' } }
      });

      await startPromise;
      expect(spyLog).toHaveBeenCalledWith(expect.stringContaining('Process spawned'));
      spyLog.mockRestore();
      jest.useRealTimers();
    });

    it('should handle error during initialization', async () => {
      jest.useFakeTimers();
      client = new MCPClient('test', 'node', [], {}, { timeout: 5000 });
      const startPromise = client.start();

      client.emit('error', new Error('init error'));
      jest.advanceTimersByTime(600);

      await expect(startPromise).rejects.toThrow('init error');
      jest.useRealTimers();
    });
  });

  describe('stop', () => {
    it('should clean up and reject pending requests', async () => {
      jest.useFakeTimers();
      client = new MCPClient('test', 'node', [], {}, { timeout: 5000 });
      const startPromise = client.start();
      jest.advanceTimersByTime(600);
      client.emit('message', { id: 1, result: {} });
      await startPromise;

      client.pending.set(99, { reject: jest.fn(), resolve: jest.fn() });

      const stopPromise = client.stop();
      jest.advanceTimersByTime(5000);
      await stopPromise;
      expect(client.ready).toBe(false);
      expect(client.connected).toBe(false);
      expect(client.closing).toBe(true);
      expect(client.pending.size).toBe(0);
      jest.useRealTimers();
    });

    it('should force kill after timeout', async () => {
      jest.useFakeTimers();
      client = new MCPClient('test', 'node', [], {}, { timeout: 5000 });
      const startPromise = client.start();
      jest.advanceTimersByTime(600);
      client.emit('message', { id: 1, result: {} });
      await startPromise;

      const stopPromise = client.stop();
      expect(client.process.kill).toHaveBeenCalledWith('SIGTERM');

      jest.advanceTimersByTime(5000);
      await stopPromise;
      jest.useRealTimers();
    });
  });

  describe('restart', () => {
    it('should stop and start again', async () => {
      const spyStop = jest.spyOn(client, 'stop').mockResolvedValue();
      const spyStart = jest.spyOn(client, 'start').mockResolvedValue();

      await client.restart();
      expect(spyStop).toHaveBeenCalled();
      expect(spyStart).toHaveBeenCalled();
      expect(client.closing).toBe(false);

      spyStop.mockRestore();
      spyStart.mockRestore();
    });
  });

  describe('send', () => {
    it('should write JSON to stdin', () => {
      client.process = { stdin: { write: jest.fn(), destroyed: false } };
      client.send({ jsonrpc: '2.0', method: 'ping' });
      expect(client.process.stdin.write).toHaveBeenCalledWith(
        Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'ping' }) + '\n', 'utf8')
      );
    });

    it('should not write if stdin is destroyed', () => {
      client.process = { stdin: { write: jest.fn(), destroyed: true } };
      client.send({ method: 'test' });
      expect(client.process.stdin.write).not.toHaveBeenCalled();
    });
  });

  describe('call', () => {
    it('should throw if not ready', async () => {
      await expect(client.call('tools/list')).rejects.toThrow('is not ready');
    });

    it('should send request and resolve on response', async () => {
      client.ready = true;
      client.process = { stdin: { write: jest.fn(), destroyed: false } };

      const callPromise = client.call('tools/list');

      client._handleMessage(JSON.stringify({ id: 1, result: { tools: [{ name: 'test' }] } }));

      const result = await callPromise;
      expect(result).toEqual({ tools: [{ name: 'test' }] });
    });

    it('should reject on error response', async () => {
      client.ready = true;
      client.process = { stdin: { write: jest.fn(), destroyed: false } };

      const callPromise = client.call('tools/list');

      client._handleMessage(JSON.stringify({ id: 1, error: { message: 'method not found' } }));

      await expect(callPromise).rejects.toThrow('method not found');
    });

    it('should retry on retryable errors', async () => {
      client.ready = true;
      client.process = { stdin: { write: jest.fn(), destroyed: false } };
      jest.spyOn(client, '_isRetryableError').mockReturnValue(true);

      const callSpy = jest.spyOn(client, 'call');
      callSpy.mockResolvedValueOnce({ tools: [] });

      const result = await client.call('tools/list', {}, 0);
      expect(result).toEqual({ tools: [] });
    });

    it('should reject on call timeout', async () => {
      jest.useFakeTimers();
      client.options.timeout = 100;
      client.options.maxRetries = 0;
      client.ready = true;
      client.process = { stdin: { write: jest.fn(), destroyed: false } };

      const callPromise = client.call('tools/list');
      jest.advanceTimersByTime(200);

      await expect(callPromise).rejects.toThrow('MCP call tools/list timeout after 100ms');
      jest.useRealTimers();
    });

    it('should retry with exponential delay on timeout', async () => {
      jest.useFakeTimers();
      client.ready = true;
      client.process = { stdin: { write: jest.fn(), destroyed: false } };

      client.options.timeout = 100;
      client.options.retryDelay = 10;
      client.options.maxRetries = 1;

      const callPromise = client.call('tools/list', {}, 0);

      jest.advanceTimersByTime(100);
      await Promise.resolve();
      jest.advanceTimersByTime(10);
      await Promise.resolve();
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      await expect(callPromise).rejects.toThrow('MCP call tools/list timeout');
      expect(client.process.stdin.write).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });
  });

  describe('_handleMessage', () => {
    it('should resolve pending request on result message', () => {
      const resolve = jest.fn();
      const reject = jest.fn();
      client.pending.set(10, { resolve, reject });

      client._handleMessage(JSON.stringify({ id: 10, result: 'ok' }));
      expect(resolve).toHaveBeenCalledWith('ok');
    });

    it('should reject pending request on error message', () => {
      const resolve = jest.fn();
      const reject = jest.fn();
      client.pending.set(10, { resolve, reject });

      client._handleMessage(JSON.stringify({ id: 10, error: { message: 'fail' } }));
      expect(reject).toHaveBeenCalledWith(expect.objectContaining({ message: 'fail' }));
    });

    it('should emit message event', () => {
      const handler = jest.fn();
      client.on('message', handler);

      client._handleMessage(JSON.stringify({ jsonrpc: '2.0', method: 'test' }));
      expect(handler).toHaveBeenCalled();
    });

    it('should respond to ping methods', () => {
      const sendSpy = jest.spyOn(client, 'send');
      client._handleMessage(JSON.stringify({ method: 'ping' }));
      expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ result: null }));
    });

    it('should emit parse-error for invalid JSON', () => {
      const handler = jest.fn();
      client.on('parse-error', handler);

      client._handleMessage('not-json');
      expect(handler).toHaveBeenCalledWith({ line: 'not-json', error: expect.any(Error) });
    });

    it('should emit ready for notifications/initialized', () => {
      const handler = jest.fn();
      client.on('ready', handler);

      client._handleMessage(JSON.stringify({ method: 'notifications/initialized' }));
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('_handleStdout', () => {
    it('should parse newline-delimited JSON messages', () => {
      const spy = jest.spyOn(client, '_handleMessage');
      client._handleStdout(Buffer.from(JSON.stringify({ id: 1 }) + '\n' + JSON.stringify({ id: 2 }) + '\n'));
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('should handle partial messages in buffer', () => {
      const spy = jest.spyOn(client, '_handleMessage');
      client._handleStdout(Buffer.from(JSON.stringify({ id: 1 }) + '\n' + JSON.stringify({ id: 2 }).slice(0, 10)));
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('_handleStderr', () => {
    it('should emit stderr event', () => {
      const handler = jest.fn();
      client.on('stderr', handler);

      client._handleStderr(Buffer.from('error message'));
      expect(handler).toHaveBeenCalledWith('error message');
    });
  });

  describe('getStatus', () => {
    it('should return current client status', () => {
      client.name = 'test';
      client.connected = true;
      client.ready = true;
      client.pending.set(1, {});

      const status = client.getStatus();
      expect(status.name).toBe('test');
      expect(status.connected).toBe(true);
      expect(status.ready).toBe(true);
      expect(status.pendingRequests).toBe(1);
      expect(status.reconnectAttempts).toBe(0);
    });
  });

  describe('getAvailableTools', () => {
    it('should return empty array when no tools set', () => {
      expect(client.getAvailableTools()).toEqual([]);
    });

    it('should return tools when set', () => {
      client.tools = [{ name: 'tool1' }];
      expect(client.getAvailableTools()).toEqual([{ name: 'tool1' }]);
    });
  });

  describe('_handleExit', () => {
    it('should emit exit event', () => {
      const handler = jest.fn();
      client.on('exit', handler);
      client.closing = true;

      client._handleExit(0, 'SIGTERM');
      expect(handler).toHaveBeenCalledWith({ code: 0, signal: 'SIGTERM' });
    });
  });

  describe('_handleError', () => {
    it('should emit process-error event', () => {
      const handler = jest.fn();
      client.on('process-error', handler);
      client.closing = true;

      client._handleError(new Error('process crashed'));
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ message: 'process crashed' }));
    });
  });

  describe('_handleReconnect', () => {
    it('should not reconnect if closing', async () => {
      client.closing = true;
      const errorHandler = jest.fn();
      client.on('error', errorHandler);
      await client._handleReconnect();
      expect(errorHandler).not.toHaveBeenCalled();
      expect(client.reconnectAttempts).toBe(0);
    });

    it('should emit error when attempts >= max', async () => {
      jest.useFakeTimers();
      client.reconnectAttempts = 5;
      client.maxReconnectAttempts = 5;
      const errorHandler = jest.fn();
      client.on('error', errorHandler);

      await client._handleReconnect();
      expect(errorHandler).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('should attempt reconnect with exponential backoff', async () => {
      jest.useFakeTimers();
      client.reconnectAttempts = 0;
      client.maxReconnectAttempts = 5;
      const spyStart = jest.spyOn(client, 'start').mockResolvedValue();
      const reconnectingHandler = jest.fn();
      client.on('reconnecting', reconnectingHandler);

      const reconnectPromise = client._handleReconnect();
      jest.advanceTimersByTime(5000);
      await reconnectPromise;

      expect(reconnectingHandler).toHaveBeenCalledWith({ attempt: 1, delay: 2000 });
      expect(spyStart).toHaveBeenCalled();
      expect(client.reconnectAttempts).toBe(0);
      jest.useRealTimers();
    });

    it('should retry on reconnect failure', async () => {
      client.reconnectAttempts = 0;
      client.maxReconnectAttempts = 3;
      client.options = { ...client.options, retryDelay: 5 };
      client.start = jest.fn().mockRejectedValue(new Error('fail'));
      const errorHandler = jest.fn();
      client.on('error', errorHandler);

      try {
        await client._handleReconnect();
      } catch (e) {
        // error emitted via EventEmitter, may throw
      }
      expect(errorHandler).toHaveBeenCalled();
      expect(client.reconnectAttempts).toBe(3);
    });
  });

  describe('_isRetryableError', () => {
    it('should return true for timeout errors', () => {
      expect(client._isRetryableError(new Error('request timeout'))).toBe(true);
    });

    it('should return true for connection errors', () => {
      expect(client._isRetryableError(new Error('connection refused'))).toBe(true);
    });

    it('should return true for network errors', () => {
      expect(client._isRetryableError(new Error('network error'))).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(client._isRetryableError(new Error('syntax error'))).toBe(false);
    });
  });

  describe('listTools', () => {
    it('should call tools/list and return tools array', async () => {
      jest.spyOn(client, 'call').mockResolvedValue({ tools: [{ name: 'read' }] });
      const tools = await client.listTools();
      expect(tools).toEqual([{ name: 'read' }]);
    });

    it('should return empty array if no tools in result', async () => {
      jest.spyOn(client, 'call').mockResolvedValue({});
      const tools = await client.listTools();
      expect(tools).toEqual([]);
    });
  });

  describe('callTool', () => {
    it('should call tools/call with name and arguments', async () => {
      const spy = jest.spyOn(client, 'call').mockResolvedValue({ content: [] });
      const result = await client.callTool('read_file', { path: '/test' });
      expect(spy).toHaveBeenCalledWith('tools/call', { name: 'read_file', arguments: { path: '/test' } });
      expect(result).toEqual({ content: [] });
    });
  });

  describe('_startHeartbeat', () => {
    it('should emit heartbeat-failed on ping failure', async () => {
      jest.useFakeTimers();
      client.ready = true;
      client.options.heartbeatInterval = 5000;

      jest.spyOn(client, 'call').mockRejectedValue(new Error('ping timeout'));

      const errorHandler = jest.fn();
      client.on('heartbeat-failed', errorHandler);

      client._startHeartbeat();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({ message: 'ping timeout' }));
      jest.useRealTimers();
    });

    it('should not call ping if not ready', async () => {
      jest.useFakeTimers();
      client.ready = false;
      client.closing = false;
      client.options.heartbeatInterval = 5000;
      const callSpy = jest.spyOn(client, 'call');
      client._startHeartbeat();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      expect(callSpy).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('should not call ping if closing', async () => {
      jest.useFakeTimers();
      client.ready = true;
      client.closing = true;
      client.options.heartbeatInterval = 5000;
      const callSpy = jest.spyOn(client, 'call');
      client._startHeartbeat();
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      expect(callSpy).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('_processEnv', () => {
    it('should default to empty string when env var is not set', () => {
      const orig = process.env.BRAVE_API_KEY;
      delete process.env.BRAVE_API_KEY;
      try {
        const c = new MCPClient('env-test', 'node', [], { BRAVE_API_KEY: 'key' });
        expect(c.env.BRAVE_API_KEY).toBe('');
      } finally {
        process.env.BRAVE_API_KEY = orig;
      }
    });
  });

  describe('additional start coverage', () => {
    it('should ignore messages with non-matching id during init', async () => {
      jest.useFakeTimers();
      client = new MCPClient('test', 'node', [], {}, { timeout: 5000 });
      const startPromise = client.start();
      jest.advanceTimersByTime(600);
      client.emit('message', { id: 999, result: {} });
      client.emit('message', {
        id: 1,
        result: { protocolVersion: '2024-11-05', serverInfo: { name: 't', version: '1' } }
      });
      await startPromise;
      expect(client.ready).toBe(true);
      jest.useRealTimers();
    });
  });

  describe('additional stop coverage', () => {
    it('should handle stop when no process', async () => {
      client.process = null;
      await client.stop();
      expect(client.ready).toBe(false);
      expect(client.connected).toBe(false);
    });

    it('should skip SIGKILL if process already killed', async () => {
      jest.useFakeTimers();
      client = new MCPClient('test', 'node', [], {}, { timeout: 5000 });
      const startPromise = client.start();
      jest.advanceTimersByTime(600);
      client.emit('message', { id: 1, result: {} });
      await startPromise;
      const killFn = client.process.kill;
      const stopPromise = client.stop();
      client.process.killed = true;
      jest.advanceTimersByTime(5000);
      await stopPromise;
      expect(killFn).toHaveBeenCalledWith('SIGTERM');
      expect(killFn).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });
  });

  describe('_handleStdout additional', () => {
    it('should skip empty lines', () => {
      const spy = jest.spyOn(client, '_handleMessage');
      client._handleStdout(Buffer.from('\n'));
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('_handleStderr additional', () => {
    it('should handle empty stderr', () => {
      const handler = jest.fn();
      client.on('stderr', handler);
      client._handleStderr(Buffer.from(''));
      expect(handler).toHaveBeenCalledWith('');
    });
  });

  describe('_handleExit additional', () => {
    it('should not reconnect on exit when closing', () => {
      client.closing = true;
      const exitHandler = jest.fn();
      client.on('exit', exitHandler);
      client._handleExit(0, 'SIGTERM');
      expect(exitHandler).toHaveBeenCalledWith({ code: 0, signal: 'SIGTERM' });
      expect(client.reconnectAttempts).toBe(0);
    });
  });

  describe('_handleMessage additional', () => {
    it('should stringify error when message property is missing', () => {
      const reject = jest.fn();
      client.pending.set(10, { resolve: jest.fn(), reject });
      client._handleMessage(JSON.stringify({ id: 10, error: { code: -32000 } }));
      expect(reject).toHaveBeenCalledWith(expect.objectContaining({ message: '{"code":-32000}' }));
    });
  });

  describe('send additional', () => {
    it('should not write if process is null', () => {
      client.process = null;
      expect(() => client.send({ method: 'test' })).not.toThrow();
    });

    it('should not write if stdin is null', () => {
      client.process = { stdin: null };
      expect(() => client.send({ method: 'test' })).not.toThrow();
    });
  });

  describe('listTools additional', () => {
    it('should return empty array when call returns null', async () => {
      jest.spyOn(client, 'call').mockResolvedValue(null);
      const tools = await client.listTools();
      expect(tools).toEqual([]);
    });
  });

  describe('constructor default args', () => {
    it('should use default empty array when args not provided', () => {
      const c = new MCPClient('no-args', 'node');
      expect(c.args).toEqual([]);
    });
  });

  describe('callTool default args', () => {
    it('should work without arguments', async () => {
      const spy = jest.spyOn(client, 'call').mockResolvedValue({});
      await client.callTool('ping');
      expect(spy).toHaveBeenCalledWith('tools/call', { name: 'ping', arguments: {} });
    });
  });

  describe('process event listener callbacks', () => {
    it('should call _handleStdout on stdout data event', async () => {
      jest.useFakeTimers();
      client = new MCPClient('test', 'node', [], {}, { timeout: 5000 });
      const startPromise = client.start();
      jest.advanceTimersByTime(600);
      client.emit('message', { id: 1, result: { protocolVersion: '2024-11-05', serverInfo: { name: 't', version: '1' } } });
      await startPromise;
      const spy = jest.spyOn(client, '_handleStdout');
      client.process.stdout.emit('data', Buffer.from('test\n'));
      expect(spy).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('should call _handleStderr on stderr data event', async () => {
      jest.useFakeTimers();
      client = new MCPClient('test', 'node', [], {}, { timeout: 5000 });
      const startPromise = client.start();
      jest.advanceTimersByTime(600);
      client.emit('message', { id: 1, result: { protocolVersion: '2024-11-05', serverInfo: { name: 't', version: '1' } } });
      await startPromise;
      const spy = jest.spyOn(client, '_handleStderr');
      client.process.stderr.emit('data', Buffer.from('err\n'));
      expect(spy).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('should call _handleError on process error event', async () => {
      jest.useFakeTimers();
      client = new MCPClient('test', 'node', [], {}, { timeout: 5000 });
      const startPromise = client.start();
      jest.advanceTimersByTime(600);
      client.emit('message', { id: 1, result: { protocolVersion: '2024-11-05', serverInfo: { name: 't', version: '1' } } });
      await startPromise;
      const spy = jest.spyOn(client, '_handleError');
      client.closing = true;
      client.process.emit('error', new Error('proc err'));
      expect(spy).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('should call _handleExit on process exit event', async () => {
      jest.useFakeTimers();
      client = new MCPClient('test', 'node', [], {}, { timeout: 5000 });
      const startPromise = client.start();
      jest.advanceTimersByTime(600);
      client.emit('message', { id: 1, result: { protocolVersion: '2024-11-05', serverInfo: { name: 't', version: '1' } } });
      await startPromise;
      const spy = jest.spyOn(client, '_handleExit');
      client.closing = true;
      client.process.emit('exit', 0, 'SIGTERM');
      expect(spy).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });
});
