/**
 * MCP UI E2E Tests - Simplified & Robust
 * Tests for MCP Dashboard and related UI pages
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('MCP Dashboard', () => {
  test('should load MCP dashboard page', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-dashboard.html`);
    await expect(page).toHaveTitle(/MCP/);
  });

  test('should have MCP client script loaded', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-dashboard.html`);
    const hasMCPClient = await page.evaluate(() => {
      return typeof window.MCPClient !== 'undefined' || document.querySelector('script[src*="mcp-client"]') !== null;
    });
    expect(hasMCPClient).toBeTruthy();
  });
});

test.describe('MCP Annotation UI', () => {
  test('should load annotation UI page', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-annotation-ui.html`);
    await expect(page).toHaveTitle(/MCP 工具市场/);
  });

  test('should display tool grid container', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-annotation-ui.html`);
    const toolGrid = page.locator('.tool-grid');
    await expect(toolGrid).toBeVisible({ timeout: 5000 });
  });

  test('should have search input', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-annotation-ui.html`);
    const searchInput = page.locator('#searchInput');
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });
});

test.describe('MCP Dry-Run UI', () => {
  test('should load dryrun page', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-dryrun.html`);
    await expect(page).toHaveTitle(/MCP Dry-Run/);
  });

  test('should have tool selector', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-dryrun.html`);
    const toolSelect = page.locator('#toolType');
    await expect(toolSelect).toBeVisible({ timeout: 5000 });
  });

  test('should have preview button', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-dryrun.html`);
    const previewBtn = page.locator('#previewBtn');
    await expect(previewBtn).toBeVisible({ timeout: 5000 });
  });
});

test.describe('MCP Thinking Chain UI', () => {
  test('should load thinking chain page', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-thinking-chain.html`);
    await expect(page).toHaveTitle(/MCP 思维链/);
  });

  test('should have chain list', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-thinking-chain.html`);
    const chainList = page.locator('.chain-list');
    await expect(chainList).toBeVisible({ timeout: 5000 });
  });

  test('should have new chain button', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-thinking-chain.html`);
    const newChainBtn = page.locator('button:has-text("新建思维链")');
    await expect(newChainBtn).toBeVisible({ timeout: 5000 });
  });

  test('should open new chain modal', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-thinking-chain.html`);
    const newChainBtn = page.locator('button:has-text("新建思维链")');
    await newChainBtn.click();
    const modal = page.locator('#newChainModal');
    await expect(modal).toHaveClass(/show/, { timeout: 3000 });
  });
});

test.describe('MCP Roots UI', () => {
  test('should load roots page', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-roots.html`);
    await expect(page).toHaveTitle(/MCP Roots/);
  });

  test('should have roots list section', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-roots.html`);
    const rootList = page.locator('.root-list');
    await expect(rootList).toBeVisible({ timeout: 5000 });
  });

  test('should have path validation input', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-roots.html`);
    const validateInput = page.locator('#validatePath');
    await expect(validateInput).toBeVisible({ timeout: 5000 });
  });

  test('should have add root button', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-roots.html`);
    const addBtn = page.locator('button:has-text("添加根目录")');
    await expect(addBtn).toBeVisible({ timeout: 5000 });
  });

  test('should open add root modal', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-roots.html`);
    const addBtn = page.locator('button:has-text("添加根目录")');
    await addBtn.click();
    const modal = page.locator('#addRootModal');
    await expect(modal).toHaveClass(/show/, { timeout: 3000 });
  });
});

test.describe('MCP API Endpoints', () => {
  const API_BASE = `${BASE_URL}/api/mcp`;

  test('should return annotations', async ({ request }) => {
    const response = await request.get(`${API_BASE}/annotations`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.annotations).toBeDefined();
  });

  test('should return annotations summary', async ({ request }) => {
    const response = await request.get(`${API_BASE}/annotations/summary`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.total).toBeGreaterThan(0);
  });

  test('should return risk levels', async ({ request }) => {
    const response = await request.get(`${API_BASE}/annotations/risk-level?tools=read_file,write_file`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.riskLevels).toBeDefined();
  });

  test('should list roots', async ({ request }) => {
    const response = await request.get(`${API_BASE}/roots`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.roots).toBeDefined();
  });

  test('should validate path', async ({ request }) => {
    const response = await request.get(`${API_BASE}/roots/validate?path=/tmp`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.valid).toBeDefined();
  });

  test('should create thinking chain', async ({ request }) => {
    const response = await request.post(`${API_BASE}/thinking/chains`, {
      data: {
        initialThought: 'E2E test thought',
        metadata: { test: true }
      }
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.id).toBeDefined();
  });

  test('should list thinking chains', async ({ request }) => {
    const response = await request.get(`${API_BASE}/thinking/chains`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.chains).toBeDefined();
  });

  test('should preview dry run', async ({ request }) => {
    const response = await request.post(`${API_BASE}/dryrun/preview`, {
      data: {
        tool: 'write_file',
        params: { path: '/tmp/test.txt', content: 'test' }
      }
    });
    const data = await response.json();
    expect(data._meta).toBeDefined();
  });

  test('should return MCP status', async ({ request }) => {
    const response = await request.get(`${API_BASE}/status`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.tools).toBeDefined();
  });
});
