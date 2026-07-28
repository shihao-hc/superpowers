// Phase 3: InferenceBridge integration test
const InferenceBridge = require('../src/localInferencing/InferBridge');

(async () => {
  const ib = new InferenceBridge();
  await ib.loadModel();
  const res = ib.infer('hello world');
  console.log('Phase3 Test: InferenceBridge result:', res);
})();
