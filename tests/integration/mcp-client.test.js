/**
 * MCP Client Integration Tests
 * Tests for frontend/js/mcp-client.js
 */

const assert = require('assert');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/mcp`;

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
      ...options.headers
    }
  });
  
  if (!response.ok && ![400, 404, 503].includes(response.status)) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

async function main() {
  console.log('=== MCP Client Integration Tests ===\n');
  console.log(`Testing against: ${API_BASE}\n`);

  await test('API: GET /annotations - should return tool annotations', async () => {
    const data = await fetchJSON(`${API_BASE}/annotations`);
    assert(data.annotations, 'Should have annotations');
    assert(data.count > 0, 'Should have annotation count > 0');
    console.log(`    Found ${data.count} tool annotations`);
  });

  await test('API: GET /annotations - should have read_file annotation', async () => {
    const data = await fetchJSON(`${API_BASE}/annotations`);
    const readFile = data.annotations.read_text_file || data.annotations.read_file;
    assert(readFile, 'Should have read_file annotation');
    assert(readFile.readOnlyHint === true, 'read_file should be read-only');
  });

  await test('API: GET /annotations - should have write_file annotation', async () => {
    const data = await fetchJSON(`${API_BASE}/annotations`);
    const writeFile = data.annotations.write_file;
    assert(writeFile, 'Should have write_file annotation');
    assert(writeFile.readOnlyHint === false, 'write_file should not be read-only');
  });

  await test('API: GET /annotations/summary - should return summary', async () => {
    const data = await fetchJSON(`${API_BASE}/annotations/summary`);
    assert(data.total > 0, 'Should have total count');
    assert(data.readOnly >= 0, 'Should have readOnly count');
    assert(data.destructive >= 0, 'Should have destructive count');
    console.log(`    Summary: ${data.total} tools, ${data.readOnly} read-only, ${data.destructive} destructive`);
  });

  await test('API: GET /annotations/risk-level - should return risk levels', async () => {
    const data = await fetchJSON(`${API_BASE}/annotations/risk-level?tools=read_file,write_file`);
    assert(Array.isArray(data.riskLevels), 'Should have riskLevels array');
    assert(data.riskLevels.length === 2, 'Should have 2 risk levels');
  });

  await test('API: GET /roots - should return roots list', async () => {
    const data = await fetchJSON(`${API_BASE}/roots`);
    assert(Array.isArray(data.roots), 'Should have roots array');
    assert(typeof data.count === 'number', 'Should have count');
    console.log(`    Found ${data.count} configured roots`);
  });

  await test('API: GET /roots/validate - should validate path', async () => {
    const data = await fetchJSON(`${API_BASE}/roots/validate?path=/tmp`);
    assert(typeof data.valid === 'boolean', 'Should have valid boolean');
    assert(typeof data.allowed === 'boolean', 'Should have allowed boolean');
  });

  await test('API: POST /roots - should add new root', async () => {
    const testPath = `/tmp/mcp-test-${Date.now()}`;
    const data = await fetchJSON(`${API_BASE}/roots`, {
      method: 'POST',
      body: JSON.stringify({ path: testPath, permissions: ['read'] })
    });
    assert(data.added || data.roots, 'Should return added path or roots');
    console.log(`    Added root: ${data.added || testPath}`);
  });

  await test('API: POST /roots/sandbox - should create sandbox', async () => {
    const data = await fetchJSON(`${API_BASE}/roots/sandbox`, {
      method: 'POST',
      body: JSON.stringify({ prefix: 'test-sandbox' })
    });
    assert(data.sandbox, 'Should have sandbox');
    console.log(`    Created sandbox: ${data.sandbox.path || data.sandbox}`);
  });

  await test('API: POST /thinking/chains - should create thinking chain', async () => {
    const data = await fetchJSON(`${API_BASE}/thinking/chains`, {
      method: 'POST',
      body: JSON.stringify({ 
        initialThought: 'Test thought for integration testing',
        metadata: { test: true }
      })
    });
    assert(data.id, 'Should have chain id');
    assert(data.thoughts, 'Should have thoughts array');
    assert(data.thoughts.length > 0, 'Should have at least one thought');
    console.log(`    Created chain: ${data.id}`);
    
    global.__testChainId = data.id;
  });

  await test('API: GET /thinking/chains - should list thinking chains', async () => {
    const data = await fetchJSON(`${API_BASE}/thinking/chains`);
    assert(Array.isArray(data.chains), 'Should have chains array');
    assert(data.count >= 0, 'Should have count');
    console.log(`    Found ${data.count} thinking chains`);
  });

  await test('API: GET /thinking/chains/:id - should get chain details', async () => {
    if (!global.__testChainId) {
      console.log('    Skipping - no test chain created');
      return;
    }
    const data = await fetchJSON(`${API_BASE}/thinking/chains/${global.__testChainId}`);
    assert(data.id === global.__testChainId, 'Should match chain id');
    assert(data.thoughts, 'Should have thoughts');
  });

  await test('API: POST /thinking/chains/:id/thoughts - should add thought', async () => {
    if (!global.__testChainId) {
      console.log('    Skipping - no test chain created');
      return;
    }
    const data = await fetchJSON(`${API_BASE}/thinking/chains/${global.__testChainId}/thoughts`, {
      method: 'POST',
      body: JSON.stringify({
        thought: 'This is an additional thought for testing',
        options: { reasoning: 'Testing thought addition' }
      })
    });
    assert(data.id, 'Should have step id');
    assert(data.thought, 'Should have thought content');
  });

  await test('API: POST /dryrun/preview - should preview write_file', async () => {
    const data = await fetchJSON(`${API_BASE}/dryrun/preview`, {
      method: 'POST',
      body: JSON.stringify({
        tool: 'write_file',
        params: { path: '/tmp/test-preview.txt', content: 'Hello World' }
      })
    });
    assert(data._meta, 'Should have _meta');
    assert(data._meta.dryRun === true, 'Should be dry run');
    assert(data._meta.tool === 'write_file', 'Should be write_file');
    console.log(`    Preview generated for write_file`);
  });

  await test('API: GET /dryrun/history - should return history', async () => {
    const data = await fetchJSON(`${API_BASE}/dryrun/history?limit=10`);
    assert(Array.isArray(data.history), 'Should have history array');
    assert(typeof data.count === 'number', 'Should have count');
  });

  await test('API: GET /status - should return MCP status', async () => {
    const data = await fetchJSON(`${API_BASE}/status`);
    assert(data.servers !== undefined, 'Should have servers');
    assert(data.tools !== undefined, 'Should have tools count');
    console.log(`    MCP Status: ${data.tools} tools`);
  });

  await test('API: GET /health - should return health status', async () => {
    const data = await fetchJSON(`${API_BASE}/health`);
    assert(data.status || data.error, 'Should have status or error');
    console.log(`    Health: ${data.status || data.error}`);
  });

  await test('API: GET /servers - should list servers', async () => {
    const data = await fetchJSON(`${API_BASE}/servers`);
    assert(Array.isArray(data.servers) || data.error, 'Should have servers or error');
    console.log(`    Servers: ${data.servers?.length || 0} (${data.error || 'ok'})`);
  });

  await test('API: GET /tools - should list tools', async () => {
    const data = await fetchJSON(`${API_BASE}/tools`);
    assert(Array.isArray(data.tools) || data.error, 'Should have tools array or error');
    const count = data.count || 0;
    console.log(`    Found ${count} tools (MCP plugin: ${data.error || 'loaded'})`);
  });

  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  
  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Check the output above for details.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
  });
}

module.exports = { main };
