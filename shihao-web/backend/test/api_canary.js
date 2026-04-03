#!/usr/bin/env node
// Canary test for /health/canary endpoint
const http = require('http')
const assert = require('assert')

function get() {
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: 4000, path: '/health/canary' }, (res) => {
      let data = ''
      res.on('data', (d) => (data += d))
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { resolve(JSON.parse('{}')) }
      })
    }).on('error', reject)
  })
}

async function run(){
  const resp = await get()
  if (!resp || resp.ok !== true) {
    console.error('canary check failed', resp)
    process.exit(1)
  }
  console.log('CANARY OK')
  process.exit(0)
}

run().catch(e => {
  console.error('canary error', e)
  process.exit(1)
})
