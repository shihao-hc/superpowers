/**
 * ShiHao State Store
 * 基于 Claude Code 状态管理系统架构
 * 
 * Claude Code 特性:
 * - 类似 Zustand 的 Store 实现
 * - React Context Provider
 * - useSyncExternalStore 订阅
 * - 选择器模式
 */

const EventEmitter = require('events');

class StateStore extends EventEmitter {
  constructor(initialState = {}, options = {}) {
    super();
    
    this._state = initialState;
    this._listeners = new Set();
    this._optimisticUpdates = new Map();
    this._middlewares = options.middlewares || [];
    
    // 状态历史 (用于调试)
    this.history = [];
    this.maxHistory = options.maxHistory || 50;
  }
  
  // 获取当前状态
  getState() {
    return this._state;
  }
  
  // 设置状态
  setState(partial, reason = null) {
    const oldState = this._state;
    
    // 执行中间件
    for (const middleware of this._middlewares) {
      const result = middleware(partial, oldState);
      if (result !== undefined) {
        partial = result;
      }
    }
    
    // 计算新状态
    const newState = typeof partial === 'function' 
      ? partial(oldState)
      : { ...oldState, ...partial };
    
    // 相同则跳过
    if (newState === oldState) {
      return;
    }
    
    this._state = newState;
    
    // 记录历史
    this._recordHistory({
      oldState,
      newState,
      reason,
      timestamp: Date.now()
    });
    
    // 通知监听器
    this._notifyListeners();
    
    // 发出变化事件
    this.emit('stateChanged', {
      oldState,
      newState,
      reason
    });
  }
  
  // 订阅状态变化
  subscribe(listener) {
    this._listeners.add(listener);
    
    // 返回取消订阅函数
    return () => {
      this._listeners.delete(listener);
    };
  }
  
  // 通知所有监听器
  _notifyListeners() {
    for (const listener of this._listeners) {
      listener(this._state);
    }
  }
  
  // 记录历史
  _recordHistory(entry) {
    this.history.push(entry);
    
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }
  
  // 获取历史
  getHistory() {
    return [...this.history];
  }
  
  // 添加中间件
  addMiddleware(middleware) {
    this._middlewares.push(middleware);
  }
  
  // 乐观更新
  optimisticUpdate(key, value, rollback) {
    const currentValue = this._state[key];
    this._optimisticUpdates.set(key, { currentValue, rollback });
    this.setState({ [key]: value }, `optimistic:${key}`);
  }
  
  // 回滚乐观更新
  rollback(key) {
    const update = this._optimisticUpdates.get(key);
    if (!update) return false;
    
    if (update.rollback) {
      const rolledBack = update.rollback();
      this.setState({ [key]: rolledBack }, `rollback:${key}`);
    } else {
      this.setState({ [key]: update.currentValue }, `rollback:${key}`);
    }
    
    this._optimisticUpdates.delete(key);
    return true;
  }
  
  // 选择器 - 获取状态的一部分
  select(selector) {
    return selector(this._state);
  }
  
  // 重置状态
  reset(initialState = {}) {
    this._state = initialState;
    this.history = [];
    this._notifyListeners();
    this.emit('reset');
  }
  
  // 导出状态
  export() {
    return {
      state: this._state,
      exportedAt: Date.now()
    };
  }
  
  // 导入状态
  import(data) {
    if (data.state) {
      this.setState(data.state, 'import');
    }
  }
}

// 模拟 React Hook (用于非 React 环境)
function createUseStore(store) {
  return function useStore(selector) {
    if (!selector) {
      return store.getState();
    }
    
    let currentValue = selector(store.getState());
    
    // 创建简化的订阅
    const unsubscribe = store.subscribe((state) => {
      const newValue = selector(state);
      if (newValue !== currentValue) {
        currentValue = newValue;
      }
    });
    
    return currentValue;
  };
}

// 创建 Provider
function createStoreProvider(initialState, options = {}) {
  const store = new StateStore(initialState, options);
  const useStore = createUseStore(store);
  
  const Provider = ({ children, initialState: customState }) => {
    if (customState !== undefined) {
      store.setState(customState, 'provider');
    }
    
    return {
      store,
      useStore,
      getState: store.getState.bind(store),
      setState: store.setState.bind(store)
    };
  };
  
  return {
    Provider,
    store,
    useStore
  };
}

module.exports = { 
  StateStore, 
  createUseStore, 
  createStoreProvider 
};
