class PerformanceOptimizer {
  constructor(options = {}) {
    this.options = {
      cacheMaxSize: 1000,
      cacheTTL: 300000,
      requestQueueMaxSize: 100,
      requestTimeout: 30000,
      debounceDelay: 300,
      throttleDelay: 100,
      ...options
    };

    this.cache = new Map();
    this.cacheTimestamps = new Map();
    this.requestQueue = [];
    this.activeRequests = 0;
    this.maxConcurrent = options.maxConcurrent || 5;
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      requestsQueued: 0,
      requestsCompleted: 0,
      requestsTimeout: 0,
      avgResponseTime: 0,
      totalResponseTime: 0
    };

    this._cleanupInterval = setInterval(() => {
      this._cleanupCache();
    }, 60000);
  }

  getCacheKey(prefix, params) {
    const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
    return `${prefix}:${sorted}`;
  }

  getFromCache(key) {
    if (!this.cache.has(key)) {
      this.metrics.cacheMisses++;
      return null;
    }

    const timestamp = this.cacheTimestamps.get(key);
    if (Date.now() - timestamp > this.options.cacheTTL) {
      this.cache.delete(key);
      this.cacheTimestamps.delete(key);
      this.metrics.cacheMisses++;
      return null;
    }

    this.metrics.cacheHits++;
    return this.cache.get(key);
  }

  setCache(key, value) {
    if (this.cache.size >= this.options.cacheMaxSize) {
      this._evictOldest();
    }

    this.cache.set(key, value);
    this.cacheTimestamps.set(key, Date.now());
  }

  _evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, timestamp] of this.cacheTimestamps) {
      if (timestamp < oldestTime) {
        oldestTime = timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.cacheTimestamps.delete(oldestKey);
    }
  }

  _cleanupCache() {
    const now = Date.now();
    for (const [key, timestamp] of this.cacheTimestamps) {
      if (now - timestamp > this.options.cacheTTL) {
        this.cache.delete(key);
        this.cacheTimestamps.delete(key);
      }
    }
  }

  async queueRequest(requestFn, priority = 0) {
    return new Promise((resolve, reject) => {
      if (this.requestQueue.length >= this.options.requestQueueMaxSize) {
        reject(new Error('Request queue full'));
        return;
      }

      const timeoutId = setTimeout(() => {
        const index = this.requestQueue.findIndex(r => r.timeoutId === timeoutId);
        if (index > -1) {
          this.requestQueue.splice(index, 1);
          this.metrics.requestsTimeout++;
          reject(new Error('Request timeout'));
        }
      }, this.options.requestTimeout);

      this.requestQueue.push({
        requestFn,
        priority,
        resolve,
        reject,
        timeoutId,
        timestamp: Date.now()
      });

      this.requestQueue.sort((a, b) => b.priority - a.priority);
      this.metrics.requestsQueued++;
      this._processQueue();
    });
  }

  async _processQueue() {
    while (this.activeRequests < this.maxConcurrent && this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      clearTimeout(request.timeoutId);
      this.activeRequests++;

      const startTime = Date.now();
      try {
        const result = await request.requestFn();
        const duration = Date.now() - startTime;
        this.metrics.totalResponseTime += duration;
        this.metrics.requestsCompleted++;
        this.metrics.avgResponseTime = this.metrics.totalResponseTime / this.metrics.requestsCompleted;
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      } finally {
        this.activeRequests--;
        if (this.requestQueue.length > 0) {
          setTimeout(() => this._processQueue(), 0);
        }
      }
    }
  }

  debounce(fn, delay) {
    let timeoutId = null;
    return (...args) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay || this.options.debounceDelay);
    };
  }

  throttle(fn, delay) {
    let lastCall = 0;
    return (...args) => {
      const now = Date.now();
      if (now - lastCall >= (delay || this.options.throttleDelay)) {
        lastCall = now;
        return fn(...args);
      }
    };
  }

  getMetrics() {
    const cacheTotal = this.metrics.cacheHits + this.metrics.cacheMisses;
    return {
      ...this.metrics,
      cacheHitRate: cacheTotal > 0 ? (this.metrics.cacheHits / cacheTotal * 100).toFixed(2) + '%' : '0%',
      queueLength: this.requestQueue.length,
      activeRequests: this.activeRequests,
      cacheSize: this.cache.size
    };
  }

  clearCache() {
    this.cache.clear();
    this.cacheTimestamps.clear();
  }

  destroy() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }

    for (const request of this.requestQueue) {
      clearTimeout(request.timeoutId);
      request.reject(new Error('Optimizer destroyed'));
    }
    this.requestQueue = [];
    this.clearCache();
  }
}

class MemoryOptimizer {
  constructor(options = {}) {
    this.options = {
      gcThreshold: 50 * 1024 * 1024,
      warningThreshold: 100 * 1024 * 1024,
      checkInterval: 30000,
      ...options
    };

    this._checkInterval = null;
    this._onWarning = options.onWarning || (() => {});
    this._onCritical = options.onCritical || (() => {});

    if (typeof performance !== 'undefined' && performance.memory) {
      this._startMonitoring();
    }
  }

  _startMonitoring() {
    this._checkInterval = setInterval(() => {
      this._checkMemory();
    }, this.options.checkInterval);
  }

  _checkMemory() {
    if (!performance.memory) return;

    const used = performance.memory.usedJSHeapSize;
    const limit = performance.memory.jsHeapSizeLimit;

    if (used > this.options.warningThreshold) {
      this._onWarning({ used, limit, percentage: (used / limit * 100).toFixed(2) });
    }

    if (used > this.options.gcThreshold) {
      this._onCritical({ used, limit, percentage: (used / limit * 100).toFixed(2) });
      this._tryGC();
    }
  }

  _tryGC() {
    if (typeof window !== 'undefined' && window.gc) {
      try {
        window.gc();
      } catch (e) {}
    }
  }

  getMemoryStats() {
    if (!performance.memory) {
      return { supported: false };
    }

    return {
      supported: true,
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit,
      usedMB: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2),
      limitMB: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)
    };
  }

  destroy() {
    if (this._checkInterval) {
      clearInterval(this._checkInterval);
      this._checkInterval = null;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PerformanceOptimizer, MemoryOptimizer };
}

if (typeof window !== 'undefined') {
  window.PerformanceOptimizer = PerformanceOptimizer;
  window.MemoryOptimizer = MemoryOptimizer;
}
