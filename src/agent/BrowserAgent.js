const fs = require('fs');
const path = require('path');

class BrowserAgent {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.context = null;
    this.timeout = options.timeout || 30000;
    this.screenshotDir = options.screenshotDir || './screenshots';
    this.isHeadless = options.headless !== false;
    this.viewport = options.viewport || { width: 1280, height: 720 };
    this._playwright = null;
  }

  async init() {
    try {
      this._playwright = require('playwright');
    } catch (e) {
      throw new Error('Playwright not installed. Run: npm install playwright');
    }

    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }

    this.browser = await this._playwright.chromium.launch({
      headless: this.isHeadless,
      args: ['--disable-blink-features=AutomationControlled']
    });

    this.context = await this.browser.newContext({
      viewport: this.viewport,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai'
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.timeout);

    return this;
  }

  _validateUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL');
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      throw new Error('Invalid URL format');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only HTTP/HTTPS protocols allowed');
    }

    const blockedHosts = [
      '169.254.169.254',
      '100.100.100.200',
      'metadata.google.internal'
    ];

    if (blockedHosts.some(h => parsed.hostname.includes(h))) {
      throw new Error('Access to metadata service blocked');
    }

    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^127\./,
      /^localhost$/i
    ];

    if (privateRanges.some(r => r.test(parsed.hostname))) {
      console.warn('[BrowserAgent] Warning: Accessing private IP:', parsed.hostname);
    }

    return url;
  }

  async goto(url) {
    if (!this.page) throw new Error('Browser not initialized');
    this._validateUrl(url);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    return { success: true, url };
  }

  async click(selector) {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.waitForSelector(selector, { timeout: 5000 });
    await this.page.click(selector);
    return { success: true, selector };
  }

  async type(selector, text) {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.waitForSelector(selector, { timeout: 5000 });
    await this.page.fill(selector, text);
    return { success: true, selector, text };
  }

  async extract(selector, attribute = 'textContent') {
    if (!this.page) throw new Error('Browser not initialized');
    const elements = await this.page.$$(selector);
    const data = [];

    for (const el of elements) {
      if (attribute === 'textContent') {
        const text = await el.textContent();
        data.push(text?.trim());
      } else if (attribute === 'href') {
        const href = await el.getAttribute('href');
        data.push(href);
      } else {
        const value = await el.getAttribute(attribute);
        data.push(value);
      }
    }

    return data.filter(Boolean);
  }

  async screenshot(options = {}) {
    if (!this.page) throw new Error('Browser not initialized');

    const timestamp = Date.now();
    const filename = options.filename || `screenshot_${timestamp}.png`;
    const filepath = path.join(this.screenshotDir, filename);

    const buffer = await this.page.screenshot({
      fullPage: options.fullPage || false,
      type: 'png'
    });

    if (options.save) {
      fs.writeFileSync(filepath, buffer);
    }

    return buffer.toString('base64');
  }

  async screenshotFullPage() {
    return this.screenshot({ fullPage: true });
  }

  async scroll(direction = 'down', amount = 500) {
    if (!this.page) throw new Error('Browser not initialized');

    await this.page.evaluate(({ direction, amount }) => {
      window.scrollBy(0, direction === 'down' ? amount : -amount);
    }, { direction, amount });

    return { success: true, direction, amount };
  }

  async back() {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.goBack();
    return { success: true };
  }

  async forward() {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.goForward();
    return { success: true };
  }

  async waitForSelector(selector, timeout = 5000) {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.waitForSelector(selector, { timeout });
    return { success: true, selector };
  }

  async evaluate(fn, ...args) {
    if (!this.page) throw new Error('Browser not initialized');
    return await this.page.evaluate(fn, ...args);
  }

  async url() {
    if (!this.page) return null;
    return this.page.url();
  }

  async title() {
    if (!this.page) return null;
    return await this.page.title();
  }

  async getPageContent() {
    if (!this.page) throw new Error('Browser not initialized');
    return await this.page.content();
  }

  async getPageText() {
    if (!this.page) throw new Error('Browser not initialized');
    return await this.page.evaluate(() => document.body.innerText);
  }

  async download(url, savePath) {
    if (!this.page) throw new Error('Browser not initialized');

    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.page.goto(url)
    ]);

    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await download.saveAs(savePath);
    return { success: true, path: savePath };
  }

  async fillForm(formData) {
    if (!this.page) throw new Error('Browser not initialized');

    for (const [selector, value] of Object.entries(formData)) {
      await this.page.fill(selector, value);
    }

    return { success: true, fields: Object.keys(formData).length };
  }

  async submitForm(formSelector) {
    if (!this.page) throw new Error('Browser not initialized');

    if (formSelector) {
      await this.page.click(`${formSelector} [type="submit"]`);
    } else {
      await this.page.click('[type="submit"]');
    }

    await this.page.waitForLoadState('networkidle');
    return { success: true };
  }

  async getElements(selector) {
    if (!this.page) throw new Error('Browser not initialized');

    const elements = await this.page.$$(selector);
    return elements.length;
  }

  async waitForNavigation(timeout = 10000) {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.waitForNavigation({ timeout });
    return { success: true, url: this.page.url() };
  }

  async newPage() {
    if (!this.context) throw new Error('Browser not initialized');
    const page = await this.context.newPage();
    return page;
  }

  async closePage() {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
  }

  async close() {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  isConnected() {
    return this.browser !== null && this.page !== null;
  }

  getStatus() {
    return {
      connected: this.isConnected(),
      url: this.page?.url() || null,
      viewport: this.viewport
    };
  }
}

module.exports = { BrowserAgent };
