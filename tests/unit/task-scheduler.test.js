const { TaskScheduler } = require('../../src/agent/TaskScheduler');

function immediateTask(value) {
  return jest.fn().mockResolvedValue(value);
}

function delayedTask(value, ms) {
  return jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(value), ms)));
}

describe('TaskScheduler', () => {
  let scheduler;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    scheduler = new TaskScheduler({ maxConcurrent: 3, maxHistory: 10 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes with default options', () => {
      const s = new TaskScheduler();
      expect(s.nodeId).toMatch(/^node_/);
      expect(s.maxConcurrent).toBe(3);
      expect(s.activeTasks).toBeInstanceOf(Map);
      expect(s.scheduledTasks).toBeInstanceOf(Map);
      expect(s.taskQueue).toEqual([]);
      expect(s.completedTasks).toEqual([]);
      expect(s.dependencyGraph).toBeInstanceOf(Map);
      expect(s.maxHistory).toBe(100);
    });

    it('accepts custom options', () => {
      const onStart = jest.fn();
      const s = new TaskScheduler({ maxConcurrent: 5, maxHistory: 20, onTaskStart: onStart });
      expect(s.maxConcurrent).toBe(5);
      expect(s.maxHistory).toBe(20);
      expect(s.onTaskStart).toBe(onStart);
    });
  });

  describe('enqueue', () => {
    it('enqueues a task and returns queue item', async () => {
      const task = immediateTask('ok');
      const item = scheduler.enqueue(task);
      expect(item.id).toMatch(/^task_/);
      expect(item.status).toBe('running');
      expect(item.priority).toBe(0);
      expect(item.retries).toBe(0);
      expect(item.timeout).toBe(300000);
      expect(scheduler.taskQueue.length).toBe(0);
      expect(scheduler.activeTasks.size).toBe(1);
      await jest.runAllTimersAsync();
      expect(item.status).toBe('completed');
    });

    it('enqueues with priority and options', () => {
      const item = scheduler.enqueue(immediateTask('hi'), { priority: 10, timeout: 1000, retries: 3, metadata: { foo: 'bar' } });
      expect(item.priority).toBe(10);
      expect(item.timeout).toBe(1000);
      expect(item.retries).toBe(3);
      expect(item.metadata).toEqual({ foo: 'bar' });
    });

    it('sorts by priority descending', () => {
      const s = new TaskScheduler({ maxConcurrent: 1, maxHistory: 10 });
      s.enqueue(immediateTask('low'), { priority: 1 });
      s.enqueue(immediateTask('high'), { priority: 10 });
      expect(s.taskQueue.length).toBe(1);
      expect(s.taskQueue[0].priority).toBe(10);
    });

    it('sorts with equal priority using enqueuedAt', () => {
      const s = new TaskScheduler({ maxConcurrent: 1 });
      const task1 = delayedTask('a', 50000);
      const task2 = delayedTask('b', 50000);
      s.enqueue(task1, { priority: 5 });
      s.enqueue(task2, { priority: 5 });
      expect(s.taskQueue).toHaveLength(1);
      expect(s.taskQueue[0].priority).toBe(5);
    });

    it('sorts multiple queued items with different priorities', () => {
      const s = new TaskScheduler({ maxConcurrent: 1 });
      const t1 = delayedTask('a', 50000);
      const t2 = delayedTask('b', 50000);
      const t3 = delayedTask('c', 50000);
      s.enqueue(t1, { priority: 1 });
      s.enqueue(t2, { priority: 5 });
      s.enqueue(t3, { priority: 10 });
      expect(s.taskQueue).toHaveLength(2);
      expect(s.taskQueue[0].priority).toBe(10);
      expect(s.taskQueue[1].priority).toBe(5);
    });

    it('respects maxConcurrent', async () => {
      const s = new TaskScheduler({ maxConcurrent: 2, maxHistory: 10 });
      const task1 = delayedTask('a', 10000);
      const task2 = delayedTask('b', 10000);
      const task3 = delayedTask('c', 10000);
      s.enqueue(task1);
      s.enqueue(task2);
      s.enqueue(task3);
      expect(s.activeTasks.size).toBe(2);
      expect(s.taskQueue.length).toBe(1);
      await jest.runAllTimersAsync();
      expect(s.activeTasks.size).toBe(0);
    });

    it('executes task and transitions to completed', async () => {
      const task = immediateTask('done');
      const item = scheduler.enqueue(task);
      await jest.runAllTimersAsync();
      expect(item.status).toBe('completed');
      expect(item.result).toBe('done');
      expect(item.duration).toBeGreaterThanOrEqual(0);
    });

    it('handles task error and moves to failed', async () => {
      const err = new Error('fail');
      const task = jest.fn().mockRejectedValue(err);
      const item = scheduler.enqueue(task);
      await jest.runAllTimersAsync();
      expect(item.status).toBe('failed');
      expect(item.error).toBe('fail');
    });

    it('retries on failure up to retry count', async () => {
      const task = jest.fn()
        .mockRejectedValueOnce(new Error('try1'))
        .mockRejectedValueOnce(new Error('try2'))
        .mockResolvedValue('success');
      const item = scheduler.enqueue(task, { retries: 3 });
      await jest.runAllTimersAsync();
      expect(item.status).toBe('completed');
      expect(item.result).toBe('success');
      expect(task).toHaveBeenCalledTimes(3);
    });

    it('fails after exhausting retries', async () => {
      const task = jest.fn().mockRejectedValue(new Error('always fail'));
      const item = scheduler.enqueue(task, { retries: 2 });
      await jest.runAllTimersAsync();
      expect(item.status).toBe('failed');
      expect(item.retryCount).toBe(2);
    });

    it('retries without timeout avoids timeout cleanup', async () => {
      const task = jest.fn()
        .mockRejectedValueOnce(new Error('first'))
        .mockResolvedValue('ok');
      const item = scheduler.enqueue(task, { retries: 1, timeout: 0 });
      await jest.runAllTimersAsync();
      expect(item.status).toBe('completed');
      expect(item.result).toBe('ok');
    });

    it('respects timeout', async () => {
      const slowTask = delayedTask('slow', 50000);
      const item = scheduler.enqueue(slowTask, { timeout: 100 });
      await jest.advanceTimersByTimeAsync(200);
      expect(item.status).toBe('timeout');
    });

    it('completes before timeout when fast enough', async () => {
      const fastTask = immediateTask('fast');
      const item = scheduler.enqueue(fastTask, { timeout: 5000 });
      await jest.runAllTimersAsync();
      expect(item.status).toBe('completed');
      expect(item.result).toBe('fast');
    });

    it('calls onTaskStart and onTaskComplete callbacks', async () => {
      const onStart = jest.fn();
      const onComplete = jest.fn();
      const s = new TaskScheduler({ maxHistory: 10, onTaskStart: onStart, onTaskComplete: onComplete });
      s.enqueue(immediateTask('ok'));
      await jest.runAllTimersAsync();
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('handles task without timeout setting', async () => {
      const task = delayedTask('slow', 50);
      const item = scheduler.enqueue(task, { timeout: 0 });
      await jest.runAllTimersAsync();
      expect(item.status).toBe('completed');
      expect(item.result).toBe('slow');
    });

    it('calls onTaskError on failure', async () => {
      const onError = jest.fn();
      const s = new TaskScheduler({ maxHistory: 10, onTaskError: onError });
      s.enqueue(jest.fn().mockRejectedValue(new Error('boom')));
      await jest.runAllTimersAsync();
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('archives completed task', async () => {
      scheduler.enqueue(immediateTask('ok'));
      await jest.runAllTimersAsync();
      expect(scheduler.completedTasks.length).toBe(1);
      expect(scheduler.completedTasks[0].status).toBe('completed');
    });

    it('limits maxHistory', async () => {
      const s = new TaskScheduler({ maxHistory: 2 });
      for (let i = 0; i < 5; i++) {
        s.enqueue(immediateTask(i));
      }
      await jest.runAllTimersAsync();
      expect(s.completedTasks.length).toBeLessThanOrEqual(2);
    });

    it('processes tasks with dependencies', async () => {
      const taskA = immediateTask('A');
      const aItem = scheduler.enqueue(taskA);
      await jest.runAllTimersAsync();
      const taskB = immediateTask('B');
      const bItem = scheduler.enqueue(taskB, { dependsOn: [aItem.id] });
      await jest.runAllTimersAsync();
      expect(bItem.status).toBe('completed');
    });

    it('waits on unmet dependencies', async () => {
      const taskB = scheduler.enqueue(immediateTask('B'), { dependsOn: ['task_a'] });
      expect(taskB.status).toBe('waiting');
      expect(scheduler.getWaitingTasks()).toHaveLength(1);
    });

    it('handles single dependency as array', () => {
      const item = scheduler.enqueue(immediateTask('x'), { dependsOn: 'task_a' });
      expect(item.dependsOn).toEqual(['task_a']);
    });

    it('routes to distributed node if nodeAffinity set', () => {
      const s = new TaskScheduler({ maxHistory: 10 });
      s.registerNode('worker1');
      const item = s.enqueue(immediateTask('work'), { nodeAffinity: 'worker1' });
      const node = s._distributedNodes.get('worker1');
      expect(node.pendingTasks.length).toBe(1);
      expect(item.status).toBe('queued');
    });

    it('falls through if target node not available', async () => {
      const s = new TaskScheduler();
      const item = s.enqueue(immediateTask('work'), { nodeAffinity: 'nonexistent' });
      await jest.runAllTimersAsync();
      expect(item.status).toBe('completed');
    });
  });

  describe('schedule', () => {
    it('schedules a task with cron expression', () => {
      const sched = scheduler.schedule(immediateTask('scheduled'), '5 s');
      expect(sched.id).toMatch(/^sched_/);
      expect(sched.cron).toBe('5 s');
      expect(sched.enabled).toBe(true);
      expect(sched.runCount).toBe(0);
      expect(scheduler.getScheduledTasks()).toHaveLength(1);
    });

    it('starts scheduler timer automatically', () => {
      scheduler.schedule(immediateTask('t'), '1 s');
      expect(scheduler._schedulerTimer).toBeDefined();
    });

    it('does not start second timer', () => {
      scheduler.schedule(immediateTask('t1'), '1 s');
      const timer1 = scheduler._schedulerTimer;
      scheduler.schedule(immediateTask('t2'), '2 s');
      expect(scheduler._schedulerTimer).toBe(timer1);
    });

    it('stopScheduler handles no active timer', () => {
      scheduler._stopScheduler();
      expect(scheduler._schedulerTimer).toBeNull();
    });

    it('enqueues task when cron fires', async () => {
      const task = jest.fn().mockResolvedValue('fired');
      scheduler.schedule(task, '2 s');
      await jest.advanceTimersByTimeAsync(2500);
      expect(task).toHaveBeenCalled();
      expect(scheduler.getScheduledTasks()[0].runCount).toBe(1);
    });

    it('enqueues scheduled task multiple times', async () => {
      const task = jest.fn().mockResolvedValue('multi');
      scheduler.schedule(task, '1 s');
      await jest.advanceTimersByTimeAsync(5000);
      expect(task).toHaveBeenCalledTimes(5);
    });

    it('skips disabled scheduled tasks', async () => {
      const task = jest.fn().mockResolvedValue('skip');
      const sched = scheduler.schedule(task, '1 s');
      scheduler.cancelScheduled(sched.id);
      await jest.advanceTimersByTimeAsync(3000);
      expect(task).not.toHaveBeenCalled();
    });

    it('handles enqueue error gracefully', async () => {
      const errTask = immediateTask('err');
      jest.spyOn(scheduler, 'enqueue').mockImplementation(() => { throw new Error('enqueue fail'); });
      scheduler.schedule(errTask, '1 s');
      await jest.advanceTimersByTimeAsync(2000);
      expect(scheduler.enqueue).toHaveBeenCalled();
    });
  });

  describe('_calculateNextRun', () => {
    it('parses seconds', () => {
      const result = scheduler._calculateNextRun('30 s');
      expect(result).toBeGreaterThan(Date.now());
      expect(result).toBeLessThan(Date.now() + 31000);
    });

    it('parses minutes', () => {
      const result = scheduler._calculateNextRun('5 m');
      expect(result).toBeGreaterThan(Date.now());
      expect(result).toBeLessThan(Date.now() + 300001);
    });

    it('parses hours', () => {
      const result = scheduler._calculateNextRun('2 h');
      expect(result).toBeGreaterThan(Date.now());
      expect(result).toBeLessThan(Date.now() + 7200001);
    });

    it('parses days', () => {
      const result = scheduler._calculateNextRun('1 d');
      expect(result).toBeGreaterThan(Date.now());
      expect(result).toBeLessThan(Date.now() + 86400001);
    });

    it('defaults to 60s for unknown format', () => {
      const result = scheduler._calculateNextRun('bad format here');
      expect(result).toBeLessThanOrEqual(Date.now() + 60000);
    });

    it('supports sec/min/hour/day abbreviations', () => {
      const sec = scheduler._calculateNextRun('10 sec');
      const min = scheduler._calculateNextRun('1 min');
      const hour = scheduler._calculateNextRun('1 hour');
      const day = scheduler._calculateNextRun('1 day');
      expect(sec).toBeGreaterThan(Date.now());
      expect(min).toBeGreaterThan(Date.now());
      expect(hour).toBeGreaterThan(Date.now());
      expect(day).toBeGreaterThan(Date.now());
    });

    it('defaults to 60s for unknown unit', () => {
      const result = scheduler._calculateNextRun('5 x');
      expect(result).toBeLessThanOrEqual(Date.now() + 60000);
    });
  });

  describe('cancelScheduled / removeScheduled', () => {
    it('disables scheduled task', () => {
      const sched = scheduler.schedule(immediateTask('x'), '1 s');
      expect(scheduler.cancelScheduled(sched.id)).toBe(true);
      expect(sched.enabled).toBe(false);
    });

    it('returns false for non-existent scheduled task', () => {
      expect(scheduler.cancelScheduled('nope')).toBe(false);
    });

    it('removes scheduled task permanently', () => {
      const sched = scheduler.schedule(immediateTask('x'), '1 s');
      expect(scheduler.removeScheduled(sched.id)).toBe(true);
      expect(scheduler.getScheduledTasks()).toHaveLength(0);
    });

    it('returns false for removing non-existent', () => {
      expect(scheduler.removeScheduled('nope')).toBe(false);
    });
  });

  describe('query methods', () => {
    it('getActiveTasks returns active', async () => {
      const s = new TaskScheduler({ maxConcurrent: 1 });
      const slow = delayedTask('slow', 50000);
      s.enqueue(slow);
      await jest.advanceTimersByTimeAsync(0);
      expect(s.getActiveTasks()).toHaveLength(1);
    });

    it('getQueuedTasks returns queued items', async () => {
      const s = new TaskScheduler({ maxConcurrent: 1 });
      s.enqueue(delayedTask('a', 50000));
      s.enqueue(delayedTask('b', 50000));
      await jest.advanceTimersByTimeAsync(0);
      expect(s.getQueuedTasks()).toHaveLength(1);
    });

    it('getCompletedTasks returns recent completed', async () => {
      scheduler.enqueue(immediateTask('done'));
      await jest.runAllTimersAsync();
      expect(scheduler.getCompletedTasks()).toHaveLength(1);
    });

    it('getCompletedTasks respects limit', async () => {
      const s = new TaskScheduler({ maxHistory: 100 });
      for (let i = 0; i < 10; i++) {
        s.enqueue(immediateTask(i));
      }
      await jest.runAllTimersAsync();
      expect(s.getCompletedTasks(3)).toHaveLength(3);
    });
  });

  describe('cancelTask', () => {
    it('cancels active task', async () => {
      const s = new TaskScheduler({ maxConcurrent: 1 });
      s.enqueue(delayedTask('slow', 50000));
      await jest.advanceTimersByTimeAsync(0);
      const active = s.getActiveTasks();
      const cancelled = s.cancelTask(active[0].id);
      expect(cancelled).toBe(true);
      expect(active[0].status).toBe('cancelled');
    });

    it('removes queued task with maxConcurrent=0-like behavior', () => {
      const s = new TaskScheduler({ maxConcurrent: 1 });
      s.enqueue(delayedTask('a', 50000));
      const item = s.enqueue(immediateTask('b'));
      expect(s.cancelTask(item.id)).toBe(true);
      expect(s.getQueuedTasks()).toHaveLength(0);
    });

    it('removes active task', async () => {
      const s = new TaskScheduler({ maxConcurrent: 1 });
      s.enqueue(delayedTask('slow', 50000));
      await jest.advanceTimersByTimeAsync(0);
      const active = s.getActiveTasks();
      expect(s.cancelTask(active[0].id)).toBe(true);
      expect(active[0].status).toBe('cancelled');
    });

    it('returns false for non-existent task', () => {
      expect(scheduler.cancelTask('nope')).toBe(false);
    });
  });

  describe('getDependencyTree', () => {
    it('returns tree for task with no dependencies', () => {
      const tree = scheduler.getDependencyTree('task_a');
      expect(tree).toEqual({ id: 'task_a', children: [] });
    });

    it('returns tree with nested dependencies', () => {
      scheduler.dependencyGraph.set('task_a', ['task_b', 'task_c']);
      scheduler.dependencyGraph.set('task_b', ['task_d']);
      const tree = scheduler.getDependencyTree('task_a');
      expect(tree.id).toBe('task_a');
      expect(tree.children).toHaveLength(2);
      expect(tree.children[0].id).toBe('task_b');
      expect(tree.children[0].children).toHaveLength(1);
      expect(tree.children[0].children[0].id).toBe('task_d');
    });
  });

  describe('pause / resume', () => {
    it('stops scheduler timer on pause', () => {
      scheduler.schedule(immediateTask('x'), '1 s');
      scheduler.pause();
      expect(scheduler._schedulerTimer).toBeNull();
    });

    it('resumes scheduler timer and re-checks', () => {
      scheduler.schedule(immediateTask('x'), '1 s');
      scheduler.pause();
      scheduler.resume();
      expect(scheduler._schedulerTimer).toBeDefined();
    });

    it('resume does nothing if no scheduled tasks', () => {
      const s = new TaskScheduler();
      s.resume();
      expect(s._schedulerTimer).toBeNull();
    });
  });

  describe('getStats', () => {
    it('returns stats object', async () => {
      scheduler.enqueue(immediateTask('ok'));
      await jest.runAllTimersAsync();
      const stats = scheduler.getStats();
      expect(stats.nodeId).toBe(scheduler.nodeId);
      expect(stats.scheduled).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.queued).toBe(0);
      expect(stats.waiting).toBe(0);
      expect(stats.completed).toBe(1);
      expect(stats.successRate).toBe('100.00%');
      expect(stats.avgDuration).toMatch(/\d+ms/);
      expect(stats.distributedNodes).toBe(0);
      expect(stats.activeNodes).toBe(0);
    });

    it('returns 0% when no completed tasks', () => {
      const stats = scheduler.getStats();
      expect(stats.successRate).toBe('0%');
      expect(stats.avgDuration).toBe('0ms');
    });

    it('calculates partial success rate', async () => {
      const s = new TaskScheduler({ maxHistory: 20 });
      s.enqueue(immediateTask('ok'));
      s.enqueue(jest.fn().mockRejectedValue(new Error('fail')));
      await jest.runAllTimersAsync();
      const stats = s.getStats();
      expect(stats.completed).toBe(2);
      expect(stats.successRate).toBe('50.00%');
    });

    it('includes distributed node counts', () => {
      scheduler.registerNode('worker1');
      scheduler.registerNode('worker2');
      const stats = scheduler.getStats();
      expect(stats.distributedNodes).toBe(2);
      expect(stats.activeNodes).toBe(2);
    });

    it('includes queued and waiting counts in stats', async () => {
      const s = new TaskScheduler({ maxConcurrent: 1 });
      s.enqueue(delayedTask('a', 50000));
      s.enqueue(delayedTask('b', 50000));
      const stats = s.getStats();
      expect(stats.queued).toBe(1);
      expect(stats.waiting).toBe(0);
    });
  });

  describe('distributed nodes', () => {
    it('registers a node', () => {
      scheduler.registerNode('worker1', { region: 'us' });
      const nodes = scheduler.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe('worker1');
      expect(nodes[0].info.region).toBe('us');
      expect(nodes[0].available).toBe(true);
    });

    it('starts heartbeat check on first registration', () => {
      expect(scheduler._heartbeatInterval).toBeNull();
      scheduler.registerNode('worker1');
      expect(scheduler._heartbeatInterval).toBeDefined();
    });

    it('unregisters a node', () => {
      scheduler.registerNode('worker1');
      scheduler.unregisterNode('worker1');
      expect(scheduler.getNodes()).toHaveLength(0);
    });

    it('stops heartbeat check when no nodes remain', () => {
      scheduler.registerNode('worker1');
      scheduler.unregisterNode('worker1');
      expect(scheduler._heartbeatInterval).toBeNull();
    });

    it('does not stop heartbeat if other nodes remain', () => {
      scheduler.registerNode('worker1');
      scheduler.registerNode('worker2');
      scheduler.unregisterNode('worker1');
      expect(scheduler._heartbeatInterval).toBeDefined();
    });

    it('updates heartbeat', () => {
      scheduler.registerNode('worker1');
      scheduler.updateHeartbeat('worker1');
      const node = scheduler.getNodes()[0];
      expect(node.available).toBe(true);
    });

    it('does nothing on updateHeartbeat for unknown node', () => {
      scheduler.updateHeartbeat('undefined_node');
      expect(scheduler._distributedNodes.size).toBe(0);
    });

    it('marks node unavailable on heartbeat timeout', () => {
      scheduler.registerNode('worker1');
      jest.advanceTimersByTime(50000);
      const node = scheduler.getNodes()[0];
      expect(node.available).toBe(false);
    });

    it('re-queues pending tasks on node failure', () => {
      scheduler.registerNode('worker1');
      const node = scheduler._distributedNodes.get('worker1');
      node.pendingTasks.push({ id: 't1', status: 'waiting', nodeAffinity: 'worker1' });
      jest.advanceTimersByTime(50000);
      expect(node.available).toBe(false);
      expect(node.pendingTasks).toHaveLength(0);
      expect(scheduler.taskQueue).toHaveLength(1);
    });
  });

  describe('_runTask', () => {
    it('executes a function task', async () => {
      const result = await scheduler._runTask(() => 'sync');
      expect(result).toBe('sync');
    });

    it('executes an async function task', async () => {
      const result = await scheduler._runTask(async () => 'async');
      expect(result).toBe('async');
    });

    it('executes task with execute method', async () => {
      const taskObj = { execute: jest.fn().mockResolvedValue('exec') };
      const result = await scheduler._runTask(taskObj);
      expect(result).toBe('exec');
    });

    it('handles task with url property', async () => {
      const result = await scheduler._runTask({ url: 'http://example.com' });
      expect(result).toEqual({ success: true, url: 'http://example.com', message: 'Task executed' });
    });

    it('handles task with command property', async () => {
      const result = await scheduler._runTask({ command: 'echo hi' });
      expect(result).toEqual({ success: true, command: 'echo hi', message: 'Command executed' });
    });

    it('returns default for unrecognized task', async () => {
      const result = await scheduler._runTask({});
      expect(result).toEqual({ success: true, message: 'Task completed' });
    });

    it('handles function that returns non-promise', async () => {
      const result = await scheduler._runTask(() => 42);
      expect(result).toBe(42);
    });
  });

  describe('destroy', () => {
    it('clears all state and stops timers', () => {
      scheduler.schedule(immediateTask('x'), '1 s');
      scheduler.registerNode('worker1');
      scheduler.enqueue(immediateTask('y'));
      scheduler.destroy();
      expect(scheduler._schedulerTimer).toBeNull();
      expect(scheduler._heartbeatInterval).toBeNull();
      expect(scheduler.taskQueue).toEqual([]);
      expect(scheduler.activeTasks.size).toBe(0);
      expect(scheduler._distributedNodes.size).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles enqueue error gracefully in scheduled task check', () => {
      jest.spyOn(scheduler, 'enqueue').mockImplementation(() => { throw new Error('enqueue fail'); });
      scheduler.schedule(immediateTask('sched'), '1 s');
      jest.advanceTimersByTime(2000);
      expect(scheduler.enqueue).toHaveBeenCalled();
    });

    it('cancelling non-existent active task returns false', () => {
      expect(scheduler.cancelTask('nonexistent_task_id')).toBe(false);
    });

    it('handles empty completed tasks for stats', () => {
      const stats = scheduler.getStats();
      expect(stats.successRate).toBe('0%');
      expect(stats.avgDuration).toBe('0ms');
    });

    it('canExecute rejects non-queued or non-waiting item', () => {
      const item = { status: 'running' };
      expect(scheduler._canExecute(item)).toBe(false);
    });

    it('handles outer error in scheduled task check iteration', async () => {
      const badTaskId = 'bad_task';
      const throwScheduled = {};
      Object.defineProperty(throwScheduled, 'enabled', {
        get: () => { throw new Error('access error'); }
      });
      scheduler.scheduledTasks.set(badTaskId, throwScheduled);
      await scheduler._checkScheduledTasks();
    });

    it('processQueue handles re-entrant guard', async () => {
      const s = new TaskScheduler();
      s._isProcessing = true;
      await s._processQueue();
      expect(s._isProcessing).toBe(true);
    });

    it('destroy handles missing heartbeat interval', () => {
      scheduler._heartbeatInterval = null;
      scheduler.destroy();
      expect(scheduler._heartbeatInterval).toBeNull();
    });

    it('executeTask handles timeout before completion', async () => {
      const s = new TaskScheduler({ maxConcurrent: 1 });
      const task = delayedTask('too-slow', 50);
      const item = s.enqueue(task, { timeout: 10 });
      await jest.runAllTimersAsync();
      expect(item.status).toBe('timeout');
    });

    it('executeTask handles completed-before-timeout with clearTimeout', async () => {
      const s = new TaskScheduler({ maxConcurrent: 1 });
      const task = delayedTask('fast', 10);
      const item = s.enqueue(task, { timeout: 5000 });
      await jest.runAllTimersAsync();
      expect(item.status).toBe('completed');
    });

    it('executeTask skips timeout logic when timeout is 0', async () => {
      const s = new TaskScheduler({ maxConcurrent: 1 });
      const task = jest.fn().mockResolvedValue('no-timeout');
      const item = { id: 'test', task, timeout: 0, status: 'running', retryCount: 0, retries: 0, startedAt: Date.now() };
      s.activeTasks.set('test', item);
      await s._executeTask(item);
      expect(item.status).toBe('completed');
      expect(item.result).toBe('no-timeout');
    });

    it('executeTask catches error and retries without timeout', async () => {
      const task = jest.fn().mockRejectedValue(new Error('fail'));
      const item = scheduler.enqueue(task, { retries: 1, timeout: 0 });
      await jest.runAllTimersAsync();
      expect(item.status).toBe('failed');
      expect(item.retryCount).toBe(1);
    });

    it('executeTask handles already-timed-out in catch', async () => {
      const s = new TaskScheduler({ maxConcurrent: 1 });
      let rejectSlow;
      const slowPromise = new Promise((_, reject) => { rejectSlow = reject; });
      const task = jest.fn().mockReturnValue(slowPromise);
      const item = s.enqueue(task, { timeout: 50, retries: 1 });
      await jest.advanceTimersByTimeAsync(100);
      rejectSlow(new Error('too-late'));
      await jest.runAllTimersAsync();
      expect(item.status).toBe('timeout');
    });

    it('executeTask timeout fires when status is already completed', async () => {
      const s = new TaskScheduler({ maxConcurrent: 1 });
      const task = delayedTask('slow', 50000);
      const item = s.enqueue(task, { timeout: 50 });
      await jest.advanceTimersByTimeAsync(0);
      item.status = 'completed';
      await jest.advanceTimersByTimeAsync(100);
      expect(item.status).toBe('completed');
    });

    it('executeTask catch block runs with null timeoutId', async () => {
      const s = new TaskScheduler();
      const task = jest.fn().mockRejectedValue(new Error('fail'));
      const item = { id: 'catch_null', task, timeout: 0, status: 'running', retryCount: 0, retries: 0, startedAt: Date.now() };
      s.activeTasks.set(item.id, item);
      await s._executeTask(item);
      expect(item.status).toBe('failed');
    });
  });
});
