/**
 * monitor-server.js — server 存活监控 + 自动重启 + 崩溃时间记录
 *
 * 用法: node scripts/monitor-server.js
 * 每 30s 检查 localhost:3000；挂掉则自动重启并记录到 logs/monitor.log
 *
 * 配套: server/index.js 的 crash.log（崩溃时同步写诊断：uncaughtException/内存/栈）
 * monitor.log 记录"何时挂"，crash.log 记录"为什么挂"——两者结合定位 server 稳定性根源。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = 3000;
// 项目根用 __dirname 定位，不依赖调用者 cwd（任务计划 Start In=N/A 时 cwd=System32，曾致保活链全断）
const ROOT = path.join(__dirname, '..');
const LOG = path.join(ROOT, 'logs', 'monitor.log');
const NODE = process.execPath;

function log(msg) {
  try {
    const dir = path.dirname(LOG);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);
  } catch (e) { /* 日志失败不阻塞 */ }
  console.log(`${new Date().toISOString().slice(11, 19)} ${msg}`);
}

function check() {
  return new Promise((resolve) => {
    const req = http.get({ host: 'localhost', port: PORT, timeout: 5000 }, (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function startServer() {
  const child = spawn(NODE, ['server/index.js'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true
  });
  child.unref();
  log(`[monitor] server 重启 (pid ${child.pid})`);
}

let downStreak = 0;
async function loop() {
  // 心跳（供 keepalive 检查 monitor 自身存活——真实使用暴露：monitor 挂了则自愈链断）
  try { fs.writeFileSync(path.join(ROOT, 'logs', 'monitor-heartbeat'), Date.now().toString()); } catch (e) { /* 心跳失败不阻塞 */ }
  const up = await check();
  if (!up) {
    downStreak++;
    log(`[monitor] server DOWN (连续 ${downStreak} 次检测)，重启`);
    startServer();
  } else {
    if (downStreak > 0) { log(`[monitor] server 恢复 (曾连续 ${downStreak} 次检测失败)`); }
    downStreak = 0;
  }
  // 定期健康检查（每 30 分钟跑 56 项全方面检查，非通过项记录）——健康哨兵协议"定期跑"的自动机制
  if (Date.now() - lastHealthCheck > 30 * 60 * 1000) {
    lastHealthCheck = Date.now();
    runHealthCheck();
  }
  // 定期网络自愈（每 10 分钟探测 Clash 代理端口 + 修 git 代理）——避免网络问题复现
  if (Date.now() - lastNetCheck > 10 * 60 * 1000) {
    lastNetCheck = Date.now();
    runNetFix();
  }
  // 每日核心数据备份（"留后手"——教训库/记忆/会话损坏可恢复，保留 7 份）
  if (Date.now() - lastBackup > 24 * 60 * 60 * 1000) {
    lastBackup = Date.now();
    const child = spawn(NODE, ['scripts/backup-core.js'], { cwd: ROOT, stdio: 'ignore' });
    child.on('exit', () => log('[backup] 核心数据备份完成'));
  }
  // 每日 token 成本快照（"节流量化"——把"今天烧了多少"变成可回看的记录，不凭感觉）
  if (Date.now() - lastCostReport > 24 * 60 * 60 * 1000) {
    lastCostReport = Date.now();
    const child = spawn(NODE, ['scripts/cost-report.js', '--log'], { cwd: ROOT, stdio: 'ignore' });
    child.on('exit', () => log('[cost-report] token 成本快照已记录'));
  }
  // 每日闲鱼擦亮（业务：曝光维护；一次/自然日，9 点后触发，标记文件防重启重复触发）
  if (new Date().getHours() >= 9 && polishDay !== todayStr() && readPolishMark() !== todayStr()) {
    polishDay = todayStr();
    try { fs.writeFileSync(POLISH_MARK, polishDay); } catch (e) { /* 标记失败则进程内 flag 兜底 */ }
    log('[polish] 触发闲鱼每日擦亮');
    const child = spawn(NODE, ['scripts/xianyu-polish.js', '--auto'], { cwd: ROOT, stdio: 'ignore' });
    child.on('exit', (code) => log(`[polish] 闲鱼每日擦亮完成 exit=${code}`));
  }
  setTimeout(loop, 30000);
}

const POLISH_MARK = path.join(ROOT, 'logs', 'xianyu-polish.lastrun');
let polishDay = '';
function todayStr() { return new Date().toISOString().slice(0, 10); }
function readPolishMark() {
  try { return fs.existsSync(POLISH_MARK) ? fs.readFileSync(POLISH_MARK, 'utf8').trim() : ''; } catch (e) { return ''; }
}

let lastHealthCheck = 0;
let lastNetCheck = 0;
let lastBackup = 0;
let lastCostReport = 0;
function runHealthCheck() {
  const child = spawn(NODE, ['scripts/health-check.js'], { cwd: ROOT, stdio: 'ignore' });
  child.on('exit', (code) => {
    log(`[health-check] 完成 exit=${code}${code === 1 ? ' ⚠️ 有非通过项，需追根源（5.3）' : ''}`);
  });
}
function runNetFix() {
  const child = spawn(NODE, ['scripts/net-fix.js'], { cwd: ROOT, stdio: 'ignore' });
  child.on('exit', (code) => {
    log(`[net-fix] 完成 exit=${code}${code === 1 ? ' ⚠️ 无可用代理端口' : ''}`);
  });
}

log('[monitor] 启动，每 30s 检查 server 存活；每 30min 健康检查；每 10min 网络自愈；每日备份/成本/闲鱼擦亮');
loop();