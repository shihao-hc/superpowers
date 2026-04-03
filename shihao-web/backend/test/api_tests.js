#!/usr/bin/env node
// Lightweight integration tests for backend endpoints (usable in CI)
const { spawn } = require('child_process')
const http = require('http')
const assert = require('assert')

async function sleep(ms){ return new Promise(r => setTimeout(r, ms)) }

async function run(){
  const env = { ...process.env, PORT: '4000', USE_MOCK_AGGREGATE: 'true' }
  const server = spawn(process.execPath, ['src/index.js'], {
    cwd: 'D:\龙虾\shihao-web\backend',
    stdio: ['ignore','pipe','pipe'],
    env
  })
  // wait boot
  await sleep(600)

  async function get(path){
    return new Promise((resolve, reject)=>{
      http.get({ hostname: '127.0.0.1', port: 4000, path, agent: false }, (res)=>{
        let data=''
        res.on('data', chunk => data += chunk)
        res.on('end', ()=> resolve(JSON.parse(data)))
      }).on('error', reject)
    })
  }

  try {
    const health = await get('/health')
    assert.ok(health.status === 'ok')
    const agg = await get('/api/search/aggregate?query=stock')
    assert.ok(agg && agg.results && agg.engines)
    console.log('api_tests: ok')
  } catch (e) {
    console.error('api_tests: failed', e)
    server.kill()
    process.exit(1)
  }

  server.kill()
}

run()
