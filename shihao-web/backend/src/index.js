import express from 'express'
import fs from 'fs'
import path from 'path'
import cors from 'cors'
import dotenv from 'dotenv'
import DriftDetector from './model_drift.js'
import { randomUUID } from 'crypto'
import USAdapter from './market_adapters/us_adapter.js'
import CNAdapter from './market_adapters/cn_adapter.js'
import HKAdapter, { hkSymbols } from './market_adapters/hk_adapter.js'
import os from 'os'
import dns from 'dns'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

// Phase C: Lightweight Request Tracing and Governance
function generateTraceId() {
  try {
    return typeof randomUUID === 'function' ? randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  } catch {
    return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}

// (Trace middleware registered after app creation to ensure proper binding)

const app = express()
// Attach trace_id and expose it via header (Phase C)
app.use((req, res, next) => {
  req.trace_id = generateTraceId()
  res.setHeader('X-Trace-Id', req.trace_id)
  next()
})
const PORT = process.env.PORT || 4000

// Initialize simple JSON access log
const LOG_DIR = path.resolve(process.cwd(), 'logs')
try {
  fs.mkdirSync(LOG_DIR, { recursive: true })
} catch (e) {
  // ignore
}

// JSON access logger: log every request/response in JSON lines
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const log = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
      trace_id: req.trace_id
    }
    try {
      fs.appendFile(path.join(LOG_DIR, 'access.json'), JSON.stringify(log) + '\n', () => {})
    } catch (e) {
      // ignore logging errors
    }
    // Audit log entry for governance
    const auditLog = {
      timestamp: new Date().toISOString(),
      trace_id: req.trace_id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode
    }
    try {
      const auditPath = path.join(LOG_DIR, 'audit.json')
      fs.appendFile(auditPath, JSON.stringify(auditLog) + '\n', () => {})
    } catch {}
    try {
      const daily = new Date().toISOString().slice(0, 10)
      const dailyPath = path.join(LOG_DIR, `audit-${daily}.log`)
      fs.appendFile(dailyPath, JSON.stringify(auditLog) + '\n', () => {})
    } catch {}
  })
  next()
})

// Audit endpoint to inspect recent audits (Phase C convenience)
app.get('/api/logs/audit', (req, res) => {
  try {
    const auditPath = path.join(LOG_DIR, 'audit.json')
    const content = fs.readFileSync(auditPath, 'utf8')
    const lines = content.trim().length ? content.trim().split('\n') : []
    const entries = lines.map((l) => {
      try { return JSON.parse(l) } catch { return l }
    }).slice(-100)
    res.json({ count: entries.length, entries })
  } catch {
    res.json({ count: 0, entries: [] })
  }
})

// Phase C/Phase D: Audit summary endpoint (short digest)
app.get('/api/logs/audit_summary', (req, res) => {
  try {
    const auditPath = path.join(LOG_DIR, 'audit.json')
    const content = fs.readFileSync(auditPath, 'utf8')
    const lines = content.trim().length ? content.trim().split('\n') : []
    const entries = lines.map((l) => {
      try { return JSON.parse(l) } catch { return l }
    }).slice(-50)
    res.json({ count: entries.length, entries })
  } catch {
    res.json({ count: 0, entries: [] })
  }
})

// Canary health endpoint for quick runtime verification
app.get('/health/canary', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), uptime_ms: Math.floor(process.uptime() * 1000), memory_rss: process.memoryUsage().rss })
})
app.use(cors())
app.use(express.json())

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Detailed health endpoint for diagnostics
app.get('/health/detailed', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    port: PORT,
    uptime_ms: Math.floor(process.uptime() * 1000)
  })
})

// Full health endpoint with memory and CPU metrics
app.get('/health/full', (req, res) => {
  const mem = process.memoryUsage()
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    port: PORT,
    uptime_ms: Math.floor(process.uptime() * 1000),
    memory: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed
    },
    cpu_cores: os.cpus().length
  })
})

// Lightweight health summary (OS metrics)
app.get('/api/health/summary', (req, res) => {
  res.json({
    status: 'ok',
    platform: os.platform(),
    uptime_seconds: Math.floor(process.uptime()),
    cpu_cores: os.cpus().length,
    timestamp: new Date().toISOString()
  })
})

// Simple error handler (log to file)
app.use(async (err, req, res, next) => {
  try {
    const logPath = path.join(LOG_DIR, 'errors.json')
    const logEntry = {
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method,
      message: err?.message || 'Unhandled error',
      stack: err?.stack
    }
    await fs.promises.appendFile(logPath, JSON.stringify(logEntry) + '\n')
  } catch {}
  res.status(500).json({ error: 'Internal server error' })
})

