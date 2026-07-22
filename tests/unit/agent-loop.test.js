jest.mock('../../src/core/BrainFlow', () => {
  const mockFn = jest.fn().mockImplementation(() => ({
    onTaskStart: jest.fn(),
    onTaskEnd: jest.fn()
  }));
  return mockFn;
}, { virtual: true });

const { AgentLoop, BackgroundTask, BackgroundTaskManager, TaskStatus } = require('../../src/agent/AgentLoop');

function createMockBrowser() {
  return {
    goto: jest.fn(),
    url: jest.fn().mockResolvedValue('http://test.com'),
    title: jest.fn().mockResolvedValue('Test Page'),
    click: jest.fn(),
    type: jest.fn(),
    extract: jest.fn().mockResolvedValue({ title: 'extracted' }),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('img')),
    scroll: jest.fn(),
    back: jest.fn()
  };
}

function createMockLLM() {
  return {
    generate: jest.fn().mockResolvedValue(JSON.stringify({
      analysis: 'test analysis',
      plan: ['complete'],
      reasoning: 'test reasoning',
      nextAction: { type: 'complete', params: { result: 'done' } }
    }))
  };
}

function createMockMCPBridge() {
  return {
    call: jest.fn().mockResolvedValue({ data: 'mcp result' }),
    batchCall: jest.fn().mockResolvedValue([{ success: true }])
  };
}

function createMockMCPRegistry() {
  return {
    refresh: jest.fn().mockResolvedValue(),
    formatForLLM: jest.fn().mockReturnValue([])
  };
}

function createMockSkillDiscovery() {
  return {
    getSkillsForLLM: jest.fn().mockReturnValue({ tools: [] }),
    analyzeInput: jest.fn().mockReturnValue({
      hasMatch: true, confidence: 0.8, matchedSkills: ['test']
    })
  };
}

function createMockSkillManager() {
  return {
    executeSkill: jest.fn().mockResolvedValue({ output: 'skill result' })
  };
}

describe('TaskStatus', () => {
  it('defines all statuses', () => {
    expect(TaskStatus.PENDING).toBe('pending');
    expect(TaskStatus.RUNNING).toBe('running');
    expect(TaskStatus.COMPLETED).toBe('completed');
    expect(TaskStatus.FAILED).toBe('failed');
    expect(TaskStatus.CANCELLED).toBe('cancelled');
  });
});

