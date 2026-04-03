// Simple DAG-based task runner (Phase 6 skeleton)
// Each node is { id, run: async ()=>void, deps: [] }

class DAGEngine {
  constructor(nodes = []) {
    this.nodes = new Map();
    nodes.forEach(n => this.addNode(n));
  }
  addNode(node) {
    if (!node || !node.id) return;
    if (!node.deps) node.deps = [];
    this.nodes.set(node.id, { ...node, done: false, running: false });
  }
  async run() {
    // topological execution using Kahn's algorithm
    const inDeg = new Map();
    const adj = new Map();
    // init
    this.nodes.forEach((n, id) => {
      inDeg.set(id, 0);
      adj.set(id, []);
    });
    this.nodes.forEach((n, id) => {
      (n.deps || []).forEach(d => {
        if (this.nodes.has(d)) {
          inDeg.set(id, inDeg.get(id) + 1);
          adj.get(d).push(id);
        }
      });
    });
    const queue = [];
    this.nodes.forEach((n, id) => {
      if (inDeg.get(id) === 0) queue.push(id);
    });
    const results = [];
    while (queue.length) {
      const id = queue.shift();
      const node = this.nodes.get(id);
      if (node.run) {
        await node.run();
      }
      node.done = true;
      results.push(id);
      (adj.get(id) || []).forEach(nextId => {
        inDeg.set(nextId, inDeg.get(nextId) - 1);
        if (inDeg.get(nextId) === 0) queue.push(nextId);
      });
    }
    // detect cycles
    const incomplete = Array.from(this.nodes.values()).filter(n => !n.done);
    if (incomplete.length > 0) {
      throw new Error('Cycle detected in DAG or missing dependencies');
    }
    return results;
  }
}

module.exports = { DAGEngine };
