/**
 * keepalive.js — 系统级保活（监控"监控者"——真实使用暴露：monitor 自身挂了则自愈链断）
 *
 * 检查 server(3000) + monitor 心跳，任一挂了则重启。配合 Windows 任务计划（每 5 分钟）运行，
 * 解决"monitor 挂了没人管"的问题（监控者需要被监控）。
 *
 * 用法: node scripts/keepalive.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const NODE = process.execPath;
// 项目根用 __dirname 定位，不依赖调用者 cwd（任务计划 Start In=N/A 时 cwd=System32，曾致保活链全断）
const ROOT = path.join(__dirname, '..');
const HEARTBEAT = path.join(ROOT, 'logs', 'monitor-heartbeat');

function log(msg) {
  try { fs.appendFileSync(path.join(ROOT, 'logs', 'keepalive.log'), `${new Date().toISOString()} ${msg}\n`); } catch (e) { /* ignore */ }
}

function checkServer() {
  return new Promise((resolve) => {
    const req = http.get({ host: 'localhost', port: 3000, timeout: 5000 }, (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function monitorAlive() {
  try {
    const ts = parseInt(fs.readFileSync(HEARTBEAT, 'utf8'), 10);
    return Date.now() - ts < 120000; // 心跳 < 2 分钟 = 存活
  } catch (e) { return false; }
}

function start(script, out) {
  const child = spawn(NODE, [script], { cwd: ROOT, stdio: 'ignore', detached: true,
    env: process.env });
  child.unref();
  log(`[keepalive] 启动 ${script} (pid ${child.pid})`);
}

(async () => {
  const serverUp = await checkServer();
  if (!serverUp) { log('[keepalive] server DOWN，重启'); start('server/index.js'); }
  if (!monitorAlive()) { log('[keepalive] monitor 心跳超时（挂了），重启'); start('scripts/monitor-server.js'); }
  if (serverUp && monitorAlive()) { log('[keepalive] server + monitor 均存活'); }
  process.exit(0);
})().catch((e) => { log(`[keepalive] 错误: ${e.message}`); process.exit(1); });