describe('BackgroundTask', () => {
  describe('constructor', () => {
    it('creates with defaults', () => {
      const task = new BackgroundTask();
      expect(task.id).toBeTruthy();
      expect(task.name).toBe('unnamed');
      expect(task.type).toBe('generic');
      expect(task.status).toBe(TaskStatus.PENDING);
      expect(task.priority).toBe(0);
      expect(task.abortController).toBeInstanceOf(AbortController);
    });

    it('creates with custom options', () => {
      const task = new BackgroundTask({
        name: 'test-task', type: 'analysis', priority: 5,
        metadata: { key: 'val' }, id: 'custom-id'
      });
      expect(task.id).toBe('custom-id');
      expect(task.name).toBe('test-task');
      expect(task.type).toBe('analysis');
      expect(task.priority).toBe(5);
      expect(task.metadata.key).toBe('val');
    });
  });

  describe('lifecycle', () => {
    it('transitions through start/complete', () => {
      const task = new BackgroundTask();
      task.start();
      expect(task.status).toBe(TaskStatus.RUNNING);
      expect(task.startTime).toBeGreaterThan(0);

      task.complete('result');
      expect(task.status).toBe(TaskStatus.COMPLETED);
      expect(task.result).toBe('result');
      expect(task.endTime).toBeGreaterThanOrEqual(task.startTime);
    });

    it('transitions through start/fail', () => {
      const task = new BackgroundTask();
      task.start();
      task.fail(new Error('boom'));
      expect(task.status).toBe(TaskStatus.FAILED);
      expect(task.error).toBe('boom');
    });

    it('fail stores string error message', () => {
      const task = new BackgroundTask();
      task.start();
      task.fail('something went wrong');
      expect(task.error).toBe('something went wrong');
    });

    it('cancel from pending works', () => {
      const task = new BackgroundTask();
      task.cancel();
      expect(task.status).toBe(TaskStatus.CANCELLED);
    });

    it('cancel from running works', () => {
      const task = new BackgroundTask();
      task.start();
      task.cancel();
      expect(task.status).toBe(TaskStatus.CANCELLED);
    });

    it('cancel from completed is no-op', () => {
      const task = new BackgroundTask();
      task.start();
      task.complete('ok');
      task.cancel();
      expect(task.status).toBe(TaskStatus.COMPLETED);
    });
  });

  describe('events', () => {
    it('_emit fires registered callbacks', () => {
      const task = new BackgroundTask();
      const cb = jest.fn();
      task.on('start', cb);
      task.start();
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ task }));
    });

    it('off removes a listener', () => {
      const task = new BackgroundTask();
      const cb = jest.fn();
      task.on('start', cb);
      task.off('start', cb);
      task.start();
      expect(cb).not.toHaveBeenCalled();
    });

    it('removeAllListeners clears all', () => {
      const task = new BackgroundTask();
      const cb = jest.fn();
      task.on('complete', cb);
      task.removeAllListeners('complete');
      task.complete('x');
      expect(cb).not.toHaveBeenCalled();
    });

    it('removeAllListeners without arg clears all events', () => {
      const task = new BackgroundTask();
      task.on('complete', jest.fn());
      task.removeAllListeners();
      expect(task.listeners.size).toBe(0);
    });

    it('_emit swallows callback errors', () => {
      const task = new BackgroundTask();
      task.on('start', () => { throw new Error('cb error'); });
      expect(() => task.start()).not.toThrow();
    });
  });

  describe('getDuration', () => {
    it('returns 0 before start', () => {
      expect(new BackgroundTask().getDuration()).toBe(0);
    });

    it('returns positive duration after completion', () => {
      const task = new BackgroundTask();
      task.start();
      task.complete('ok');
      expect(task.getDuration()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('toJSON', () => {
    it('returns serializable object', () => {
      const task = new BackgroundTask({ name: 'snapshot' });
      task.start();
      task.complete('data');
      const json = task.toJSON();
      expect(json.name).toBe('snapshot');
      expect(json.status).toBe('completed');
      expect(json.result).toBe('data');
      expect(json.duration).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('BackgroundTaskManager', () => {
  let mgr;

  beforeEach(() => {
    mgr = new BackgroundTaskManager({ maxConcurrent: 3, defaultTimeout: 500 });
  });

  describe('constructor', () => {
    it('sets defaults', () => {
      const m = new BackgroundTaskManager();
      expect(m.maxConcurrent).toBe(5);
      expect(m.defaultTimeout).toBe(60000);
    });

    it('accepts custom options', () => {
      expect(mgr.maxConcurrent).toBe(3);
      expect(mgr.defaultTimeout).toBe(500);
    });
  });

  describe('create', () => {
    it('creates and stores a task', () => {
      const task = mgr.create({ name: 't1', type: 'data', priority: 2 });
      expect(mgr.tasks.has(task.id)).toBe(true);
      expect(task.name).toBe('t1');
      expect(task.priority).toBe(2);
    });

    it('emits taskCreated event', () => {
      const spy = jest.fn();
      mgr.on('taskCreated', spy);
      mgr.create({ name: 't1' });
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('runs a task fn and completes', async () => {
      const task = mgr.create({ name: 't1' });
      const result = await mgr.start(task.id, async () => 'done');
      expect(result).toBe('done');
      expect(task.status).toBe(TaskStatus.COMPLETED);
    });

    it('rejects if task not found', async () => {
      await expect(mgr.start('no-such', async () => {})).rejects.toThrow('not found');
    });

    it('handles task failure', async () => {
      const task = mgr.create({ name: 't1' });
      await expect(mgr.start(task.id, async () => { throw new Error('fail'); })).rejects.toThrow('fail');
      expect(task.status).toBe(TaskStatus.FAILED);
    });

    it('handles timeout', async () => {
      const task = mgr.create({ name: 'slow' });
      await expect(mgr.start(task.id, async () => {
        await new Promise(r => setTimeout(r, 2000));
      })).rejects.toThrow('Task timeout');
      expect(task.status).toBe(TaskStatus.FAILED);
    }, 10000);
  });

  describe('cancel', () => {
    it('cancels an existing task', () => {
      const task = mgr.create({ name: 't1' });
      const result = mgr.cancel(task.id);
      expect(result).toBe(true);
      expect(task.status).toBe(TaskStatus.CANCELLED);
    });

    it('returns false for non-existent', () => {
      expect(mgr.cancel('no-such')).toBe(false);
    });
  });

  describe('get / getAll / getRunning', () => {
    it('get returns task by id', () => {
      const task = mgr.create({ name: 't1' });
      expect(mgr.get(task.id)).toBe(task);
    });

    it('get returns undefined for missing', () => {
      expect(mgr.get('no-such')).toBeUndefined();
    });

    it('getAll returns all tasks', () => {
      mgr.create({ name: 't1' });
      mgr.create({ name: 't2' });
      expect(mgr.getAll()).toHaveLength(2);
    });

    it('getRunning filters running tasks', async () => {
      const task = mgr.create({ name: 't1' });
      mgr.start(task.id, () => new Promise(() => {}));
      await new Promise(r => setTimeout(r, 10));
      expect(mgr.getRunning()).toHaveLength(1);
      mgr.cancel(task.id);
    });
  });

  describe('hasRunning / waitForAll', () => {
    it('hasRunning returns false when idle', () => {
      expect(mgr.hasRunning()).toBe(false);
    });

    it('waitForAll resolves when no running tasks', async () => {
      await expect(mgr.waitForAll()).resolves.toBeUndefined();
    });

    it('waitForAll rejects on timeout', async () => {
      const task = mgr.create({ name: 't1' });
      mgr.start(task.id, () => new Promise(() => {}));
      await expect(mgr.waitForAll(100)).rejects.toThrow('Wait timeout');
      mgr.cancel(task.id);
    }, 10000);
  });

  describe('cleanup', () => {
    it('removes completed tasks', async () => {
      const task = mgr.create({ name: 't1' });
      await mgr.start(task.id, async () => 'done');
      expect(mgr.getAll()).toHaveLength(1);
      mgr.cleanup();
      expect(mgr.getAll()).toHaveLength(0);
    });

    it('removes all when completedOnly is false', () => {
      mgr.create({ name: 't1' });
      mgr.cleanup(false);
      expect(mgr.getAll()).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('returns zeroes when empty', () => {
      const stats = mgr.getStats();
      expect(stats.total).toBe(0);
    });

    it('counts by status', async () => {
      mgr.create({ name: 't1' });
      const task = mgr.create({ name: 't2' });
      await mgr.start(task.id, async () => 'done');
      const stats = mgr.getStats();
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(1);
      expect(stats.completed).toBe(1);
    });
  });
});

describe('BackgroundTaskManager - getQueuePosition with pending tasks', () => {
  it('returns position with pending tasks sorted by priority', () => {
    const mgr = new BackgroundTaskManager();
    const t1 = mgr.create({ name: 'high', priority: 5 });
    const t2 = mgr.create({ name: 'low', priority: 1 });
    expect(mgr.getQueuePosition(t1)).toBe(1);
    expect(mgr.getQueuePosition(t2)).toBe(2);
  });
});

describe('BackgroundTaskManager - cleanup with various statuses', () => {
  it('removes failed task with completedOnly=true', async () => {
    const mgr = new BackgroundTaskManager({ defaultTimeout: 200 });
    const t = mgr.create({ name: 't' });
    await expect(mgr.start(t.id, async () => { throw new Error('fail'); })).rejects.toThrow('fail');
    expect(mgr.getAll()).toHaveLength(1);
    mgr.cleanup();
    expect(mgr.getAll()).toHaveLength(0);
  });

  it('removes cancelled task with completedOnly=true', () => {
    const mgr = new BackgroundTaskManager();
    const t = mgr.create({ name: 't' });
    t.start();
    mgr.cancel(t.id);
    mgr.cleanup();
    expect(mgr.getAll()).toHaveLength(0);
  });

  it('keeps pending task with completedOnly=true', () => {
    const mgr = new BackgroundTaskManager();
    mgr.create({ name: 't' });
    mgr.cleanup();
    expect(mgr.getAll()).toHaveLength(1);
  });
});

describe('BackgroundTaskManager - queue when full', () => {
  it('emits taskQueued when at maxConcurrent', async () => {
    const mgr = new BackgroundTaskManager({ maxConcurrent: 1, defaultTimeout: 500 });
    const spy = jest.fn();
    mgr.on('taskQueued', spy);
    const t1 = mgr.create({ name: 't1', priority: 2 });
    const t2 = mgr.create({ name: 't2', priority: 1 });
    mgr.start(t1.id, () => new Promise(() => {}));
    await new Promise(r => setTimeout(r, 10));
    await mgr.start(t2.id, async () => 'done');
    expect(spy).toHaveBeenCalled();
    expect(mgr.getQueuePosition(t2)).toBe(0);
    mgr.cancel(t1.id);
  });
});

describe('BackgroundTask - getDuration mid-flight', () => {
  it('returns positive duration while running', () => {
    const task = new BackgroundTask();
    task.start();
    const dur = task.getDuration();
    expect(dur).toBeGreaterThanOrEqual(0);
  });
});

describe('BackgroundTaskManager - cancelAll', () => {
  it('cancels all tasks', () => {
    const mgr = new BackgroundTaskManager();
    const t1 = mgr.create({ name: 't1' });
    const t2 = mgr.create({ name: 't2' });
    t1.start();
    mgr.cancelAll();
    expect(t1.status).toBe(TaskStatus.CANCELLED);
    expect(t2.status).toBe(TaskStatus.CANCELLED);
  });
});

describe('BackgroundTask - _emit with logger error', () => {
  it('logs callback error when logger set', () => {
    const task = new BackgroundTask();
    const errorFn = jest.fn();
    task.logger = { error: errorFn };
    task.on('start', () => { throw new Error('cb_err'); });
    expect(() => task.start()).not.toThrow();
    expect(errorFn).toHaveBeenCalled();
  });
});

describe('AgentLoop', () => {
  let loop;

  beforeEach(() => {
    loop = new AgentLoop({
      maxIterations: 5,
      timeout: 5000,
      onStep: jest.fn(),
      onError: jest.fn()
    });
  });

  afterEach(() => {
    loop.backgroundTasks.cancelAll();
    loop.backgroundTasks.cleanup(false);
    loop.removeAllListeners();
  });

  describe('constructor', () => {
    it('sets default values', () => {
      const l = new AgentLoop();
      expect(l.maxIterations).toBe(10);
      expect(l.timeout).toBe(60000);
      expect(l.onStep).toBeInstanceOf(Function);
      expect(l.onError).toBeInstanceOf(Function);
      expect(l.isRunning).toBe(false);
      expect(l.actions.size).toBeGreaterThan(0);
      expect(l.backgroundTasks).toBeInstanceOf(BackgroundTaskManager);
    });

    it('accepts custom options', () => {
      expect(loop.maxIterations).toBe(5);
      expect(loop.timeout).toBe(5000);
    });

    it('accepts injected services', () => {
      const browser = createMockBrowser();
      const llm = createMockLLM();
      const l = new AgentLoop({ browser, llmAdapter: llm });
      expect(l.browser).toBe(browser);
      expect(l.llmAdapter).toBe(llm);
    });

    it('initializes with v2 options', () => {
      const l = new AgentLoop({
        maxConcurrentTasks: 10,
        taskTimeout: 300000,
        commandBatchWindow: 200
      });
      expect(l.backgroundTasks.maxConcurrent).toBe(10);
      expect(l.backgroundTasks.defaultTimeout).toBe(300000);
      expect(l._commandBatchWindow).toBe(200);
    });
  });

  describe('registerAction', () => {
    it('registers a custom action', () => {
      const handler = jest.fn();
      loop.registerAction('custom', handler);
      expect(loop.actions.get('custom')).toBe(handler);
    });
  });

  describe('background task methods', () => {
    it('createBackgroundTask creates and returns task', () => {
      const task = loop.createBackgroundTask('bg1', 'data', 3);
      expect(task.name).toBe('bg1');
      expect(task.type).toBe('data');
      expect(task.priority).toBe(3);
    });

    it('getBackgroundTask returns task by id', () => {
      const task = loop.createBackgroundTask('bg1');
      expect(loop.getBackgroundTask(task.id)).toBe(task);
    });

    it('getBackgroundTasks returns all', () => {
      loop.createBackgroundTask('bg1');
      loop.createBackgroundTask('bg2');
      expect(loop.getBackgroundTasks()).toHaveLength(2);
    });

    it('cancelBackgroundTask cancels task', () => {
      const task = loop.createBackgroundTask('bg1');
      const result = loop.cancelBackgroundTask(task.id);
      expect(result).toBe(true);
      expect(task.status).toBe(TaskStatus.CANCELLED);
    });

    it('hasRunningBackgroundTasks returns correct state', () => {
      expect(loop.hasRunningBackgroundTasks()).toBe(false);
    });
  });

  describe('waitForBackgroundTasks', () => {
    it('waits for real background task completion', async () => {
      const task = loop.createBackgroundTask('bg-real');
      loop.backgroundTasks.start(task.id, async () => {
        await new Promise(r => setTimeout(r, 30));
        return 'done';
      });
      await loop.waitForBackgroundTasks(2000);
      expect(task.status).toBe(TaskStatus.COMPLETED);
    });
  });

  describe('getBrainFlow', () => {
    it('returns brainFlow instance', () => {
      const bf = loop.getBrainFlow();
      expect(bf).toBeDefined();
      expect(typeof bf.onTaskStart).toBe('function');
    });
  });

  describe('result holdback', () => {
    it('holdResult stores and emits event', () => {
      const spy = jest.fn();
      loop.on('resultHeld', spy);
      loop.holdResult({ key: 'val' });
      expect(loop.getHeldResult()).toEqual({ key: 'val' });
      expect(spy).toHaveBeenCalled();
    });

    it('hasHeldResult returns correct state', () => {
      expect(loop.hasHeldResult()).toBe(false);
      loop.holdResult('x');
      expect(loop.hasHeldResult()).toBe(true);
    });

    it('releaseHeldResult returns and clears', () => {
      loop.holdResult('data');
      const released = loop.releaseHeldResult();
      expect(released).toBe('data');
      expect(loop.hasHeldResult()).toBe(false);
    });

    it('releaseHeldResult emits event', () => {
      const spy = jest.fn();
      loop.on('resultReleased', spy);
      loop.holdResult('x');
      loop.releaseHeldResult();
      expect(spy).toHaveBeenCalled();
    });

    it('releaseHeldResult returns null when nothing held', () => {
      expect(loop.releaseHeldResult()).toBeNull();
    });
  });

  describe('command batching', () => {
    it('enqueueCommand adds to queue', () => {
      const added = loop.enqueueCommand({ type: 'click', value: 'sel', isMeta: false });
      expect(added).toBe(true);
      expect(loop.getCommands()).toHaveLength(1);
    });

    it('enqueueCommand batches consecutive same-type commands', () => {
      loop._commandBatchWindow = 10000;
      loop.enqueueCommand({ type: 'type', value: 'a', isMeta: false });
      const added = loop.enqueueCommand({ type: 'type', value: 'b', isMeta: false });
      expect(added).toBe(false);
      expect(loop.getCommands()).toHaveLength(1);
      expect(loop.getCommands()[0].count).toBe(2);
    });

    it('enqueueCommand merges array values', () => {
      loop._commandBatchWindow = 10000;
      loop.enqueueCommand({ type: 'extract', value: ['a'], isMeta: false });
      const added = loop.enqueueCommand({ type: 'extract', value: ['b'], isMeta: false });
      expect(added).toBe(false);
      expect(loop.getCommands()[0].value).toEqual(['a', 'b']);
    });

    it('enqueueCommand does not batch different types', () => {
      loop.enqueueCommand({ type: 'click', value: 'sel', isMeta: false });
      const added = loop.enqueueCommand({ type: 'type', value: 'text', isMeta: false });
      expect(added).toBe(true);
      expect(loop.getCommands()).toHaveLength(2);
    });

    it('_canBatchCommands returns false for null inputs', () => {
      expect(loop._canBatchCommands(null, {})).toBe(false);
      expect(loop._canBatchCommands({}, null)).toBe(false);
    });

    it('clearCommands empties and returns queue', () => {
      loop.enqueueCommand({ type: 'click', value: 'sel', isMeta: false });
      const cleared = loop.clearCommands();
      expect(cleared).toHaveLength(1);
      expect(loop.getCommands()).toHaveLength(0);
    });
  });

  describe('default actions', () => {
    it('navigate: works without browser', async () => {
      const result = await loop.actions.get('navigate')({ url: 'http://safe.com' });
      expect(result.success).toBe(true);
    });

    it('navigate: uses browser when available', async () => {
      const browser = createMockBrowser();
      loop.browser = browser;
      await loop.actions.get('navigate')({ url: 'http://safe.com' });
      expect(browser.goto).toHaveBeenCalledWith('http://safe.com');
      expect(loop._state.pageUrl).toBe('http://safe.com');
    });

    it('navigate: returns error for invalid URL', async () => {
      const browser = createMockBrowser();
      loop.browser = browser;
      const result = await loop.actions.get('navigate')({ url: 'javascript:alert(1)' });
      expect(result.success).toBe(false);
      expect(browser.goto).not.toHaveBeenCalled();
    });

    it('click: works without browser', async () => {
      const result = await loop.actions.get('click')({ selector: '#btn' });
      expect(result.success).toBe(true);
    });

    it('click: uses browser when available', async () => {
      const browser = createMockBrowser();
      loop.browser = browser;
      await loop.actions.get('click')({ selector: '#btn' });
      expect(browser.click).toHaveBeenCalledWith('#btn');
    });

    it('click: handles browser error', async () => {
      const browser = createMockBrowser();
      browser.click.mockRejectedValue(new Error('not found'));
      loop.browser = browser;
      const result = await loop.actions.get('click')({ selector: '#missing' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('not found');
    });

    it('type: works without browser', async () => {
      const result = await loop.actions.get('type')({ selector: '#input', text: 'hi' });
      expect(result.success).toBe(true);
    });

    it('type: uses browser when available', async () => {
      const browser = createMockBrowser();
      loop.browser = browser;
      await loop.actions.get('type')({ selector: '#input', text: 'hello' });
      expect(browser.type).toHaveBeenCalledWith('#input', 'hello');
    });

    it('type: handles browser error', async () => {
      const browser = createMockBrowser();
      browser.type.mockRejectedValue(new Error('type failed'));
      loop.browser = browser;
      const result = await loop.actions.get('type')({ selector: '#input', text: 'hi' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('type failed');
    });

    it('extract: works without browser', async () => {
      const result = await loop.actions.get('extract')({ selector: 'h1' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('extract: uses browser when available', async () => {
      const browser = createMockBrowser();
      loop.browser = browser;
      const result = await loop.actions.get('extract')({ selector: 'h1' });
      expect(browser.extract).toHaveBeenCalledWith('h1', undefined);
      expect(result.data).toEqual({ title: 'extracted' });
    });

    it('extract: handles browser error', async () => {
      const browser = createMockBrowser();
      browser.extract.mockRejectedValue(new Error('extract failed'));
      loop.browser = browser;
      const result = await loop.actions.get('extract')({ selector: 'h1' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('extract failed');
    });

    it('screenshot: works without browser', async () => {
      const result = await loop.actions.get('screenshot')({});
      expect(result.success).toBe(true);
    });

    it('screenshot: uses browser when available', async () => {
      const browser = createMockBrowser();
      loop.browser = browser;
      await loop.actions.get('screenshot')({});
      expect(browser.screenshot).toHaveBeenCalled();
    });

    it('analyze: returns error without vision agent', async () => {
      const result = await loop.actions.get('analyze')({ prompt: 'what' });
      expect(result.success).toBe(false);
    });

    it('analyze: uses vision agent when available', async () => {
      loop.visionAgent = { analyze: jest.fn().mockResolvedValue({ description: 'an image', ok: true }) };
      loop._state.screenshot = Buffer.from('img');
      const result = await loop.actions.get('analyze')({ prompt: 'what is this' });
      expect(result.success).toBe(true);
      expect(result.result).toBe('an image');
    });

    it('wait: waits for specified duration', async () => {
      const start = Date.now();
      await loop.actions.get('wait')({ duration: 50 });
      expect(Date.now() - start).toBeGreaterThanOrEqual(45);
    });

    it('scroll: works without browser', async () => {
      const result = await loop.actions.get('scroll')({ direction: 'down' });
      expect(result.success).toBe(true);
    });

    it('scroll: uses browser when available', async () => {
      const browser = createMockBrowser();
      loop.browser = browser;
      await loop.actions.get('scroll')({ direction: 'up', amount: 300 });
      expect(browser.scroll).toHaveBeenCalledWith('up', 300);
    });

    it('back: works without browser', async () => {
      const result = await loop.actions.get('back')({});
      expect(result.success).toBe(true);
    });

    it('back: uses browser when available', async () => {
      const browser = createMockBrowser();
      loop.browser = browser;
      await loop.actions.get('back')({});
      expect(browser.back).toHaveBeenCalled();
    });

    it('complete: returns result', async () => {
      const result = await loop.actions.get('complete')({ result: 'final answer' });
      expect(result.success).toBe(true);
      expect(result.result).toBe('final answer');
    });
  });

  describe('MCP actions', () => {
    it('mcpCall: returns error without bridge', async () => {
      const result = await loop.actions.get('mcpCall')({ toolFullName: 'test' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });

    it('mcpCall: calls bridge and returns result', async () => {
      const bridge = createMockMCPBridge();
      loop.mcpBridge = bridge;
      const result = await loop.actions.get('mcpCall')({ toolFullName: 'test', arguments: { x: 1 } });
      expect(result.success).toBe(true);
      expect(result.result.data).toBe('mcp result');
      expect(bridge.call).toHaveBeenCalled();
    });

    it('mcpCall: handles bridge error', async () => {
      const bridge = createMockMCPBridge();
      bridge.call.mockRejectedValue(new Error('bridge error'));
      loop.mcpBridge = bridge;
      const result = await loop.actions.get('mcpCall')({ toolFullName: 'test' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('bridge error');
    });

    it('batchMCPCall: returns error without bridge', async () => {
      const result = await loop.actions.get('batchMCPCall')({ calls: [] });
      expect(result.success).toBe(false);
    });

    it('batchMCPCall: calls bridge batch', async () => {
      const bridge = createMockMCPBridge();
      loop.mcpBridge = bridge;
      const result = await loop.actions.get('batchMCPCall')({ calls: [{ tool: 'a' }] });
      expect(result.success).toBe(true);
      expect(bridge.batchCall).toHaveBeenCalled();
    });

    it('batchMCPCall: handles bridge error', async () => {
      const bridge = createMockMCPBridge();
      bridge.batchCall.mockRejectedValue(new Error('batch error'));
      loop.mcpBridge = bridge;
      const result = await loop.actions.get('batchMCPCall')({ calls: [{ tool: 'a' }] });
      expect(result.success).toBe(false);
      expect(result.error).toBe('batch error');
    });
  });

  describe('skill actions', () => {
    it('skillCall: returns error without manager', async () => {
      const result = await loop.actions.get('skillCall')({ skillName: 'test' });
      expect(result.success).toBe(false);
    });

    it('skillCall: calls skill manager', async () => {
      const mgr = createMockSkillManager();
      loop.skillManager = mgr;
      const result = await loop.actions.get('skillCall')({ skillName: 'test', parameters: { x: 1 } });
      expect(result.success).toBe(true);
      expect(mgr.executeSkill).toHaveBeenCalledWith('test', { x: 1 }, expect.any(Object));
    });

    it('skillCall: handles manager error', async () => {
      const mgr = createMockSkillManager();
      mgr.executeSkill.mockRejectedValue(new Error('skill error'));
      loop.skillManager = mgr;
      const result = await loop.actions.get('skillCall')({ skillName: 'test' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('skill error');
    });

    it('batchSkillCall: returns error without manager', async () => {
      const result = await loop.actions.get('batchSkillCall')({ calls: [] });
      expect(result.success).toBe(false);
    });

    it('batchSkillCall: calls multiple skills', async () => {
      const mgr = createMockSkillManager();
      loop.skillManager = mgr;
      const result = await loop.actions.get('batchSkillCall')({
        calls: [{ skillName: 'a' }, { skillName: 'b' }]
      });
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it('batchSkillCall: handles null calls (outer catch)', async () => {
      const mgr = createMockSkillManager();
      loop.skillManager = mgr;
      const result = await loop.actions.get('batchSkillCall')({ calls: null });
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('batchSkillCall: handles individual skill failure', async () => {
      const mgr = createMockSkillManager();
      mgr.executeSkill.mockResolvedValueOnce({ output: 'ok' });
      mgr.executeSkill.mockRejectedValueOnce(new Error('skill fail'));
      loop.skillManager = mgr;
      const result = await loop.actions.get('batchSkillCall')({
        calls: [{ skillName: 'a', parameters: {} }, { skillName: 'b', parameters: {} }]
      });
      expect(result.success).toBe(true);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.errorCount).toBe(1);
      expect(result.successCount).toBe(1);
    });

    it('skillAnalysis: returns error without discovery', async () => {
      const result = await loop.actions.get('skillAnalysis')({ userInput: 'test' });
      expect(result.success).toBe(false);
    });

    it('skillAnalysis: calls discovery service', async () => {
      const discovery = createMockSkillDiscovery();
      loop.skillDiscovery = discovery;
      const result = await loop.actions.get('skillAnalysis')({ userInput: 'test' });
      expect(result.success).toBe(true);
      expect(result.hasMatch).toBe(true);
    });

    it('skillAnalysis: handles discovery error', async () => {
      const discovery = createMockSkillDiscovery();
      discovery.analyzeInput.mockImplementation(() => { throw new Error('analysis error'); });
      loop.skillDiscovery = discovery;
      const result = await loop.actions.get('skillAnalysis')({ userInput: 'test' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('analysis error');
    });
  });

  describe('v2 actions (spawnTask, waitForTask, backgroundTask)', () => {
    it('spawnTask: returns error without taskFn', async () => {
      const result = await loop.actions.get('spawnTask')({ name: 'test' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('taskFn is required');
    });

    it('spawnTask: creates and starts background task', async () => {
      const result = await loop.actions.get('spawnTask')({
        name: 'bg', taskType: 'data', priority: 1,
        taskFn: async () => 'done'
      });
      expect(result.success).toBe(true);
      expect(result.taskId).toBeTruthy();
      expect(loop._stats.backgroundTasksSpawned).toBe(1);
      await loop.backgroundTasks.waitForAll(1000);
      loop.backgroundTasks.cleanup();
    });

    it('spawnTask: logs error when background task fails', async () => {
      const logSpy = jest.fn();
      loop.logger = { error: logSpy };
      const result = await loop.actions.get('spawnTask')({
        name: 'failing', taskType: 'data', priority: 0,
        taskFn: async () => { throw new Error('bg crash'); }
      });
      expect(result.success).toBe(true);
      await loop.backgroundTasks.waitForAll(1000);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('bg crash'));
      loop.backgroundTasks.cleanup();
    });

    it('waitForTask: returns not found for missing', async () => {
      const result = await loop.actions.get('waitForTask')({ taskId: 'no-such' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Task not found');
    });

    it('waitForTask: returns immediately for completed task', async () => {
      const task = loop.createBackgroundTask('bg');
      task.start();
      task.complete('data');
      const result = await loop.actions.get('waitForTask')({ taskId: task.id });
      expect(result.success).toBe(true);
      expect(result.result).toBe('data');
    });

    it('waitForTask: returns immediately for failed task', async () => {
      const task = loop.createBackgroundTask('bg');
      task.start();
      task.fail('error');
      const result = await loop.actions.get('waitForTask')({ taskId: task.id });
      expect(result.success).toBe(false);
    });

    it('waitForTask: waits for pending task to complete', async () => {
      const task = loop.createBackgroundTask('bg-wait');
      task.start();
      const promise = loop.actions.get('waitForTask')({ taskId: task.id, timeout: 500 });
      await new Promise(r => setTimeout(r, 10));
      task.complete('async done');
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.result).toBe('async done');
    });

    it('waitForTask: waits for pending task to fail', async () => {
      const task = loop.createBackgroundTask('bg-wait-fail');
      task.start();
      const promise = loop.actions.get('waitForTask')({ taskId: task.id, timeout: 500 });
      await new Promise(r => setTimeout(r, 10));
      task.fail('async error');
      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('async error');
    });

    it('waitForTask: times out when task never completes', async () => {
      const task = loop.createBackgroundTask('bg-never');
      task.start();
      const result = await loop.actions.get('waitForTask')({ taskId: task.id, timeout: 30 });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Wait timeout');
    });

    it('backgroundTask: wraps action in background', async () => {
      const result = await loop.actions.get('backgroundTask')({
        name: 'bg-action', taskType: 'data', action: 'complete',
        actionParams: { result: 'async done' }
      });
      expect(result.success).toBe(true);
      expect(result.taskId).toBeTruthy();
      expect(loop._stats.backgroundTasksSpawned).toBe(1);
      await loop.backgroundTasks.waitForAll(1000);
      loop.backgroundTasks.cleanup();
    });

    it('backgroundTask: unknown action throws in background', async () => {
      const result = await loop.actions.get('backgroundTask')({
        name: 'bad-action', taskType: 'data', action: 'nonexistent'
      });
      expect(result.success).toBe(true);
      await loop.backgroundTasks.waitForAll(1000);
      const tasks = loop.backgroundTasks.getAll();
      expect(tasks[0].status).toBe(TaskStatus.FAILED);
      loop.backgroundTasks.cleanup();
    });
  });

  describe('_refreshMCPTools', () => {
  it('refreshes tools and caches them', async () => {
    const registry = createMockMCPRegistry();
    registry.formatForLLM.mockReturnValue([{ name: 'tool1' }]);
    loop.mcpRegistry = registry;
    await loop._refreshMCPTools();
    expect(loop.mcpTools).toEqual([{ name: 'tool1' }]);
  });
});

describe('_refreshSkillTools', () => {
  it('refreshes skill tools and caches them', async () => {
    const discovery = createMockSkillDiscovery();
    discovery.getSkillsForLLM.mockReturnValue({ tools: [{ function: { name: 'sk1' } }] });
    loop.skillDiscovery = discovery;
    await loop._refreshSkillTools();
    expect(loop.skillTools).toEqual([{ function: { name: 'sk1' } }]);
  });
});

describe('_perceive', () => {
    it('returns observation with page info', async () => {
      const obs = await loop._perceive({});
      expect(obs.pageUrl).toBe('');
      expect(obs.pageTitle).toBe('');
      expect(obs.timestamp).toBeGreaterThan(0);
    });

    it('uses browser for page info', async () => {
      const browser = createMockBrowser();
      loop.browser = browser;
      const obs = await loop._perceive({});
      expect(obs.pageUrl).toBe('http://test.com');
      expect(obs.pageTitle).toBe('Test Page');
    });

    it('calls context.observe if provided', async () => {
      const observe = jest.fn().mockResolvedValue({ customField: 'custom' });
      const obs = await loop._perceive({ observe });
      expect(obs.customField).toBe('custom');
      expect(observe).toHaveBeenCalled();
    });

    it('handles browser observation error gracefully', async () => {
      const browser = createMockBrowser();
      browser.url.mockRejectedValue(new Error('browser down'));
      loop.browser = browser;
      const logSpy = jest.fn();
      loop.logger = { debug: logSpy };
      const obs = await loop._perceive({});
      expect(obs.pageUrl).toBe('');
      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('_think', () => {
    it('returns fallback without LLM adapter', async () => {
      const thought = await loop._think('goal', {}, []);
      expect(thought.analysis).toBeTruthy();
      expect(thought.plan).toEqual(['complete']);
    });

    it('calls LLM adapter when configured', async () => {
      const llm = createMockLLM();
      loop.llmAdapter = llm;
      const thought = await loop._think('goal', {}, []);
      expect(llm.generate).toHaveBeenCalled();
      expect(thought.analysis).toBe('test analysis');
    });

    it('returns fallback on JSON parse failure', async () => {
      const llm = createMockLLM();
      llm.generate.mockResolvedValue('not json');
      loop.llmAdapter = llm;
      const thought = await loop._think('goal', {}, []);
      expect(thought.analysis).toBe('not json');
      expect(thought.plan).toEqual(['complete']);
    });

    it('handles JSON match but invalid JSON body', async () => {
      const llm = createMockLLM();
      llm.generate.mockResolvedValue('before { invalid json } after');
      loop.llmAdapter = llm;
      const logSpy = jest.fn();
      loop.logger = { debug: logSpy };
      const thought = await loop._think('goal', {}, []);
      expect(logSpy).toHaveBeenCalled();
      expect(thought.plan).toEqual(['complete']);
    });

    it('formats history in think prompt', async () => {
      const llm = createMockLLM();
      loop.llmAdapter = llm;
      const history = [
        { type: 'observation', data: { url: 'http://test.com' }, timestamp: 1 },
        { type: 'thought', data: { analysis: 'hello' }, timestamp: 2 }
      ];
      await loop._think('goal', {}, history);
      expect(llm.generate).toHaveBeenCalledWith(
        expect.stringContaining('[observation]'),
        expect.any(Object)
      );
    });

    it('returns error fallback on LLM exception', async () => {
      const llm = createMockLLM();
      llm.generate.mockRejectedValue(new Error('LLM down'));
      loop.llmAdapter = llm;
      const thought = await loop._think('goal', {}, []);
      expect(thought.analysis).toBe('LLM down');
      expect(thought.plan).toEqual(['complete']);
    });
  });

  describe('_decideAction', () => {
    it('uses nextAction from thought', async () => {
      const action = await loop._decideAction({
        nextAction: { type: 'click', params: { selector: '#btn' } }
      });
      expect(action.type).toBe('click');
      expect(action.params.selector).toBe('#btn');
    });

    it('blocks unknown nextAction type', async () => {
      const action = await loop._decideAction({
        nextAction: { type: 'hack', params: {} }
      });
      expect(action.type).toBe('complete');
    });

    it('falls back to plan[0] when no nextAction', async () => {
      const action = await loop._decideAction({
        plan: ['navigate', 'click'], analysis: 'test'
      });
      expect(action.type).toBe('navigate');
    });

    it('blocks unknown plan action', async () => {
      const action = await loop._decideAction({
        plan: ['exploit']
      });
      expect(action.type).toBe('complete');
    });

    it('defaults to complete with analysis', async () => {
      const action = await loop._decideAction({
        analysis: 'default complete'
      });
      expect(action.type).toBe('complete');
      expect(action.params.result).toBe('default complete');
    });
  });

  describe('_executeAction', () => {
    it('executes a registered action', async () => {
      const result = await loop._executeAction({ type: 'complete', params: { result: 'ok' } });
      expect(result.success).toBe(true);
      expect(result.result).toBe('ok');
    });

    it('returns error for unknown action', async () => {
      const result = await loop._executeAction({ type: 'unknown', params: {} });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown');
    });

    it('handles action handler exceptions', async () => {
      loop.registerAction('crash', async () => { throw new Error('crash'); });
      const result = await loop._executeAction({ type: 'crash', params: {} });
      expect(result.success).toBe(false);
      expect(result.error).toBe('crash');
    });

    it('handles null params gracefully', async () => {
      loop.registerAction('no-params', async (params) => {
        return { success: true, params };
      });
      const result = await loop._executeAction({ type: 'no-params' });
      expect(result.success).toBe(true);
    });
  });

  describe('run method - loop execution', () => {
    it('completes a basic loop successfully', async () => {
      const perceiveSpy = jest.spyOn(loop, '_perceive').mockResolvedValue({ pageUrl: '', pageTitle: '' });
      const thinkSpy = jest.spyOn(loop, '_think').mockResolvedValue({
        analysis: 'done', plan: ['complete'], reasoning: 'ok',
        nextAction: { type: 'complete', params: { result: 'finished' } }
      });
      const result = await loop.run('test goal', {});
      expect(result.success).toBe(true);
      expect(result.result).toBe('finished');
      expect(result.iterations).toBe(1);
      expect(perceiveSpy).toHaveBeenCalledTimes(1);
      expect(thinkSpy).toHaveBeenCalledTimes(1);
    });

    it('iterates multiple times until complete', async () => {
      let callCount = 0;
      jest.spyOn(loop, '_perceive').mockResolvedValue({ pageUrl: '', pageTitle: '' });
      jest.spyOn(loop, '_think').mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            analysis: 'keep going',
            plan: ['wait'],
            nextAction: { type: 'wait', params: { duration: 5 } }
          };
        }
        return {
          analysis: 'done', plan: ['complete'],
          nextAction: { type: 'complete', params: { result: 'iterative result' } }
        };
      });
      const result = await loop.run('multi-step goal', {});
      expect(result.success).toBe(true);
      expect(result.iterations).toBe(3);
    });

    it('rejects if already running', async () => {
      loop.isRunning = true;
      await expect(loop.run('goal', {})).rejects.toThrow('already running');
    });

    it('aborts on signal', async () => {
      loop.on('error', () => {});
      jest.spyOn(loop, '_perceive').mockResolvedValue({});
      jest.spyOn(loop, '_think').mockImplementation(async () => {
        loop._abortController.abort();
        return { analysis: 'x', plan: ['wait'], nextAction: { type: 'wait', params: { duration: 5 } } };
      });
      const result = await loop.run('goal', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Agent loop aborted');
    });

    it('respects maxIterations', async () => {
      jest.spyOn(loop, '_perceive').mockResolvedValue({});
      jest.spyOn(loop, '_think').mockResolvedValue({
        analysis: 'keep going',
        plan: ['wait'],
        nextAction: { type: 'wait', params: { duration: 1 } }
      });
      const result = await loop.run('goal', {});
      expect(result.success).toBe(false);
      expect(result.iterations).toBe(5);
    });

    it('handles loop timeout', async () => {
      const tinyLoop = new AgentLoop({ maxIterations: 3, timeout: 5, onError: jest.fn() });
      tinyLoop.on('error', () => {});
      jest.spyOn(tinyLoop, '_perceive').mockResolvedValue({});
      jest.spyOn(tinyLoop, '_think').mockResolvedValue({
        analysis: 'keep going',
        plan: ['wait'],
        nextAction: { type: 'wait', params: { duration: 2 } }
      });
      const result = await tinyLoop.run('goal', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Agent loop timeout');
    }, 10000);

    it('calls onError callback on failure', async () => {
      const onError = jest.fn();
      const errorLoop = new AgentLoop({ maxIterations: 5, timeout: 5000, onError });
      errorLoop.on('error', () => {});
      jest.spyOn(errorLoop, '_perceive').mockImplementation(async () => {
        throw new Error('perceive failed');
      });
      const result = await errorLoop.run('goal', {});
      expect(result.success).toBe(false);
      expect(onError).toHaveBeenCalled();
    });

    it('truncates history beyond 200 entries', async () => {
      const historyLoop = new AgentLoop({ maxIterations: 5, timeout: 5000 });
      historyLoop.history = new Array(250).fill({ type: 'observation', data: {} });
      jest.spyOn(historyLoop, '_perceive').mockResolvedValue({});
      jest.spyOn(historyLoop, '_think').mockResolvedValue({
        analysis: 'done',
        nextAction: { type: 'complete', params: { result: 'x' } }
      });
      await historyLoop.run('goal', {});
      expect(historyLoop.history.length).toBeLessThanOrEqual(106);
    });

    it('truncates history beyond 200 entries during many iterations', async () => {
      const loop2 = new AgentLoop({ maxIterations: 60, timeout: 5000 });
      jest.spyOn(loop2, '_perceive').mockResolvedValue({});
      jest.spyOn(loop2, '_think').mockResolvedValue({
        analysis: 'keep going',
        plan: ['wait'],
        nextAction: { type: 'wait', params: { duration: 1 } }
      });
      await loop2.run('goal', {});
      expect(loop2.history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('run with background task holdback', () => {
    it('holds and releases result when background tasks running', async () => {
      loop.on('error', () => {});
      jest.spyOn(loop, '_perceive').mockResolvedValue({});
      jest.spyOn(loop, '_think').mockResolvedValue({
        analysis: 'with bg',
        plan: ['wait'],
        nextAction: { type: 'wait', params: { duration: 5 } }
      });
      jest.spyOn(loop, 'waitForBackgroundTasks').mockResolvedValue();
      jest.spyOn(loop, 'hasRunningBackgroundTasks').mockReturnValue(true);
      const holdSpy = jest.spyOn(loop, 'holdResult');
      const releaseSpy = jest.spyOn(loop, 'releaseHeldResult');
      const result = await loop.run('goal', {});
      expect(result.success).toBe(false);
      expect(holdSpy).toHaveBeenCalled();
      expect(releaseSpy).toHaveBeenCalled();
    }, 10000);
  });

  describe('getStats', () => {
    it('returns accumulated stats', () => {
      loop._stats.iterations = 10;
      loop._stats.actionsExecuted = 8;
      loop._stats.totalActionDuration = 400;
      const stats = loop.getStats();
      expect(stats.iterations).toBe(10);
      expect(stats.actionsExecuted).toBe(8);
      expect(stats.avgActionDuration).toBe(50);
      expect(stats.backgroundTasks).toBeDefined();
    });

    it('avgActionDuration is 0 when no actions', () => {
      const stats = loop.getStats();
      expect(stats.avgActionDuration).toBe(0);
    });
  });

  describe('abort', () => {
    it('aborts controller and cancels background tasks', () => {
      const abortSpy = jest.fn();
      loop._abortController = { abort: abortSpy };
      const task = loop.createBackgroundTask('bg');
      task.start();
      loop.abort();
      expect(abortSpy).toHaveBeenCalled();
      expect(task.status).toBe(TaskStatus.CANCELLED);
    });

    it('handles when no controller set', () => {
      expect(() => loop.abort()).not.toThrow();
    });
  });

  describe('getState / getHistory / clearHistory', () => {
    it('getState returns copy of state', () => {
      loop._state.pageUrl = 'http://test.com';
      const state = loop.getState();
      expect(state.pageUrl).toBe('http://test.com');
      state.pageUrl = 'modified';
      expect(loop._state.pageUrl).toBe('http://test.com');
    });

    it('getHistory returns copy of history', () => {
      loop.history.push({ type: 'observation' });
      const history = loop.getHistory();
      expect(history).toHaveLength(1);
      history.push({ type: 'thought' });
      expect(loop.history).toHaveLength(1);
    });

    it('clearHistory empties history', () => {
      loop.history.push({ type: 'observation' });
      loop.clearHistory();
      expect(loop.history).toHaveLength(0);
    });
  });

  describe('setMCPServices', () => {
    it('sets bridge and registry, refreshes tools', () => {
      const bridge = createMockMCPBridge();
      const registry = createMockMCPRegistry();
      jest.spyOn(loop, '_refreshMCPTools').mockResolvedValue();
      loop.setMCPServices(bridge, registry);
      expect(loop.mcpBridge).toBe(bridge);
      expect(loop.mcpRegistry).toBe(registry);
    });
  });

  describe('setSkillServices', () => {
    it('sets discovery and manager, refreshes tools', () => {
      const discovery = createMockSkillDiscovery();
      const mgr = createMockSkillManager();
      jest.spyOn(loop, '_refreshSkillTools').mockResolvedValue();
      loop.setSkillServices(discovery, mgr);
      expect(loop.skillDiscovery).toBe(discovery);
      expect(loop.skillManager).toBe(mgr);
    });
  });

  describe('_getMCPTools', () => {
    it('returns empty when no registry', () => {
      expect(loop._getMCPTools()).toEqual([]);
    });

    it('uses cached tools when valid', () => {
      loop.mcpToolCache.set('tools', { data: ['cached'], timestamp: Date.now() });
      expect(loop._getMCPTools()).toEqual(['cached']);
    });

    it('_refreshMCPTools is no-op without registry', async () => {
      await expect(loop._refreshMCPTools()).resolves.toBeUndefined();
    });

    it('_refreshMCPTools handles refresh error', async () => {
      const registry = createMockMCPRegistry();
      registry.refresh.mockRejectedValue(new Error('refresh fail'));
      loop.mcpRegistry = registry;
      await expect(loop._refreshMCPTools()).resolves.toBeUndefined();
    });

    it('_getMCPTools refreshes when cache expired', () => {
      loop.mcpToolCache.set('tools', { data: ['old'], timestamp: Date.now() - 600000 });
      const registry = createMockMCPRegistry();
      registry.formatForLLM.mockReturnValue([{ name: 'fresh' }]);
      loop.mcpRegistry = registry;
      const tools = loop._getMCPTools();
      expect(tools).toEqual([{ name: 'fresh' }]);
    });
  });

  describe('_getSkillTools', () => {
    it('returns empty when no discovery', () => {
      expect(loop._getSkillTools()).toEqual([]);
    });

    it('uses cached tools when valid', () => {
      loop.skillToolCache.set('tools', { data: ['cached'], timestamp: Date.now() });
      expect(loop._getSkillTools()).toEqual(['cached']);
    });

    it('_refreshSkillTools is no-op without discovery', async () => {
      await expect(loop._refreshSkillTools()).resolves.toBeUndefined();
    });

    it('_refreshSkillTools handles refresh error', async () => {
      const discovery = createMockSkillDiscovery();
      discovery.getSkillsForLLM.mockImplementation(() => { throw new Error('disc fail'); });
      loop.skillDiscovery = discovery;
      await expect(loop._refreshSkillTools()).resolves.toBeUndefined();
    });

    it('_getSkillTools refreshes when cache expired', () => {
      loop.skillToolCache.set('tools', { data: ['old'], timestamp: Date.now() - 600000 });
      const discovery = createMockSkillDiscovery();
      discovery.getSkillsForLLM.mockReturnValue({ tools: [{ function: { name: 'fresh' } }] });
      loop.skillDiscovery = discovery;
      const tools = loop._getSkillTools();
      expect(tools).toEqual([{ function: { name: 'fresh' } }]);
    });
  });

  describe('_getMCPToolsSection / _getSkillToolsSection', () => {
    it('returns empty string when no tools', () => {
      expect(loop._getMCPToolsSection()).toBe('');
      expect(loop._getSkillToolsSection()).toBe('');
    });

    it('generates section with tools', () => {
      loop.mcpToolCache.set('tools', {
        data: [
          { name: 'search', description: 'Search tool', parameters: { properties: { q: { type: 'string', description: 'query' } }, required: ['q'] } }
        ],
        timestamp: Date.now()
      });
      const section = loop._getMCPToolsSection();
      expect(section).toContain('search');
      expect(section).toContain('q');
      expect(section).toContain('[必填]');
    });

    it('generates skill tools section with tools', () => {
      loop.skillToolCache.set('tools', {
        data: [
          { function: { name: 'analyze', description: 'Analysis', parameters: { properties: { text: { type: 'string' } }, required: [] } } }
        ],
        timestamp: Date.now()
      });
      const section = loop._getSkillToolsSection();
      expect(section).toContain('analyze');
      expect(section).toContain('text');
    });

    it('truncates MCP tools beyond 20', () => {
      const manyTools = Array.from({ length: 25 }, (_, i) => ({
        name: `tool${i}`, description: `Tool ${i}`, parameters: { properties: { x: { type: 'string' } } }
      }));
      loop.mcpToolCache.set('tools', { data: manyTools, timestamp: Date.now() });
      const section = loop._getMCPToolsSection();
      expect(section).toContain('还有');
      expect(section).toContain('5');
    });

    it('truncates skill tools beyond 15', () => {
      const manyTools = Array.from({ length: 20 }, (_, i) => ({
        function: { name: `sk${i}`, description: `Skill ${i}`, parameters: { properties: {} } }
      }));
      loop.skillToolCache.set('tools', { data: manyTools, timestamp: Date.now() });
      const section = loop._getSkillToolsSection();
      expect(section).toContain('还有');
      expect(section).toContain('5');
    });

    it('handles tool with null description and no params', () => {
      loop.mcpToolCache.set('tools', {
        data: [{ name: 'bare', description: null, parameters: null }],
        timestamp: Date.now()
      });
      const section = loop._getMCPToolsSection();
      expect(section).toContain('bare');
      expect(section).toContain('无描述');
    });

    it('handles skill function with null description and no params', () => {
      loop.skillToolCache.set('tools', {
        data: [{ function: { name: 'barefunc', description: null, parameters: null } }],
        timestamp: Date.now()
      });
      const section = loop._getSkillToolsSection();
      expect(section).toContain('barefunc');
      expect(section).toContain('无描述');
    });

    it('handles tool param without type', () => {
      loop.mcpToolCache.set('tools', {
        data: [{
          name: 'loose',
          description: 'test',
          parameters: { properties: { x: { description: 'no type' } }, required: ['x'] }
        }],
        timestamp: Date.now()
      });
      const section = loop._getMCPToolsSection();
      expect(section).toContain('(any)');
    });

    it('handles skill tool with required param and no type', () => {
      loop.skillToolCache.set('tools', {
        data: [{
          function: { name: 'loose', description: 'test', parameters: { properties: { x: { } }, required: ['x'] } }
        }],
        timestamp: Date.now()
      });
      const section = loop._getSkillToolsSection();
      expect(section).toContain(' [必填]');
      expect(section).toContain('(string)');
    });

    it('handles skill param without type (optional)', () => {
      loop.skillToolCache.set('tools', {
        data: [{
          function: { name: 'opt', description: 'test', parameters: { properties: { y: { } }, required: [] } }
        }],
        timestamp: Date.now()
      });
      const section = loop._getSkillToolsSection();
      expect(section).toContain(' [可选]');
    });
  });

  describe('EventBus off() edge cases', () => {
    it('off with unknown event does not throw', () => {
      loop.off('nonexistent', () => {});
    });

    it('off with unregistered callback does not throw', () => {
      const cb = () => {};
      loop.on('event', cb);
      loop.off('event', () => {}); // different callback ref
    });
  });

  describe('BackgroundTaskManager creation edge cases', () => {
    it('create with no options', () => {
      const task = loop.backgroundTasks.create();
      expect(task).toBeDefined();
      expect(task.status).toBe(TaskStatus.PENDING);
    });
  });

  describe('BackgroundTask off() edge cases', () => {
    it('off with unknown event does not throw', () => {
      const task = new BackgroundTask();
      task.off('nonexistent', () => {});
    });

    it('off with unregistered callback does not throw', () => {
      const task = new BackgroundTask();
      const cb = () => {};
      task.on('event', cb);
      task.off('event', () => {});
    });
  });

  describe('batch actions with default calls', () => {
    it('batchMCPCall with no calls', async () => {
      const result = await loop.actions.get('batchMCPCall')({});
      expect(result.success).toBe(false);
    });

    it('batchSkillCall with no calls', async () => {
      const result = await loop.actions.get('batchSkillCall')({});
      expect(result.success).toBe(false);
    });
  });
});
