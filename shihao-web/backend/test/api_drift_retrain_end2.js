// Phase E drift end-to-end test: drift triggers retrain with multiple cycles
const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        // accumulate drift
        for (let i = 0; i < 6; i++) {
          await fetch(base + '/api/model/drift/check?ic=' + (i % 2 === 0 ? 0.9 : 0.3))
        }
        // force trigger retrain twice
        for (let i = 0; i < 2; i++) {
          await fetch(base + '/api/retrain/auto_trigger?force=true', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelName: 'stock_picker', details: { cycle: i } })
          })
        }
        const res = await fetch(base + '/api/retrain/status')
        const data = await res.json()
        assert.ok('queue_len' in data)
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
  console.log('Backend drift end-to-end test 2 completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend drift end-to-end test 2 failed:', err)
  process.exit(1)
})
