const { EventEmitter } = require('events');

class CachePreheater extends EventEmitter {
  constructor(options = {}) {
    super();
    this.warmupStrategies = new Map();
    this.warmupQueue = [];
    this.isWarming = false;
    this.options = {
      maxConcurrent: options.maxConcurrent || 5,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
      timeout: options.timeout || 30000,
      enabled: options.enabled !== false,
      ...options
    };
    
    this.stats = {
      totalPreheated: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      startTime: null,
      endTime: null
    };
  }

  registerStrategy(name, strategy) {
    this.warmupStrategies.set(name, {
      name,
      priority: strategy.priority || 0,
      items: strategy.items || [],
      executor: strategy.executor,
      condition: strategy.condition || (() => true),
      ttl: strategy.ttl || 300000
    });
  }

  addWarmupItem(name, key, data = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('Invalid warmup item: name must be a string');
    }
    if (key !== null && typeof key !== 'string') {
      throw new Error('Invalid warmup item: key must be a string or null');
    }
    if (typeof data !== 'object') {
      throw new Error('Invalid warmup item: data must be an object');
    }

    this.warmupQueue.push({
      name,
      key,
      data,
      addedAt: Date.now()
    });
  }

  async preheat(bridge, options = {}) {
    if (!this.options.enabled) {
      console.log('[CachePreheater] Preheating is disabled');
      return { skipped: true };
    }

    if (this.isWarming) {
      console.log('[CachePreheater] Preheating already in progress');
      return { skipped: true, message: 'Already warming' };
    }

    this.isWarming = true;
    this.stats.startTime = Date.now();
    this.stats.totalPreheated = 0;
    this.stats.successful = 0;
    this.stats.failed = 0;
    this.stats.skipped = 0;

    console.log('[CachePreheater] Starting cache preheating...');

    const results = {
      preheated: [],
      failed: [],
      skipped: []
    };

    const sortedStrategies = Array.from(this.warmupStrategies.values())
      .sort((a, b) => b.priority - a.priority);

    for (const strategy of sortedStrategies) {
      if (!strategy.condition()) {
        console.log(`[CachePreheater] Skipping strategy: ${strategy.name} (condition not met)`);
        continue;
      }

      const strategyResults = await this._preheatStrategy(strategy, bridge, options);
      results.preheated.push(...strategyResults.preheated);
      results.failed.push(...strategyResults.failed);
      results.skipped.push(...strategyResults.skipped);
    }

    for (const item of this.warmupQueue) {
      try {
        await this._warmupItem(item, bridge);
        results.preheated.push(item.key);
        this.stats.successful++;
      } catch (error) {
        results.failed.push({ key: item.key, error: error.message });
        this.stats.failed++;
      }
      this.stats.totalPreheated++;
    }

    this.stats.endTime = Date.now();
    this.isWarming = false;

    const duration = this.stats.endTime - this.stats.startTime;
    console.log(`[CachePreheater] Preheating complete in ${duration}ms`);
    console.log(`  - Preheated: ${results.preheated.length}`);
    console.log(`  - Failed: ${results.failed.length}`);
    console.log(`  - Skipped: ${results.skipped.length}`);

    this.emit('preheat-complete', results);

    return results;
  }

  async _preheatStrategy(strategy, bridge, options = {}) {
    const results = {
      preheated: [],
      failed: [],
      skipped: []
    };

    console.log(`[CachePreheater] Executing strategy: ${strategy.name}`);

    const items = typeof strategy.items === 'function' 
      ? await strategy.items() 
      : strategy.items;

    if (!Array.isArray(items)) {
      console.log(`[CachePreheater] Strategy ${strategy.name} returned invalid items`);
      return results;
    }

    const concurrency = options.maxConcurrent || this.options.maxConcurrent;
    const chunks = this._chunkArray(items, concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(async (item) => {
        try {
          if (strategy.executor) {
            await strategy.executor(bridge, item);
          }
          results.preheated.push(item.key || item.name || JSON.stringify(item));
          this.stats.successful++;
        } catch (error) {
          results.failed.push({ 
            key: item.key || item.name || JSON.stringify(item), 
            error: error.message 
          });
          this.stats.failed++;
        }
        this.stats.totalPreheated++;
      });

      await Promise.allSettled(promises);
    }

    return results;
  }

  async _warmupItem(item, bridge) {
    if (!item.executor) {
      const cacheKey = item.key;
      if (bridge._isCacheable) {
        return;
      }
    }

    if (item.executor) {
      await item.executor(bridge, item.data);
    }
  }

  _chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  getStats() {
    return {
      ...this.stats,
      isWarming: this.isWarming,
      strategiesCount: this.warmupStrategies.size,
      queueSize: this.warmupQueue.length,
      duration: this.stats.endTime 
        ? this.stats.endTime - this.stats.startTime 
        : null
    };
  }

  clear() {
    this.warmupQueue = [];
  }

  destroy() {
    this.clear();
    this.warmupStrategies.clear();
    this.removeAllListeners();
  }
}

function createMCPToolPreheater(bridge, options = {}) {
  const preheater = new CachePreheater(options);

  preheater.registerStrategy('mcp-tools', {
    priority: 100,
    condition: () => bridge && bridge.clients && bridge.clients.size > 0,
    executor: async (bridge, tool) => {
      if (tool.fullName && bridge._isCacheable) {
        const server = tool.serverName || tool.fullName.split(':')[0];
        const toolName = tool.fullName.split(':')[1];
        if (bridge._isCacheable(server, toolName)) {
          try {
            await bridge.call(tool.fullName, tool.sampleParams || {}, { skipCache: false });
          } catch (e) {
            // Ignore errors during preheating
          }
        }
      }
    },
    items: () => {
      const tools = [];
      if (bridge && bridge.serverToTools) {
        for (const [serverName, serverTools] of bridge.serverToTools) {
          for (const tool of serverTools) {
            tools.push({
              fullName: tool.fullName,
              serverName,
              sampleParams: tool.inputSchema 
                ? _generateSampleParams(tool.inputSchema) 
                : {}
            });
          }
        }
      }
      return tools;
    }
  });

  return preheater;
}

function _generateSampleParams(schema) {
  if (!schema || !schema.properties) return {};
  
  const params = {};
  const required = schema.required || [];
  
  for (const [name, def] of Object.entries(schema.properties)) {
    if (required.includes(name)) {
      params[name] = _getSampleValue(def.type);
    }
  }
  
  return params;
}

function _getSampleValue(type) {
  switch (type) {
    case 'string': return '';
    case 'number': return 0;
    case 'boolean': return false;
    case 'array': return [];
    case 'object': return {};
    default: return null;
  }
}

module.exports = { CachePreheater, createMCPToolPreheater };
