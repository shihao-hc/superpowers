// HK single-symbol endpoint tests (existence and non-existence paths)
(async () => {
  try {
    const { default: HKAdapter, hkSymbols } = await import('../src/market_adapters/hk_adapter.js')
    const hk = new HKAdapter()
    // 1) existing symbol path
    const existing = hkSymbols && hkSymbols.length ? hkSymbols[0] : '0700.HK'
    const resExist = await hk.fetch([existing])
    if (Array.isArray(resExist) && resExist.length === 1) {
      console.log('HK symbol test (exist) passed for', existing)
    } else {
      console.error('HK symbol test (exist) failed for', existing, resExist)
      process.exit(1)
    }
    // 2) non-existing symbol path
    const nonExist = 'NONEXIST.HK'
    const resNonExist = await hk.fetch([nonExist])
    if (Array.isArray(resNonExist) && resNonExist.length === 1) {
      const item = resNonExist[0]
      if (item && item.code === nonExist) {
        console.log('HK symbol test (non-exist) returned default for', nonExist)
      } else {
        console.error('HK symbol test (non-exist) unexpected data', item)
        process.exit(1)
      }
    } else {
      console.error('HK symbol test (non-exist) failed: unexpected response', resNonExist)
      process.exit(1)
    }
    process.exit(0)
  } catch (e) {
    console.error('HK symbol endpoint test failed with exception', e)
    process.exit(1)
  }
})();
