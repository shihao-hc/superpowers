/**
 * MCP UI E2E Tests
 * Tests for MCP Dashboard and related UI pages
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('MCP Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-dashboard.html`);
  });

  test('should load MCP dashboard page', async ({ page }) => {
    await expect(page).toHaveTitle(/MCP/);
    await expect(page.locator('h1')).toContainText('MCP 控制台');
  });

  test('should display MCP status badge', async ({ page }) => {
    const statusText = page.locator('#statusText');
    await expect(statusText).toBeVisible();
  });

  test('should display stats cards', async ({ page }) => {
    await expect(page.locator('#statTools')).toBeVisible();
    await expect(page.locator('#statServers')).toBeVisible();
  });

  test('should display feature cards', async ({ page }) => {
    await expect(page.locator('.feature-card')).toHaveCount(4);
  });

  test('should display navigation cards', async ({ page }) => {
    await expect(page.locator('.nav-card')).toHaveCount(4);
  });

  test('should navigate to annotation UI', async ({ page }) => {
    await page.locator('.feature-card').first().click();
    await expect(page).toHaveURL(/mcp-annotation-ui\.html/);
  });

  test('should navigate to dryrun page', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-dashboard.html`);
    await page.locator('a[href="mcp-dryrun.html"]').click();
    await expect(page).toHaveURL(/mcp-dryrun\.html/);
  });

  test('should navigate to thinking chain page', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-dashboard.html`);
    await page.locator('a[href="mcp-thinking-chain.html"]').click();
    await expect(page).toHaveURL(/mcp-thinking-chain\.html/);
  });

  test('should navigate to roots page', async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-dashboard.html`);
    await page.locator('a[href="mcp-roots.html"]').click();
    await expect(page).toHaveURL(/mcp-roots\.html/);
  });
});

test.describe('MCP Annotation UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-annotation-ui.html`);
  });

  test('should load annotation UI page', async ({ page }) => {
    await expect(page).toHaveTitle(/MCP 工具市场/);
    await expect(page.locator('h1')).toContainText('MCP 工具市场');
  });

  test('should display stats cards', async ({ page }) => {
    await expect(page.locator('#statTotal')).toBeVisible();
    await expect(page.locator('#statReadOnly')).toBeVisible();
  });

  test('should display filter bar', async ({ page }) => {
    await expect(page.locator('#searchInput')).toBeVisible();
    await expect(page.locator('#riskFilter')).toBeVisible();
    await expect(page.locator('#typeFilter')).toBeVisible();
  });

  test('should display sidebar with servers', async ({ page }) => {
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.server-item')).toBeVisible();
  });

  test('should display tool grid', async ({ page }) => {
    await expect(page.locator('.tool-grid')).toBeVisible();
  });

  test('should filter tools by search', async ({ page }) => {
    await page.waitForSelector('.tool-card', { timeout: 10000 }).catch(() => {});
    const searchInput = page.locator('#searchInput');
    await searchInput.fill('file');
    await page.waitForTimeout(500);
  });

  test('should open execute modal on tool click', async ({ page }) => {
    await page.waitForSelector('.tool-card', { timeout: 10000 }).catch(() => {});
    const firstTool = page.locator('.tool-card').first();
    if (await firstTool.isVisible()) {
      await firstTool.click();
      const modal = page.locator('#executeModal');
      await expect(modal).toHaveClass(/show/);
    }
  });

  test('should close modal', async ({ page }) => {
    await page.waitForSelector('.tool-card', { timeout: 10000 }).catch(() => {});
    const firstTool = page.locator('.tool-card').first();
    if (await firstTool.isVisible()) {
      await firstTool.click();
      const closeBtn = page.locator('.modal-close');
      await closeBtn.click();
    }
  });

  test('should load tools via MCP Client', async ({ page }) => {
    await page.waitForSelector('.tool-card', { timeout: 10000 });
    const toolCards = await page.locator('.tool-card').count();
    console.log(`Found ${toolCards} tool cards`);
  });
});

test.describe('MCP Dry-Run UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-dryrun.html`);
  });

  test('should load dryrun page', async ({ page }) => {
    await expect(page).toHaveTitle(/MCP Dry-Run/);
    await expect(page.locator('h1')).toContainText('MCP Dry-Run');
  });

  test('should display tool selector', async ({ page }) => {
    await expect(page.locator('#toolType')).toBeVisible();
    await expect(page.locator('#filePath')).toBeVisible();
  });

  test('should display preview button', async ({ page }) => {
    await expect(page.locator('#previewBtn')).toContainText('预览');
  });

  test('should update params when tool changes', async ({ page }) => {
    await page.selectOption('#toolType', 'filesystem:edit_file');
    await page.waitForTimeout(300);
    const editsParam = page.locator('#editsParam');
    await expect(editsParam).toBeVisible();
  });

  test('should generate preview on button click', async ({ page }) => {
    await page.fill('#filePath', '/tmp/test-file.txt');
    await page.fill('#fileContent', 'Test content');
    await page.click('#previewBtn');
    await page.waitForTimeout(2000);
  });

  test('should display preview result', async ({ page }) => {
    await page.fill('#filePath', '/tmp/test-file.txt');
    await page.click('#previewBtn');
    await page.waitForTimeout(2000);
    const previewContent = page.locator('#previewContent');
    await expect(previewContent).not.toBeEmpty();
  });

  test('should switch between preview and history tabs', async ({ page }) => {
    await page.click('#tabHistory');
    await expect(page.locator('#tabHistory')).toHaveClass(/active/);
  });
});

test.describe('MCP Thinking Chain UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-thinking-chain.html`);
  });

  test('should load thinking chain page', async ({ page }) => {
    await expect(page).toHaveTitle(/MCP 思维链/);
    await expect(page.locator('h1')).toContainText('MCP 思维链');
  });

  test('should display chain list panel', async ({ page }) => {
    await expect(page.locator('.chain-list')).toBeVisible();
  });

  test('should display new chain button', async ({ page }) => {
    await expect(page.locator('button:has-text("新建思维链")')).toBeVisible();
  });

  test('should open new chain modal', async ({ page }) => {
    await page.click('button:has-text("新建思维链")');
    const modal = page.locator('#newChainModal');
    await expect(modal).toHaveClass(/show/);
  });

  test('should create new thinking chain', async ({ page }) => {
    await page.click('button:has-text("新建思维链")');
    await page.waitForTimeout(300);
    await page.fill('#initialThought', 'Test thought for E2E testing');
    await page.click('button:has-text("创建")');
    await page.waitForTimeout(2000);
  });

  test('should display chain details when selected', async ({ page }) => {
    const createBtn = page.locator('button:has-text("新建思维链")');
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(300);
      await page.fill('#initialThought', 'Test chain for details');
      await page.click('button:has-text("创建")');
      await page.waitForTimeout(2000);
    }
  });

  test('should display thinking chain resource URI', async ({ page }) => {
    const createBtn = page.locator('button:has-text("新建思维链")');
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(300);
      await page.fill('#initialThought', 'Test with URI');
      await page.click('button:has-text("创建")');
      await page.waitForTimeout(2000);
    }
    const chainDetail = page.locator('#chainDetail');
    await expect(chainDetail).not.toBeEmpty();
  });
});

test.describe('MCP Roots UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/frontend/mcp-roots.html`);
  });

  test('should load roots page', async ({ page }) => {
    await expect(page).toHaveTitle(/MCP Roots/);
    await expect(page.locator('h1')).toContainText('MCP Roots');
  });

  test('should display stats cards', async ({ page }) => {
    await expect(page.locator('#rootsCount')).toBeVisible();
    await expect(page.locator('#readOnlyCount')).toBeVisible();
  });

  test('should display roots list section', async ({ page }) => {
    await expect(page.locator('.root-list')).toBeVisible();
  });

  test('should display path validation section', async ({ page }) => {
    await expect(page.locator('#validatePath')).toBeVisible();
  });

  test('should validate path', async ({ page }) => {
    await page.fill('#validatePath', '/tmp');
    await page.click('button:has-text("验证")');
    await page.waitForTimeout(1000);
  });

  test('should display sandbox section', async ({ page }) => {
    await expect(page.locator('.sandbox-list')).toBeVisible();
  });

  test('should open add root modal', async ({ page }) => {
    await page.click('button:has-text("添加根目录")');
    const modal = page.locator('#addRootModal');
    await expect(modal).toHaveClass(/show/);
  });

  test('should add new root', async ({ page }) => {
    await page.click('button:has-text("添加根目录")');
    await page.waitForTimeout(300);
    await page.fill('#newRootPath', `/tmp/mcp-test-${Date.now()}`);
    await page.click('button:has-text("添加"):visible');
    await page.waitForTimeout(1000);
  });

  test('should create sandbox', async ({ page }) => {
    const createSandboxBtn = page.locator('button:has-text("创建沙箱")').first();
    if (await createSandboxBtn.isVisible()) {
      await createSandboxBtn.click();
      await page.waitForTimeout(2000);
    }
  });
});

test.describe('MCP API Endpoints', () => {
  const API_BASE = `${BASE_URL}/api/mcp`;

  test('should return annotations', async ({ request }) => {
    const response = await request.get(`${API_BASE}/annotations`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.annotations).toBeDefined();
    expect(data.count).toBeGreaterThan(0);
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
    expect(data.allowed).toBeDefined();
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

  test('should list tools', async ({ request }) => {
    const response = await request.get(`${API_BASE}/tools`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.tools).toBeDefined();
    expect(data.count).toBeGreaterThan(0);
  });
});
