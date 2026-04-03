// Phase E: Drift auto-trigger smoke test 4 (alternative pattern)
(async () => {
  try {
    const { default: DriftDetector } = await import('../src/model_drift.js')
    const drift = new DriftDetector()
    let cb = 0
    drift.register_drift_callback((r) => {
      if (r?.drift) cb += 1
    })
    for (let i = 0; i < 15; i++) drift.log(0.0)
    for (let i = 0; i < 12; i++) drift.log(0.92)
    const info = drift.check()
    if (info?.drift && cb > 0) {
      console.log('Drift auto-trigger 4 test passed')
      process.exit(0)
    } else {
      console.error('Drift auto-trigger 4 test failed', { drift: info?.drift, cb })
      process.exit(1)
    }
  } catch (e) {
    console.error('Drift auto-trigger 4 test exception', e)
    process.exit(1)
  }
})()
