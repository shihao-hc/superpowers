// Phase 6: DAG Engine basic test
const { DAGEngine } = require('../src/dag-orchestration/DAGEngine');

(async () => {
  const nodes = [
    { id: 'A', run: async () => { console.log('Phase6 A'); }, deps: [] },
    { id: 'B', run: async () => { console.log('Phase6 B'); }, deps: ['A'] },
    { id: 'C', run: async () => { console.log('Phase6 C'); }, deps: ['A'] },
    { id: 'D', run: async () => { console.log('Phase6 D'); }, deps: ['B','C'] },
  ];
  const dag = new DAGEngine(nodes);
  const order = await dag.run();
  console.log('Phase6 order:', order);
})();
