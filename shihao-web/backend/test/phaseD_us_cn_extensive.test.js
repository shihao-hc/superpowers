// Phase D: Extensive adapters test for US and CN (network-influenced paths)
(async () => {
  try {
    const { default: USAdapter } = await import('../src/market_adapters/us_adapter.js')
    const { default: CNAdapter } = await import('../src/market_adapters/cn_adapter.js')
    const us = new USAdapter()
    const cn = new CNAdapter()
    const usInput = ['AAPL','MSFT','GOOGL']
    const cnInput = ['600519','000001','601318']
    const usRes = await us.fetch(usInput)
    const cnRes = await cn.fetch(cnInput)
    const ok = Array.isArray(usRes) && Array.isArray(cnRes)
    if (ok) {
      console.log('Phase D US/CN extensive test passed: responses are arrays')
      process.exit(0)
    } else {
      console.error('Phase D US/CN extensive test failed: non-array responses', { usRes, cnRes })
      process.exit(1)
    }
  } catch (e) {
    console.error('Phase D US/CN extensive test exception', e)
    process.exit(1)
  }
})()
