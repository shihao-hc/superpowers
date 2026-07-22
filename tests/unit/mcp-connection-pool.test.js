jest.mock('../../src/mcp/MCPClient');

const { MCPConnectionPool, MCPClientPoolFactory, DynamicPoolManager } = require('../../src/mcp/MCPConnectionPool');
const { MCPClient } = require('../../src/mcp/MCPClient');

function createMockClient(name) {
  const client = {
    start: jest.fn().mockResolvedValue(true),
    stop: jest.fn().mockResolvedValue(),
    call: jest.fn().mockResolvedValue({ result: 'ok' }),
    ready: true,
    connected: true,
    closing: false,
    name: name || 'test-client'
  };
  client.start.mockResolvedValue(client);
  return client;
}

let clientCounter = 0;

beforeEach(() => {
  clientCounter = 0;
  MCPClient.mockClear();
  MCPClient.mockImplementation(() => {
    const c = createMockClient(`mock-client-${clientCounter++}`);
    return c;
  });
});

describe('MCPConnectionPool', () => {
  let pool;

  afterEach(async () => {
    if (pool) {
      await pool.stop().catch(() => {});
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      pool = new MCPConnectionPool('test', 'node', ['server.js'], { NODE_ENV: 'test' });
      expect(pool.name).toBe('test');
      expect(pool.command).toBe('node');
      expect(pool.args).toEqual(['server.js']);
      expect(pool.env).toEqual({ NODE_ENV: 'test' });
      expect(pool.options.poolSize).toBe(2);
      expect(pool.options.minSize).toBe(1);
      expect(pool.options.maxSize).toBe(5);
      expect(pool.options.timeout).toBe(30000);
      expect(pool.pool).toHaveLength(2);
      expect(pool.available).toHaveLength(2);
      expect(pool.inUse.size).toBe(0);
      expect(pool.waitQueue).toEqual([]);
      expect(pool.stats).toEqual({
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalWaitTime: 0,
        maxWaitTime: 0
      });
    });

    it('should initialize with custom options', () => {
      pool = new MCPConnectionPool('custom', 'python', ['script.py'], {}, {
        poolSize: 3,
        minSize: 2,
        maxSize: 8,
        timeout: 5000
      });
      expect(pool.options.poolSize).toBe(3);
      expect(pool.options.minSize).toBe(2);
      expect(pool.options.maxSize).toBe(8);
      expect(pool.options.timeout).toBe(5000);
      expect(pool.pool).toHaveLength(3);
      expect(pool.available).toHaveLength(3);
    });
  });

  describe('start', () => {
    it('should start all clients and return count', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2 });

      const count = await pool.start();

      expect(count).toBe(2);
      expect(pool.available).toHaveLength(2);
    });

    it('should handle partial client start failures', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 3 });

      pool.pool[1].start.mockRejectedValue(new Error('Connection timeout'));

      const count = await pool.start();

      expect(count).toBe(2);
    });

    it('should throw when no clients available after start', async () => {
      MCPClient.mockImplementation(() => {
        const client = createMockClient('test-pool-fail');
        client.start.mockRejectedValue(new Error('Connection refused'));
        return client;
      });

      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 1 });

      await expect(pool.start()).rejects.toThrow(
        'MCP connection pool test failed to start any connections'
      );
    });
  });

  describe('stop', () => {
    it('should stop all clients and clear state', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {});

      const client = await pool.acquire();
      await pool.stop();

      expect(client.stop).toHaveBeenCalled();
      expect(pool.available).toHaveLength(0);
      expect(pool.inUse.size).toBe(0);
      expect(pool.waitQueue).toHaveLength(0);
    });
  });

  describe('scaleUp', () => {
    it('should add new client and start it', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 1, maxSize: 3 });

      expect(pool.pool).toHaveLength(1);

      const result = await pool.scaleUp();

      expect(result).toBe(true);
      expect(pool.pool).toHaveLength(2);
      expect(pool.available).toHaveLength(2);
    });

    it('should return false when at maxSize', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2, maxSize: 2 });

      const result = await pool.scaleUp();

      expect(result).toBe(false);
      expect(pool.pool).toHaveLength(2);
    });

    it('should rollback on start failure', async () => {
      let callNum = 0;
      MCPClient.mockImplementation(() => {
        const client = createMockClient(`scale-${callNum}`);
        callNum += 1;
        if (callNum > 1) {
          client.start.mockRejectedValue(new Error('Start crashed'));
        }
        return client;
      });

      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 1, maxSize: 3 });

      const result = await pool.scaleUp();

      expect(result).toBe(false);
      expect(pool.pool).toHaveLength(1);
      expect(pool.available).toHaveLength(1);
    });

    it('should handle client missing from pool during start failure rollback', async () => {
      let callNum = 0;
      MCPClient.mockImplementation(() => {
        const client = createMockClient(`rollback-${callNum}`);
        callNum += 1;
        if (callNum > 1) {
          client.start.mockRejectedValue(new Error('Start crashed'));
        }
        return client;
      });

      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 1, maxSize: 3 });
      jest.spyOn(pool.pool, 'indexOf').mockReturnValueOnce(-1);

      const result = await pool.scaleUp();

      expect(result).toBe(false);
      expect(pool.pool).toHaveLength(2);
    });

    it('should handle client not in available during start failure rollback', async () => {
      let callNum = 0;
      MCPClient.mockImplementation(() => {
        const client = createMockClient(`rollback-${callNum}`);
        callNum += 1;
        if (callNum > 1) {
          client.start.mockRejectedValue(new Error('Start crashed'));
        }
        return client;
      });

      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 1, maxSize: 3 });
      jest.spyOn(pool.available, 'indexOf').mockReturnValueOnce(-1);

      const result = await pool.scaleUp();

      expect(result).toBe(false);
      expect(pool.pool).toHaveLength(1);
    });
  });

  describe('scaleDown', () => {
    it('should remove last client', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2, minSize: 1 });

      expect(pool.pool).toHaveLength(2);
      expect(pool.available).toHaveLength(2);

      const result = await pool.scaleDown();

      expect(result).toBe(true);
      expect(pool.pool).toHaveLength(1);
      expect(pool.available).toHaveLength(1);
    });

    it('should return false when at minSize', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 1, minSize: 1 });

      const result = await pool.scaleDown();

      expect(result).toBe(false);
    });

    it('should return false when all clients in use', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2, minSize: 1 });

      await pool.acquire();
      await pool.acquire();

      const result = await pool.scaleDown();

      expect(result).toBe(false);
    });

    it('should return false when last client is in use', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 3, minSize: 1 });

      const lastClient = pool.pool[pool.pool.length - 1];
      pool.inUse.add(lastClient);

      const result = await pool.scaleDown();

      expect(result).toBe(false);
      expect(pool.pool).toHaveLength(3);
    });

    it('should handle client not in available during scaleDown', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2, minSize: 1 });
      jest.spyOn(pool.available, 'indexOf').mockReturnValueOnce(-1);

      const result = await pool.scaleDown();

      expect(result).toBe(true);
      expect(pool.pool).toHaveLength(1);
      expect(pool.available).toHaveLength(2);
    });
  });

  describe('acquire', () => {
    it('should acquire available client', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2 });

      const client = await pool.acquire();

      expect(client).toBeDefined();
      expect(pool.inUse.has(client)).toBe(true);
      expect(pool.available.length).toBe(1);
    });

    it('should wait when no client available then resolve on release', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 1 });

      const client1 = await pool.acquire();
      expect(pool.available.length).toBe(0);

      const acquirePromise = pool.acquire();

      await new Promise((resolve) => {
        setTimeout(() => {
          pool.release(client1);
          resolve();
        }, 20);
      });

      const result = await acquirePromise;
      expect(result).toBe(client1);
    });

    it('should start client if not ready', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2 });

      const lastIdx = pool.available.length - 1;
      pool.available[lastIdx].ready = false;

      const client = await pool.acquire();

      expect(client.start).toHaveBeenCalled();
      expect(client.ready).toBe(false);
      expect(pool.inUse.has(client)).toBe(true);
    });

    it('should throw if client start fails', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2 });

      const lastIdx = pool.available.length - 1;
      pool.available[lastIdx].ready = false;
      pool.available[lastIdx].start.mockRejectedValue(new Error('Start crashed'));

      await expect(pool.acquire()).rejects.toThrow('Start crashed');
    });
  });

  describe('release', () => {
    it('should return client to pool', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2 });

      const client = await pool.acquire();
      expect(pool.available.length).toBe(1);

      pool.release(client);

      expect(pool.inUse.has(client)).toBe(false);
      expect(pool.available.length).toBe(2);
    });

    it('should not return disconnected or closing client', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2 });

      const client = await pool.acquire();
      client.connected = false;

      pool.release(client);

      expect(pool.inUse.has(client)).toBe(false);
      expect(pool.available.length).toBe(1);
    });

    it('should not return client with closing flag', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2 });

      const client = await pool.acquire();
      client.closing = true;

      pool.release(client);

      expect(pool.inUse.has(client)).toBe(false);
      expect(pool.available.length).toBe(1);
    });

    it('should resolve waiters', () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 1 });

      const resolveFn = jest.fn();
      pool.waitQueue.push({ resolve: resolveFn });

      const client = pool.available[0];
      pool.release(client);

      expect(resolveFn).toHaveBeenCalled();
    });
  });

  describe('call', () => {
    it('should acquire, call, release and track success', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2 });
      pool.pool.forEach((c) => {
        c.call.mockResolvedValue({ data: 'result' });
      });

      const result = await pool.call('tools/call', { name: 'test_tool' });

      expect(result).toEqual({ data: 'result' });
      expect(pool.stats.totalRequests).toBe(1);
      expect(pool.stats.successfulRequests).toBe(1);
      expect(pool.stats.failedRequests).toBe(0);
      expect(pool.available.length).toBe(2);
    });

    it('should release on error and track failure', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2 });
      pool.pool.forEach((c) => {
        c.call.mockRejectedValue(new Error('Call failed'));
      });

      await expect(pool.call('tools/call', {})).rejects.toThrow('Call failed');

      expect(pool.stats.totalRequests).toBe(1);
      expect(pool.stats.failedRequests).toBe(1);
      expect(pool.stats.successfulRequests).toBe(0);
      expect(pool.available.length).toBe(2);
    });
  });

  describe('listTools', () => {
    it('should return tools list', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2 });
      pool.pool.forEach((c) => {
        c.call.mockResolvedValue({
          tools: [{ name: 'read_file' }, { name: 'write_file' }]
        });
      });

      const tools = await pool.listTools();

      expect(tools).toEqual([{ name: 'read_file' }, { name: 'write_file' }]);
    });

    it('should return empty array when no tools', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2 });

      const tools = await pool.listTools();

      expect(tools).toEqual([]);
    });
  });

  describe('callTool', () => {
    it('should call tool with name and args', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2 });
      pool.pool.forEach((c) => {
        c.call.mockResolvedValue({ result: 'success' });
      });

      const result = await pool.callTool('read_file', { path: '/test.txt' });

      expect(result).toEqual({ result: 'success' });
      expect(pool.stats.totalRequests).toBe(1);
    });

    it('should call tool without arguments using default', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2 });
      pool.pool.forEach((c) => {
        c.call.mockResolvedValue({ result: 'ok' });
      });

      expect(await pool.callTool('ping')).toEqual({ result: 'ok' });
    });
  });

  describe('getStatus', () => {
    it('should return pool status with stats', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2 });

      const status = pool.getStatus();

      expect(status.name).toBe('test');
      expect(status.poolSize).toBe(2);
      expect(status.minSize).toBe(1);
      expect(status.maxSize).toBe(5);
      expect(status.available).toBe(2);
      expect(status.inUse).toBe(0);
      expect(status.waiting).toBe(0);
      expect(status.stats.avgWaitTime).toBe(0);
      expect(status.stats.successRate).toBe(0);
    });

    it('should calculate stats after requests', async () => {
      pool = new MCPConnectionPool('test', 'node', ['s.js'], {}, { poolSize: 2 });
      pool.stats.totalRequests = 10;
      pool.stats.successfulRequests = 8;
      pool.stats.failedRequests = 2;
      pool.stats.totalWaitTime = 500;
      pool.stats.maxWaitTime = 100;

      const status = pool.getStatus();

      expect(status.stats.avgWaitTime).toBe(50);
      expect(status.stats.successRate).toBe(0.8);
    });
  });
});

