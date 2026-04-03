// Drift loop test variant 2 for Phase E deeper
const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        // accumulate drift using alternating ic values
        for (let i = 0; i < 12; i++) {
          await fetch(base + '/api/model/drift/check?ic=' + (i % 3 === 0 ? 0.6 : 1.0))
        }
        // attempt auto trigger
        let res = await fetch(base + '/api/retrain/auto_trigger')
        let data = await res.json()
        assert.ok('queued' in data)
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
  console.log('Backend drift_retrain_loop2 test completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend drift_retrain_loop2 test failed:', err)
  process.exit(1)
})
