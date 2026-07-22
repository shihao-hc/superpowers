const { BrowserAgent } = require('./BrowserAgent');

class DynamicScraper {
  constructor(options = {}) {
    this.browser = null;
    this.options = {
      timeout: options.timeout || 30000,
      screenshotDir: options.screenshotDir || './screenshots',
      headless: options.headless !== false,
      stealth: options.stealth !== false,
      ...options
    };
    this.platforms = {
      douyin: {
        domains: ['douyin.com', 'v.douyin.com'],
        mobileRequired: true,
        waitTime: 5000,
        selectors: {
          video: 'video',
          title: '[class*="title"], [class*="desc"], h1',
          author: '[class*="author"], [class*="nickname"]'
        }
      },
      bilibili: {
        domains: ['bilibili.com', 'b23.tv'],
        mobileRequired: false,
        waitTime: 3000,
        selectors: {
          video: 'video',
          title: 'h1, .video-title',
          author: '.up-name, .user-name'
        }
      },
      xiaohongshu: {
        domains: ['xiaohongshu.com', 'xhslink.com'],
        mobileRequired: true,
        waitTime: 4000,
        selectors: {
          content: '[class*="content"], [class*="desc"]',
          author: '[class*="author"], [class*="user"]'
        }
      },
      weibo: {
        domains: ['weibo.com', 'm.weibo.cn'],
        mobileRequired: false,
        waitTime: 3000,
        selectors: {
          content: '.content',
          video: 'video'
        }
      },
      youtube: {
        domains: ['youtube.com', 'youtu.be'],
        mobileRequired: false,
        waitTime: 3000,
        selectors: {
          video: 'video',
          title: 'h1.ytd-video-primary-info-renderer, h1.title'
        }
      },
      twitter: {
        domains: ['twitter.com', 'x.com'],
        mobileRequired: false,
        waitTime: 3000,
        selectors: {
          content: '[data-testid="tweetText"]',
          video: 'video'
        }
      }
    };
  }

  async init() {
    if (!this.browser) {
      this.browser = new BrowserAgent({
        timeout: this.options.timeout,
        screenshotDir: this.options.screenshotDir,
        headless: this.options.headless,
        stealth: this.options.stealth
      });
      await this.browser.init();
    }
    return this;
  }

  _detectPlatform(url) {
    for (const [name, config] of Object.entries(this.platforms)) {
      if (config.domains.some((d) => url.includes(d))) {
        return { name, config };
      }
    }
    return null;
  }

  async scrape(url, options = {}) {
    if (!this.browser) {await this.init();}

    const platform = this._detectPlatform(url);
    const config = platform?.config || {
      waitTime: 3000,
      mobileRequired: false
    };

    if (config.mobileRequired) {
      await this.browser.setMobileMode(true);
    }

    this.browser._validateUrl(url);

    await this.browser.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: this.options.timeout
    });

    await this.browser.page.waitForTimeout(config.waitTime || 3000);

    if (options.interact) {
      await this._interact(options.interact);
    }

    const result = await this._extract(platform?.name, config.selectors, options);

    if (config.mobileRequired) {
      await this.browser.setMobileMode(false);
    }

    return {
      url,
      platform: platform?.name || 'unknown',
      timestamp: new Date().toISOString(),
      ...result
    };
  }

  async _interact(interactions) {
    for (const action of interactions) {
      switch (action.type) {
      case 'scroll':
        await this.browser.page.evaluate((y) => window.scrollBy(0, y), action.y || 500);
        await this.browser.page.waitForTimeout(action.delay || 1000);
        break;
      case 'click':
        await this.browser.page.click(action.selector);
        await this.browser.page.waitForTimeout(action.delay || 1000);
        break;
      case 'wait':
        await this.browser.page.waitForTimeout(action.duration || 2000);
        break;
      }
    }
  }

  async _extract(platform, selectors, options) {
    const data = await this.browser.page.evaluate((selectors) => {
      const result = {};

      if (selectors?.video || options.extractVideo) {
        const video = document.querySelector('video');
        if (video) {
          result.video = {
            src: video.src || video.querySelector('source')?.src,
            poster: video.poster,
            duration: video.duration
          };
        }
      }

      if (selectors?.title || options.extractTitle) {
        const titleEls = document.querySelectorAll(
          'meta[property="og:title"], meta[name="title"], h1, h2, [class*="title"]'
        );
        result.title = titleEls[0]?.content || titleEls[0]?.textContent?.trim() || '';
      }

      if (selectors?.content || options.extractContent) {
        result.content = {
          text: document.body.innerText.slice(0, 5000),
          html: options.extractHTML ? document.body.innerHTML.slice(0, 10000) : undefined
        };
      }

      if (selectors?.author || options.extractAuthor) {
        const authorEls = document.querySelectorAll(
          '[class*="author"], [class*="user"], [class*="nickname"], [rel="author"]'
        );
        result.author = authorEls[0]?.textContent?.trim() || '';
      }

      if (options.extractImages) {
        result.images = Array.from(document.querySelectorAll('img'))
          .map((img) => ({ src: img.src, alt: img.alt }))
          .filter((img) => img.src && !img.src.startsWith('data:'))
          .slice(0, 20);
      }

      if (options.extractLinks) {
        result.links = Array.from(document.querySelectorAll('a[href]'))
          .map((a) => ({ text: a.textContent?.trim(), href: a.href }))
          .filter(
            // eslint-disable-next-line no-script-url
            (l) => l.href && !l.href.startsWith('javascript:')
          )
          .slice(0, 50);
      }

      return result;
    }, selectors);

    return data;
  }

  async scrapeMultiple(urls, options = {}) {
    const results = [];
    for (const url of urls) {
      try {
        const result = await this.scrape(url, options);
        results.push({ success: true, ...result });
      } catch (error) {
        results.push({ success: false, url, error: error.message });
      }
    }
    return results;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = { DynamicScraper };