describe('MCPClientPoolFactory', () => {
  describe('createPool', () => {
    it('should create a new MCPConnectionPool', () => {
      const newPool = MCPClientPoolFactory.createPool('factory-test', 'node', ['app.js'], {});
      expect(newPool).toBeInstanceOf(MCPConnectionPool);
      expect(newPool.name).toBe('factory-test');
      expect(newPool.command).toBe('node');
      expect(newPool.args).toEqual(['app.js']);
      newPool.stop();
    });
  });

  describe('shouldUsePool', () => {
    it('should return write operation for write patterns', () => {
      expect(MCPClientPoolFactory.shouldUsePool('write_file')).toEqual({
        usePool: false, reason: 'write operation'
      });
      expect(MCPClientPoolFactory.shouldUsePool('create_record')).toEqual({
        usePool: false, reason: 'write operation'
      });
      expect(MCPClientPoolFactory.shouldUsePool('delete_item')).toEqual({
        usePool: false, reason: 'write operation'
      });
    });

    it('should return read operation for read patterns', () => {
      expect(MCPClientPoolFactory.shouldUsePool('read_file')).toEqual({
        usePool: true, reason: 'read operation'
      });
      expect(MCPClientPoolFactory.shouldUsePool('list_files')).toEqual({
        usePool: true, reason: 'read operation'
      });
      expect(MCPClientPoolFactory.shouldUsePool('search_query')).toEqual({
        usePool: true, reason: 'read operation'
      });
    });

    it('should follow write priority over read', () => {
      const result = MCPClientPoolFactory.shouldUsePool('write_read');
      expect(result).toEqual({ usePool: false, reason: 'write operation' });
    });

    it('should return default for unmatched patterns', () => {
      expect(MCPClientPoolFactory.shouldUsePool('unknown_op')).toEqual({
        usePool: false, reason: 'default'
      });
    });

    it('should respect defaultToPool option', () => {
      expect(MCPClientPoolFactory.shouldUsePool('unknown_op', { defaultToPool: true })).toEqual({
        usePool: true, reason: 'default'
      });
    });
  });
});

