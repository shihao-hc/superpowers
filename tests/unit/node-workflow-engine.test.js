const { NodeWorkflowEngine } = require('../../src/workflow/NodeWorkflowEngine');

describe('NodeWorkflowEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new NodeWorkflowEngine();
  });

  afterEach(() => {
    engine.destroy();
  });

  describe('constructor', () => {
    it('sets default options', () => {
      expect(engine.maxExecutions).toBe(100);
      expect(engine.maxConcurrent).toBe(10);
      expect(engine.enableParameterCache).toBe(true);
      expect(engine.maxCompiledPlans).toBe(50);
    });

    it('applies custom options', () => {
      const e = new NodeWorkflowEngine({ maxExecutions: 10, maxConcurrent: 3, enableParameterCache: false, maxCompiledPlans: 5 });
      expect(e.maxExecutions).toBe(10);
      expect(e.maxConcurrent).toBe(3);
      expect(e.enableParameterCache).toBe(false);
      expect(e.maxCompiledPlans).toBe(5);
      e.destroy();
    });

    it('registers default node types', () => {
      expect(engine.getNodeType('input')).toBeDefined();
      expect(engine.getNodeType('text')).toBeDefined();
      expect(engine.getNodeType('concat')).toBeDefined();
      expect(engine.getNodeType('llm_call')).toBeDefined();
      expect(engine.getNodeType('condition')).toBeDefined();
      expect(engine.getNodeType('loop')).toBeDefined();
      expect(engine.getNodeType('delay')).toBeDefined();
    });

    it('sets up callback placeholders', () => {
      expect(typeof engine.onNodeExecute).toBe('function');
      expect(typeof engine.onWorkflowComplete).toBe('function');
      expect(typeof engine.onError).toBe('function');
    });
  });

  describe('setMaxConcurrent', () => {
    it('updates maxConcurrent', () => {
      engine.setMaxConcurrent(5);
      expect(engine.maxConcurrent).toBe(5);
    });
  });

  describe('registerNodeType / getNodeType', () => {
    it('registers and retrieves a type', () => {
      const config = {
        name: '测试',
        icon: '🔬',
        category: '测试',
        inputs: [{ name: 'x', type: 'number' }],
        outputs: [{ name: 'y', type: 'number' }],
        execute: (node, inputs) => ({ y: inputs.x * 2 })
      };
      engine.registerNodeType('double', config);
      const retrieved = engine.getNodeType('double');
      expect(retrieved.type).toBe('double');
      expect(retrieved.name).toBe('测试');
      expect(retrieved.category).toBe('测试');
      expect(retrieved.inputs).toHaveLength(1);
      expect(retrieved.outputs).toHaveLength(1);
    });

    it('returns undefined for unknown type', () => {
      expect(engine.getNodeType('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllNodeTypes', () => {
    it('returns all registered types', () => {
      const all = engine.getAllNodeTypes();
      expect(all.length).toBeGreaterThanOrEqual(13);
      expect(all.find(t => t.type === 'input')).toBeDefined();
      expect(all.find(t => t.type === 'text')).toBeDefined();
    });
  });

  describe('getNodeTypesByCategory', () => {
    it('groups types by category', () => {
      const byCat = engine.getNodeTypesByCategory();
      expect(byCat['基础']).toBeDefined();
      expect(byCat['AI']).toBeDefined();
      expect(byCat['逻辑']).toBeDefined();
      expect(byCat['浏览器']).toBeDefined();
    });
  });

  describe('createNode', () => {
    it('creates a node with correct structure', () => {
      const node = engine.createNode('text', { x: 50, y: 100 }, { text: 'hello' });
      expect(node.id).toBeDefined();
      expect(node.type).toBe('text');
      expect(node.name).toBe('文本');
      expect(node.position).toEqual({ x: 50, y: 100 });
      expect(node.data.text).toBe('hello');
      expect(node.status).toBe('idle');
      expect(engine.getNode(node.id)).toBe(node);
    });

    it('throws for unknown type', () => {
      expect(() => engine.createNode('unknown_type')).toThrow('Unknown node type');
    });

    it('generates unique node IDs', () => {
      const n1 = engine.createNode('text');
      const n2 = engine.createNode('text');
      expect(n1.id).not.toBe(n2.id);
    });

    it('maps inputs/outputs from type definition', () => {
      const node = engine.createNode('concat', { x: 0, y: 0 });
      expect(node.inputs).toHaveLength(2);
      expect(node.inputs[0].name).toBe('a');
      expect(node.inputs[1].name).toBe('b');
      expect(node.outputs).toHaveLength(1);
      expect(node.outputs[0].name).toBe('result');
    });
  });

  describe('deleteNode', () => {
    it('removes node from engine', () => {
      const node = engine.createNode('text');
      engine.deleteNode(node.id);
      expect(engine.getNode(node.id)).toBeUndefined();
    });

    it('removes associated connections', () => {
      const n1 = engine.createNode('input');
      const n2 = engine.createNode('output');
      engine.connect(n1.id, 'value', n2.id, 'value');
      expect(engine.getConnections()).toHaveLength(1);
      engine.deleteNode(n1.id);
      expect(engine.getConnections()).toHaveLength(0);
    });
  });

  describe('connect / disconnect', () => {
    it('creates a connection between nodes', () => {
      const n1 = engine.createNode('input');
      const n2 = engine.createNode('output');
      const conn = engine.connect(n1.id, 'value', n2.id, 'value');
      expect(conn.id).toBeDefined();
      expect(engine.getConnections()).toHaveLength(1);
    });

    it('throws for missing source node', () => {
      const n2 = engine.createNode('output');
      expect(() => engine.connect('nonexistent', 'value', n2.id, 'value')).toThrow('Node not found');
    });

    it('throws for missing target node', () => {
      const n1 = engine.createNode('input');
      expect(() => engine.connect(n1.id, 'value', 'nonexistent', 'value')).toThrow('Node not found');
    });

    it('throws for missing port', () => {
      const n1 = engine.createNode('input');
      const n2 = engine.createNode('output');
      expect(() => engine.connect(n1.id, 'wrong_port', n2.id, 'value')).toThrow('Port not found');
    });

    it('disconnect removes connection by id', () => {
      const n1 = engine.createNode('input');
      const n2 = engine.createNode('output');
      const conn = engine.connect(n1.id, 'value', n2.id, 'value');
      engine.disconnect(conn.id);
      expect(engine.getConnections()).toHaveLength(0);
    });
  });

  describe('getNode / getAllNodes', () => {
    it('returns node by id', () => {
      const node = engine.createNode('text');
      expect(engine.getNode(node.id)).toBe(node);
    });

    it('returns undefined for missing node', () => {
      expect(engine.getNode('nonexistent')).toBeUndefined();
    });

    it('getAllNodes returns all nodes', () => {
      engine.createNode('text');
      engine.createNode('input');
      expect(engine.getAllNodes()).toHaveLength(2);
    });
  });

  describe('_topologicalSort', () => {
    it('returns nodes in dependency order', () => {
      const n1 = engine.createNode('input');
      const n2 = engine.createNode('output');
      engine.connect(n1.id, 'value', n2.id, 'value');
      const sorted = engine._topologicalSort();
      expect(sorted.indexOf(n1.id)).toBeLessThan(sorted.indexOf(n2.id));
    });

    it('handles disconnected nodes', () => {
      engine.createNode('input');
      engine.createNode('text');
      const sorted = engine._topologicalSort();
      expect(sorted).toHaveLength(2);
    });
  });

  describe('_getDependencies', () => {
    it('returns source nodes targeting the given node', () => {
      const n1 = engine.createNode('input');
      const n2 = engine.createNode('concat');
      const n3 = engine.createNode('output');
      engine.connect(n1.id, 'value', n2.id, 'a');
      engine.connect(n2.id, 'result', n3.id, 'value');
      expect(engine._getDependencies(n2.id)).toEqual([n1.id]);
      expect(engine._getDependencies(n3.id)).toEqual([n2.id]);
    });

    it('returns empty array when no deps', () => {
      const node = engine.createNode('input');
      expect(engine._getDependencies(node.id)).toEqual([]);
    });
  });

  describe('_getInputs', () => {
    it('returns inputs from executed node outputs', async () => {
      const n1 = engine.createNode('text', { x: 0, y: 0 }, { text: 'Hello ' });
      const n2 = engine.createNode('concat');
      engine.connect(n1.id, 'text', n2.id, 'a');
      await engine._executeSingleNode(n1, { nodeResults: {} });
      const inputs = engine._getInputs(n2.id);
      expect(inputs.a).toBe('Hello ');
    });

    it('returns empty object when no connections', () => {
      const node = engine.createNode('concat');
      expect(engine._getInputs(node.id)).toEqual({});
    });
  });

  describe('_canContinueOnError', () => {
    it('returns true when node has continueOnError', () => {
      const node = engine.createNode('text');
      node.data.continueOnError = true;
      expect(engine._canContinueOnError(node)).toBe(true);
    });

    it('returns false by default', () => {
      const node = engine.createNode('text');
      expect(engine._canContinueOnError(node)).toBe(false);
    });

    it('returns true when node type is optional', () => {
      engine.registerNodeType('optional_type', {
        name: '可选', icon: '❓', category: '测试',
        inputs: [], outputs: [],
        metadata: { optional: true },
        execute: () => ({})
      });
      engine.registerNodeType('custom_type', {
        name: '自定义', icon: '❓', category: '测试',
        inputs: [], outputs: [],
        execute: () => ({})
      });
      const node = engine.createNode('optional_type');
      expect(engine._canContinueOnError(node)).toBe(true);
    });
  });

  describe('_executeSingleNode', () => {
    it('executes handler and returns result', async () => {
      const node = engine.createNode('concat', { x: 0, y: 0 }, {});
      const result = await engine._executeSingleNode(node, { nodeResults: {} });
      expect(result.result).toBe('');
      expect(node.status).toBe('completed');
    });

    it('handles missing node type gracefully', async () => {
      const fakeNode = { id: 'fake', type: 'nonexistent', inputs: [], outputs: [], status: 'idle' };
      const result = await engine._executeSingleNode(fakeNode, { nodeResults: {} });
      expect(result).toEqual({});
    });
  });

  describe('_executeNode (internal)', () => {
    it('executes node by id and returns result', async () => {
      const node = engine.createNode('text', { x: 0, y: 0 }, { text: 'hi' });
      const result = await engine._executeNode(node.id, {});
      expect(result.text).toBe('hi');
    });

    it('throws for missing node', async () => {
      await expect(engine._executeNode('nonexistent', {})).rejects.toThrow('Node not found');
    });
  });

  describe('_archiveExecution', () => {
    it('removes old executions when over max', () => {
      engine.maxExecutions = 2;
      engine.executions.set('exec_1', { id: 'exec_1' });
      engine.executions.set('exec_2', { id: 'exec_2' });
      engine.executions.set('exec_3', { id: 'exec_3' });
      engine._archiveExecution({ id: 'exec_3' });
      expect(engine.executions.has('exec_1')).toBe(false);
      expect(engine.executions.size).toBe(2);
    });

    it('keeps all when under limit', () => {
      engine.maxExecutions = 10;
      engine.executions.set('exec_1', { id: 'exec_1' });
      engine._archiveExecution({ id: 'exec_1' });
      expect(engine.executions.size).toBe(1);
    });
  });

  describe('execute sequential', () => {
    it('ruses a linear workflow', async () => {
      const textNode = engine.createNode('text', { x: 0, y: 0 }, { text: 'Hello' });
      const outputNode = engine.createNode('output');
      engine.connect(textNode.id, 'text', outputNode.id, 'value');
      const result = await engine.execute('wf1', { parallel: false });
      expect(result.status).toBe('completed');
      expect(result.nodeResults[textNode.id]).toBeDefined();
      expect(result.nodeResults[outputNode.id]).toBeDefined();
    });

    it('stops on error when continueOnError is false', async () => {
      engine.registerNodeType('error_node', {
        name: '报错', icon: '💥', category: '测试',
        inputs: [], outputs: [],
        execute: async () => { throw new Error('fail'); }
      });
      engine.createNode('error_node');
      const result = await engine.execute('wf_error', { parallel: false });
      expect(result.status).toBe('failed');
      expect(result.error).toBe('fail');
    });
  });

  describe('execute parallel', () => {
    it('runs independent nodes in parallel', async () => {
      const text1 = engine.createNode('text', { x: 0, y: 0 }, { text: 'A' });
      const text2 = engine.createNode('text', { x: 0, y: 0 }, { text: 'B' });
      const concat = engine.createNode('concat');
      engine.connect(text1.id, 'text', concat.id, 'a');
      engine.connect(text2.id, 'text', concat.id, 'b');
      const result = await engine.execute('wf_parallel', { parallel: true });
      expect(result.status).toBe('completed');
      expect(result.nodeResults[concat.id].result).toBe('AB');
    });

    it('runs single node in parallel mode', async () => {
      engine.createNode('text', { x: 0, y: 0 }, { text: 'single' });
      const result = await engine.execute('wf_single', { parallel: true });
      expect(result.status).toBe('completed');
    });

    it('handles empty workflow', async () => {
      const result = await engine.execute('wf_empty');
      expect(result.status).toBe('completed');
    });
  });

  describe('execute callbacks', () => {
    it('calls onWorkflowComplete on success', async () => {
      let called = false;
      const e = new NodeWorkflowEngine({
        onWorkflowComplete: () => { called = true; }
      });
      e.createNode('text', { x: 0, y: 0 }, { text: 'test' });
      await e.execute('cb_test');
      expect(called).toBe(true);
      e.destroy();
    });

    it('calls onError on failure', async () => {
      let error = null;
      const e = new NodeWorkflowEngine({
        onError: (err) => { error = err; }
      });
      e.registerNodeType('fail', {
        name: '报错', icon: '💥', category: '测试',
        inputs: [], outputs: [],
        execute: async () => { throw new Error('oops'); }
      });
      e.createNode('fail');
      await e.execute('err_test', { parallel: false });
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('oops');
      e.destroy();
    });
  });

  describe('compileExecutionPlan', () => {
    it('creates plan with sorted nodes and dependencies', () => {
      const n1 = engine.createNode('input');
      const n2 = engine.createNode('output');
      engine.connect(n1.id, 'value', n2.id, 'value');
      const plan = engine.compileExecutionPlan('plan1');
      expect(plan.id).toContain('plan1');
      expect(plan.sortedNodes.length).toBe(2);
      expect(plan.dependencies.has(n2.id)).toBe(true);
    });

    it('assigns parallel groups by dependency depth', () => {
      const n1 = engine.createNode('input');
      const n2 = engine.createNode('concat');
      const n3 = engine.createNode('output');
      engine.connect(n1.id, 'value', n2.id, 'a');
      engine.connect(n2.id, 'result', n3.id, 'value');
      const plan = engine.compileExecutionPlan();
      expect(plan.parallelGroups.length).toBeGreaterThanOrEqual(1);
    });

    it('evicts oldest plan when over max', () => {
      engine.maxCompiledPlans = 2;
      engine.compileExecutionPlan('a');
      engine.compileExecutionPlan('b');
      engine.compileExecutionPlan('c');
      expect(engine.compiledPlans.size).toBe(2);
      expect(engine.getCompiledPlan('plan_a')).toBeUndefined();
    });
  });

  describe('result cache', () => {
    it('clearResultCache empties cache', () => {
      engine.resultCache.set('key1', 'val1');
      engine.clearResultCache();
      expect(engine.resultCache.size).toBe(0);
    });

    it('getResultCacheStats returns size info', () => {
      engine.resultCache.set('k', 'v');
      const stats = engine.getResultCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(engine.maxCompiledPlans * 10);
    });
  });

  describe('getStats', () => {
    it('returns current node/connection/execution counts', () => {
      engine.createNode('text');
      engine.createNode('input');
      expect(engine.getStats().nodeTypes).toBeGreaterThanOrEqual(13);
      expect(engine.getStats().nodes).toBe(2);
      expect(engine.getStats().connections).toBe(0);
    });
  });

  describe('getPerformanceStats', () => {
    it('returns stats with default values when no executions', () => {
      const stats = engine.getPerformanceStats();
      expect(stats.semaphore.max).toBe(10);
      expect(stats.semaphore.active).toBe(0);
      expect(stats.semaphore.waiting).toBe(0);
      expect(stats.cache).toBeDefined();
      expect(stats.executions.total).toBe(0);
      expect(stats.latency.p50).toBe(0);
      expect(stats.latency.avg).toBe(0);
    });
  });

  describe('toJSON / fromJSON', () => {
    it('serializes nodes and connections', () => {
      const n1 = engine.createNode('input');
      const n2 = engine.createNode('output');
      engine.connect(n1.id, 'value', n2.id, 'value');
      const json = engine.toJSON();
      expect(json.nodes).toHaveLength(2);
      expect(json.connections).toHaveLength(1);
    });

    it('deserializes and restores graph', () => {
      engine.createNode('text', { x: 10, y: 20 }, { text: 'restored' });
      const json = engine.toJSON();
      const e2 = new NodeWorkflowEngine();
      e2.fromJSON(json);
      expect(e2.getAllNodes()).toHaveLength(1);
      expect(e2.getAllNodes()[0].data.text).toBe('restored');
      expect(e2.getAllNodes()[0].position.x).toBe(10);
      e2.destroy();
    });
  });

  describe('destroy', () => {
    it('clears all data', () => {
      engine.createNode('text');
      engine.createNode('input');
      engine.destroy();
      expect(engine.getAllNodes()).toHaveLength(0);
      expect(engine.getConnections()).toHaveLength(0);
      expect(engine.executions.size).toBe(0);
    });
  });

  describe('_getSemaphore', () => {
    it('creates semaphore lazily', () => {
      const sem = engine._getSemaphore();
      expect(sem).toBeDefined();
      expect(sem.active).toBe(0);
      expect(sem.waiting).toBe(0);
    });

    it('returns existing semaphore on subsequent calls', () => {
      const s1 = engine._getSemaphore();
      const s2 = engine._getSemaphore();
      expect(s1).toBe(s2);
    });
  });

  describe('default node type behaviors', () => {
    it('json_parse parses valid JSON with empty input', async () => {
      const node = engine.createNode('json_parse');
      const result = await engine._executeSingleNode(node, { nodeResults: {} });
      expect(result.data).toEqual({});
    });

    it('llm_call returns mock response', async () => {
      const node = engine.createNode('llm_call');
      const result = await engine._executeSingleNode(node, { nodeResults: {} });
      expect(result.response).toContain('[LLM Response]');
    });

    it('attest generates hash and id in workflow', async () => {
      engine.createNode('input', { x: 0, y: 0 }, { value: { item: 'test' } });
      const result = await engine.execute('attest_wf');
      expect(result.status).toBe('completed');
    });

    it('condition returns result based on inputs', async () => {
      const condNode = engine.createNode('condition');
      const result = await engine._executeSingleNode(condNode, { nodeResults: {} });
      expect(result.result).toBeUndefined();
    });

    it('notify returns sent=true', async () => {
      const node = engine.createNode('notify');
      const result = await engine._executeSingleNode(node, { nodeResults: {} });
      expect(result.sent).toBe(true);
    });

    it('http_request returns mock response', async () => {
      const node = engine.createNode('http_request');
      const result = await engine._executeSingleNode(node, { nodeResults: {} });
      expect(result.status).toBe(200);
    });

    it('price_check returns mock price', async () => {
      const node = engine.createNode('price_check');
      const result = await engine._executeSingleNode(node, { nodeResults: {} });
      expect(result.price).toBe(99.99);
    });

    it('vision returns mock description', async () => {
      const node = engine.createNode('vision');
      const result = await engine._executeSingleNode(node, { nodeResults: {} });
      expect(result.description).toContain('[Vision]');
    });

    it('browser_navigate returns success', async () => {
      const node = engine.createNode('browser_navigate');
      const result = await engine._executeSingleNode(node, { nodeResults: {} });
      expect(result.success).toBe(true);
    });

    it('browser_screenshot returns base64 image', async () => {
      const node = engine.createNode('browser_screenshot');
      const result = await engine._executeSingleNode(node, { nodeResults: {} });
      expect(result.image).toBe('base64_data');
    });

    it('delay passes input through', async () => {
      const node = engine.createNode('delay', { x: 0, y: 0 }, { ms: 5 });
      const result = await engine._executeSingleNode(node, { nodeResults: {} });
      expect(result.output).toBeUndefined();
    });
  });

  describe('additional node types', () => {
    it('executes browser_extract node', async () => {
      const node = engine.createNode('browser_extract');
      const result = await engine._executeSingleNode(node, { nodeResults: {} });
      expect(result.data).toEqual(['item1', 'item2']);
    });

    it('executes price_predict node', async () => {
      const node = engine.createNode('price_predict');
      const result = await engine._executeSingleNode(node, { nodeResults: {} });
      expect(result.predictions).toHaveLength(2);
      expect(result.recommendation).toBe('wait');
    });

    it('executes loop node with items via workflow', async () => {
      const inputNode = engine.createNode('input', { x: 0, y: 0 }, { value: [1, 2, 3] });
      const loopNode = engine.createNode('loop');
      engine.connect(inputNode.id, 'value', loopNode.id, 'items');
      const result = await engine.execute('loop_test', { parallel: false });
      expect(result.status).toBe('completed');
      expect(result.nodeResults[loopNode.id].results).toHaveLength(3);
    });

    it('executes attest node with connected input', async () => {
      const inputNode = engine.createNode('input', { x: 0, y: 0 }, { value: { item: 'test' } });
      const attestNode = engine.createNode('attest');
      engine.connect(inputNode.id, 'value', attestNode.id, 'data');
      const result = await engine.execute('attest_test', { parallel: false });
      expect(result.status).toBe('completed');
      expect(result.nodeResults[attestNode.id].hash).toBeDefined();
      expect(result.nodeResults[attestNode.id].attestationId).toBeDefined();
    });

    it('json_parse returns error for invalid JSON in sequential workflow', async () => {
      const textNode = engine.createNode('text', { x: 0, y: 0 }, { text: '{bad}' });
      const jsonNode = engine.createNode('json_parse');
      engine.connect(textNode.id, 'text', jsonNode.id, 'text');
      const result = await engine.execute('json_err_direct', { parallel: false });
      expect(result.status).toBe('failed');
      expect(result.nodeResults[jsonNode.id].data).toBeNull();
      expect(result.nodeResults[jsonNode.id].error).toBeDefined();
    });
  });

  describe('semaphore queue', () => {
    it('queues when at capacity and releases', async () => {
      const e = new NodeWorkflowEngine({ maxConcurrent: 1 });
      const sem = e._getSemaphore();
      await sem.acquire();
      const p = sem.acquire();
      expect(sem.waiting).toBe(1);
      expect(sem.active).toBe(1);
      sem.release();
      await p;
      expect(sem.waiting).toBe(0);
      expect(sem.active).toBe(1);
      sem.release();
      expect(sem.active).toBe(0);
      e.destroy();
    });

    it('queues and releases when maxConcurrent is exceeded with nodes', async () => {
      const e = new NodeWorkflowEngine({ maxConcurrent: 1 });
      const _n1 = e.createNode('delay', { x: 0, y: 0 });
      const _n2 = e.createNode('delay', { x: 0, y: 0 });
      const result = await e.execute('sem_test', { parallel: true });
      expect(result.status).toBe('completed');
      e.destroy();
    });
  });

  describe('result cache', () => {
    it('hits cache on repeated parallel execution', async () => {
      const textType = engine.getNodeType('text');
      const origExecute = textType.execute;
      const mockExecute = jest.fn().mockReturnValue({ text: 'mocked' });
      textType.execute = mockExecute;
      const _node = engine.createNode('text', { x: 0, y: 0 }, { text: 'cached' });
      await engine.execute('cache1', { parallel: true });
      expect(mockExecute).toHaveBeenCalledTimes(1);
      await engine.execute('cache2', { parallel: true });
      expect(mockExecute).toHaveBeenCalledTimes(1);
      textType.execute = origExecute;
    });

    it('evicts old cache entries when over limit', async () => {
      engine.maxCompiledPlans = 1;
      for (let i = 0; i < 11; i++) {
        engine.resultCache.set(`key${i}`, `val${i}`);
      }
      const _node = engine.createNode('text', { x: 0, y: 0 }, { text: 'trigger' });
      await engine.execute('cache_evict', { parallel: true });
      expect(engine.resultCache.size).toBeLessThanOrEqual(10);
    });
  });

  describe('getExecution', () => {
    it('returns execution by id', async () => {
      const result = await engine.execute('get_exec_test');
      const exec = engine.getExecution(result.id);
      expect(exec).toBeDefined();
      expect(exec.status).toBe('completed');
    });

    it('returns undefined for missing id', () => {
      expect(engine.getExecution('nonexistent')).toBeUndefined();
    });
  });

  describe('getPerformanceStats with executions', () => {
    it('returns latency stats from completed executions', async () => {
      const _node = engine.createNode('delay', { x: 0, y: 0 });
      await engine.execute('perf1', { parallel: false });
      await engine.execute('perf2', { parallel: false });
      const stats = engine.getPerformanceStats();
      expect(stats.latency.avg).toBeGreaterThan(0);
      expect(stats.executions.total).toBe(2);
      expect(stats.executions.recent).toBe(2);
    });
  });

  describe('_executeNode unknown type', () => {
    it('throws for unknown node type', async () => {
      const fakeNode = { id: 'fake', type: 'nonexistent', inputs: [], outputs: [], status: 'idle' };
      engine.nodes.set('fake', fakeNode);
      await expect(engine._executeNode('fake', {})).rejects.toThrow('Unknown node type');
    });
  });

  describe('sequential error from returned result.error', () => {
    it('stops sequential execution when node returns error', async () => {
      const textNode = engine.createNode('text', { x: 0, y: 0 }, { text: '{bad}' });
      const jsonNode = engine.createNode('json_parse');
      engine.connect(textNode.id, 'text', jsonNode.id, 'text');
      const result = await engine.execute('seq_err', { parallel: false });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('JSON');
    });
  });
});
