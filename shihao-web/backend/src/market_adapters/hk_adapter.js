import MarketAdapter from './adapter.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
export let hkSymbols = []

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Unified HK symbols loader
export function loadHKSymbols() {
  // reset existing
  hkSymbols = []
  const addFromFile = (fp) => {
    if (!fp || !fs.existsSync(fp)) return
    try {
      const raw = fs.readFileSync(fp, 'utf8')
      const parsed = JSON.parse(raw)
      const syms = Array.isArray(parsed?.symbols) ? parsed.symbols : []
      if (syms.length) hkSymbols.push(...syms)
    } catch {
      // ignore parse errors
    }
  }
  // base symbols
  const basePath = path.resolve(__dirname, '../../config/hk_symbols.json')
  addFromFile(basePath)
  // extras in config dir (dynamic)
  const cfgDir = path.resolve(__dirname, '../../config')
  try {
    const files = fs.readdirSync(cfgDir)
    for (const f of files) {
      if (/^hk_symbols_extra\d*\.json$/.test(f)) {
        addFromFile(path.join(cfgDir, f))
      }
    }
  } catch {
    // ignore
  }
  // deduplicate while preserving order
  const seen = new Set()
  const dedup = []
  for (const s of hkSymbols) {
    if (!seen.has(s)) {
      seen.add(s)
      dedup.push(s)
    }
  }
  hkSymbols = dedup
  // fallback defaults if nothing loaded
  if (!hkSymbols || hkSymbols.length === 0) {
    hkSymbols = ['0700.HK','9988.HK','1833.HK','2318.HK','3888.HK','2338.HK','1113.HK','1299.HK']
  }
  return hkSymbols
}

// Initialize on load
loadHKSymbols()

export default class HKAdapter extends MarketAdapter {
  async fetch(symbols = hkSymbols.length ? hkSymbols : ['0700.HK','9988.HK']) {
    if (!Array.isArray(symbols)) symbols = [symbols]
    const results = symbols.map((sym) => {
      switch (sym) {
        case '0700.HK':
          return { code: '0700.HK', name: '腾讯控股', price: 585.0, change: 1.2, currency: '$' }
        case '9988.HK':
          return { code: '9988.HK', name: '阿里巴巴', price: 78.0, change: -0.5, currency: '$' }
        case '1833.HK':
          return { code: '1833.HK', name: '示例公司A', price: 120.5, change: 0.8, currency: '$' }
        default:
          if (hkSymbols.includes(sym)) {
            // dynamic mock data for any symbol listed in config (no external calls)
            const price = Math.max(1, Math.round((Math.random() * 500 + 5) * 100) / 100)
            const change = Math.round((Math.random() * 10 - 5) * 100) / 100
            return { code: sym, name: sym, price, change, currency: '$' }
          }
          return { code: sym, name: sym, price: 0, change: 0, currency: '$' }
      }
    })
    return results
  }
}
