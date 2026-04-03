const { EventEmitter } = require('events');

class MCPNodeManager extends EventEmitter {
  constructor(bridge, registry, options = {}) {
    super();
    this.bridge = bridge;
    this.registry = registry;
    this.options = {
      nodePrefix: options.nodePrefix || 'mcp',
      category: options.category || 'MCP',
      enableBatching: options.enableBatching !== false,
      ...options
    };
    this.registeredNodes = new Map();
    this.workflowEngine = null;
  }

  registerToEngine(workflowEngine) {
    this.workflowEngine = workflowEngine;

    for (const tool of this.registry.getTools()) {
      this._registerToolAsNode(tool);
    }

    this.registry.on('refreshed', () => {
      this._syncNodes();
    });

    this.emit('registered-to-engine', { nodeCount: this.registeredNodes.size });
  }

  _registerToolAsNode(tool) {
    const nodeType = this._toolToNodeType(tool.fullName);
    
    if (this.registeredNodes.has(nodeType)) {
      return;
    }

    const inputs = this._extractInputs(tool);
    const outputs = this._extractOutputs(tool);

    const nodeConfig = {
      name: tool.name,
      icon: this._getIcon(tool.serverName),
      category: `${this.options.category}/${tool.serverName}`,
      inputs,
      outputs,
      description: tool.description || `MCP tool: ${tool.fullName}`,
      defaultData: {
        toolFullName: tool.fullName,
        serverName: tool.serverName
      },
      execute: this._createExecutor(tool),
      metadata: {
        toolFullName: tool.fullName,
        serverName: tool.serverName,
        inputSchema: tool.inputSchema,
        tags: tool.tags
      }
    };

    if (this.workflowEngine) {
      this.workflowEngine.registerNodeType(nodeType, nodeConfig);
    }

    this.registeredNodes.set(nodeType, {
      ...nodeConfig,
      registered: true,
      registeredAt: Date.now()
    });

    this.emit('node-registered', { nodeType, toolName: tool.fullName });
  }

