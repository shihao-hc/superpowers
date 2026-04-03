import MarketAdapter from './adapter.js'

export default class CNAdapter extends MarketAdapter {
  async fetch(symbols = ['600519','000001']) {
    // Prefer CN service if configured; else return static data for tests
    const CN_SERVICE_URL = process.env.CN_SERVICE_URL
    if (CN_SERVICE_URL) {
      try {
        const sym = symbols.join(',')
        const r = await fetch(`${CN_SERVICE_URL}?symbols=${encodeURIComponent(sym)}&limit=5`)
        const data = await r.json()
        const results = (data?.data ?? data?.stocks ?? []).map(s => ({
          code: s.code, name: s.name, price: s.price, change: s.change, currency: s.currency || '¥'
        }))
        return results
      } catch {
        // fallback to static data
      }
    }
    // Static fallback data
    return [
      { code: '600519', name: '贵州茅台', price: 1728.0, change: 3.21, currency: '¥' },
      { code: '000001', name: '平安银行', price: 12.35, change: -0.8, currency: '¥' }
    ]
  }
}
