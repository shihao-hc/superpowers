/**
 * net-fix.js — 网络自愈（Clash Verge 代理端口探测 + git 代理修复）
 *
 * 背景：Clash Verge 代理端口会变（本次 7897→7900），git 配置硬编码旧端口 → push 失败。
 * 本工具：扫描本地监听的候选端口 → 测试哪个能代理连 GitHub → 自动修正 git 代理。
 *
 * 用法: node scripts/net-fix.js
 */
const { execSync, execFileSync } = require('child_process');

// 测试某端口能否代理连 GitHub（用 curl -x，数组参数避免 shell 注入）
function testProxy(port) {
  try {
    const out = execFileSync(
      'curl',
      ['-s', '-x', `http://127.0.0.1:${port}`, '--max-time', '8', '-o', 'NUL', '-w', '%{http_code}', 'https://api.github.com'],
      { encoding: 'utf8', windowsHide: true, timeout: 12000 }
    ).trim();
    return /^[23]\d\d$/.test(out) ? out : null;
  } catch (e) {
    return null;
  }
}

// 找本地监听的候选代理端口（7890-7910 常见 Clash 范围）
function candidatePorts() {
  const ports = new Set();
  try {
    const out = execSync('netstat -ano', { encoding: 'utf8', windowsHide: true });
    out.split('\n').forEach((line) => {
      const m = line.match(/127\.0\.0\.1:(\d+)\s+\S+\s+LISTENING/);
      if (m) { ports.add(parseInt(m[1], 10)); }
    });
  } catch (e) { /* netstat 失败 */ }
  // 常见 Clash 端口兜底
  [7890, 7891, 7897, 7900, 7901].forEach((p) => ports.add(p));
  return [...ports].filter((p) => p >= 1080 && p < 65536);
}

(async () => {
  const current = (() => { try { return execSync('git config --get http.proxy', { encoding: 'utf8', windowsHide: true }).trim(); } catch (e) { return ''; } })();
  console.log('当前 git 代理:', current || '(未设置)');

  const ports = candidatePorts();
  console.log(`扫描 ${ports.length} 个本地监听端口...`);
  let best = null;
  for (const p of ports) {
    const t = await testProxy(p);
    if (t) { console.log(`  ✅ 端口 ${p} 可代理 GitHub`); best = p; break; }
  }

  if (!best) {
    console.log('❌ 未找到可用代理端口（Clash Verge 可能未运行或节点不可用）');
    process.exit(1);
  }

  const want = `http://127.0.0.1:${best}`;
  if (current === want) {
    console.log(`✅ git 代理已是可用端口 ${best}，无需修改`);
  } else {
    // 数组参数（execFileSync）——避免 shell 拼接/命令注入
    execFileSync('git', ['config', 'http.proxy', want], { windowsHide: true });
    execFileSync('git', ['config', 'https.proxy', want], { windowsHide: true });
    console.log(`🔧 已修正 git 代理: ${current || '(空)'} → ${want}`);
  }
  process.exit(0);
})();