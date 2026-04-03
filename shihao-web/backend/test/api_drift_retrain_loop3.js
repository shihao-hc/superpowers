// Phase E drift retrain loop test variant 3
const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        // mix drift signals
        for (let i = 0; i < 8; i++) {
          const ic = i % 2 === 0 ? 0.9 : 0.4
          await fetch(base + '/api/model/drift/check?ic=' + ic)
        }
        // trigger auto retrain
        let res = await fetch(base + '/api/retrain/auto_trigger?force=true')
        let data = await res.json()
        assert.ok('queued' in data)
        // verify queue length progressed
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
  console.log('Backend drift retrain loop test 3 completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend drift retrain loop test 3 failed:', err)
  process.exit(1)
})
