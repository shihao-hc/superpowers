#!/usr/bin/env node
// Simple performance trend endpoint smoke test
const http = require('http')
const assert = require('assert')

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: 4000, path }, (res) => {
      let data = ''
      res.on('data', (d) => (data += d))
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { resolve(data) }
      })
    }).on('error', reject)
  })
}

async function run() {
  // assume backend already started by CI
  const res = await get('/api/performance/trend')
  if (res && res.data) {
    console.log('perf_trend', res.data.length, 'points')
    process.exit(0)
  } else {
    console.error('perf_trend missing')
    process.exit(1)
  }
}

run().catch(e => {
  console.error('perf test error', e)
  process.exit(1)
})
