// Canary health endpoint test
const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        const res = await fetch(base + '/health/canary')
        const data = await res.json()
        assert.ok(data && data.ok === true)
        assert.ok(data && data.time)
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
  console.log('Backend canary health test completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend canary health test failed:', err)
  process.exit(1)
})
