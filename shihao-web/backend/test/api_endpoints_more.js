#!/usr/bin/env node
// Additional backend endpoints smoke test (separate from batch tests)
const http = require('http')
const assert = require('assert')

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: 4000, path }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    }).on('error', reject)
  })
}

function post(path, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload)
    const req = http.request({ hostname: 'localhost', port: 4000, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function run() {
  try {
    let r = await get('/health')
    assert(r.status === 200 || r.status === 304)

    r = await get('/api/policy/monitor')
    assert(r.status === 200)

    r = await get('/api/knowledge/search?q=quant')
    assert(r.status === 200)

    r = await get('/api/datasource/status')
    assert(r.status === 200)

    r = await get('/api/recap/daily')
    assert(r.status === 200)

    r = await post('/api/backtest/run', { name: 'smoke', params: {} })
    assert(r.status === 200)

    r = await get('/api/watchlist')
    assert(r.status === 200)

    r = await get('/api/model/drift/check')
    assert(r.status === 200)

    r = await get('/api/search/aggregate?query=stock')
    assert(r.status === 200)

    console.log('api_endpoints_more: OK')
    process.exit(0)
  } catch (err) {
    console.error('api_endpoints_more: FAIL', err)
    process.exit(1)
  }
}

run()
