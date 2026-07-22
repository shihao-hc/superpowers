/**
 * Vertical Domains Integration Tests
 * Tests for industry solution endpoints
 * Requires a running server at TEST_BASE_URL (default: http://localhost:3000)
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'test-key';

const hasServer = !!process.env.TEST_BASE_URL;

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

const itIf = (name, fn) => {
  if (hasServer) {it(name, fn);}
  else {it.skip(name, fn);}
};

describe('Vertical Domains API', () => {
  let domainId = 'finance';
  let solutionId = 'smart-credit-scoring';

  itIf('GET /api/vertical-domains - should return domain list', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/vertical-domains`);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    domainId = data[0].id;
  });

  itIf('GET /api/vertical-domains/{domainId}/skills - should return skills', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/vertical-domains/${domainId}/skills`);
    expect(Array.isArray(data)).toBe(true);
  });

  itIf('GET /api/vertical-domains/{domainId}/solutions - should return solutions', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/vertical-domains/${domainId}/solutions`);
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      solutionId = data[0].id;
    }
  });

  itIf('GET /api/vertical-domains/solutions/popular - should return popular solutions', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/vertical-domains/solutions/popular`);
    expect(data.hot).toBeTruthy();
    expect(data.highAutomation).toBeTruthy();
    expect(data.newlyAdded).toBeTruthy();
  });

  itIf('GET /api/vertical-domains/solutions/search - should return search results', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/vertical-domains/solutions/search?q=credit`);
    expect(Array.isArray(data)).toBe(true);
  });

  itIf('GET /api/vertical-domains/solutions/{solutionId}/recommendations - should return recommendations', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/vertical-domains/solutions/${solutionId}/recommendations`);
    expect(Array.isArray(data)).toBe(true);
  });

  itIf('POST /api/vertical-domains/{domainId}/solutions/{solutionId}/install - should return installation progress', async () => {
    const response = await fetch(`${BASE_URL}/api/vertical-domains/${domainId}/solutions/${solutionId}/install`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test'
      }
    });
    if (response.status === 200) {
      const data = await response.json();
      expect(data.id).toBeTruthy();
      expect(data.status).toBeTruthy();
    } else {
      expect([401, 403, 429]).toContain(response.status);
    }
  });

  itIf('POST /api/vertical-domains/{domainId}/solutions/{solutionId}/demo-data - should return demo data', async () => {
    const response = await fetch(`${BASE_URL}/api/vertical-domains/${domainId}/solutions/${solutionId}/demo-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test'
      }
    });
    if (response.status === 200) {
      const data = await response.json();
      expect(data.id).toBeTruthy();
      expect(data.demoData).toBeTruthy();
    } else {
      expect([401, 403, 429]).toContain(response.status);
    }
  });
});
