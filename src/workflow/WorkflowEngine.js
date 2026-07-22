/**
 * DAG Orchestration Engine
 * 有向无环图工作流编排引擎
 */

const { EventEmitter } = require('events');

class TaskNode {
  constructor(id, config = {}) {
    this.id = id;
    this.type = config.type || 'task';
    this.handler = config.handler || (async () => ({}));
    this.inputSchema = config.inputSchema || null;
    this.outputSchema = config.outputSchema || null;
    this.retry = config.retry || { attempts: 1, delay: 0 };
    this.timeout = config.timeout || 30000;

    this.status = 'pending';
    this.input = null;
    this.output = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
  }

  async execute(input) {
    this.input = input;
    this.status = 'running';
    this.startTime = Date.now();

    let timeoutHandle;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Task timeout')), this.timeout);
      });

      const executePromise = this.handler(input);

      this.output = await Promise.race([executePromise, timeoutPromise]);
      clearTimeout(timeoutHandle);
      this.status = 'completed';
      this.endTime = Date.now();

      return this.output;
    } catch (error) {
      clearTimeout(timeoutHandle);
      this.error = error;
      this.status = 'failed';
      this.endTime = Date.now();
      throw error;
    }
  }

  getDuration() {
    if (!this.startTime) {return 0;}
    return (this.endTime || Date.now()) - this.startTime;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      status: this.status,
      duration: this.getDuration(),
      error: this.error?.message
    };
  }
}

class DAGEdge {
  constructor(source, target, condition = null) {
    this.source = source;
    this.target = target;
    this.condition = condition;
  }
}

class WorkflowEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      maxConcurrency: options.maxConcurrency || 10,
      retryDelay: options.retryDelay || 1000,
      ...options
    };

    this.nodes = new Map();
    this.edges = [];
    this.executionOrder = [];
    this.results = new Map();
    this.executionGraph = new Map();
  }

  /**
   * 添加节点
   */
  addNode(id, config) {
    const node = new TaskNode(id, config);
    this.nodes.set(id, node);
    return this;
  }

  /**
   * 添加边（依赖关系）
   */
  addEdge(source, target, condition = null) {
    if (!this.nodes.has(source) || !this.nodes.has(target)) {
      throw new Error(`Invalid edge: nodes ${source} or ${target} not found`);
    }

    this.edges.push(new DAGEdge(source, target, condition));
    return this;
  }

  /**
   * 验证 DAG 无环
   */
  validate() {
    const visited = new Set();
    const recursionStack = new Set();

    const dfs = (nodeId) => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const outgoing = this.edges.filter((e) => e.source === nodeId);

      for (const edge of outgoing) {
        if (!visited.has(edge.target)) {
          if (dfs(edge.target)) {return true;}
        } else if (recursionStack.has(edge.target)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId)) {
          throw new Error('DAG contains a cycle');
        }
      }
    }

    return true;
  }

  /**
   * 拓扑排序
   */
  topologicalSort() {
    const inDegree = new Map();
    const adjacency = new Map();

    // 初始化
    for (const nodeId of this.nodes.keys()) {
      inDegree.set(nodeId, 0);
      adjacency.set(nodeId, []);
    }

    // 计算入度
    for (const edge of this.edges) {
      inDegree.set(edge.target, inDegree.get(edge.target) + 1);
      adjacency.get(edge.source).push(edge.target);
    }

    // Kahn 算法
    const queue = [];
    const result = [];

    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift();
      result.push(current);

      for (const neighbor of adjacency.get(current)) {
        const newDegree = inDegree.get(neighbor) - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (result.length !== this.nodes.size) {
      throw new Error('DAG contains a cycle');
    }

    this.executionOrder = result;
    return result;
  }

  /**
   * 获取可执行的节点
   */
  getReadyNodes(completed) {
    const ready = [];

    for (const nodeId of this.executionOrder) {
      if (completed.has(nodeId)) {continue;}
      if (this.results.has(nodeId)) {continue;}

      // 检查前置节点是否完成
      const prerequisites = this.edges
        .filter((e) => e.target === nodeId)
        .map((e) => e.source);

      const allPrereqsMet = prerequisites.every((p) => completed.has(p));

      if (allPrereqsMet) {
        ready.push(nodeId);
      }
    }

    return ready;
  }

  /**
   * 执行工作流
   */
  async execute(initialInput = {}) {
    this.startTime = Date.now();
    this.validate();
    this.topologicalSort();

    this.results.clear();
    const completed = new Set();
    const _running = new Map();

    let input = { ...initialInput };

    while (completed.size < this.nodes.size) {
      // 获取可执行的节点
      const ready = this.getReadyNodes(completed);

      if (ready.length === 0 && completed.size < this.nodes.size) {
        throw new Error('Deadlock detected: no ready nodes but not all completed');
      }

      // 并发执行（限制数量）
      const batch = ready.slice(0, this.options.maxConcurrency);

      const promises = batch.map(async (nodeId) => {
        const node = this.nodes.get(nodeId);

        // 收集输入
        const nodeInput = { ...input };
        for (const edge of this.edges.filter((e) => e.target === nodeId)) {
          if (this.results.has(edge.source)) {
            nodeInput[edge.source] = this.results.get(edge.source);
          }
        }

        // 执行节点
        try {
          this.emit('node:start', { nodeId, input: nodeInput });
          const output = await this.executeNode(node, nodeInput);
          this.results.set(nodeId, output);
          completed.add(nodeId);

          // 更新输入（如果有输出）
          if (output) {
            input = { ...input, ...output };
          }

          this.emit('node:complete', { nodeId, output });
        } catch (error) {
          this.emit('node:error', { nodeId, error });
          throw error;
        }
      });

      await Promise.all(promises);
    }

    this.emit('workflow:complete', { results: this.results });

    return {
      results: Object.fromEntries(this.results),
      duration: Date.now() - this.startTime,
      nodeResults: Object.fromEntries(
        Array.from(this.nodes.entries()).map(([id, node]) => [id, node.toJSON()])
      )
    };
  }

  /**
   * 执行单个节点（带重试）
   */
  async executeNode(node, input) {
    const { attempts, delay } = node.retry;

    for (let i = 0; i < attempts; i++) {
      try {
        return await node.execute(input);
      } catch (error) {
        if (i < attempts - 1) {
          await this.delay(delay);
          this.emit('node:retry', { nodeId: node.id, attempt: i + 1 });
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * 延迟
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 并行执行
   */
  async executeParallel() {
    this.validate();
    this.topologicalSort();

    const levels = this.buildLevels();
    const results = new Map();

    for (const level of levels) {
      const promises = level.map(async (nodeId) => {
        const node = this.nodes.get(nodeId);

        const input = {};
        for (const edge of this.edges.filter((e) => e.target === nodeId)) {
          if (results.has(edge.source)) {
            input[edge.source] = results.get(edge.source);
          }
        }

        const output = await this.executeNode(node, input);
        results.set(nodeId, output);
        this.emit('node:complete', { nodeId, output });

        return output;
      });

      await Promise.all(promises);
    }

    return Object.fromEntries(results);
  }

  /**
   * 构建层级（同一层可并行）
   */
  buildLevels() {
    const levels = [];
    const assigned = new Set();
    const inDegree = new Map();

    for (const nodeId of this.nodes.keys()) {
      inDegree.set(nodeId, this.edges.filter((e) => e.target === nodeId).length);
    }

    while (assigned.size < this.nodes.size) {
      const level = [];

      for (const [nodeId, degree] of inDegree) {
        if (degree === 0 && !assigned.has(nodeId)) {
          level.push(nodeId);
        }
      }

      if (level.length === 0) {
        throw new Error('Unable to build levels: cycle detected');
      }

      levels.push(level);

      for (const nodeId of level) {
        assigned.add(nodeId);

        for (const edge of this.edges.filter((e) => e.source === nodeId)) {
          inDegree.set(edge.target, inDegree.get(edge.target) - 1);
        }
      }
    }

    return levels;
  }

  /**
   * 可视化工作流
   */
  visualize() {
    const nodes = Array.from(this.nodes.values()).map((n) => ({
      id: n.id,
      type: n.type,
      status: n.status
    }));

    const links = this.edges.map((e) => ({
      source: e.source,
      target: e.target,
      condition: e.condition ? 'conditional' : 'direct'
    }));

    return { nodes, links };
  }
}

module.exports = { WorkflowEngine, TaskNode, DAGEdge };
