// Phase E drift test - loop 11 (extended)
const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        for (let i = 0; i < 11; i++) {
          await fetch(base + '/api/model/drift/check?ic=' + (i % 2 === 0 ? 0.65 : 0.95))
        }
        await fetch(base + '/api/retrain/auto_trigger?force=true')
        const res = await fetch(base + '/api/retrain/status')
        const data = await res.json()
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
  console.log('Backend drift_loop11 completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend drift_loop11 failed:', err)
  process.exit(1)
})
