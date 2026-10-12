/**
 * gh-readme.js — GitHub README 获取（"换思路"正解：API 路径绕开 HTML 反爬）
 *
 * 用法:
 *   node scripts/gh-readme.js <owner/repo>           从 API 获取 README
 *   GITHUB_TOKEN=xxx node scripts/gh-readme.js <owner/repo>  带认证（提高限流 60→5000/小时）
 *
 * 背景：GitHub 项目页 HTML 被强反爬（headless 只能拿导航/标题），raw main 可能空。
 * API /readme 是可靠路径（base64），但匿名限流（60/小时）——带 token 是正解。
 */
const https = require('https');

function get(url, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'handeye-readme', 'Accept': 'application/vnd.github+json' };
    if (token) { headers.Authorization = `token ${token}`; }
    https.get(url, { headers }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        const j = JSON.parse(d.replace(/^\uFEFF/, '') || '{}');
        if (res.statusCode >= 400) { reject(new Error(`HTTP ${res.statusCode}: ${j.message || ''}`)); }
        else { resolve(j); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const repo = process.argv[2];
  if (!repo) { console.log('用法: node scripts/gh-readme.js <owner/repo>  (可选 GITHUB_TOKEN env)'); process.exit(1); }
  const token = process.env.GITHUB_TOKEN;
  try {
    const readme = await get(`https://api.github.com/repos/${repo}/readme`, token);
    if (!readme.content) { console.log('（该仓库无 README 或无法获取）'); process.exit(0); }
    const text = Buffer.from(readme.content, 'base64').toString('utf8');
    console.log(`===== ${repo} README（${readme.name || ''}，${text.length} 字符）=====\n`);
    console.log(text);
    process.exit(0);
  } catch (e) {
    console.log(`❌ ${e.message}`);
    if (String(e.message).includes('403') || String(e.message).includes('rate limit')) {
      console.log('（API 限流——设置 GITHUB_TOKEN 提升至 5000/小时）');
    }
    process.exit(1);
  }
}

main();