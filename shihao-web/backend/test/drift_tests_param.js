// Drift tests: parameterized drift vs stable sequences
(async () => {
  try {
    const { default: DriftDetector } = await import('../src/model_drift.js')
    // 1) drifted sequence with higher ic values
    const d1 = new DriftDetector()
    for (let i = 0; i < 25; i++) {
      d1.log(0.7)
    }
    const info1 = d1.check()
    const drifted = !!info1.drift

    // 2) stable/near-zero sequence
    const d2 = new DriftDetector()
    for (let i = 0; i < 25; i++) {
      d2.log(0.0)
    }
    const info2 = d2.check()
    const stable = !info2.drift

    if (drifted && stable) {
      console.log('Drift parameterized tests passed')
      process.exit(0)
    } else {
      console.error('Drift parameterized tests failed', { drifted, stable, info1, info2 })
      process.exit(1)
    }
  } catch (e) {
    console.error('Drift parameterized tests exception', e)
    process.exit(1)
  }
})()
