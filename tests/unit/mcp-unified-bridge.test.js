jest.mock('../../src/mcp/engines/RootsManager', () => ({
  rootsManager: {
    validateMiddleware: jest.fn(),
    getRoots: jest.fn(() => ['/workspace']),
    getAllowedPrefixes: jest.fn(() => ['/workspace'])
  }
}));

jest.mock('../../src/mcp/engines/DryRunEngine', () => ({
  dryRunEngine: {
    previewEdit: jest.fn(),
    previewWrite: jest.fn(),
    previewDelete: jest.fn(),
    previewDeleteDirectory: jest.fn(),
    previewCreateIssue: jest.fn(),
    previewMergePR: jest.fn(),
    previewDeleteMemo: jest.fn(),
    previewCdpCommand: jest.fn(),
    getHistory: jest.fn(() => [])
  }
}));

jest.mock('../../src/mcp/engines/ThinkingChain', () => ({
  thinkingChain: {
    getCurrentChain: jest.fn(),
    addThought: jest.fn(),
    listChains: jest.fn(() => [])
  }
}));

jest.mock('../../src/mcp/engines/ToolAnnotations', () => ({
  getAnnotation: jest.fn(() => ({ readOnlyHint: false, idempotentHint: false, destructiveHint: false })),
  getRiskLevel: jest.fn(() => 'low'),
  annotateTools: jest.fn((tools) => tools.map((t) => ({ ...t, annotations: { riskLevel: 'low' } })))
}));

const { rootsManager } = require('../../src/mcp/engines/RootsManager');
const { dryRunEngine } = require('../../src/mcp/engines/DryRunEngine');
const { thinkingChain } = require('../../src/mcp/engines/ThinkingChain');
const { getAnnotation, getRiskLevel, annotateTools } = require('../../src/mcp/engines/ToolAnnotations');
const { UnifiedBridge } = require('../../src/mcp/UnifiedBridge');

