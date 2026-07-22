const { UnifiedBridge } = require('../../src/mcp/UnifiedBridge');
const { rootsManager } = require('../../src/mcp/engines/RootsManager');
const { dryRunEngine } = require('../../src/mcp/engines/DryRunEngine');
const { thinkingChain } = require('../../src/mcp/engines/ThinkingChain');
const { getAnnotation, getRiskLevel, annotateTools } = require('../../src/mcp/engines/ToolAnnotations');

jest.mock('../../src/mcp/engines/RootsManager', () => ({
  rootsManager: {
    validateMiddleware: jest.fn(),
    getRoots: jest.fn(),
    getAllowedPrefixes: jest.fn()
  }
}));

jest.mock('../../src/mcp/engines/DryRunEngine', () => ({
  dryRunEngine: {
    getHistory: jest.fn(),
    previewEdit: jest.fn(),
    previewWrite: jest.fn(),
    previewDelete: jest.fn(),
    previewDeleteDirectory: jest.fn(),
    previewCreateIssue: jest.fn(),
    previewMergePR: jest.fn(),
    previewDeleteMemo: jest.fn(),
    previewCdpCommand: jest.fn()
  }
}));

jest.mock('../../src/mcp/engines/ThinkingChain', () => ({
  thinkingChain: {
    getCurrentChain: jest.fn(),
    listChains: jest.fn(),
    addThought: jest.fn()
  }
}));

jest.mock('../../src/mcp/engines/ToolAnnotations', () => ({
  getAnnotation: jest.fn(),
  getRiskLevel: jest.fn(),
  annotateTools: jest.fn()
}));
const defaultAnnotation = { readOnlyHint: false, idempotentHint: false, destructiveHint: false };
const readOnlyAnnotation = { readOnlyHint: true, idempotentHint: true, destructiveHint: false };
const destructiveAnnotation = { readOnlyHint: false, idempotentHint: false, destructiveHint: true };

function createHandler(result) {
  return jest.fn().mockResolvedValue(result || { success: true, data: 'ok' });
}

