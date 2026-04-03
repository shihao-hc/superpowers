// HK market adapters test - 4-symbol variant (0700.HK, 1833.HK, 2318.HK, 1299.HK)
const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        const res = await fetch(base + '/api/market/hk?symbols=0700.HK,1833.HK,2318.HK,1299.HK')
        const data = await res.json()
        assert.ok(data && data.market === 'hk' && Array.isArray(data.data))
        assert.ok((data.data.length ?? 0) >= 4)
        server.close()
        resolve()
      } catch (e) {
        server.close()
        reject(e)
      }
    })
  })
}

run().then(() => {
  console.log('Backend HK market adapters extended test 9 completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend HK market adapters extended test 9 failed:', err)
  process.exit(1)
})
