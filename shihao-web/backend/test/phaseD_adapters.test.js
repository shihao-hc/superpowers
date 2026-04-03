// Phase D: Basic adapters conformance test (US/CN/HK)
(async () => {
  try {
    const { default: USAdapter } = await import('../src/market_adapters/us_adapter.js')
    const { default: CNAdapter } = await import('../src/market_adapters/cn_adapter.js')
    const { default: HKAdapter } = await import('../src/market_adapters/hk_adapter.js')

    const us = new USAdapter()
    const cn = new CNAdapter()
    const hk = new HKAdapter()

    const usSymbols = ['AAPL','MSFT']
    const cnSymbols = ['600519','000001']
    const hkSymbols = ['0700.HK','9988.HK']

    const usRes = await us.fetch(usSymbols)
    const cnRes = await cn.fetch(cnSymbols)
    const hkRes = await hk.fetch(hkSymbols)

    const ok = Array.isArray(usRes) && Array.isArray(cnRes) && Array.isArray(hkRes)
    if (ok) {
      console.log('Phase D adapters test passed: US/CN/HK fetch results are arrays')
      process.exit(0)
    } else {
      console.error('Phase D adapters test failed: non-array results', { usRes, cnRes, hkRes })
      process.exit(1)
    }
  } catch (e) {
    console.error('Phase D adapters test exception', e)
    process.exit(1)
  }
})()
