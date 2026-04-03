/**
 * UltraWork AI 统一工具类库
 * 提供安全、性能、错误处理等核心工具函数
 */

// ==================== 安全工具 ====================

/**
 * HTML转义，防止XSS攻击
 */
function escapeHtml(str) {
  if (!str) {return '';}
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * 安全的JSON解析，防止原型污染
 */
function safeJsonParse(jsonString, defaultValue = null) {
  try {
    const result = JSON.parse(jsonString);
    // 防止原型污染
    if (result && typeof result === 'object') {
      Object.setPrototypeOf(result, null);
    }
    return result;
  } catch (error) {
    console.warn('JSON parse error:', error.message);
    return defaultValue;
  }
}

/**
 * 安全的正则表达式转义
 */
function escapeRegex(str) {
  if (!str) {return '';}
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 创建安全的正则表达式
 */
function createSafeRegex(pattern, flags = '') {
  const escaped = escapeRegex(pattern).replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, flags);
}

/**
 * 输入验证器
 */
class InputValidator {
  static validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  static validateUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static validateStringLength(str, min = 0, max = Infinity) {
    if (typeof str !== 'string') {return false;}
    return str.length >= min && str.length <= max;
  }

  static sanitizeHtml(html) {
    // 简单的HTML清理，建议生产环境使用DOMPurify
    return html
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}

// ==================== 性能工具 ====================

/**
 * 统一的定时器管理器
 */
class TimerManager {
  constructor() {
    this.timers = new Set();
    this.intervals = new Set();
    this.animationFrames = new Set();
  }

  setTimeout(callback, delay) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      try {
        callback();
      } catch (error) {
        console.error('Timer callback error:', error);
      }
    }, delay);
    this.timers.add(id);
    return id;
  }

  setInterval(callback, delay) {
    const id = setInterval(() => {
      try {
        callback();
      } catch (error) {
        console.error('Interval callback error:', error);
      }
    }, delay);
    this.intervals.add(id);
    return id;
  }

  requestAnimationFrame(callback) {
    const id = requestAnimationFrame(() => {
      this.animationFrames.delete(id);
      try {
        callback();
      } catch (error) {
        console.error('AnimationFrame callback error:', error);
      }
    });
    this.animationFrames.add(id);
    return id;
  }

  clearTimeout(id) {
    clearTimeout(id);
    this.timers.delete(id);
  }

  clearInterval(id) {
    clearInterval(id);
    this.intervals.delete(id);
  }

  cancelAnimationFrame(id) {
    cancelAnimationFrame(id);
    this.animationFrames.delete(id);
  }

  cleanup() {
    this.timers.forEach((id) => clearTimeout(id));
    this.intervals.forEach((id) => clearInterval(id));
    this.animationFrames.forEach((id) => cancelAnimationFrame(id));

    this.timers.clear();
    this.intervals.clear();
    this.animationFrames.clear();
  }

  getStats() {
    return {
      activeTimers: this.timers.size,
      activeIntervals: this.intervals.size,
      activeAnimationFrames: this.animationFrames.size,
      total: this.timers.size + this.intervals.size + this.animationFrames.size
    };
  }
}

/**
 * 内存使用监控
 */
class MemoryMonitor {
  constructor() {
    this.snapshots = [];
    this.maxSnapshots = 100;
  }

  takeSnapshot() {
    if (performance.memory) {
      const snapshot = {
        timestamp: Date.now(),
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      };

      this.snapshots.push(snapshot);
      if (this.snapshots.length > this.maxSnapshots) {
        this.snapshots.shift();
      }

      return snapshot;
    }
    return null;
  }

  getMemoryUsage() {
    const snapshot = this.takeSnapshot();
    if (snapshot) {
      return {
        used: `${Math.round(snapshot.usedJSHeapSize / 1024 / 1024)}MB`,
        total: `${Math.round(snapshot.totalJSHeapSize / 1024 / 1024)}MB`,
        percentage: `${Math.round((snapshot.usedJSHeapSize / snapshot.totalJSHeapSize) * 100)}%`
      };
    }
    return null;
  }

  detectLeaks() {
    if (this.snapshots.length < 2) {return null;}

    const recent = this.snapshots.slice(-5);
    const growth = recent.map((s, i) =>
      i > 0 ? s.usedJSHeapSize - recent[i-1].usedJSHeapSize : 0
    ).slice(1);

    const avgGrowth = growth.reduce((a, b) => a + b, 0) / growth.length;

    return {
      averageGrowth: `${Math.round(avgGrowth / 1024 / 1024)}MB`,
      isLeaking: avgGrowth > 1024 * 1024, // 1MB增长阈值
      recommendations: avgGrowth > 1024 * 1024 ?
        ['检查事件监听器清理', '检查定时器清理', '检查DOM节点清理'] : []
    };
  }
}

/**
 * 性能测量工具
 */
class PerformanceMeasurer {
  constructor() {
    this.measurements = new Map();
  }

  start(label) {
    this.measurements.set(label, {
      start: performance.now(),
      end: null,
      duration: null
    });
  }

  end(label) {
    const measurement = this.measurements.get(label);
    if (measurement) {
      measurement.end = performance.now();
      measurement.duration = measurement.end - measurement.start;
      return measurement;
    }
    return null;
  }

