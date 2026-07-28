// Phase 9 health check for production endpoints
const http = require('http');

(async () => {
  const port = process.env.SERVER_PORT || 3000;
  http.get({ hostname: 'localhost', port, path: '/health' }, (res) => {
    let data = '';
    res.on('data', (c) => data += c);
    res.on('end', () => {
      console.log('Phase9-health-test: status', res.statusCode, 'body', data);
    });
  }).on('error', (e) => {
    console.error('Phase9-health-test error:', e.message);
  });
})();
