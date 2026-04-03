// Phase E drift loop test 4
const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        for (let i = 0; i < 10; i++) {
          await fetch(base + '/api/model/drift/check?ic=' + (i % 2 === 0 ? 0.8 : 0.3))
        }
        let res = await fetch(base + '/api/retrain/auto_trigger?force=true')
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
  console.log('Backend drift_retrain_loop4 test completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend drift_retrain_loop4 test failed:', err)
  process.exit(1)
})
