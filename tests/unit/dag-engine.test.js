const { DAGEngine } = require('../../src/dag-orchestration/DAGEngine');

describe('DAGEngine', () => {
  test('constructor accepts nodes array', async () => {
    const engine = new DAGEngine([
      { id: 'a', run: async () => {}, deps: [] }
    ]);
    await expect(engine.run()).resolves.toEqual(['a']);
  });

  test('constructor handles empty nodes', () => {
    const engine = new DAGEngine();
    expect(engine.nodes.size).toBe(0);
  });

  test('addNode stores a node', () => {
    const engine = new DAGEngine();
    engine.addNode({ id: 'a', run: async () => {} });
    expect(engine.nodes.has('a')).toBe(true);
    const node = engine.nodes.get('a');
    expect(node.done).toBe(false);
    expect(node.running).toBe(false);
    expect(node.deps).toEqual([]);
  });

  test('addNode ignores null', () => {
    const engine = new DAGEngine();
    engine.addNode(null);
    expect(engine.nodes.size).toBe(0);
  });

  test('addNode ignores node without id', () => {
    const engine = new DAGEngine();
    engine.addNode({ run: async () => {} });
    expect(engine.nodes.size).toBe(0);
  });

  test('addNode sets empty deps if missing', () => {
    const engine = new DAGEngine();
    engine.addNode({ id: 'a' });
    expect(engine.nodes.get('a').deps).toEqual([]);
  });

  test('run executes in topological order', async () => {
    const order = [];
    const engine = new DAGEngine([
      { id: 'a', run: async () => { order.push('a'); }, deps: [] },
      { id: 'b', run: async () => { order.push('b'); }, deps: ['a'] },
      { id: 'c', run: async () => { order.push('c'); }, deps: ['a'] }
    ]);
    const results = await engine.run();
    expect(results).toEqual(['a', 'b', 'c']);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  test('run handles parallel deps', async () => {
    const order = [];
    const engine = new DAGEngine([
      { id: 'a', run: async () => { order.push('a'); }, deps: [] },
      { id: 'b', run: async () => { order.push('b'); }, deps: [] },
      { id: 'c', run: async () => { order.push('c'); }, deps: ['a', 'b'] }
    ]);
    const results = await engine.run();
    expect(results).toEqual(['a', 'b', 'c']);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  test('run throws on cycle', async () => {
    const engine = new DAGEngine([
      { id: 'a', run: async () => {}, deps: ['b'] },
      { id: 'b', run: async () => {}, deps: ['a'] }
    ]);
    await expect(engine.run()).rejects.toThrow('Cycle detected');
  });

  test('run skips missing dependencies', async () => {
    const engine = new DAGEngine([
      { id: 'a', run: async () => {}, deps: ['nonexistent'] }
    ]);
    await expect(engine.run()).resolves.toEqual(['a']);
  });

  test('run handles node without run function', async () => {
    const engine = new DAGEngine([
      { id: 'a', run: async () => {} },
      { id: 'b', deps: ['a'] }
    ]);
    const results = await engine.run();
    expect(results).toEqual(['a', 'b']);
  });

  test('run marks nodes as done', async () => {
    const engine = new DAGEngine([
      { id: 'a', run: async () => {} }
    ]);
    await engine.run();
    expect(engine.nodes.get('a').done).toBe(true);
  });
});
