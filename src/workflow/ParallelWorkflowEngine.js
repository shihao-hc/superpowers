const crypto = require('crypto');

class ParallelWorkflowEngine {
  constructor(options = {}) {
    this.nodes = new Map();
    this.connections = [];
    this.nodeTypes = new Map();
    this.cache = new Map();
    this.cacheEnabled = options.cacheEnabled !== false;
    this.maxConcurrent = options.maxConcurrent || 5;
    this.debugMode = options.debugMode || false;
    this.breakpoints = new Set();
    this.executionLogs = [];
    this.maxLogs = options.maxLogs || 1000;
    this.onNodeStart = options.onNodeStart || (() => {});
    this.onNodeComplete = options.onNodeComplete || (() => {});
    this.onNodeError = options.onNodeError || (() => {});
    this.onBreakpoint = options.onBreakpoint || (() => {});

    this._registerDefaultNodeTypes();
  }

  _registerDefaultNodeTypes() {
    this.registerNodeType('input', {
      name: '输入', icon: '📥', category: '基础',
      inputs: [], outputs: [{ name: 'value', type: 'any' }],
      hasSideEffect: false,
      execute: (node) => ({ value: node.data.value })
    });

    this.registerNodeType('output', {
      name: '输出', icon: '📤', category: '基础',
      inputs: [{ name: 'value', type: 'any' }], outputs: [],
      hasSideEffect: false,
      execute: (node, inputs) => ({ result: inputs.value })
    });

    this.registerNodeType('text', {
      name: '文本', icon: '📝', category: '基础',
      inputs: [], outputs: [{ name: 'text', type: 'string' }],
      hasSideEffect: false,
      execute: (node) => ({ text: node.data.text || '' })
    });

    this.registerNodeType('number', {
      name: '数字', icon: '🔢', category: '基础',
      inputs: [], outputs: [{ name: 'value', type: 'number' }],
      hasSideEffect: false,
      execute: (node) => ({ value: parseFloat(node.data.value) || 0 })
    });

    this.registerNodeType('concat', {
      name: '拼接', icon: '🔗', category: '文本',
      inputs: [{ name: 'a', type: 'string' }, { name: 'b', type: 'string' }],
      outputs: [{ name: 'result', type: 'string' }],
      hasSideEffect: false,
      execute: (node, inputs) => ({ result: String(inputs.a || '') + String(inputs.b || '') })
    });

    this.registerNodeType('llm_call', {
      name: 'LLM调用', icon: '🧠', category: 'AI',
      inputs: [{ name: 'prompt', type: 'string' }],
      outputs: [{ name: 'response', type: 'string' }],
      hasSideEffect: false,
      execute: async (node, inputs) => {
        await new Promise(r => setTimeout(r, 500));
        return { response: `[LLM] ${inputs.prompt}` };
      }
    });

    this.registerNodeType('vision', {
      name: '视觉分析', icon: '👁️', category: 'AI',
      inputs: [{ name: 'image', type: 'image' }, { name: 'prompt', type: 'string' }],
      outputs: [{ name: 'description', type: 'string' }],
      hasSideEffect: false,
      execute: async (node, inputs) => {
        return { description: `[Vision] ${inputs.prompt}` };
      }
    });

    this.registerNodeType('http_request', {
      name: 'HTTP请求', icon: '🌐', category: '网络',
      inputs: [{ name: 'url', type: 'string' }, { name: 'method', type: 'string' }, { name: 'body', type: 'string' }],
      outputs: [{ name: 'response', type: 'string' }, { name: 'status', type: 'number' }],
      hasSideEffect: true,
      execute: async (node, inputs) => {
        await new Promise(r => setTimeout(r, 300));
        return { response: 'OK', status: 200 };
      }
    });

    this.registerNodeType('condition', {
      name: '条件判断', icon: '❓', category: '逻辑',
      inputs: [
        { name: 'condition', type: 'boolean' },
        { name: 'trueValue', type: 'any' },
        { name: 'falseValue', type: 'any' }
      ],
      outputs: [{ name: 'result', type: 'any' }],
      hasSideEffect: false,
      execute: (node, inputs) => ({
        result: inputs.condition ? inputs.trueValue : inputs.falseValue
      })
    });

    this.registerNodeType('switch', {
      name: '分支', icon: '🔀', category: '逻辑',
      inputs: [{ name: 'value', type: 'any' }, { name: 'cases', type: 'array' }],
      outputs: [{ name: 'result', type: 'any' }],
      hasSideEffect: false,
      execute: (node, inputs) => {
        const cases = inputs.cases || [];
        const match = cases.find(c => c.value === inputs.value);
        return { result: match ? match.result : cases[0]?.result };
      }
    });

    this.registerNodeType('loop', {
      name: '循环', icon: '🔄', category: '逻辑',
      inputs: [{ name: 'items', type: 'array' }],
      outputs: [{ name: 'results', type: 'array' }],
      hasSideEffect: false,
      execute: (node, inputs) => {
        return { results: (inputs.items || []).map(item => ({ item })) };
      }
    });

    this.registerNodeType('parallel', {
      name: '并行执行', icon: '⚡', category: '逻辑',
      inputs: [{ name: 'tasks', type: 'array' }],
      outputs: [{ name: 'results', type: 'array' }],
      hasSideEffect: false,
      execute: async (node, inputs) => {
        const tasks = inputs.tasks || [];
        const results = await Promise.all(tasks.map(async (task, i) => {
          await new Promise(r => setTimeout(r, Math.random() * 500));
          return { index: i, result: task };
        }));
        return { results };
      }
    });

    this.registerNodeType('delay', {
      name: '延迟', icon: '⏰', category: '工具',
      inputs: [{ name: 'input', type: 'any' }, { name: 'ms', type: 'number' }],
      outputs: [{ name: 'output', type: 'any' }],
      hasSideEffect: false,
      execute: async (node, inputs) => {
        await new Promise(r => setTimeout(r, inputs.ms || 1000));
        return { output: inputs.input };
      }
    });

    this.registerNodeType('json_parse', {
      name: 'JSON解析', icon: '📋', category: '工具',
      inputs: [{ name: 'text', type: 'string' }],
      outputs: [{ name: 'data', type: 'object' }],
      hasSideEffect: false,
      execute: (node, inputs) => {
        try {
          return { data: JSON.parse(inputs.text || '{}') };
        } catch (e) {
          return { data: null, error: e.message };
        }
      }
    });

    this.registerNodeType('notify', {
      name: '发送通知', icon: '🔔', category: '通知',
      inputs: [{ name: 'title', type: 'string' }, { name: 'body', type: 'string' }],
      outputs: [{ name: 'sent', type: 'boolean' }],
      hasSideEffect: true,
      execute: async (node, inputs) => {
        return { sent: true, title: inputs.title };
      }
    });

    this.registerNodeType('attest', {
      name: '链上存证', icon: '🔗', category: '区块链',
      inputs: [{ name: 'data', type: 'any' }],
      outputs: [{ name: 'hash', type: 'string' }, { name: 'attestationId', type: 'string' }],
      hasSideEffect: true,
      execute: async (node, inputs) => {
        const hash = crypto.createHash('sha256').update(JSON.stringify(inputs.data)).digest('hex');
        return { hash, attestationId: `att_${Date.now().toString(36)}` };
      }
    });

    this.registerNodeType('sub_workflow', {
      name: '子工作流', icon: '📁', category: '高级',
      inputs: [{ name: 'input', type: 'any' }],
      outputs: [{ name: 'output', type: 'any' }],
      hasSideEffect: false,
      execute: async (node, inputs, context) => {
        const workflowData = node.data.workflow;
        if (!workflowData) return { output: inputs.input, error: 'No workflow data' };

        if (context && context.executeSubWorkflow) {
          return { output: await context.executeSubWorkflow(workflowData, inputs) };
        }
        return { output: inputs.input };
      }
    });

    this.registerNodeType('filter', {
      name: '过滤', icon: '🔍', category: '数据',
      inputs: [{ name: 'items', type: 'array' }, { name: 'condition', type: 'string' }],
      outputs: [{ name: 'filtered', type: 'array' }],
      hasSideEffect: false,
      execute: (node, inputs) => {
        return { filtered: (inputs.items || []).filter(Boolean) };
      }
    });

    this.registerNodeType('map', {
      name: '映射', icon: '🗺️', category: '数据',
      inputs: [{ name: 'items', type: 'array' }],
      outputs: [{ name: 'mapped', type: 'array' }],
      hasSideEffect: false,
      execute: (node, inputs) => {
        return { mapped: (inputs.items || []).map(item => item) };
      }
    });

    this.registerNodeType('merge', {
      name: '合并', icon: '🔗', category: '数据',
      inputs: [{ name: 'a', type: 'array' }, { name: 'b', type: 'array' }],
      outputs: [{ name: 'result', type: 'array' }],
      hasSideEffect: false,
      execute: (node, inputs) => {
        return { result: [...(inputs.a || []), ...(inputs.b || [])] };
      }
    });
  }

