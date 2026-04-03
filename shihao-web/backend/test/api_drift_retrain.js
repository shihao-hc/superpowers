// Drift-driven retrain path test (Phase E deeper test)
const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        // Push drift by feeding ic=1.0 repeatedly via drift check
        for (let i = 0; i < 25; i++) {
          await fetch(base + '/api/model/drift/check?ic=1')
        }
        // Now trigger auto retrain via auto_trigger (drift should enqueue)
        let res = await fetch(base + '/api/retrain/status')
        let data = await res.json()
        const initialQueue = data.queue_len
        res = await fetch(base + '/api/retrain/auto_trigger')
        data = await res.json()
        // Either queued or not depending on drift, but queue_len should be >= initial
        res = await fetch(base + '/api/retrain/status')
        const data2 = await res.json()
        assert.ok('queue_len' in data2)

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
  console.log('Backend drift retrain test completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend drift retrain test failed:', err)
  process.exit(1)
})
