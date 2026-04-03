#!/usr/bin/env node
// Node.js HTTP-based integration test for multiple backend endpoints
const { spawn } = require('child_process')
const http = require('http')
const assert = require('assert')

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { resolve(data) }
      })
    }).on('error', reject)
  })
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + (urlObj.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    }
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { resolve(data) }
      })
    })
    req.on('error', reject)
    req.write(JSON.stringify(body))
    req.end()
  })
}

async function run() {
  const server = spawn(process.execPath, ['src/index.js'], {
    cwd: 'D:\龙虾\shihao-web\backend',
    stdio: 'ignore',
    env: { ...process.env, PORT: '4000', USE_MOCK_AGGREGATE: 'true' }
  })
  // wait boot
  await new Promise(r => setTimeout(r, 800))

  try {
    const health = await get('http://localhost:4000/health')
    assert(health && health.status === 'ok')

    const policy = await get('http://localhost:4000/api/policy/monitor')
    assert(policy && policy.status)

    const knowledge = await get('http://localhost:4000/api/knowledge/search?q=quant')
    assert(knowledge && knowledge.items)

    const ds = await get('http://localhost:4000/api/datasource/status')
    assert(ds)

    const recap = await get('http://localhost:4000/api/recap/daily')
    assert(recap && recap.date)

    const backtest = await post('http://localhost:4000/api/backtest/run', { name: 'smoke', params: {} })
    assert(backtest && backtest.results)

    const drift = await get('http://localhost:4000/api/model/drift/check')
    // drift endpoint may return a small payload; just ensure it's parsable
    assert(drift)
    // health/detailed endpoint check
    const detailed = await get('http://localhost:4000/health/detailed')
    assert(detailed && detailed.status === 'ok')

    // health/full endpoint check
    const fullHealth = await get('http://localhost:4000/health/full')
    assert(fullHealth && fullHealth.status === 'ok')

    // additional CN test quick check
    const cnTestAgain = await get('http://localhost:4000/api/cn/test')
    assert(cnTestAgain)

    // cache status
    const cacheStatus = await get('http://localhost:4000/api/datasource/cache_status')
    assert(cacheStatus && typeof cacheStatus.us_cache_entries !== 'undefined')

    // CN test endpoint
    const cnTest = await get('http://localhost:4000/api/cn/test')
    assert(cnTest)

    // Market status and market list checks
    const marketStatus = await get('http://localhost:4000/api/market/status')
    assert(marketStatus && marketStatus.status === 200 || marketStatus.statusCode === 200)
    const marketList = await get('http://localhost:4000/api/market/list')
    assert(marketList && marketList.markets)

    // General status check
    const generalStatus = await get('http://localhost:4000/api/status')
    assert(generalStatus && generalStatus.status === 'ok')
    // Config endpoint
    const config = await get('http://localhost:4000/api/config')
    assert(config && config.config)
    const watch = await get('http://localhost:4000/api/watchlist')
    assert(watch && watch.list)

    // aggregate cache inspection
    const aggCache = await get('http://localhost:4000/api/aggregate/cache')
    assert(aggCache && aggCache.us_queries !== undefined)

    // Retrain enqueue and processing (governance/CI test)
    const enq = await post('http://localhost:4000/api/retrain/enqueue', { modelName: 'stock_picker', details: { note: 'ci enqueue' } })
    assert(enq && enq.ok)
    const statusAfterEnqueue = await get('http://localhost:4000/api/retrain/status')
    assert(statusAfterEnqueue)
    const proc = await post('http://localhost:4000/api/retrain/process', {})
    assert(proc && typeof proc.completed !== 'undefined')

    server.kill()
    process.exit(0)
  } catch (err) {
    console.error('API HTTP tests failed:', err)
    server.kill()
    process.exit(1)
  }
}

run().then(()=>{ console.log('api_endpoints_http.js complete') }).catch(e=>{ console.error(e) })
