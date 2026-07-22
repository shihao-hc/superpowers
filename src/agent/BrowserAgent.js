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
    this._stealthMode = options.stealth !== false;
    this._platform = options.platform || 'desktop';
  }

  async init() {
    try {
      this._playwright = require('playwright');
    } catch (e) {
      throw new Error('Playwright not installed. Run: npm install playwright', { cause: e });
    }

    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }

    const launchArgs = [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox'
    ];

    if (this._stealthMode) {
      launchArgs.push(
        '--disable-features=IsolateOrigins,site-per-process'
      );
    }

    this.browser = await this._playwright.chromium.launch({
      headless: this.isHeadless,
      args: launchArgs
    });

    const contextOptions = this._getContextOptions();
    this.context = await this.browser.newContext(contextOptions);

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.timeout);

    if (this._stealthMode) {
      await this._applyStealth();
    }

    return this;
  }

  _getContextOptions() {
    if (this._platform === 'mobile') {
      return {
        viewport: { width: 375, height: 812 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true
      };
    }

    return {
      viewport: this.viewport,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai'
    };
  }

  async _applyStealth() {
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
      window.chrome = { runtime: {} };
    });
  }

  async setMobileMode(enabled = true) {
    if (!this.context) {throw new Error('Browser not initialized');}

    const newPage = await this.context.newPage();
    await this.page.close();
    this.page = newPage;

    if (enabled) {
      await this.page.setViewportSize({ width: 375, height: 812 });
      await this.page.setExtraHTTPHeaders({
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15'
      });
    }

    return { success: true, mobile: enabled };
  }

  _validateUrl(url) {
    const { validateURL } = require('../utils/SSRFValidator');
    const result = validateURL(url, { allowPrivate: false, allowLoopback: false });
    if (!result.allowed) {
      throw new Error(result.reason);
    }
    return url;
  }

  async goto(url) {
    if (!this.page) {throw new Error('Browser not initialized');}
    this._validateUrl(url);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    return { success: true, url };
  }

  async click(selector) {
    if (!this.page) {throw new Error('Browser not initialized');}
    await this.page.waitForSelector(selector, { timeout: 5000 });
    await this.page.click(selector);
    return { success: true, selector };
  }

  async type(selector, text) {
    if (!this.page) {throw new Error('Browser not initialized');}
    await this.page.waitForSelector(selector, { timeout: 5000 });
    await this.page.fill(selector, text);
    return { success: true, selector, text };
  }

  async extract(selector, attribute = 'textContent') {
    if (!this.page) {throw new Error('Browser not initialized');}
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
    if (!this.page) {throw new Error('Browser not initialized');}

    const timestamp = Date.now();
    const filename = path.basename(options.filename || `screenshot_${timestamp}.png`);
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
    if (!this.page) {throw new Error('Browser not initialized');}

    await this.page.evaluate(({ direction, amount }) => {
      window.scrollBy(0, direction === 'down' ? amount : -amount);
    }, { direction, amount });

    return { success: true, direction, amount };
  }

  async back() {
    if (!this.page) {throw new Error('Browser not initialized');}
    await this.page.goBack();
    return { success: true };
  }

  async forward() {
    if (!this.page) {throw new Error('Browser not initialized');}
    await this.page.goForward();
    return { success: true };
  }

  async waitForSelector(selector, timeout = 5000) {
    if (!this.page) {throw new Error('Browser not initialized');}
    await this.page.waitForSelector(selector, { timeout });
    return { success: true, selector };
  }

  async waitForNetworkIdle(timeout = 15000) {
    if (!this.page) {throw new Error('Browser not initialized');}
    try {
      await this.page.waitForLoadState('networkidle', { timeout });
      return { success: true };
    } catch (e) {
      return { success: false, reason: 'timeout', message: e.message };
    }
  }

  async scrollToLoad(selector, maxScrolls = 10) {
    if (!this.page) {throw new Error('Browser not initialized');}

    let previousCount = 0;
    let scrollCount = 0;

    for (let i = 0; i < maxScrolls; i++) {
      await this.page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await this.page.waitForTimeout(1000);

      if (selector) {
        const currentCount = await this.page.$$eval(selector, (els) => els.length);
        if (currentCount === previousCount) {break;}
        previousCount = currentCount;
      }
      scrollCount++;
    }

    return { success: true, scrolls: scrollCount };
  }

  async extractVideoUrl() {
    if (!this.page) {throw new Error('Browser not initialized');}

    const videoData = await this.page.evaluate(() => {
      const videos = document.querySelectorAll('video');
      const sources = [];

      videos.forEach((v) => {
        sources.push({
          src: v.src || v.querySelector('source')?.src,
          type: v.type || v.querySelector('source')?.type,
          poster: v.poster
        });
      });

      const scripts = Array.from(document.querySelectorAll('script'));
      const videoPatterns = [
        /playAddr.*?["']([^"']+)["']/,
        /video_url.*?["']([^"']+)["']/,
        /src.*?https?:\/\/[^\s"']+\.(mp4|webm|m3u8)[^\s"']*/i
      ];

      const foundUrls = [];
      scripts.forEach((script) => {
        videoPatterns.forEach((pattern) => {
          const match = script.textContent?.match(pattern);
          if (match) {foundUrls.push(match[1]);}
        });
      });

      return { videos: sources.filter((v) => v.src), dynamicUrls: [...new Set(foundUrls)] };
    });

    return {
      videoSources: videoData.videos,
      potentialVideoUrls: videoData.dynamicUrls,
      allUrls: [...videoData.videos.map((v) => v.src), ...videoData.dynamicUrls].filter(Boolean)
    };
  }

  async handleShortVideo() {
    if (!this.page) {throw new Error('Browser not initialized');}

    const result = await this.page.evaluate(() => {
      const video = document.querySelector('video');
      if (!video) {return { hasVideo: false };}

      const info = {
        hasVideo: true,
        src: video.src || video.querySelector('source')?.src,
        poster: video.poster,
        duration: video.duration,
        currentTime: video.currentTime
      };

      const parent = video.closest('[class*="video"], [class*="player"], section, main');
      if (parent) {
        const title = parent.querySelector('[class*="title"], h1, h2, [class*="desc"]');
        if (title) {info.title = title.textContent?.trim();}
      }

      return info;
    });

    return result;
  }

  async waitForVideoLoad(timeout = 10000) {
    if (!this.page) {throw new Error('Browser not initialized');}

    try {
      await this.page.waitForFunction(() => {
        const video = document.querySelector('video');
        return video && video.readyState >= 3;
      }, { timeout });

      return { success: true, loaded: true };
    } catch (e) {
      return { success: false, reason: 'video_load_timeout' };
    }
  }

  async evaluate(fn, ...args) {
    if (!this.page) {throw new Error('Browser not initialized');}
    return await this.page.evaluate(fn, ...args);
  }

  async url() {
    if (!this.page) {return null;}
    return this.page.url();
  }

  async title() {
    if (!this.page) {return null;}
    return await this.page.title();
  }

  async getPageContent() {
    if (!this.page) {throw new Error('Browser not initialized');}
    return await this.page.content();
  }

  async getPageText() {
    if (!this.page) {throw new Error('Browser not initialized');}
    return await this.page.evaluate(() => document.body.innerText);
  }

  async download(url, savePath) {
    if (!this.page) {throw new Error('Browser not initialized');}

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
    if (!this.page) {throw new Error('Browser not initialized');}

    for (const [selector, value] of Object.entries(formData)) {
      await this.page.fill(selector, value);
    }

    return { success: true, fields: Object.keys(formData).length };
  }

  async submitForm(formSelector) {
    if (!this.page) {throw new Error('Browser not initialized');}

    if (formSelector) {
      await this.page.click(`${formSelector} [type="submit"]`);
    } else {
      await this.page.click('[type="submit"]');
    }

    await this.page.waitForLoadState('networkidle');
    return { success: true };
  }

  async getElements(selector) {
    if (!this.page) {throw new Error('Browser not initialized');}

    const elements = await this.page.$$(selector);
    return elements.length;
  }

  async waitForNavigation(timeout = 10000) {
    if (!this.page) {throw new Error('Browser not initialized');}
    await this.page.waitForNavigation({ timeout });
    return { success: true, url: this.page.url() };
  }

  async newPage() {
    if (!this.context) {throw new Error('Browser not initialized');}
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

  async scrapeDynamicPage(url, options = {}) {
    if (!this.page) {await this.init();}

    this._validateUrl(url);

    const {
      waitTime = 3000,
      scrollCount = 3,
      extractVideos = true,
      extractImages = true
    } = options;

    await this.page.goto(url, { waitUntil: 'networkidle', timeout: this.timeout });
    await this.page.waitForTimeout(waitTime);

    const result = { url, content: {}, videos: [], images: [] };

    result.content.html = await this.page.content();
    result.content.text = await this.page.evaluate(() => document.body.innerText);
    result.content.title = await this.page.title();

    if (extractVideos) {
      result.videos = await this.extractVideoUrl();
    }

    if (extractImages) {
      result.images = await this.page.evaluate(() => {
        return Array.from(document.querySelectorAll('img'))
          .map((img) => ({ src: img.src, alt: img.alt, loading: img.loading }))
          .filter((img) => img.src && !img.src.startsWith('data:'));
      });
    }

    for (let i = 0; i < scrollCount; i++) {
      await this.page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await this.page.waitForTimeout(1000);
    }

    return result;
  }

  async scrapeDouyin(url) {
    if (!this.page) {await this.init();}

    this._validateUrl(url);

    const isMobileUrl = url.includes('v.douyin.com') || url.includes('www.douyin.com');

    if (isMobileUrl) {
      await this.setMobileMode(true);
    }

    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.timeout });
    await this.page.waitForTimeout(5000);

    await this.waitForNetworkIdle(10000);

    const result = await this.page.evaluate(() => {
      const video = document.querySelector('video');
      const data = {
        url: window.location.href,
        title: '',
        description: '',
        author: '',
        videoUrl: '',
        coverUrl: ''
      };

      const metaTags = document.querySelectorAll('meta');
      metaTags.forEach((meta) => {
        if (meta.name === 'title' || meta.getAttribute('property') === 'og:title') {
          data.title = meta.content;
        }
        if (meta.name === 'description' || meta.getAttribute('property') === 'og:description') {
          data.description = meta.content;
        }
      });

      if (video) {
        data.videoUrl = video.src || video.querySelector('source')?.src || video.poster;
        data.coverUrl = video.poster;
      }

      const authorSelectors = ['[class*="author"]', '[class*="nickname"]', '[class*="user"]'];
      for (const sel of authorSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          data.author = el.textContent?.trim();
          break;
        }
      }

      const scripts = document.querySelectorAll('script');
      scripts.forEach((script) => {
        const text = script.textContent;
        if (text) {
          const playAddrMatch = text.match(/playAddr\s*:\s*["']([^"']+)["']/);
          if (playAddrMatch) {data.videoUrl = playAddrMatch[1];}
        }
      });

      return data;
    });

    await this.setMobileMode(false);
    return result;
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
