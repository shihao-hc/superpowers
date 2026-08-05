jest.mock('../../src/utils/SafeExec', () => {
  const EE = require('events');
  const mockProc = new EE();
  mockProc.stderr = new EE();
  mockProc.stderr.on = jest.fn();
  mockProc.kill = jest.fn();
  mockProc.stdin = { end: jest.fn() };
  mockProc.killed = false;

  return {
    safeSpawn: jest.fn(() => mockProc),
    _mockProc: mockProc
  };
});

afterEach(() => {
  const { _mockProc } = require('../../src/utils/SafeExec');
  _mockProc.removeAllListeners();
});

const {
  MCPManager, MCPServerConfig, LRUCache,
  ServerType, ConnectionStatus
} = require('../../src/mcp/MCPManager');

function makeManager(opts) {
  const m = new MCPManager({ cacheSize: 5, maxConcurrent: 3, timeout: 10000, ...opts });
  return m;
}

function addClientDirectly(manager, name, opts = {}) {
  const { MCPClient } = require('../../src/mcp/MCPManager');
  const client = new MCPClient(name, { command: 'node', args: [], ...opts });
  client.status = opts.connected ? ConnectionStatus.CONNECTED : ConnectionStatus.PENDING;
  manager.clients.set(name, client);
  manager.serverConfigs.set(name, client.config);
  return client;
}

describe('MCPServerConfig', () => {
  it('should create config with defaults', () => {
    const config = new MCPServerConfig();
    expect(config.type).toBe(ServerType.STDIO);
    expect(config.command).toBeNull();
    expect(config.args).toEqual([]);
    expect(config.env).toEqual({});
    expect(config.url).toBeNull();
    expect(config.timeout).toBe(30000);
    expect(config.disabled).toBe(false);
  });

  it('should create config with custom values', () => {
    const config = new MCPServerConfig({
      type: ServerType.SSE,
      command: 'node',
      args: ['server.js'],
      env: { NODE_ENV: 'test' },
      url: 'http://localhost:8080',
      timeout: 5000,
      disabled: true
    });
    expect(config.type).toBe(ServerType.SSE);
    expect(config.command).toBe('node');
    expect(config.args).toEqual(['server.js']);
    expect(config.env).toEqual({ NODE_ENV: 'test' });
    expect(config.url).toBe('http://localhost:8080');
    expect(config.timeout).toBe(5000);
    expect(config.disabled).toBe(true);
  });

  describe('clone', () => {
    it('should deep clone config', () => {
      const config = new MCPServerConfig({
        command: 'node',
        args: ['arg1', 'arg2'],
        env: { KEY: 'value' }
      });
      const cloned = config.clone();
      expect(cloned).toBeInstanceOf(MCPServerConfig);
      expect(cloned.command).toBe('node');
      expect(cloned.args).toEqual(['arg1', 'arg2']);
      expect(cloned.env).toEqual({ KEY: 'value' });

      cloned.args.push('arg3');
      cloned.env.NEW_KEY = 'new';
      expect(config.args).toEqual(['arg1', 'arg2']);
      expect(config.env).toEqual({ KEY: 'value' });
    });
  });
});

describe('LRUCache', () => {
  let cache;

  beforeEach(() => {
    cache = new LRUCache(3);
  });

  it('should set and get values', () => {
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('should return undefined for missing keys', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('should evict least recently used when over maxSize', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('should move accessed key to most recent', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.get('a');
    cache.set('d', 4);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
  });

  it('should update existing key without evicting', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);
    expect(cache.get('a')).toBe(10);
    expect(cache.size).toBe(2);
  });

  it('should delete a key', () => {
    cache.set('a', 1);
    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
  });

  it('should clear all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('should check if key exists', () => {
    cache.set('a', 1);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });

  it('should report correct size', () => {
    expect(cache.size).toBe(0);
    cache.set('a', 1);
    expect(cache.size).toBe(1);
    cache.set('b', 2);
    expect(cache.size).toBe(2);
  });
});

