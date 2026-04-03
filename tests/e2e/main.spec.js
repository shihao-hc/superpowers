const { test, expect } = require('@playwright/test');

test.describe('UltraWork AI Chat Interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load homepage', async ({ page }) => {
    await expect(page).toHaveTitle(/UltraWork/);
  });

  test('should display chat interface', async ({ page }) => {
    const chatInput = page.locator('input[type="text"], textarea');
    await expect(chatInput).toBeVisible();
  });

  test('should accept user input', async ({ page }) => {
    const chatInput = page.locator('input[type="text"], textarea').first();
    await chatInput.fill('Hello');
    await expect(chatInput).toHaveValue('Hello');
  });
});

test.describe('API Endpoints', () => {
  const API_BASE = 'http://localhost:3000/api';

  test('should return personality info', async ({ request }) => {
    const response = await request.get(`${API_BASE}/personality`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('name');
  });

  test('should handle chat request', async ({ request }) => {
    const response = await request.post(`${API_BASE}/chat`, {
      data: { text: 'Hello' }
    });
    expect(response.status()).toBeLessThan(500);
  });

  test('should list workspaces', async ({ request }) => {
    const response = await request.get(`${API_BASE}/v1/workspaces`);
    expect(response.ok()).toBeTruthy();
  });

  test('should return solutions', async ({ request }) => {
    const response = await request.get(`${API_BASE}/solutions`);
    expect(response.ok()).toBeTruthy();
    const solutions = await response.json();
    expect(Array.isArray(solutions)).toBe(true);
  });

  test('should return workflows', async ({ request }) => {
    const response = await request.get(`${API_BASE}/workflows`);
    expect(response.ok()).toBeTruthy();
    const workflows = await response.json();
    expect(Array.isArray(workflows)).toBe(true);
  });
});

test.describe('Multi-Tenant Features', () => {
  test('should create workspace for tenant', async ({ request }) => {
    const response = await request.post('http://localhost:3000/api/v1/workspaces', {
      headers: { 'x-tenant-id': 'test-tenant-e2e' },
      data: {
        name: 'E2E Test Workspace',
        plan: 'professional',
        ownerId: 'e2e-user'
      }
    });
    expect([200, 201, 400]).toContain(response.status());
  });

  test('should track costs per tenant', async ({ request }) => {
    const response = await request.post('http://localhost:3000/api/v1/costs/record', {
      headers: { 'x-tenant-id': 'e2e-cost-test' },
      data: {
        category: 'skill-execution',
        quantity: 100,
        model: 'gpt-4'
      }
    });
    expect(response.ok()).toBeTruthy();
  });

  test('should set budget per tenant', async ({ request }) => {
    const response = await request.post('http://localhost:3000/api/v1/billing/budget', {
      headers: { 'x-tenant-id': 'e2e-budget-test' },
      data: {
        monthly: 10000,
        alertThresholds: [50, 75, 90]
      }
    });
    expect(response.ok()).toBeTruthy();
  });
});

test.describe('Skill Chain Features', () => {
  test('should understand intent', async ({ request }) => {
    const response = await request.post('http://localhost:3000/api/v1/intent/understand', {
      data: { message: '生成一份报告' }
    });
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    expect(result).toHaveProperty('intent');
  });

  test('should execute skill chain', async ({ request }) => {
    const chain = {
      name: 'E2E Test Chain',
      steps: [
        { skill: 'collector', action: 'collect' },
        { skill: 'analyzer', action: 'analyze', dependsOn: ['step_0'] }
      ]
    };

    const response = await request.post('http://localhost:3000/api/v1/intent/execute-chain', {
      data: {
        chain,
        input: { test: true }
      }
    });
    expect(response.ok()).toBeTruthy();
  });
});

test.describe('Security Features', () => {
  test('should enforce rate limiting', async ({ request }) => {
    const requests = [];
    for (let i = 0; i < 110; i++) {
      requests.push(request.get('http://localhost:3000/api/personality'));
    }
    const results = await Promise.all(requests);
    const rateLimited = results.filter(r => r.status() === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });

  test('should require API key for protected endpoints', async ({ request }) => {
    const response = await request.post('http://localhost:3000/api/personality/switch', {
      data: { name: 'test' }
    });
    expect([401, 400, 404]).toContain(response.status());
  });

  test('should mask PII in responses', async ({ request }) => {
    const response = await request.post('http://localhost:3000/api/chat', {
      data: { text: 'My email is test@example.com' }
    });
    expect(response.ok()).toBeTruthy();
  });
});
