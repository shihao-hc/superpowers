#!/usr/bin/env node
/**
 * leak-check.js — 低危信息泄露检测（补天 SRC 入门用）
 *
 * ⚠️ 法律边界（必须先读）：
 *   本工具只发温和的 GET 请求，检测「不该公开的资源是否可被公开访问」（信息泄露）。
 *   它不注入、不攻击、不爆破。但——**只能在补天明确授权/收录的范围内使用**。
 *   未授权扫描任何系统都违法（《网络安全法》《刑法》285/286）。用之前先确认目标在授权内。
 *
 * 检测项（都是补天常见低危/中危）：
 *   1. .git 目录泄露（源码泄露）
 *   2. 备份文件（xxx.bak / xxx.zip / xxx~ 等）
 *   3. 敏感文件（.env / config.php.bak / .DS_Store 等）
 *   4. 目录遍历（Directory listing）
 *
 * 用法: node scripts/leak-check.js <目标URL>
 * 例:   node scripts/leak-check.js https://example.com
 *       node scripts/leak-check.js https://example.com --limit=200   （限制检测条目数，默认全量）
 */
const https = require('https');
const http = require('http');
const { URL } = require('url');

const target = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!target) {
  console.log('用法: node scripts/leak-check.js <目标URL>');
  console.log('例:   node scripts/leak-check.js https://example.com');
  console.log('⚠️ 仅限补天授权范围内的目标');
  process.exit(1);
}

let base;
try {
  base = new URL(target);
} catch (e) {
  console.log('无效的 URL:', target);
  process.exit(1);
}
const baseUrl = base.origin;

// 限速：每个请求间隔（温和，不给目标压力）
const DELAY_MS = 150;

// ===== 检测项 =====
// 1. .git 泄露
const gitPaths = ['/.git/config', '/.git/HEAD'];
// 2. 备份文件（常见文件名 × 常见后缀）
const fileNames = ['index', 'index.php', 'index.html', 'index.jsp', 'index.aspx', 'default.aspx', 'config', 'config.php', 'web.config', 'app.config', '.env', 'wp-config', 'database', 'db', 'admin', 'login', 'settings'];
const backupExts = ['.bak', '.backup', '.old', '.orig', '.zip', '.rar', '.tar', '.tar.gz', '.sql', '.7z', '~', '.swp', '.save', '.inc', '.txt'];
// 3. 敏感文件
const sensitiveFiles = ['/.env', '/.env.backup', '/.DS_Store', '/.htaccess', '/.gitignore', '/phpinfo.php', '/info.php', '/server-status', '/.well-known/security.txt', '/robots.txt'];
// 4. 目录遍历（常见目录）
const dirPaths = ['/admin/', '/backup/', '/uploads/', '/images/', '/static/', '/test/', '/logs/', '/tmp/', '/backups/'];

// ===== 请求函数（GET，带超时，跟随最多 0 次重定向保持简单） =====
function get(pathname) {
  return new Promise((resolve) => {
    const lib = base.protocol === 'https:' ? https : http;
    const req = lib.get({ hostname: base.hostname, port: base.port, path: pathname, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; leak-check/1.0)' }, timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; if (body.length > 4096) { req.destroy(); } });
      res.on('end', () => resolve({ status: res.statusCode, body: body.slice(0, 4096), headers: res.headers }));
    });
    req.on('error', () => resolve({ status: 0, body: '', headers: {} }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', headers: {} }); });
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// 判断是否"软 404"（很多站返回 200 但内容是 404 页）
function isSoft404(res) {
  const b = (res.body || '').toLowerCase();
  return /not found|404|页面不存在|找不到|does not exist|no such file/i.test(b) && b.length < 2000;
}

const findings = [];

async function check(pathname, category, evidence) {
  const res = await get(pathname);
  if (res.status === 200 && !isSoft404(res)) {
    const ev = evidence(res);
    if (ev) { findings.push({ pathname, category, status: res.status, evidence: ev }); }
  }
  await sleep(DELAY_MS);
}

async function main() {
  console.log(`目标: ${baseUrl}\n开始检测（温和 GET，仅检测信息泄露）...\n`);

  // 1. .git 泄露
  for (const p of gitPaths) {
    await check(p, '.git 泄露', (res) => {
      if (/\[core\]|repositoryformatversion|ref:/.test(res.body)) { return res.body.split('\n')[0]; }
      return null;
    });
  }

  // 2. 备份文件
  for (const fn of fileNames) {
    for (const ext of backupExts) {
      await check(`/${fn}${ext}`, '备份文件', (res) => {
        if (/<\?php|<\?=|SELECT |CREATE TABLE|define\(|DB_|APP_KEY|password/i.test(res.body)) { return res.body.slice(0, 80).replace(/\n/g, ' '); }
        return null;
      });
    }
  }

  // 3. 敏感文件
  for (const p of sensitiveFiles) {
    await check(p, '敏感文件', (res) => {
      if (res.body.length > 0) { return res.body.slice(0, 80).replace(/\n/g, ' '); }
      return null;
    });
  }

  // 4. 目录遍历
  for (const p of dirPaths) {
    await check(p, '目录遍历', (res) => {
      if (/Index of \/|Directory Listing|To Parent Directory|<title>.*listing/i.test(res.body)) { return '目录列表可见'; }
      return null;
    });
  }

  // 输出结果
  console.log('========== 检测结果 ==========\n');
  if (findings.length === 0) {
    console.log('未发现明显的信息泄露（这不代表无漏洞，仅说明这几类检测未命中）。');
  } else {
    findings.forEach((f, i) => {
      console.log(`[${i + 1}] ${f.category}: ${baseUrl}${f.pathname}`);
      console.log(`    状态 ${f.status} | 证据: ${f.evidence}\n`);
    });
    console.log(`共 ${findings.length} 个可疑泄露。请人工确认后，按补天格式提交（标题/URL/危害描述/复现步骤）。`);
  }
  console.log('\n⚠️ 再次提醒：仅限授权范围内目标；发现漏洞后勿扩大测试、勿碰他人数据。');
}

main();
