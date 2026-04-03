#!/usr/bin/env node
// Batch API endpoint tests for backend (end-to-end smoke for CI)
const http = require('http')
const assert = require('assert')
const { spawn } = require('child_process')

function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: 'localhost', port: 4000, path }, (res) => {
      let data = ''
      res.on('data', (d) => (data += d))
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
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
  // Start backend on port 4000 (ensure it's not already running)
  const server = spawn(process.execPath, ['src/index.js'], {
    cwd: 'D:\龙虾\shihao-web\backend',
    env: { ...process.env, PORT: '4000', USE_MOCK_AGGREGATE: 'true' },
    stdio: 'ignore'
  })
  // wait boot
  await new Promise(r => setTimeout(r, 800))

  try {
    // health
    let r = await get('/health')
    assert(r.status === 200 || r.status === 304)

    // policy
    r = await get('/api/policy/monitor')
    assert(r.status === 200)

    // knowledge
    r = await get('/api/knowledge/search?q=quant')
    assert(r.status === 200)

    // datasource status
    r = await get('/api/datasource/status')
    assert(r.status === 200)

    // recap daily
    r = await get('/api/recap/daily')
    assert(r.status === 200)

    // backtest run
    r = await post('/api/backtest/run', { name: 'smoke', params: {} })
    assert(r.status === 200)

    // watchlist
    r = await get('/api/watchlist')
    assert(r.status === 200)

    // drift (prototype)
    r = await get('/api/model/drift/check')
    assert(r.status === 200)

    // aggregate
    r = await get('/api/search/aggregate?query=stock')
    assert(r.status === 200)
  } catch (e) {
    console.error('API batch test failed', e)
    server.kill()
    process.exit(1)
  }

  server.kill()
  process.exit(0)
}

run()