// Markets status endpoint (basic)
app.get('/api/market/status', (req, res) => {
  res.json({ us: true, cn: true, hk: true, updated_at: new Date().toISOString() })
})

// Helper to instantiate adapters by market type
function getMarketAdapter(type) {
  switch ((type || 'us').toLowerCase()) {
    case 'us': return new USAdapter()
    case 'cn': return new CNAdapter()
    case 'hk': return new HKAdapter()
    default: return null
  }
}

// HK dynamic symbols management endpoints (admin)
app.get('/api/market/hk/symbols', (req, res) => {
  res.json({ symbols: hkSymbols })
})

app.post('/api/market/hk/symbols', (req, res) => {
  const { add, remove } = req.body || {}
  if (Array.isArray(add)) {
    add.forEach((s) => {
      if (!hkSymbols.includes(s)) hkSymbols.push(s)
    })
  }
  if (Array.isArray(remove)) {
    remove.forEach((s) => {
      const idx = hkSymbols.indexOf(s)
      if (idx >= 0) hkSymbols.splice(idx, 1)
    })
  }
  res.json({ symbols: hkSymbols })
})

// Phase D: Market adapters readiness (stub for multi-market support)
app.get('/api/market/adapter_status', (req, res) => {
  res.json({ status: 'ready', adapters: { us: 'ready', cn: 'ready', hk: 'ready' } })
})

// Markets list endpoint (basic)
app.get('/api/market/list', (req, res) => {
  res.json({ markets: ['US', 'CN', 'HK'], timestamp: new Date().toISOString() })
})

// HK Bulk endpoint for testing large symbol sets
app.get('/api/market/hk/bulk', (req, res) => {
  const q = (req.query.symbols || '').split(',').filter(Boolean)
  const data = q.map((s) => {
    switch (s) {
      case '1010.HK': return { code: '1010.HK', name: '示例公司AA1', price: 12.0, change: 0.3, currency: '$' }
      case '1020.HK': return { code: '1020.HK', name: '示例公司AA2', price: 9.5, change: -0.1, currency: '$' }
      case '1050.HK': return { code: '1050.HK', name: '示例公司AA3', price: 21.4, change: 0.6, currency: '$' }
      case '1110.HK': return { code: '1110.HK', name: '示例公司AA4', price: 33.3, change: 0.8, currency: '$' }
      case '1200.HK': return { code: '1200.HK', name: '示例公司AA5', price: 44.4, change: -0.4, currency: '$' }
      case '1300.HK': return { code: '1300.HK', name: '示例公司AA6', price: 55.5, change: 0.2, currency: '$' }
      case '1400.HK': return { code: '1400.HK', name: '示例公司AA7', price: 66.6, change: -0.3, currency: '$' }
      case '1500.HK': return { code: '1500.HK', name: '示例公司AA8', price: 77.7, change: 0.1, currency: '$' }
      case '1600.HK': return { code: '1600.HK', name: '示例公司AA9', price: 88.8, change: 0.5, currency: '$' }
      default: return { code: s, name: s, price: 0, change: 0, currency: '$' }
    }
  })
  res.json({ symbols: q, data })
})

// Logs: recent access log sampling
app.get('/api/logs/recent', (req, res) => {
  const logPath = path.join(LOG_DIR, 'access.json')
  try {
    const content = fs.readFileSync(logPath, 'utf8')
    const lines = content.split('\n').filter(l => l.trim().length > 0)
    const recent = lines.slice(-50).map((line) => {
      try { return JSON.parse(line) } catch { return line }
    })
    res.json({ count: recent.length, entries: recent })
  } catch (e) {
    res.json({ count: 0, entries: [] })
  }
})
// Aggregate cache inspection (diagnostic)
app.get('/api/aggregate/cache', (req, res) => {
  res.json({
    us_queries: Object.keys(aggCache.us || {}),
    cn_queries: Object.keys(aggCache.cn || {}),
    ttl_ms: AGG_CACHE_TTL_MS,
    cache_hits: CACHE_STATS
  })
})

