// Phase D: Extended adapters test (US/CN/HK - more symbols set 4)
(async () => {
  try {
    const { default: USAdapter } = await import('../src/market_adapters/us_adapter.js')
    const { default: CNAdapter } = await import('../src/market_adapters/cn_adapter.js')
    const { default: HKAdapter, hkSymbols } = await import('../src/market_adapters/hk_adapter.js')
    const us = new USAdapter()
    const cn = new CNAdapter()
    const hk = new HKAdapter()

    const usInput = ['AAPL','MSFT','GOOGL','AMZN','NVDA']
    const cnInput = ['600519','000001','601318','600036','000651']
    const hkInput = hkSymbols && hkSymbols.length ? hkSymbols.slice(0, 5) : ['0700.HK','9988.HK','1833.HK','2318.HK','3888.HK']

    const usRes = await us.fetch(usInput)
    const cnRes = await cn.fetch(cnInput)
    const hkRes = await hk.fetch(hkInput)

    const ok = Array.isArray(usRes) && Array.isArray(cnRes) && Array.isArray(hkRes)
    if (ok && usRes.length === usInput.length && cnRes.length === cnInput.length && hkRes.length === hkInput.length) {
      console.log('Phase D extended 4 test passed')
      process.exit(0)
    } else {
      console.error('Phase D extended 4 test failed: mismatched lengths', { usRes, cnRes, hkRes })
      process.exit(1)
    }
  } catch (e) {
    console.error('Phase D extended 4 test exception', e)
    process.exit(1)
  }
})()
