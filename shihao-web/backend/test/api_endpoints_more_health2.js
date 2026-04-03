// Additional health-lite checks for Phase A expansion
// Validate a few more diagnostic endpoints for stability.

const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        // 1) Health summary
        let res = await fetch(base + '/api/health/summary')
        let data = await res.json()
        assert.ok(data && typeof data === 'object')

        // 2) Data source status
        res = await fetch(base + '/api/datasource/status')
        data = await res.json()
        assert.ok(data && typeof data === 'object')

        // 3) Recent logs edge-case fetch
        res = await fetch(base + '/api/logs/recent')
        data = await res.json()
        assert.ok('count' in data && 'entries' in data)

        server.close()
        resolve()
      } catch (err) {
        server.close()
        reject(err)
      }
    })
  })
}

run().then(() => {
  console.log('Backend extended health2 tests completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend extended health2 test failed:', err)
  process.exit(1)
})
