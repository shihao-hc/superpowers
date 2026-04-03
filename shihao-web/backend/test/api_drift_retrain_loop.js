// Drift-driven retrain loop test (Phase E deeper) - multiple drift events
const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        // Perform multiple drift checks to accumulate history
        for (let i = 0; i < 15; i++) {
          await fetch(base + '/api/model/drift/check?ic=' + (i % 2 === 0 ? 0.7 : 0.8))
        }
        // Trigger auto retrain through drift-based auto_trigger
        let res = await fetch(base + '/api/retrain/auto_trigger')
        let data = await res.json()
        // Expect queue_len to exist
        assert.ok('queue_len' in data)
        // Validate status endpoint reflects queue length after operation
        res = await fetch(base + '/api/retrain/status')
        data = await res.json()
        assert.ok('queue_len' in data)
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
  console.log('Backend drift_retrain_loop test completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend drift_retrain_loop test failed:', err)
  process.exit(1)
})