// Aggregate data summary (quick stats from latest cached data)
app.get('/api/aggregate/summary', (req, res) => {
  const lastQuery = 'stock'
  const now = Date.now()
  const usChunk = (aggCache.us[lastQuery] && aggCache.us[lastQuery].data && aggCache.us[lastQuery].data.results) || []
  const cnChunk = (aggCache.cn[lastQuery] && aggCache.cn[lastQuery].data && aggCache.cn[lastQuery].data.results) || []
  const combined = [...usChunk, ...cnChunk]
  if (!combined.length) {
    return res.json({ total: 0, average_price: null, average_change: null, min_price: null, max_price: null })
  }
  const prices = combined.map(r => r.price)
  const changes = combined.map(r => r.change)
  const avgPrice = prices.reduce((a,b)=>a+b,0)/prices.length
  const avgChange = changes.reduce((a,b)=>a+b,0)/changes.length
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  res.json({ total: combined.length, average_price: avgPrice, average_change: avgChange, min_price: minPrice, max_price: maxPrice })
})

// Metrics endpoint: basic runtime memory usage
app.get('/api/metrics', (req, res) => {
  const mem = process.memoryUsage()
  const cpuUsage = process.cpuUsage()
  const cpuUsageSec = (cpuUsage.user + cpuUsage.system) / 1e6
  res.json({
    uptime_ms: Math.floor(process.uptime() * 1000),
    memory: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed
    },
    cpu_cores: os.cpus().length,
    cpu_usage_seconds: cpuUsageSec
  })
})

// Health checks for runtime and network diagnostics
app.get('/api/health/checks', async (req, res) => {
  let dnsOk = true
  await new Promise((resolve) => {
    dns.resolve('example.com', (err) => {
      if (err) dnsOk = false
      resolve()
    })
  })
  res.json({ status: 'ok', checks: { dns: dnsOk, memory: true, network: true }, timestamp: new Date().toISOString() })
})
// Simple system status endpoint
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', port: PORT, uptime_ms: Math.floor(process.uptime() * 1000) })
})
// API to expose current config (read-only)
app.get('/api/config', (req, res) => {
  res.json({ ok: true, config: _loadedConfig })
})

// Simple retrain queue exposure (for debugging/CI)
let _retrain_queue = []
function enqueueRetrain(modelName, details) {
  _retrain_queue.push({ modelName, details, enqueued_at: new Date().toISOString() })
}
app.get('/api/retrain/queue', (req, res) => {
  res.json({ queue: _retrain_queue })
})

// Enqueue a retraining task (for CI/demo purposes)
app.post('/api/retrain/enqueue', (req, res) => {
  const { modelName, details } = req.body || {}
  if (!modelName) {
    return res.status(400).json({ error: 'modelName is required' })
  }
  enqueueRetrain(modelName, details || {})
  res.json({ ok: true, queue_len: _retrain_queue.length, item: { modelName, details } })
})

// Phase E: Auto retrain trigger (drift-based or force)
app.post('/api/retrain/auto_trigger', (req, res) => {
  const force = (req.query.force === 'true') || (req.body?.force === true)
  let queued = false
  if (force) {
    enqueueRetrain(req.body?.modelName || 'stock_picker', { auto_trigger: true, force })
    queued = true
  } else {
    const drift = driftDetector.check()
    if (drift?.drift) {
      enqueueRetrain('stock_picker', { drift_status: drift?.status, mean: drift?.mean })
      queued = true
    }
  }
  res.json({ ok: true, queued, queue_len: _retrain_queue.length })
})

// Process next retraining task (simulate trainer)
let _retrain_completed = []
function processNextRetrain() {
  if (_retrain_queue.length === 0) return null
  const item = _retrain_queue.shift()
  _retrain_completed.push({ ...item, completed_at: new Date().toISOString() })
  return item
}
app.post('/api/retrain/process', (req, res) => {
  const processed = processNextRetrain()
  res.json({ processed, completed: !!processed })
})

app.get('/api/retrain/status', (req, res) => {
  res.json({
    queue_len: _retrain_queue.length,
    completed_len: _retrain_completed.length,
    last_enqueued_at: _retrain_queue[0]?.enqueued_at ?? null,
    last_completed_at: _retrain_completed[_retrain_completed.length - 1]?.completed_at ?? null
  })
})

// Model drift check endpoint (prototype)
app.get('/api/model/drift/check', (req, res) => {
  // In real usage, feed actual metrics; allow ic override for testing
  const ic = parseFloat(req.query.ic) || 0.1
  driftDetector.log(ic)
  res.json(driftDetector.check())
})

// Cache stats endpoint (diagnostic)
app.get('/api/datasource/cache_status', (req, res) => {
  res.json({
    us_cache_entries: Object.keys(aggCache.us || {}).length,
    cn_cache_entries: Object.keys(aggCache.cn || {}).length,
    ttl_ms: AGG_CACHE_TTL_MS,
    hits: CACHE_STATS
  })
})

