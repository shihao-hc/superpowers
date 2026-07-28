// Phase 10 health trace: trace multiple endpoints with timing
const http = require('http');
console.time('phase10-health-trace');
(async () => {
  const port = process.env.SERVER_PORT || 3000;
  http.get({ hostname: 'localhost', port, path: '/health' }, (res) => {
    res.on('data', () => {});
    res.on('end', () => console.log('health ok', res.statusCode));
  }).on('error', (e) => console.error('health error', e.message));
  http.get({ hostname: 'localhost', port, path: '/api/infer' }, (r) => {
    r.on('data', () => {});
    r.on('end', () => console.log('/api/infer reachable', r.statusCode));
  }).on('error', (e) => console.error('infer error', e.message));
})();
console.timeEnd('phase10-health-trace');
