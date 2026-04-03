const crypto = require('crypto');

class NodeWorkflowEngine {
  constructor(options = {}) {
    this.nodes = new Map();
    this.connections = [];
    this.nodeTypes = new Map();
    this.executions = new Map();
    this.maxExecutions = options.maxExecutions || 100;
    this.maxConcurrent = options.maxConcurrent || 10;
    this.enableParameterCache = options.enableParameterCache !== false;
    this.resultCache = new Map();
    this.compiledPlans = new Map();
    this.maxCompiledPlans = options.maxCompiledPlans || 50;
    this.onNodeExecute = options.onNodeExecute || (() => {});
    this.onWorkflowComplete = options.onWorkflowComplete || (() => {});
    this.onError = options.onError || ((e) => console.error('[NodeEngine]', e));

    this._runningNodes = 0;
    this._nodeQueue = [];
    this._executionSemaphore = null;

    this._registerDefaultNodeTypes();
  }

  setMaxConcurrent(max) {
    this.maxConcurrent = max;
  }

  _getSemaphore() {
    if (!this._executionSemaphore) {
      const max = this.maxConcurrent;
      let current = 0;
      const queue = [];

      this._executionSemaphore = {
        async acquire() {
          if (current < max) {
            current++;
            return Promise.resolve();
          }
          return new Promise(resolve => {
            queue.push(resolve);
          });
        },
        release() {
          current--;
          if (queue.length > 0) {
            current++;
            const next = queue.shift();
            next();
          }
        },
        get active() { return current; },
        get waiting() { return queue.length; }
      };
    }
    return this._executionSemaphore;
  }

