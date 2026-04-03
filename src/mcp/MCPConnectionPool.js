const { MCPClient } = require('./MCPClient');

const READ_ONLY_METHODS = ['tools/list', 'ping'];

class DynamicPoolManager {
  constructor(options = {}) {
    this.minSize = options.minSize || 1;
    this.maxSize = options.maxSize || 10;
    this.scaleUpThreshold = options.scaleUpThreshold || 0.8;
    this.scaleDownThreshold = options.scaleDownThreshold || 0.3;
    this.scaleCooldown = options.scaleCooldown || 30000;
    this.lastScaleTime = 0;
    this.checkInterval = options.checkInterval || 5000;
    this.enabled = options.enabled !== false;
    this.pools = new Map();
    this.intervalId = null;
  }

  registerPool(name, pool) {
    this.pools.set(name, pool);
  }

  unregisterPool(name) {
    this.pools.delete(name);
  }

  start() {
    if (!this.enabled || this.intervalId) return;
    
    this.intervalId = setInterval(() => {
      this._checkAndScale();
    }, this.checkInterval);
    
    this.intervalId.unref();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async _checkAndScale() {
    const now = Date.now();
    if (now - this.lastScaleTime < this.scaleCooldown) return;
    
    for (const [name, pool] of this.pools) {
      const status = pool.getStatus();
      const utilization = status.poolSize > 0 
        ? status.inUse / status.poolSize 
        : 0;
      
      if (utilization > this.scaleUpThreshold && status.poolSize < this.maxSize) {
        await pool.scaleUp();
        this.lastScaleTime = now;
        console.log(`[DynamicPoolManager] Scaled up ${name} to ${pool.pool.length} connections`);
      } else if (utilization < this.scaleDownThreshold && status.poolSize > this.minSize) {
        await pool.scaleDown();
        this.lastScaleTime = now;
        console.log(`[DynamicPoolManager] Scaled down ${name} to ${pool.pool.length} connections`);
      }
    }
  }

  getStatus() {
    const pools = {};
    for (const [name, pool] of this.pools) {
      const status = pool.getStatus();
      pools[name] = {
        poolSize: status.poolSize,
        utilization: status.poolSize > 0 
          ? (status.inUse / status.poolSize * 100).toFixed(1) + '%'
          : '0%'
      };
    }
    return { pools, enabled: this.enabled };
  }
}

class MCPConnectionPool {
  constructor(name, command, args, env, options = {}) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.env = env;
    this.options = {
      poolSize: options.poolSize || 2,
      minSize: options.minSize || 1,
      maxSize: options.maxSize || 5,
      timeout: options.timeout || 30000,
      ...options
    };
    
    this.pool = [];
    this.available = [];
    this.inUse = new Set();
    this.waitQueue = [];
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalWaitTime: 0,
      maxWaitTime: 0
    };
    
