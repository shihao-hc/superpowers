'use strict';

const { TaskService } = require('../../src/agent/TaskService');

describe('TaskService', () => {
  let ts;

  beforeEach(() => {
    ts = new TaskService();
  });

  describe('constructor', () => {
    it('sets default maxConcurrent to 10', () => {
      expect(ts.maxConcurrent).toBe(10);
    });

    it('uses custom maxConcurrent', () => {
      const custom = new TaskService({ maxConcurrent: 3 });
      expect(custom.maxConcurrent).toBe(3);
    });

    it('initializes state machine', () => {
      expect(ts.stateMachine.pending).toEqual(['running', 'cancelled']);
      expect(ts.stateMachine.running).toEqual(['completed', 'failed', 'cancelled']);
      expect(ts.stateMachine.completed).toEqual([]);
      expect(ts.stateMachine.failed).toEqual(['running']);
      expect(ts.stateMachine.cancelled).toEqual([]);
    });
  });

  describe('createTask', () => {
    it('creates task with default properties', () => {
      const task = ts.createTask({ type: 'local_shell' });
      expect(task.id).toMatch(/^task_/);
      expect(task.status).toBe('pending');
      expect(task.type).toBe('local_shell');
      expect(task.isBackgrounded).toBe(false);
      expect(task.createdAt).toBeGreaterThan(0);
    });

    it('creates task with all valid types', () => {
      const types = ['local_shell', 'local_agent', 'remote_agent', 'in_process_teammate', 'local_workflow'];
      types.forEach((type) => {
        const task = ts.createTask({ type });
        expect(task.type).toBe(type);
      });
    });

    it('emits taskCreated event', () => {
      const listener = jest.fn();
      ts.on('taskCreated', listener);
      ts.createTask({ type: 'local_shell' });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ taskId: expect.any(String) }));
    });

    it('uses custom id when provided', () => {
      const task = ts.createTask({ id: 'my-custom-id', type: 'local_shell' });
      expect(task.id).toBe('my-custom-id');
    });

    it('throws for invalid task type', () => {
      expect(() => ts.createTask({ type: 'invalid_type' })).toThrow('Invalid task type');
    });

    it('accepts optional fields', () => {
      const task = ts.createTask({
        type: 'local_shell',
        name: 'test task',
        description: 'a description',
        command: 'npm test',
        cwd: '/tmp',
        isBackgrounded: true,
        metadata: { key: 'val' },
        onProgress: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn()
      });
      expect(task.name).toBe('test task');
      expect(task.description).toBe('a description');
      expect(task.command).toBe('npm test');
      expect(task.cwd).toBe('/tmp');
      expect(task.isBackgrounded).toBe(true);
      expect(task.metadata.key).toBe('val');
    });
  });

  describe('getTask / getAllTasks', () => {
    it('getTask returns task by id', () => {
      const task = ts.createTask({ type: 'local_shell' });
      expect(ts.getTask(task.id)).toBe(task);
    });

    it('getTask returns null for unknown id', () => {
      expect(ts.getTask('nonexistent')).toBeUndefined();
    });

    it('getAllTasks returns all tasks', () => {
      ts.createTask({ type: 'local_shell' });
      ts.createTask({ type: 'local_agent' });
      expect(ts.getAllTasks()).toHaveLength(2);
    });
  });

  describe('getTaskStatus', () => {
    it('returns formatted status for existing task', () => {
      const task = ts.createTask({ type: 'local_shell', name: 'test' });
      const status = ts.getTaskStatus(task.id);
      expect(status.id).toBe(task.id);
      expect(status.status).toBe('pending');
      expect(status.name).toBe('test');
      expect(status.duration).toBeNull();
    });

    it('returns null for unknown task', () => {
      expect(ts.getTaskStatus('unknown')).toBeNull();
    });
  });

  describe('updateTaskStatus', () => {
    it('performs valid state transition pending -> running', () => {
      const task = ts.createTask({ type: 'local_shell' });
      const updated = ts.updateTaskStatus(task.id, 'running');
      expect(updated.status).toBe('running');
      expect(updated.startTime).toBeGreaterThan(0);
    });

    it('performs valid state transition running -> completed', () => {
      const task = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(task.id, 'running');
      const updated = ts.updateTaskStatus(task.id, 'completed');
      expect(updated.status).toBe('completed');
      expect(updated.endTime).toBeGreaterThan(0);
    });

    it('performs valid state transition running -> failed', () => {
      const task = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(task.id, 'running');
      const updated = ts.updateTaskStatus(task.id, 'failed', { error: 'something broke' });
      expect(updated.status).toBe('failed');
      expect(updated.error).toBe('something broke');
    });

    it('performs valid state transition pending -> cancelled', () => {
      const task = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(task.id, 'cancelled');
      expect(task.status).toBe('cancelled');
    });

    it('performs valid state transition failed -> running (retry)', () => {
      const task = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(task.id, 'running');
      ts.updateTaskStatus(task.id, 'failed');
      ts.updateTaskStatus(task.id, 'running');
      expect(task.status).toBe('running');
    });

    it('throws for invalid state transition', () => {
      const task = ts.createTask({ type: 'local_shell' });
      expect(() => ts.updateTaskStatus(task.id, 'completed')).toThrow('Invalid status transition');
    });

    it('throws for unknown task', () => {
      expect(() => ts.updateTaskStatus('unknown', 'running')).toThrow('Task not found');
    });

    it('emits taskStatusChanged event', () => {
      const listener = jest.fn();
      ts.on('taskStatusChanged', listener);
      const task = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(task.id, 'running');
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        taskId: task.id,
        oldStatus: 'pending',
        newStatus: 'running'
      }));
    });

    it('sets exitCode when provided', () => {
      const task = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(task.id, 'running');
      ts.updateTaskStatus(task.id, 'completed', { exitCode: 0 });
      expect(task.exitCode).toBe(0);
    });

    it('sets pid when provided', () => {
      const task = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(task.id, 'running', { pid: 12345 });
      expect(task.pid).toBe(12345);
    });

    it('does not overwrite startTime if already set', () => {
      const task = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(task.id, 'running');
      const firstStart = task.startTime;
      ts.updateTaskStatus(task.id, 'failed');
      ts.updateTaskStatus(task.id, 'running');
      expect(task.startTime).toBeGreaterThanOrEqual(firstStart);
    });
  });

  describe('cancelTask', () => {
    it('cancels a pending task', () => {
      const task = ts.createTask({ type: 'local_shell' });
      ts.cancelTask(task.id);
      expect(task.status).toBe('cancelled');
    });

    it('cancels a running task', () => {
      const task = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(task.id, 'running');
      ts.cancelTask(task.id);
      expect(task.status).toBe('cancelled');
    });

    it('throws for completed task', () => {
      const task = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(task.id, 'running');
      ts.updateTaskStatus(task.id, 'completed');
      expect(() => ts.cancelTask(task.id)).toThrow('Cannot cancel');
    });

    it('throws for unknown task', () => {
      expect(() => ts.cancelTask('unknown')).toThrow('Task not found');
    });

    it('emits taskCancelled event', () => {
      const listener = jest.fn();
      ts.on('taskCancelled', listener);
      const task = ts.createTask({ type: 'local_shell' });
      ts.cancelTask(task.id);
      expect(listener).toHaveBeenCalledWith({ taskId: task.id });
    });
  });

  describe('retryTask', () => {
    it('retries a failed task', async () => {
      const task = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(task.id, 'running');
      ts.updateTaskStatus(task.id, 'failed');
      const executor = jest.fn().mockResolvedValue('retry success');
      const result = await ts.retryTask(task.id, executor);
      expect(result).toBe('retry success');
      expect(task.status).toBe('completed');
    });

    it('throws for non-failed task', async () => {
      const task = ts.createTask({ type: 'local_shell' });
      await expect(ts.retryTask(task.id, jest.fn())).rejects.toThrow('Cannot retry');
    });

    it('emits taskRetried event', async () => {
      const listener = jest.fn();
      ts.on('taskRetried', listener);
      const task = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(task.id, 'running');
      ts.updateTaskStatus(task.id, 'failed');
      await ts.retryTask(task.id, jest.fn().mockResolvedValue('ok'));
      expect(listener).toHaveBeenCalledWith({ taskId: task.id });
    });
  });

  describe('startTask', () => {
    it('executes task and returns result', async () => {
      const task = ts.createTask({ type: 'local_shell' });
      const executor = jest.fn().mockResolvedValue('done');
      const result = await ts.startTask(task.id, executor);
      expect(result).toBe('done');
      expect(task.status).toBe('completed');
    });

    it('handles executor without return value', async () => {
      const task = ts.createTask({ type: 'local_shell' });
      const executor = jest.fn().mockResolvedValue(undefined);
      await ts.startTask(task.id, executor);
      expect(task.status).toBe('completed');
    });

    it('handles executor throw', async () => {
      const task = ts.createTask({ type: 'local_shell' });
      const executor = jest.fn().mockRejectedValue(new Error('exec failed'));
      await expect(ts.startTask(task.id, executor)).rejects.toThrow('exec failed');
      expect(task.status).toBe('failed');
      expect(task.error).toBe('exec failed');
    });

    it('throws for unknown task', async () => {
      await expect(ts.startTask('unknown', jest.fn())).rejects.toThrow('Task not found');
    });

    it('throws for non-pending task', async () => {
      const task = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(task.id, 'running');
      await expect(ts.startTask(task.id, jest.fn())).rejects.toThrow('Cannot start task');
    });

    it('calls onComplete callback on success', async () => {
      const onComplete = jest.fn();
      const task = ts.createTask({ type: 'local_shell', onComplete });
      const executor = jest.fn().mockResolvedValue('result');
      await ts.startTask(task.id, executor);
      expect(onComplete).toHaveBeenCalledWith('result');
    });

    it('calls onError callback on failure', async () => {
      const onError = jest.fn();
      const task = ts.createTask({ type: 'local_shell', onError });
      const executor = jest.fn().mockRejectedValue(new Error('fail'));
      await expect(ts.startTask(task.id, executor)).rejects.toThrow('fail');
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('removeTask', () => {
    it('removes existing non-running task', () => {
      const task = ts.createTask({ type: 'local_shell' });
      expect(ts.removeTask(task.id)).toBe(true);
      expect(ts.getTask(task.id)).toBeUndefined();
    });

    it('throws for running task', () => {
      const task = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(task.id, 'running');
      expect(() => ts.removeTask(task.id)).toThrow('Cannot remove running task');
    });

    it('returns false for unknown task', () => {
      expect(ts.removeTask('unknown')).toBe(false);
    });

    it('emits taskRemoved event', () => {
      const listener = jest.fn();
      ts.on('taskRemoved', listener);
      const task = ts.createTask({ type: 'local_shell' });
      ts.removeTask(task.id);
      expect(listener).toHaveBeenCalledWith({ taskId: task.id });
    });
  });

  describe('cleanup', () => {
    it('removes completed tasks by default', () => {
      const t1 = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(t1.id, 'running');
      ts.updateTaskStatus(t1.id, 'completed');
      const t2 = ts.createTask({ type: 'local_shell' });
      expect(ts.cleanup()).toBe(1);
      expect(ts.getTask(t1.id)).toBeUndefined();
      expect(ts.getTask(t2.id)).toBeDefined();
    });

    it('respects filter flags', () => {
      const t1 = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(t1.id, 'running');
      ts.updateTaskStatus(t1.id, 'completed');
      const t2 = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(t2.id, 'running');
      ts.updateTaskStatus(t2.id, 'failed');

      expect(ts.cleanup(true, false, true)).toBe(1);
      expect(ts.getTask(t1.id)).toBeUndefined();
      expect(ts.getTask(t2.id)).toBeDefined();
    });

    it('emits cleanup event', () => {
      const listener = jest.fn();
      ts.on('cleanup', listener);
      const task = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(task.id, 'running');
      ts.updateTaskStatus(task.id, 'completed');
      ts.cleanup();
      expect(listener).toHaveBeenCalledWith({ removed: 1 });
    });
  });

  describe('getBackgroundTasks / isBackgroundTask', () => {
    it('returns backgrounded tasks with active status', () => {
      const bg = ts.createTask({ type: 'local_shell', isBackgrounded: true });
      ts.updateTaskStatus(bg.id, 'running');
      const tasks = ts.getBackgroundTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(bg.id);
    });

    it('excludes non-backgrounded tasks', () => {
      ts.createTask({ type: 'local_shell', isBackgrounded: false });
      expect(ts.getBackgroundTasks()).toHaveLength(0);
    });

    it('isBackgroundTask returns true for backgrounded running task', () => {
      const task = ts.createTask({ type: 'local_shell', isBackgrounded: true });
      ts.updateTaskStatus(task.id, 'running');
      expect(ts.isBackgroundTask(task.id)).toBe(true);
    });

    it('isBackgroundTask returns false for unknown task', () => {
      expect(ts.isBackgroundTask('unknown')).toBe(false);
    });

    it('isBackgroundTask returns false for completed tasks', () => {
      const task = ts.createTask({ type: 'local_shell', isBackgrounded: true });
      ts.updateTaskStatus(task.id, 'running');
      ts.updateTaskStatus(task.id, 'completed');
      expect(ts.isBackgroundTask(task.id)).toBe(false);
    });
  });

  describe('getRunningTasks', () => {
    it('returns only running tasks', () => {
      const t1 = ts.createTask({ type: 'local_shell' });
      ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(t1.id, 'running');
      const running = ts.getRunningTasks();
      expect(running).toHaveLength(1);
      expect(running[0].id).toBe(t1.id);
    });
  });

  describe('getStats', () => {
    it('returns correct stats', () => {
      const t1 = ts.createTask({ type: 'local_shell' });
      ts.createTask({ type: 'local_agent' });
      ts.updateTaskStatus(t1.id, 'running');

      const stats = ts.getStats();
      expect(stats.total).toBe(2);
      expect(stats.byStatus.pending).toBe(1);
      expect(stats.byStatus.running).toBe(1);
      expect(stats.running).toBe(1);
      expect(stats.concurrent).toBe(1);
    });
  });

  describe('startTask concurrency', () => {
    it('waits for slot when maxConcurrent is reached', async () => {
      const ts2 = new TaskService({ maxConcurrent: 1 });
      const t1 = ts2.createTask({ type: 'local_shell' });
      const t2 = ts2.createTask({ type: 'local_shell' });

      let resolveFirst;
      const firstPromise = new Promise((r) => { resolveFirst = r; });
      const executor1 = jest.fn().mockReturnValue(firstPromise);
      const executor2 = jest.fn().mockResolvedValue('second');

      const start1 = ts2.startTask(t1.id, executor1);
      await new Promise(r => setTimeout(r, 10));

      const start2 = ts2.startTask(t2.id, executor2);

      resolveFirst('first');
      await expect(start1).resolves.toBe('first');
      await expect(start2).resolves.toBe('second');
    }, 10000);
  });

  describe('cancelTask with pid', () => {
    it('handles process kill error gracefully', () => {
      jest.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('mock kill error');
      });
      try {
        const task = ts.createTask({ type: 'local_shell' });
        ts.updateTaskStatus(task.id, 'running', { pid: 12345 });
        expect(() => ts.cancelTask(task.id)).not.toThrow();
        expect(task.status).toBe('cancelled');
      } finally {
        jest.restoreAllMocks();
      }
    });
  });

  describe('retryTask unknown', () => {
    it('throws for unknown task', async () => {
      await expect(ts.retryTask('unknown', jest.fn())).rejects.toThrow('Task not found');
    });
  });

  describe('createTask defaults', () => {
    it('defaults type to local_shell when not provided', () => {
      const task = ts.createTask({});
      expect(task.type).toBe('local_shell');
    });
  });

  describe('getTaskStatus running', () => {
    it('returns duration for running task (startTime set, no endTime)', () => {
      const task = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(task.id, 'running');
      const status = ts.getTaskStatus(task.id);
      expect(status.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cleanup all statuses', () => {
    it('removes failed and cancelled tasks with default cleanup', () => {
      const comp = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(comp.id, 'running');
      ts.updateTaskStatus(comp.id, 'completed');

      const failed = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(failed.id, 'running');
      ts.updateTaskStatus(failed.id, 'failed');

      const canc = ts.createTask({ type: 'local_shell' });
      ts.updateTaskStatus(canc.id, 'cancelled');

      expect(ts.cleanup()).toBe(3);
      expect(ts.getTask(comp.id)).toBeUndefined();
      expect(ts.getTask(failed.id)).toBeUndefined();
      expect(ts.getTask(canc.id)).toBeUndefined();
    });
  });

  describe('canTransition invalid status', () => {
    it('returns false for unknown currentStatus', () => {
      expect(ts._canTransition('invalid_status', 'running')).toBe(false);
    });
  });
});