  _registerDefaultNodeTypes() {
    this.registerNodeType('input', {
      name: '输入',
      icon: '📥',
      category: '基础',
      inputs: [],
      outputs: [{ name: 'value', type: 'any' }],
      execute: (node) => ({ value: node.data.value })
    });

    this.registerNodeType('output', {
      name: '输出',
      icon: '📤',
      category: '基础',
      inputs: [{ name: 'value', type: 'any' }],
      outputs: [],
      execute: (node, inputs) => ({ result: inputs.value })
    });

    this.registerNodeType('text', {
      name: '文本',
      icon: '📝',
      category: '基础',
      inputs: [],
      outputs: [{ name: 'text', type: 'string' }],
      execute: (node) => ({ text: node.data.text || '' })
    });

    this.registerNodeType('concat', {
      name: '拼接',
      icon: '🔗',
      category: '文本',
      inputs: [
        { name: 'a', type: 'string' },
        { name: 'b', type: 'string' }
      ],
      outputs: [{ name: 'result', type: 'string' }],
      execute: (node, inputs) => ({ result: (inputs.a || '') + (inputs.b || '') })
    });

    this.registerNodeType('llm_call', {
      name: 'LLM调用',
      icon: '🧠',
      category: 'AI',
      inputs: [{ name: 'prompt', type: 'string' }],
      outputs: [{ name: 'response', type: 'string' }],
      execute: async (node, inputs) => {
        return { response: `[LLM Response] ${inputs.prompt}` };
      }
    });

    this.registerNodeType('vision', {
      name: '视觉分析',
      icon: '👁️',
      category: 'AI',
      inputs: [{ name: 'image', type: 'image' }, { name: 'prompt', type: 'string' }],
      outputs: [{ name: 'description', type: 'string' }],
      execute: async (node, inputs) => {
        return { description: `[Vision] ${inputs.prompt}` };
      }
    });

    this.registerNodeType('browser_navigate', {
      name: '浏览器导航',
      icon: '🌐',
      category: '浏览器',
      inputs: [{ name: 'url', type: 'string' }],
      outputs: [{ name: 'success', type: 'boolean' }],
      execute: async (node, inputs) => {
        return { success: true, url: inputs.url };
      }
    });

    this.registerNodeType('browser_extract', {
      name: '数据提取',
      icon: '📊',
      category: '浏览器',
      inputs: [{ name: 'selector', type: 'string' }],
      outputs: [{ name: 'data', type: 'array' }],
      execute: async (node, inputs) => {
        return { data: ['item1', 'item2'] };
      }
    });

    this.registerNodeType('browser_screenshot', {
      name: '截图',
      icon: '📸',
      category: '浏览器',
      inputs: [],
      outputs: [{ name: 'image', type: 'image' }],
      execute: async () => {
        return { image: 'base64_data' };
      }
    });

    this.registerNodeType('price_check', {
      name: '价格检查',
      icon: '💰',
      category: '电商',
      inputs: [{ name: 'url', type: 'string' }],
      outputs: [{ name: 'price', type: 'number' }, { name: 'alert', type: 'boolean' }],
      execute: async (node, inputs) => {
        return { price: 99.99, alert: false };
      }
    });

    this.registerNodeType('price_predict', {
      name: '价格预测',
      icon: '📈',
      category: '电商',
      inputs: [{ name: 'productId', type: 'string' }],
      outputs: [{ name: 'predictions', type: 'array' }, { name: 'recommendation', type: 'string' }],
      execute: async (node, inputs) => {
        return {
          predictions: [{ day: 1, price: 98 }, { day: 7, price: 95 }],
          recommendation: 'wait'
        };
      }
    });

    this.registerNodeType('notify', {
      name: '发送通知',
      icon: '🔔',
      category: '通知',
      inputs: [{ name: 'title', type: 'string' }, { name: 'body', type: 'string' }],
      outputs: [{ name: 'sent', type: 'boolean' }],
      execute: async (node, inputs) => {
        return { sent: true };
      }
    });

    this.registerNodeType('attest', {
      name: '链上存证',
      icon: '🔗',
      category: '区块链',
      inputs: [{ name: 'data', type: 'any' }],
      outputs: [{ name: 'hash', type: 'string' }, { name: 'attestationId', type: 'string' }],
      execute: async (node, inputs) => {
        const hash = crypto.createHash('sha256').update(JSON.stringify(inputs.data)).digest('hex');
        return { hash, attestationId: `att_${Date.now().toString(36)}` };
      }
    });

    this.registerNodeType('condition', {
      name: '条件判断',
      icon: '❓',
      category: '逻辑',
      inputs: [{ name: 'condition', type: 'boolean' }, { name: 'trueValue', type: 'any' }, { name: 'falseValue', type: 'any' }],
      outputs: [{ name: 'result', type: 'any' }],
      execute: (node, inputs) => {
        return { result: inputs.condition ? inputs.trueValue : inputs.falseValue };
      }
    });

    this.registerNodeType('loop', {
      name: '循环',
      icon: '🔄',
      category: '逻辑',
      inputs: [{ name: 'items', type: 'array' }, { name: 'template', type: 'any' }],
      outputs: [{ name: 'results', type: 'array' }],
      execute: async (node, inputs, executeNode) => {
        const results = [];
        for (const item of (inputs.items || [])) {
          results.push({ item });
        }
        return { results };
      }
    });

    this.registerNodeType('delay', {
      name: '延迟',
      icon: '⏰',
      category: '工具',
      inputs: [{ name: 'input', type: 'any' }, { name: 'ms', type: 'number' }],
      outputs: [{ name: 'output', type: 'any' }],
      execute: async (node, inputs) => {
        await new Promise(r => setTimeout(r, inputs.ms || 1000));
        return { output: inputs.input };
      }
    });

    this.registerNodeType('json_parse', {
      name: 'JSON解析',
      icon: '📋',
      category: '工具',
      inputs: [{ name: 'text', type: 'string' }],
      outputs: [{ name: 'data', type: 'object' }],
      execute: (node, inputs) => {
        try {
          return { data: JSON.parse(inputs.text || '{}') };
        } catch (e) {
          return { data: null, error: e.message };
        }
      }
    });

    this.registerNodeType('http_request', {
      name: 'HTTP请求',
      icon: '🌐',
      category: '网络',
      inputs: [{ name: 'url', type: 'string' }, { name: 'method', type: 'string' }, { name: 'body', type: 'string' }],
      outputs: [{ name: 'response', type: 'string' }, { name: 'status', type: 'number' }],
      execute: async (node, inputs) => {
        return { response: 'OK', status: 200 };
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
      defaultData: config.defaultData || {}
    });
  }

  createNode(type, position = { x: 100, y: 100 }, data = {}) {
    const nodeType = this.nodeTypes.get(type);
    if (!nodeType) throw new Error(`Unknown node type: ${type}`);

    const nodeId = `node_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    const node = {
      id: nodeId,
      type,
      name: nodeType.name,
      icon: nodeType.icon,
      category: nodeType.category,
      position,
      data: { ...nodeType.defaultData, ...data },
      inputs: nodeType.inputs.map(i => ({ ...i, value: null })),
      outputs: nodeType.outputs.map(o => ({ ...o, value: null })),
      status: 'idle'
    };

    this.nodes.set(nodeId, node);
    return node;
  }

  deleteNode(nodeId) {
    this.connections = this.connections.filter(
      c => c.source.nodeId !== nodeId && c.target.nodeId !== nodeId
    );
    return this.nodes.delete(nodeId);
  }

  connect(sourceNodeId, sourceOutput, targetNodeId, targetInput) {
    const source = this.nodes.get(sourceNodeId);
    const target = this.nodes.get(targetNodeId);

    if (!source || !target) throw new Error('Node not found');

    const output = source.outputs.find(o => o.name === sourceOutput);
    const input = target.inputs.find(i => i.name === targetInput);

    if (!output || !input) throw new Error('Port not found');

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

  async execute(workflowId = null, options = {}) {
    const execId = `exec_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    const parallel = options.parallel !== false && this.maxConcurrent > 1;

    const execution = {
      id: execId,
      workflowId,
      status: 'running',
      nodeResults: {},
      startedAt: Date.now(),
      completedAt: null,
      parallel
    };

    this.executions.set(execId, execution);

    try {
      if (parallel) {
        await this._executeParallel(execution);
      } else {
        await this._executeSequential(execution);
      }

      execution.status = 'completed';
      execution.completedAt = Date.now();

      this.onWorkflowComplete(execution);

    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;
      execution.completedAt = Date.now();

      this.onError(error);
    }

    this._archiveExecution(execution);

    return execution;
  }

  async _executeSequential(execution) {
    const sorted = this._topologicalSort();

    for (const nodeId of sorted) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;

      const result = await this._executeSingleNode(node, execution);
      if (result.error && !this._canContinueOnError(node)) {
        throw new Error(result.error);
      }
    }
  }

