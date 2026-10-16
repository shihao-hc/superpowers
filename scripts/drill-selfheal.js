#!/usr/bin/env node
/**
 * drill-selfheal.js — 自愈链故障演练（保命后手的真实验收）
 *
 * 为什么：后手（keepalive / monitor / net-fix / backup）是保命的，但"建了 ≠ 可靠"。
 * 本演练对每个机制注入"故障"，断言真能自愈——把「模拟真实环境验证」制度化（AGENTS 8.3）。
 *
 * 模式：
 *   默认（安全）  ：backup 备份+保留、net-fix 代理修复、monitor 对账模拟、health-check（只读/可恢复）
 *   --live（破坏性）：**真的杀掉 server / monitor 进程**，靠自愈链自动恢复（会短暂中断，随后自愈）
 *
 * 用法: node scripts/drill-selfheal.js [--live]
 * 退出码: 0 全过 / 1 有项失败
 */
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIVE = process.argv.includes('--live');
const KEEP = 7;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let pass = 0;
let fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ FAIL: ${name}`); } };

function node(script, args = [], timeout = 60000) {
  return execFileSync(process.execPath, [path.join(ROOT, script), ...args], { encoding: 'utf8', cwd: ROOT, timeout });
}

function listNodePids(regex) {
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match '${regex}' } | Select-Object -ExpandProperty ProcessId`;
  try {
    return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 15000 })
      .split(/\r?\n/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s)).map(Number);
  } catch (e) { return []; }
}
const serverPids = () => listNodePids('server/index\\.js');
const monitorPids = () => listNodePids('monitor-server\\.js');

