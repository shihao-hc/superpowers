/**
 * keepalive.js — 系统级保活（对账式：server + monitor）
 *
 * 配合 Windows 任务计划（每 5 分钟）运行，解决"monitor 挂了没人管"的问题（监控者需要被监控）。
 *
 * 对账目标 = 「server 在线」+「恰好 1 个健康 monitor」：
 *   旧版仅凭心跳新鲜度**盲目 spawn**（心跳过期就再起一个），当旧进程"心跳停但进程僵留"时新旧并存
 *   → 重复实例（备份/健康检查/闲鱼擦亮被重复触发）。现升级为**对账**（见 monitor-instance.js）：
 *   无进程且过期 → 启动；有进程但过期（僵留）→ 杀掉重建；多进程 → 收敛为恰好一个；枚举失败 → 不动作。
 *
 * 用法: node scripts/keepalive.js [--dry]   （--dry 只打印决策、不杀不启，用于真实环境核对）
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { reconcileMonitors, listMonitorPids, killPids } = require('./monitor-instance');

const NODE = process.execPath;
// 项目根用 __dirname 定位，不依赖调用者 cwd（任务计划 Start In=N/A 时 cwd=System32，曾致保活链全断）
const ROOT = path.join(__dirname, '..');
const HEARTBEAT = path.join(ROOT, 'logs', 'monitor-heartbeat');
const DRY = process.argv.includes('--dry');

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

function heartbeatAgeMs() {
  try {
    const ts = parseInt(fs.readFileSync(HEARTBEAT, 'utf8'), 10);
    return Number.isFinite(ts) ? Date.now() - ts : null;
  } catch (e) { return null; }
}

function start(script) {
  if (DRY) { log(`[dry] 将启动 ${script}`); return; }
  const child = spawn(NODE, [script], { cwd: ROOT, stdio: 'ignore', detached: true, env: process.env });
  child.unref();
  log(`[keepalive] 启动 ${script} (pid ${child.pid})`);
}

(async () => {
  const serverUp = await checkServer();
  if (!serverUp) { log('[keepalive] server DOWN，重启'); start('server/index.js'); }

  const { decision } = await reconcileMonitors({
    listMonitorPids, heartbeatAgeMs, killPids, start, log, dry: DRY
  });

  if (!DRY && decision.action === 'ok' && serverUp) { log('[keepalive] server + monitor 均存活'); }
  process.exit(0);
})().catch((e) => { log(`[keepalive] 错误: ${e.message}`); process.exit(1); });
