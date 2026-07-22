const { WorkflowEngine, TaskNode, DAGEdge } = require('../../src/workflow/WorkflowEngine');

describe('TaskNode', () => {
  it('sets defaults from constructor', () => {
    const node = new TaskNode('t1');
    expect(node.id).toBe('t1');
    expect(node.type).toBe('task');
    expect(typeof node.handler).toBe('function');
    expect(node.retry).toEqual({ attempts: 1, delay: 0 });
    expect(node.timeout).toBe(30000);
    expect(node.status).toBe('pending');
  });

  it('applies custom config', () => {
    const handler = async () => ({ result: 'ok' });
    const node = new TaskNode('t2', {
      type: 'custom',
      handler,
      retry: { attempts: 3, delay: 500 },
      timeout: 10000
    });
    expect(node.type).toBe('custom');
    expect(node.handler).toBe(handler);
    expect(node.retry.attempts).toBe(3);
    expect(node.timeout).toBe(10000);
  });

  it('execute succeeds and updates status', async () => {
    const node = new TaskNode('t3', {
      handler: async () => ({ value: 42 }),
      timeout: 5000
    });
    const output = await node.execute({ x: 1 });
    expect(output).toEqual({ value: 42 });
    expect(node.status).toBe('completed');
    expect(node.input).toEqual({ x: 1 });
    expect(node.endTime).toBeGreaterThanOrEqual(node.startTime);
  });

  it('execute fails and updates status', async () => {
    const node = new TaskNode('t4', {
      handler: async () => { throw new Error('fail'); },
      timeout: 5000
    });
    await expect(node.execute({})).rejects.toThrow('fail');
    expect(node.status).toBe('failed');
    expect(node.error.message).toBe('fail');
  });

  it('execute throws on timeout', async () => {
    const node = new TaskNode('t5', {
      handler: async () => { await new Promise(r => setTimeout(r, 10000)); return 'slow'; },
      timeout: 10
    });
    await expect(node.execute({})).rejects.toThrow('Task timeout');
    expect(node.status).toBe('failed');
  });

  it('getDuration returns 0 before execution', () => {
    const node = new TaskNode('t6');
    expect(node.getDuration()).toBe(0);
  });

  it('getDuration returns elapsed time', async () => {
    const node = new TaskNode('t7', {
      handler: async () => { await new Promise(r => setTimeout(r, 20)); return 'ok'; },
      timeout: 5000
    });
    await node.execute({});
    expect(node.getDuration()).toBeGreaterThanOrEqual(20);
  });

  it('toJSON returns expected shape', async () => {
    const node = new TaskNode('t8', {
      handler: async () => 'done',
      timeout: 5000
    });
    await node.execute({});
    const json = node.toJSON();
    expect(json).toMatchObject({
      id: 't8',
      type: 'task',
      status: 'completed',
      error: undefined
    });
    expect(json.duration).toBeGreaterThanOrEqual(0);
  });
});

describe('DAGEdge', () => {
  it('stores source, target, condition', () => {
    const cond = (input) => input.value > 0;
    const edge = new DAGEdge('source', 'target', cond);
    expect(edge.source).toBe('source');
    expect(edge.target).toBe('target');
    expect(edge.condition).toBe(cond);
  });

  it('stores null condition by default', () => {
    const edge = new DAGEdge('a', 'b');
    expect(edge.condition).toBeNull();
  });
});

