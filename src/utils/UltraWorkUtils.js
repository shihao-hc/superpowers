/**
 * UltraWork AI 统一工具类库 - Node.js版本
 * 用于服务器端和测试环境
 */

// ==================== 安全工具 ====================

/**
 * HTML转义，防止XSS攻击
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
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
  if (!str) return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 创建安全的正则表达式
 */
function createSafeRegex(pattern, flags = '') {
  const escaped = escapeRegex(pattern).replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$', flags);
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
    if (typeof str !== 'string') return false;
    return str.length >= min && str.length <= max;
  }

  static sanitizeHtml(html) {
    return escapeHtml(html);
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

  clearTimeout(id) {
    clearTimeout(id);
    this.timers.delete(id);
  }

  clearInterval(id) {
    clearInterval(id);
    this.intervals.delete(id);
  }

  cleanup() {
    this.timers.forEach(id => clearTimeout(id));
    this.intervals.forEach(id => clearInterval(id));
    
    this.timers.clear();
    this.intervals.clear();
  }

  getStats() {
    return {
      activeTimers: this.timers.size,
      activeIntervals: this.intervals.size,
      total: this.timers.size + this.intervals.size
    };
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

    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`EventBus listener error for ${event}:`, error);
        }
      });
    }

    if (this.onceListeners.has(event)) {
      this.onceListeners.get(event).forEach(callback => {
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
      timestamp: new Date().toISOString()
    };

    if (process.env.NODE_ENV === 'production') {
      console.error(`[${context}] ${error.message}`);
    } else {
      console.error('Error:', errorInfo);
    }

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
        
        if (attempt === maxAttempts) break;
        
        onRetry({
          attempt,
          error,
          nextDelay: delay * Math.pow(backoff, attempt - 1)
        });
        
        await new Promise(resolve => 
          setTimeout(resolve, delay * Math.pow(backoff, attempt - 1))
        );
      }
    }
    
    throw lastError;
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
      this.listeners.get(key).forEach(callback => {
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

module.exports = {
  escapeHtml,
  safeJsonParse,
  escapeRegex,
  createSafeRegex,
  InputValidator,
  TimerManager,
  EnhancedEventBus,
  ErrorHandler,
  RetryHandler,
  ConfigManager
};