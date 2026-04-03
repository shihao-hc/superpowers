// Test auto retrain trigger endpoint (Phase E)
const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        // Trigger with force to enqueue unconditionally
        let res = await fetch(base + '/api/retrain/auto_trigger?force=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelName: 'stock_picker', force: true })
        })
        let data = await res.json()
        assert.ok(data && data.queued === true)

        // Trigger drift-based; since drift might not be detected deterministically, ensure endpoint returns an object
        res = await fetch(base + '/api/retrain/auto_trigger')
        data = await res.json()
        assert.ok('queued' in data)
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
  console.log('Backend retrain auto_trigger test completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend retrain auto_trigger test failed:', err)
  process.exit(1)
})
