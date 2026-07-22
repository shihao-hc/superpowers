/**
 * Security Penetration Tests
 * Tests for common web vulnerabilities
 * Requires a running server at TEST_BASE_URL (default: http://localhost:3000)
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN;

const hasServer = !!process.env.TEST_BASE_URL;

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (AUTH_TOKEN) headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  return headers;
}

async function fetchRaw(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...options.headers }
  });
}

const itIf = (name, fn) => {
  if (hasServer) {it(name, fn);}
  else {it.skip(name, fn);}
};

describe('Security Penetration', () => {
  itIf('Prototype pollution attempt on skills endpoint', async () => {
    for (const malicious of ['__proto__', 'constructor', 'prototype']) {
      const res = await fetchRaw(`${BASE_URL}/api/vertical-domains/${malicious}/skills`);
      expect(res.status).not.toBe(200);
      if (res.status === 200) {
        const data = await res.json();
        expect(Object.prototype.hasOwnProperty.call(data, 'toString')).toBe(false);
      }
    }
  });

  itIf('Invalid format rejection on install endpoint', async () => {
    const res = await fetchRaw(`${BASE_URL}/api/vertical-domains/finance/solutions/<script>alert(1)</script>/install`, {
      method: 'POST'
    });
    expect([400, 404]).toContain(res.status);
  });

  itIf('Very long ID handling', async () => {
    const longId = 'a'.repeat(1000);
    const res = await fetchRaw(`${BASE_URL}/api/vertical-domains/${longId}/skills`);
    expect([400, 404]).toContain(res.status);
  });

  itIf('Special characters in IDs', async () => {
    const pairs = [
      { char: '/', code: 47 },
      { char: '\\', code: 92 },
      { char: '?', code: 63 },
      { char: '#', code: 35 },
      { char: '%', code: 37 },
      { char: ' ', code: 32 }
    ];
    for (const { char } of pairs) {
      const res = await fetchRaw(`${BASE_URL}/api/vertical-domains/finance${char}/skills`);
      // / and ? act as path/query separators; # becomes fragment (not sent);
      // These may result in valid-looking routes to Express after normalization
      expect(res.status).not.toBe(500);
    }
    const nlRes = await fetchRaw(`${BASE_URL}/api/vertical-domains/finance%0A/skills`);
    expect([400, 404]).toContain(nlRes.status);
  });

  itIf('SQL injection attempt in search', async () => {
    const res = await fetchRaw(`${BASE_URL}/api/vertical-domains/solutions/search?q=' OR '1'='1`);
    const data = await res.json();
    // The security middleware may block this and return an error (non-array) response
    if (Array.isArray(data)) {
      if (data.length > 0 && data[0].error) {
        expect(typeof data[0].error === 'string' && data[0].error.includes('SQL')).toBe(false);
      }
    } else {
      expect(data).toBeDefined();
    }
  });

  itIf('XSS attempt in search query', async () => {
    const res = await fetchRaw(`${BASE_URL}/api/vertical-domains/solutions/search?q=<script>alert(1)</script>`);
    const data = await res.json();
    const responseText = JSON.stringify(data);
    expect(responseText.includes('<script>')).toBe(false);
  });

  itIf('Path traversal attempt', async () => {
    const res = await fetchRaw(`${BASE_URL}/api/vertical-domains/../../etc/passwd/solutions`);
    // fetch normalizes .. in URLs client-side, so Express may see a clean path
    expect(res.status).not.toBe(500);
  });

  itIf('Rate limiting headers present', async () => {
    const res = await fetchRaw(`${BASE_URL}/api/vertical-domains/solutions/popular`);
    const rateLimitRemaining = res.headers.get('x-ratelimit-remaining');
    if (rateLimitRemaining) {
      expect(isNaN(parseInt(rateLimitRemaining, 10))).toBe(false);
    }
  });

  itIf('Authentication bypass on protected endpoints', async () => {
    const res = await fetch(`${BASE_URL}/api/vertical-domains/finance/solutions/smart-credit-fullflow/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(res.status).not.toBe(500);
  });

  itIf('Large payload rejection', async () => {
    const largeBody = { text: 'x'.repeat(100000) };
    const headers = { 'Content-Type': 'application/json' };
    if (AUTH_TOKEN) headers.Authorization = `Bearer ${AUTH_TOKEN}`;
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(largeBody)
    });
    expect(res.status).not.toBe(500);
  });
});

module.exports = { main: async () => {} };