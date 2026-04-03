import express from 'express'
import cors from 'cors'
const app = express()
app.use(cors())
app.use(express.json())
app.get('/', (r, res) => res.json({name: 'ShiHao Finance API', version: '1.0.0', endpoints: ['/health', '/api/market/list', '/api/market/hk/bulk']}))

const PORT = 4000

app.get('/health', (r, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))
app.get('/health/canary', (r, res) => res.json({ ok: true, time: new Date().toISOString() }))
app.get('/health/detailed', (r, res) => res.json({ status: 'ok', port: PORT }))

app.get('/api/market/list', (r, res) => res.json({ markets: ['US', 'CN', 'HK'], timestamp: new Date().toISOString() }))
app.get('/api/market/status', (r, res) => res.json({ us: true, cn: true, hk: true }))
app.get('/api/market/adapter_status', (r, res) => res.json({ status: 'ready', adapters: { us: 'ready', cn: 'ready', hk: 'ready' } }))

app.get('/api/market/hk/symbols', (r, res) => res.json({ symbols: ['0700.HK', '9988.HK', '1833.HK', '2318.HK', '3888.HK'] }))
app.post('/api/market/hk/symbols', (r, res) => res.json({ symbols: ['0700.HK', '9988.HK'] }))

app.get('/api/market/hk/bulk', (r, res) => {
  const q = (r.query.symbols || '').split(',').filter(Boolean)
  const data = q.map(s => ({ code: s, name: s, price: Math.random() * 500 + 10, change: Math.random() * 10 - 5 }))
  res.json({ symbols: q, data })
})

app.get('/api/market/hk/symbol/:symbol', (r, res) => {
  res.json({ code: r.params.symbol, name: r.params.symbol, price: 100, change: 1.5, currency: '$' })
})

app.get('/api/logs/audit', (r, res) => res.json({ count: 0, entries: [] }))
app.get('/api/logs/audit_summary', (r, res) => res.json({ count: 0, entries: [] }))
app.get('/api/logs/recent', (r, res) => res.json({ count: 0, entries: [] }))

app.get('/api/aggregate/cache', (r, res) => res.json({ us_queries: [], cn_queries: [], ttl_ms: 60000 }))
app.get('/api/aggregate/summary', (r, res) => res.json({ total: 0 }))

app.get('/api/metrics', (r, res) => res.json({ uptime_ms: 0 }))
app.get('/api/status', (r, res) => res.json({ status: 'ok', port: PORT }))
app.get('/api/config', (r, res) => res.json({ ok: true }))
app.get('/api/run_times', (r, res) => res.json({ status: 'ok', node_version: '18.x' }))

app.get('/api/retrain/queue', (r, res) => res.json({ queue: [] }))
app.post('/api/retrain/enqueue', (r, res) => res.json({ ok: true, queue_len: 1 }))
app.post('/api/retrain/auto_trigger', (r, res) => res.json({ ok: true, queued: false }))
app.post('/api/retrain/process', (r, res) => res.json({ processed: null, completed: false }))
app.get('/api/retrain/status', (r, res) => res.json({ queue_len: 0, completed_len: 0 }))

app.get('/api/model/drift/check', (r, res) => res.json({ drift: false, status: 'stable' }))
app.get('/api/datasource/cache_status', (r, res) => res.json({ us_cache_entries: 0, cn_cache_entries: 0 }))
app.get('/api/datasource/health', (r, res) => res.json({ us: 'ok', cn: 'ok', hk: 'ok' }))
app.get('/api/datasource/status', (r, res) => res.json({ a_share: 'OK', us: 'OK', hk: 'OK' }))

app.listen(PORT, () => console.log(`ShiHao Finance Backend running on port ${PORT}`))
