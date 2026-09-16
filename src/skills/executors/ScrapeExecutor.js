/**
 * ScrapeExecutor - 爬虫执行适配器
 *
 * 把 DynamicScraper（类实例方法）适配为 AsyncExecutor 的 static execute 接口。
 * 安全：SSRF 防护——拒绝内网/本地地址，仅允许公开 http(s) URL。
 */
const { DynamicScraper } = require('../../agent/DynamicScraper');

/**
 * SSRF 防护：拒绝内网/本地/保留地址，仅允许公开 http(s) URL
 * 统一走 SSRFValidator（单一安全源，避免两套逻辑不一致漏拦截云元数据/CGNAT/IPv6 ULA 等）
 */
function isSafeUrl(url) {
  const { validateURL } = require('../../utils/SSRFValidator');
  const result = validateURL(url, { allowPrivate: false, allowLoopback: false });
  return result.allowed;
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
    try {
      await ds.init();
    } catch (e) {
      if (/executable doesn't exist|browserType\.launch/i.test(e.message || '')) {
        throw new Error('爬虫需要 Playwright 浏览器：请运行 `npx playwright install chromium` 后重试', { cause: e });
      }
      throw new Error(`爬虫初始化失败: ${e.message}`, { cause: e });
    }
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