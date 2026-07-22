const { DAGEngineAdvanced } = require('../../src/dag-orchestration/DAGEngineAdvanced');

describe('DAGEngineAdvanced', () => {
  test('constructor accepts nodes array', () => {
    const engine = new DAGEngineAdvanced([
      { id: 'a', run: async () => {}, deps: [] }
    ]);
    expect(engine.nodes.has('a')).toBe(true);
  });

  test('constructor handles empty nodes', () => {
    const engine = new DAGEngineAdvanced();
    expect(engine.nodes.size).toBe(0);
  });

  test('addNode stores node with defaults', () => {
    const engine = new DAGEngineAdvanced();
    engine.addNode({ id: 'a', run: async () => {} });
    const node = engine.nodes.get('a');
    expect(node.done).toBe(false);
    expect(node.running).toBe(false);
    expect(node.deps).toEqual([]);
  });

  test('addNode ignores null', () => {
    const engine = new DAGEngineAdvanced();
    engine.addNode(null);
    expect(engine.nodes.size).toBe(0);
  });

  test('reset sets all nodes to not done and not running', async () => {
    const engine = new DAGEngineAdvanced([
      { id: 'a', run: async () => {} }
    ]);
    await engine.run();
    expect(engine.nodes.get('a').done).toBe(true);
    engine.reset();
    expect(engine.nodes.get('a').done).toBe(false);
    expect(engine.nodes.get('a').running).toBe(false);
  });

  test('status returns correct counts', async () => {
    const engine = new DAGEngineAdvanced([
      { id: 'a', run: async () => {} },
      { id: 'b', run: async () => {}, deps: [] }
    ]);
    expect(engine.status()).toEqual({ total: 2, done: 0, running: 0, pending: 2 });
    await engine.run();
    expect(engine.status()).toEqual({ total: 2, done: 2, running: 0, pending: 0 });
  });

  test('run executes nodes in topological order', async () => {
    const order = [];
    const engine = new DAGEngineAdvanced([
      { id: 'a', run: async () => { order.push('a'); }, deps: [] },
      { id: 'b', run: async () => { order.push('b'); }, deps: ['a'] }
    ]);
    const results = await engine.run();
    expect(results).toEqual(['a', 'b']);
    expect(order).toEqual(['a', 'b']);
  });

  test('run handles parallel deps', async () => {
    const order = [];
    const engine = new DAGEngineAdvanced([
      { id: 'a', run: async () => { order.push('a'); }, deps: [] },
      { id: 'b', run: async () => { order.push('b'); }, deps: [] },
      { id: 'c', run: async () => { order.push('c'); }, deps: ['a', 'b'] }
    ]);
    const results = await engine.run();
    expect(results).toEqual(['a', 'b', 'c']);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  test('run throws on cycle', async () => {
    const engine = new DAGEngineAdvanced([
      { id: 'a', run: async () => {}, deps: ['b'] },
      { id: 'b', run: async () => {}, deps: ['a'] }
    ]);
    await expect(engine.run()).rejects.toThrow('Cycle detected');
  });

  test('runWithHooks invokes before and after hooks', async () => {
    const hooks = [];
    const engine = new DAGEngineAdvanced([
      { id: 'a', run: async () => { hooks.push('run'); } }
    ]);
    await engine.runWithHooks({
      before: async (id) => { hooks.push(`before:${id}`); },
      after: async (id) => { hooks.push(`after:${id}`); }
    });
    expect(hooks).toEqual(['before:a', 'run', 'after:a']);
  });

  test('runWithHooks sets running flag', async () => {
    const engine = new DAGEngineAdvanced([
      { id: 'a', run: async () => {
        expect(engine.nodes.get('a').running).toBe(true);
      } }
    ]);
    await engine.runWithHooks({});
    expect(engine.nodes.get('a').running).toBe(false);
  });

  test('run handles node without run function', async () => {
    const engine = new DAGEngineAdvanced([
      { id: 'a', run: async () => {} },
      { id: 'b', deps: ['a'] }
    ]);
    const results = await engine.run();
    expect(results).toEqual(['a', 'b']);
  });

  test('run on empty engine returns empty array', async () => {
    const engine = new DAGEngineAdvanced();
    const results = await engine.run();
    expect(results).toEqual([]);
  });

  test('status during run returns running > 0', async () => {
    const engine = new DAGEngineAdvanced([
      { id: 'a', run: async () => {
        const s = engine.status();
        expect(s.running).toBe(1);
      } }
    ]);
    await engine.run();
  });

  test('runWithHooks handles missing dependency', async () => {
    const engine = new DAGEngineAdvanced([
      { id: 'a', deps: ['b'] },
      { id: 'b', deps: ['nonexistent'] }
    ]);
    const results = await engine.run();
    expect(results).toEqual(['b', 'a']);
  });

  test('runWithHooks called without hooks arg', async () => {
    const engine = new DAGEngineAdvanced([
      { id: 'a', run: async () => {} }
    ]);
    const results = await engine.runWithHooks();
    expect(results).toEqual(['a']);
  });

  test('runWithHooks on empty engine returns empty array', async () => {
    const engine = new DAGEngineAdvanced();
    const results = await engine.runWithHooks({});
    expect(results).toEqual([]);
  });
});
