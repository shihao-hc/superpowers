// HK bulk test: 15-symbol set (1010-1600 plus 2301/2401)
const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        const symbols = ['1010.HK','1020.HK','1050.HK','1110.HK','1200.HK','1300.HK','1400.HK','1500.HK','1600.HK','1700.HK','2300.HK','2400.HK','2600.HK','2301.HK','2401.HK']
        const res = await fetch(base + '/api/market/hk?symbols=' + symbols.join(','))
        const data = await res.json()
        assert.ok(data && data.market === 'hk' && Array.isArray(data.data))
        assert.ok((data.data.length ?? 0) >= symbols.length)
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
  console.log('Backend HK market adapters hk_more15 completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend HK market adapters hk_more15 failed:', err)
  process.exit(1)
})