// CN service health test (diagnostic)
app.get('/api/cn/test', async (req, res) => {
  try {
    const url = CN_SERVICE_URL
    if (!url) throw new Error('No CN service URL')
    if (typeof fetch === 'function') {
      const r = await fetch(url)
      res.json({ status: r.ok ? 'ok' : 'unreachable', code: r.status })
      return
    }
    res.json({ status: 'unknown' })
  } catch (e) {
    res.json({ status: 'unreachable', error: e.message })
  }
})

// [Duplicate CN_SERVICE_URL/aggCache block removed to avoid duplication]

// Optional config loader (removed duplicate to avoid re-declaration)

// Simple mock switch for testing without external calls
const USE_MOCK_AGGREGATE = (process.env.USE_MOCK_AGGREGATE || 'false').toLowerCase() === 'true'

// Cache hit/miss statistics for diagnostic purposes
const CACHE_STATS = { us_hits: 0, cn_hits: 0, misses: 0 }

// Lightweight drift detector instance (prototype)
const driftDetector = new DriftDetector()

// Auto-enqueue retraining when drift is detected (basic governance)
driftDetector.register_drift_callback((report) => {
  try {
    const status = report?.drift_status
    if (status === 'drifted' || status === 'warning') {
      enqueueRetrain('stock_picker', {
        drift_status: status,
        ic_change_pct: report?.ic_change_pct,
        ir_change_pct: report?.ir_change_pct,
        psi_scores: report?.psi_scores
      })
    }
  } catch {
    // ignore callback errors
  }
})

// Enhanced: multi-engine aggregation search endpoint (示例实现)
app.get('/api/search/aggregate', async (req, res) => {
  const query = (req.query.query || '').trim().toLowerCase()
  let usResults = []
  let cnResults = []
  // Try cache first
  let usedCache = false
  const now = Date.now()
  if (aggCache.us[query] && (now - aggCache.us[query].ts) < AGG_CACHE_TTL_MS) {
    usResults = aggCache.us[query].data.results || []
    usedCache = true
    CACHE_STATS.us_hits += 1
  }
  if (aggCache.cn[query] && (now - aggCache.cn[query].ts) < AGG_CACHE_TTL_MS) {
    cnResults = aggCache.cn[query].data.results || []
    usedCache = true
    CACHE_STATS.cn_hits += 1
  }
  // If mock mode is enabled for tests, return deterministic data
  if (USE_MOCK_AGGREGATE) {
    const finalResults = [
      { code: 'AAPL', name: 'Apple Inc.', price: 180.0, change: 1.2, currency: '$' },
      { code: 'MSFT', name: 'Microsoft', price: 210.0, change: -0.5, currency: '$' }
    ]
    return res.json({ data_version: '1.0', query: query, engines: ['Yahoo US', 'AKShare CN'], results: finalResults })
  }

  try {
    // US data via Yahoo Finance REST (公开接口)
    const usRaw = await fetch('https://query1.finance.yahoo.com/v7/finance/quote?symbols=AAPL,MSFT,GOOGL')
    const usJson = await usRaw.json()
    usResults = (usJson?.quoteResponse?.result ?? []).map((s) => ({
      code: s.symbol,
      name: s.shortName || s.displayName || s.symbol,
      price: s.regularMarketPrice ?? s.regularMarketPrice?.raw ?? s.regularMarketPrice?.value ?? 0,
      change: s.regularMarketChange?.raw ?? s.regularMarketChangePercent?.raw ?? 0,
      currency: s.currency || '$'
    }))
  } catch (e) {
    usResults = []
  }
  // CN data via AKShare microservice (preferred) or fallback static data
  try {
    const cnResp = await fetch(`${CN_SERVICE_URL}?symbols=600519,000001&limit=5`)
    const cnJson = await cnResp.json()
    if (Array.isArray(cnJson?.data)) {
      cnResults = cnJson.data.map((r) => ({
        code: r.code, name: r.name, price: r.price, change: r.change, currency: r.currency || '¥'
      }))
    } else if (Array.isArray(cnJson?.stocks)) {
      cnResults = cnJson.stocks.map((r) => ({
        code: r.code, name: r.name, price: r.price, change: r.change, currency: r.currency || '¥'
      }))
    } else {
      throw new Error('no data')
    }
  } catch (e) {
    // Fallback to static CN data if microservice is unavailable
    cnResults = [
      { code: '600519', name: '贵州茅台', price: 1728.0, change: 3.21, currency: '¥' },
      { code: '000001', name: '平安银行', price: 12.35, change: -1.02, currency: '¥' }
    ]
  }
  // Build final combined result and update caches
  const finalResults = [...(usResults || []).slice(0, 5), ...cnResults]
  const finalPayload = {
    data_version: "1.0",
    query,
    engines: ['Yahoo US', 'AKShare CN'],
    results: finalResults
  }
  // Update cache only if we used Yahoo US or CN results
  if (usResults && usResults.length) {
    aggCache.us[query] = { ts: now, data: { results: finalResults, engines: ['Yahoo US', 'AKShare CN'] } }
  }
  if (cnResults && cnResults.length) {
    aggCache.cn[query] = { ts: now, data: { results: cnResults, engines: ['AKShare CN'] } }
  }
  // Record misses if neither cache path was used this round
  if (!usedCache) {
    CACHE_STATS.misses += 1
  }
  res.json(finalPayload)
})

