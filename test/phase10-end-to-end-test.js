// Phase 10 End-to-End Edge Deployment Test (Health + Edge Access)
const http = require('http');

(async () => {
  const port = process.env.SERVER_PORT || 3000;
  // 1) health
  http.get({ hostname: 'localhost', port, path: '/health' }, (res) => {
    let data = '';
    res.on('data', (d) => data += d);
    res.on('end', () => {
      console.log('Phase10-E2E: health', res.statusCode, data);
      // 2) edge infer through edge path (same endpoint for simplicity)
      const req = http.request({ hostname: 'localhost', port, path: '/api/infer', method: 'POST', headers: {'Content-Type': 'application/json'} }, (r) => {
        let b = '';
        r.on('data', (chunk) => b += chunk);
        r.on('end', () => {
          console.log('Phase10-E2E: infer', r.statusCode, b);
        });
      });
      req.on('error', (e) => console.error('Phase10-E2E: infer error', e.message));
      req.write(JSON.stringify({ text: 'edge end-to-end test' }));
      req.end();
    });
  }).on('error', (e) => {
    console.error('Phase10-E2E: health error', e.message);
  });
})();
