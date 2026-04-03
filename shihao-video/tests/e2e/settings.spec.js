const { test, expect } = require('@playwright/test');

test.describe('设置页面功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/setting.html');
    await page.waitForLoadState('networkidle');
  });

  test('设置页面加载正常', async ({ page }) => {
    const settingPage = page.locator('.setting-page');
    await expect(settingPage).toBeVisible();
  });

  test('页面标题显示', async ({ page }) => {
    const title = page.locator('.setting-title');
    await expect(title).toBeVisible();
    await expect(title).toContainText('数据源配置');
  });

  test('数据源列表显示', async ({ page }) => {
    await page.waitForSelector('.source-list', { timeout: 5000 });
    const sourceList = page.locator('.source-list');
    await expect(sourceList).toBeVisible();
  });

  test('默认数据源已配置', async ({ page }) => {
    await page.waitForSelector('.source-item', { timeout: 5000 });
    const sources = page.locator('.source-item');
    const count = await sources.count();
    expect(count).toBeGreaterThan(0);
  });

  test('添加数据源表单显示', async ({ page }) => {
    const nameInput = page.locator('#sourceName');
    const urlInput = page.locator('#sourceUrl');
    
    await expect(nameInput).toBeVisible();
    await expect(urlInput).toBeVisible();
  });

  test('背景设置区域显示', async ({ page }) => {
    const bgSection = page.locator('.setting-section').filter({ hasText: '背景设置' });
    await expect(bgSection).toBeVisible();
  });

  test('关于区域显示', async ({ page }) => {
    const aboutSection = page.locator('.setting-section').filter({ hasText: '关于' });
    await expect(aboutSection).toBeVisible();
  });

  test('导航链接有效', async ({ page }) => {
    const homeLink = page.locator('.navbar-menu a').filter({ hasText: '首页' });
    await expect(homeLink).toBeVisible();
    await homeLink.click();
    await expect(page).toHaveURL('/');
  });
});

test.describe('设置页面交互测试', () => {
  test('使用数据源按钮可点击', async ({ page }) => {
    await page.goto('/setting.html');
    await page.waitForSelector('.source-item', { timeout: 5000 });
    
    const useBtn = page.locator('.btn-small').filter({ hasText: '使用' }).first();
    if (await useBtn.isVisible()) {
      await expect(useBtn).toBeEnabled();
    }
  });

  test('测试连接按钮可点击', async ({ page }) => {
    const testBtn = page.locator('button').filter({ hasText: '测试连接' });
    await expect(testBtn).toBeVisible();
    await expect(testBtn).toBeEnabled();
  });

  test('背景图片上传输入存在', async ({ page }) => {
    const fileInput = page.locator('#bgFileInput');
    await expect(fileInput).toBeVisible();
    await expect(fileInput).toHaveAttribute('type', 'file');
    await expect(fileInput).toHaveAttribute('accept', 'image/*');
  });
});
