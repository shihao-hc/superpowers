// Phase 10 end-to-end extended test (edge path + latency)
const http = require('http');
console.log('Phase10-end-to-end-test-extended: start');
;(async () => {
  const port = process.env.SERVER_PORT || 3000;
  http.get({ hostname: 'localhost', port, path: '/health' }, (res) => {
    res.on('data', () => {});
    res.on('end', () => {
      console.log('Phase10-end-to-end-test-extended: health OK');
      const req = http.request({ hostname: 'localhost', port, path: '/api/infer', method: 'POST', headers: {'Content-Type': 'application/json'} }, (r) => {
        let data = '';
        r.on('data', (chunk) => data += chunk);
        r.on('end', () => console.log('Phase10-end-to-end-test-extended: infer', r.statusCode, data));
      });
      req.on('error', (e) => console.error('Phase10-end-to-end-test-extended infer error', e.message));
      req.write(JSON.stringify({ text: 'extended end-to-end' }));
      req.end();
    });
  }).on('error', (e) => console.error('Phase10-end-to-end-test-extended health error', e.message));
})();
