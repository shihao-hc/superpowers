const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN;
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

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
  if (!response.ok && ![400, 404, 429].includes(response.status)) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

const itIf = (name, fn) => {
  if (hasServer) {it(name, fn);}
  else {it.skip(name, fn);}
};

describe('Skill Renderer API', () => {
  itIf('API: GET /skills/ - should return skill list', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/skills/`);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  itIf('API: GET /skills/ - data items are command objects', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/skills/`);
    if (data.data.length === 0) {return;}
    const cmd = data.data[0];
    expect(cmd.name).toBeTruthy();
    expect(cmd.type).toBeDefined();
  });

  itIf('API: GET /skills/commands - should return command list', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/skills/commands`);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  itIf('API: GET /skills/features - should list features', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/skills/features`);
    expect(data.success).toBe(true);
    expect(typeof data.data).toBe('object');
  });

  itIf('API: GET /skills/features/:feature - should check feature', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/skills/features/test-feature`);
    expect(data.success).toBe(true);
    expect(data.data.feature).toBe('test-feature');
    expect(typeof data.data.enabled).toBe('boolean');
  });

  itIf('API: POST /skills/execute - missing command returns 400', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/skills/execute`, {
      method: 'POST',
      body: JSON.stringify({ args: {} })
    });
    expect(data.error).toBeTruthy();
    expect(data.code).toBe('INVALID_INPUT');
  });

  itIf('API: POST /skills/execute - unknown command returns error', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/skills/execute`, {
      method: 'POST',
      body: JSON.stringify({ command: 'nonexistent-command' })
    });
    expect(data.error || data.code).toBeTruthy();
  });

  itIf('API: GET /skills/features/:feature - toggle and verify', async () => {
    const before = await fetchJSON(`${BASE_URL}/api/skills/features/test-toggle`);
    const wasEnabled = before.data.enabled;

    const toggle = await fetchJSON(`${BASE_URL}/api/skills/features/test-toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled: !wasEnabled })
    });
    expect(toggle.success).toBe(true);
    expect(toggle.data.enabled).toBe(!wasEnabled);

    const after = await fetchJSON(`${BASE_URL}/api/skills/features/test-toggle`);
    expect(after.data.enabled).toBe(!wasEnabled);

    await fetchJSON(`${BASE_URL}/api/skills/features/test-toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled: wasEnabled })
    });
  });

  itIf('API: GET /skills/stats - should return stats', async () => {
    const data = await fetchJSON(`${BASE_URL}/api/skills/stats`);
    expect(data.success || data.total !== undefined).toBeTruthy();
  });
});
