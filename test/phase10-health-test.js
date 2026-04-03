// Phase 10 health check for edge deployment (basic)
const http = require('http');

(async () => {
  const port = process.env.SERVER_PORT || 3000;
  http.get({ hostname: 'localhost', port, path: '/health' }, (res) => {
    let data = '';
    res.on('data', (d) => data += d);
    res.on('end', () => {
      console.log('Phase10-health-test: status', res.statusCode, 'body', data);
    });
  }).on('error', (e) => {
    console.error('Phase10-health-test error:', e.message);
  });
})();
