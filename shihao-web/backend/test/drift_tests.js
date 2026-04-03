// Drift tests: ensure detector behaves for drifted and stable sequences
(async () => {
  try {
    const { default: DriftDetector } = await import('../src/model_drift.js')
    // 1) drifted sequence: push positive values to trigger drift
    const d1 = new DriftDetector()
    for (let i = 0; i < 30; i++) {
      d1.log(0.6)
    }
    const info1 = d1.check()
    const drifted = !!info1?.drift
    // 2) stable sequence: push zeros
    const d2 = new DriftDetector()
    for (let i = 0; i < 25; i++) {
      d2.log(0.0)
    }
    const info2 = d2.check()
    const stable = !info2?.drift

    if (drifted && stable) {
      console.log('Drift tests passed')
      process.exit(0)
    } else {
      console.error('Drift tests failed', { drifted, info1 }, { stable, info2 })
      process.exit(1)
    }
  } catch (e) {
    console.error('Drift tests exception', e)
    process.exit(1)
  }
})()
