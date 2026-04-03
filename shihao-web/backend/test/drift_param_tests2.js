// Phase E: Parameterized drift tests (additional thresholds)
(async () => {
  try {
    const { default: DriftDetector } = await import('../src/model_drift.js')
    const thresholds = [0.04, 0.12, 0.25, 0.6]
    let allPassed = true
    for (const t of thresholds) {
      const d = new DriftDetector()
      for (let i = 0; i < 20; i++) d.log(0.0)
      for (let j = 0; j < Math.max(3, Math.floor(20 * 0.4)); j++) d.log(t + 0.5)
      const info = d.check()
      if (!info?.drift) {
        allPassed = false
        console.error('Drift param test 2 failed: drift not detected for threshold', t)
      } else {
        console.log('Drift param test 2 passed for threshold', t, 'mean', info?.mean)
      }
    }
    process.exit(allPassed ? 0 : 1)
  } catch (e) {
    console.error('Drift param test 2 exception', e)
    process.exit(1)
  }
})()
