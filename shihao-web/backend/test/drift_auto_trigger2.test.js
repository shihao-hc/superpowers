// Phase E: Drift auto-trigger smoke test 2 (force trigger)
(async () => {
  try {
    const { default: DriftDetector } = await import('../src/model_drift.js')
    // We simulate a forced retrain by leveraging the force flag via internal logic is not exposed;
    // Instead, verify that drift detection happens and callback fires when a drift is detected.
    const drift = new DriftDetector()
    let cbCount = 0
    drift.register_drift_callback((r) => {
      if (r?.drift) cbCount += 1
    })
    for (let i = 0; i < 20; i++) drift.log(0.0)
    for (let i = 0; i < 8; i++) drift.log(0.95)
    const info = drift.check()
    if (info?.drift && cbCount > 0) {
      console.log('Drift auto-trigger 2 test passed: drift detected and callback fired')
      process.exit(0)
    } else {
      console.error('Drift auto-trigger 2 test failed', { drift: info?.drift, cbCount, info })
      process.exit(1)
    }
  } catch (e) {
    console.error('Drift auto-trigger 2 test exception', e)
    process.exit(1)
  }
})()
