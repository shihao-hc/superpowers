// Data source resilience test for Phase A expansion
// Simulate Yahoo US failure and CN AKShare success to exercise fallback path

const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      // Save original fetch
      const origFetch = global.fetch
      global.fetch = async (url, opts) => {
        // Simulate Yahoo fetch failure
        if (typeof url === 'string' && (url.includes('finance.yahoo') || url.includes('query1.finance.yahoo'))) {
          throw new Error('simulated Yahoo failure')
        }
        // CN data path
        if (typeof url === 'string' && (url.includes('/akshare') || url.includes('akshare'))) {
          return {
            json: async () => ({ data: [ { code: '600519', name: '贵州茅台', price: 1728.0, change: 3.0, currency: '¥' } ] })
          }
        }
        return { json: async () => ({}) }
      }

      try {
        const res = await fetch(base + '/api/search/aggregate?query=stock')
        const data = await res.json()
        assert.ok(data && data.data_version === '1.0')
        assert.ok(Array.isArray(data.results))
        // Ensure engines are reported
        assert.deepStrictEqual(data.engines, ['Yahoo US', 'AKShare CN'])

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
  console.log('Backend data source resilience test completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend data source resilience test failed:', err)
  process.exit(1)
})