    this._initPool();
  }

  async _initPool() {
    for (let i = 0; i < this.options.poolSize; i++) {
      const client = this._createClient(i);
      this.pool.push(client);
      this.available.push(client);
    }
  }

  _createClient(index) {
    return new MCPClient(
      `${this.name}-pool-${index}`,
      this.command,
      this.args,
      this.env,
      this.options
    );
  }

  async start() {
    const startPromises = this.pool.map(client => 
      client.start().catch(err => {
        console.error(`[MCPConnectionPool] Failed to start client ${client.name}:`, err.message);
        return null;
      })
    );
    
    const results = await Promise.all(startPromises);
    this.available = results.filter(c => c !== null);
    
    if (this.available.length === 0) {
      throw new Error(`MCP connection pool ${this.name} failed to start any connections`);
    }
    
    return this.available.length;
  }

  async stop() {
    await Promise.all(this.pool.map(c => c.stop()));
    this.available = [];
    this.inUse.clear();
    this.waitQueue = [];
  }

  async scaleUp() {
    if (this.pool.length >= this.options.maxSize) return false;
    
    const newIndex = this.pool.length;
    const client = this._createClient(newIndex);
    this.pool.push(client);
    this.available.push(client);
    
    try {
      await client.start();
    } catch (error) {
      const idx = this.pool.indexOf(client);
      if (idx !== -1) {
        this.pool.splice(idx, 1);
        const availIdx = this.available.indexOf(client);
        if (availIdx !== -1) this.available.splice(availIdx, 1);
      }
      return false;
    }
    
    return true;
  }

  async scaleDown() {
    if (this.pool.length <= this.options.minSize) return false;
    if (this.inUse.size >= this.pool.length) return false;
    
    const idx = this.pool.length - 1;
    const client = this.pool[idx];
    
    if (this.inUse.has(client)) return false;
    
    await client.stop();
    this.pool.splice(idx, 1);
    const availIdx = this.available.indexOf(client);
    if (availIdx !== -1) this.available.splice(availIdx, 1);
    
    return true;
  }

  async acquire() {
    const startWait = Date.now();
    
    while (true) {
      if (this.available.length > 0) {
        const client = this.available.pop();
        this.inUse.add(client);
        
        if (!client.ready) {
          try {
            await client.start();
          } catch (error) {
            this.inUse.delete(client);
            throw error;
          }
        }
        
        this.stats.totalWaitTime += Date.now() - startWait;
        this.stats.maxWaitTime = Math.max(this.stats.maxWaitTime, Date.now() - startWait);
        
        return client;
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  release(client) {
    this.inUse.delete(client);
    
    if (client.connected && !client.closing) {
      this.available.push(client);
    }
    
    while (this.waitQueue.length > 0 && this.available.length > 0) {
      const waiter = this.waitQueue.shift();
      waiter.resolve();
    }
  }

  async call(method, params = {}) {
    const client = await this.acquire();
    
    this.stats.totalRequests++;
    
    try {
      const result = await client.call(method, params);
      this.stats.successfulRequests++;
      return result;
    } catch (error) {
      this.stats.failedRequests++;
      throw error;
    } finally {
      this.release(client);
    }
  }

  async listTools() {
    const result = await this.call('tools/list');
    return result?.tools || [];
  }

  async callTool(toolName, args = {}) {
    const result = await this.call('tools/call', { name: toolName, arguments: args });
    return result;
  }

  getStatus() {
    return {
      name: this.name,
      poolSize: this.pool.length,
      minSize: this.options.minSize,
      maxSize: this.options.maxSize,
      available: this.available.length,
      inUse: this.inUse.size,
      waiting: this.waitQueue.length,
      stats: {
        ...this.stats,
        avgWaitTime: this.stats.totalRequests > 0 
          ? this.stats.totalWaitTime / this.stats.totalRequests 
          : 0,
        successRate: this.stats.totalRequests > 0
          ? this.stats.successfulRequests / this.stats.totalRequests
          : 0
      }
    };
  }
}

class MCPClientPoolFactory {
  static createPool(name, command, args, env, options = {}) {
    return new MCPConnectionPool(name, command, args, env, options);
  }

  static shouldUsePool(toolName, options = {}) {
    const readonlyPatterns = [
      'read', 'list', 'get', 'search', 'query', 'fetch', 'find'
    ];
    
    const writePatterns = [
      'write', 'create', 'update', 'delete', 'remove', 'set', 'post', 'put', 'patch'
    ];
    
    const lowerTool = toolName.toLowerCase();
    
    for (const pattern of writePatterns) {
      if (lowerTool.includes(pattern)) {
        return { usePool: false, reason: 'write operation' };
      }
    }
    
    for (const pattern of readonlyPatterns) {
      if (lowerTool.includes(pattern)) {
        return { usePool: true, reason: 'read operation' };
      }
    }
    
    return { usePool: options.defaultToPool || false, reason: 'default' };
  }
}

module.exports = { MCPConnectionPool, MCPClientPoolFactory, DynamicPoolManager };