describe('WorkflowEngine', () => {
  let engine;
  const okHandler = async () => ({ status: 'ok' });

  beforeEach(() => {
    engine = new WorkflowEngine({ maxConcurrency: 10 });
  });

  describe('constructor', () => {
    it('sets default options', () => {
      const e = new WorkflowEngine();
      expect(e.options.maxConcurrency).toBe(10);
      expect(e.options.retryDelay).toBe(1000);
    });

    it('applies custom options', () => {
      const e = new WorkflowEngine({ maxConcurrency: 5, retryDelay: 2000 });
      expect(e.options.maxConcurrency).toBe(5);
      expect(e.options.retryDelay).toBe(2000);
    });

    it('is an EventEmitter', () => {
      expect(typeof engine.on).toBe('function');
      expect(typeof engine.emit).toBe('function');
    });
  });

  describe('addNode', () => {
    it('adds and retrieves a node', () => {
      engine.addNode('n1', { handler: okHandler });
      expect(engine.nodes.has('n1')).toBe(true);
    });

    it('returns this for chaining', () => {
      const result = engine.addNode('n1', { handler: okHandler });
      expect(result).toBe(engine);
    });
  });

  describe('addEdge', () => {
    it('creates an edge between existing nodes', () => {
      engine.addNode('a', { handler: okHandler });
      engine.addNode('b', { handler: okHandler });
      engine.addEdge('a', 'b');
      expect(engine.edges).toHaveLength(1);
      expect(engine.edges[0].source).toBe('a');
      expect(engine.edges[0].target).toBe('b');
    });

    it('returns this for chaining', () => {
      engine.addNode('a', { handler: okHandler });
      engine.addNode('b', { handler: okHandler });
      const result = engine.addEdge('a', 'b');
      expect(result).toBe(engine);
    });

    it('throws for missing source node', () => {
      engine.addNode('b', { handler: okHandler });
      expect(() => engine.addEdge('a', 'b')).toThrow('Invalid edge');
    });

    it('throws for missing target node', () => {
      engine.addNode('a', { handler: okHandler });
      expect(() => engine.addEdge('a', 'b')).toThrow('Invalid edge');
    });

    it('stores condition when provided', () => {
      engine.addNode('a', { handler: okHandler });
      engine.addNode('b', { handler: okHandler });
      const cond = () => true;
      engine.addEdge('a', 'b', cond);
      expect(engine.edges[0].condition).toBe(cond);
    });
  });

  describe('validate', () => {
    it('returns true for valid DAG', () => {
      engine.addNode('a', { handler: okHandler });
      engine.addNode('b', { handler: okHandler });
      engine.addEdge('a', 'b');
      expect(engine.validate()).toBe(true);
    });

    it('throws for DAG with cycle', () => {
      engine.addNode('a', { handler: okHandler });
      engine.addNode('b', { handler: okHandler });
      engine.addEdge('a', 'b');
      engine.addEdge('b', 'a');
      expect(() => engine.validate()).toThrow('DAG contains a cycle');
    });

    it('validates single node', () => {
      engine.addNode('a', { handler: okHandler });
      expect(engine.validate()).toBe(true);
    });

    it('throws for self-loop cycle', () => {
      engine.addNode('a', { handler: okHandler });
      engine.addEdge('a', 'a');
      expect(() => engine.validate()).toThrow('DAG contains a cycle');
    });
  });

  describe('topologicalSort', () => {
    it('returns nodes in dependency order', () => {
      engine.addNode('a', { handler: okHandler });
      engine.addNode('b', { handler: okHandler });
      engine.addNode('c', { handler: okHandler });
      engine.addEdge('a', 'c');
      engine.addEdge('b', 'c');
      const order = engine.topologicalSort();
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    });

    it('throws for cycle', () => {
      engine.addNode('a', { handler: okHandler });
      engine.addNode('b', { handler: okHandler });
      engine.addEdge('a', 'b');
      engine.addEdge('b', 'a');
      expect(() => engine.topologicalSort()).toThrow('DAG contains a cycle');
    });

    it('stores result in executionOrder', () => {
      engine.addNode('a', { handler: okHandler });
      engine.addNode('b', { handler: okHandler });
      engine.topologicalSort();
      expect(engine.executionOrder).toEqual(['a', 'b']);
    });
  });

  describe('getReadyNodes', () => {
    it('returns nodes with completed prerequisites', () => {
      engine.addNode('a', { handler: okHandler });
      engine.addNode('b', { handler: okHandler });
      engine.addEdge('a', 'b');
      engine.topologicalSort();

      const before = engine.getReadyNodes(new Set());
      expect(before).toContain('a');
      expect(before).not.toContain('b');

      const after = engine.getReadyNodes(new Set(['a']));
      expect(after).toContain('b');
    });

    it('skips completed nodes', () => {
      engine.addNode('a', { handler: okHandler });
      engine.addNode('b', { handler: okHandler });
      engine.topologicalSort();

      const ready = engine.getReadyNodes(new Set(['a', 'b']));
      expect(ready).toEqual([]);
    });
  });

  describe('execute linear', () => {
    it('runs single node workflow', async () => {
      engine.addNode('n1', { handler: async () => ({ value: 1 }), timeout: 5000 });
      const result = await engine.execute({});
      expect(result.results.n1).toEqual({ value: 1 });
    });

    it('runs sequential chain', async () => {
      engine.addNode('a', { handler: async (input) => ({ ...input, step: 'a' }), timeout: 5000 });
      engine.addNode('b', { handler: async (input) => ({ ...input, step: 'b' }), timeout: 5000 });
      engine.addNode('c', { handler: async (input) => ({ ...input, step: 'c' }), timeout: 5000 });
      engine.addEdge('a', 'b');
      engine.addEdge('b', 'c');
      const result = await engine.execute({ start: true });
      expect(result.results.c).toMatchObject({ start: true, step: 'c' });
    });

    it('passes upstream outputs as named inputs', async () => {
      engine.addNode('data', { handler: async () => ({ items: [1, 2, 3] }), timeout: 5000 });
      engine.addNode('process', {
        handler: async (input) => ({ count: input.data.items.length, doubled: input.data.items.map(x => x * 2) }),
        timeout: 5000
      });
      engine.addEdge('data', 'process');
      const result = await engine.execute({});
      expect(result.results.process.count).toBe(3);
      expect(result.results.process.doubled).toEqual([2, 4, 6]);
    });
  });

  describe('execute with errors', () => {
    it('throws when node fails', async () => {
      engine.addNode('fail', { handler: async () => { throw new Error('oops'); }, timeout: 5000 });
      await expect(engine.execute({})).rejects.toThrow('oops');
    });

    it('throws on node execution error', async () => {
      engine.addNode('fail', { handler: async () => { throw new Error('boom'); }, timeout: 5000 });
      engine.addNode('child', { handler: async () => 'ok', timeout: 5000 });
      engine.addEdge('fail', 'child');
      await expect(engine.execute({})).rejects.toThrow('boom');
    });
  });

  describe('events', () => {
    it('emits node:start and node:complete events', async () => {
      const events = [];
      engine.addNode('n1', { handler: async () => ({ done: true }), timeout: 5000 });
      engine.on('node:start', (data) => events.push(['start', data.nodeId]));
      engine.on('node:complete', (data) => events.push(['complete', data.nodeId]));
      await engine.execute({});
      expect(events).toContainEqual(['start', 'n1']);
      expect(events).toContainEqual(['complete', 'n1']);
    });

    it('emits workflow:complete event', async () => {
      let emitted = false;
      engine.addNode('n1', { handler: async () => ({ done: true }), timeout: 5000 });
      engine.on('workflow:complete', () => { emitted = true; });
      await engine.execute({});
      expect(emitted).toBe(true);
    });
  });

  describe('executeNode with retry', () => {
    it('succeeds on first attempt', async () => {
      const node = new TaskNode('r1', {
        handler: async () => 'ok',
        retry: { attempts: 3, delay: 10 },
        timeout: 5000
      });
      engine.addNode('r1', { handler: node.handler, retry: node.retry, timeout: node.timeout });
      const result = await engine.executeNode(engine.nodes.get('r1'), {});
      expect(result).toBe('ok');
    });

    it('retries on failure', async () => {
      let attempts = 0;
      const node = new TaskNode('r2', {
        handler: async () => { attempts++; if (attempts < 3) throw new Error('retry'); return 'done'; },
        retry: { attempts: 3, delay: 5 },
        timeout: 5000
      });
      engine.addNode('r2', { handler: node.handler, retry: node.retry, timeout: node.timeout });
      const result = await engine.executeNode(engine.nodes.get('r2'), {});
      expect(result).toBe('done');
      expect(attempts).toBe(3);
    });

    it('throws when all retries exhausted', async () => {
      const node = new TaskNode('r3', {
        handler: async () => { throw new Error('persistent'); },
        retry: { attempts: 2, delay: 5 },
        timeout: 5000
      });
      engine.addNode('r3', { handler: node.handler, retry: node.retry, timeout: node.timeout });
      await expect(engine.executeNode(engine.nodes.get('r3'), {})).rejects.toThrow('persistent');
    });

    it('emits retry event', async () => {
      let attempts = 0;
      const retries = [];
      const node = new TaskNode('r4', {
        handler: async () => { attempts++; if (attempts < 2) throw new Error('try again'); return 'ok'; },
        retry: { attempts: 2, delay: 5 },
        timeout: 5000
      });
      engine.addNode('r4', { handler: node.handler, retry: node.retry, timeout: node.timeout });
      engine.on('node:retry', (data) => retries.push(data));
      await engine.executeNode(engine.nodes.get('r4'), {});
      expect(retries).toHaveLength(1);
      expect(retries[0].nodeId).toBe('r4');
    });
  });

  describe('executeParallel', () => {
    it('executes independent nodes in parallel', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;
      const handler = async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(r => setTimeout(r, 10));
        concurrent--;
        return { done: true };
      };
      engine.addNode('a', { handler, timeout: 5000 });
      engine.addNode('b', { handler, timeout: 5000 });
      engine.addNode('c', { handler, timeout: 5000 });
      const results = await engine.executeParallel();
      expect(Object.keys(results)).toHaveLength(3);
    });

    it('respects dependency levels', async () => {
      const order = [];
      engine.addNode('a', { handler: async () => { order.push('a'); return { done: true }; }, timeout: 5000 });
      engine.addNode('b', { handler: async () => { order.push('b'); return { done: true }; }, timeout: 5000 });
      engine.addNode('c', { handler: async () => { order.push('c'); return { done: true }; }, timeout: 5000 });
      engine.addEdge('a', 'c');
      engine.addEdge('b', 'c');
      const results = await engine.executeParallel();
      expect(order[2]).toBe('c');
      expect(results.c).toEqual({ done: true });
    });
  });

  describe('buildLevels', () => {
    it('groups nodes by dependency depth', () => {
      engine.addNode('a', { handler: okHandler });
      engine.addNode('b', { handler: okHandler });
      engine.addNode('c', { handler: okHandler });
      engine.addEdge('a', 'c');
      engine.addEdge('b', 'c');
      const levels = engine.buildLevels();
      expect(levels[0]).toContain('a');
      expect(levels[0]).toContain('b');
      expect(levels[1]).toContain('c');
    });

    it('throws for cycle', () => {
      engine.addNode('a', { handler: okHandler });
      engine.addNode('b', { handler: okHandler });
      engine.addEdge('a', 'b');
      engine.addEdge('b', 'a');
      expect(() => engine.buildLevels()).toThrow('Unable to build levels');
    });
  });

  describe('visualize', () => {
    it('returns nodes and links', () => {
      engine.addNode('a', { handler: okHandler });
      engine.addNode('b', { handler: okHandler });
      engine.addEdge('a', 'b');
      const viz = engine.visualize();
      expect(viz.nodes).toHaveLength(2);
      expect(viz.links).toHaveLength(1);
      expect(viz.links[0].source).toBe('a');
    });

    it('shows conditional edges', () => {
      engine.addNode('a', { handler: okHandler });
      engine.addNode('b', { handler: okHandler });
      engine.addEdge('a', 'b', () => true);
      const viz = engine.visualize();
      expect(viz.links[0].condition).toBe('conditional');
    });
  });

  describe('coverage edge cases', () => {
    it('getDuration during execution returns elapsed time', () => {
      const node = new TaskNode('t-running');
      node.startTime = Date.now() - 500;
      const duration = node.getDuration();
      expect(duration).toBeGreaterThanOrEqual(500);
    });

    it('getReadyNodes skips nodes in results set', () => {
      engine.addNode('a', { handler: okHandler });
      engine.addNode('b', { handler: okHandler });
      engine.addEdge('a', 'b');
      engine.topologicalSort();
      engine.results.set('a', { value: 1 });
      const ready = engine.getReadyNodes(new Set());
      expect(ready).not.toContain('a');
    });

    it('execute without initialInput uses default', async () => {
      engine.addNode('a', { handler: async (input) => input, timeout: 5000 });
      const result = await engine.execute();
      expect(result.results.a).toEqual({});
    });

    it('handles null output from node', async () => {
      engine.addNode('a', { handler: async () => null, timeout: 5000 });
      engine.addNode('b', { handler: async (input) => ({ fromA: input.a }), timeout: 5000 });
      engine.addEdge('a', 'b');
      const result = await engine.execute({});
      expect(result.results.a).toBeNull();
    });

    it('executeParallel with upstream results', async () => {
      const order = [];
      engine.addNode('a', {
        handler: async () => { order.push('a'); return { value: 42 }; },
        timeout: 5000
      });
      engine.addNode('b', {
        handler: async (input) => { order.push('b'); return { result: input.a?.value }; },
        timeout: 5000
      });
      engine.addEdge('a', 'b');
      const results = await engine.executeParallel();
      expect(results.b).toEqual({ result: 42 });
    });

    it('execute passes upstream result via edge lookup', async () => {
      engine.addNode('data', { handler: async () => ({ x: 1 }), timeout: 5000 });
      engine.addNode('proc', {
        handler: async (input) => ({ y: input.data?.x }),
        timeout: 5000
      });
      engine.addEdge('data', 'proc');
      const result = await engine.execute();
      expect(result.results.proc).toEqual({ y: 1 });
    });
  });


});
