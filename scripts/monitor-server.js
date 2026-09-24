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
const LOG = path.join(process.cwd(), 'logs', 'monitor.log');
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
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true
  });
  child.unref();
  log(`[monitor] server 重启 (pid ${child.pid})`);
}

let downStreak = 0;
async function loop() {
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
  setTimeout(loop, 30000);
}

let lastHealthCheck = 0;
function runHealthCheck() {
  const child = spawn(NODE, ['scripts/health-check.js'], { cwd: process.cwd(), stdio: 'ignore' });
  child.on('exit', (code) => {
    log(`[health-check] 完成 exit=${code}${code === 1 ? ' ⚠️ 有非通过项，需追根源（5.3）' : ''}`);
  });
}

log('[monitor] 启动，每 30s 检查 server 存活；每 30min 自动健康检查');
loop();