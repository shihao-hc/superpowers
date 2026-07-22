const { EventEmitter } = require('events');
const { MCPNodeManager } = require('../../src/mcp/MCPNodeManager');

function makeTool(overrides = {}) {
  return {
    name: overrides.name || 'read_file',
    fullName: overrides.fullName || 'filesystem:read_file',
    serverName: overrides.serverName || 'filesystem',
    description: overrides.description || 'Read a file',
    inputSchema: overrides.inputSchema || {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' }
      },
      required: ['path']
    },
    tags: overrides.tags || ['fs', 'read'],
    ...overrides
  };
}

class MockRegistry extends EventEmitter {
  constructor() {
    super();
    this._tools = [];
  }

  setTools(tools) {
    this._tools = tools;
  }

  getTools() {
    return this._tools;
  }

  validateParams(_fullName, _params) {
    return { valid: true, errors: [] };
  }
}

class MockBridge {
  constructor() {
    this.call = jest.fn();
    this.batchCall = jest.fn();
  }
}

class MockWorkflowEngine {
  constructor() {
    this.registeredTypes = {};
  }

  registerNodeType(nodeType, config) {
    this.registeredTypes[nodeType] = config;
  }
}

describe('MCPNodeManager', () => {
  let manager;
  let bridge;
  let registry;
  let engine;

  beforeEach(() => {
    bridge = new MockBridge();
    registry = new MockRegistry();
    engine = new MockWorkflowEngine();
    manager = new MCPNodeManager(bridge, registry);
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(manager.bridge).toBe(bridge);
      expect(manager.registry).toBe(registry);
      expect(manager.options.nodePrefix).toBe('mcp');
      expect(manager.options.category).toBe('MCP');
      expect(manager.options.enableBatching).toBe(true);
      expect(manager.registeredNodes).toBeInstanceOf(Map);
      expect(manager.registeredNodes.size).toBe(0);
      expect(manager.workflowEngine).toBeNull();
    });

    it('should initialize with custom options', () => {
      const custom = new MCPNodeManager(bridge, registry, {
        nodePrefix: 'custom',
        category: 'CustomCat',
        enableBatching: false
      });
      expect(custom.options.nodePrefix).toBe('custom');
      expect(custom.options.category).toBe('CustomCat');
      expect(custom.options.enableBatching).toBe(false);
      custom.destroy();
    });
  });

  describe('registerToEngine', () => {
    it('should register all tools to the engine', () => {
      const tool1 = makeTool({ name: 'read_file', fullName: 'filesystem:read_file' });
      const tool2 = makeTool({ name: 'write_file', fullName: 'filesystem:write_file' });
      registry.setTools([tool1, tool2]);

      const registered = jest.fn();
      manager.on('registered-to-engine', registered);

      manager.registerToEngine(engine);

      expect(manager.workflowEngine).toBe(engine);
      expect(manager.registeredNodes.size).toBe(2);
      expect(engine.registeredTypes['mcp.filesystem.read_file']).toBeDefined();
      expect(engine.registeredTypes['mcp.filesystem.write_file']).toBeDefined();
      expect(registered).toHaveBeenCalledWith({ nodeCount: 2 });
    });

    it('should set up refreshed listener on registry', () => {
      const tool1 = makeTool({ name: 'read_file', fullName: 'filesystem:read_file' });
      registry.setTools([tool1]);
      manager.registerToEngine(engine);

      const tool2 = makeTool({ name: 'write_file', fullName: 'filesystem:write_file' });
      registry.setTools([tool1, tool2]);

      expect(manager.registeredNodes.size).toBe(1);

      registry.emit('refreshed');

      expect(manager.registeredNodes.size).toBe(2);
    });

    it('should work without workflowEngine', () => {
      const tool1 = makeTool({ name: 'read_file', fullName: 'filesystem:read_file' });
      registry.setTools([tool1]);

      manager.registerToEngine(null);

      expect(manager.registeredNodes.size).toBe(1);
      expect(manager.workflowEngine).toBeNull();
    });
  });

  describe('_registerToolAsNode', () => {
    it('should skip already registered nodes', () => {
      const tool = makeTool();
      manager._registerToolAsNode(tool);
      manager._registerToolAsNode(tool);
      expect(manager.registeredNodes.size).toBe(1);
    });

    it('should register node without workflowEngine', () => {
      const tool = makeTool({ name: 'read_file', fullName: 'filesystem:read_file' });
      const emitted = jest.fn();
      manager.on('node-registered', emitted);

      manager._registerToolAsNode(tool);

      expect(manager.registeredNodes.size).toBe(1);
      expect(emitted).toHaveBeenCalledWith({
        nodeType: 'mcp.filesystem.read_file',
        toolName: 'filesystem:read_file'
      });
    });

    it('should handle tool with minimal data', () => {
      const tool = makeTool({
        name: 'minimal',
        fullName: 'test:minimal',
        serverName: 'test',
        description: undefined,
        inputSchema: undefined,
        tags: undefined
      });

      manager._registerToolAsNode(tool);

      const nodes = manager.getRegisteredNodes();
      expect(nodes.length).toBe(1);
      expect(nodes[0].description).toBe('MCP tool: test:minimal');
      expect(nodes[0].metadata.tags).toBeUndefined();
    });
  });

  describe('_createExecutor', () => {
    beforeEach(() => {
      const tool = makeTool({ name: 'read_file', fullName: 'filesystem:read_file' });
      registry.setTools([tool]);
      manager.registerToEngine(engine);
    });

    it('should execute tool successfully and emit events', async () => {
      bridge.call.mockResolvedValue({ content: 'file content' });

      const startSpy = jest.fn();
      const completeSpy = jest.fn();
      manager.on('execution-start', startSpy);
      manager.on('execution-complete', completeSpy);

      const nodeConfig = manager.getRegisteredNodes()[0];
      const result = await nodeConfig.execute(
        { id: 'node-1' },
        { path: '/test/file.txt' },
        null
      );

      expect(bridge.call).toHaveBeenCalledWith(
        'filesystem:read_file',
        { path: '/test/file.txt' },
        expect.objectContaining({ traceId: expect.any(String) })
      );
      expect(result).toEqual({
        result: { content: 'file content' },
        success: true,
        error: null
      });
      expect(startSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          nodeId: 'node-1',
          toolFullName: 'filesystem:read_file'
        })
      );
      expect(completeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          nodeId: 'node-1',
          toolFullName: 'filesystem:read_file',
          duration: expect.any(Number)
        })
      );
    });

    it('should emit execution-error on validation failure', async () => {
      registry.validateParams = jest.fn().mockReturnValue({
        valid: false,
        errors: [{ message: 'path is required' }]
      });

      const errorSpy = jest.fn();
      manager.on('execution-error', errorSpy);

      const nodeConfig = manager.getRegisteredNodes()[0];

      await expect(
        nodeConfig.execute({ id: 'node-1' }, {}, null)
      ).rejects.toThrow('Parameter validation failed: path is required');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          nodeId: 'node-1',
          toolFullName: 'filesystem:read_file',
          error: 'Parameter validation failed: path is required'
        })
      );
    });

    it('should emit execution-error on bridge call failure', async () => {
      const bridgeError = new Error('Connection refused');
      bridge.call.mockRejectedValue(bridgeError);

      const errorSpy = jest.fn();
      manager.on('execution-error', errorSpy);

      const nodeConfig = manager.getRegisteredNodes()[0];

      await expect(
        nodeConfig.execute({ id: 'node-1' }, { path: '/test.txt' }, null)
      ).rejects.toThrow('Connection refused');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          nodeId: 'node-1',
          toolFullName: 'filesystem:read_file',
          error: 'Connection refused'
        })
      );
    });
  });

  describe('_extractInputs', () => {
    it('should return fallback input when no inputSchema', () => {
      const tool = makeTool({ inputSchema: undefined });
      const inputs = manager._extractInputs(tool);
      expect(inputs).toEqual([{ name: 'params', type: 'object', description: 'Tool parameters' }]);
    });

    it('should return fallback when no properties', () => {
      const tool = makeTool({ inputSchema: { type: 'object' } });
      const inputs = manager._extractInputs(tool);
      expect(inputs).toEqual([{ name: 'params', type: 'object', description: 'Tool parameters' }]);
    });

    it('should extract inputs from schema properties', () => {
      const tool = makeTool({
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' },
            recursive: { type: 'boolean' }
          },
          required: ['path']
        }
      });
      const inputs = manager._extractInputs(tool);
      expect(inputs).toEqual([
        { name: 'path', type: 'string', description: 'File path', required: true, default: undefined },
        { name: 'recursive', type: 'boolean', description: 'recursive', required: false, default: undefined }
      ]);
    });

    it('should handle default values', () => {
      const tool = makeTool({
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path', default: '/' },
            depth: { type: 'integer', description: 'Depth', default: 3 }
          },
          required: []
        }
      });
      const inputs = manager._extractInputs(tool);
      expect(inputs).toEqual([
        { name: 'path', type: 'string', description: 'Path', required: false, default: '/' },
        { name: 'depth', type: 'number', description: 'Depth', required: false, default: 3 }
      ]);
    });

    it('should handle missing required field in schema', () => {
      const tool = makeTool({
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' }
          }
        }
      });
      const inputs = manager._extractInputs(tool);
      expect(inputs).toEqual([
        { name: 'path', type: 'string', description: 'File path', required: false, default: undefined }
      ]);
    });
  });

  describe('_extractOutputs', () => {
    it('should return fixed outputs regardless of tool', () => {
      const outputs = manager._extractOutputs(makeTool());
      expect(outputs).toEqual([
        { name: 'result', type: 'any', description: 'Tool execution result' },
        { name: 'success', type: 'boolean', description: 'Whether the tool executed successfully' },
        { name: 'error', type: 'string', description: 'Error message if execution failed' }
      ]);
    });
  });

  describe('_mapInputsToParams', () => {
    it('should map inputs to params based on schema', () => {
      const tool = makeTool({
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            recursive: { type: 'boolean' }
          }
        }
      });
      const result = manager._mapInputsToParams(
        { path: '/test', recursive: true, extra: 'ignored' },
        tool
      );
      expect(result).toEqual({ path: '/test', recursive: true });
    });

    it('should handle missing optional params gracefully', () => {
      const tool = makeTool({
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            recursive: { type: 'boolean' }
          }
        }
      });
      const result = manager._mapInputsToParams({ path: '/test' }, tool);
      expect(result).toEqual({ path: '/test' });
    });

    it('should return inputs.params when no schema', () => {
      const tool = makeTool({ inputSchema: undefined });
      const result = manager._mapInputsToParams({ params: { raw: 'data' } }, tool);
      expect(result).toEqual({ raw: 'data' });
    });

    it('should return empty object when no schema and no params', () => {
      const tool = makeTool({ inputSchema: undefined });
      const result = manager._mapInputsToParams({}, tool);
      expect(result).toEqual({});
    });
  });

  describe('_formatOutput', () => {
    it('should handle null result', () => {
      expect(manager._formatOutput(null, makeTool())).toEqual({
        result: null, success: true, error: null
      });
    });

    it('should handle undefined result', () => {
      expect(manager._formatOutput(undefined, makeTool())).toEqual({
        result: null, success: true, error: null
      });
    });

    it('should handle object result', () => {
      const obj = { content: 'data', size: 100 };
      expect(manager._formatOutput(obj, makeTool())).toEqual({
        result: obj, success: true, error: null
      });
    });

    it('should handle primitive result', () => {
      expect(manager._formatOutput('plain string', makeTool())).toEqual({
        result: 'plain string', success: true, error: null
      });
    });
  });

  describe('_toolToNodeType', () => {
    it('should convert tool name to node type', () => {
      expect(manager._toolToNodeType('filesystem:read_file')).toBe('mcp.filesystem.read_file');
    });

    it('should handle custom prefix', () => {
      const custom = new MCPNodeManager(bridge, registry, { nodePrefix: 'custom' });
      expect(custom._toolToNodeType('github:list_issues')).toBe('custom.github.list_issues');
      custom.destroy();
    });
  });

  describe('_nodeTypeToTool', () => {
    it('should convert node type to tool name', () => {
      expect(manager._nodeTypeToTool('mcp.filesystem.read_file')).toBe('filesystem:read_file');
    });

    it('should handle nested server names', () => {
      expect(manager._nodeTypeToTool('mcp.brave-search.search_web')).toBe('brave-search:search_web');
    });

    it('should return null for invalid node types', () => {
      expect(manager._nodeTypeToTool('mcp.single')).toBeNull();
    });
  });

  describe('_getIcon', () => {
    it('should return icon for known servers', () => {
      expect(manager._getIcon('filesystem')).toBe('\uD83D\uDCC1');
      expect(manager._getIcon('github')).toBe('\uD83D\uDC19');
      expect(manager._getIcon('chrome')).toBe('\uD83C\uDF10');
      expect(manager._getIcon('postgres')).toBe('\uD83D\uDDC4\uFE0F');
    });

    it('should return default icon for unknown servers', () => {
      expect(manager._getIcon('unknown-server')).toBe('\uD83D\uDD27');
    });
  });

  describe('_mapType', () => {
    it('should map known schema types', () => {
      expect(manager._mapType('string')).toBe('string');
      expect(manager._mapType('number')).toBe('number');
      expect(manager._mapType('integer')).toBe('number');
      expect(manager._mapType('boolean')).toBe('boolean');
      expect(manager._mapType('array')).toBe('array');
      expect(manager._mapType('object')).toBe('object');
      expect(manager._mapType('null')).toBe('any');
    });

    it('should return \'any\' for unknown types', () => {
      expect(manager._mapType('unknown_type')).toBe('any');
    });
  });

  describe('_syncNodes', () => {
    beforeEach(() => {
      const tool1 = makeTool({ name: 'read', fullName: 'fs:read' });
      const tool2 = makeTool({ name: 'write', fullName: 'fs:write' });
      registry.setTools([tool1, tool2]);
      manager.registerToEngine(engine);
    });

    it('should unregister removed tools', () => {
      const tool1 = makeTool({ name: 'read', fullName: 'fs:read' });
      registry.setTools([tool1]);
      expect(manager.registeredNodes.size).toBe(2);

      const unregistered = jest.fn();
      manager.on('node-unregistered', unregistered);

      manager._syncNodes();

      expect(manager.registeredNodes.size).toBe(1);
      expect(manager.registeredNodes.has('mcp.fs.read')).toBe(true);
      expect(manager.registeredNodes.has('mcp.fs.write')).toBe(false);
      expect(unregistered).toHaveBeenCalledWith({ nodeType: 'mcp.fs.write' });
    });

    it('should register new tools', () => {
      const tool1 = makeTool({ name: 'read', fullName: 'fs:read' });
      const tool2 = makeTool({ name: 'write', fullName: 'fs:write' });
      const tool3 = makeTool({ name: 'delete', fullName: 'fs:delete' });
      registry.setTools([tool1, tool2, tool3]);

      expect(manager.registeredNodes.size).toBe(2);

      manager._syncNodes();

      expect(manager.registeredNodes.size).toBe(3);
      expect(manager.registeredNodes.has('mcp.fs.delete')).toBe(true);
    });

    it('should handle both add and remove', () => {
      const tool2 = makeTool({ name: 'write', fullName: 'fs:write' });
      const tool3 = makeTool({ name: 'delete', fullName: 'fs:delete' });
      registry.setTools([tool2, tool3]);

      expect(manager.registeredNodes.size).toBe(2);

      manager._syncNodes();

      expect(manager.registeredNodes.size).toBe(2);
      expect(manager.registeredNodes.has('mcp.fs.read')).toBe(false);
      expect(manager.registeredNodes.has('mcp.fs.write')).toBe(true);
      expect(manager.registeredNodes.has('mcp.fs.delete')).toBe(true);
    });

    it('should do nothing when tools match', () => {
      const tool1 = makeTool({ name: 'read', fullName: 'fs:read' });
      const tool2 = makeTool({ name: 'write', fullName: 'fs:write' });
      registry.setTools([tool1, tool2]);

      const unregistered = jest.fn();
      manager.on('node-unregistered', unregistered);

      manager._syncNodes();

      expect(manager.registeredNodes.size).toBe(2);
      expect(unregistered).not.toHaveBeenCalled();
    });
  });

  describe('_unregisterNode', () => {
    it('should unregister existing node and emit event', () => {
      const tool = makeTool();
      manager._registerToolAsNode(tool);
      expect(manager.registeredNodes.size).toBe(1);

      const unregistered = jest.fn();
      manager.on('node-unregistered', unregistered);

      manager._unregisterNode('mcp.filesystem.read_file');

      expect(manager.registeredNodes.size).toBe(0);
      expect(unregistered).toHaveBeenCalledWith({ nodeType: 'mcp.filesystem.read_file' });
    });

    it('should not emit for non-existent node', () => {
      const unregistered = jest.fn();
      manager.on('node-unregistered', unregistered);

      manager._unregisterNode('mcp.nonexistent.tool');

      expect(unregistered).not.toHaveBeenCalled();
    });
  });

  describe('getRegisteredNodes', () => {
    it('should return registered nodes as array', () => {
      const tool = makeTool({ name: 'read', fullName: 'fs:read' });
      manager._registerToolAsNode(tool);

      const nodes = manager.getRegisteredNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('mcp.fs.read');
      expect(nodes[0].registered).toBe(true);
      expect(nodes[0].registeredAt).toEqual(expect.any(Number));
      expect(nodes[0].name).toBe('read');
    });
  });

  describe('getNodeType / getToolFromNodeType', () => {
    it('should return correct node type for tool', () => {
      expect(manager.getNodeType('filesystem:read_file')).toBe('mcp.filesystem.read_file');
    });

    it('should return correct tool from node type', () => {
      expect(manager.getToolFromNodeType('mcp.filesystem.read_file')).toBe('filesystem:read_file');
    });
  });

  describe('createBatchNodeConfig', () => {
    it('should create batch config with inputs and outputs', () => {
      const tools = [makeTool({ name: 'read', fullName: 'fs:read' })];
      const config = manager.createBatchNodeConfig(tools);

      expect(config.name).toBe('MCP Batch');
      expect(config.icon).toBe('\uD83D\uDCE6');
      expect(config.category).toBe('MCP/Batch');
      expect(config.inputs).toHaveLength(2);
      expect(config.outputs).toHaveLength(3);
      expect(typeof config.execute).toBe('function');
    });

    it('should execute batch with toolFullName and items', async () => {
      const tools = [makeTool({ name: 'read', fullName: 'fs:read' })];
      bridge.batchCall.mockResolvedValue([
        { result: 'result1', success: true },
        { result: 'result2', success: true }
      ]);

      const config = manager.createBatchNodeConfig(tools);
      const result = await config.execute(null, {
        items: [{ path: '/a.txt' }, { path: '/b.txt' }],
        toolFullName: 'fs:read'
      });

      expect(bridge.batchCall).toHaveBeenCalledWith([
        { toolFullName: 'fs:read', params: { path: '/a.txt' } },
        { toolFullName: 'fs:read', params: { path: '/b.txt' } }
      ]);
      expect(result).toEqual({
        results: ['result1', 'result2'],
        successCount: 2,
        errorCount: 0
      });
    });

    it('should return zeros when no toolFullName', async () => {
      const tools = [makeTool()];
      const config = manager.createBatchNodeConfig(tools);
      const result = await config.execute(null, {
        items: [{ path: '/a.txt' }]
      });

      expect(result).toEqual({ results: [], successCount: 0, errorCount: 0 });
    });

    it('should handle empty items array', async () => {
      const tools = [makeTool({ name: 'read', fullName: 'fs:read' })];
      bridge.batchCall.mockResolvedValue([]);

      const config = manager.createBatchNodeConfig(tools);
      const result = await config.execute(null, {
        items: [],
        toolFullName: 'fs:read'
      });

      expect(bridge.batchCall).toHaveBeenCalledWith([]);
      expect(result).toEqual({ results: [], successCount: 0, errorCount: 0 });
    });

    it('should use empty array default when items not provided', async () => {
      const tools = [makeTool({ name: 'read', fullName: 'fs:read' })];
      bridge.batchCall.mockResolvedValue([]);

      const config = manager.createBatchNodeConfig(tools);
      const result = await config.execute(null, {
        toolFullName: 'fs:read'
      });

      expect(bridge.batchCall).toHaveBeenCalledWith([]);
      expect(result).toEqual({ results: [], successCount: 0, errorCount: 0 });
    });

    it('should filter null results and count failures', async () => {
      const tools = [makeTool({ name: 'read', fullName: 'fs:read' })];
      bridge.batchCall.mockResolvedValue([
        { result: null, success: false },
        { result: 'ok', success: true },
        { result: null, success: false }
      ]);

      const config = manager.createBatchNodeConfig(tools);
      const result = await config.execute(null, {
        items: [{ path: '/a.txt' }, { path: '/b.txt' }, { path: '/c.txt' }],
        toolFullName: 'fs:read'
      });

      expect(result).toEqual({
        results: ['ok'],
        successCount: 1,
        errorCount: 2
      });
    });

    it('should support custom name option', () => {
      const tools = [makeTool()];
      const config = manager.createBatchNodeConfig(tools, { name: 'Custom Batch' });
      expect(config.name).toBe('Custom Batch');
    });
  });

  describe('destroy', () => {
    it('should clear nodes and remove listeners', () => {
      const tool = makeTool();
      manager._registerToolAsNode(tool);

      const listener = jest.fn();
      manager.on('node-registered', listener);

      manager.destroy();

      expect(manager.registeredNodes.size).toBe(0);

      manager.emit('node-registered', {});
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