describe('DynamicPoolManager', () => {
  let manager;
  let mockPool;

  beforeEach(() => {
    manager = new DynamicPoolManager({ checkInterval: 10000 });
    mockPool = {
      getStatus: jest.fn(),
      scaleUp: jest.fn().mockResolvedValue(true),
      scaleDown: jest.fn().mockResolvedValue(true),
      pool: [{ name: 'client-0' }, { name: 'client-1' }]
    };
  });

  afterEach(() => {
    manager.stop();
  });

  describe('constructor', () => {
    it('should set default options', () => {
      const m = new DynamicPoolManager();
      expect(m.minSize).toBe(1);
      expect(m.maxSize).toBe(10);
      expect(m.scaleUpThreshold).toBe(0.8);
      expect(m.scaleDownThreshold).toBe(0.3);
      expect(m.scaleCooldown).toBe(30000);
      expect(m.checkInterval).toBe(5000);
      expect(m.enabled).toBe(true);
      expect(m.lastScaleTime).toBe(0);
      expect(m.pools).toBeInstanceOf(Map);
      expect(m.intervalId).toBeNull();
    });
  });

  describe('registerPool / unregisterPool', () => {
    it('should register and unregister pools', () => {
      manager.registerPool('test', mockPool);
      expect(manager.pools.has('test')).toBe(true);

      manager.unregisterPool('test');
      expect(manager.pools.has('test')).toBe(false);
    });
  });

  describe('start', () => {
    it('should start the scaling interval', () => {
      const spy = jest.spyOn(global, 'setInterval');
      manager.start();
      expect(spy).toHaveBeenCalled();
      expect(manager.intervalId).not.toBeNull();
      spy.mockRestore();
    });

    it('should not start if disabled', () => {
      const disabled = new DynamicPoolManager({ enabled: false, checkInterval: 10000 });
      disabled.start();
      expect(disabled.intervalId).toBeNull();
    });

    it('should not start if already running', () => {
      const spy = jest.spyOn(global, 'setInterval');
      manager.start();
      manager.start();
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('should invoke checkAndScale via interval callback', (done) => {
      const fast = new DynamicPoolManager({ checkInterval: 10 });
      mockPool.getStatus.mockReturnValue({ poolSize: 2, inUse: 0, minSize: 1, maxSize: 5 });
      fast.registerPool('test', mockPool);
      fast.start();

      setTimeout(() => {
        expect(mockPool.scaleDown).toHaveBeenCalled();
        fast.stop();
        done();
      }, 40);
    });
  });

  describe('stop', () => {
    it('should clear the interval', () => {
      manager.start();
      expect(manager.intervalId).not.toBeNull();

      manager.stop();
      expect(manager.intervalId).toBeNull();
    });

    it('should do nothing if not running', () => {
      manager.stop();
      expect(manager.intervalId).toBeNull();
    });
  });

  describe('_checkAndScale', () => {
    it('should scale up when utilization exceeds threshold', async () => {
      mockPool.getStatus.mockReturnValue({
        poolSize: 2, inUse: 2, minSize: 1, maxSize: 5
      });
      manager.registerPool('test', mockPool);

      await manager._checkAndScale();

      expect(mockPool.scaleUp).toHaveBeenCalled();
    });

    it('should scale down when utilization is below threshold', async () => {
      mockPool.getStatus.mockReturnValue({
        poolSize: 3, inUse: 0, minSize: 1, maxSize: 5
      });
      manager.registerPool('test', mockPool);

      await manager._checkAndScale();

      expect(mockPool.scaleDown).toHaveBeenCalled();
    });

    it('should not scale during cooldown period', async () => {
      mockPool.getStatus.mockReturnValue({
        poolSize: 2, inUse: 2, minSize: 1, maxSize: 5
      });
      manager.registerPool('test', mockPool);

      manager.lastScaleTime = Date.now();

      await manager._checkAndScale();

      expect(mockPool.scaleUp).not.toHaveBeenCalled();
      expect(mockPool.scaleDown).not.toHaveBeenCalled();
    });

    it('should not scale when utilization is between thresholds', async () => {
      mockPool.getStatus.mockReturnValue({
        poolSize: 4, inUse: 2, minSize: 1, maxSize: 10
      });
      manager.registerPool('test', mockPool);

      await manager._checkAndScale();

      expect(mockPool.scaleUp).not.toHaveBeenCalled();
      expect(mockPool.scaleDown).not.toHaveBeenCalled();
    });

    it('should not scale for empty pool', async () => {
      mockPool.getStatus.mockReturnValue({
        poolSize: 0, inUse: 0, minSize: 1, maxSize: 5
      });
      manager.registerPool('empty', mockPool);

      await manager._checkAndScale();

      expect(mockPool.scaleUp).not.toHaveBeenCalled();
      expect(mockPool.scaleDown).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return pool status summary', () => {
      mockPool.getStatus.mockReturnValue({
        poolSize: 3, inUse: 1, minSize: 1, maxSize: 5
      });
      manager.registerPool('test', mockPool);

      const status = manager.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.pools.test).toEqual({
        poolSize: 3,
        utilization: '33.3%'
      });
    });

    it('should handle empty pool with 0 poolSize', () => {
      mockPool.getStatus.mockReturnValue({
        poolSize: 0, inUse: 0, minSize: 0, maxSize: 0
      });
      manager.registerPool('empty', mockPool);

      const status = manager.getStatus();

      expect(status.pools.empty).toEqual({
        poolSize: 0,
        utilization: '0%'
      });
    });
  });
});
