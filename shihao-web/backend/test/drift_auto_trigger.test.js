// Phase E: Drift auto-trigger smoke test (callback invocation)
(async () => {
  try {
    const { default: DriftDetector } = await import('../src/model_drift.js')
    const drift = new DriftDetector()
    let callbackCount = 0
    drift.register_drift_callback((report) => {
      if (report && report.drift) callbackCount += 1
    })
    // feed stable history, then spike to trigger drift
    for (let i = 0; i < 30; i++) drift.log(0.0)
    for (let i = 0; i < 15; i++) drift.log(0.9)
    const info = drift.check()
    const drifted = !!info?.drift
    if (drifted && callbackCount > 0) {
      console.log('Drift auto-trigger test passed: drift detected and callback fired', { drifted, callbackCount })
      process.exit(0)
    } else {
      console.error('Drift auto-trigger test failed', { drifted, callbackCount, info })
      process.exit(1)
    }
  } catch (e) {
    console.error('Drift auto-trigger test exception', e)
    process.exit(1)
  }
})()
