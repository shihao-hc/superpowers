// Data source health endpoint test (Phase B)
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
        assert.ok(data && data.us && data.cn && data.hk)
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
  console.log('Backend data source health endpoint test completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend data source health endpoint test failed:', err)
  process.exit(1)
})