  async _executeParallel(execution) {
    const sorted = this._topologicalSort();
    const completed = new Set();
    const pending = new Set(sorted);
    const nodePromises = new Map();

    const checkAndSchedule = async () => {
      for (const nodeId of pending) {
        if (nodePromises.has(nodeId)) continue;

        const deps = this._getDependencies(nodeId);
        const depsReady = deps.every(depId => completed.has(depId));

        if (depsReady) {
          const node = this.nodes.get(nodeId);
          if (node) {
            nodePromises.set(nodeId, this._executeSingleNode(node, execution, true));
          }
        }
      }
    };

    const semaphore = this._getSemaphore();

    const processNode = async (nodeId) => {
      await semaphore.acquire();
      try {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        const deps = this._getDependencies(nodeId);
        for (const depId of deps) {
          if (nodePromises.has(depId)) {
            await nodePromises.get(depId);
          }
        }

        const inputs = this._getInputs(nodeId);
        node.status = 'running';

        const nodeType = this.nodeTypes.get(node.type);
        if (nodeType && nodeType.execute) {
          const hasSideEffect = nodeType.metadata?.hasSideEffect || 
                               node.type.startsWith('mcp_write') ||
                               node.type.startsWith('http_post') ||
                               node.type.startsWith('file_write');
          
          const cacheKey = this.enableParameterCache ? this._getCacheKey(nodeId, inputs) : null;
          
          let result;
          if (!hasSideEffect && cacheKey && this.resultCache.has(cacheKey)) {
            result = this.resultCache.get(cacheKey);
            node.status = 'cached';
          } else {
            result = await nodeType.execute(node, inputs, this._executeNode.bind(this));
            
            if (cacheKey && !hasSideEffect) {
              this.resultCache.set(cacheKey, result);
              this._cleanupResultCache();
            }
          }

          node.outputs.forEach(output => {
            if (result[output.name] !== undefined) {
              output.value = result[output.name];
            }
          });

          execution.nodeResults[nodeId] = result;
          node.status = 'completed';

          this.onNodeExecute({ nodeId, type: node.type, result, cached: node.status === 'cached' });
        }

        completed.add(nodeId);
        pending.delete(nodeId);
      } finally {
        semaphore.release();
      }
    };

    while (completed.size < sorted.length) {
      await checkAndSchedule();
      
      const available = Array.from(pending).filter(id => {
        const deps = this._getDependencies(id);
        return deps.every(depId => completed.has(depId)) && !nodePromises.has(id);
      });

      if (available.length === 0 && nodePromises.size > 0) {
        await Promise.race(nodePromises.values());
      } else {
        for (const nodeId of available) {
          processNode(nodeId);
        }
      }

      await new Promise(resolve => setImmediate(resolve));
    }

    await Promise.all(nodePromises.values());
  }

