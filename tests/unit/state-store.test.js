'use strict';

const { StateStore, createUseStore, createStoreProvider } = require('../../src/agent/StateStore');

describe('StateStore', () => {
  let store;

  beforeEach(() => {
    store = new StateStore({ count: 0, user: 'alice' });
  });

  describe('constructor', () => {
    it('should initialize with given state', () => {
      expect(store._state).toEqual({ count: 0, user: 'alice' });
    });

    it('should default to empty state', () => {
      const s = new StateStore();
      expect(s._state).toEqual({});
    });

    it('should set maxHistory default', () => {
      expect(store.maxHistory).toBe(50);
    });

    it('should accept custom maxHistory', () => {
      const s = new StateStore({}, { maxHistory: 10 });
      expect(s.maxHistory).toBe(10);
    });

    it('should initialize middlewares from options', () => {
      const mw = jest.fn();
      const s = new StateStore({}, { middlewares: [mw] });
      expect(s._middlewares).toEqual([mw]);
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      expect(store.getState()).toEqual({ count: 0, user: 'alice' });
    });
  });

  describe('setState', () => {
    it('should merge partial state', () => {
      store.setState({ count: 1 });
      expect(store.getState()).toEqual({ count: 1, user: 'alice' });
    });

    it('should accept updater function', () => {
      store.setState((prev) => ({ count: prev.count + 1 }));
      expect(store.getState()).toEqual({ count: 1 });
    });

    it('should skip if state reference is unchanged', () => {
      const state = store.getState();
      store.setState(() => state);
      expect(store.getState()).toBe(state);
    });

    it('should record history entry', () => {
      store.setState({ count: 5 }, 'increment');
      expect(store.history).toHaveLength(1);
      expect(store.history[0].oldState).toEqual({ count: 0, user: 'alice' });
      expect(store.history[0].newState).toEqual({ count: 5, user: 'alice' });
      expect(store.history[0].reason).toBe('increment');
    });

    it('should emit stateChanged event', () => {
      const handler = jest.fn();
      store.on('stateChanged', handler);
      store.setState({ count: 10 });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        oldState: { count: 0, user: 'alice' },
        newState: { count: 10, user: 'alice' },
        reason: null
      });
    });

    it('should notify listeners', () => {
      const listener = jest.fn();
      store.subscribe(listener);
      store.setState({ count: 7 });
      expect(listener).toHaveBeenCalledWith({ count: 7, user: 'alice' });
    });

    it('should not notify when state unchanged', () => {
      const listener = jest.fn();
      store.subscribe(listener);
      const state = store.getState();
      store.setState(() => state);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('should return unsubscribe function', () => {
      const listener = jest.fn();
      const unsub = store.subscribe(listener);
      expect(typeof unsub).toBe('function');
    });

    it('should stop notifying after unsubscribe', () => {
      const listener = jest.fn();
      const unsub = store.subscribe(listener);
      unsub();
      store.setState({ count: 99 });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('_recordHistory', () => {
    it('should enforce maxHistory limit', () => {
      const s = new StateStore({}, { maxHistory: 2 });
      s.setState({ a: 1 });
      s.setState({ a: 2 });
      s.setState({ a: 3 });
      expect(s.history).toHaveLength(2);
      expect(s.history[0].newState).toEqual({ a: 2 });
      expect(s.history[1].newState).toEqual({ a: 3 });
    });
  });

  describe('getHistory', () => {
    it('should return a copy of history', () => {
      store.setState({ count: 1 }, 'first');
      store.setState({ count: 2 }, 'second');
      const history = store.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].reason).toBe('first');
      expect(history[1].reason).toBe('second');
      const histRef = store.getHistory();
      expect(histRef).not.toBe(store.history);
    });
  });

  describe('addMiddleware', () => {
    it('should add middleware that transforms partial', () => {
      const mw = jest.fn().mockReturnValue({ count: 100 });
      store.addMiddleware(mw);
      store.setState({ count: 5 });
      expect(store.getState().count).toBe(100);
      expect(mw).toHaveBeenCalledWith({ count: 5 }, { count: 0, user: 'alice' });
    });

    it('should keep original partial if middleware returns undefined', () => {
      const mw = jest.fn().mockReturnValue(undefined);
      store.addMiddleware(mw);
      store.setState({ count: 5 });
      expect(store.getState().count).toBe(5);
    });

    it('should run middlewares in order', () => {
      const calls = [];
      const mw1 = jest.fn().mockImplementation((partial) => {
        calls.push('mw1');
        return { ...partial, step: 1 };
      });
      const mw2 = jest.fn().mockImplementation((partial) => {
        calls.push('mw2');
        return { ...partial, step: 2 };
      });
      store.addMiddleware(mw1);
      store.addMiddleware(mw2);
      store.setState({ x: 1 });
      expect(store.getState().step).toBe(2);
      expect(calls).toEqual(['mw1', 'mw2']);
    });
  });

  describe('optimisticUpdate', () => {
    it('should set state optimistically', () => {
      store.optimisticUpdate('count', 50, null);
      expect(store.getState().count).toBe(50);
      const update = store._optimisticUpdates.get('count');
      expect(update.currentValue).toBe(0);
    });

    it('should record reason with optimistic prefix', () => {
      store.optimisticUpdate('count', 50, null);
      expect(store.history[0].reason).toBe('optimistic:count');
    });
  });

  describe('rollback', () => {
    it('should rollback to previous value without rollback fn', () => {
      store.optimisticUpdate('count', 100, null);
      store.rollback('count');
      expect(store.getState().count).toBe(0);
    });

    it('should call rollback function if provided', () => {
      const rollbackFn = jest.fn().mockReturnValue(42);
      store.optimisticUpdate('count', 100, rollbackFn);
      store.rollback('count');
      expect(rollbackFn).toHaveBeenCalled();
      expect(store.getState().count).toBe(42);
    });

    it('should return false for unknown key', () => {
      expect(store.rollback('unknown')).toBe(false);
    });

    it('should delete the optimistic update after rollback', () => {
      store.optimisticUpdate('count', 100, null);
      store.rollback('count');
      expect(store._optimisticUpdates.has('count')).toBe(false);
    });
  });

  describe('select', () => {
    it('should return selected portion of state', () => {
      const count = store.select((s) => s.count);
      expect(count).toBe(0);
    });

    it('should work with nested selection', () => {
      store.setState({ user: 'bob' });
      const user = store.select((s) => s.user);
      expect(user).toBe('bob');
    });
  });

  describe('reset', () => {
    it('should reset state to given initial state', () => {
      store.setState({ count: 10, user: 'bob' });
      store.reset({ count: 0, user: 'alice' });
      expect(store.getState()).toEqual({ count: 0, user: 'alice' });
    });

    it('should clear history on reset', () => {
      store.setState({ count: 1 });
      store.reset();
      expect(store.history).toEqual([]);
    });

    it('should notify listeners on reset', () => {
      const listener = jest.fn();
      store.subscribe(listener);
      store.reset({ value: 0 });
      expect(listener).toHaveBeenCalledWith({ value: 0 });
    });

    it('should emit reset event', () => {
      const handler = jest.fn();
      store.on('reset', handler);
      store.reset({ x: 1 });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('export', () => {
    it('should return state and timestamp', () => {
      const exported = store.export();
      expect(exported.state).toEqual({ count: 0, user: 'alice' });
      expect(exported.exportedAt).toBeGreaterThan(0);
    });
  });

  describe('import', () => {
    it('should set state from exported data', () => {
      store.import({ state: { count: 42, user: 'imported' } });
      expect(store.getState()).toEqual({ count: 42, user: 'imported' });
    });

    it('should do nothing if data has no state', () => {
      store.import({});
      expect(store.getState()).toEqual({ count: 0, user: 'alice' });
    });
  });
});

describe('createUseStore', () => {
  let store;
  let useStore;

  beforeEach(() => {
    store = new StateStore({ value: 10, label: 'test' });
    useStore = createUseStore(store);
  });

  it('should return full state without selector', () => {
    expect(useStore()).toEqual({ value: 10, label: 'test' });
  });

  it('should return selected value with selector', () => {
    expect(useStore((s) => s.value)).toBe(10);
  });

  it('should subscribe to store changes', () => {
    const selector = jest.fn().mockImplementation((s) => s.value);
    const val = useStore(selector);
    expect(val).toBe(10);
    store.setState({ value: 20 });
    expect(selector).toHaveBeenCalled();
  });

  it('should not update if selected value is unchanged', () => {
    const selector = jest.fn().mockImplementation((s) => s.label);
    const val = useStore(selector);
    expect(val).toBe('test');
    store.setState({ value: 20 });
    expect(selector).toHaveBeenCalled();
    expect(store.getState().label).toBe('test');
  });
});

describe('createStoreProvider', () => {
  it('should return store, useStore and Provider', () => {
    const result = createStoreProvider({ theme: 'dark' });
    expect(result.store).toBeInstanceOf(StateStore);
    expect(result.store.getState()).toEqual({ theme: 'dark' });
    expect(typeof result.useStore).toBe('function');
    expect(typeof result.Provider).toBe('function');
  });

  it('Provider should set custom state', () => {
    const result = createStoreProvider({ theme: 'light' });
    const providerResult = result.Provider({ children: [], initialState: { theme: 'custom' } });
    expect(providerResult.store.getState()).toEqual({ theme: 'custom' });
  });

  it('Provider should not set state when no custom state given', () => {
    const result = createStoreProvider({ theme: 'light' });
    const providerResult = result.Provider({ children: [] });
    expect(providerResult.store.getState()).toEqual({ theme: 'light' });
  });
});
