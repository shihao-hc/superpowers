// Phase B extension: additional data source health test (Health2)
const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        const res = await fetch(base + '/api/datasource/health')
        const data = await res.json()
        // Expect health object with keys for US/CN/HK
        assert.ok(data && data.us !== undefined && data.cn !== undefined && data.hk !== undefined)
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
  console.log('Backend data source health2 test completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend data source health2 test failed:', err)
  process.exit(1)
})
