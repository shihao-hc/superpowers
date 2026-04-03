// Drift ext: end-to-end like drift -> retrain enqueue -> retrain processing
(async () => {
  try {
    const { default: DriftDetector } = await import('../src/model_drift.js')
    const Drift = new DriftDetector()
    const retrainQueue = []
    // register a simple callback to simulate enqueue
    Drift.register_drift_callback((report) => {
      retrainQueue.push({ report, at: new Date().toISOString() })
    })
    // simulate stable sequence
    for (let i = 0; i < 25; i++) Drift.log(0.0)
    // simulate drift sequence
    for (let i = 0; i < 12; i++) Drift.log(0.8)
    // check that some drift was captured and callback fired
    if (retrainQueue.length > 0) {
      console.log('Drift ext test passed: retrain enqueued', retrainQueue.length)
      process.exit(0)
    } else {
      console.error('Drift ext test failed: no retrain enqueued')
      process.exit(1)
    }
  } catch (e) {
    console.error('Drift ext test exception', e)
    process.exit(1)
  }
})()