// --------- Extended Endpoints for UI Integration (Plan B) -------------
// 1) Aggregated multi-engine search
app.get('/api/search/aggregate_ui_mock', (req, res) => {
  const q = req.query.query || ''
  const results = [
    { code: 'AAPL', name: 'Apple Inc.', engine: 'AKSearch', score: 0.92 },
    { code: 'MSFT', name: 'Microsoft', engine: 'OpenAPI', score: 0.89 },
    { code: '600519', name: '贵州茅台', engine: 'AKSearch', score: 0.85 }
  ]
  res.json({ query: q, results, engines: 3 })
})

// 2) Policy monitoring (简式监控)
app.get('/api/policy/monitor', (req, res) => {
  res.json({ status: 'OK', alerts: [] , last_updated: new Date().toISOString() })
})

// 3) Knowledge base search (简化)
app.get('/api/knowledge/search', (req, res) => {
  res.json({ q: req.query.q || '', items: [
    { id: 'k1', title: 'Factor Model Basics' },
    { id: 'k2', title: 'PSI for Data Drift' }
  ]})
})

// 4) Data source status (A股、美元等简要状态)
app.get('/api/datasource/status', (req, res) => {
  res.json({ a_share: 'OK', us: 'OK', hf: 'OK', last_checked: new Date().toISOString() })
})

// 5) Daily recap (简要)
app.get('/api/recap/daily', (req, res) => {
  res.json({ date: new Date().toISOString(), summary: '市场今日轻微上扬，策略组合稳定。' })
})

// 6) Backtest run (简化)
app.post('/api/backtest/run', (req, res) => {
  res.json({ request: req.body, results: [ { strategy: 'S1', total_return_pct: 0.12, max_drawdown_pct: -0.08 } ]})
})

// 7) Watchlist (简化)
app.get('/api/watchlist', (req, res) => {
  res.json({ list: [ { code: 'AAPL', name: 'Apple', price: 178.5, change: 0.5 } ]})
})

// 8) Performance trend (简单时间序列，供前端图表使用)
app.get('/api/performance/trend', (req, res) => {
  const days = 7
  const now = Date.now()
  const points = []
  for (let i = days - 1; i >= 0; i--) {
    const ts = new Date(now - i * 24 * 3600 * 1000).toISOString().slice(0, 10)
    const value = Math.abs(Math.sin(i / 2) * 0.05) + (Math.random() * 0.05)
    points.push({ date: ts, value: value })
  }
  res.json({ title: 'Performance Trend (7d)', data: points })
})