describe('MCPClient', () => {
  afterEach(async () => {
    jest.useRealTimers();
  });

  describe('connect', () => {
    it('should skip connect if already connected', async () => {
      const { MCPClient } = require('../../src/mcp/MCPManager');
      const client = new MCPClient('test');
      client.status = ConnectionStatus.CONNECTED;
      await client.connect();
      expect(client.status).toBe(ConnectionStatus.CONNECTED);
    });

    it('should connect with SSE type', async () => {
      const { MCPClient } = require('../../src/mcp/MCPManager');
      const client = new MCPClient('test', { type: ServerType.SSE });
      await client.connect();
      expect(client.status).toBe(ConnectionStatus.CONNECTED);
    });

    it('should connect with HTTP type', async () => {
      const { MCPClient } = require('../../src/mcp/MCPManager');
      const client = new MCPClient('test', { type: ServerType.HTTP });
      await client.connect();
      expect(client.status).toBe(ConnectionStatus.CONNECTED);
    });

    it('should connect with WebSocket type', async () => {
      const { MCPClient } = require('../../src/mcp/MCPManager');
      const client = new MCPClient('test', { type: ServerType.WEBSOCKET });
      await client.connect();
      expect(client.status).toBe(ConnectionStatus.CONNECTED);
    });

    it('should handle process error event during stdio connect', async () => {
      const { MCPClient } = require('../../src/mcp/MCPManager');
      const { safeSpawn } = require('../../src/utils/SafeExec');
      const EE = require('events');
      const freshProc = new EE();
      freshProc.stderr = new EE();
      freshProc.stderr.on = jest.fn();
      freshProc.kill = jest.fn();
      safeSpawn.mockReturnValueOnce(freshProc);

      const client = new MCPClient('error-test', { command: 'node' });
      const connectPromise = client.connect();
      freshProc.emit('error', new Error('spawn failed'));
      await expect(connectPromise).rejects.toThrow('spawn failed');
      expect(client.status).toBe(ConnectionStatus.FAILED);
    });

    it('should handle process non-zero exit', async () => {
      const { MCPClient } = require('../../src/mcp/MCPManager');
      const { safeSpawn } = require('../../src/utils/SafeExec');
      const EE = require('events');
      const freshProc = new EE();
      freshProc.stderr = new EE();
      freshProc.stderr.on = jest.fn();
      freshProc.kill = jest.fn();
      safeSpawn.mockReturnValueOnce(freshProc);

      const client = new MCPClient('exit-test', { command: 'node' });
      const connectPromise = client.connect();
      freshProc.emit('exit', 1);
      await expect(connectPromise).rejects.toThrow('exited with code 1');
      expect(client.status).toBe(ConnectionStatus.FAILED);
    });

    it('should handle process zero exit gracefully', async () => {
      const { MCPClient } = require('../../src/mcp/MCPManager');
      const { safeSpawn } = require('../../src/utils/SafeExec');
      const EE = require('events');
      const freshProc = new EE();
      freshProc.stderr = new EE();
      freshProc.stderr.on = jest.fn();
      freshProc.kill = jest.fn();
      safeSpawn.mockReturnValueOnce(freshProc);

      const client = new MCPClient('zero-test', { command: 'node' });
      jest.useFakeTimers();
      const connectPromise = client.connect();
      freshProc.emit('exit', 0);
      jest.advanceTimersByTime(100);
      await connectPromise;
      expect(client.status).toBe(ConnectionStatus.CONNECTED);
    });

    it('should accumulate stderr and include in exit error', async () => {
      const { MCPClient } = require('../../src/mcp/MCPManager');
      const { safeSpawn } = require('../../src/utils/SafeExec');
      const EE = require('events');
      const freshProc = new EE();
      freshProc.stderr = new EE();
      freshProc.kill = jest.fn();
      safeSpawn.mockReturnValueOnce(freshProc);

      const client = new MCPClient('stderr-test', { command: 'node' });
      const connectPromise = client.connect();
      freshProc.stderr.emit('data', Buffer.from('error output'));
      freshProc.emit('exit', 1);
      await expect(connectPromise).rejects.toThrow(/error output/);
    });
  });

  describe('disconnect', () => {
    it('should kill process and abort controller', async () => {
      const { MCPClient } = require('../../src/mcp/MCPManager');
      const client = new MCPClient('disco-test');
      const killFn = jest.fn();
      const abortFn = jest.fn();
      client.process = { kill: killFn };
      client.abortController = { abort: abortFn };
      await client.disconnect();
      expect(killFn).toHaveBeenCalled();
      expect(abortFn).toHaveBeenCalled();
      expect(client.status).toBe(ConnectionStatus.DISCONNECTED);
      expect(client.process).toBeNull();
      expect(client.abortController).toBeNull();
    });
  });

  describe('listTools', () => {
    it('should return empty array stub', async () => {
      const { MCPClient } = require('../../src/mcp/MCPManager');
      const client = new MCPClient('tools-test');
      const tools = await client.listTools();
      expect(tools).toEqual([]);
    });
  });

  describe('callTool', () => {
    it('should return empty content stub', async () => {
      const { MCPClient } = require('../../src/mcp/MCPManager');
      const client = new MCPClient('call-test');
      const result = await client.callTool('some_tool', {});
      expect(result).toEqual({ content: [] });
    });
  });
});

