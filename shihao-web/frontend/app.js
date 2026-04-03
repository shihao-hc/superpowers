// Lightweight SPA for ShiHao Finance Web UI
(function(){
  const API_BASE = 'http://localhost:4000'
  
  async function renderView() {
    const root = document.getElementById('app')
    if (!root) {
      document.getElementById('app').innerHTML = 'Error: app element not found'
      return
    }
    
    root.innerHTML = 'Loading...'
    const hash = window.location.hash || '#/'
    
    try {
      let data
      if (hash.startsWith('#/health')) {
        data = await fetch(API_BASE + '/health').then(r => r.json())
        root.innerHTML = '<h2>Health Status</h2><pre>' + JSON.stringify(data, null, 2) + '</pre>'
      } else if (hash.startsWith('#/markets')) {
        data = await fetch(API_BASE + '/api/market/list').then(r => r.json())
        root.innerHTML = '<h2>Markets</h2><pre>' + JSON.stringify(data, null, 2) + '</pre>'
      } else {
        // Home page - HK bulk data
        data = await fetch(API_BASE + '/api/market/hk/bulk?symbols=0700.HK,9988.HK').then(r => r.json())
        root.innerHTML = '<h2>HK Stock Data</h2><pre>' + JSON.stringify(data, null, 2) + '</pre>'
      }
    } catch (e) {
      root.innerHTML = '<h2>Error</h2><p>Failed to load data: ' + e.message + '</p>'
    }
  }

  window.addEventListener('hashchange', renderView)
  window.addEventListener('load', renderView)
})()