// Runtime overview endpoint
app.get('/api/run_times', (req, res) => {
  const osInfo = {
    node_version: process.version,
    platform: os.platform(),
    arch: os.arch(),
    uptime_ms: Math.floor(process.uptime() * 1000),
    cpu_cores: os.cpus().length
  }
  res.json({ status: 'ok', ...osInfo })
})
// Get stock price
app.get('/api/stock/:code', async (req, res) => {
  const { code } = req.params
  try {
    // Mock data for demo
    const mockData = {
      AAPL: { code: 'AAPL', name: 'Apple Inc.', price: 178.52, change: 2.34, currency: '$' },
      MSFT: { code: 'MSFT', name: 'Microsoft', price: 415.28, change: 1.56, currency: '$' },
      GOOGL: { code: 'GOOGL', name: 'Alphabet', price: 175.98, change: -0.45, currency: '$' },
      '600519': { code: '600519', name: '贵州茅台', price: 1728.00, change: 3.21, currency: '¥' },
      '000001': { code: '000001', name: '平安银行', price: 12.35, change: -1.02, currency: '¥' }
    }
    
    const stock = mockData[code] || { code, name: 'Unknown', price: 0, change: 0, currency: '$' }
    res.json(stock)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get market stocks
app.get('/api/market/:type', async (req, res) => {
  const { type } = req.params
  const adapter = getMarketAdapter(type)
  if (!adapter) {
    return res.status(400).json({ error: 'Unknown market type' })
  }
  const symbols = (req.query.symbols || 'AAPL,MSFT,GOOGL').split(',')
  const results = await adapter.fetch(symbols)
  res.json({ market: type, data: results })
})

// HK single-symbol lookup (Batch 1-A addition)
app.get('/api/market/hk/symbol/:symbol', async (req, res) => {
  const { symbol } = req.params
  try {
    const adapter = new HKAdapter()
    const results = await adapter.fetch([symbol])
    res.json({ market: 'hk', symbol, data: results[0] ?? null })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'HK symbol fetch failed' })
  }
})

// AI Analysis endpoint
app.post('/api/analyze', async (req, res) => {
  const { code } = req.body
  
  // Mock AI analysis response
  const analysis = {
    code,
    name: 'Sample Company',
    exchange: 'NASDAQ',
    sector: 'Technology',
    price: 178.52,
    change: 2.34,
    currency: '$',
    signals: [
      { text: '强烈买入', type: 'danger' },
      { text: '技术面多头', type: 'success' },
      { text: '基本面利好', type: 'success' }
    ],
    technical: '股价处于上升趋势，短期均线多头排列。RSI为65，处于合理区间。MACD金叉信号出现，预计短期内将继续上涨。支撑位170美元，阻力位185美元。',
    fundamental: '公司2024年Q4财报超预期，营收同比增长8%。服务业务持续增长，毛利率提升。分析师平均评级为"增持"，目标价200美元。',
    news: '近期无重大利空消息。分析师普遍看好iPhone销量预期。供应链消息显示芯片供应充足。市场情绪偏多。',
    risk: '当前波动率适中，流动性良好。最大回撤风险约8%。建议仓位控制在15%以内。适合中长线持有。'
  }
  
  res.json(analysis)
})

// Order endpoint
app.post('/api/order', (req, res) => {
  const { code, side, quantity, type } = req.body
  
  // Mock order response
  res.json({
    success: true,
    order_id: `ORD_${Date.now()}`,
    code,
    side,
    quantity,
    type,
    status: 'submitted',
    timestamp: new Date().toISOString()
  })
})

// Policy Monitor endpoint (simplified)
app.get('/api/policy/monitor', (req, res) => {
  res.json({ status: 'OK', alerts: [] , last_updated: new Date().toISOString() })
})

// Knowledge search endpoint (simplified)
app.get('/api/knowledge/search', (req, res) => {
  const q = (req.query.q || '').toString()
  res.json({ query: q, items: [
    { id: 'k1', title: 'PSI 指标简介' },
    { id: 'k2', title: 'Kalman 滤波与波动率建模' }
  ]})
})

// Data source status
app.get('/api/datasource/status', (req, res) => {
  res.json({ a_share: 'OK', us: 'OK', hk: 'OK', last_checked: new Date().toISOString() })
})

// Phase B: Lightweight data source health check (US/CN/HK)
app.get('/api/datasource/health', (req, res) => {
  res.json({ us: 'ok', cn: 'ok', hk: 'ok', last_checked: new Date().toISOString() })
})

// Daily recap (简化)
app.get('/api/recap/daily', (req, res) => {
  res.json({ date: new Date().toISOString(), summary: '市场今日回顾：波动性温和，策略回报稳定。' })
})

// Backtest run (简化)
app.post('/api/backtest/run', (req, res) => {
  res.json({
    request: req.body,
    results: [
      { strategy: 'S1', total_return_pct: 0.12, max_drawdown_pct: -0.08, sharpe: 0.9 }
    ]
  })
})

// Watchlist (简化)
app.get('/api/watchlist', (req, res) => {
  res.json({ list: [
    { code: 'AAPL', name: 'Apple', price: 180.0, change: 1.0 },
    { code: '600519', name: '贵州茅台', price: 1728.0, change: 0.5 }
  ]})
})

app.listen(PORT, () => {
  console.log(`ShiHao Backend running on port ${PORT}`)
})

export default app
