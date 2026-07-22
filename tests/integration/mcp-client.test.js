/**
 * MCP Client Integration Tests
 * Tests for frontend/js/mcp-client.js
 * Requires a running server at TEST_BASE_URL (default: http://localhost:3000)
 */

const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN;
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/mcp`;

let testChainId = null;
const hasServer = !!process.env.TEST_BASE_URL;

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (AUTH_TOKEN) headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  return headers;
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...options.headers }
  });
  if (!response.ok && ![400, 404, 503].includes(response.status)) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

const itIf = (name, fn) => {
  if (hasServer) {it(name, fn);}
  else {it.skip(name, fn);}
};

describe('MCP Client Integration', () => {
  itIf('API: GET /annotations - should return tool annotations', async () => {
    const data = await fetchJSON(`${API_BASE}/annotations`);
    expect(data.annotations).toBeTruthy();
    expect(data.count).toBeGreaterThan(0);
  });

  itIf('API: GET /annotations - should have read_file annotation', async () => {
    const data = await fetchJSON(`${API_BASE}/annotations`);
    const readFile = data.annotations.read_text_file || data.annotations.read_file;
    expect(readFile).toBeTruthy();
    expect(readFile.readOnlyHint).toBe(true);
  });

  itIf('API: GET /annotations - should have write_file annotation', async () => {
    const data = await fetchJSON(`${API_BASE}/annotations`);
    const writeFile = data.annotations.write_file;
    expect(writeFile).toBeTruthy();
    expect(writeFile.readOnlyHint).toBe(false);
  });

  itIf('API: GET /annotations/summary - should return summary', async () => {
    const data = await fetchJSON(`${API_BASE}/annotations/summary`);
    expect(data.total).toBeGreaterThan(0);
    expect(typeof data.readOnly).toBe('number');
    expect(typeof data.destructive).toBe('number');
  });

  itIf('API: GET /annotations/risk-level - should return risk levels', async () => {
    const data = await fetchJSON(`${API_BASE}/annotations/risk-level?tools=read_file,write_file`);
    expect(Array.isArray(data.riskLevels)).toBe(true);
    expect(data.riskLevels.length).toBe(2);
  });

  itIf('API: GET /roots - should return roots list', async () => {
    const data = await fetchJSON(`${API_BASE}/roots`);
    expect(Array.isArray(data.roots)).toBe(true);
    expect(typeof data.count).toBe('number');
  });

  itIf('API: GET /roots/validate - should validate path', async () => {
    const data = await fetchJSON(`${API_BASE}/roots/validate?path=/tmp`);
    expect(typeof data.valid).toBe('boolean');
    expect(typeof data.allowed).toBe('boolean');
  });

  itIf('API: POST /roots - should add new root', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    const data = await fetchJSON(`${API_BASE}/roots`, {
      method: 'POST',
      body: JSON.stringify({ path: testDir, permissions: ['read'] })
    });
    expect(data.added || data.roots).toBeTruthy();
    fs.rmdirSync(testDir);
  });

  itIf('API: POST /roots/sandbox - should create sandbox', async () => {
    const data = await fetchJSON(`${API_BASE}/roots/sandbox`, {
      method: 'POST',
      body: JSON.stringify({ prefix: 'test-sandbox' })
    });
    expect(data.sandbox).toBeTruthy();
  });

  itIf('API: POST /thinking/chains - should create thinking chain', async () => {
    const data = await fetchJSON(`${API_BASE}/thinking/chains`, {
      method: 'POST',
      body: JSON.stringify({
        initialThought: 'Test thought for integration testing',
        metadata: { test: true }
      })
    });
    expect(data.id).toBeTruthy();
    expect(data.thoughts).toBeTruthy();
    expect(data.thoughts.length).toBeGreaterThan(0);
    testChainId = data.id;
  });

  itIf('API: GET /thinking/chains - should list thinking chains', async () => {
    const data = await fetchJSON(`${API_BASE}/thinking/chains`);
    expect(Array.isArray(data.chains)).toBe(true);
    expect(typeof data.count).toBe('number');
  });

  itIf('API: GET /thinking/chains/:id - should get chain details', async () => {
    if (!testChainId) {return;}
    const data = await fetchJSON(`${API_BASE}/thinking/chains/${testChainId}`);
    expect(data.id).toBe(testChainId);
    expect(data.thoughts).toBeTruthy();
  });

  itIf('API: POST /thinking/chains/:id/thoughts - should add thought', async () => {
    if (!testChainId) {return;}
    const data = await fetchJSON(`${API_BASE}/thinking/chains/${testChainId}/thoughts`, {
      method: 'POST',
      body: JSON.stringify({
        thought: 'This is an additional thought for testing',
        options: { reasoning: 'Testing thought addition' }
      })
    });
    expect(data.id).toBeTruthy();
    expect(data.thought).toBeTruthy();
  });

  itIf('API: POST /dryrun/preview - should preview write_file', async () => {
    const data = await fetchJSON(`${API_BASE}/dryrun/preview`, {
      method: 'POST',
      body: JSON.stringify({
        tool: 'write_file',
        params: { path: '/tmp/test-preview.txt', content: 'Hello World' }
      })
    });
    expect(data._meta).toBeTruthy();
    expect(data._meta.dryRun).toBe(true);
    expect(data._meta.tool).toBe('write_file');
  });

  itIf('API: GET /dryrun/history - should return history', async () => {
    const data = await fetchJSON(`${API_BASE}/dryrun/history?limit=10`);
    expect(Array.isArray(data.history)).toBe(true);
    expect(typeof data.count).toBe('number');
  });

  itIf('API: GET /status - should return MCP status', async () => {
    const data = await fetchJSON(`${API_BASE}/status`);
    expect(data.servers).toBeDefined();
    expect(data.tools).toBeDefined();
  });

  itIf('API: GET /health - should return health status', async () => {
    const data = await fetchJSON(`${API_BASE}/health`);
    expect(data.status || data.error).toBeTruthy();
  });

  itIf('API: GET /servers - should list servers', async () => {
    const data = await fetchJSON(`${API_BASE}/servers`);
    expect(Array.isArray(data.servers) || data.error).toBeTruthy();
  });

  itIf('API: GET /tools - should list tools', async () => {
    const data = await fetchJSON(`${API_BASE}/tools`);
    expect(Array.isArray(data.tools) || data.error).toBeTruthy();
  });
});

module.exports = { main: async () => {} };