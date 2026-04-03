// Drift retrain endurance test (Phase E deeper) - multiple drifts with forced retrain
const assert = require('assert')
const app = require('../src/index.js')

async function run() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port
      const base = `http://localhost:${port}`
      try {
        // Trigger drift once to enable callback
        await fetch(base + '/api/model/drift/check?ic=0.7')
        // Force trigger retrain twice to enqueue two items
        for (let i = 0; i < 2; i++) {
          await fetch(base + '/api/retrain/auto_trigger?force=true', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelName: 'stock_picker', details: { test: i } })
          })
        }
        const res = await fetch(base + '/api/retrain/status')
        const data = await res.json()
        // Expect at least two enqueued items
        const queueLen = data.queue_len ?? 0
        assert.ok(queueLen >= 2)
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
  console.log('Backend drift retrain loop test 4 completed')
  process.exit(0)
}).catch((err) => {
  console.error('Backend drift retrain loop test 4 failed:', err)
  process.exit(1)
})