describe('UnifiedBridge', () => {
  let bridge;

  beforeEach(() => {
    jest.clearAllMocks();
    bridge = new UnifiedBridge({ enableRoots: true, enableDryRun: true, enableThinking: true, autoConfirmReadOnly: true });
  });

  describe('constructor', () => {
    it('should apply default config values', () => {
      const b = new UnifiedBridge();
      expect(b.config.enableRoots).toBe(true);
      expect(b.config.enableDryRun).toBe(true);
      expect(b.config.enableThinking).toBe(true);
      expect(b.config.autoConfirmReadOnly).toBe(false);
    });

    it('should override defaults with provided config', () => {
      const b = new UnifiedBridge({ enableRoots: false, enableDryRun: false });
      expect(b.config.enableRoots).toBe(false);
      expect(b.config.enableDryRun).toBe(false);
      expect(b.config.enableThinking).toBe(true);
    });

    it('should initialize empty collections', () => {
      expect(bridge.tools).toBeInstanceOf(Map);
      expect(bridge.middlewares).toBeInstanceOf(Array);
      expect(bridge.bridges).toBeInstanceOf(Map);
    });

    it('should initialize default middlewares', () => {
      expect(bridge.middlewares.length).toBe(4);
    });
  });

  describe('_initDefaultMiddlewares', () => {
    it('should add 4 middlewares by default', () => {
      const b = new UnifiedBridge();
      expect(b.middlewares.length).toBe(4);
    });

    it('should include path validation, dry-run, thinking, and annotation injection', () => {
      const b = new UnifiedBridge({ enableRoots: false, enableDryRun: false, enableThinking: false });
      expect(b.middlewares.length).toBe(4);
    });
  });

  describe('addMiddleware', () => {
    it('should append middleware to list', () => {
      const fn = jest.fn();
      bridge.addMiddleware(fn);
      expect(bridge.middlewares).toContain(fn);
    });
  });

  describe('registerTool', () => {
    it('should store tool definition with defaults', () => {
      const handler = jest.fn();
      bridge.registerTool('test_tool', { description: 'A test', inputSchema: { x: { type: 'string' } }, handler });
      const tool = bridge.tools.get('test_tool');
      expect(tool.name).toBe('test_tool');
      expect(tool.description).toBe('A test');
      expect(tool.handler).toBe(handler);
      expect(tool.annotation).toBeDefined();
    });

    it('should store annotation from tool definition when provided', () => {
      const handler = jest.fn();
      const ann = { readOnlyHint: true };
      bridge.registerTool('test_tool', { handler, annotation: ann });
      expect(bridge.tools.get('test_tool').annotation).toBe(ann);
    });

    it('should use getAnnotation for default annotation', () => {
      getAnnotation.mockReturnValue({ readOnlyHint: true });
      bridge.registerTool('unknown_tool', { handler: jest.fn() });
      expect(getAnnotation).toHaveBeenCalledWith('unknown_tool');
    });
  });

  describe('registerBridge', () => {
    it('should store bridge and register its tools', () => {
      const mockBridge = {
        getTools: () => [
          { name: 'tool1', description: 'T1', inputSchema: {} }
        ]
      };
      bridge.registerBridge('test', mockBridge);
      expect(bridge.bridges.get('test')).toBe(mockBridge);
      expect(bridge.tools.has('tool1')).toBe(true);
    });

    it('should handle bridge without getTools', () => {
      const mockBridge = {};
      bridge.registerBridge('empty', mockBridge);
      expect(bridge.bridges.get('empty')).toBe(mockBridge);
    });
  });

  describe('callTool', () => {
    it('should return error for unknown tool', async () => {
      const result = await bridge.callTool('nonexistent');
      expect(result.error).toBe('TOOL_NOT_FOUND');
      expect(result.message).toContain('nonexistent');
    });

    it('should execute tool handler through middleware chain', async () => {
      const handler = jest.fn().mockResolvedValue({ success: true });
      bridge.registerTool('my_tool', { handler });
      const result = await bridge.callTool('my_tool', { foo: 'bar' });
      expect(result.success).toBe(true);
      expect(handler).toHaveBeenCalledWith({ foo: 'bar' }, expect.objectContaining({
        dryRun: dryRunEngine, roots: rootsManager, thinking: thinkingChain
      }));
    });

    it('should catch handler errors and return error object', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Oops'));
      bridge.registerTool('bad_tool', { handler });
      const result = await bridge.callTool('bad_tool');
      expect(result.error).toBe('EXECUTION_ERROR');
      expect(result.message).toBe('Oops');
    });

    it('should use error.code when available', async () => {
      const err = new Error('Nope');
      err.code = 'CUSTOM_ERR';
      const handler = jest.fn().mockRejectedValue(err);
      bridge.registerTool('err_tool', { handler });
      const result = await bridge.callTool('err_tool');
      expect(result.error).toBe('CUSTOM_ERR');
    });

    it('should include recoverable flag based on idempotentHint', async () => {
      getAnnotation.mockReturnValue({ idempotentHint: true });
      const handler = jest.fn().mockRejectedValue(new Error('Fail'));
      bridge.registerTool('recoverable_tool', { handler });
      const result = await bridge.callTool('recoverable_tool');
      expect(result.recoverable).toBe(true);
    });

    it('should include available tools in not-found error', async () => {
      bridge.registerTool('existing', { handler: jest.fn() });
      const result = await bridge.callTool('ghost');
      expect(result.availableTools).toContain('existing');
    });
  });

  describe('_buildMiddlewareChain', () => {
    it('should execute middlewares in order', async () => {
      const order = [];
      bridge.addMiddleware(async (name, params, next) => {
        order.push('mw1');
        return next();
      });
      bridge.addMiddleware(async (name, params, next) => {
        order.push('mw2');
        return next();
      });
      const handler = jest.fn().mockResolvedValue('done');
      bridge.registerTool('ordered', { handler });

      await bridge.callTool('ordered');
      expect(order).toEqual(['mw1', 'mw2']);
    });

    it('should short-circuit when middleware returns early', async () => {
      bridge = new UnifiedBridge({ enableRoots: false, enableDryRun: false, enableThinking: false });
      bridge.addMiddleware(async () => ({ early: 'return' }));
      const handler = jest.fn();
      bridge.registerTool('short', { handler });
      const result = await bridge.callTool('short');
      expect(result.early).toBe('return');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('_needsPathValidation', () => {
    it('should return true for file system tool names', () => {
      expect(bridge._needsPathValidation('read_file')).toBe(true);
      expect(bridge._needsPathValidation('write_file')).toBe(true);
      expect(bridge._needsPathValidation('edit_file')).toBe(true);
      expect(bridge._needsPathValidation('delete_file')).toBe(true);
      expect(bridge._needsPathValidation('search_files')).toBe(true);
    });

    it('should return false for non-file tools', () => {
      expect(bridge._needsPathValidation('create_issue')).toBe(false);
      expect(bridge._needsPathValidation('unknown')).toBe(false);
    });
  });

  describe('_generateDryRunPreview', () => {
    it('should generate edit_file preview', () => {
      dryRunEngine.previewEdit.mockReturnValue({ preview: 'edit' });
      const result = bridge._generateDryRunPreview('edit_file', { path: 'f', edits: [], _content: 'c' });
      expect(result).toEqual({ preview: 'edit' });
      expect(dryRunEngine.previewEdit).toHaveBeenCalledWith('f', [], 'c');
    });

    it('should generate write_file preview', () => {
      dryRunEngine.previewWrite.mockReturnValue({ preview: 'write' });
      const result = bridge._generateDryRunPreview('write_file', { path: 'f', content: 'c' });
      expect(result).toEqual({ preview: 'write' });
    });

    it('should generate delete_file preview', () => {
      dryRunEngine.previewDelete.mockReturnValue({ preview: 'delete' });
      const result = bridge._generateDryRunPreview('delete_file', { path: 'f' });
      expect(result).toEqual({ preview: 'delete' });
    });

    it('should generate delete_directory preview', () => {
      dryRunEngine.previewDeleteDirectory.mockReturnValue({ preview: 'rmdir' });
      const result = bridge._generateDryRunPreview('delete_directory', { path: 'd' });
      expect(result).toEqual({ preview: 'rmdir' });
    });

    it('should generate create_issue preview', () => {
      dryRunEngine.previewCreateIssue.mockReturnValue({ preview: 'issue' });
      const result = bridge._generateDryRunPreview('create_issue', {});
      expect(result).toEqual({ preview: 'issue' });
    });

    it('should generate merge_pr preview', () => {
      dryRunEngine.previewMergePR.mockReturnValue({ preview: 'merge' });
      const result = bridge._generateDryRunPreview('merge_pr', {});
      expect(result).toEqual({ preview: 'merge' });
    });

    it('should generate delete_memo preview', () => {
      dryRunEngine.previewDeleteMemo.mockReturnValue({ preview: 'memo' });
      const result = bridge._generateDryRunPreview('delete_memo', { memoId: 'm1', memoContent: 'c' });
      expect(result).toEqual({ preview: 'memo' });
      expect(dryRunEngine.previewDeleteMemo).toHaveBeenCalledWith('m1', 'c');
    });

    it('should generate cdp_command preview', () => {
      dryRunEngine.previewCdpCommand.mockReturnValue({ preview: 'cdp' });
      const result = bridge._generateDryRunPreview('cdp_command', { command: 'Nav', params: {} });
      expect(result).toEqual({ preview: 'cdp' });
    });

    it('should return generic preview for unknown tools', () => {
      const result = bridge._generateDryRunPreview('unknown', { a: 1 });
      expect(result._meta.dryRun).toBe(true);
      expect(result._meta.preview).toBe(true);
      expect(result.confirmationNeeded).toBe(true);
      expect(result.nextStep).toContain('dry_run=false');
    });
  });

  describe('_attachThinkingContext', () => {
    it('should add thought when chain exists and tool is not read-only', () => {
      thinkingChain.getCurrentChain.mockReturnValue({ id: 'ch-1' });
      getAnnotation.mockReturnValue({ readOnlyHint: false });
      bridge._attachThinkingContext('write_file', { path: 'test' }, { success: true });
      expect(thinkingChain.addThought).toHaveBeenCalledWith('ch-1', expect.stringContaining('write_file'), expect.any(Object));
    });

    it('should skip when no active chain', () => {
      thinkingChain.getCurrentChain.mockReturnValue(null);
      bridge._attachThinkingContext('test', {}, {});
      expect(thinkingChain.addThought).not.toHaveBeenCalled();
    });

    it('should skip for read-only tools', () => {
      thinkingChain.getCurrentChain.mockReturnValue({ id: 'ch-1' });
      getAnnotation.mockReturnValue({ readOnlyHint: true });
      bridge._attachThinkingContext('read_file', {}, { success: true });
      expect(thinkingChain.addThought).not.toHaveBeenCalled();
    });
  });

  describe('getTools', () => {
    it('should return all registered tools with annotations', () => {
      bridge.registerTool('a', { description: 'A', inputSchema: {}, handler: jest.fn() });
      bridge.registerTool('b', { description: 'B', inputSchema: {}, handler: jest.fn() });
      const tools = bridge.getTools();
      expect(tools).toHaveLength(2);
      expect(tools[0]).toHaveProperty('annotations');
    });
  });

  describe('getToolsAnnotated', () => {
    it('should call annotateTools on getTools result', () => {
      bridge.registerTool('x', { handler: jest.fn() });
      bridge.getToolsAnnotated();
      expect(annotateTools).toHaveBeenCalled();
    });
  });

  describe('getToolsByRiskLevel', () => {
    it('should filter tools matching the risk level', () => {
      getAnnotation.mockReturnValue({ riskLevel: 'high', destructiveHint: true });
      bridge.registerTool('high_risk', { handler: jest.fn() });
      getAnnotation.mockReturnValue({ riskLevel: 'low', destructiveHint: false });
      bridge.registerTool('low_risk', { handler: jest.fn() });

      const high = bridge.getToolsByRiskLevel('high');
      expect(high).toHaveLength(1);
      expect(high[0].name).toBe('high_risk');
    });
  });

  describe('getSafeTools', () => {
    it('should return read-only or idempotent non-destructive tools', () => {
      getAnnotation.mockReturnValue({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
      bridge.registerTool('read_only', { handler: jest.fn() });
      getAnnotation.mockReturnValue({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
      bridge.registerTool('idempotent', { handler: jest.fn() });
      getAnnotation.mockReturnValue({ readOnlyHint: false, destructiveHint: true, idempotentHint: false });
      bridge.registerTool('dangerous', { handler: jest.fn() });
      getAnnotation.mockReturnValue({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
      bridge.registerTool('neither', { handler: jest.fn() });

      const safe = bridge.getSafeTools();
      const names = safe.map((t) => t.name);
      expect(names).toContain('read_only');
      expect(names).toContain('idempotent');
      expect(names).not.toContain('dangerous');
      expect(names).not.toContain('neither');
    });
  });

  describe('getDangerousTools', () => {
    it('should return tools with destructiveHint', () => {
      getAnnotation.mockReturnValue({ destructiveHint: true });
      bridge.registerTool('danger', { handler: jest.fn() });
      getAnnotation.mockReturnValue({ destructiveHint: false });
      bridge.registerTool('safe', { handler: jest.fn() });

      const dangerous = bridge.getDangerousTools();
      expect(dangerous).toHaveLength(1);
      expect(dangerous[0].name).toBe('danger');
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status with counts', async () => {
      getAnnotation.mockReturnValue({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
      bridge.registerTool('t1', { handler: jest.fn() });
      rootsManager.getRoots.mockReturnValue(['/a', '/b']);
      thinkingChain.listChains.mockReturnValue([]);

      const result = await bridge.healthCheck();
      expect(result.bridge).toBe('healthy');
      expect(result.tools.total).toBe(1);
      expect(result.tools.byRisk.safe).toBe(1);
      expect(result.roots.configured).toBe(2);
      expect(result.middlewares.enabled.roots).toBe(true);
    });
  });

  describe('getMetrics', () => {
    it('should return metrics with counts', () => {
      bridge.registerTool('t1', { handler: jest.fn(), annotation: { readOnlyHint: true } });
      bridge.registerTool('t2', { handler: jest.fn() });
      dryRunEngine.getHistory.mockReturnValue(['h1']);
      thinkingChain.listChains.mockReturnValue([{ id: 'c1' }]);

      const result = bridge.getMetrics();
      expect(result.tools.total).toBe(2);
      expect(result.tools.annotated).toBe(2);
      expect(result.dryRun.historyCount).toBe(1);
      expect(result.thinking.chains).toBe(1);
    });
  });

  describe('middleware integration', () => {
    it('should skip path validation when enableRoots is false', async () => {
      bridge = new UnifiedBridge({ enableRoots: false, enableDryRun: false, enableThinking: false });
      const handler = jest.fn().mockResolvedValue('ok');
      bridge.registerTool('write_file', { handler });
      await bridge.callTool('write_file', { path: 'unsafe' });
      expect(rootsManager.validateMiddleware).not.toHaveBeenCalled();
    });

    it('should return path validation error from roots middleware', async () => {
      bridge = new UnifiedBridge({ enableRoots: true, enableDryRun: false, enableThinking: false });
      const handler = jest.fn().mockResolvedValue('ok');
      bridge.registerTool('write_file', { handler });
      rootsManager.validateMiddleware.mockReturnValue({ message: 'Path not allowed', code: 'ACCESS_DENIED' });

      const result = await bridge.callTool('write_file', { path: 'bad' });
      expect(result.error).toBe('PATH_VALIDATION_FAILED');
      expect(result.message).toBe('Path not allowed');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should intercept dryRun in dry-run middleware', async () => {
      getAnnotation.mockReturnValue({ readOnlyHint: false });
      bridge = new UnifiedBridge({ enableRoots: false, enableDryRun: true, enableThinking: false });
      const handler = jest.fn().mockResolvedValue('executed');
      bridge.registerTool('write_file', { handler });
      dryRunEngine.previewWrite.mockReturnValue({ preview: true });

      const result = await bridge.callTool('write_file', { path: 'f', content: 'c', dry_run: true });
      expect(result.preview).toBe(true);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should skip dry-run for read-only tools', async () => {
      getAnnotation.mockReturnValue({ readOnlyHint: true });
      bridge = new UnifiedBridge({ enableRoots: false, enableDryRun: true, enableThinking: false });
      const handler = jest.fn().mockResolvedValue({ status: 'ok' });
      bridge.registerTool('read_text_file', { handler });

      const result = await bridge.callTool('read_text_file', { path: 'f', dry_run: true });
      expect(result.status).toBe('ok');
      expect(handler).toHaveBeenCalled();
    });

    it('should inject chain ID when thinking is enabled and chain exists', async () => {
      getAnnotation.mockReturnValue({ readOnlyHint: false });
      bridge = new UnifiedBridge({ enableRoots: false, enableDryRun: false, enableThinking: true });
      thinkingChain.getCurrentChain.mockReturnValue({ id: 'chain-42' });
      const handler = jest.fn().mockResolvedValue({ success: true });
      bridge.registerTool('my_tool', { handler });

      await bridge.callTool('my_tool', { x: 1 });
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ x: 1, _chainId: 'chain-42' }),
        expect.any(Object)
      );
    });

    it('should attach thinking context after execution', async () => {
      getAnnotation.mockReturnValue({ readOnlyHint: false });
      bridge = new UnifiedBridge({ enableRoots: false, enableDryRun: false, enableThinking: true });
      thinkingChain.getCurrentChain.mockReturnValue({ id: 'ch-1' });
      const handler = jest.fn().mockResolvedValue({ result: 'ok' });
      bridge.registerTool('my_tool', { handler });

      await bridge.callTool('my_tool', {});
      expect(thinkingChain.addThought).toHaveBeenCalled();
    });

    it('should inject annotations into result._meta', async () => {
      getAnnotation.mockReturnValue({ readOnlyHint: true, destructiveHint: false });
      getRiskLevel.mockReturnValue('low');
      bridge = new UnifiedBridge({ enableRoots: false, enableDryRun: false, enableThinking: false });
      const handler = jest.fn().mockResolvedValue({ data: 'hello' });
      bridge.registerTool('anno_tool', { handler });

      const result = await bridge.callTool('anno_tool', {});
      expect(result._meta.annotations).toBeDefined();
      expect(result._meta.riskLevel).toBe('low');
      expect(result._meta.timestamp).toBeDefined();
    });
  });
});
