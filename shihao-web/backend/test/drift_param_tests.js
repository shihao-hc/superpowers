// Phase E: Parameterized drift tests for multiple thresholds
(async () => {
  try {
    const { default: DriftDetector } = await import('../src/model_drift.js')
    const thresholds = [0.1, 0.3, 0.6, 1.0]
    let allPassed = true
    for (const t of thresholds) {
      const d = new DriftDetector()
      // feed mostly stable values, then a drift spike to trigger drift based on threshold
      for (let i = 0; i < 20; i++) d.log(0.0)
      // spike
      for (let i = 0; i < 10; i++) d.log(t + 0.4)
      const info = d.check()
      const driftFlag = !!info?.drift
      if (!driftFlag) {
        allPassed = false
        console.error('Drift param test failed: drift not detected for threshold', t)
      } else {
        console.log('Drift param test passed for threshold', t, 'drift?', driftFlag)
      }
    }
    process.exit(allPassed ? 0 : 1)
  } catch (e) {
    console.error('Drift param tests exception', e)
    process.exit(1)
  }
})()
