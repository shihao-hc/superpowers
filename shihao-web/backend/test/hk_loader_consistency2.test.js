// HK loader consistency: ensure no duplicates after reloading extras (2)
(async () => {
  try {
    const { loadHKSymbols, hkSymbols } = await import('../src/market_adapters/hk_adapter.js')
    await loadHKSymbols()
    const unique = Array.from(new Set(hkSymbols || []))
    if (hkSymbols.length === unique.length) {
      console.log('HK loader consistency 2 test passed: no duplicates')
      process.exit(0)
    } else {
      console.error('HK loader consistency 2 test failed: duplicates exist', { total: hkSymbols.length, unique: unique.length })
      process.exit(1)
    }
  } catch (e) {
    console.error('HK loader consistency 2 test exception', e)
    process.exit(1)
  }
})()