describe('UnifiedBridge', () => {
  let bridge;

  beforeEach(() => {
    jest.clearAllMocks();
    rootsManager.validateMiddleware.mockReturnValue(null);
    rootsManager.getRoots.mockReturnValue([]);
    rootsManager.getAllowedPrefixes.mockReturnValue([]);
    dryRunEngine.getHistory.mockReturnValue([]);
    dryRunEngine.previewEdit.mockReturnValue({ preview: 'edit' });
    dryRunEngine.previewWrite.mockReturnValue({ preview: 'write' });
    dryRunEngine.previewDelete.mockReturnValue({ preview: 'delete' });
    dryRunEngine.previewDeleteDirectory.mockReturnValue({ preview: 'deleteDir' });
    dryRunEngine.previewCreateIssue.mockReturnValue({ preview: 'issue' });
    dryRunEngine.previewMergePR.mockReturnValue({ preview: 'mergePR' });
    dryRunEngine.previewDeleteMemo.mockReturnValue({ preview: 'deleteMemo' });
    dryRunEngine.previewCdpCommand.mockReturnValue({ preview: 'cdp' });
    thinkingChain.getCurrentChain.mockReturnValue(null);
    thinkingChain.listChains.mockReturnValue([]);
    thinkingChain.addThought.mockReturnValue(undefined);
    getAnnotation.mockReturnValue(defaultAnnotation);
    getRiskLevel.mockReturnValue('medium');
    annotateTools.mockImplementation(function(tools) {
      return tools.map(function(t) {
        return Object.assign({}, t, { riskLevel: 'low', annotations: t.annotations || {} });
      });
    });

    bridge = new UnifiedBridge();
  });

  describe('constructor', () => {
    test('should set default config values', () => {
      expect(bridge.config.enableRoots).toBe(true);
      expect(bridge.config.enableDryRun).toBe(true);
      expect(bridge.config.enableThinking).toBe(true);
      expect(bridge.config.autoConfirmReadOnly).toBe(false);
      expect(bridge.tools).toBeInstanceOf(Map);
      expect(bridge.middlewares).toBeInstanceOf(Array);
      expect(bridge.bridges).toBeInstanceOf(Map);
    });

    test('should initialize 4 default middlewares', () => {
      expect(bridge.middlewares).toHaveLength(4);
    });

    test('should override config with provided values', () => {
      const custom = new UnifiedBridge({
        enableRoots: false,
        enableDryRun: false,
        enableThinking: false,
        autoConfirmReadOnly: true
      });
      expect(custom.config.enableRoots).toBe(false);
      expect(custom.config.enableDryRun).toBe(false);
      expect(custom.config.enableThinking).toBe(false);
      expect(custom.config.autoConfirmReadOnly).toBe(true);
    });

    test('should handle partial config', () => {
      const custom = new UnifiedBridge({ enableRoots: false });
      expect(custom.config.enableRoots).toBe(false);
      expect(custom.config.enableDryRun).toBe(true);
    });
  });

  describe('addMiddleware', () => {
    test('should add middleware to array', () => {
      const mw = jest.fn();
      bridge.addMiddleware(mw);
      expect(bridge.middlewares).toHaveLength(5);
      expect(bridge.middlewares[4]).toBe(mw);
    });
  });

  describe('registerTool', () => {
    test('should register tool with annotation', () => {
      const handler = createHandler();
      bridge.registerTool('test_tool', {
        description: 'A test tool',
        inputSchema: { type: 'object', properties: { x: { type: 'string' } } },
        handler: handler,
        annotation: { readOnlyHint: true }
      });

      const tool = bridge.tools.get('test_tool');
      expect(tool.name).toBe('test_tool');
      expect(tool.description).toBe('A test tool');
      expect(tool.inputSchema).toEqual({ type: 'object', properties: { x: { type: 'string' } } });
      expect(tool.handler).toBe(handler);
      expect(tool.annotation.readOnlyHint).toBe(true);
    });

    test('should register tool with default annotation when not provided', () => {
      const handler = createHandler();
      bridge.registerTool('auto_tool', {
        description: '',
        inputSchema: {},
        handler: handler
      });

      const tool = bridge.tools.get('auto_tool');
      expect(tool.description).toBe('');
      expect(tool.annotation).toEqual(defaultAnnotation);
    });
  });

  describe('registerBridge', () => {
    test('should register bridge and its tools', () => {
      const handler = createHandler();
      const testBridge = {
        getTools: jest.fn().mockReturnValue([
          { name: 'bridge_tool_1', description: 'BT1', inputSchema: {}, handler: handler },
          { name: 'bridge_tool_2', description: 'BT2', inputSchema: {}, handler: handler }
        ])
      };
      bridge.registerBridge('my_bridge', testBridge);

      expect(bridge.bridges.get('my_bridge')).toBe(testBridge);
      expect(bridge.tools.has('bridge_tool_1')).toBe(true);
      expect(bridge.tools.has('bridge_tool_2')).toBe(true);
    });

    test('should handle bridge without getTools', () => {
      const testBridge = {};
      bridge.registerBridge('empty_bridge', testBridge);
      expect(bridge.bridges.get('empty_bridge')).toBe(testBridge);
      expect(bridge.tools.size).toBe(0);
    });
  });

  describe('callTool', () => {
    test('should return error for unknown tool', async () => {
      const result = await bridge.callTool('nonexistent');
      expect(result.error).toBe('TOOL_NOT_FOUND');
      expect(result.message).toContain('nonexistent');
      expect(result.availableTools).toBeInstanceOf(Array);
    });

    test('should execute tool handler through middleware chain', async () => {
      const handler = createHandler({ success: true, result: 42 });
      bridge.registerTool('compute', {
        description: 'Compute',
        inputSchema: {},
        handler: handler
      });

      const result = await bridge.callTool('compute', { x: 1 });
      expect(handler).toHaveBeenCalledWith({ x: 1 }, {
        dryRun: dryRunEngine,
        roots: rootsManager,
        thinking: thinkingChain
      });
      expect(result.success).toBe(true);
      expect(result.result).toBe(42);
    });

    test('should catch handler errors and return structured error', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Handler crashed'));
      bridge.registerTool('failing', {
        description: 'Failing tool',
        inputSchema: {},
        handler: handler
      });

      const result = await bridge.callTool('failing', {});
      expect(result.error).toBe('EXECUTION_ERROR');
      expect(result.message).toBe('Handler crashed');
      expect(result.tool).toBe('failing');
    });

    test('should preserve error code when available', async () => {
      const err = new Error('Bad request');
      err.code = 'VALIDATION_ERROR';
      const handler = jest.fn().mockRejectedValue(err);
      bridge.registerTool('failing2', {
        description: 'Failing tool 2',
        inputSchema: {},
        handler: handler
      });

      const result = await bridge.callTool('failing2', {});
      expect(result.error).toBe('VALIDATION_ERROR');
    });

    test('should mark recoverable based on idempotentHint', async () => {
      getAnnotation.mockReturnValue({ readOnlyHint: false, idempotentHint: true, destructiveHint: false });
      const handler = jest.fn().mockRejectedValue(new Error('fail'));
      bridge.registerTool('retryable', {
        description: 'Retryable',
        inputSchema: {},
        handler: handler,
        annotation: { idempotentHint: true }
      });

      const result = await bridge.callTool('retryable', {});
      expect(result.recoverable).toBe(true);
    });

    test('should include annotation metadata on result', async () => {
      const handler = createHandler({ data: 'test' });
      bridge.registerTool('meta_test', { description: '', inputSchema: {}, handler: handler });

      const result = await bridge.callTool('meta_test', {});
      expect(result._meta).toBeDefined();
      expect(result._meta.annotations).toEqual(defaultAnnotation);
      expect(result._meta.riskLevel).toBe('medium');
      expect(result._meta.timestamp).toBeDefined();
    });

    test('should skip annotation injection when result is null', async () => {
      const handler = jest.fn().mockResolvedValue(null);
      bridge.registerTool('null_result', { description: '', inputSchema: {}, handler: handler });

      const result = await bridge.callTool('null_result', {});
      expect(result).toBeNull();
    });

    test('should skip annotation injection when result has error', async () => {
      const handler = jest.fn().mockResolvedValue({ data: 'x', error: 'FORBIDDEN' });
      bridge.registerTool('err_result', { description: '', inputSchema: {}, handler: handler });

      const result = await bridge.callTool('err_result', {});
      expect(result.error).toBe('FORBIDDEN');
    });
  });

  describe('_needsPathValidation', () => {
    test('should return true for known path tools', () => {
      const pathTools = [
        'read_file', 'write_file', 'edit_file', 'delete_file',
        'read_text_file', 'read_media_file', 'list_directory',
        'create_directory', 'move_file', 'search_files'
      ];
      pathTools.forEach(function(name) {
        expect(bridge._needsPathValidation(name)).toBe(true);
      });
    });

    test('should return false for non-path tools', () => {
      expect(bridge._needsPathValidation('test_tool')).toBe(false);
      expect(bridge._needsPathValidation('search_code')).toBe(false);
      expect(bridge._needsPathValidation('create_issue')).toBe(false);
    });
  });

  describe('_generateDryRunPreview', () => {
    test('should generate edit_file preview', () => {
      const result = bridge._generateDryRunPreview('edit_file', { path: '/file', edits: [], _content: '' });
      expect(dryRunEngine.previewEdit).toHaveBeenCalledWith('/file', [], '');
      expect(result).toEqual({ preview: 'edit' });
    });

    test('should generate write_file preview', () => {
      bridge._generateDryRunPreview('write_file', { path: '/file', content: 'data' });
      expect(dryRunEngine.previewWrite).toHaveBeenCalledWith('/file', 'data');
    });

    test('should generate delete_file preview', () => {
      bridge._generateDryRunPreview('delete_file', { path: '/file' });
      expect(dryRunEngine.previewDelete).toHaveBeenCalledWith('/file');
    });

    test('should generate delete_directory preview', () => {
      bridge._generateDryRunPreview('delete_directory', { path: '/dir' });
      expect(dryRunEngine.previewDeleteDirectory).toHaveBeenCalledWith('/dir');
    });

    test('should generate create_issue preview', () => {
      const params = { title: 'Bug' };
      bridge._generateDryRunPreview('create_issue', params);
      expect(dryRunEngine.previewCreateIssue).toHaveBeenCalledWith(params);
    });

    test('should generate merge_pr preview', () => {
      const params = { prNumber: 5 };
      bridge._generateDryRunPreview('merge_pr', params);
      expect(dryRunEngine.previewMergePR).toHaveBeenCalledWith(params);
    });

    test('should generate delete_memo preview', () => {
      bridge._generateDryRunPreview('delete_memo', { memoId: '1', memoContent: 'text' });
      expect(dryRunEngine.previewDeleteMemo).toHaveBeenCalledWith('1', 'text');
    });

    test('should generate cdp_command preview', () => {
      bridge._generateDryRunPreview('cdp_command', { command: 'navigate', params: { url: 'x' } });
      expect(dryRunEngine.previewCdpCommand).toHaveBeenCalledWith('navigate', { url: 'x' });
    });

    test('should return generic preview for unknown tool', () => {
      const params = { x: 1 };
      const result = bridge._generateDryRunPreview('unknown_tool', params);
      expect(result).toEqual({
        _meta: { dryRun: true, preview: true, tool: 'unknown_tool' },
        params: params,
        confirmationNeeded: true,
        nextStep: 'Call again with dry_run=false to execute'
      });
    });
  });

  describe('_attachThinkingContext', () => {
    test('should add thought when chain exists and readOnly is false', () => {
      thinkingChain.getCurrentChain.mockReturnValue({ id: 'chain_1' });
      bridge._attachThinkingContext('write_file', { content: 'test' }, { success: true });

      expect(thinkingChain.addThought).toHaveBeenCalledWith(
        'chain_1',
        '执行操作: write_file',
        {
          reasoning: expect.any(String),
          metadata: { tool: 'write_file', success: true }
        }
      );
    });

    test('should skip when no chain', () => {
      thinkingChain.getCurrentChain.mockReturnValue(null);
      bridge._attachThinkingContext('write_file', {}, { success: true });
      expect(thinkingChain.addThought).not.toHaveBeenCalled();
    });

    test('should skip when annotation is readOnly', () => {
      getAnnotation.mockReturnValue(readOnlyAnnotation);
      thinkingChain.getCurrentChain.mockReturnValue({ id: 'chain_2' });
      bridge._attachThinkingContext('read_file', {}, { success: true });
      expect(thinkingChain.addThought).not.toHaveBeenCalled();
    });
  });

  describe('getTools', () => {
    test('should return array of registered tools', () => {
      const h1 = createHandler();
      const h2 = createHandler();
      bridge.registerTool('t1', { description: 'Tool 1', inputSchema: {}, handler: h1 });
      bridge.registerTool('t2', { description: 'Tool 2', inputSchema: {}, handler: h2 });

      const tools = bridge.getTools();
      expect(tools).toHaveLength(2);
      expect(tools[0]).toEqual({
        name: 't1',
        description: 'Tool 1',
        inputSchema: {},
        annotations: defaultAnnotation
      });
    });

    test('should return empty array when no tools', () => {
      expect(bridge.getTools()).toEqual([]);
    });
  });

  describe('getToolsAnnotated', () => {
    test('should pass tools through annotateTools', () => {
      bridge.registerTool('t1', { description: 'T1', inputSchema: {}, handler: createHandler() });
      const result = bridge.getToolsAnnotated();
      expect(annotateTools).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('getToolsByRiskLevel', () => {
    test('should filter tools by risk level', () => {
      bridge.registerTool('low_tool', {
        description: 'Low',
        inputSchema: {},
        handler: createHandler(),
        annotation: { riskLevel: 'low', readOnlyHint: false, idempotentHint: false, destructiveHint: false }
      });
      bridge.registerTool('high_tool', {
        description: 'High',
        inputSchema: {},
        handler: createHandler(),
        annotation: { riskLevel: 'high', readOnlyHint: false, idempotentHint: false, destructiveHint: true }
      });

      const highTools = bridge.getToolsByRiskLevel('high');
      expect(highTools).toHaveLength(1);
      expect(highTools[0].name).toBe('high_tool');

      const lowTools = bridge.getToolsByRiskLevel('low');
      expect(lowTools).toHaveLength(1);
      expect(lowTools[0].name).toBe('low_tool');
    });

    test('should return empty array when risk level not matched', () => {
      bridge.registerTool('t1', { description: 'T1', inputSchema: {}, handler: createHandler() });
      const result = bridge.getToolsByRiskLevel('critical');
      expect(result).toEqual([]);
    });

    test('should handle tools without annotations', () => {
      bridge.registerTool('no_ann', { description: '', inputSchema: {}, handler: createHandler() });
      const result = bridge.getToolsByRiskLevel('medium');
      expect(result).toEqual([]);
    });
  });

  describe('getSafeTools', () => {
    test('should return tools that are readOnly or idempotent', () => {
      bridge.registerTool('readonly_tool', {
        description: 'RO',
        inputSchema: {},
        handler: createHandler(),
        annotation: readOnlyAnnotation
      });
      bridge.registerTool('idempotent_tool', {
        description: 'Idem',
        inputSchema: {},
        handler: createHandler(),
        annotation: { readOnlyHint: false, idempotentHint: true, destructiveHint: false }
      });
      bridge.registerTool('danger_tool', {
        description: 'Danger',
        inputSchema: {},
        handler: createHandler(),
        annotation: destructiveAnnotation
      });

      const safeTools = bridge.getSafeTools();
      const names = safeTools.map(function(t) { return t.name; });
      expect(names).toContain('readonly_tool');
      expect(names).toContain('idempotent_tool');
      expect(names).not.toContain('danger_tool');
    });
  });

  describe('getDangerousTools', () => {
    test('should return tools with destructiveHint', () => {
      bridge.registerTool('safe', {
        description: 'Safe',
        inputSchema: {},
        handler: createHandler(),
        annotation: readOnlyAnnotation
      });
      bridge.registerTool('danger', {
        description: 'Danger',
        inputSchema: {},
        handler: createHandler(),
        annotation: destructiveAnnotation
      });

      const dangerous = bridge.getDangerousTools();
      expect(dangerous).toHaveLength(1);
      expect(dangerous[0].name).toBe('danger');
    });

    test('should return empty when no destructive tools', () => {
      bridge.registerTool('safe', {
        description: 'Safe',
        inputSchema: {},
        handler: createHandler(),
        annotation: readOnlyAnnotation
      });
      expect(bridge.getDangerousTools()).toEqual([]);
    });
  });
  describe('Middleware chain integration', () => {
    test('should enforce path validation for path tools', async () => {
      rootsManager.validateMiddleware.mockReturnValue({
        message: 'Path not allowed',
        code: 'RESTRICTED_PATH'
      });

      const handler = createHandler();
      bridge.registerTool('edit_file', {
        description: 'Edit',
        inputSchema: {},
        handler: handler
      });

      const result = await bridge.callTool('edit_file', { path: '/etc/passwd' });
      expect(result.error).toBe('PATH_VALIDATION_FAILED');
      expect(result.message).toBe('Path not allowed');
      expect(handler).not.toHaveBeenCalled();
    });

    test('should pass path validation when allowed', async () => {
      rootsManager.validateMiddleware.mockReturnValue(null);

      const handler = createHandler({ success: true });
      bridge.registerTool('edit_file', {
        description: 'Edit',
        inputSchema: {},
        handler: handler
      });

      const result = await bridge.callTool('edit_file', { path: '/safe/file' });
      expect(handler).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    test('should skip path validation when roots disabled', async () => {
      bridge = new UnifiedBridge({ enableRoots: false });

      const handler = createHandler({ ok: true });
      bridge.registerTool('edit_file', {
        description: 'Edit',
        inputSchema: {},
        handler: handler
      });

      await bridge.callTool('edit_file', { path: '/any' });
      expect(rootsManager.validateMiddleware).not.toHaveBeenCalled();
      expect(handler).toHaveBeenCalled();
    });

    test('should skip path validation for non-path tools', async () => {
      const handler = createHandler({ ok: true });
      bridge.registerTool('search_code', {
        description: 'Search',
        inputSchema: {},
        handler: handler
      });

      await bridge.callTool('search_code', { pattern: 'test' });
      expect(rootsManager.validateMiddleware).not.toHaveBeenCalled();
    });

    test('should return dry run preview when dry_run param is true', async () => {
      const handler = createHandler();
      bridge.registerTool('edit_file', {
        description: 'Edit',
        inputSchema: {},
        handler: handler
      });

      const result = await bridge.callTool('edit_file', { path: '/f', edits: [], _content: '', dry_run: true });
      expect(handler).not.toHaveBeenCalled();
      expect(result).toEqual({ preview: 'edit' });
    });

    test('should support dryRun as alternative param name', async () => {
      bridge.registerTool('write_file', {
        description: 'Write',
        inputSchema: {},
        handler: createHandler()
      });

      const result = await bridge.callTool('write_file', { path: '/f', content: 'x', dryRun: true });
      expect(result).toEqual({ preview: 'write' });
    });

    test('should skip dry run for readOnly tools', async () => {
      getAnnotation.mockReturnValue(readOnlyAnnotation);
      const handler = createHandler({ result: 'data' });
      bridge.registerTool('read_file', {
        description: 'Read',
        inputSchema: {},
        handler: handler,
        annotation: readOnlyAnnotation
      });

      await bridge.callTool('read_file', { path: '/f', dry_run: true });
      expect(handler).toHaveBeenCalled();
    });

    test('should skip dry run when dry_run param is false', async () => {
      const handler = createHandler({ result: 'ok' });
      bridge.registerTool('edit_file', {
        description: 'Edit',
        inputSchema: {},
        handler: handler
      });

      const result = await bridge.callTool('edit_file', { path: '/f', edits: [], _content: '', dry_run: false });
      expect(handler).toHaveBeenCalled();
      expect(result.result).toBe('ok');
    });

    test('should skip dry run when dryRun param is false', async () => {
      const handler = createHandler({ result: 'ok' });
      bridge.registerTool('edit_file', {
        description: 'Edit',
        inputSchema: {},
        handler: handler
      });

      const result = await bridge.callTool('edit_file', { path: '/f', edits: [], _content: '', dryRun: false });
      expect(handler).toHaveBeenCalled();
      expect(result.result).toBe('ok');
    });

    test('should add chainId when thinking enabled and chain exists', async () => {
      thinkingChain.getCurrentChain.mockReturnValue({ id: 'active_chain' });
      const handler = jest.fn().mockImplementation(function(params) {
        expect(params._chainId).toBe('active_chain');
        return { success: true };
      });
      bridge.registerTool('test_tool', {
        description: 'Test',
        inputSchema: {},
        handler: handler
      });

      const result = await bridge.callTool('test_tool', {});
      expect(result.success).toBe(true);
    });

    test('should skip chainId injection when thinking disabled', async () => {
      bridge = new UnifiedBridge({ enableThinking: false });
      thinkingChain.getCurrentChain.mockReturnValue({ id: 'ghost_chain' });

      const handler = jest.fn().mockResolvedValue({ success: true });
      bridge.registerTool('test_tool', {
        description: 'Test',
        inputSchema: {},
        handler: handler
      });

      await bridge.callTool('test_tool', {});
      expect(handler).toHaveBeenCalledWith({}, expect.any(Object));
      const params = handler.mock.calls[0][0];
      expect(params._chainId).toBeUndefined();
    });

    test('should attach thinking context after successful execution', async () => {
      thinkingChain.getCurrentChain.mockReturnValue({ id: 'chain_42' });
      const handler = createHandler({ data: 'hello' });
      bridge.registerTool('write_tool', {
        description: 'Write',
        inputSchema: {},
        handler: handler
      });

      await bridge.callTool('write_tool', { content: 'hello' });
      expect(thinkingChain.addThought).toHaveBeenCalled();
    });

    test('should not attach thinking context on error result', async () => {
      thinkingChain.getCurrentChain.mockReturnValue({ id: 'chain_43' });
      const handler = jest.fn().mockRejectedValue(new Error('execution failed'));
      bridge.registerTool('fail_tool', {
        description: 'Fail',
        inputSchema: {},
        handler: handler
      });

      await bridge.callTool('fail_tool', {});
      expect(thinkingChain.addThought).not.toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    test('should return health status', async () => {
      rootsManager.getRoots.mockReturnValue([{ path: '/root' }]);
      rootsManager.getAllowedPrefixes.mockReturnValue(['/root']);
      thinkingChain.listChains.mockReturnValue([
        { id: 'c1', status: 'in_progress' },
        { id: 'c2', status: 'completed' }
      ]);

      const status = await bridge.healthCheck();

      expect(status.bridge).toBe('healthy');
      expect(status.tools.total).toBe(0);
      expect(status.roots.configured).toBe(1);
      expect(status.roots.allowed).toEqual(['/root']);
      expect(status.thinking.activeChains).toBe(1);
      expect(status.thinking.totalChains).toBe(2);
      expect(status.middlewares.count).toBe(4);
      expect(status.middlewares.enabled.roots).toBe(true);
    });

    test('should report filtered chain counts', async () => {
      thinkingChain.listChains.mockReturnValue([
        { id: 'a', status: 'in_progress' },
        { id: 'b', status: 'in_progress' },
        { id: 'c', status: 'completed' },
        { id: 'd', status: 'failed' }
      ]);

      const status = await bridge.healthCheck();
      expect(status.thinking.activeChains).toBe(2);
      expect(status.thinking.totalChains).toBe(4);
    });

    test('should compute tool risk breakdown', async () => {
      bridge.registerTool('safe_tool', {
        description: 'Safe',
        inputSchema: {},
        handler: createHandler(),
        annotation: readOnlyAnnotation
      });

      const status = await bridge.healthCheck();
      expect(status.tools.total).toBe(1);
      expect(status.tools.byRisk.safe).toBe(1);
    });
  });

  describe('getMetrics', () => {
    test('should return metrics from all dependencies', () => {
      dryRunEngine.getHistory.mockReturnValue([{ tool: 'edit_file' }]);
      thinkingChain.listChains.mockReturnValue([{ id: 'c1' }]);

      const handler = createHandler();
      bridge.registerTool('t1', {
        description: 'T1',
        inputSchema: {},
        handler: handler,
        annotation: { readOnlyHint: true }
      });

      const metrics = bridge.getMetrics();
      expect(metrics.tools.total).toBe(1);
      expect(metrics.tools.annotated).toBe(1);
      expect(metrics.dryRun.historyCount).toBe(1);
      expect(metrics.thinking.chains).toBe(1);
    });

    test('should report zero metrics when no activity', () => {
      const metrics = bridge.getMetrics();
      expect(metrics.tools.total).toBe(0);
      expect(metrics.tools.annotated).toBe(0);
      expect(metrics.dryRun.historyCount).toBe(0);
      expect(metrics.thinking.chains).toBe(0);
    });
  });
});
