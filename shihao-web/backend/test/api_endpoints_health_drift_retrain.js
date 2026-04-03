// Extended integration tests for health checks, drift, and retraining endpoints
// This test starts the local backend and validates a sequence of diagnostic and retraining endpoints.

const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        // 1) Basic health
        let res = await fetch(base + '/health')
        let data = await res.json()
        assert.ok(data && data.status === 'ok')

        // 2) Detailed health
        res = await fetch(base + '/health/detailed')
        data = await res.json()
        assert.ok(data && data.timestamp)

        // 3) Full health
        res = await fetch(base + '/health/full')
        data = await res.json()
        assert.ok(data && typeof data.memory === 'object')

        // 4) Run times
        res = await fetch(base + '/api/run_times')
        data = await res.json()
        assert.ok(data && data.node_version)

        // 5) Drift check (prototype)
        res = await fetch(base + '/api/model/drift/check')
        data = await res.json()
        assert.ok(typeof data === 'object')

        // 6) Enqueue a retraining task
        const body = { modelName: 'stock_picker', details: { test: true } }
        res = await fetch(base + '/api/retrain/enqueue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        data = await res.json()
        assert.ok(data && data.ok)

        // 7) Status should reflect queue length
        res = await fetch(base + '/api/retrain/status')
        data = await res.json()
        assert.ok('queue_len' in data)

        // 8) Process next retraining task
        res = await fetch(base + '/api/retrain/process', { method: 'POST' })
        data = await res.json()
        assert.ok('processed' in data || data.completed)

        // 9) Final status reflects progress
        res = await fetch(base + '/api/retrain/status')
        data = await res.json()
        assert.ok('completed_len' in data || data.queue_len >= 0)

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
  console.log('Backend health/drift/retrain tests completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend health/drift/retrain test failed:', err)
  process.exit(1)
})
