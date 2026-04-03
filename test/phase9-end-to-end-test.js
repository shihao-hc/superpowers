// Phase 9 end-to-end health & basic flow test
const http = require('http');

(async () => {
  const port = process.env.SERVER_PORT || 3000;
  // 1) health
  http.get({ hostname: 'localhost', port, path: '/health' }, (res) => {
    let data = '';
    res.on('data', (d) => data += d);
    res.on('end', () => {
      console.log('Phase9-E2E: health', res.statusCode, data);
      // 2) infer
      const req = http.request({ hostname: 'localhost', port, path: '/api/infer', method: 'POST', headers: {'Content-Type': 'application/json'} }, (r) => {
        let body = '';
        r.on('data', (chunk) => body += chunk);
        r.on('end', () => {
          console.log('Phase9-E2E: infer', r.statusCode, body);
        });
      });
      req.on('error', (e) => console.error('Phase9-E2E: infer error', e.message));
      req.write(JSON.stringify({ text: 'end-to-end test' }));
      req.end();
    });
  }).on('error', (e) => {
    console.error('Phase9-E2E: health error', e.message);
  });
})();
