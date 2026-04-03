import MarketAdapter from './adapter.js'

export default class USAdapter extends MarketAdapter {
  async fetch(symbols = ['AAPL','MSFT','GOOGL']) {
    try {
      const sym = symbols.length ? symbols.join(',') : 'AAPL,MSFT,GOOGL'
      const r = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}`)
      const js = await r.json()
      const results = (js?.quoteResponse?.result ?? []).map(s => ({
        code: s.symbol,
        name: s.shortName || s.displayName || s.symbol,
        price: s.regularMarketPrice ?? 0,
        change: s.regularMarketChange?.raw ?? 0,
        currency: s.currency || '$'
      }))
      return results
    } catch {
      return []
    }
  }
}
