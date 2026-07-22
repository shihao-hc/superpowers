const { ParallelWorkflowEngine } = require('../../src/workflow/ParallelWorkflowEngine');

const DEFAULT_NODE_COUNT = 20;

function createEngine(options = {}) {
  return new ParallelWorkflowEngine(options);
}

describe('ParallelWorkflowEngine', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  describe('constructor', () => {
    test('initializes with default values', () => {
      expect(engine.nodes).toBeInstanceOf(Map);
      expect(engine.nodes.size).toBe(0);
      expect(engine.connections).toEqual([]);
      expect(engine.nodeTypes).toBeInstanceOf(Map);
      expect(engine.cacheEnabled).toBe(true);
      expect(engine.maxConcurrent).toBe(5);
      expect(engine.debugMode).toBe(false);
      expect(engine.breakpoints).toBeInstanceOf(Set);
      expect(engine.executionLogs).toEqual([]);
      expect(engine.maxLogs).toBe(1000);
    });

    test('constructor with no arguments triggers default parameter', () => {
      const e = new ParallelWorkflowEngine();
      expect(e.nodes).toBeInstanceOf(Map);
      expect(e.cacheEnabled).toBe(true);
    });

    test('initializes callbacks as no-ops', () => {
      expect(() => engine.onNodeStart({})).not.toThrow();
      expect(() => engine.onNodeComplete({})).not.toThrow();
      expect(() => engine.onNodeError({})).not.toThrow();
      expect(() => engine.onBreakpoint({})).not.toThrow();
    });

    test('registers default node types', () => {
      const expectedTypes = [
        'input', 'output', 'text', 'number', 'concat', 'llm_call',
        'vision', 'http_request', 'condition', 'switch', 'loop',
        'parallel', 'delay', 'json_parse', 'notify', 'attest',
        'sub_workflow', 'filter', 'map', 'merge'
      ];
      expect(engine.nodeTypes.size).toBe(DEFAULT_NODE_COUNT);
      for (const type of expectedTypes) {
        expect(engine.nodeTypes.has(type)).toBe(true);
      }
    });

    test('custom options override defaults', () => {
      const custom = createEngine({
        cacheEnabled: false,
        maxConcurrent: 10,
        debugMode: true,
        maxLogs: 500
      });
      expect(custom.cacheEnabled).toBe(false);
      expect(custom.maxConcurrent).toBe(10);
      expect(custom.debugMode).toBe(true);
      expect(custom.maxLogs).toBe(500);
    });

    test('cacheEnabled defaults to true when options empty', () => {
      expect(engine.cacheEnabled).toBe(true);
    });

    test('maxConcurrent defaults to 5 when not provided', () => {
      expect(engine.maxConcurrent).toBe(5);
    });

    test('custom callbacks are stored', () => {
      const onStart = jest.fn();
      const onError = jest.fn();
      const e2 = createEngine({ onNodeStart: onStart, onNodeError: onError });
      expect(e2.onNodeStart).toBe(onStart);
      expect(e2.onNodeError).toBe(onError);
    });
  });

  describe('registerNodeType', () => {
    test('stores type config with all fields', () => {
      const executeFn = jest.fn();
      engine.registerNodeType('custom_type', {
        name: 'Custom', icon: '🔧', category: 'Test',
        inputs: [{ name: 'x', type: 'number' }],
        outputs: [{ name: 'y', type: 'number' }],
        execute: executeFn,
        hasSideEffect: false,
        defaultData: { x: 0 }
      });

      const stored = engine.nodeTypes.get('custom_type');
      expect(stored.type).toBe('custom_type');
      expect(stored.name).toBe('Custom');
      expect(stored.icon).toBe('🔧');
      expect(stored.category).toBe('Test');
      expect(stored.inputs).toEqual([{ name: 'x', type: 'number' }]);
      expect(stored.outputs).toEqual([{ name: 'y', type: 'number' }]);
      expect(stored.execute).toBe(executeFn);
      expect(stored.hasSideEffect).toBe(false);
      expect(stored.defaultData).toEqual({ x: 0 });
    });

    test('default hasSideEffect is true', () => {
      engine.registerNodeType('side_effect_default', {
        name: 'SE', icon: '⚡', category: 'Test',
        execute: jest.fn()
      });

      const stored = engine.nodeTypes.get('side_effect_default');
      expect(stored.hasSideEffect).toBe(true);
    });

    test('defaultData defaults to empty object', () => {
      engine.registerNodeType('no_default_data', {
        name: 'ND', icon: '⚡', category: 'Test',
        execute: jest.fn()
      });

      const stored = engine.nodeTypes.get('no_default_data');
      expect(stored.defaultData).toEqual({});
    });
  });

  describe('addNode', () => {
    test('throws for unknown type', () => {
      expect(() => engine.addNode('nonexistent')).toThrow('Unknown node type: nonexistent');
    });

    test('creates node with prefixed ID', () => {
      const node = engine.addNode('text', { text: 'hello' });
      expect(node.id).toMatch(/^node_/);
    });

    test('copies defaultData from node type and merges with data', () => {
      engine.registerNodeType('test_type', {
        name: 'Test', icon: '🔧', category: 'Test',
        inputs: [], outputs: [],
        execute: jest.fn(),
        defaultData: { a: 1, b: 2 }
      });

      const node = engine.addNode('test_type', { b: 3, c: 4 });
      expect(node.data).toEqual({ a: 1, b: 3, c: 4 });
    });

    test('maps inputs with null values', () => {
      const node = engine.addNode('concat', { a: 'hello', b: 'world' });
      expect(node.inputs).toEqual([
        { name: 'a', type: 'string', value: null },
        { name: 'b', type: 'string', value: null }
      ]);
    });

    test('maps outputs with null values', () => {
      const node = engine.addNode('text');
      expect(node.outputs).toEqual([
        { name: 'text', type: 'string', value: null }
      ]);
    });

    test('sets status to idle', () => {
      const node = engine.addNode('text');
      expect(node.status).toBe('idle');
    });

    test('adds node to nodes map', () => {
      const node = engine.addNode('text');
      expect(engine.nodes.get(node.id)).toBe(node);
    });

    test('uses data.name override', () => {
      const node = engine.addNode('text', { name: 'My Text' });
      expect(node.name).toBe('My Text');
    });
  });

  describe('deleteNode', () => {
    test('removes node from nodes map', () => {
      const node = engine.addNode('text');
      engine.deleteNode(node.id);
      expect(engine.nodes.has(node.id)).toBe(false);
    });

    test('removes connections to and from node', () => {
      const a = engine.addNode('input', { value: 1 });
      const b = engine.addNode('output');
      const c = engine.addNode('output');
      engine.connect(a.id, 'value', b.id, 'value');
      engine.connect(a.id, 'value', c.id, 'value');
      expect(engine.connections.length).toBe(2);

      engine.deleteNode(a.id);
      expect(engine.connections.length).toBe(0);
    });

    test('does nothing when node does not exist', () => {
      expect(() => engine.deleteNode('nonexistent')).not.toThrow();
    });
  });

  describe('connect / disconnect', () => {
    test('connect creates connection with conn_ prefixed ID', () => {
      const a = engine.addNode('input');
      const b = engine.addNode('output');
      const conn = engine.connect(a.id, 'value', b.id, 'value');

      expect(conn.id).toMatch(/^conn_/);
      expect(engine.connections.length).toBe(1);
      expect(engine.connections[0].source.nodeId).toBe(a.id);
      expect(engine.connections[0].source.output).toBe('value');
      expect(engine.connections[0].target.nodeId).toBe(b.id);
      expect(engine.connections[0].target.input).toBe('value');
    });

    test('disconnect removes connection by ID', () => {
      const a = engine.addNode('input');
      const b = engine.addNode('output');
      const { id } = engine.connect(a.id, 'value', b.id, 'value');

      engine.disconnect(id);
      expect(engine.connections.length).toBe(0);
    });

    test('disconnect with nonexistent ID does nothing', () => {
      engine.disconnect('nonexistent');
      expect(engine.connections.length).toBe(0);
    });

    test('multiple connections between nodes', () => {
      const a = engine.addNode('input', { value: 1 });
      const b = engine.addNode('concat');
      engine.connect(a.id, 'value', b.id, 'a');
      engine.connect(a.id, 'value', b.id, 'b');
      expect(engine.connections.length).toBe(2);
    });
  });

  describe('addBreakpoint / removeBreakpoint', () => {
    test('adds and removes breakpoints', () => {
      engine.addBreakpoint('node_abc');
      expect(engine.breakpoints.has('node_abc')).toBe(true);

      engine.removeBreakpoint('node_abc');
      expect(engine.breakpoints.has('node_abc')).toBe(false);
    });

    test('addBreakpoint is idempotent', () => {
      engine.addBreakpoint('node_abc');
      engine.addBreakpoint('node_abc');
      expect(engine.breakpoints.size).toBe(1);
    });

    test('removeBreakpoint on nonexistent does nothing', () => {
      engine.removeBreakpoint('nonexistent');
      expect(engine.breakpoints.size).toBe(0);
    });
  });

  describe('clearCache', () => {
    test('clears cache map', () => {
      engine.cache.set('key1', 'value1');
      engine.cache.set('key2', 'value2');
      expect(engine.cache.size).toBe(2);

      engine.clearCache();
      expect(engine.cache.size).toBe(0);
    });
  });

  describe('_buildDependencyGraph', () => {
    test('returns Map with empty arrays for unconnected nodes', () => {
      engine.addNode('input');
      engine.addNode('output');
      const graph = engine._buildDependencyGraph();
      expect(graph.size).toBe(2);
      for (const deps of graph.values()) {
        expect(deps).toEqual([]);
      }
    });

    test('correctly resolves connections into dependencies', () => {
      const a = engine.addNode('input', { value: 1 });
      const b = engine.addNode('output');
      engine.connect(a.id, 'value', b.id, 'value');

      const graph = engine._buildDependencyGraph();
      expect(graph.get(a.id)).toEqual([]);
      expect(graph.get(b.id)).toEqual([a.id]);
    });

    test('handles chain of nodes', () => {
      const a = engine.addNode('input', { value: 1 });
      const b = engine.addNode('concat');
      const c = engine.addNode('output');
      engine.connect(a.id, 'value', b.id, 'a');
      engine.connect(b.id, 'result', c.id, 'value');

      const graph = engine._buildDependencyGraph();
      expect(graph.get(a.id)).toEqual([]);
      expect(graph.get(b.id)).toEqual([a.id]);
      expect(graph.get(c.id)).toEqual([b.id]);
    });

    test('does not duplicate dependencies', () => {
      const a = engine.addNode('input', { value: 1 });
      const b = engine.addNode('output');
      engine.connect(a.id, 'value', b.id, 'value');
      engine.connect(a.id, 'value', b.id, 'value');

      const graph = engine._buildDependencyGraph();
      expect(graph.get(b.id)).toEqual([a.id]);
    });

    test('returns empty Map when no nodes', () => {
      const graph = engine._buildDependencyGraph();
      expect(graph.size).toBe(0);
    });
  });

  describe('_getInputs', () => {
    test('returns object with input values from upstream results', () => {
      const a = engine.addNode('input', { value: 42 });
      const b = engine.addNode('output');
      engine.connect(a.id, 'value', b.id, 'value');

      const results = new Map();
      results.set(a.id, { value: 42 });

      const inputs = engine._getInputs(b.id, results);
      expect(inputs).toEqual({ value: 42 });
    });

    test('returns empty object when no connections', () => {
      const node = engine.addNode('text');
      const inputs = engine._getInputs(node.id, new Map());
      expect(inputs).toEqual({});
    });

    test('returns only connected inputs', () => {
      const a = engine.addNode('input', { value: 10 });
      const b = engine.addNode('concat');
      engine.connect(a.id, 'value', b.id, 'a');

      const results = new Map();
      results.set(a.id, { value: 10 });

      const inputs = engine._getInputs(b.id, results);
      expect(inputs).toEqual({ a: 10 });
    });

    test('skips missing source results', () => {
      const a = engine.addNode('input', { value: 1 });
      const b = engine.addNode('output');
      engine.connect(a.id, 'value', b.id, 'value');

      const inputs = engine._getInputs(b.id, new Map());
      expect(inputs).toEqual({});
    });
  });

  describe('_getCacheKey', () => {
    test('returns string combining type:id:JSON inputs', () => {
      const node = engine.addNode('text', { text: 'hello' });
      const inputs = { value: 1 };
      const key = engine._getCacheKey(node, inputs);
      expect(key).toBe(`text:${node.id}:{"value":1}`);
    });

    test('different inputs produce different keys', () => {
      const node = engine.addNode('text', { text: 'hello' });
      const key1 = engine._getCacheKey(node, { a: 1 });
      const key2 = engine._getCacheKey(node, { a: 2 });
      expect(key1).not.toBe(key2);
    });

    test('different node IDs produce different keys for same inputs', () => {
      const node1 = engine.addNode('text', { text: 'a' });
      const node2 = engine.addNode('text', { text: 'b' });
      const key1 = engine._getCacheKey(node1, {});
      const key2 = engine._getCacheKey(node2, {});
      expect(key1).not.toBe(key2);
    });
  });

  describe('_log', () => {
    test('adds entry to executionLogs with timestamp', () => {
      const before = Date.now();
      engine._log('node1', 'test_event', { some: 'data' });
      const after = Date.now();

      expect(engine.executionLogs.length).toBe(1);
      const entry = engine.executionLogs[0];
      expect(entry.nodeId).toBe('node1');
      expect(entry.event).toBe('test_event');
      expect(entry.data).toEqual({ some: 'data' });
      expect(entry.timestamp).toBeGreaterThanOrEqual(before);
      expect(entry.timestamp).toBeLessThanOrEqual(after);
    });

    test('trims logs when exceeding maxLogs', () => {
      engine.maxLogs = 10;
      for (let i = 0; i < 15; i++) {
        engine._log(`node${i}`, 'test', { i });
      }
      // Trim triggers when length > maxLogs (10):
      // Entry 11 trims to last maxLogs/2=5, entries 12-15 don't retrigger
      expect(engine.executionLogs.length).toBe(9);
      expect(engine.executionLogs[0].nodeId).toBe('node6');
    });

    test('debugMode logs to console', () => {
      const debugEngine = createEngine({ debugMode: true });
      const spy = jest.spyOn(console, 'log').mockImplementation();
      debugEngine._log('node1', 'test', { key: 'val' });
      expect(spy).toHaveBeenCalledWith('[Workflow] node1: test', { key: 'val' });
      spy.mockRestore();
    });

    test('non-debugMode does not log to console', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation();
      engine._log('node1', 'test', {});
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('_waitForResume', () => {
    test('removes breakpoint and resolves', async () => {
      engine.breakpoints.add('node_test');
      await engine._waitForResume('node_test');
      expect(engine.breakpoints.has('node_test')).toBe(false);
    });
  });

  describe('executeParallel', () => {
    test('executes a simple text node', async () => {
      engine.addNode('text', { text: 'hello' });
      const result = await engine.executeParallel();
      expect(result.completed).toBe(1);
      expect(result.total).toBe(1);
    });

    test('executes connected nodes in order', async () => {
      const input = engine.addNode('input', { value: 'test' });
      const output = engine.addNode('output');
      engine.connect(input.id, 'value', output.id, 'value');

      const result = await engine.executeParallel();
      expect(result.completed).toBe(2);
      expect(result.total).toBe(2);

      const outputNode = engine.nodes.get(output.id);
      expect(outputNode.status).toBe('completed');
      expect(result.results[output.id]).toEqual({ result: 'test' });
    });

    test('caches result when cacheEnabled && !hasSideEffect', async () => {
      const node = engine.addNode('text', { text: 'cached' });
      const spy = jest.spyOn(engine.nodeTypes.get('text'), 'execute');

      await engine.executeParallel();
      expect(spy).toHaveBeenCalledTimes(1);

      // Reset status so the node runs again
      node.status = 'idle';
      await engine.executeParallel();
      // Cache hit — execute should not be called again
      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockRestore();
    });

    test('skips cache when cacheEnabled is false', async () => {
      const engine2 = createEngine({ cacheEnabled: false });
      const node = engine2.addNode('text', { text: 'no-cache' });
      const spy = jest.spyOn(engine2.nodeTypes.get('text'), 'execute');

      await engine2.executeParallel();
      node.status = 'idle';
      await engine2.executeParallel();
      expect(spy).toHaveBeenCalledTimes(2);

      spy.mockRestore();
    });

    test('skips cache when hasSideEffect is true', async () => {
      const node = engine.addNode('http_request');
      const spy = jest.spyOn(engine.nodeTypes.get('http_request'), 'execute');

      await engine.executeParallel();
      node.status = 'idle';
      await engine.executeParallel();
      expect(spy).toHaveBeenCalledTimes(2);

      spy.mockRestore();
    });

    test('handles breakpoints', async () => {
      const node = engine.addNode('text', { text: 'break' });
      engine.addBreakpoint(node.id);
      engine.onBreakpoint = jest.fn();

      const resultPromise = engine.executeParallel();

      // Since _waitForResume resolves immediately, it should complete
      const result = await resultPromise;
      expect(result.completed).toBe(1);
      expect(engine.onBreakpoint).toHaveBeenCalled();
    });

    test('error handling sets node status to failed and calls onNodeError', async () => {
      const badType = 'bad_type';
      engine.registerNodeType(badType, {
        name: 'Bad', icon: '💥', category: 'Test',
        inputs: [], outputs: [],
        execute: () => { throw new Error('boom'); }
      });

      engine.onNodeError = jest.fn();
      engine.addNode(badType);

      const result = await engine.executeParallel();
      expect(result.completed).toBe(0);
      expect(result.total).toBe(1);

      // When node fails, it doesn't get added to results, so check status differently
      for (const [, n] of engine.nodes) {
        expect(n.status).toBe('failed');
        expect(n.error).toBe('boom');
      }
      expect(engine.onNodeError).toHaveBeenCalled();
    });

    test('calls onNodeStart and onNodeComplete callbacks', async () => {
      const onStart = jest.fn();
      const onComplete = jest.fn();
      const engine2 = createEngine({ onNodeStart: onStart, onNodeComplete: onComplete });

      engine2.addNode('text', { text: 'cb' });
      await engine2.executeParallel();

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onStart).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'text' })
      );
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'text' })
      );
    });

    test('respects maxConcurrent batch processing', async () => {
      const engine2 = createEngine({ maxConcurrent: 2 });

      for (let i = 0; i < 5; i++) {
        engine2.addNode('text', { text: `n${i}` });
      }

      const result = await engine2.executeParallel();
      expect(result.completed).toBe(5);
      expect(result.total).toBe(5);
    });

    test('returns results, logs, completed, total', async () => {
      engine.addNode('input', { value: 99 });
      const result = await engine.executeParallel();

      expect(result).toHaveProperty('completed', 1);
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('logs');
      expect(Array.isArray(result.logs)).toBe(true);
    });

    test('handles empty engine', async () => {
      const result = await engine.executeParallel();
      expect(result.completed).toBe(0);
      expect(result.total).toBe(0);
    });

    test('handles deleted node during execution', async () => {
      const engine2 = createEngine();
      const node = engine2.addNode('text', { text: 'test' });
      engine2.deleteNode(node.id);
      const result = await engine2.executeParallel();
      expect(result.completed).toBe(0);
    });

    test('executes chained nodes (input -> concat -> output)', async () => {
      const input = engine.addNode('input', { value: 'Hello' });
      const concat = engine.addNode('concat');
      const output = engine.addNode('output');

      engine.connect(input.id, 'value', concat.id, 'a');
      engine.connect(input.id, 'value', concat.id, 'b');
      engine.connect(concat.id, 'result', output.id, 'value');

      const result = await engine.executeParallel();
      expect(result.completed).toBe(3);

      expect(result.results[concat.id]).toEqual({ result: 'HelloHello' });
      expect(result.results[output.id]).toEqual({ result: 'HelloHello' });
    });
  });

  describe('getExecutionLogs', () => {
    test('returns all logs when no nodeId', () => {
      engine._log('a', 'e1', {});
      engine._log('a', 'e2', {});
      engine._log('b', 'e3', {});
      const logs = engine.getExecutionLogs();
      expect(logs.length).toBe(3);
    });

    test('filters by nodeId', () => {
      engine._log('a', 'e1', {});
      engine._log('b', 'e2', {});
      engine._log('a', 'e3', {});
      const logs = engine.getExecutionLogs('a');
      expect(logs.length).toBe(2);
      expect(logs.every((l) => l.nodeId === 'a')).toBe(true);
    });

    test('returns last N entries by limit', () => {
      for (let i = 0; i < 10; i++) {
        engine._log(`n${i}`, 'test', { i });
      }
      const logs = engine.getExecutionLogs(null, 3);
      expect(logs.length).toBe(3);
      expect(logs[0].nodeId).toBe('n7');
      expect(logs[2].nodeId).toBe('n9');
    });

    test('returns empty array when no matching logs', () => {
      const logs = engine.getExecutionLogs('nonexistent');
      expect(logs).toEqual([]);
    });
  });

  describe('getStats', () => {
    test('returns correct stats', () => {
      engine.addNode('text');
      engine.addNode('number');
      engine.connect('fake-src', 'out', 'fake-tgt', 'in');
      engine.breakpoints.add('bp1');

      const stats = engine.getStats();
      expect(stats.nodes).toBe(2);
      expect(stats.connections).toBe(1);
      expect(stats.nodeTypes).toBe(20);
      expect(stats.breakpoints).toBe(1);
      expect(stats.logs).toBe(0);
      expect(stats.maxConcurrent).toBe(5);
      expect(stats.cacheSize).toBe(0);
    });

    test('empty engine stats', () => {
      const stats = engine.getStats();
      expect(stats.nodes).toBe(0);
      expect(stats.connections).toBe(0);
      expect(stats.logs).toBe(0);
      expect(stats.breakpoints).toBe(0);
      expect(stats.cacheSize).toBe(0);
    });
  });

  describe('toJSON / fromJSON', () => {
    test('toJSON returns nodes and connections', () => {
      const a = engine.addNode('text', { text: 'hello' });
      const b = engine.addNode('output');
      engine.connect(a.id, 'text', b.id, 'value');

      const json = engine.toJSON();
      expect(json).toHaveProperty('nodes');
      expect(json).toHaveProperty('connections');
      expect(json.nodes.length).toBe(2);
      expect(json.connections.length).toBe(1);
      expect(json.nodes[0]).toHaveProperty('type');
    });

    test('fromJSON restores state with idle status', () => {
      const data = {
        nodes: [
          { id: 'n1', type: 'text', name: 'T', icon: '📝', category: '基础',
            data: { text: 'hello' }, inputs: [], outputs: [],
            hasSideEffect: false, status: 'completed' }
        ],
        connections: []
      };

      engine.fromJSON(data);
      expect(engine.nodes.size).toBe(1);
      expect(engine.connections.length).toBe(0);

      const node = engine.nodes.get('n1');
      expect(node.status).toBe('idle');
      expect(node.hasSideEffect).toBe(false);
    });

    test('fromJSON with empty data', () => {
      engine.fromJSON({ nodes: [], connections: [] });
      expect(engine.nodes.size).toBe(0);
      expect(engine.connections.length).toBe(0);
    });

    test('fromJSON without nodes/connections does not throw', () => {
      expect(() => engine.fromJSON({})).not.toThrow();
    });

    test('toJSON/fromJSON round trip', () => {
      const a = engine.addNode('text', { text: 'roundtrip' });
      const b = engine.addNode('output');
      engine.connect(a.id, 'text', b.id, 'value');

      const json = engine.toJSON();
      const engine2 = createEngine();
      engine2.fromJSON(json);

      expect(engine2.nodes.size).toBe(2);
      expect(engine2.connections.length).toBe(1);
      expect(engine2.nodes.get(a.id).data.text).toBe('roundtrip');
    });
  });

  describe('destroy', () => {
    test('clears all state', () => {
      engine.addNode('text');
      engine.addNode('output');
      engine.cache.set('k', 'v');
      engine.breakpoints.add('bp');
      engine._log('n', 'e', {});

      engine.destroy();

      expect(engine.nodes.size).toBe(0);
      expect(engine.connections.length).toBe(0);
      expect(engine.cache.size).toBe(0);
      expect(engine.breakpoints.size).toBe(0);
      expect(engine.executionLogs.length).toBe(0);
    });
  });

  describe('default node types execution', () => {
    test('input: returns node.data.value', async () => {
      const node = engine.addNode('input', { value: 42 });
      const type = engine.nodeTypes.get('input');
      const result = type.execute(node);
      expect(result).toEqual({ value: 42 });
    });

    test('output: returns {result: inputs.value}', async () => {
      const type = engine.nodeTypes.get('output');
      const result = type.execute(null, { value: 'hello' });
      expect(result).toEqual({ result: 'hello' });
    });

    test('text: returns {text: node.data.text}', async () => {
      const node = engine.addNode('text', { text: 'world' });
      const type = engine.nodeTypes.get('text');
      const result = type.execute(node);
      expect(result).toEqual({ text: 'world' });
    });

    test('text: defaults to empty string', async () => {
      const node = engine.addNode('text');
      const type = engine.nodeTypes.get('text');
      const result = type.execute(node);
      expect(result).toEqual({ text: '' });
    });

    test('number: returns parsed float', async () => {
      const node = engine.addNode('number', { value: '3.14' });
      const type = engine.nodeTypes.get('number');
      const result = type.execute(node);
      expect(result).toEqual({ value: 3.14 });
    });

    test('number: returns 0 for NaN', async () => {
      const node = engine.addNode('number', { value: 'not-a-number' });
      const type = engine.nodeTypes.get('number');
      const result = type.execute(node);
      expect(result).toEqual({ value: 0 });
    });

    test('concat: concatenates inputs.a and inputs.b', async () => {
      const type = engine.nodeTypes.get('concat');
      const result = type.execute(null, { a: 'hello', b: 'world' });
      expect(result).toEqual({ result: 'helloworld' });
    });

    test('concat: handles null/undefined inputs', async () => {
      const type = engine.nodeTypes.get('concat');
      const result = type.execute(null, {});
      expect(result).toEqual({ result: '' });
    });

    test('llm_call: async returns [LLM] prompt', async () => {
      const type = engine.nodeTypes.get('llm_call');
      const result = await type.execute(null, { prompt: 'test prompt' });
      expect(result).toEqual({ response: '[LLM] test prompt' });
    });

    test('vision: async returns [Vision] prompt', async () => {
      const type = engine.nodeTypes.get('vision');
      const result = await type.execute(null, { prompt: 'analyze this' });
      expect(result).toEqual({ description: '[Vision] analyze this' });
    });

    test('http_request: async returns OK response', async () => {
      const type = engine.nodeTypes.get('http_request');
      const result = await type.execute(null, {});
      expect(result).toEqual({ response: 'OK', status: 200 });
    });

    test('condition: returns trueValue when condition truthy', async () => {
      const type = engine.nodeTypes.get('condition');
      const result = type.execute(null, { condition: true, trueValue: 'yes', falseValue: 'no' });
      expect(result).toEqual({ result: 'yes' });
    });

    test('condition: returns falseValue when condition falsy', async () => {
      const type = engine.nodeTypes.get('condition');
      const result = type.execute(null, { condition: false, trueValue: 'yes', falseValue: 'no' });
      expect(result).toEqual({ result: 'no' });
    });

    test('switch: finds matching case value', async () => {
      const type = engine.nodeTypes.get('switch');
      const cases = [{ value: 1, result: 'one' }, { value: 2, result: 'two' }];
      const result = type.execute(null, { value: 2, cases });
      expect(result).toEqual({ result: 'two' });
    });

    test('switch: falls back to first case when no match', async () => {
      const type = engine.nodeTypes.get('switch');
      const cases = [{ value: 1, result: 'default' }, { value: 2, result: 'two' }];
      const result = type.execute(null, { value: 99, cases });
      expect(result).toEqual({ result: 'default' });
    });

    test('switch: returns undefined when no cases', async () => {
      const type = engine.nodeTypes.get('switch');
      const result = type.execute(null, { value: 1, cases: [] });
      expect(result).toEqual({ result: undefined });
    });

    test('loop: maps items', async () => {
      const type = engine.nodeTypes.get('loop');
      const result = type.execute(null, { items: ['a', 'b', 'c'] });
      expect(result.results).toEqual([{ item: 'a' }, { item: 'b' }, { item: 'c' }]);
    });

    test('loop: handles empty items', async () => {
      const type = engine.nodeTypes.get('loop');
      const result = type.execute(null, { items: [] });
      expect(result).toEqual({ results: [] });
    });

    test('parallel: resolves all tasks', async () => {
      const type = engine.nodeTypes.get('parallel');
      const result = await type.execute(null, { tasks: ['x', 'y'] });
      expect(result.results.length).toBe(2);
      expect(result.results[0].result).toBe('x');
      expect(result.results[1].result).toBe('y');
    });

    test('delay: returns input after ms', async () => {
      const type = engine.nodeTypes.get('delay');
      const start = Date.now();
      const result = await type.execute(null, { input: 'delayed', ms: 10 });
      const elapsed = Date.now() - start;
      expect(result).toEqual({ output: 'delayed' });
      expect(elapsed).toBeGreaterThanOrEqual(5);
    });

    test('json_parse: parses valid JSON', async () => {
      const type = engine.nodeTypes.get('json_parse');
      const result = type.execute(null, { text: '{"a":1}' });
      expect(result).toEqual({ data: { a: 1 } });
    });

    test('json_parse: returns error on invalid JSON', async () => {
      const type = engine.nodeTypes.get('json_parse');
      const result = type.execute(null, { text: '{invalid}' });
      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });

    test('notify: returns sent true with title', async () => {
      const type = engine.nodeTypes.get('notify');
      const result = await type.execute(null, { title: 'Notification' });
      expect(result).toEqual({ sent: true, title: 'Notification' });
    });

    test('attest: generates sha256 hash and attestationId', async () => {
      const type = engine.nodeTypes.get('attest');
      const result = await type.execute(null, { data: { msg: 'hello' } });
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.attestationId).toMatch(/^att_/);
    });

    test('sub_workflow: returns error when no workflow data', async () => {
      const node = engine.addNode('sub_workflow');
      const type = engine.nodeTypes.get('sub_workflow');
      const result = await type.execute(node, { input: 'test' }, {});
      expect(result).toEqual({ output: 'test', error: 'No workflow data' });
    });

    test('sub_workflow: delegates to context.executeSubWorkflow when available', async () => {
      const context = {
        executeSubWorkflow: jest.fn().mockResolvedValue('sub-result')
      };
      const node = engine.addNode('sub_workflow');
      node.data.workflow = { nodes: [] };
      const type = engine.nodeTypes.get('sub_workflow');
      const result = await type.execute(node, { input: 'test' }, context);
      expect(context.executeSubWorkflow).toHaveBeenCalledWith({ nodes: [] }, { input: 'test' });
      expect(result).toEqual({ output: 'sub-result' });
    });

    test('sub_workflow: returns input when no context', async () => {
      const node = engine.addNode('sub_workflow');
      node.data.workflow = { nodes: [] };
      const type = engine.nodeTypes.get('sub_workflow');
      const result = await type.execute(node, { input: 'fallback' });
      expect(result).toEqual({ output: 'fallback' });
    });

    test('filter: filters items by Boolean', async () => {
      const type = engine.nodeTypes.get('filter');
      const result = type.execute(null, { items: [0, 1, '', 'a', null, true] });
      expect(result).toEqual({ filtered: [1, 'a', true] });
    });

    test('filter: handles empty items', async () => {
      const type = engine.nodeTypes.get('filter');
      const result = type.execute(null, { items: [] });
      expect(result).toEqual({ filtered: [] });
    });

    test('map: identity map', async () => {
      const type = engine.nodeTypes.get('map');
      const result = type.execute(null, { items: [1, 2, 3] });
      expect(result).toEqual({ mapped: [1, 2, 3] });
    });

    test('map: handles empty items', async () => {
      const type = engine.nodeTypes.get('map');
      const result = type.execute(null, { items: [] });
      expect(result).toEqual({ mapped: [] });
    });

    test('merge: concatenates two arrays', async () => {
      const type = engine.nodeTypes.get('merge');
      const result = type.execute(null, { a: [1, 2], b: [3, 4] });
      expect(result).toEqual({ result: [1, 2, 3, 4] });
    });

    test('merge: handles missing arrays', async () => {
      const type = engine.nodeTypes.get('merge');
      const result = type.execute(null, {});
      expect(result).toEqual({ result: [] });
    });

    test('switch: handles undefined cases', () => {
      const type = engine.nodeTypes.get('switch');
      const result = type.execute(null, { value: 1 });
      expect(result).toEqual({ result: undefined });
    });

    test('loop: handles undefined items', () => {
      const type = engine.nodeTypes.get('loop');
      const result = type.execute(null, {});
      expect(result).toEqual({ results: [] });
    });

    test('parallel: handles undefined tasks', async () => {
      const type = engine.nodeTypes.get('parallel');
      const result = await type.execute(null, {});
      expect(result.results).toEqual([]);
    });

    test('delay: defaults ms to 1000 when not provided', async () => {
      const type = engine.nodeTypes.get('delay');
      const result = await type.execute(null, { input: 'delayed' });
      expect(result).toEqual({ output: 'delayed' });
    });

    test('json_parse: handles undefined text', () => {
      const type = engine.nodeTypes.get('json_parse');
      const result = type.execute(null, {});
      expect(result).toEqual({ data: {} });
    });

    test('filter: handles undefined items', () => {
      const type = engine.nodeTypes.get('filter');
      const result = type.execute(null, {});
      expect(result).toEqual({ filtered: [] });
    });

    test('map: handles undefined items', () => {
      const type = engine.nodeTypes.get('map');
      const result = type.execute(null, {});
      expect(result).toEqual({ mapped: [] });
    });
  });

  describe('deleteNode branch coverage', () => {
    test('removes connections where deleted node is target', () => {
      const a = engine.addNode('input', { value: 1 });
      const b = engine.addNode('output');
      engine.connect(a.id, 'value', b.id, 'value');
      engine.deleteNode(b.id);
      expect(engine.connections.length).toBe(0);
    });

    test('preserves connections when deleted node is unrelated', () => {
      const a = engine.addNode('input', { value: 1 });
      const b = engine.addNode('output');
      const c = engine.addNode('input', { value: 2 });
      engine.connect(a.id, 'value', b.id, 'value');
      engine.deleteNode(c.id);
      expect(engine.connections.length).toBe(1);
      expect(engine.connections[0].source.nodeId).toBe(a.id);
    });
  });

  describe('executeParallel branch coverage', () => {
    test('handles node removed from map during execution by dependency', async () => {
      const engine2 = createEngine({ maxConcurrent: 1 });
      let targetId;
      engine2.registerNodeType('deleter', {
        name: 'Deleter', icon: '❌', category: 'Test',
        inputs: [], outputs: [{ name: 'out', type: 'any' }],
        execute: async () => {
          engine2.deleteNode(targetId);
          return { out: 'done' };
        }
      });
      engine2.registerNodeType('dependent', {
        name: 'Dependent', icon: '🔗', category: 'Test',
        inputs: [{ name: 'in', type: 'any' }], outputs: [],
        execute: () => ({})
      });
      const target = engine2.addNode('dependent');
      targetId = target.id;
      const deleterNode = engine2.addNode('deleter');
      engine2.connect(deleterNode.id, 'out', target.id, 'in');
      const result = await engine2.executeParallel();
      expect(result.completed).toBe(1);
      expect(result.total).toBe(2);
    });

    test('handles node type without execute function', async () => {
      engine.registerNodeType('no_exec', {
        name: 'NoExec', icon: '❌', category: 'Test',
        inputs: [], outputs: [{ name: 'result', type: 'any' }]
      });
      const onComplete = jest.fn();
      engine.onNodeComplete = onComplete;
      engine.addNode('no_exec');
      const result = await engine.executeParallel();
      expect(result.completed).toBe(1);
      expect(result.total).toBe(1);
      expect(onComplete).toHaveBeenCalled();
    });

    test('multi-parent dependency chain where indegree does not reach 0 immediately', async () => {
      const engine2 = createEngine({ maxConcurrent: 5 });
      const a = engine2.addNode('text', { text: 'A' });
      const b = engine2.addNode('text', { text: 'B' });
      const c = engine2.addNode('concat');
      engine2.connect(a.id, 'text', c.id, 'a');
      engine2.connect(b.id, 'text', c.id, 'b');
      const result = await engine2.executeParallel();
      expect(result.completed).toBe(3);
      expect(result.results[c.id]).toEqual({ result: 'AB' });
    });
  });
});
