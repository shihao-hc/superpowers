const AutomationEngine = require('../../src/agent/AutomationEngine');

describe('AutomationEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new AutomationEngine();
  });

  describe('constructor', () => {
    it('sets default options', () => {
      expect(engine.llmAdapter).toBeNull();
      expect(engine.agentLoop).toBeNull();
      expect(engine.taskQueue).toEqual([]);
      expect(engine.activeTasks).toBeInstanceOf(Map);
      expect(engine.completedTasks).toEqual([]);
      expect(engine.maxConcurrent).toBe(3);
      expect(engine._isProcessing).toBe(false);
    });

    it('accepts custom options', () => {
      const llmAdapter = { generate: jest.fn() };
      const agentLoop = { run: jest.fn() };
      const onTaskStart = jest.fn();
      const onTaskComplete = jest.fn();
      const onTaskError = jest.fn();
      const custom = new AutomationEngine({
        llmAdapter,
        agentLoop,
        maxConcurrent: 5,
        onTaskStart,
        onTaskComplete,
        onTaskError
      });
      expect(custom.llmAdapter).toBe(llmAdapter);
      expect(custom.agentLoop).toBe(agentLoop);
      expect(custom.maxConcurrent).toBe(5);
      expect(custom.onTaskStart).toBe(onTaskStart);
      expect(custom.onTaskComplete).toBe(onTaskComplete);
      expect(custom.onTaskError).toBe(onTaskError);
    });

    it('registers default task templates', () => {
      expect(engine.taskTemplates.has('download')).toBe(true);
      expect(engine.taskTemplates.has('search')).toBe(true);
      expect(engine.taskTemplates.has('monitor')).toBe(true);
      expect(engine.taskTemplates.has('extract')).toBe(true);
      expect(engine.taskTemplates.has('fill')).toBe(true);
    });
  });

  describe('_parseInterval', () => {
    it('parses seconds', () => {
      expect(engine._parseInterval(['', '30', '秒'])).toBe(30000);
    });

    it('parses minutes', () => {
      expect(engine._parseInterval(['', '5', '分钟'])).toBe(300000);
    });

    it('parses hours', () => {
      expect(engine._parseInterval(['', '2', '小时'])).toBe(7200000);
    });

    it('defaults to 60000 for unknown unit', () => {
      expect(engine._parseInterval(['', '10', 'unknown'])).toBe(60000);
    });
  });

  describe('_fallbackParse', () => {
    it('parses download commands', () => {
      const result = engine._fallbackParse('下载 https://example.com/file.zip');
      expect(result.action).toBe('download');
      expect(result.url).toBe('https://example.com/file.zip');
      expect(result.steps).toEqual(['navigate', 'extract', 'download', 'save']);
    });

    it('parses download via English keyword', () => {
      const result = engine._fallbackParse('download this file');
      expect(result.action).toBe('download');
    });

    it('parses search commands', () => {
      const result = engine._fallbackParse('搜索：天气');
      expect(result.action).toBe('search');
      expect(result.query).toBe('天气');
      expect(result.steps).toEqual(['navigate', 'type', 'extract', 'summarize']);
    });

    it('parses search via English keyword', () => {
      const result = engine._fallbackParse('search something');
      expect(result.action).toBe('search');
    });

    it('parses monitor commands with interval', () => {
      const result = engine._fallbackParse('监控 https://example.com 每10分钟');
      expect(result.action).toBe('monitor');
      expect(result.url).toBe('https://example.com');
      expect(result.interval).toBe(600000);
      expect(result.steps).toEqual(['navigate', 'extract', 'compare', 'notify']);
    });

    it('parses monitor commands with default interval', () => {
      const result = engine._fallbackParse('监控 https://example.com');
      expect(result.action).toBe('monitor');
      expect(result.interval).toBe(60000);
    });

    it('parses monitor via English keyword', () => {
      const result = engine._fallbackParse('monitor page');
      expect(result.action).toBe('monitor');
    });

    it('parses extract commands', () => {
      const result = engine._fallbackParse('提取 选择器: .content');
      expect(result.action).toBe('extract');
      expect(result.selector).toBe('.content');
      expect(result.steps).toEqual(['navigate', 'extract', 'format', 'save']);
    });

    it('parses extract via English keyword', () => {
      const result = engine._fallbackParse('extract data');
      expect(result.action).toBe('extract');
    });

    it('defaults to navigate for unknown command', () => {
      const result = engine._fallbackParse('go to somewhere');
      expect(result.action).toBe('navigate');
      expect(result.params.text).toBe('go to somewhere');
      expect(result.steps).toEqual(['navigate']);
    });

    it('handles empty command gracefully', () => {
      const result = engine._fallbackParse('');
      expect(result.action).toBe('navigate');
    });
  });

  describe('parseCommand', () => {
    it('falls back when no llmAdapter', async () => {
      const result = await engine.parseCommand('下载 https://example.com');
      expect(result.action).toBe('download');
    });

    it('uses llmAdapter when available', async () => {
      const llmAdapter = {
        generate: jest.fn().mockResolvedValue('{"action":"search","params":{"query":"test"}}')
      };
      const eng = new AutomationEngine({ llmAdapter });
      const result = await eng.parseCommand('search for test');
      expect(llmAdapter.generate).toHaveBeenCalledWith(
        expect.stringContaining('搜索信息'),
        { temperature: 0.2, maxTokens: 500 }
      );
      expect(result.action).toBe('search');
      expect(result.params.query).toBe('test');
    });

    it('falls back on llmAdapter error', async () => {
      const llmAdapter = {
        generate: jest.fn().mockRejectedValue(new Error('API error'))
      };
      const eng = new AutomationEngine({ llmAdapter });
      const result = await eng.parseCommand('下载 https://example.com');
      expect(result.action).toBe('download');
    });

    it('falls back on invalid JSON from llm', async () => {
      const llmAdapter = {
        generate: jest.fn().mockResolvedValue('not json at all')
      };
      const eng = new AutomationEngine({ llmAdapter });
      const result = await eng.parseCommand('下载 https://example.com');
      expect(result.action).toBe('download');
    });

    it('uses jsonMatch from llm response', async () => {
      const llmAdapter = {
        generate: jest.fn().mockResolvedValue('Some text {"action":"navigate","params":{"url":"http://example.com"}} more text')
      };
      const eng = new AutomationEngine({ llmAdapter });
      const result = await eng.parseCommand('go to example');
      expect(result.action).toBe('navigate');
      expect(result.params.url).toBe('http://example.com');
    });
  });

  describe('execute', () => {
    it('executes without agentLoop', async () => {
      const task = await engine.execute('下载 https://example.com');
      expect(task.id).toMatch(/^task_/);
      expect(task.command).toBe('下载 https://example.com');
      expect(task.status).toBe('completed');
      expect(task.result.message).toBe('Parsed but no agent loop configured');
      expect(engine.activeTasks.has(task.id)).toBe(false);
      expect(engine.completedTasks).toContain(task);
    });

    it('executes with agentLoop returning success', async () => {
      const agentLoop = {
        run: jest.fn().mockResolvedValue({ success: true, history: ['step1', 'step2'] })
      };
      const eng = new AutomationEngine({ agentLoop });
      const task = await eng.execute('搜索：天气');
      expect(task.status).toBe('completed');
      expect(task.steps).toEqual(['step1', 'step2']);
      expect(agentLoop.run).toHaveBeenCalledWith(
        '搜索：天气',
        expect.objectContaining({ initialObservation: expect.any(String) })
      );
    });

    it('handles agentLoop returning failure', async () => {
      const agentLoop = {
        run: jest.fn().mockResolvedValue({ success: false, history: ['step1'] })
      };
      const eng = new AutomationEngine({ agentLoop });
      const task = await eng.execute('搜索：天气');
      expect(task.status).toBe('failed');
    });

    it('handles agentLoop throwing error', async () => {
      const agentLoop = {
        run: jest.fn().mockRejectedValue(new Error('execution error'))
      };
      const eng = new AutomationEngine({ agentLoop });
      const task = await eng.execute('test');
      expect(task.status).toBe('failed');
      expect(task.error).toBe('execution error');
    });

    it('calls onTaskStart and onTaskComplete callbacks', async () => {
      const onTaskStart = jest.fn();
      const onTaskComplete = jest.fn();
      const eng = new AutomationEngine({ onTaskStart, onTaskComplete });
      const task = await eng.execute('test command');
      expect(onTaskStart).toHaveBeenCalledWith(task);
      expect(onTaskComplete).toHaveBeenCalledWith(task);
    });

    it('calls onTaskError when agentLoop fails', async () => {
      const onTaskError = jest.fn();
      const agentLoop = { run: jest.fn().mockRejectedValue(new Error('fail')) };
      const eng = new AutomationEngine({ agentLoop, onTaskError });
      await eng.execute('test');
      expect(onTaskError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('generates unique task IDs', async () => {
      const t1 = await engine.execute('cmd1');
      const t2 = await engine.execute('cmd2');
      expect(t1.id).not.toBe(t2.id);
    });

    it('supports observe context', async () => {
      const agentLoop = {
        run: jest.fn().mockResolvedValue({ success: true })
      };
      const eng = new AutomationEngine({ agentLoop });
      const context = { observe: true };
      await eng.execute('test', context);
      expect(agentLoop.run).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ observe: true })
      );
    });
  });

  describe('executeBatch', () => {
    it('executes multiple commands sequentially when under limit', async () => {
      const results = await engine.executeBatch(['cmd1', 'cmd2', 'cmd3']);
      expect(results).toHaveLength(3);
      results.forEach((r) => expect(r.status).toBe('completed'));
    });

    it('handles empty batch', async () => {
      const results = await engine.executeBatch([]);
      expect(results).toEqual([]);
    });

    it('waits when active tasks exceed maxConcurrent', async () => {
      const agentLoop = { run: jest.fn().mockResolvedValue({ success: true }) };
      const eng = new AutomationEngine({ agentLoop, maxConcurrent: 2 });
      const results = await eng.executeBatch(['cmd1', 'cmd2', 'cmd3']);
      expect(results).toHaveLength(3);
    });

    it('should throttle when maxConcurrent reached', async () => {
      jest.useFakeTimers();
      try {
        const eng = new AutomationEngine({ maxConcurrent: 2 });
        eng.activeTasks.set('task1', { id: 'task1' });
        eng.activeTasks.set('task2', { id: 'task2' });

        const promise = eng.executeBatch(['cmd3']);

        jest.advanceTimersByTime(1000);

        const results = await promise;
        expect(results).toHaveLength(1);
        expect(results[0].command).toBe('cmd3');
      } finally {
        jest.useRealTimers();
      }
    });

    it('parses fill template command', () => {
      const fillTemplate = engine.taskTemplates.get('fill');
      expect(fillTemplate.description).toBe('填写表单');
      const parsed = fillTemplate.parse('填写表单 数据：测试数据');
      expect(parsed.data).toBe('测试数据');
      expect(parsed.action).toBe('fill');
    });
  });

  describe('getTaskStatus', () => {
    it('returns active task', () => {
      const task = { id: 'task_test', status: 'pending' };
      engine.activeTasks.set('task_test', task);
      expect(engine.getTaskStatus('task_test')).toBe(task);
    });

    it('returns completed task', async () => {
      const task = await engine.execute('test');
      expect(engine.getTaskStatus(task.id)).toBe(task);
    });

    it('returns undefined for unknown task', () => {
      expect(engine.getTaskStatus('nonexistent')).toBeUndefined();
    });
  });

  describe('getActiveTasks', () => {
    it('returns empty array when no active tasks', () => {
      expect(engine.getActiveTasks()).toEqual([]);
    });

    it('returns active tasks', () => {
      const t1 = { id: 't1' };
      const t2 = { id: 't2' };
      engine.activeTasks.set('t1', t1);
      engine.activeTasks.set('t2', t2);
      expect(engine.getActiveTasks()).toEqual([t1, t2]);
    });
  });

  describe('getCompletedTasks', () => {
    it('returns last N completed tasks', () => {
      for (let i = 0; i < 100; i++) {
        engine.completedTasks.push({ id: `task_${i}` });
      }
      const tasks = engine.getCompletedTasks(10);
      expect(tasks).toHaveLength(10);
      expect(tasks[0].id).toBe('task_90');
      expect(tasks[9].id).toBe('task_99');
    });

    it('returns all tasks if fewer than limit', () => {
      engine.completedTasks.push({ id: 't1' });
      const tasks = engine.getCompletedTasks(50);
      expect(tasks).toHaveLength(1);
    });

    it('uses default limit of 50', () => {
      for (let i = 0; i < 100; i++) {
        engine.completedTasks.push({ id: `task_${i}` });
      }
      expect(engine.getCompletedTasks()).toHaveLength(50);
    });
  });

  describe('cancelTask', () => {
    it('cancels an active task and removes it', () => {
      const task = { id: 'task_1', status: 'pending' };
      engine.activeTasks.set('task_1', task);
      const result = engine.cancelTask('task_1');
      expect(result).toBe(true);
      expect(task.status).toBe('cancelled');
      expect(engine.activeTasks.has('task_1')).toBe(false);
    });

    it('calls agentLoop.abort when agentLoop exists', () => {
      const agentLoop = { abort: jest.fn() };
      const eng = new AutomationEngine({ agentLoop });
      eng.activeTasks.set('task_1', { id: 'task_1' });
      const result = eng.cancelTask('task_1');
      expect(result).toBe(true);
      expect(agentLoop.abort).toHaveBeenCalled();
    });

    it('returns false for unknown task', () => {
      expect(engine.cancelTask('nonexistent')).toBe(false);
    });
  });

  describe('cancelAll', () => {
    it('cancels all active tasks', () => {
      engine.activeTasks.set('t1', { id: 't1' });
      engine.activeTasks.set('t2', { id: 't2' });
      engine.cancelAll();
      expect(engine.activeTasks.size).toBe(0);
    });

    it('handles empty active tasks', () => {
      expect(() => engine.cancelAll()).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('returns initial stats', () => {
      const stats = engine.getStats();
      expect(stats).toEqual({
        active: 0,
        completed: 0,
        successRate: '0%',
        templates: ['download', 'search', 'monitor', 'extract', 'fill']
      });
    });

    it('calculates success rate with mixed results', async () => {
      await engine.execute('success');
      const failedTask = { id: 'task_fail', status: 'failed' };
      engine.completedTasks.push(failedTask);
      const stats = engine.getStats();
      expect(stats.completed).toBe(2);
      expect(stats.successRate).toBe('50.00%');
    });

    it('returns 100% success rate when all succeed', async () => {
      await engine.execute('test1');
      await engine.execute('test2');
      const stats = engine.getStats();
      expect(stats.successRate).toBe('100.00%');
    });

    it('returns active count', () => {
      engine.activeTasks.set('t1', { id: 't1' });
      expect(engine.getStats().active).toBe(1);
    });
  });
});
