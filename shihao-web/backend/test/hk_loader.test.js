// Simple unit test to validate HK symbols loader loads non-empty set
(async () => {
  const mod = await import('../src/market_adapters/hk_adapter.js')
  const syms = mod.hkSymbols
  if (!Array.isArray(syms) || syms.length === 0) {
    console.error('HK loader test failed: hkSymbols is not a non-empty array', syms)
    process.exit(1)
  } else {
    console.log('HK loader test passed: loaded', syms.length, 'symbols')
    process.exit(0)
  }
})()
