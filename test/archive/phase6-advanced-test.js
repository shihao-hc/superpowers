// Phase 6 Advanced DAG Engine test
const { DAGEngineAdvanced } = require('../src/dag-orchestration/DAGEngineAdvanced');

(async () => {
  const nodes = [
    { id: 'A', run: async () => { console.log('[Phase6-Advanced] A'); }, deps: [] },
    { id: 'B', run: async () => { console.log('[Phase6-Advanced] B'); }, deps: ['A'] },
    { id: 'C', run: async () => { console.log('[Phase6-Advanced] C'); }, deps: ['A'] },
    { id: 'D', run: async () => { console.log('[Phase6-Advanced] D'); }, deps: ['B','C'] }
  ];
  const dag = new DAGEngineAdvanced(nodes);
  const order = await dag.run();
  console.log('[Phase6-Advanced] execution order:', order);
})();
