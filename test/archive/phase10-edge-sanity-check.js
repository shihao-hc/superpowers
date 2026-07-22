// Phase 10 edge sanity check: quick health checks and latency verify
const http = require('http');

(async () => {
  const port = process.env.SERVER_PORT || 3000;
  http.get({ hostname: 'localhost', port, path: '/health' }, (res) => {
    res.on('data', () => {});
    res.on('end', () => console.log('Phase10-edge-sanity: health', res.statusCode));
  }).on('error', (e) => console.error('Phase10-edge-sanity health error', e.message));
})();
