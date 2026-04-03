// Simple interface tests for market adapters to ensure fetch method exists
(async () => {
  try {
    const { default: USAdapter } = await import('../src/market_adapters/us_adapter.js')
    const { default: CNAdapter } = await import('../src/market_adapters/cn_adapter.js')
    const { default: HKAdapter } = await import('../src/market_adapters/hk_adapter.js')
    const us = new USAdapter()
    const cn = new CNAdapter()
    const hk = new HKAdapter()
    const hasFetch = (a) => typeof a.fetch === 'function'
    if (hasFetch(us) && hasFetch(cn) && hasFetch(hk)) {
      console.log('Adapters interface test passed: fetch exists on US/CN/HK')
      // additional lightweight runtime checks to exercise endpoints
      try {
        const usRes = await us.fetch(['AAPL','MSFT'])
        if (Array.isArray(usRes)) console.log('US fetch path exercised')
      } catch { /* ignore */ }
      try {
        const cnRes = await cn.fetch(['600519','000001'])
        if (Array.isArray(cnRes)) console.log('CN fetch path exercised')
      } catch { /* ignore */ }
      process.exit(0)
    } else {
      console.error('Adapters interface test failed: fetch missing')
      process.exit(1)
    }
  } catch (e) {
    console.error('Adapters interface test exception', e)
    process.exit(1)
  }
})()
