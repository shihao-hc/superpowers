/**
 * Vertical Domains Integration Tests
 * Tests for industry solution endpoints
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
  
  if (!response.ok && ![400, 404, 429].includes(response.status)) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

async function main() {
  console.log('=== Vertical Domains Integration Tests ===\n');
  console.log(`Testing against: ${BASE_URL}\n`);

  let domains = [];
  let domainId = 'finance';
  let solutionId = 'smart-credit-scoring';

  await test('API: GET /api/vertical-domains - should return domain list', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/vertical-domains`);
    assert(Array.isArray(data), 'Should return an array');
    assert(data.length > 0, 'Should have at least one domain');
    domains = data;
    console.log(`    Found ${data.length} domains`);
    if (data.length > 0) {
      domainId = data[0].id;
      console.log(`    Using domain: ${domainId}`);
    }
  });

  await test('API: GET /api/vertical-domains/{domainId}/skills - should return skills', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/vertical-domains/${domainId}/skills`);
    assert(Array.isArray(data), 'Should return an array');
    console.log(`    Found ${data.length} skills for ${domainId}`);
  });

  await test('API: GET /api/vertical-domains/{domainId}/solutions - should return solutions', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/vertical-domains/${domainId}/solutions`);
    assert(Array.isArray(data), 'Should return an array');
    if (data.length > 0) {
      solutionId = data[0].id;
      console.log(`    Found ${data.length} solutions, using: ${solutionId}`);
    }
  });

  await test('API: GET /api/vertical-domains/solutions/popular - should return popular solutions', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/vertical-domains/solutions/popular`);
    assert(data.hot, 'Should have hot array');
    assert(data.highAutomation, 'Should have highAutomation array');
    assert(data.newlyAdded, 'Should have newlyAdded array');
    console.log(`    Found ${data.hot.length} hot, ${data.highAutomation.length} high automation, ${data.newlyAdded.length} new solutions`);
  });

  await test('API: GET /api/vertical-domains/solutions/search?q=credit - should return search results', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/vertical-domains/solutions/search?q=credit`);
    assert(Array.isArray(data), 'Should return an array');
    console.log(`    Found ${data.length} search results for 'credit'`);
  });

  await test('API: GET /api/vertical-domains/solutions/{solutionId}/recommendations - should return recommendations', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/vertical-domains/solutions/${solutionId}/recommendations`);
    assert(Array.isArray(data), 'Should return an array');
    console.log(`    Found ${data.length} recommendations for ${solutionId}`);
  });

  // These endpoints are POST and may have side effects; we'll skip them in integration tests
  // unless we are in a dedicated test environment.
  // We'll just test that they exist and return appropriate response.
  await test('API: POST /api/vertical-domains/{domainId}/solutions/{solutionId}/install - should return installation progress', async () => {
    const response = await fetch(`${BASE_URL}/api/vertical-domains/${domainId}/solutions/${solutionId}/install`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test'
      }
    });
    // In dev mode auth is skipped, so we expect 200
    if (response.status === 200) {
      const data = await response.json();
      assert(data.id, 'Should have installation id');
      assert(data.status, 'Should have status');
      console.log(`    Installation started: ${data.id}`);
    } else {
      // In production, expect auth error or rate limit
      assert([401, 403, 429].includes(response.status), `Unexpected status: ${response.status}`);
      console.log(`    Status: ${response.status} (auth/rate limit)`);
    }
  });

  await test('API: POST /api/vertical-domains/{domainId}/solutions/{solutionId}/demo-data - should return demo data', async () => {
    const response = await fetch(`${BASE_URL}/api/vertical-domains/${domainId}/solutions/${solutionId}/demo-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test'
      }
    });
    if (response.status === 200) {
      const data = await response.json();
      assert(data.id, 'Should have import id');
      assert(data.demoData, 'Should have demoData');
      console.log(`    Demo data imported: ${data.id}`);
    } else {
      assert([401, 403, 429].includes(response.status), `Unexpected status: ${response.status}`);
      console.log(`    Status: ${response.status} (auth/rate limit)`);
    }
  });

  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
  }
}

main().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});