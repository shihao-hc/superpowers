// HK bulk large list test: ensure the adapter can handle more symbols in one fetch
(async () => {
  try {
    const { hkSymbols } = await import('../src/market_adapters/hk_adapter.js')
    const HKAdapter = (await import('../src/market_adapters/hk_adapter.js')).default
    const adapter = new HKAdapter()
    // Build a larger symbol list, using available loaded symbols first, then synthetic ones
    const base = hkSymbols && hkSymbols.length > 0 ? hkSymbols : ['0700.HK','9988.HK','1833.HK']
    const extra = ['2300.HK','2400.HK','2600.HK','2601.HK','2602.HK','9999.HK']
    const symbols = base.concat(extra).slice(0, 12)
    const results = await adapter.fetch(symbols)
    if (Array.isArray(results) && results.length === symbols.length) {
      console.log('HK bulk large test passed:', results.length, 'symbols loaded')
      process.exit(0)
    } else {
      console.error('HK bulk large test failed: unexpected results', results)
      process.exit(1)
    }
  } catch (e) {
    console.error('HK bulk large test exception', e)
    process.exit(1)
  }
})()
