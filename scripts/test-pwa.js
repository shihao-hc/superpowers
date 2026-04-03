#!/usr/bin/env node
const http = require('http');

const BASE_URL = 'http://localhost:3000';

const tests = [
  { name: 'Main Page (index.html)', url: '/' },
  { name: 'Service Worker', url: '/frontend/service-worker.js' },
  { name: 'Offline Page', url: '/frontend/offline.html' },
  { name: 'Manifest', url: '/frontend/manifest.json' },
  { name: 'Cacheable Assets', url: '/frontend/cacheable-assets.json' },
  { name: 'PWA Icon 72x72', url: '/frontend/icons/icon-72x72.png' },
  { name: 'PWA Icon 192x192', url: '/frontend/icons/icon-192x192.png' },
  { name: 'PWA Icon 512x512', url: '/frontend/icons/icon-512x512.png' },
  { name: 'Game Panel', url: '/frontend/game-panel.html' },
  { name: 'Stream Page', url: '/frontend/stream.html' },
];

function testUrl(test) {
  return new Promise((resolve) => {
    const url = new URL(test.url, BASE_URL);
    const req = http.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const ok = res.statusCode === 200;
        let details = `HTTP ${res.statusCode}`;
        if (test.url.endsWith('.png')) {
          details += ` | Size: ${Buffer.byteLength(data)} bytes`;
        } else if (test.url.endsWith('.json')) {
          try {
            const json = JSON.parse(data);
            if (test.url.includes('cacheable')) {
              details += ` | Assets: ${json.urls?.length || 0}`;
            } else if (test.url.includes('manifest')) {
              details += ` | Icons: ${json.icons?.length || 0}`;
            }
          } catch (e) {}
        }
        resolve({ ...test, ok, details, statusCode: res.statusCode });
      });
    });
    req.on('error', (err) => {
      resolve({ ...test, ok: false, details: err.message, statusCode: 0 });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ...test, ok: false, details: 'Timeout', statusCode: 0 });
    });
  });
}

async function runTests() {
  console.log('🧪 PWA Service Worker Test Suite\n');
  console.log('Testing endpoints...\n');
  
  const results = await Promise.all(tests.map(testUrl));
  
  let passed = 0;
  let failed = 0;
  
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    console.log(`${icon} ${r.name}`);
    console.log(`   URL: ${r.url}`);
    console.log(`   Status: ${r.details}`);
    console.log('');
    
    if (r.ok) passed++;
    else failed++;
  }
  
  console.log('─'.repeat(50));
  console.log(`\nResults: ${passed} passed, ${failed} failed, ${tests.length} total`);
  console.log(`Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\n✅ All PWA/Service Worker tests passed!');
  } else {
    console.log('\n❌ Some tests failed. Check the output above.');
    process.exit(1);
  }
}

runTests();