  measure(label, callback) {
    this.start(label);
    const result = callback();
    this.end(label);
    return result;
  }

  async measureAsync(label, asyncCallback) {
    this.start(label);
    const result = await asyncCallback();
    this.end(label);
    return result;
  }

  getResults() {
    const results = {};
    for (const [label, measurement] of this.measurements) {
      if (measurement.duration !== null) {
        results[label] = {
          duration: `${Math.round(measurement.duration * 100) / 100}ms`,
          raw: measurement.duration
        };
      }
    }
    return results;
  }
}

// ==================== 错误处理工具 ====================

/**
 * 统一错误处理器
 */
class ErrorHandler {
  static handle(error, context = '') {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js'
    };

    // 生产环境不应输出完整stack
    if (process.env.NODE_ENV === 'production') {
      console.error(`[${context}] ${error.message}`);
    } else {
      console.error('Error:', errorInfo);
    }

    // 可以在这里添加错误上报逻辑
    // ErrorReporter.report(errorInfo);

    return errorInfo;
  }

  static wrapAsync(asyncFn, context = '') {
    return async (...args) => {
      try {
        return await asyncFn(...args);
      } catch (error) {
        ErrorHandler.handle(error, context);
        throw error;
      }
    };
  }

  static wrapSync(syncFn, context = '') {
    return (...args) => {
      try {
        return syncFn(...args);
      } catch (error) {
        ErrorHandler.handle(error, context);
        throw error;
      }
    };
  }
}

/**
 * 重试机制
 */
class RetryHandler {
  static async retry(fn, options = {}) {
    const {
      maxAttempts = 3,
      delay = 1000,
      backoff = 2,
      onRetry = () => {}
    } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn(attempt);
      } catch (error) {
        lastError = error;

        if (attempt === maxAttempts) {break;}

        onRetry({
          attempt,
          error,
          nextDelay: delay * Math.pow(backoff, attempt - 1)
        });

        await new Promise((resolve) =>
          setTimeout(resolve, delay * Math.pow(backoff, attempt - 1))
        );
      }
    }

    throw lastError;
  }
}

// ==================== 事件系统 ====================

/**
 * 增强的事件总线
 */
class EnhancedEventBus {
  constructor() {
    this.listeners = new Map();
    this.onceListeners = new Map();
    this.history = [];
    this.maxHistory = 100;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    // 返回取消订阅函数
    return () => this.off(event, callback);
  }

  once(event, callback) {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set());
    }
    this.onceListeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
    if (this.onceListeners.has(event)) {
      this.onceListeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    const eventRecord = {
      event,
      data,
      timestamp: Date.now()
    };

    this.history.push(eventRecord);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // 调用普通监听器
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`EventBus listener error for ${event}:`, error);
        }
      });
    }

    // 调用一次性监听器
    if (this.onceListeners.has(event)) {
      this.onceListeners.get(event).forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`EventBus once listener error for ${event}:`, error);
        }
      });
      this.onceListeners.delete(event);
    }
  }

  removeAllListeners(event = null) {
    if (event) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  getListenerCount(event) {
    const normal = this.listeners.has(event) ? this.listeners.get(event).size : 0;
    const once = this.onceListeners.has(event) ? this.onceListeners.get(event).size : 0;
    return normal + once;
  }

  getHistory() {
    return [...this.history];
  }
}

// ==================== 配置管理 ====================

/**
 * 统一配置管理器
 */
class ConfigManager {
  constructor(defaults = {}) {
    this.config = { ...defaults };
    this.listeners = new Map();
  }

  get(key, defaultValue = null) {
    return this.config[key] !== undefined ? this.config[key] : defaultValue;
  }

  set(key, value) {
    const oldValue = this.config[key];
    this.config[key] = value;

    if (this.listeners.has(key)) {
      this.listeners.get(key).forEach((callback) => {
        try {
          callback(value, oldValue);
        } catch (error) {
          console.error(`Config listener error for ${key}:`, error);
        }
      });
    }
  }

  update(updates) {
    Object.entries(updates).forEach(([key, value]) => {
      this.set(key, value);
    });
  }

  watch(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);

    return () => {
      if (this.listeners.has(key)) {
        this.listeners.get(key).delete(callback);
      }
    };
  }

  getAll() {
    return { ...this.config };
  }

  reset() {
    this.config = {};
    this.listeners.clear();
  }
}

// ==================== 导出 ====================

// 浏览器环境
if (typeof window !== 'undefined') {
  window.UltraWorkUtils = {
    // 安全工具
    escapeHtml,
    safeJsonParse,
    escapeRegex,
    createSafeRegex,
    InputValidator,

    // 性能工具
    TimerManager,
    MemoryMonitor,
    PerformanceMeasurer,

    // 错误处理
    ErrorHandler,
    RetryHandler,

    // 事件系统
    EnhancedEventBus,

    // 配置管理
    ConfigManager
  };
}

// Node.js环境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml,
    safeJsonParse,
    escapeRegex,
    createSafeRegex,
    InputValidator,
    TimerManager,
    MemoryMonitor,
    PerformanceMeasurer,
    ErrorHandler,
    RetryHandler,
    EnhancedEventBus,
    ConfigManager
  };
}