describe('MCPManager', () => {
  afterEach(async () => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const m = new MCPManager();
      expect(m.clients).toBeInstanceOf(Map);
      expect(m.serverConfigs).toBeInstanceOf(Map);
      expect(m.maxConcurrent).toBe(5);
      expect(m.defaultTimeout).toBe(30000);
    });

    it('should initialize with custom options', () => {
      const m = new MCPManager({ cacheSize: 10, maxConcurrent: 2, timeout: 5000 });
      expect(m.toolCache.maxSize).toBe(10);
      expect(m.maxConcurrent).toBe(2);
      expect(m.defaultTimeout).toBe(5000);
    });
  });

  describe('static validateCommand', () => {
    it('should allow valid commands', () => {
      expect(() => MCPManager.validateCommand('node')).not.toThrow();
      expect(() => MCPManager.validateCommand('python')).not.toThrow();
    });

    it('should reject invalid commands', () => {
      expect(() => MCPManager.validateCommand('invalid')).toThrow('Command not allowed');
    });
  });

  describe('static validateArgs', () => {
    it('should accept safe args', () => {
      expect(() => MCPManager.validateArgs(['--port', '8080'])).not.toThrow();
    });

    it('should reject args with shell metacharacters', () => {
      expect(() => MCPManager.validateArgs(['; rm -rf /'])).toThrow('Dangerous argument pattern');
      expect(() => MCPManager.validateArgs(['&& echo pwned'])).toThrow('Dangerous argument pattern');
      expect(() => MCPManager.validateArgs(['$(id)'])).toThrow('Dangerous argument pattern');
      expect(() => MCPManager.validateArgs(['`whoami`'])).toThrow('Dangerous argument pattern');
    });

    it('should accept non-array args silently', () => {
      expect(() => MCPManager.validateArgs(null)).not.toThrow();
      expect(() => MCPManager.validateArgs('string')).not.toThrow();
    });
  });

  describe('areConfigsEqual', () => {
    it('should return true for equal configs', () => {
      const m = makeManager();
      const a = { type: 'stdio', command: 'node', args: ['a'], url: null };
      const b = { type: 'stdio', command: 'node', args: ['a'], url: null };
      expect(m.areConfigsEqual(a, b)).toBe(true);
    });

    it('should return false for different types', () => {
      const m = makeManager();
      const a = { type: 'stdio', command: 'node' };
      const b = { type: 'sse', command: 'node' };
      expect(m.areConfigsEqual(a, b)).toBe(false);
    });

    it('should return false if either is null', () => {
      const m = makeManager();
      expect(m.areConfigsEqual(null, {})).toBe(false);
      expect(m.areConfigsEqual({}, null)).toBe(false);
    });

    it('should ignore disabled and timeout fields', () => {
      const m = makeManager();
      const a = { type: 'stdio', command: 'node', args: [], url: null, disabled: true, timeout: 5000 };
      const b = { type: 'stdio', command: 'node', args: [], url: null, disabled: false, timeout: 10000 };
      expect(m.areConfigsEqual(a, b)).toBe(true);
    });
  });

  describe('computeConfigDiff', () => {
    it('should detect added, removed, changed, unchanged', () => {
      const m = makeManager();
      const current = { a: { type: 'stdio' }, b: { type: 'stdio' } };
      const next = { b: { type: 'stdio' }, c: { type: 'sse' } };
      const diff = m.computeConfigDiff(current, next);
      expect(diff.added).toEqual(['c']);
      expect(diff.removed).toEqual(['a']);
      expect(diff.changed).toEqual([]);
      expect(diff.unchanged).toEqual(['b']);
    });

    it('should accept Map as currentConfigs', () => {
      const m = makeManager();
      const current = new Map([['a', { type: 'stdio' }]]);
      const next = { a: { type: 'stdio' } };
      const diff = m.computeConfigDiff(current, next);
      expect(diff.unchanged).toEqual(['a']);
    });
  });

  describe('addServer', () => {
    it('should add a server successfully', async () => {
      const manager = makeManager();
      jest.useFakeTimers();
      const addPromise = manager.addServer('test', { command: 'node', args: [] });
      jest.advanceTimersByTime(200);
      const client = await addPromise;
      expect(client).not.toBeNull();
      expect(client.name).toBe('test');
      expect(manager.clients.has('test')).toBe(true);
      jest.useRealTimers();
    });

    it('should throw when adding duplicate server', async () => {
      const manager = makeManager();
      jest.useFakeTimers();
      const p1 = manager.addServer('test', { command: 'node', args: [] });
      jest.advanceTimersByTime(200);
      await p1;
      jest.advanceTimersByTime(200);
      await expect(manager.addServer('test', { command: 'node', args: [] }))
        .rejects.toThrow('already exists');
      jest.useRealTimers();
    });

    it('should skip disabled servers', async () => {
      const manager = makeManager();
      jest.useFakeTimers();
      const client = await manager.addServer('disabled-srv', { command: 'node', args: [], disabled: true });
      expect(client).toBeNull();
      expect(manager.clients.has('disabled-srv')).toBe(false);
      jest.useRealTimers();
    });

    it('should emit serverAdded on success', async () => {
      const manager = makeManager();
      jest.useFakeTimers();
      const handler = jest.fn();
      manager.on('serverAdded', handler);
      const addPromise = manager.addServer('test', { command: 'node', args: [] });
      jest.advanceTimersByTime(200);
      await addPromise;
      expect(handler).toHaveBeenCalledWith({ name: 'test', status: expect.any(String) });
      jest.useRealTimers();
    });

    it('should emit serverSkipped for disabled', async () => {
      const manager = makeManager();
      const handler = jest.fn();
      manager.on('serverSkipped', handler);
      await manager.addServer('test', { command: 'node', args: [], disabled: true });
      expect(handler).toHaveBeenCalledWith({ name: 'test', reason: 'disabled' });
    });

    it('should emit serverError on spawn failure', async () => {
      const manager = makeManager();
      const { safeSpawn } = require('../../src/utils/SafeExec');
      safeSpawn.mockImplementationOnce(() => { throw new Error('spawn failed'); });
      const errorHandler = jest.fn();
      manager.on('serverError', errorHandler);
      const client = await manager.addServer('test', { command: 'node', args: [] });
      expect(client).not.toBeNull();
      expect(errorHandler).toHaveBeenCalledWith({ name: 'test', error: 'spawn failed' });
    });
  });

  describe('removeServer', () => {
    it('should remove existing server', async () => {
      const manager = makeManager();
      addClientDirectly(manager, 'test');
      const result = await manager.removeServer('test');
      expect(result).toBe(true);
      expect(manager.clients.has('test')).toBe(false);
    });

    it('should return false for non-existent server', async () => {
      const manager = makeManager();
      expect(await manager.removeServer('ghost')).toBe(false);
    });

    it('should emit serverRemoved', async () => {
      const manager = makeManager();
      addClientDirectly(manager, 'test');
      const handler = jest.fn();
      manager.on('serverRemoved', handler);
      await manager.removeServer('test');
      expect(handler).toHaveBeenCalledWith({ name: 'test' });
    });
  });

  describe('updateServer', () => {
    it('should update existing server config', async () => {
      const manager = makeManager();
      addClientDirectly(manager, 'test');
      const updated = await manager.updateServer('test', { command: 'node', args: ['new.js'] });
      expect(updated.config.args).toEqual(['new.js']);
    });

    it('should create client for non-existent server', async () => {
      const manager = makeManager();
      jest.useFakeTimers();
      const updatePromise = manager.updateServer('new-srv', { command: 'node', args: [] });
      jest.advanceTimersByTime(200);
      const client = await updatePromise;
      expect(client).not.toBeNull();
      expect(manager.clients.has('new-srv')).toBe(true);
      jest.useRealTimers();
    });
  });

  describe('getServer / getAllServers / getConnectedServers', () => {
    it('should get a server by name', () => {
      const manager = makeManager();
      addClientDirectly(manager, 'test');
      expect(manager.getServer('test')).not.toBeNull();
      expect(manager.getServer('ghost')).toBeUndefined();
    });

    it('should return all servers', () => {
      const manager = makeManager();
      addClientDirectly(manager, 'a');
      addClientDirectly(manager, 'b');
      expect(manager.getAllServers().length).toBe(2);
    });

    it('should filter connected servers', () => {
      const manager = makeManager();
      addClientDirectly(manager, 'a', { connected: true });
      addClientDirectly(manager, 'b', { connected: false });
      const connected = manager.getConnectedServers();
      expect(connected.length).toBe(1);
      expect(connected[0].name).toBe('a');
    });
  });

  describe('getTools', () => {
    it('should return empty array for non-connected server', async () => {
      const manager = makeManager();
      const tools = await manager.getTools('ghost');
      expect(tools).toEqual([]);
    });
  });

  describe('callTool', () => {
    it('should throw for non-existent server', async () => {
      const manager = makeManager();
      await expect(manager.callTool('ghost', 'some_tool'))
        .rejects.toThrow('not connected');
    });
  });

  describe('getStats', () => {
    it('should return stats with all zeros initially', () => {
      const manager = makeManager();
      const stats = manager.getStats();
      expect(stats.total).toBe(0);
      expect(stats.connected).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.byType).toEqual({});
    });

    it('should reflect added servers', () => {
      const manager = makeManager();
      addClientDirectly(manager, 'a', { connected: true });
      addClientDirectly(manager, 'b');
      const stats = manager.getStats();
      expect(stats.total).toBe(2);
      expect(stats.connected).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.byType).toEqual({ stdio: 2 });
    });
  });

  describe('cleanup', () => {
    it('should clear all servers and caches', async () => {
      const manager = makeManager();
      addClientDirectly(manager, 'a');
      addClientDirectly(manager, 'b');
      await manager.cleanup();
      expect(manager.clients.size).toBe(0);
      expect(manager.serverConfigs.size).toBe(0);
      expect(manager.toolCache.size).toBe(0);
      expect(manager.configCache.size).toBe(0);
      expect(manager._connectionQueue.length).toBe(0);
      expect(manager._activeConnections).toBe(0);
    });
  });

  describe('updateServers (incremental)', () => {
    it('should return updated:false when no changes', async () => {
      const manager = makeManager();
      const configs = {};
      const result = await manager.updateServers(configs);
      expect(result.updated).toBe(false);
    });

    it('should emit configChange on diff', async () => {
      const manager = makeManager();
      jest.useFakeTimers();
      const handler = jest.fn();
      manager.on('configChange', handler);
      const updatePromise = manager.updateServers({ a: { command: 'node', args: [] } });
      jest.advanceTimersByTime(200);
      await updatePromise;
      expect(handler).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('computeConfigDiff additional', () => {
    it('should detect changed configs', () => {
      const manager = makeManager();
      const current = { a: { type: 'stdio', command: 'node', args: ['old'] } };
      const next = { a: { type: 'stdio', command: 'node', args: ['new'] } };
      const diff = manager.computeConfigDiff(current, next);
      expect(diff.changed).toEqual(['a']);
      expect(diff.unchanged).toEqual([]);
    });
  });

  describe('updateServers full cycle', () => {
    it('should handle removed, changed and added servers', async () => {
      const manager = makeManager();
      addClientDirectly(manager, 'keep');
      addClientDirectly(manager, 'remove');
      addClientDirectly(manager, 'change', { command: 'node', args: ['old.js'] });
      jest.useFakeTimers();
      const p = manager.updateServers({
        'keep': { type: 'stdio', command: 'node', args: [], env: {}, url: null },
        'change': { type: 'stdio', command: 'node', args: ['new.js'], env: {}, url: null },
        'added-srv': { type: 'stdio', command: 'node', args: [], env: {}, url: null }
      });
      for (let round = 0; round < 5; round++) {
        for (let i = 0; i < 10; i++) { await Promise.resolve(); }
        jest.runAllTimers();
      }
      const result = await p;
      expect(result.updated).toBe(true);
      expect(result.diff.removed).toEqual(['remove']);
      expect(result.diff.changed).toEqual(['change']);
      expect(result.diff.added).toEqual(['added-srv']);
      expect(manager.clients.has('remove')).toBe(false);
      expect(manager.clients.has('added-srv')).toBe(true);
      jest.useRealTimers();
    }, 10000);
  });

  describe('removeServer catch', () => {
    it('should handle disconnect errors on remove', async () => {
      const manager = makeManager();
      const client = addClientDirectly(manager, 'test');
      client.disconnect = jest.fn().mockRejectedValue(new Error('disconnect failed'));
      const result = await manager.removeServer('test');
      expect(result).toBe(true);
      expect(manager.clients.has('test')).toBe(false);
    });
  });

  describe('updateServer additional', () => {
    it('should handle disconnect errors', async () => {
      const manager = makeManager();
      const client = addClientDirectly(manager, 'test');
      client.disconnect = jest.fn().mockRejectedValue(new Error('disconnect err'));
      const updated = await manager.updateServer('test', { command: 'node', args: ['new.js'] });
      expect(updated.config.args).toEqual(['new.js']);
    });

    it('should skip reconnecting when disabled', async () => {
      const manager = makeManager();
      addClientDirectly(manager, 'test');
      const updated = await manager.updateServer('test', { command: 'node', args: [], disabled: true });
      expect(updated.config.disabled).toBe(true);
    });

    it('should emit serverError on connect failure', async () => {
      const manager = makeManager();
      const { safeSpawn } = require('../../src/utils/SafeExec');
      safeSpawn.mockImplementationOnce(() => { throw new Error('conn fail'); });
      jest.useFakeTimers();
      const errorHandler = jest.fn();
      manager.on('serverError', errorHandler);
      const updatePromise = manager.updateServer('new-srv', { command: 'node', args: [] });
      jest.advanceTimersByTime(200);
      await updatePromise;
      expect(errorHandler).toHaveBeenCalledWith({ name: 'new-srv', error: 'conn fail' });
      jest.useRealTimers();
    });
  });

  describe('reconnectServer', () => {
    it('should reconnect server successfully', async () => {
      const manager = makeManager();
      addClientDirectly(manager, 'test', { connected: true });
      jest.useFakeTimers();
      const p = manager.reconnectServer('test');
      for (let i = 0; i < 10; i++) { await Promise.resolve(); }
      jest.runAllTimers();
      const reconnected = await p;
      expect(reconnected).toBeDefined();
      expect(reconnected.name).toBe('test');
      jest.useRealTimers();
    }, 10000);

    it('should throw for non-existent server', async () => {
      const manager = makeManager();
      await expect(manager.reconnectServer('ghost')).rejects.toThrow('not found');
    });

    it('should handle disconnect errors on reconnect', async () => {
      const manager = makeManager();
      addClientDirectly(manager, 'test', { connected: true });
      const client = manager.getServer('test');
      client.disconnect = jest.fn().mockRejectedValue(new Error('disco err'));
      jest.useFakeTimers();
      const p = manager.reconnectServer('test');
      for (let i = 0; i < 10; i++) { await Promise.resolve(); }
      jest.runAllTimers();
      const reconnected = await p;
      expect(reconnected).toBeDefined();
      jest.useRealTimers();
    }, 10000);
  });

  describe('clearServerCache', () => {
    it('should reconnect connected server', async () => {
      const manager = makeManager();
      addClientDirectly(manager, 'test', { connected: true });
      jest.useFakeTimers();
      const p = manager.clearServerCache('test');
      for (let i = 0; i < 10; i++) { await Promise.resolve(); }
      jest.runAllTimers();
      await p;
      expect(manager.getServer('test')).toBeDefined();
      jest.useRealTimers();
    }, 10000);

    it('should do nothing for non-existent server', async () => {
      const manager = makeManager();
      await manager.clearServerCache('ghost');
    });

    it('should handle disconnect errors on cache clear', async () => {
      const manager = makeManager();
      addClientDirectly(manager, 'test', { connected: true });
      const client = manager.getServer('test');
      client.disconnect = jest.fn().mockRejectedValue(new Error('disco err'));
      jest.useFakeTimers();
      const p = manager.clearServerCache('test');
      for (let i = 0; i < 10; i++) { await Promise.resolve(); }
      jest.runAllTimers();
      await p;
      expect(manager.getServer('test')).toBeDefined();
      jest.useRealTimers();
    }, 10000);

    it('should emit serverError on reconnect failure', async () => {
      const manager = makeManager();
      addClientDirectly(manager, 'test', { connected: true });
      const { safeSpawn } = require('../../src/utils/SafeExec');
      safeSpawn.mockImplementationOnce(() => { throw new Error('reconn fail'); });
      const errorHandler = jest.fn();
      manager.on('serverError', errorHandler);
      await manager.clearServerCache('test');
      expect(errorHandler).toHaveBeenCalledWith({ name: 'test', error: 'reconn fail' });
    });
  });

  describe('getTools cache', () => {
    it('should return cached tools', async () => {
      const manager = makeManager();
      manager.toolCache.set('test', ['cached-tool']);
      const tools = await manager.getTools('test');
      expect(tools).toEqual(['cached-tool']);
    });

    it('should fetch and cache tools from connected server', async () => {
      const manager = makeManager();
      addClientDirectly(manager, 'test', { connected: true });
      const tools = await manager.getTools('test');
      expect(tools).toEqual([]);
      expect(manager.toolCache.get('test')).toEqual([]);
    });
  });

  describe('callTool', () => {
    it('should call tool on connected server', async () => {
      const manager = makeManager();
      addClientDirectly(manager, 'test', { connected: true });
      const result = await manager.callTool('test', 'some_tool', { arg: 1 });
      expect(result).toEqual({ content: [] });
    });
  });

  describe('_connectWithQueue concurrency', () => {
    it('should queue connections when at maxConcurrent', async () => {
      const manager = makeManager({ maxConcurrent: 1 });
      jest.useFakeTimers();
      const p1 = manager.addServer('s1', { command: 'node', args: [] });
      const p2 = manager.addServer('s2', { command: 'node', args: [] });
      jest.advanceTimersByTime(200);
      await p1;
      jest.advanceTimersByTime(200);
      await p2;
      expect(manager.clients.has('s1')).toBe(true);
      expect(manager.clients.has('s2')).toBe(true);
      expect(manager._activeConnections).toBe(0);
      jest.useRealTimers();
    });
  });

  describe('cleanup error', () => {
    it('should handle cleanup disconnect errors', async () => {
      const manager = makeManager();
      const client = addClientDirectly(manager, 'test');
      client.disconnect = jest.fn().mockRejectedValue(new Error('cleanup err'));
      await manager.cleanup();
      expect(manager.clients.size).toBe(0);
      expect(manager._connectionQueue.length).toBe(0);
      expect(manager._activeConnections).toBe(0);
    });
  });
});