  _getCacheKey(nodeId, inputs) {
    return `${nodeId}:${JSON.stringify(inputs)}`;
  }

  _cleanupResultCache() {
    const maxSize = this.maxCompiledPlans * 10;
    if (this.resultCache.size > maxSize) {
      const entries = Array.from(this.resultCache.entries());
      const toRemove = entries.slice(0, Math.floor(maxSize * 0.3));
      toRemove.forEach(([key]) => this.resultCache.delete(key));
    }
  }

  _getDependencies(nodeId) {
    const deps = [];
    for (const conn of this.connections) {
      if (conn.target.nodeId === nodeId) {
        deps.push(conn.source.nodeId);
      }
    }
    return deps;
  }

  _canContinueOnError(node) {
    return node.data?.continueOnError === true || 
           this.nodeTypes.get(node.type)?.metadata?.optional === true;
  }

  async _executeSingleNode(node, execution, parallel = false) {
    const inputs = this._getInputs(node.id);
    node.status = 'running';

    const nodeType = this.nodeTypes.get(node.type);
    if (nodeType && nodeType.execute) {
      const result = await nodeType.execute(node, inputs, this._executeNode.bind(this));

      node.outputs.forEach(output => {
        if (result[output.name] !== undefined) {
          output.value = result[output.name];
        }
      });

      execution.nodeResults[node.id] = result;
      node.status = 'completed';

      this.onNodeExecute({ nodeId: node.id, type: node.type, result });

      return result;
    }

    return {};
  }

  async _executeNode(nodeId, inputs) {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error('Node not found');

    const nodeType = this.nodeTypes.get(node.type);
    if (!nodeType) throw new Error('Unknown node type');

    return await nodeType.execute(node, inputs, this._executeNode.bind(this));
  }

  _getInputs(nodeId) {
    const inputs = {};

    for (const conn of this.connections) {
      if (conn.target.nodeId === nodeId) {
        const sourceNode = this.nodes.get(conn.source.nodeId);
        if (sourceNode) {
          const output = sourceNode.outputs.find(o => o.name === conn.source.output);
          if (output) {
            inputs[conn.target.input] = output.value;
          }
        }
      }
    }

    return inputs;
  }

  _topologicalSort() {
    const visited = new Set();
    const result = [];

    const visit = (nodeId) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      for (const conn of this.connections) {
        if (conn.target.nodeId === nodeId) {
          visit(conn.source.nodeId);
        }
      }

      result.push(nodeId);
    };

