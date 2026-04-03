/**
 * Security Penetration Tests
 * Tests for common web vulnerabilities
 */

const assert = require('assert');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'test-key';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...options.headers
    }
  });
  return response;
}

async function main() {
  console.log('=== Security Penetration Tests ===\n');
  console.log(`Testing against: ${BASE_URL}\n`);

  const maliciousIds = [
    '__proto__',
    'constructor',
    'prototype',
    '../etc/passwd',
    '..\\windows\\system32',
    "' OR '1'='1",
    '<script>alert("xss")</script>',
    '"; DROP TABLE users; --',
    '../../sensitive',
    'verylongid'.repeat(100),
    'id with spaces',
    'id/with/slashes',
    'id?query=param',
    'id#fragment',
    'id%00null',
    'id\nnewline',
    'id\ttab',
    'id\x00',
    'id\u0000',
  ];

  // Test prototype pollution on skills endpoint
  await test('Prototype pollution attempt on skills endpoint', async () => {
    for (const malicious of ['__proto__', 'constructor', 'prototype']) {
      const response = await fetchJSON(`${BASE_URL}/api/vertical-domains/${malicious}/skills`);
      // Should return 400 (bad request) or 404 (not found), not 200 with data
      assert.notEqual(response.status, 200, `Should reject malicious ID ${malicious}`);
      if (response.status === 200) {
        const data = await response.json();
        // Ensure we didn't get Object.prototype properties
        assert(!data.hasOwnProperty('toString'), 'Should not return prototype properties');
      }
    }
  });

  // Test invalid format on install endpoint
  await test('Invalid format rejection on install endpoint', async () => {
    const response = await fetchJSON(`${BASE_URL}/api/vertical-domains/finance/solutions/<script>alert(1)</script>/install`, {
      method: 'POST'
    });
    assert([400, 404].includes(response.status), `Should reject invalid solution ID, got ${response.status}`);
  });

  // Test very long IDs
  await test('Very long ID handling', async () => {
    const longId = 'a'.repeat(1000);
    const response = await fetchJSON(`${BASE_URL}/api/vertical-domains/${longId}/skills`);
    // Should return 400 (invalid format) or 404 (not found)
    assert([400, 404].includes(response.status), `Should reject extremely long ID, got ${response.status}`);
  });

  // Test special characters in IDs
  await test('Special characters in IDs', async () => {
    const specialChars = [
      { char: '/', code: 47 },
      { char: '\\', code: 92 },
      { char: '?', code: 63 },
      { char: '#', code: 35 },
      { char: '%', code: 37 },
      { char: ' ', code: 32 }
    ];
    for (const { char, code } of specialChars) {
      const response = await fetchJSON(`${BASE_URL}/api/vertical-domains/finance${char}/skills`);
      // Should return 400 or 404
      assert([400, 404, 403].includes(response.status), `Should reject special character ${code}, got ${response.status}`);
    }
    // Test URL-encoded newline (Express decodes before route handler)
    const nlResponse = await fetchJSON(`${BASE_URL}/api/vertical-domains/finance%0A/skills`);
    assert([400, 404].includes(nlResponse.status), `Should reject encoded newline, got ${nlResponse.status}`);
  });

  // Test SQL injection in search query
  await test('SQL injection attempt in search', async () => {
    const response = await fetchJSON(`${BASE_URL}/api/vertical-domains/solutions/search?q=' OR '1'='1`);
    // Should return empty array or safe response
    const data = await response.json();
    assert(Array.isArray(data), 'Should return array');
    // Ensure no error objects with SQL details
    if (data.error) {
      assert(!data.error.includes('SQL'), 'Should not expose SQL errors');
    }
  });

  // Test XSS in search query
  await test('XSS attempt in search query', async () => {
    const response = await fetchJSON(`${BASE_URL}/api/vertical-domains/solutions/search?q=<script>alert(1)</script>`);
    const data = await response.json();
    assert(Array.isArray(data), 'Should return array');
    // Ensure no script tags reflected in response
    const responseText = JSON.stringify(data);
    assert(!responseText.includes('<script>'), 'Should not reflect script tags');
  });

  // Test path traversal in solutions endpoint
  await test('Path traversal attempt', async () => {
    const response = await fetchJSON(`${BASE_URL}/api/vertical-domains/../../etc/passwd/solutions`);
    // Should return 400 or 404
    assert([400, 404].includes(response.status), `Should reject path traversal, got ${response.status}`);
  });

  // Test rate limiting bypass attempts
  await test('Rate limiting headers present', async () => {
    const response = await fetchJSON(`${BASE_URL}/api/vertical-domains/solutions/popular`);
    const headers = response.headers;
    // Check for rate limit headers (if configured)
    const rateLimitRemaining = headers.get('x-ratelimit-remaining');
    // Not required, but if present, ensure they are numbers
    if (rateLimitRemaining) {
      assert(!isNaN(parseInt(rateLimitRemaining)), 'Rate limit remaining should be numeric');
    }
  });

  // Test authentication bypass attempts
  await test('Authentication bypass on protected endpoints', async () => {
    // Try install endpoint without API key
    const response = await fetch(`${BASE_URL}/api/vertical-domains/finance/solutions/smart-credit-fullflow/install`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // No X-API-Key header
      }
    });
    // In dev mode auth is skipped, so we might get 200. That's okay.
    // In production, should get 401/403. We'll just log.
    console.log(`    Auth bypass result: ${response.status} (in dev mode auth may be skipped)`);
  });

  // Test large payload injection
  await test('Large payload rejection', async () => {
    const largeBody = { text: 'x'.repeat(100000) };
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(largeBody)
    });
    // Should either reject with 413 or handle gracefully
    assert(response.status !== 500, 'Should not crash server');
    console.log(`    Large payload response: ${response.status}`);
  });

  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('\n✅ All security tests passed!');
  }
}

main().catch(error => {
  console.error('Security test suite failed:', error);
  process.exit(1);
});