  registerNodeType(type, config) {
    this.nodeTypes.set(type, {
      type,
      name: config.name,
      icon: config.icon,
      category: config.category,
      inputs: config.inputs || [],
      outputs: config.outputs || [],
      execute: config.execute,
      hasSideEffect: config.hasSideEffect !== false,
      defaultData: config.defaultData || {}
    });
  }

  addNode(type, data = {}) {
    const nodeType = this.nodeTypes.get(type);
    if (!nodeType) throw new Error(`Unknown node type: ${type}`);

    const nodeId = `node_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    const node = {
      id: nodeId,
      type,
      name: data.name || nodeType.name,
      icon: nodeType.icon,
      category: nodeType.category,
      data: { ...nodeType.defaultData, ...data },
      inputs: nodeType.inputs.map(i => ({ ...i, value: null })),
      outputs: nodeType.outputs.map(o => ({ ...o, value: null })),
      hasSideEffect: nodeType.hasSideEffect,
      status: 'idle'
    };

    this.nodes.set(nodeId, node);
    return node;
  }

  deleteNode(nodeId) {
    this.connections = this.connections.filter(
      c => c.source.nodeId !== nodeId && c.target.nodeId !== nodeId
    );
    this.nodes.delete(nodeId);
  }

  connect(sourceNodeId, sourceOutput, targetNodeId, targetInput) {
    const connectionId = `conn_${Date.now().toString(36)}`;
    this.connections.push({
      id: connectionId,
      source: { nodeId: sourceNodeId, output: sourceOutput },
      target: { nodeId: targetNodeId, input: targetInput }
    });
    return { id: connectionId };
  }

  disconnect(connectionId) {
    this.connections = this.connections.filter(c => c.id !== connectionId);
  }

  addBreakpoint(nodeId) {
    this.breakpoints.add(nodeId);
  }

  removeBreakpoint(nodeId) {
    this.breakpoints.delete(nodeId);
  }

  clearCache() {
    this.cache.clear();
  }

  async executeParallel() {
    const results = new Map();
    const graph = this._buildDependencyGraph();
    const indegree = new Map();
    const queue = [];

    for (const [nodeId, deps] of graph) {
      indegree.set(nodeId, deps.length);
      if (deps.length === 0) queue.push(nodeId);
    }

    let completed = 0;
    const total = this.nodes.size;

    while (queue.length > 0) {
      const batch = queue.splice(0, this.maxConcurrent);

      const promises = batch.map(async (nodeId) => {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        if (this.breakpoints.has(nodeId)) {
          node.status = 'breakpoint';
          this.onBreakpoint({ nodeId, node });
          await this._waitForResume(nodeId);
        }

        node.status = 'running';
        this.onNodeStart({ nodeId, type: node.type });

        const startTime = Date.now();

        try {
          const inputs = this._getInputs(nodeId, results);

          const cacheKey = this._getCacheKey(node, inputs);
          let result;

          if (this.cacheEnabled && !node.hasSideEffect && this.cache.has(cacheKey)) {
            result = this.cache.get(cacheKey);
            this._log(nodeId, 'cache_hit', { result });
          } else {
            const nodeType = this.nodeTypes.get(node.type);
            if (nodeType && nodeType.execute) {
              result = await nodeType.execute(node, inputs, {
                executeSubWorkflow: this.executeParallel.bind(this)
              });

              if (this.cacheEnabled && !node.hasSideEffect) {
                this.cache.set(cacheKey, result);
              }
            }
          }

          const duration = Date.now() - startTime;

          node.outputs.forEach(output => {
            if (result && result[output.name] !== undefined) {
              output.value = result[output.name];
            }
          });

          results.set(nodeId, result);
          node.status = 'completed';
          completed++;

          this._log(nodeId, 'completed', { result, duration });
          this.onNodeComplete({ nodeId, type: node.type, result, duration });

        } catch (error) {
          node.status = 'failed';
          node.error = error.message;

          this._log(nodeId, 'failed', { error: error.message });
          this.onNodeError({ nodeId, type: node.type, error: error.message });
        }
      });

      await Promise.all(promises);

      for (const nodeId of batch) {
        for (const [depNodeId, deps] of graph) {
          if (deps.includes(nodeId)) {
            indegree.set(depNodeId, indegree.get(depNodeId) - 1);
            if (indegree.get(depNodeId) === 0) {
              queue.push(depNodeId);
            }
          }
        }
      }
    }

    return {
      completed,
      total,
      results: Object.fromEntries(results),
      logs: this.executionLogs.slice(-100)
    };
  }

  _buildDependencyGraph() {
    const graph = new Map();

    for (const [nodeId] of this.nodes) {
      graph.set(nodeId, []);
    }

    for (const conn of this.connections) {
      const deps = graph.get(conn.target.nodeId);
      if (deps && !deps.includes(conn.source.nodeId)) {
        deps.push(conn.source.nodeId);
      }
    }

    return graph;
  }

  _getInputs(nodeId, results) {
    const inputs = {};

    for (const conn of this.connections) {
      if (conn.target.nodeId === nodeId) {
        const sourceResult = results.get(conn.source.nodeId);
        if (sourceResult && sourceResult[conn.source.output] !== undefined) {
          inputs[conn.target.input] = sourceResult[conn.source.output];
        }
      }
    }

    return inputs;
  }

  _getCacheKey(node, inputs) {
    return `${node.type}:${node.id}:${JSON.stringify(inputs)}`;
  }

  _log(nodeId, event, data) {
    this.executionLogs.push({
      nodeId,
      event,
      data,
      timestamp: Date.now()
    });

    if (this.executionLogs.length > this.maxLogs) {
      this.executionLogs = this.executionLogs.slice(-this.maxLogs / 2);
    }

    if (this.debugMode) {
      console.log(`[Workflow] ${nodeId}: ${event}`, data);
    }
  }

  async _waitForResume(nodeId) {
    return new Promise(resolve => {
      this.breakpoints.delete(nodeId);
      resolve();
    });
  }

  getExecutionLogs(nodeId = null, limit = 100) {
    let logs = this.executionLogs;
    if (nodeId) logs = logs.filter(l => l.nodeId === nodeId);
    return logs.slice(-limit);
  }

  getStats() {
    return {
      nodes: this.nodes.size,
      connections: this.connections.length,
      nodeTypes: this.nodeTypes.size,
      cacheSize: this.cache.size,
      breakpoints: this.breakpoints.size,
      logs: this.executionLogs.length,
      maxConcurrent: this.maxConcurrent
    };
  }

  toJSON() {
    return {
      nodes: Array.from(this.nodes.values()),
      connections: this.connections
    };
  }

  fromJSON(data) {
    this.nodes.clear();
    this.connections = [];

    for (const node of data.nodes || []) {
      this.nodes.set(node.id, {
        ...node,
        status: 'idle',
        hasSideEffect: node.hasSideEffect !== false
      });
    }
    this.connections = data.connections || [];
  }

  destroy() {
    this.nodes.clear();
    this.connections = [];
    this.cache.clear();
    this.breakpoints.clear();
    this.executionLogs = [];
  }
}

module.exports = { ParallelWorkflowEngine };
