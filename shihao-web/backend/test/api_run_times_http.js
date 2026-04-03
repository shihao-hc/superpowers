#!/usr/bin/env node
// Run-times endpoint smoke test
const http = require('http')
const assert = require('assert')

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: 4000, path }, (res) => {
      let data = ''
      res.on('data', (d) => (data += d))
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: data }) } catch (e) { resolve({ status: res.statusCode, body: data }) }
      })
    }).on('error', reject)
  })
}

async function run(){
  const r = await get('/api/run_times')
  try {
    const body = typeof r.body === 'string' ? JSON.parse(r.body) : r.body
    assert(r.status === 200)
    assert(body && body.node_version)
  } catch(err){
    console.error('api_run_times_http.js failed', err)
    process.exit(1)
  }
  process.exit(0)
}

run()
