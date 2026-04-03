// Simple unit test for HK bulk fetch using adapter with loaded symbols
(async () => {
  try {
    const { hkSymbols } = await import('../src/market_adapters/hk_adapter.js')
    const HKAdapter = (await import('../src/market_adapters/hk_adapter.js')).default
    const adapter = new HKAdapter()
    const symbols = (hkSymbols && hkSymbols.length > 0) ? hkSymbols.slice(0, 5) : ['0700.HK','9988.HK','1833.HK','2318.HK','3888.HK']
    const results = await adapter.fetch(symbols)
    if (Array.isArray(results) && results.length === symbols.length) {
      console.log('HK bulk test passed: loaded', results.length, 'symbols')
      process.exit(0)
    } else {
      console.error('HK bulk test failed: unexpected results', results)
      process.exit(1)
    }
  } catch (e) {
    console.error('HK bulk test exception', e)
    process.exit(1)
  }
})()
