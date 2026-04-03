// Phase E: Parameterized drift tests (extensive) across history lengths
(async () => {
  try {
    const { default: DriftDetector } = await import('../src/model_drift.js')
    const historyLengths = [20, 40, 60]
    let allPassed = true
    for (const hist of historyLengths) {
      const d = new DriftDetector()
      // stabilize with zeros for 'hist' steps
      for (let i = 0; i < hist; i++) d.log(0.0)
      // inject a substantial spike to trigger drift
      const spikes = Math.max(5, Math.floor(hist * 0.7))
      for (let j = 0; j < spikes; j++) d.log(0.9)
      const info = d.check()
      if (!info?.drift) {
        allPassed = false
        console.error('Drift ext param test failed: drift not detected for history', hist)
      } else {
        console.log('Drift ext param test passed for history', hist, 'drift?', info?.drift, 'mean', info?.mean)
      }
    }
    process.exit(allPassed ? 0 : 1)
  } catch (e) {
    console.error('Drift ext param tests exception', e)
    process.exit(1)
  }
})()
