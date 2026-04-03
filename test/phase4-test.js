// Phase 4: Production readiness smoke tests (http endpoints via built-in http)
const http = require('http');

function request(path, method = 'GET', payload) {
  const options = {
    hostname: 'localhost',
    port: process.env.SERVER_PORT || 3000,
    path,
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (payload) {
      req.write(JSON.stringify(payload));
    }
    req.end();
  });
}

(async () => {
  try {
    console.log('Phase4-Health:', await request('/health'));
    const apiRes = await request('/api/infer', 'POST', { text: 'health check' });
    console.log('Phase4-API Infer:', apiRes);
  } catch (e) {
    console.error('Phase4-test error:', e.message);
  }
})()