function healthOk() {
  return new Promise((resolve) => {
    const req = http.get({ host: 'localhost', port: 3000, timeout: 4000 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function gitProxy() { try { return execFileSync('git', ['config', '--get', 'http.proxy'], { encoding: 'utf8' }).trim(); } catch (e) { return ''; } }
function setGitProxy(v) {
  execFileSync('git', ['config', 'http.proxy', v]);
  execFileSync('git', ['config', 'https.proxy', v]);
}

async function kill(pids) { for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* ignore */ } } }

async function phaseSafe() {
  // A1 backup-core：备份 + 保留 + 不误伤源
  console.log('[A1] backup-core：备份 + 保留 7 份 + 不误伤源');
  const bdir = path.join(ROOT, 'backup');
  const before = fs.existsSync(bdir) ? fs.readdirSync(bdir).filter((d) => d.startsWith('core-')) : [];
  const out = node('scripts/backup-core.js');
  const dirs = fs.readdirSync(bdir).filter((d) => d.startsWith('core-')).sort();
  check('命令输出备份计数', /备份 \d+\/\d+/.test(out));
  check(`保留份数 <= ${KEEP}`, dirs.length <= KEEP);
  check('产生了新备份目录', dirs.length >= 1 && (dirs.length > before.length || dirs.length === KEEP));
  check('最新备份内含核心文件', fs.readdirSync(path.join(bdir, dirs[dirs.length - 1])).length >= 1);
  check('源 lessons.json 未被误伤', fs.existsSync(path.join(ROOT, '.opencode/lessons.json')));

  // A2 net-fix：正常路径 + 坏端口修回
  console.log('[A2] net-fix：代理可用 / 坏端口能修回');
  const orig = gitProxy();
  let nf;
  try { nf = node('scripts/net-fix.js'); } catch (e) { nf = ''; }
  const normalOk = /可用端口|已是可用/.test(nf) && !!gitProxy();
  check('net-fix 正常路径（找到可用代理）', normalOk);
  if (normalOk) {
    try {
      setGitProxy('http://127.0.0.1:1');
      try { node('scripts/net-fix.js'); } catch (e) { /* 期望：修回，exit0；异常也继续断言 */ }
      const fixed = gitProxy();
      check('坏代理被修回可用端口', !!fixed && fixed !== 'http://127.0.0.1:1');
    } finally {
      const now = gitProxy();
      if (!now || now === 'http://127.0.0.1:1') { setGitProxy(orig || 'http://127.0.0.1:7897'); }
    }
  }

  // A3 monitor 对账执行器：真实进程模拟
  console.log('[A3] monitor 对账执行器：真实进程模拟（monitor-sim）');
  let sim;
  try { sim = node('scripts/monitor-sim.js', [], 90000); } catch (e) { sim = String(e.stdout || e.message); }
  check('monitor-sim 全过（PASS，FAIL 0，无残留）', /PASS \d+ \/ FAIL 0/.test(sim) && /残留存活=0/.test(sim));

  // A4 health-check：跑完即可（非通过项单独追）
  console.log('[A4] health-check（56 项）');
  let hc;
  try { node('scripts/health-check.js', [], 180000); hc = 0; } catch (e) { hc = Number.isFinite(e.status) ? e.status : 1; }
  check('health-check 运行完成', hc === 0 || hc === 1 || hc === 2);
  console.log(`     health-check exit=${hc}${hc === 1 ? '（有非通过项，需追根源，见 health 报告）' : ''}`);
}

async function phaseLive() {
  // B1 monitor 进程挂 → keepalive 重启
  console.log('[B1] monitor 进程挂 → keepalive 应重启');
  const before = monitorPids();
  check('演练前存在 monitor', before.length >= 1);
  await kill(before);
  await sleep(1200);
  check('monitor 已杀（枚举为 0）', monitorPids().length === 0);
  try { node('scripts/keepalive.js'); } catch (e) { /* ignore */ }
  await sleep(1500);
  const after = monitorPids();
  check('keepalive 重启了 monitor（>=1 且 pid 更新）', after.length >= 1 && !after.some((p) => before.includes(p)));
  let hb = false;
  for (let i = 0; i < 25; i++) {
    try { const age = Date.now() - parseInt(fs.readFileSync(path.join(ROOT, 'logs/monitor-heartbeat'), 'utf8'), 10); if (Number.isFinite(age) && age < 60000) { hb = true; break; } } catch (e) { /* ignore */ }
    await sleep(1000);
  }
  check('monitor 心跳恢复（新实例在写）', hb);

  // B2 server 进程挂 → monitor 重启
  console.log('[B2] server 进程挂 → monitor 应重启（<=60s）');
  const sBefore = serverPids();
  check('演练前存在 server', sBefore.length >= 1);
  await kill(sBefore);
  await sleep(1500);
  check('server 已死（health 不通）', !(await healthOk()));
  const t0 = Date.now();
  let recovered = false;
  for (let i = 0; i < 60; i++) { if (await healthOk()) { recovered = true; break; } await sleep(1000); }
  const secs = Math.round((Date.now() - t0) / 1000);
  const sAfter = serverPids();
  check(`server 自愈（health 200，用时 ${secs}s）`, recovered);
  check('server 是新的 pid', sAfter.length >= 1 && !sAfter.some((p) => sBefore.includes(p)));
  if (!recovered) {
    try { spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { cwd: ROOT, detached: true, stdio: 'ignore' }).unref(); } catch (e) { /* ignore */ }
    fail++;
    console.log('   ✗ 兜底：手动重启 server（自愈链未在规定时间内恢复）');
  }
}

(async () => {
  console.log(`=== 自愈链故障演练 ===  模式: ${LIVE ? '--live（破坏性，会杀 server/monitor）' : '安全（只读/可恢复）'}`);
  await phaseSafe();
  if (LIVE) { await phaseLive(); }
  else { console.log('[B] --live 未开启 → 跳过破坏性项（server/monitor 真杀恢复）'); }
  console.log('');
  console.log(`结果: PASS ${pass} / FAIL ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.log(`演练异常: ${e.message}`); process.exit(1); });
