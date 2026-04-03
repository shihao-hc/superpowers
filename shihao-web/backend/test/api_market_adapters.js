// Test market adapters (Phase D)
const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        // Mock Yahoo fetch for US adapter
        const origFetch = global.fetch
        global.fetch = async (url, opts) => {
          if (url.includes('finance.yahoo.com') || url.includes('query1.finance.yahoo')) {
            return {
              json: async () => ({
                quoteResponse: { result: [ { symbol: 'AAPL', shortName: 'Apple', regularMarketPrice: 180.0, currency: '$' } ] }
              })
            }
          }
          return { json: async () => ({}) }
        }
        const resUs = await fetch(base + '/api/market/us?symbols=AAPL')
        const dataUs = await resUs.json()
        assert.ok(dataUs && dataUs.market === 'us' && Array.isArray(dataUs.data))

        const resCn = await fetch(base + '/api/market/cn?symbols=600519')
        const dataCn = await resCn.json()
        assert.ok(dataCn && dataCn.market === 'cn' && Array.isArray(dataCn.data))

        const resHk = await fetch(base + '/api/market/hk?symbols=0700.HK')
        const dataHk = await resHk.json()
        assert.ok(dataHk && dataHk.market === 'hk' && Array.isArray(dataHk.data))
        global.fetch = origFetch
        server.close()
        resolve()
      } catch (e) {
        global.fetch = origFetch
        server.close()
        reject(e)
      }
    })
  })
}

run().then(() => {
  console.log('Backend market adapters test completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend market adapters test failed:', err)
  process.exit(1)
})
