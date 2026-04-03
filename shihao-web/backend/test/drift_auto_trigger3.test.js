// Phase E: Drift auto-trigger smoke test 3 (force via end-to-end path)
(async () => {
  try {
    const { default: DriftDetector } = await import('../src/model_drift.js')
    const drift = new DriftDetector()
    let callbackCount = 0
    drift.register_drift_callback((report) => {
      if (report?.drift) callbackCount += 1
    })
    // stable then drift
    for (let i = 0; i < 25; i++) drift.log(0.0)
    for (let i = 0; i < 10; i++) drift.log(0.8)
    const info = drift.check()
    if (info?.drift && callbackCount > 0) {
      console.log('Drift auto-trigger 3 test passed')
      process.exit(0)
    } else {
      console.error('Drift auto-trigger 3 test failed', { drift: info?.drift, cb: callbackCount })
      process.exit(1)
    }
  } catch (e) {
    console.error('Drift auto-trigger 3 test exception', e)
    process.exit(1)
  }
})()
