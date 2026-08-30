const { AsyncExecutor } = require('../../src/skills/agent/AsyncExecutor');

function createExecutor() {
  return { execute: jest.fn().mockResolvedValue({ success: true }) };
}

function makeId(ae) {
  return ae._generateExecutionId();
}

describe('AsyncExecutor', () => {
  let ae;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(global, 'setInterval').mockReturnValue(123);
    ae = new AsyncExecutor();
    jest.spyOn(ae, '_executeAsync').mockReturnValue(Promise.resolve());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should set default values', () => {
      expect(ae.maxConcurrent).toBe(10);
      expect(ae.executionTimeout).toBe(300000);
      expect(ae.progressInterval).toBe(1000);
      expect(ae.maxHistory).toBe(1000);
      expect(ae.cleanupInterval).toBe(60000);
      expect(ae.history).toEqual([]);
      expect(ae.listeners).toBeInstanceOf(Map);
      expect(ae.listeners.size).toBe(0);
      expect(ae.executions).toBeInstanceOf(Map);
      expect(ae.executions.size).toBe(0);
    });

    test('should accept custom options', () => {
      const custom = new AsyncExecutor({
        maxConcurrent: 3, executionTimeout: 60000,
        progressInterval: 500, maxHistory: 50, cleanupInterval: 30000
      });
      expect(custom.maxConcurrent).toBe(3);
      expect(custom.executionTimeout).toBe(60000);
      expect(custom.progressInterval).toBe(500);
      expect(custom.maxHistory).toBe(50);
    });

    test('should start cleanup timer with default interval', () => {
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
    });
  });

  describe('execute', () => {
    test('should create execution and return summary in returned object', async () => {
      const result = await ae.execute('testSkill', { key: 'value' });
      expect(result.executionId).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.estimatedDuration).toBe(0);
      expect(result.checkProgressUrl).toContain(result.executionId);
    });

    test('should store execution with pending status', () => {
      const eid = makeId(ae);
      ae.execute('testSkill', { key: 'value' }, { executionId: eid });
      const exec = ae.executions.get(eid);
      expect(exec.id).toBe(eid);
      expect(exec.skillName).toBe('testSkill');
      expect(exec.parameters).toEqual({ key: 'value' });
      expect(exec.status).toBe('pending');
      expect(exec.progress).toBe(0);
      expect(exec.progressMessage).toBe('Initializing...');
      expect(exec.steps).toEqual([]);
      expect(exec.createdAt).toBeLessThanOrEqual(Date.now());
      expect(exec.startedAt).toBeNull();
      expect(exec.completedAt).toBeNull();
      expect(exec.result).toBeNull();
      expect(exec.error).toBeNull();
      expect(exec.metadata).toEqual({});
    });

    test('should use custom executionId', async () => {
      const result = await ae.execute('test', {}, { executionId: 'custom-1' });
      expect(result.executionId).toBe('custom-1');
      expect(ae.executions.has('custom-1')).toBe(true);
    });

    test('should store sessionId', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid, sessionId: 'session-1' });
      expect(ae.executions.get(eid).sessionId).toBe('session-1');
    });

    test('should store metadata', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid, metadata: { source: 'api' } });
      expect(ae.executions.get(eid).metadata).toEqual({ source: 'api' });
    });

    test('should throw when max concurrent reached', async () => {
      ae.maxConcurrent = 1;
      await ae.execute('first', {});
      await expect(ae.execute('second', {})).rejects.toThrow('Maximum concurrent executions (1) reached');
    });

    test('should store callbacks', () => {
      const eid = makeId(ae);
      const cb = { onProgress: jest.fn(), onComplete: jest.fn(), onError: jest.fn() };
      ae.execute('test', {}, { executionId: eid, ...cb });
      const exec = ae.executions.get(eid);
      expect(exec.callbacks.onProgress).toBe(cb.onProgress);
      expect(exec.callbacks.onComplete).toBe(cb.onComplete);
      expect(exec.callbacks.onError).toBe(cb.onError);
    });

    test('should emit created event', () => {
      const handler = jest.fn();
      ae.on('created', handler);
      ae.execute('test', {});
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].skillName).toBe('test');
    });
  });

  describe('getExecution', () => {
    test('should return execution details', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      const info = ae.getExecution(eid);
      expect(info.id).toBe(eid);
      expect(info.skillName).toBe('test');
      expect(info.status).toBe('pending');
      expect(info.progress).toBe(0);
      expect(info.createdAt).toBeDefined();
      expect(info.steps).toEqual([]);
    });

    test('should return null for non-existent', () => {
      expect(ae.getExecution('nonexistent')).toBeNull();
    });

    test('should include result when completed', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.executions.get(eid).status = 'completed';
      ae.executions.get(eid).result = { data: 'done' };
      expect(ae.getExecution(eid).result).toEqual({ data: 'done' });
    });

    test('should include error when failed', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.executions.get(eid).status = 'failed';
      ae.executions.get(eid).error = 'err';
      expect(ae.getExecution(eid).error).toBe('err');
    });

    test('should not include result when pending', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      expect(ae.getExecution(eid).result).toBeNull();
    });

    test('should not include error when not failed', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      expect(ae.getExecution(eid).error).toBeNull();
    });
  });

  describe('getProgress', () => {
    test('should return progress info', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      const p = ae.getProgress(eid);
      expect(p.executionId).toBe(eid);
      expect(p.progress).toBeDefined();
      expect(p.message).toBeDefined();
      expect(p.status).toBeDefined();
      expect(p.timestamp).toBeDefined();
    });

    test('should return null for non-existent', () => {
      expect(ae.getProgress('x')).toBeNull();
    });
  });

  describe('cancel', () => {
    test('should cancel pending execution', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      const result = ae.cancel(eid);
      expect(result.status).toBe('cancelled');
      expect(result.executionId).toBe(eid);
      expect(result.timestamp).toBeDefined();
    });

    test('should cancel running execution', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.executions.get(eid).status = 'running';
      expect(ae.cancel(eid).status).toBe('cancelled');
    });

    test('should set status and error on execution', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.cancel(eid);
      const exec = ae.executions.get(eid);
      expect(exec.status).toBe('cancelled');
      expect(exec.error).toBe('Cancelled by user');
      expect(exec.completedAt).toBeLessThanOrEqual(Date.now());
    });

    test('should emit cancelled event', () => {
      const handler = jest.fn();
      ae.on('cancelled', handler);
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.cancel(eid);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('should abort abortController', () => {
      const abortSpy = { abort: jest.fn() };
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.executions.get(eid).abortController = abortSpy;
      ae.executions.get(eid).status = 'running';
      ae.cancel(eid);
      expect(abortSpy.abort).toHaveBeenCalled();
    });

    test('should throw for non-existent', () => {
      expect(() => ae.cancel('nonexistent')).toThrow('not found');
    });

    test('should throw for already completed', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.executions.get(eid).status = 'completed';
      expect(() => ae.cancel(eid)).toThrow('already completed');
    });

    test('should throw for already failed', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.executions.get(eid).status = 'failed';
      expect(() => ae.cancel(eid)).toThrow('already failed');
    });

    test('should throw for already cancelled', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.executions.get(eid).status = 'cancelled';
      expect(() => ae.cancel(eid)).toThrow('already cancelled');
    });

    test('should add cancelled to history', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.cancel(eid);
      expect(ae.history.length).toBe(1);
      expect(ae.history[0].status).toBe('cancelled');
    });
  });

  describe('waitForCompletion', () => {
    test('should resolve when completed', async () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.executions.get(eid).status = 'completed';
      ae.executions.get(eid).result = { data: 'done' };
      await expect(ae.waitForCompletion(eid)).resolves.toEqual({ data: 'done' });
    });

    test('should reject when failed', async () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.executions.get(eid).status = 'failed';
      ae.executions.get(eid).error = 'error message';
      await expect(ae.waitForCompletion(eid)).rejects.toThrow('error message');
    });

    test('should reject when not found', async () => {
      await expect(ae.waitForCompletion('nonexistent')).rejects.toThrow('not found');
    });

    test('should reject on timeout', async () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.executions.get(eid).status = 'running';
      await expect(ae.waitForCompletion(eid, { timeout: 100, pollInterval: 50 })).rejects.toThrow('timeout');
    }, 10000);
  });

  describe('event system', () => {
    test('should add and call listeners', () => {
      const handler = jest.fn();
      ae.on('progress', handler);
      ae._emitEvent('progress', { value: 50 });
      expect(handler).toHaveBeenCalledWith({ value: 50 });
    });

    test('should remove listeners with off', () => {
      const handler = jest.fn();
      ae.on('progress', handler);
      ae.off('progress', handler);
      expect(ae.listeners.get('progress').has(handler)).toBe(false);
    });

    test('should return unsubscribe function', () => {
      const handler = jest.fn();
      const unsub = ae.on('progress', handler);
      unsub();
      expect(ae.listeners.get('progress').has(handler)).toBe(false);
    });

    test('should support multiple listeners', () => {
      const h1 = jest.fn(), h2 = jest.fn();
      ae.on('completed', h1);
      ae.on('completed', h2);
      ae._emitEvent('completed', { id: 1 });
      expect(h1).toHaveBeenCalled();
      expect(h2).toHaveBeenCalled();
    });

    test('should isolate listener errors', () => {
      const errHandler = jest.fn().mockImplementation(() => { throw new Error('boom'); });
      const goodHandler = jest.fn();
      jest.spyOn(console, 'error').mockImplementation(() => {});
      ae.on('progress', errHandler);
      ae.on('progress', goodHandler);
      ae._emitEvent('progress', { value: 1 });
      expect(goodHandler).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    test('should handle emit with no listeners', () => {
      expect(() => ae._emitEvent('nonexistent', {})).not.toThrow();
    });
  });

  describe('_executeAsync', () => {
    function flush() { return new Promise(r => setTimeout(r, 0)); }

    beforeEach(() => {
      jest.restoreAllMocks();
      jest.spyOn(global, 'setInterval').mockReturnValue(123);
      ae = new AsyncExecutor();
      jest.spyOn(ae, '_executeAsync').mockImplementation(function(execution, opts) {
        const executor = opts.executor || this._getDefaultExecutor();
        return executor.execute(execution.skillName, execution.parameters, {})
          .then(result => {
            execution.status = 'completed';
            execution.result = result;
            execution.completedAt = Date.now();
            if (execution.callbacks.onComplete) execution.callbacks.onComplete(execution);
          })
          .catch(error => {
            execution.status = 'failed';
            execution.error = error.message;
            execution.completedAt = Date.now();
            if (execution.callbacks.onError) execution.callbacks.onError(execution, error);
          });
      });
    });

    test('should complete execution successfully', async () => {
      const executor = { execute: jest.fn().mockResolvedValue({ success: true, data: 'result' }) };
      await ae.execute('testSkill', {}, { executor });
      await flush();
      const execs = Array.from(ae.executions.values());
      expect(execs.length).toBe(1);
      expect(execs[0].status).toBe('completed');
      expect(execs[0].result).toEqual({ success: true, data: 'result' });
    });

    test('should handle execution failure', async () => {
      const executor = { execute: jest.fn().mockRejectedValue(new Error('execution failed')) };
      await ae.execute('test', {}, { executor });
      await flush();
      const execs = Array.from(ae.executions.values());
      expect(execs.length).toBe(1);
      expect(execs[0].status).toBe('failed');
      expect(execs[0].error).toBe('execution failed');
    });

    test('should call onComplete callback', async () => {
      await ae.execute('test', {}, { executor: createExecutor(), onComplete: jest.fn() });
      await flush();
      expect(ae.executions.size).toBe(1);
    });

    test('should call onError callback on failure', async () => {
      await ae.execute('test', {}, {
        executor: { execute: jest.fn().mockRejectedValue(new Error('fail')) },
        onError: jest.fn()
      });
      await flush();
      expect(ae.executions.size).toBe(1);
    });
  });

  describe('getActiveExecutions', () => {
    test('should return pending', () => {
      ae.execute('test', {});
      expect(ae.getActiveExecutions().length).toBe(1);
    });

    test('should return running', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.executions.get(eid).status = 'running';
      expect(ae.getActiveExecutions().length).toBe(1);
    });

    test('should not return completed', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.executions.get(eid).status = 'completed';
      expect(ae.getActiveExecutions().length).toBe(0);
    });

    test('should not return failed or cancelled', () => {
      const eid1 = makeId(ae), eid2 = makeId(ae);
      ae.execute('a', {}, { executionId: eid1 });
      ae.execute('b', {}, { executionId: eid2 });
      ae.executions.get(eid1).status = 'failed';
      ae.executions.get(eid2).status = 'cancelled';
      expect(ae.getActiveExecutions().length).toBe(0);
    });
  });

  describe('getHistory', () => {
    test('should return history sorted by createdAt desc', () => {
      const eid1 = makeId(ae), eid2 = makeId(ae);
      ae.execute('a', {}, { executionId: eid1 });
      ae.execute('b', {}, { executionId: eid2 });
      ae._addToHistory(ae.executions.get(eid1));
      ae._addToHistory(ae.executions.get(eid2));
      const h = ae.getHistory();
      expect(h.length).toBe(2);
      expect(h[0].createdAt).toBeGreaterThanOrEqual(h[1].createdAt);
    });

    test('should filter by skillName', () => {
      const eid1 = makeId(ae), eid2 = makeId(ae);
      ae.execute('skillA', {}, { executionId: eid1 });
      ae.execute('skillB', {}, { executionId: eid2 });
      ae._addToHistory(ae.executions.get(eid1));
      ae._addToHistory(ae.executions.get(eid2));
      expect(ae.getHistory({ skillName: 'skillA' }).length).toBe(1);
    });

    test('should filter by status', () => {
      const eid1 = makeId(ae), eid2 = makeId(ae);
      ae.execute('a', {}, { executionId: eid1 });
      ae.execute('b', {}, { executionId: eid2 });
      ae.executions.get(eid1).status = 'completed';
      ae.executions.get(eid2).status = 'failed';
      ae._addToHistory(ae.executions.get(eid1));
      ae._addToHistory(ae.executions.get(eid2));
      expect(ae.getHistory({ status: 'completed' }).length).toBe(1);
    });

    test('should paginate', () => {
      for (let i = 0; i < 10; i++) {
        const eid = makeId(ae);
        ae.execute(`s${i}`, {}, { executionId: eid });
        ae._addToHistory(ae.executions.get(eid));
      }
      expect(ae.getHistory({ limit: 3 }).length).toBe(3);
      expect(ae.getHistory({ limit: 3, offset: 8 }).length).toBe(2);
    });

    test('should cap at maxHistory', () => {
      ae.maxHistory = 3;
      for (let i = 0; i < 5; i++) {
        const eid = makeId(ae);
        ae.execute(`s${i}`, {}, { executionId: eid });
        ae._addToHistory(ae.executions.get(eid));
      }
      expect(ae.history.length).toBe(3);
    });

    test('should return empty when no history', () => {
      expect(ae.getHistory()).toEqual([]);
    });
  });

  describe('getStats', () => {
    test('should return zeros when empty', () => {
      const stats = ae.getStats();
      expect(stats.active).toBe(0);
      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.historySize).toBe(0);
      expect(stats.averageDuration).toBe(0);
      expect(stats.maxConcurrent).toBe(10);
    });

    test('should calculate correct stats', () => {
      const eid1 = makeId(ae), eid2 = makeId(ae);
      ae.execute('a', {}, { executionId: eid1 });
      ae.execute('b', {}, { executionId: eid2 });
      ae.executions.get(eid1).status = 'completed';
      ae.executions.get(eid1).duration = 100;
      ae.executions.get(eid2).status = 'failed';
      ae.executions.get(eid2).duration = 200;
      ae._addToHistory(ae.executions.get(eid1));
      ae._addToHistory(ae.executions.get(eid2));
      const s = ae.getStats();
      expect(s.total).toBe(2);
      expect(s.completed).toBe(1);
      expect(s.failed).toBe(1);
      expect(s.historySize).toBe(2);
      expect(s.averageDuration).toBe(100);
    });
  });

  describe('_createProgressTracker', () => {
    test('setProgress should update progress', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      const exec = ae.executions.get(eid);
      const tracker = ae._createProgressTracker(exec);
      tracker.setProgress(50, 'Halfway');
      expect(exec.progress).toBe(50);
      expect(exec.progressMessage).toBe('Halfway');
    });

    test('addStep should add step to execution', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      const exec = ae.executions.get(eid);
      const tracker = ae._createProgressTracker(exec);
      tracker.addStep('step1', 'first step');
      expect(exec.steps.length).toBe(1);
      expect(exec.steps[0].name).toBe('step1');
      expect(exec.steps[0].status).toBe('pending');
    });

    test('step lifecycle should emit events', () => {
      const started = jest.fn(), completed = jest.fn();
      ae.on('step_started', started);
      ae.on('step_completed', completed);
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      const exec = ae.executions.get(eid);
      const tracker = ae._createProgressTracker(exec);
      const step = tracker.addStep('s1', 'desc');
      step.start();
      expect(started).toHaveBeenCalled();
      step.complete('res');
      expect(completed).toHaveBeenCalled();
      expect(exec.steps[0].result).toBe('res');
    });

    test('step fail should emit event', () => {
      const handler = jest.fn();
      ae.on('step_failed', handler);
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      const exec = ae.executions.get(eid);
      const tracker = ae._createProgressTracker(exec);
      const step = tracker.addStep('s1', 'desc');
      step.fail(new Error('step error'));
      expect(exec.steps[0].status).toBe('failed');
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('_updateProgress', () => {
    test('should clamp progress to 0-100', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      const exec = ae.executions.get(eid);
      ae._updateProgress(exec, -10, 'neg');
      expect(exec.progress).toBe(0);
      ae._updateProgress(exec, 150, 'over');
      expect(exec.progress).toBe(100);
    });

    test('should use default message', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae._updateProgress(ae.executions.get(eid), 42, null);
      expect(ae.executions.get(eid).progressMessage).toBe('Progress: 42%');
    });

    test('should emit progress event', () => {
      const handler = jest.fn();
      ae.on('progress', handler);
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae._updateProgress(ae.executions.get(eid), 75, '75%');
      expect(handler.mock.calls[0][0].progress).toBe(75);
    });

    test('should call onProgress callback', () => {
      const onProgress = jest.fn();
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid, onProgress });
      ae._updateProgress(ae.executions.get(eid), 30, 'Progressing');
      expect(onProgress).toHaveBeenCalledWith(30, 'Progressing');
    });
  });

  describe('_addToHistory', () => {
    test('should add entry to front of history', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae._addToHistory(ae.executions.get(eid));
      expect(ae.history[0].id).toBe(eid);
    });

    test('should include all fields', () => {
      const eid = makeId(ae);
      ae.execute('test', { p: 1 }, { executionId: eid });
      const exec = ae.executions.get(eid);
      exec.status = 'completed';
      exec.result = { data: 'done' };
      ae._addToHistory(exec);
      expect(ae.history[0].skillName).toBe('test');
      expect(ae.history[0].status).toBe('completed');
      expect(ae.history[0].result).toEqual({ data: 'done' });
    });

    test('should set result null when not completed', () => {
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      const exec = ae.executions.get(eid);
      exec.status = 'failed';
      exec.result = 'should be null';
      ae._addToHistory(exec);
      expect(ae.history[0].result).toBeNull();
    });
  });

  describe('_cleanupOldExecutions', () => {
    test('should remove old completed', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.executions.get(eid).status = 'completed';
      ae.executions.get(eid).completedAt = now - 7200000;
      ae._cleanupOldExecutions();
      expect(ae.executions.has(eid)).toBe(false);
    });

    test('should keep recent completed', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.executions.get(eid).status = 'completed';
      ae.executions.get(eid).completedAt = now - 600000;
      ae._cleanupOldExecutions();
      expect(ae.executions.has(eid)).toBe(true);
    });

    test('should timeout running executions', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.executions.get(eid).status = 'running';
      ae.executions.get(eid).createdAt = now - 600000;
      ae._cleanupOldExecutions();
      expect(ae.executions.has(eid)).toBe(false);
      expect(ae.history.some(e => e.id === eid && e.error === 'Execution timeout')).toBe(true);
    });

    test('should keep running within timeout', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const eid = makeId(ae);
      ae.execute('test', {}, { executionId: eid });
      ae.executions.get(eid).status = 'running';
      ae.executions.get(eid).createdAt = now - 60000;
      ae._cleanupOldExecutions();
      expect(ae.executions.get(eid).status).toBe('running');
    });
  });

  describe('_generateExecutionId', () => {
    test('should generate unique IDs', () => {
      expect(ae._generateExecutionId()).not.toBe(ae._generateExecutionId());
    });

    test('should start with exec_', () => {
      expect(ae._generateExecutionId()).toMatch(/^exec_/);
    });
  });

  describe('_getDefaultExecutor', () => {
    test('should have execute method', () => {
      expect(typeof ae._getDefaultExecutor().execute).toBe('function');
    });

    test('execute should return a promise', () => {
      expect(ae._getDefaultExecutor().execute('test', {})).toBeInstanceOf(Promise);
    });

    test('executes real per-skill executor when skillManager has the skill', async () => {
      const ae2 = new AsyncExecutor({
        skillManager: { getAllSkills: () => [{ name: 'docx', version: '1.0' }] }
      });
      const mockResult = { success: true, type: 'file', path: '/tmp/x.docx' };
      ae2._loadExecutorModule = jest.fn(() => ({ execute: jest.fn().mockResolvedValue(mockResult) }));
      const r = await ae2._getDefaultExecutor().execute('docx', { title: 't' });
      expect(ae2._loadExecutorModule).toHaveBeenCalledWith('docx');
      expect(r).toEqual(mockResult);
      expect(r.placeholder).toBeUndefined();
    });

    test('forces skill name to whitelist value (path traversal defense)', async () => {
      const ae2 = new AsyncExecutor();
      let receivedInputs = null;
      ae2._loadExecutorModule = jest.fn(() => ({ execute: jest.fn(async (inputs) => { receivedInputs = inputs; return { ok: true }; }) }));
      await ae2._getDefaultExecutor().execute('docx', { action: 'create', skill: { name: '../../evil' } });
      expect(receivedInputs.skill).toEqual({ name: 'docx' });
      expect(receivedInputs.skill.name).not.toContain('..');
    });

    test('throws honest error for unknown skill with skillManager', async () => {
      const ae2 = new AsyncExecutor({
        skillManager: { getAllSkills: () => [{ name: 'docx', version: '1.0' }] }
      });
      ae2._loadExecutorModule = jest.fn(() => null);
      await expect(ae2._getDefaultExecutor().execute('ghost', {})).rejects.toThrow('Skill \'ghost\' not found');
    });

    test('throws metadata-only error when skill exists but no executor', async () => {
      const ae2 = new AsyncExecutor({
        skillManager: { getAllSkills: () => [{ name: 'ghost', version: '1.0' }] }
      });
      ae2._loadExecutorModule = jest.fn(() => null);
      await expect(ae2._getDefaultExecutor().execute('ghost', {})).rejects.toThrow('metadata-only');
    });

    test('uses placeholder when no skillManager injected', async () => {
      const r = await ae._getDefaultExecutor().execute('whatever', {});
      expect(r.placeholder).toBe(true);
    }, 10000);
  });

  describe('clear', () => {
    test('should clear executions, history, and listeners', () => {
      ae.execute('a', {});
      ae.execute('b', {});
      ae.on('progress', jest.fn());
      const eid = makeId(ae);
      ae.execute('c', {}, { executionId: eid });
      ae._addToHistory(ae.executions.get(eid));
      ae.clear();
      expect(ae.executions.size).toBe(0);
      expect(ae.history.length).toBe(0);
      expect(ae.listeners.size).toBe(0);
    });
  });

  describe('_executeAsync real execution', () => {
    beforeEach(() => {
      ae._executeAsync.mockRestore();
    });

    test('completes with custom executor and calls onComplete', async () => {
      const executor = { execute: jest.fn().mockResolvedValue({ success: true, data: 'done' }) };
      const onComplete = jest.fn();
      const result = await ae.execute('testSkill', { key: 'val' }, { executor, onComplete });
      const origEid = result.executionId;
      expect(ae.executions.has(origEid)).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(ae.executions.has(origEid)).toBe(true);
      const exec = ae.executions.get(origEid);
      expect(exec.status).toBe('completed');
      expect(exec.result).toEqual({ success: true, data: 'done' });
      expect(executor.execute).toHaveBeenCalledWith('testSkill', { key: 'val' }, expect.any(Object));
      expect(onComplete).toHaveBeenCalledWith(exec);
    });

    test('handles failure and calls onError', async () => {
      const executor = { execute: jest.fn().mockRejectedValue(new Error('exec failed')) };
      const onError = jest.fn();
      const result = await ae.execute('testSkill', {}, { executor, onError });
      const origEid = result.executionId;
      expect(ae.executions.has(origEid)).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(ae.executions.has(origEid)).toBe(true);
      const exec = ae.executions.get(origEid);
      expect(exec.status).toBe('failed');
      expect(exec.error).toBe('exec failed');
      expect(onError).toHaveBeenCalledWith(exec, expect.any(Error));
    });

    test('completes with default executor', async () => {
      ae._getDefaultExecutor = () => ({ execute: jest.fn().mockResolvedValue({ success: true }) });
      const result = await ae.execute('testSkill', {});
      const origEid = result.executionId;
      expect(ae.executions.has(origEid)).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(ae.executions.has(origEid)).toBe(true);
      const exec = ae.executions.get(origEid);
      expect(exec.status).toBe('completed');
      expect(exec.result.success).toBe(true);
    });

    test('handles failure without onError callback', async () => {
      const executor = { execute: jest.fn().mockRejectedValue(new Error('exec failed')) };
      const result = await ae.execute('testSkill', {}, { executor });
      const origEid = result.executionId;
      expect(ae.executions.has(origEid)).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 50));
      const exec = ae.executions.get(origEid);
      expect(exec.status).toBe('failed');
      expect(exec.error).toBe('exec failed');
    });

    test('calls onProgress during execution', async () => {
      const onProgress = jest.fn();
      const executor = {
        execute: jest.fn().mockImplementation((_skill, _params, opts) => {
          opts.onProgress(50, 'halfway');
          return Promise.resolve({ success: true });
        })
      };
      const result = await ae.execute('testSkill', {}, { executor, onProgress });
      await new Promise(resolve => setTimeout(resolve, 50));
      const exec = ae.executions.get(result.executionId);
      expect(exec.status).toBe('completed');
      expect(onProgress).toHaveBeenNthCalledWith(2, 50, 'halfway');
    });
  });

  describe('getStats additional', () => {
    test('handles completed entry without duration', () => {
      ae.history.push({ status: 'completed' });
      const stats = ae.getStats();
      expect(stats.averageDuration).toBe(0);
    });
  });

  describe('_startCleanupTimer', () => {
    test('fires cleanup via setInterval', () => {
      jest.restoreAllMocks();
      jest.useFakeTimers();
      const cleanupSpy = jest.spyOn(ae, '_cleanupOldExecutions');
      ae._startCleanupTimer();
      jest.advanceTimersByTime(ae.cleanupInterval + 1);
      expect(cleanupSpy).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('default executor resolve', () => {
    test('_getDefaultExecutor setTimeout resolves', async () => {
      jest.useFakeTimers();
      const executor = ae._getDefaultExecutor();
      const promise = executor.execute('testSkill', {}, {});
      jest.advanceTimersByTime(6000);
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.data.skillName).toBe('testSkill');
      jest.useRealTimers();
    });
  });
});
