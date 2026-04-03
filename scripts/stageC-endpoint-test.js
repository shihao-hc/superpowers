// Stage C: Upload custom skill via ZIP payload (minimal)
const http = require('http');
const querystring = require('querystring');
const postData = JSON.stringify({ name: 'custom-skill', payloadBase64: Buffer.from('PK').toString('base64') });

const options = {
  hostname: '127.0.0.1',
  port: 3000, // adapt to your local API server port if running
  path: '/api/skills/upload',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log('Stage C upload status:', res.statusCode);
  res.setEncoding('utf8');
  res.on('data', (chunk) => { console.log('Stage C upload response:', chunk); });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();
