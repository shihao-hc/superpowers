/**
 * ScrapeExecutor - 爬虫执行适配器
 *
 * 把 DynamicScraper（类实例方法）适配为 AsyncExecutor 的 static execute 接口。
 * 安全：SSRF 防护——拒绝内网/本地地址，仅允许公开 http(s) URL。
 */
const { DynamicScraper } = require('../../agent/DynamicScraper');

/**
 * SSRF 防护：拒绝内网/本地/保留地址，仅允许公开 http(s) URL
 */
function isSafeUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') { return false; }
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) { return false; }
    if (host === '::1' || host === '0.0.0.0' || host === '[::1]') { return false; }
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) { return false; }
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) { return false; }
    return true;
  } catch (e) { return false; }
}

class ScrapeExecutor {
  static async execute(inputs) {
    const url = inputs && inputs.url;
    if (!url || typeof url !== 'string') {
      throw new Error('ScrapeExecutor requires a url string');
    }
    if (!isSafeUrl(url)) {
      throw new Error('Blocked by SSRF protection: only public http(s) URLs allowed');
    }
    const ds = new DynamicScraper();
    await ds.init();
    try {
      const result = await ds.scrape(url, inputs.options || {});
      const data = result && typeof result === 'object' ? result : { content: String(result || '') };
      return { type: 'scrape', url, data };
    } finally {
      try { await ds.close(); } catch (e) { /* 关闭失败不影响结果 */ }
    }
  }
}

module.exports = { ScrapeExecutor, isSafeUrl };