// Integration-like test for HK adapter fetch with extra symbols (ensures loader includes extras)
(async () => {
  try {
    const { default: HKAdapter, hkSymbols } = await import('../src/market_adapters/hk_adapter.js')
    if (!Array.isArray(hkSymbols) || hkSymbols.length === 0) {
      console.error('HK adapter integration test failed: hkSymbols empty')
      process.exit(1)
    }
    const adapter = new HKAdapter()
    const res = await adapter.fetch([hkSymbols[0]])
    if (Array.isArray(res) && res.length >= 1) {
      console.log('HK adapter integration test passed, loaded symbol:', hkSymbols[0])
      process.exit(0)
    }
    console.error('HK adapter integration test failed: empty results')
    process.exit(1)
  } catch (e) {
    console.error('HK adapter integration test exception', e)
    process.exit(1)
  }
})()
