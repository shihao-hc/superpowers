// Advanced DAG engine with status and hookable execution (Phase 6+)
class DAGEngineAdvanced {
  constructor(nodes = []) {
    this.nodes = new Map();
    nodes.forEach(n => this.addNode(n));
  }
  addNode(node) {
    if (!node || !node.id) return;
    if (!node.deps) node.deps = [];
    this.nodes.set(node.id, { id: node.id, deps: node.deps, run: node.run, done: false, running: false });
  }
  reset() {
    this.nodes.forEach(n => { n.done = false; n.running = false; });
  }
  // Basic status reporter
  status() {
    const total = this.nodes.size;
    let done = 0, running = 0;
    this.nodes.forEach(n => { if (n.done) done++; if (n.running) running++; });
    const pending = total - done - running;
    return { total, done, running, pending };
  }
  // Run with optional hooks (before/after each node id)
  async runWithHooks(hooks = {}) {
    const before = hooks.before || (async (id) => {});
    const after = hooks.after || (async (id) => {});
    // compute in-degrees and adjacency
    const inDeg = new Map();
    const adj = new Map();
    this.nodes.forEach((n, id) => { inDeg.set(id, 0); adj.set(id, []); });
    this.nodes.forEach((n, id) => {
      (n.deps || []).forEach(d => {
        if (this.nodes.has(d)) { inDeg.set(id, inDeg.get(id) + 1); adj.get(d).push(id); }
      });
    });
    const queue = [];
    this.nodes.forEach((n, id) => { if (inDeg.get(id) === 0) queue.push(id); });
    const results = [];
    while (queue.length) {
      const id = queue.shift();
      const node = this.nodes.get(id);
      if (node.run) {
        node.running = true;
        await before(id);
        await node.run();
        node.running = false;
        await after(id);
      }
      node.done = true;
      results.push(id);
      (adj.get(id) || []).forEach(nextId => {
        inDeg.set(nextId, inDeg.get(nextId) - 1);
        if (inDeg.get(nextId) === 0) queue.push(nextId);
      });
    }
    const incomplete = Array.from(this.nodes.values()).filter(n => !n.done);
    if (incomplete.length > 0) throw new Error('Cycle detected or missing dependencies in DAG');
    return results;
  }
  // Run in simple topological order (no hooks)
  async run() {
    return this.runWithHooks({});
  }
}

module.exports = { DAGEngineAdvanced };
