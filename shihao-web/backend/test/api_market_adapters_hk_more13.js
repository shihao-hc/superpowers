// HK market adapters test - extended with 13-symbol scenario
const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        const res = await fetch(base + '/api/market/hk?symbols=0700.HK,1833.HK,2318.HK,3888.HK,1113.HK,0005.HK,0001.HK,0009.HK,0123.HK,0666.HK,0857.HK,1398.HK,2388.HK')
        const data = await res.json()
        assert.ok(data && data.market === 'hk' && Array.isArray(data.data))
        assert.ok((data.data.length ?? 0) >= 12)
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
  console.log('Backend HK market adapters extended test 13 completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend HK market adapters extended test 13 failed:', err)
  process.exit(1)
})
