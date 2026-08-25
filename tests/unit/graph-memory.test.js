const os = require('os');
const fs = require('fs');
const path = require('path');

const { GraphMemory } = require('../../src/memory/GraphMemory');

describe('GraphMemory', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-memory-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  });

  const makeGraph = (options = {}) => new GraphMemory({ storageDir: tmpDir, ...options });

  test('constructor creates storage directory when missing', () => {
    const nested = path.join(tmpDir, 'deep', 'nested');
    const graph = new GraphMemory({ storageDir: nested });
    expect(fs.existsSync(nested)).toBe(true);
    expect(graph.nodes.size).toBe(0);
    expect(graph.relationships.size).toBe(0);
  });

  test('constructor uses default storage dir under cwd when no options given', () => {
    const prev = process.cwd();
    try {
      process.chdir(tmpDir);
      const graph = new GraphMemory();
      expect(fs.existsSync(path.join(tmpDir, 'memory', 'graph'))).toBe(true);
      graph.clear();
    } finally {
      process.chdir(prev);
    }
  });

  test('constructor loads persisted data if graph.json exists', () => {
    const g1 = makeGraph();
    g1.createNode('n1', 'person', { name: 'Alice' }, ['friend']);
    g1.createRelationship('n1', 'n2', 'knows');
    g1.save();

    const g2 = makeGraph();
    expect(g2.getNode('n1')).toMatchObject({ id: 'n1', type: 'person' });
    expect(g2.getRelationship('n1_knows_n2')).toBeTruthy();
  });

  test('constructor handles corrupted graph.json gracefully', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'graph.json'), '{ not valid json', 'utf8');
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const graph = makeGraph();
    expect(graph.nodes.size).toBe(0);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test('createNode stores node with timestamps and updates indices', () => {
    const graph = makeGraph();
    const node = graph.createNode('n1', 'person', { name: 'Alice' }, ['friend']);
    expect(node.id).toBe('n1');
    expect(node.properties.name).toBe('Alice');
    expect(node.createdAt).toBeDefined();
    expect(graph.getNode('n1')).toBe(node);
    expect(graph.findNodesByType('person')).toHaveLength(1);
    expect(graph.findNodesByLabel('friend')).toHaveLength(1);
  });

  test('createNode supports multiple labels in index', () => {
    const graph = makeGraph();
    graph.createNode('n1', 'animal', {}, ['cat', 'pet']);
    expect(graph.findNodesByLabel('cat')).toHaveLength(1);
    expect(graph.findNodesByLabel('pet')).toHaveLength(1);
    expect(graph.getStats().labels).toBe(2);
  });

  test('getNode returns null when missing', () => {
    expect(makeGraph().getNode('missing')).toBeNull();
  });

  test('createRelationship builds compound id', () => {
    const graph = makeGraph();
    const rel = graph.createRelationship('a', 'b', 'knows', { strength: 1 });
    expect(rel.id).toBe('a_knows_b');
    expect(graph.getRelationship('a_knows_b')).toBe(rel);
    expect(graph.getRelationship('missing')).toBeNull();
  });

  test('updateNode merges properties', () => {
    const graph = makeGraph();
    graph.createNode('n1', 'person', { name: 'A' });
    const updated = graph.updateNode('n1', { age: 30 });
    expect(updated.properties).toMatchObject({ name: 'A', age: 30 });
    expect(updated.updatedAt).toBeDefined();
  });

  test('updateNode returns null for missing node', () => {
    expect(makeGraph().updateNode('x', {})).toBeNull();
  });

  test('deleteNode removes node, relations, and index entries', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person', {}, ['friend']);
    graph.createNode('b', 'person', {}, ['friend']);
    graph.createRelationship('a', 'b', 'knows');
    graph.createRelationship('b', 'a', 'likes');

    expect(graph.deleteNode('a')).toBe(true);
    expect(graph.getNode('a')).toBeNull();
    expect(graph.getRelationship('a_knows_b')).toBeNull();
    expect(graph.getRelationship('b_likes_a')).toBeNull();
    expect(graph.findNodesByType('person')).toHaveLength(1);
  });

  test('deleteNode returns false for missing node', () => {
    expect(makeGraph().deleteNode('x')).toBe(false);
  });

  test('deleteNode keeps relationships not touching the deleted node', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person');
    graph.createNode('b', 'person');
    graph.createNode('c', 'person');
    graph.createRelationship('a', 'b', 'knows');
    graph.createRelationship('c', 'd', 'unrelated');
    graph.deleteNode('a');
    expect(graph.getRelationship('c_unrelated_d')).toBeTruthy();
  });

  test('deleteNode tolerates missing index sets (defensive)', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person', {}, ['friend']);
    graph.indices.byType.delete('person');
    graph.indices.byLabel.delete('friend');
    expect(graph.deleteNode('a')).toBe(true);
  });

  test('findNodesByType returns empty array when no index', () => {
    expect(makeGraph().findNodesByType('nope')).toEqual([]);
  });

  test('findNodesByLabel returns empty array when no index', () => {
    expect(makeGraph().findNodesByLabel('nope')).toEqual([]);
  });

  test('findNodesByType filters to existing nodes', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person');
    graph.createNode('b', 'person');
    graph.nodes.delete('b');
    expect(graph.findNodesByType('person')).toHaveLength(1);
  });

  test('getNodeRelationships returns rels with source/target nodes', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person');
    graph.createNode('b', 'person');
    graph.createRelationship('a', 'b', 'knows');
    const rels = graph.getNodeRelationships('a');
    expect(rels).toHaveLength(1);
    expect(rels[0].sourceNode.id).toBe('a');
    expect(rels[0].targetNode.id).toBe('b');
  });

  test('getNodeRelationships tolerates missing endpoint nodes', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person');
    graph.createRelationship('a', 'ghost', 'knows');
    const rels = graph.getNodeRelationships('a');
    expect(rels).toHaveLength(1);
    expect(rels[0].sourceNode.id).toBe('a');
    expect(rels[0].targetNode).toBeUndefined();
  });

  test('getNodeRelationships matches by target side too', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person');
    graph.createNode('b', 'person');
    graph.createRelationship('b', 'a', 'likes');
    const rels = graph.getNodeRelationships('a');
    expect(rels).toHaveLength(1);
    expect(rels[0].type).toBe('likes');
    expect(rels[0].targetNode.id).toBe('a');
  });

  test('getNodeRelationships skips unrelated relationships', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person');
    graph.createRelationship('x', 'y', 'elsewhere');
    expect(graph.getNodeRelationships('a')).toEqual([]);
  });

  test('findPath returns empty path when start equals end', () => {
    const graph = makeGraph();
    expect(graph.findPath('a', 'a')).toEqual([]);
  });

  test('getNodeRelations filters by direction outgoing', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person');
    graph.createNode('b', 'person');
    graph.createRelationship('a', 'b', 'knows');
    graph.createRelationship('b', 'a', 'likes');
    const outgoing = graph.getNodeRelations('a', { direction: 'outgoing' });
    expect(outgoing.map((r) => r.type)).toEqual(['knows']);
    const incoming = graph.getNodeRelations('a', { direction: 'incoming' });
    expect(incoming.map((r) => r.type)).toEqual(['likes']);
    const both = graph.getNodeRelations('a', { direction: 'both' });
    expect(both).toHaveLength(2);
  });

  test('getNodeRelations filters by type', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person');
    graph.createNode('b', 'person');
    graph.createRelationship('a', 'b', 'knows');
    graph.createRelationship('a', 'b', 'likes');
    const knowsOnly = graph.getNodeRelations('a', { direction: 'both', type: 'knows' });
    expect(knowsOnly).toHaveLength(1);
    expect(knowsOnly[0].type).toBe('knows');
  });

  test('getNodeRelations uses default both direction without options', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person');
    graph.createNode('b', 'person');
    graph.createRelationship('a', 'b', 'knows');
    graph.createRelationship('b', 'a', 'likes');
    const rels = graph.getNodeRelations('a');
    expect(rels).toHaveLength(2);
  });

  test('findPath finds direct connection', () => {
    const graph = makeGraph();
    graph.createRelationship('a', 'b', 'knows');
    const p = graph.findPath('a', 'b');
    expect(p).toHaveLength(1);
    expect(p[0].type).toBe('knows');
  });

  test('findPath finds indirect connection', () => {
    const graph = makeGraph();
    graph.createRelationship('a', 'b', 'knows');
    graph.createRelationship('b', 'c', 'knows');
    const p = graph.findPath('a', 'c');
    expect(p).toHaveLength(2);
  });

  test('findPath respects maxDepth', () => {
    const graph = makeGraph();
    graph.createRelationship('a', 'b', 'knows');
    graph.createRelationship('b', 'c', 'knows');
    expect(graph.findPath('a', 'c', 1)).toBeNull();
  });

  test('findPath returns null when unreachable', () => {
    const graph = makeGraph();
    graph.createRelationship('a', 'b', 'knows');
    expect(graph.findPath('a', 'z')).toBeNull();
  });

  test('findPath avoids cycles', () => {
    const graph = makeGraph();
    graph.createRelationship('a', 'b', 'knows');
    graph.createRelationship('b', 'a', 'knows');
    const p = graph.findPath('a', 'b');
    expect(p).toHaveLength(1);
  });

  test('findPath skips already-visited targets', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person');
    graph.createNode('b', 'person');
    graph.createNode('c', 'person');
    graph.createNode('d', 'person');
    graph.createRelationship('a', 'c', 'x');
    graph.createRelationship('a', 'b', 'y');
    graph.createRelationship('b', 'c', 'z');
    graph.createRelationship('c', 'd', 'w');
    const p = graph.findPath('a', 'd');
    expect(p).toHaveLength(2);
  });

  test('traverse collects nodes by depth and direction', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person');
    graph.createNode('b', 'person');
    graph.createNode('c', 'person');
    graph.createRelationship('a', 'b', 'knows');
    graph.createRelationship('b', 'c', 'knows');

    const results = graph.traverse('a', { depth: 2 });
    const ids = results.map((r) => r.node.id).sort();
    expect(ids).toEqual(['b', 'c']);
    expect(results[0].depth).toBe(1);
    expect(results[1].path).toHaveLength(2);
  });

  test('traverse filters by relationship types', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person');
    graph.createNode('b', 'person');
    graph.createNode('c', 'person');
    graph.createRelationship('a', 'b', 'knows');
    graph.createRelationship('a', 'c', 'blocks');
    const results = graph.traverse('a', { depth: 1, types: ['blocks'] });
    expect(results).toHaveLength(1);
    expect(results[0].node.id).toBe('c');
  });

  test('traverse avoids revisiting nodes', () => {
    const graph = makeGraph();
    graph.createRelationship('a', 'b', 'knows');
    graph.createRelationship('b', 'a', 'knows');
    const results = graph.traverse('a', { depth: 2 });
    expect(results).toHaveLength(1);
  });

  test('traverse returns empty when start node has no relations', () => {
    const graph = makeGraph();
    expect(graph.traverse('a')).toEqual([]);
  });

  test('areConnected checks both directions', () => {
    const graph = makeGraph();
    graph.createRelationship('a', 'b', 'knows');
    expect(graph.areConnected('a', 'b')).toBe(true);
    expect(graph.areConnected('b', 'a')).toBe(true);
    expect(graph.areConnected('a', 'c')).toBe(false);
  });

  test('getStats reports counts', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person');
    graph.createNode('b', 'animal');
    graph.createRelationship('a', 'b', 'owns');
    expect(graph.getStats()).toEqual({
      nodes: 2,
      relationships: 1,
      nodeTypes: 2,
      labels: 0
    });
  });

  test('removeFromIndices cleans empty sets on node deletion', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person', {}, ['friend']);
    graph.deleteNode('a');
    expect(graph.getStats().nodeTypes).toBe(0);
    expect(graph.getStats().labels).toBe(0);
  });

  test('save writes graph.json to disk', () => {
    const graph = makeGraph();
    graph.createNode('n1', 'person', { name: 'Alice' });
    graph.save();
    const file = path.join(tmpDir, 'graph.json');
    expect(fs.existsSync(file)).toBe(true);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(data.nodes.n1.properties.name).toBe('Alice');
  });

  test('clear empties graph and indices', () => {
    const graph = makeGraph();
    graph.createNode('a', 'person', {}, ['friend']);
    graph.createRelationship('a', 'b', 'knows');
    graph.clear();
    expect(graph.getStats().nodes).toBe(0);
    expect(graph.getStats().relationships).toBe(0);
    expect(graph.findNodesByType('person')).toEqual([]);
  });

  test('load restores nodes into indices', () => {
    const g1 = makeGraph();
    g1.createNode('n1', 'person', {}, ['friend']);
    g1.save();
    const g2 = makeGraph();
    expect(g2.findNodesByType('person')).toHaveLength(1);
    expect(g2.findNodesByLabel('friend')).toHaveLength(1);
  });

  test('load tolerates file missing nodes or relationships keys', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'graph.json'),
      JSON.stringify({ relationships: { r1: { source: 'a', target: 'b', type: 'x' } } }),
      'utf8'
    );
    const g = new GraphMemory({ storageDir: tmpDir });
    expect(g.relationships.get('r1').type).toBe('x');
    expect(g.getStats().nodes).toBe(0);

    fs.writeFileSync(
      path.join(tmpDir, 'graph.json'),
      JSON.stringify({ nodes: { n1: { id: 'n1', type: 'person', labels: [], properties: {} } } }),
      'utf8'
    );
    const g2 = new GraphMemory({ storageDir: tmpDir });
    expect(g2.nodes.get('n1').id).toBe('n1');
    expect(g2.getStats().relationships).toBe(0);
  });
});