    for (const nodeId of this.nodes.keys()) {
      visit(nodeId);
    }

    return result;
  }

  _archiveExecution(execution) {
    if (this.executions.size > this.maxExecutions) {
      const entries = Array.from(this.executions.entries());
      const toRemove = entries.slice(0, entries.length - this.maxExecutions);
      toRemove.forEach(([id]) => this.executions.delete(id));
    }
  }

  getNodeType(type) {
    return this.nodeTypes.get(type);
  }

  getAllNodeTypes() {
    return Array.from(this.nodeTypes.values());
  }

  getNodeTypesByCategory() {
    const categories = {};
    for (const [type, config] of this.nodeTypes) {
      const cat = config.category || '其他';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push({ type, ...config });
    }
    return categories;
  }

  getNode(nodeId) {
    return this.nodes.get(nodeId);
  }

  getAllNodes() {
    return Array.from(this.nodes.values());
  }

  getConnections() {
    return [...this.connections];
  }

  getExecution(execId) {
    return this.executions.get(execId);
  }

  getStats() {
    return {
      nodeTypes: this.nodeTypes.size,
      nodes: this.nodes.size,
      connections: this.connections.length,
      executions: this.executions.size
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
      this.nodes.set(node.id, node);
    }
    this.connections = data.connections || [];
  }

  compileExecutionPlan(workflowId = null) {
    const plan = {
      id: `plan_${workflowId || 'default'}_${Date.now()}`,
      workflowId,
      sortedNodes: this._topologicalSort(),
      dependencies: new Map(),
      parallelGroups: [],
      createdAt: Date.now()
    };

    for (const nodeId of plan.sortedNodes) {
      plan.dependencies.set(nodeId, this._getDependencies(nodeId));
    }

    const levels = new Map();
    const visited = new Set();

    const assignLevel = (nodeId, level) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      if (!levels.has(level)) levels.set(level, []);
      levels.get(level).push(nodeId);

      const deps = plan.dependencies.get(nodeId) || [];
      for (const depId of deps) {
        assignLevel(depId, level + 1);
      }
    };

    for (const nodeId of plan.sortedNodes) {
      const deps = plan.dependencies.get(nodeId);
      if (!deps || deps.length === 0) {
        assignLevel(nodeId, 0);
      }
    }

    for (const [level, nodes] of levels) {
      plan.parallelGroups.push({ level, nodes });
    }

    if (this.compiledPlans.size >= this.maxCompiledPlans) {
      const oldest = Array.from(this.compiledPlans.keys())[0];
      this.compiledPlans.delete(oldest);
    }
    this.compiledPlans.set(plan.id, plan);

    return plan;
  }

  getCompiledPlan(planId) {
    return this.compiledPlans.get(planId);
  }

  clearResultCache() {
    this.resultCache.clear();
  }

  getResultCacheStats() {
    return {
      size: this.resultCache.size,
      maxSize: this.maxCompiledPlans * 10
    };
  }

  getPerformanceStats() {
    const recentExecutions = Array.from(this.executions.values())
      .slice(-100)
      .filter(e => e.completedAt);

    const durations = recentExecutions.map(e => e.completedAt - e.startedAt);
    const sorted = durations.sort((a, b) => a - b);

    return {
      semaphore: {
        max: this.maxConcurrent,
        active: this._executionSemaphore?.active || 0,
        waiting: this._executionSemaphore?.waiting || 0
      },
      cache: this.getResultCacheStats(),
      executions: {
        total: this.executions.size,
        recent: recentExecutions.length
      },
      latency: {
        p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
        p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
        p99: sorted[Math.floor(sorted.length * 0.99)] || 0,
        avg: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
      }
    };
  }

  destroy() {
    this.nodes.clear();
    this.connections = [];
    this.executions.clear();
  }
}

module.exports = { NodeWorkflowEngine };
