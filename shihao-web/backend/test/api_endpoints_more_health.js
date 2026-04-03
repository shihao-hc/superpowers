// Additional health and basic endpoint checks to boost Phase A coverage
// This test exercises a broader set of core endpoints to ensure basic stability.

const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      // Mock fetch globally before requests
      const origFetch = global.fetch
      global.fetch = async (url, opts) => {
        // Simulate Yahoo US data fetch
        if (typeof url === 'string' && (url.includes('finance.yahoo') || url.includes('query1.finance.yahoo'))) {
          return {
            json: async () => ({
              quoteResponse: { result: [{ symbol: 'AAPL', shortName: 'Apple', displayName: 'Apple', regularMarketPrice: 180.0, regularMarketChange: { raw: 1.2 }, currency: 'USD' }] }
            })
          }
        }
        // Simulate AKShare CN data fetch
        if (typeof url === 'string' && (url.includes('/akshare') || url.includes('akshare'))) {
          return {
            json: async () => ({ data: [{ code: '600519', name: '贵州茅台', price: 1728.0, change: 3.0, currency: '¥' }] })
          }
        }
        return { json: async () => ({}) }
      }

      try {
        // 1) Basic health
        let res = await fetch(base + '/health')
        let data = await res.json()
        assert.ok(data && data.status === 'ok')

        // 2) Market status and list
        res = await fetch(base + '/api/market/status')
        data = await res.json()
        assert.ok(data && typeof data.us !== 'undefined')

        res = await fetch(base + '/api/market/list')
        data = await res.json()
        assert.ok(Array.isArray(data.markets) || Array.isArray(data))

        // 3) Stock endpoint
        res = await fetch(base + '/api/stock/AAPL')
        data = await res.json()
        assert.ok(data && data.code === 'AAPL')

        // 4) Run times
        res = await fetch(base + '/api/run_times')
        data = await res.json()
        assert.ok(data && data.node_version)

        // 5) Aggregated search (re-check)
        res = await fetch(base + '/api/search/aggregate?query=stock')
        data = await res.json()
        assert.ok(data && data.engine)

        // restore fetch
        global.fetch = origFetch
        server.close()
        resolve()
      } catch (err) {
        global.fetch = origFetch
        server.close()
        reject(err)
      }
    })
  })
}

run().then(() => {
  console.log('Backend endpoint health extended tests completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend endpoint health extended test failed:', err)
  process.exit(1)
})
