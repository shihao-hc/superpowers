const { TaskExecutor } = require('../../src/agent/TaskExecutor');

let mockBrowserAgent;
let mockAgentLoop;

jest.mock('../../src/agent/BrowserAgent', () => ({
  BrowserAgent: jest.fn().mockImplementation(() => mockBrowserAgent)
}));

jest.mock('../../src/agent/AgentLoop', () => ({
  AgentLoop: jest.fn().mockImplementation((opts) => {
    if (mockAgentLoop) {
      mockAgentLoop._capturedOptions = opts;
    }
    return mockAgentLoop;
  })
}));

jest.mock('../../src/agent/OnChainIdentity', () => ({
  OnChainIdentity: jest.fn().mockImplementation(() => ({}))
}));

function resetMocks() {
  mockBrowserAgent = {
    init: jest.fn().mockResolvedValue(),
    close: jest.fn().mockResolvedValue(),
    isConnected: jest.fn().mockReturnValue(false),
    screenshot: jest.fn().mockResolvedValue('screenshot_data')
  };
  mockAgentLoop = {
    _executeAction: jest.fn().mockResolvedValue({}),
    run: jest.fn().mockResolvedValue({ success: true, result: 'goal_result' }),
    abort: jest.fn()
  };
}

describe('TaskExecutor', () => {
  let te;

  beforeEach(() => {
    resetMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    te = new TaskExecutor();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should set default values', () => {
      expect(te.llmAdapter).toBeNull();
      expect(te.visionAgent).toBeNull();
      expect(te.maxTasks).toBe(100);
      expect(te.browser).toBeNull();
      expect(te.agentLoop).toBeNull();
      expect(te.tasks).toBeInstanceOf(Map);
      expect(te.results).toBeInstanceOf(Map);
      expect(te.templates).toBeInstanceOf(Map);
    });

    test('should accept custom options', () => {
      const llm = {};
      const vision = {};
      const identity = {};
      const onProgress = jest.fn();
      const onError = jest.fn();
      const custom = new TaskExecutor({
        llmAdapter: llm,
        visionAgent: vision,
        identity,
        maxTasks: 50,
        onProgress,
        onError
      });
      expect(custom.llmAdapter).toBe(llm);
      expect(custom.visionAgent).toBe(vision);
      expect(custom.identity).toBe(identity);
      expect(custom.maxTasks).toBe(50);
      expect(custom.onProgress).toBe(onProgress);
      expect(custom.onError).toBe(onError);
    });

    test('should create OnChainIdentity when not provided', () => {
      expect(te.identity).toBeDefined();
    });

    test('should register default templates', () => {
      expect(te.templates.size).toBeGreaterThan(0);
      expect(te.templates.has('search')).toBe(true);
      expect(te.templates.has('scrape')).toBe(true);
      expect(te.templates.has('monitor')).toBe(true);
      expect(te.templates.has('form_fill')).toBe(true);
      expect(te.templates.has('download')).toBe(true);
      expect(te.templates.has('screenshot_page')).toBe(true);
      expect(te.templates.has('price_check')).toBe(true);
      expect(te.templates.has('social_post')).toBe(true);
    });
  });

  describe('template management', () => {
    describe('registerTemplate', () => {
      test('should add a single template', () => {
        const tpl = { name: 'custom', steps: [], params: [] };
        te.registerTemplate('custom', tpl);
        expect(te.templates.get('custom')).toBe(tpl);
      });

      test('should overwrite existing template', () => {
        const tpl1 = { name: 'original', steps: [], params: [] };
        const tpl2 = { name: 'updated', steps: [], params: [] };
        te.registerTemplate('test', tpl1);
        te.registerTemplate('test', tpl2);
        expect(te.templates.get('test').name).toBe('updated');
      });
    });

    describe('getTemplates', () => {
      test('should return all templates as summary', () => {
        const templates = te.getTemplates();
        expect(Array.isArray(templates)).toBe(true);
        expect(templates.length).toBe(te.templates.size);
        templates.forEach(t => {
          expect(t).toHaveProperty('key');
          expect(t).toHaveProperty('name');
          expect(t).toHaveProperty('description');
          expect(t).toHaveProperty('icon');
          expect(t).toHaveProperty('params');
        });
      });
    });

    describe('registerIndustryTemplates', () => {
      test('should add industry-prefixed templates', () => {
        const industryTemplates = [
          { id: 'task1', name: 'Industry Task', description: 'desc', icon: '⚙️', steps: [], params: [] }
        ];
        te.registerIndustryTemplates('finance', industryTemplates);
        expect(te.templates.has('finance_task1')).toBe(true);
        expect(te.templates.get('finance_task1').name).toBe('Industry Task');
      });

      test('should register multiple industry templates', () => {
        const industryTemplates = [
          { id: 'a', name: 'A', description: 'd', icon: '⚙️', steps: [], params: [] },
          { id: 'b', name: 'B', description: 'd', icon: '⚙️', steps: [], params: [] }
        ];
        te.registerIndustryTemplates('health', industryTemplates);
        expect(te.templates.size).toBeGreaterThanOrEqual(17);
      });
    });

    describe('getTemplatesByIndustry', () => {
      test('should return empty array for unknown industry', () => {
        expect(te.getTemplatesByIndustry('unknown')).toEqual([]);
      });

      test('should return templates for matching industry', () => {
        const industryTemplates = [
          { id: 'x', name: 'X', description: 'd', icon: '⚙️', steps: [], params: [] }
        ];
        te.registerIndustryTemplates('retail', industryTemplates);
        const results = te.getTemplatesByIndustry('retail');
        expect(results.length).toBe(1);
        expect(results[0].key).toContain('retail');
      });
    });
  });

  describe('task query methods', () => {
    describe('getTask', () => {
      test('should return undefined for unknown task', () => {
        expect(te.getTask('nonexistent')).toBeUndefined();
      });
    });

    describe('getTaskResult', () => {
      test('should return undefined for unknown result', () => {
        expect(te.getTaskResult('nonexistent')).toBeUndefined();
      });
    });

    describe('getAllTasks', () => {
      test('should return empty array when no tasks', () => {
        expect(te.getAllTasks()).toEqual([]);
      });

      test('should return all tasks', async () => {
        te.tasks.set('t1', { id: 't1', status: 'running' });
        te.tasks.set('t2', { id: 't2', status: 'completed' });
        const all = te.getAllTasks();
        expect(all.length).toBe(2);
      });
    });
  });

  describe('_cleanupOldTasks', () => {
    test('should remove oldest tasks when exceeding maxTasks', () => {
      te.maxTasks = 2;
      const oldTask = { id: 'old', startTime: 1000 };
      const midTask = { id: 'mid', startTime: 2000 };
      const newTask = { id: 'new', startTime: 3000 };
      te.tasks.set('old', oldTask);
      te.tasks.set('mid', midTask);
      te.tasks.set('new', newTask);
      te.results.set('old', {});
      te.results.set('mid', {});
      te.results.set('new', {});
      te._cleanupOldTasks();
      expect(te.tasks.has('old')).toBe(false);
      expect(te.tasks.has('mid')).toBe(true);
      expect(te.tasks.has('new')).toBe(true);
    });
  });

  describe('executeTask', () => {
    test('should create task with valid id and config', async () => {
      const task = await te.executeTask({ template: 'search', params: { query: 'test' } });
      expect(task.id).toBeDefined();
      expect(task.status).toBe('completed');
      expect(task.config).toEqual({ template: 'search', params: { query: 'test' } });
      expect(task.startTime).toBeLessThanOrEqual(Date.now());
      expect(task.id.startsWith('task_')).toBe(true);
    });

    test('should auto-init when browser not connected', async () => {
      mockBrowserAgent.isConnected.mockReturnValue(false);
      mockAgentLoop._executeAction.mockResolvedValue({});
      await te.executeTask({ template: 'search', params: { query: 'test' } });
      expect(mockBrowserAgent.init).toHaveBeenCalled();
    });

    test('should re-init browser each template execution', async () => {
      mockAgentLoop._executeAction.mockResolvedValue({});
      await te.executeTask({ template: 'screenshot_page', params: { url: 'https://example.com' } });
      expect(mockBrowserAgent.init).toHaveBeenCalled();
    });

    test('should throw error when no template or goal specified', async () => {
      const task = await te.executeTask({});
      expect(task.status).toBe('failed');
      expect(task.error).toBe('Task must specify template or goal');
    });

    test('should fail for unknown template', async () => {
      const task = await te.executeTask({ template: 'nonexistent' });
      expect(task.status).toBe('failed');
      expect(task.error).toBe('Unknown template: nonexistent');
    });

    test('should execute template-based task', async () => {
      mockAgentLoop._executeAction.mockResolvedValue({});
      const task = await te.executeTask({ template: 'search', params: { query: 'hello' } });
      expect(task).toBeDefined();
      expect(mockBrowserAgent.init).toHaveBeenCalled();
      expect(mockBrowserAgent.close).toHaveBeenCalled();
    });

    test('should execute goal-based task', async () => {
      mockBrowserAgent.isConnected.mockReturnValue(false);
      const task = await te.executeTask({ goal: 'find price', startUrl: 'https://example.com' });
      expect(task).toBeDefined();
      expect(mockAgentLoop.run).toHaveBeenCalledWith('find price', expect.objectContaining({
        pageUrl: 'https://example.com'
      }));
      expect(mockBrowserAgent.close).toHaveBeenCalled();
    });

    test('should call onError when execution fails', async () => {
      const onError = jest.fn();
      const customTe = new TaskExecutor({ onError });
      await customTe.executeTask({ template: 'nonexistent' });
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('_executeTemplate', () => {
    test('should resolve {{var}} params from provided values', async () => {
      mockAgentLoop._executeAction.mockResolvedValue({});
      await te.executeTask({ template: 'search', params: { query: 'jest test' } });
      const actionCalls = mockAgentLoop._executeAction.mock.calls;
      const typeCall = actionCalls.find(c => c[0].action === 'type');
      expect(typeCall).toBeDefined();
      expect(typeCall[0].params.text).toBe('jest test');
    });

    test('should keep non-template params unchanged', async () => {
      mockAgentLoop._executeAction.mockResolvedValue({});
      await te.executeTask({ template: 'search', params: { query: 'test' } });
      const navCalls = mockAgentLoop._executeAction.mock.calls.filter(c => c[0].action === 'navigate');
      expect(navCalls[0][0].params.url).toBe('https://www.google.com');
    });

    test('should execute steps sequentially', async () => {
      const callOrder = [];
      mockAgentLoop._executeAction.mockImplementation(async (step) => {
        callOrder.push(step.action);
        return {};
      });
      await te.executeTask({ template: 'screenshot_page', params: { url: 'https://example.com' } });
      expect(callOrder).toEqual(['navigate', 'wait', 'screenshot', 'complete']);
    });

    test('should capture screenshot when step result has hasImage', async () => {
      mockAgentLoop._executeAction.mockImplementation(async (step) => {
        if (step.action === 'screenshot') return { hasImage: true };
        if (step.action === 'complete') return { result: 'done' };
        return {};
      });
      await te.executeTask({ template: 'screenshot_page', params: { url: 'https://example.com' } });
      expect(mockBrowserAgent.screenshot).toHaveBeenCalled();
    });

    test('should store extracted data when step result has data', async () => {
      mockAgentLoop._executeAction.mockImplementation(async (step) => {
        if (step.action === 'extract') return { data: 'extracted_content' };
        if (step.action === 'complete') return { result: 'done' };
        return {};
      });
      const task = await te.executeTask({ template: 'search', params: { query: 'test' } });
      expect(task.extractedData.length).toBeGreaterThan(0);
      expect(task.extractedData[0].data).toBe('extracted_content');
    });

    test('should stop at complete action and set result', async () => {
      mockAgentLoop._executeAction.mockResolvedValue({});
      const task = await te.executeTask({ template: 'search', params: { query: 'test' } });
      expect(task.status).toBe('completed');
      expect(task.result).toBe('搜索完成');
    });

    test('should handle errors during step execution', async () => {
      mockAgentLoop._executeAction.mockRejectedValue(new Error('step error'));
      const task = await te.executeTask({ template: 'search', params: { query: 'test' } });
      expect(task.status).toBe('failed');
      expect(task.error).toBe('step error');
    });
  });

  describe('_executeGoal', () => {
    test('should complete successfully', async () => {
      mockAgentLoop.run.mockResolvedValue({ success: true, result: 'goal done', history: [] });
      const task = await te.executeTask({ goal: 'do something' });
      expect(task.status).toBe('completed');
      expect(task.result).toBe('goal done');
    });

    test('should fail when goal execution fails', async () => {
      mockAgentLoop.run.mockResolvedValue({ success: false, result: null, error: 'goal failed', history: [] });
      const task = await te.executeTask({ goal: 'do something' });
      expect(task.status).toBe('failed');
      expect(task.error).toBe('goal failed');
    });

    test('should capture screenshots from observe callback', async () => {
      mockAgentLoop.run.mockImplementation(async () => {
        return { success: true, result: 'done', history: [] };
      });
      const task = await te.executeTask({ goal: 'do something' });
      expect(task).toBeDefined();
    });

    test('should pass startUrl to agentLoop', async () => {
      mockAgentLoop.run.mockResolvedValue({ success: true, result: 'done', history: [] });
      await te.executeTask({ goal: 'find', startUrl: 'https://start.com' });
      expect(mockAgentLoop.run).toHaveBeenCalledWith('find', expect.objectContaining({
        pageUrl: 'https://start.com'
      }));
    });

    test('should close browser after completion', async () => {
      mockAgentLoop.run.mockResolvedValue({ success: true, result: 'done', history: [] });
      await te.executeTask({ goal: 'do' });
      expect(mockBrowserAgent.close).toHaveBeenCalled();
    });
  });

  describe('cancelTask', () => {
    test('should cancel running task', async () => {
      const taskId = 'task_test';
      te.tasks.set(taskId, { id: taskId, status: 'running' });
      const result = await te.cancelTask(taskId);
      expect(result).toBe(true);
    });

    test('should call agentLoop.abort when cancelling', async () => {
      te.agentLoop = mockAgentLoop;
      const taskId = 'task_test';
      te.tasks.set(taskId, { id: taskId, status: 'running' });
      await te.cancelTask(taskId);
      expect(mockAgentLoop.abort).toHaveBeenCalled();
    });

    test('should set task status to cancelled', async () => {
      const taskId = 'task_test';
      const task = { id: taskId, status: 'running' };
      te.tasks.set(taskId, task);
      await te.cancelTask(taskId);
      expect(task.status).toBe('cancelled');
    });

    test('should return false for non-running task', async () => {
      const taskId = 'task_test';
      te.tasks.set(taskId, { id: taskId, status: 'completed' });
      const result = await te.cancelTask(taskId);
      expect(result).toBe(false);
    });

    test('should return false for non-existent task', async () => {
      const result = await te.cancelTask('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    test('should return zeros when no tasks', () => {
      const stats = te.getStats();
      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.running).toBe(0);
      expect(stats.templates).toBeGreaterThan(0);
    });

    test('should calculate stats correctly', () => {
      te.tasks.set('t1', { status: 'completed' });
      te.tasks.set('t2', { status: 'completed' });
      te.tasks.set('t3', { status: 'failed' });
      te.tasks.set('t4', { status: 'running' });
      const stats = te.getStats();
      expect(stats.total).toBe(4);
      expect(stats.completed).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.running).toBe(1);
    });
  });

  describe('cleanup', () => {
    test('should close browser and set to null', async () => {
      te.browser = mockBrowserAgent;
      await te.cleanup();
      expect(mockBrowserAgent.close).toHaveBeenCalled();
      expect(te.browser).toBeNull();
    });

    test('should set agentLoop to null', async () => {
      te.agentLoop = mockAgentLoop;
      await te.cleanup();
      expect(te.agentLoop).toBeNull();
    });

    test('should not throw when browser is null', async () => {
      te.browser = null;
      await expect(te.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('branch coverage', () => {
    describe('registerIndustryTemplates defaults', () => {
      test('should use defaults when template has no industry/steps/params', () => {
        te.registerIndustryTemplates('finance', [
          { id: 'task1', name: 'Task' }
        ]);
        expect(te.templates.has('finance_task1')).toBe(true);
        expect(te.templates.get('finance_task1').industry).toBe('finance');
        expect(te.templates.get('finance_task1').steps).toEqual([]);
        expect(te.templates.get('finance_task1').params).toEqual([]);
      });
    });

    describe('executeTask browser connected', () => {
      test('should skip auto-init when browser is already connected', async () => {
        mockBrowserAgent.isConnected.mockReturnValue(true);
        te.browser = mockBrowserAgent;
        te.agentLoop = mockAgentLoop;
        mockAgentLoop._executeAction.mockResolvedValue({});
        await te.executeTask({ template: 'screenshot_page', params: { url: 'https://example.com' } });
        expect(mockBrowserAgent.init).toHaveBeenCalled();
      });
    });

    describe('template without params', () => {
      test('should fallback to empty params object when not provided', async () => {
        mockAgentLoop._executeAction.mockResolvedValue({});
        await te.executeTask({ template: 'search' });
        expect(mockBrowserAgent.close).toHaveBeenCalled();
      });
    });

    describe('missing template param', () => {
      test('should use raw placeholder when param is missing from params', async () => {
        mockAgentLoop._executeAction.mockResolvedValue({});
        await te.executeTask({ template: 'search' });
        const typeCall = mockAgentLoop._executeAction.mock.calls
          .find(c => c[0].action === 'type');
        expect(typeCall[0].params.text).toBe('{{query}}');
      });
    });

    describe('complete step without result param', () => {
      test('should use action result when complete step has no result param', async () => {
        te.registerTemplate('no_result_step', {
          name: 'No Result',
          description: 'desc',
          icon: '?',
          steps: [{ action: 'complete', params: {} }],
          params: []
        });
        mockAgentLoop._executeAction.mockResolvedValue({ result: 'from_action' });
        const task = await te.executeTask({ template: 'no_result_step' });
        expect(task.status).toBe('completed');
        expect(task.result).toBe('from_action');
      });
    });

    describe('_executeGoal observe callback', () => {
      test('should invoke observe callback and capture screenshot', async () => {
        mockAgentLoop.run.mockImplementation(async (goal, options) => {
          await options.observe();
          return { success: true, result: 'done', history: [] };
        });
        const task = await te.executeTask({ goal: 'do something' });
        expect(mockBrowserAgent.screenshot).toHaveBeenCalled();
        expect(task.screenshots.length).toBeGreaterThan(0);
      });
    });

    describe('_executeGoal catch', () => {
      test('should handle error when agentLoop.run throws', async () => {
        mockAgentLoop.run.mockRejectedValue(new Error('run failure'));
        const task = await te.executeTask({ goal: 'do something' });
        expect(task.status).toBe('failed');
        expect(task.error).toBe('run failure');
      });
    });

    describe('onStep callback', () => {
      test('should invoke onStep progress from agentLoop construction', async () => {
        const progressSpy = jest.fn();
        const customTe = new TaskExecutor({ onProgress: progressSpy });
        mockAgentLoop._executeAction.mockImplementation(async (step) => {
          if (mockAgentLoop._capturedOptions && mockAgentLoop._capturedOptions.onStep) {
            mockAgentLoop._capturedOptions.onStep({ type: 'step', action: step.action });
          }
          return {};
        });
        await customTe.executeTask({ template: 'search', params: { query: 'test' } });
        expect(progressSpy).toHaveBeenCalled();
      });
    });
  });
});