  _createExecutor(tool) {
    return async (node, inputs, executeNode) => {
      const traceId = `trace_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;

      this.emit('execution-start', {
        nodeId: node.id,
        nodeType: this._toolToNodeType(tool.fullName),
        toolFullName: tool.fullName,
        traceId
      });

      const params = this._mapInputsToParams(inputs, tool);

      const validation = this.registry.validateParams(tool.fullName, params);
      if (!validation.valid) {
        const error = new Error(`Parameter validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
        this.emit('execution-error', {
          nodeId: node.id,
          toolFullName: tool.fullName,
          error: error.message,
          traceId
        });
        throw error;
      }

      try {
        const result = await this.bridge.call(tool.fullName, params, { traceId });

        this.emit('execution-complete', {
          nodeId: node.id,
          toolFullName: tool.fullName,
          traceId,
          duration: Date.now() - parseInt(traceId.split('_')[1], 36)
        });

        return this._formatOutput(result, tool);
      } catch (error) {
        this.emit('execution-error', {
          nodeId: node.id,
          toolFullName: tool.fullName,
          error: error.message,
          traceId
        });
        throw error;
      }
    };
  }

  _extractInputs(tool) {
    if (!tool.inputSchema || !tool.inputSchema.properties) {
      return [{ name: 'params', type: 'object', description: 'Tool parameters' }];
    }

    const inputs = [];
    const required = tool.inputSchema.required || [];

    for (const [paramName, paramDef] of Object.entries(tool.inputSchema.properties)) {
      inputs.push({
        name: paramName,
        type: this._mapType(paramDef.type),
        description: paramDef.description || paramName,
        required: required.includes(paramName),
        default: paramDef.default
      });
    }

    return inputs;
  }

  _extractOutputs(tool) {
    return [
      { name: 'result', type: 'any', description: 'Tool execution result' },
      { name: 'success', type: 'boolean', description: 'Whether the tool executed successfully' },
      { name: 'error', type: 'string', description: 'Error message if execution failed' }
    ];
  }

  _mapInputsToParams(inputs, tool) {
    const params = {};

    if (tool.inputSchema && tool.inputSchema.properties) {
      for (const paramName of Object.keys(tool.inputSchema.properties)) {
        if (inputs[paramName] !== undefined) {
          params[paramName] = inputs[paramName];
        }
      }
    } else if (inputs.params) {
      return inputs.params;
    }

    return params;
  }

  _formatOutput(result, tool) {
    if (result === undefined || result === null) {
      return { result: null, success: true, error: null };
    }

    if (typeof result === 'object') {
      return {
        result,
        success: true,
        error: null
      };
    }

    return {
      result,
      success: true,
      error: null
    };
  }

  _toolToNodeType(toolFullName) {
    return `${this.options.nodePrefix}.${toolFullName.replace(':', '.')}`;
  }

  _nodeTypeToTool(nodeType) {
    const parts = nodeType.replace(`${this.options.nodePrefix}.`, '').split('.');
    if (parts.length < 2) return null;
    
    const toolName = parts.pop();
    const serverName = parts.join(':');
    
    return `${serverName}:${toolName}`;
  }

  _getIcon(serverName) {
    const icons = {
      'filesystem': '📁',
      'github': '🐙',
      'chrome': '🌐',
      'context7': '📚',
      'memos': '📝',
      'sequential': '📋',
      'postgres': '🗄️',
      'sqlite': '💾',
      'brave-search': '🔍',
      'slack': '💬',
      'discord': '🎮'
    };
    return icons[serverName] || '🔧';
  }

  _mapType(schemaType) {
    const typeMap = {
      'string': 'string',
      'number': 'number',
      'integer': 'number',
      'boolean': 'boolean',
      'array': 'array',
      'object': 'object',
      'null': 'any'
    };
    return typeMap[schemaType] || 'any';
  }

  _syncNodes() {
    const currentTools = new Set(this.registry.getTools().map(t => t.fullName));
    const currentNodes = new Set(this.registeredNodes.keys());

    for (const nodeType of currentNodes) {
      const toolFullName = this._nodeTypeToTool(nodeType);
      if (!currentTools.has(toolFullName)) {
        this._unregisterNode(nodeType);
      }
    }

    for (const tool of this.registry.getTools()) {
      const nodeType = this._toolToNodeType(tool.fullName);
      if (!currentNodes.has(nodeType)) {
        this._registerToolAsNode(tool);
      }
    }
  }

  _unregisterNode(nodeType) {
    if (this.registeredNodes.has(nodeType)) {
      this.registeredNodes.delete(nodeType);
      this.emit('node-unregistered', { nodeType });
    }
  }

  getRegisteredNodes() {
    return Array.from(this.registeredNodes.entries()).map(([type, config]) => ({
      type,
      ...config
    }));
  }

  getNodeType(toolFullName) {
    return this._toolToNodeType(toolFullName);
  }

  getToolFromNodeType(nodeType) {
    return this._nodeTypeToTool(nodeType);
  }

  createBatchNodeConfig(tools, options = {}) {
    return {
      name: options.name || 'MCP Batch',
      icon: '📦',
      category: `${this.options.category}/Batch`,
      inputs: [
        { name: 'items', type: 'array', description: 'Array of items to process' },
        { name: 'toolFullName', type: 'string', description: 'MCP tool to call', default: tools[0]?.fullName }
      ],
      outputs: [
        { name: 'results', type: 'array', description: 'Results from batch execution' },
        { name: 'successCount', type: 'number', description: 'Number of successful calls' },
        { name: 'errorCount', type: 'number', description: 'Number of failed calls' }
      ],
      execute: async (node, inputs) => {
        const { items = [], toolFullName } = inputs;
        
        if (!toolFullName) {
          return { results: [], successCount: 0, errorCount: 0 };
        }

        const calls = items.map(item => ({
          toolFullName,
          params: item
        }));

        const results = await this.bridge.batchCall(calls);
        
        return {
          results: results.map(r => r.result).filter(Boolean),
          successCount: results.filter(r => r.success).length,
          errorCount: results.filter(r => !r.success).length
        };
      }
    };
  }

  destroy() {
    this.registeredNodes.clear();
    this.removeAllListeners();
  }
}

module.exports = { MCPNodeManager };
