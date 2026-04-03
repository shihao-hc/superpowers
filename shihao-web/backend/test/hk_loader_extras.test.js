// Verify extras loaded into hkSymbols from hk_symbols_extra15.json and hk_symbols_extra16.json
(async () => {
  try {
    const { default: HKAdapter, hkSymbols, loadHKSymbols } = await import('../src/market_adapters/hk_adapter.js')
    // Force reload to ensure extras are picked up
    await loadHKSymbols()
    const syms = hkSymbols
    const has2300 = syms.includes('2300.HK')
    const has9999 = syms.includes('9999.HK')
    if (has2300 && has9999) {
      console.log('HK loader extras test passed: 2300.HK and 9999.HK found')
      process.exit(0)
    } else {
      console.error('HK loader extras test failed: missing extras', { has2300, has9999, total: syms.length })
      process.exit(1)
    }
  } catch (e) {
    console.error('HK loader extras test exception', e)
    process.exit(1)
  }
})()
