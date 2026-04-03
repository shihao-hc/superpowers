#!/usr/bin/env node
// Simple smoke test: start the backend, hit a couple of endpoints, then stop.
import { spawn } from 'child_process'
import { setTimeout } from 'timers/promises'

async function run() {
  // Spawn backend server on port 4000
  const env = { ...process.env, PORT: '4000', USE_MOCK_AGGREGATE: 'true' }
  const server = spawn(process.execPath, ['src/index.js'], {
    cwd: 'D:\龙虾\shihao-web\backend',
    stdio: ['ignore', 'pipe', 'pipe'],
    env
  })

  // wait a moment for the server to start
  await setTimeout(1200)

  const results = []
  function push(res) { results.push(res) }

  try {
    const health = await fetch('http://localhost:4000/health').then(r => r.json())
    push({ name: '/health', ok: health?.status === 'ok' })
  } catch (e) {
    push({ name: '/health', ok: false, error: e.message })
  }

  try {
    const agg = await fetch('http://localhost:4000/api/search/aggregate?query=stock').then(r => r.json())
    push({ name: '/api/search/aggregate', ok: !!agg?.results, engines: Array.isArray(agg?.engines) })
  } catch (e) {
    push({ name: '/api/search/aggregate', ok: false, error: e.message })
  }

  // stop server
  server.kill()
  await new Promise(resolve => server.on('exit', resolve))

  console.log(JSON.stringify({ ok: results.every(r => r.ok), details: results }, null, 2))
  process.exit(results.every(r => r.ok) ? 0 : 1)
}

run()
  .catch(err => {
    console.error('Smoke test failed:', err)
    process.exit(1)
  })
