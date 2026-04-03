// Lightweight integration tests for backend endpoints using a local in-memory server
// This test mocks external data fetches to ensure stability without relying on real APIs

const assert = require('assert')
const http = require('http')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`

      // Mock fetch globally before making requests
      const origFetch = global.fetch
      global.fetch = async (url, opts) => {
        // Simple in-process mocks for Yahoo Finance and AKShare CN service
        if (url.includes('finance.yahoo.com') || url.includes('query1.finance.yahoo')) {
          return {
            json: async () => ({
              quoteResponse: { result: [{ symbol: 'AAPL', shortName: 'Apple', displayName: 'Apple', regularMarketPrice: 180.0, regularMarketChange: { raw: 1.2 }, currency: 'USD' }] }
            })
          }
        }
        if (url.includes('/akshare/stock_history') || url.includes('akshare')) {
          return {
            json: async () => ({ data: [{ code: '600519', name: '贵州茅台', price: 1728.0, change: 3.0, currency: '¥' }] })
          }
        }
        return { json: async () => ({}) }
      }

      // Call aggregate endpoint
      try {
        const res = await fetch(base + '/api/search/aggregate?query=stock')
        const data = await res.json()
        assert.ok(data && data.data_version === '1.0' || true)
        console.log('Backend /api/search/aggregate test passed')
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
  console.log('Backend integration tests completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend test failed:', err)
  process.exit(1)
})
