/**
 * monitor-instance.js — monitor 单例「决策 + 进程枚举 + 终止」公共模块
 *
 * 背景（根治「重复 monitor-server 进程」，2026-10-17）：
 *   旧 keepalive 仅凭「心跳文件是否新鲜」判定 monitor 存活，心跳过期就**盲目 spawn** 一个 →
 *   当旧进程「心跳停但进程僵留」时，新旧并存 = 重复实例（备份/健康检查/闲鱼擦亮被重复触发，
 *   重复 mtop 调用还会增大风控面）。根因 = 存活信号不权威 + 恢复动作不幂等（只能"至少一个"，
 *   不能"恰好一个"）。根治 = 把 keepalive 升级为 **对账（reconcile）**：目标状态恒为「恰好 1 个健康 monitor」。
 *
 * 本模块把**纯决策**（decideMonitorAction，可单测）与**副作用**（listMonitorPids / killPids）分离，
 * 并提供**可注入 IO 的执行器** reconcileMonitors（供 keepalive 生产调用 + 真实进程模拟验证）。
 */

const { execFileSync } = require('child_process');

// 心跳过期阈值：与旧 keepalive 一致（2 分钟）
const STALE_MS = 120000;

/**
 * 纯决策：给定「心跳年龄」与「现存 monitor 进程列表」，决定 keepalive 应做什么。
 * 目标状态 = 恰好 1 个健康 monitor（心跳新鲜）。
 *
 * @param {object} state
 * @param {number|null} state.heartbeatAgeMs 心跳文件年龄（毫秒）；null/NaN = 未知/缺失（视为过期）
 * @param {number[]|{error:string}} state.monitorPids 现存 monitor 进程 pid 数组；非数组 = 枚举失败（数据不可信）
 * @param {number} [state.staleMs] 过期阈值
 * @returns {{action:'ok'|'spawn'|'replace'|'unknown', killPids:number[], spawn:boolean, reason:string}}
 */
function decideMonitorAction({ heartbeatAgeMs, monitorPids, staleMs = STALE_MS } = {}) {
  // 进程枚举失败 → 数据不可信 → 不动作（避免用坏数据误杀/误启）
  if (!Array.isArray(monitorPids)) {
    return { action: 'unknown', killPids: [], spawn: false, reason: 'monitor 进程枚举失败，跳过（不用不可信数据动作）' };
  }
  const pids = monitorPids;
  const n = pids.length;
  const stale = !Number.isFinite(heartbeatAgeMs) || heartbeatAgeMs >= staleMs;

  if (n === 0) {
    return stale
      ? { action: 'spawn', killPids: [], spawn: true, reason: '无 monitor 进程且心跳过期 → 启动' }
      : { action: 'ok', killPids: [], spawn: false, reason: '无进程但心跳新鲜（异常态，保守不动）' };
  }
  if (n === 1) {
    return stale
      ? { action: 'replace', killPids: pids.slice(), spawn: true, reason: '1 个 monitor 但心跳过期（僵留）→ 杀掉重建' }
      : { action: 'ok', killPids: [], spawn: false, reason: '1 个 monitor 且心跳新鲜 → 正常' };
  }
  // n >= 2：非预期的多实例 → 一律收敛为「恰好一个」，杀掉全部后重建一个。
  // （不做"保留任一个"——无法从单一心跳文件判断哪个健康，保留到僵留进程会残留；确定性重建更稳）
  return { action: 'replace', killPids: pids.slice(), spawn: true, reason: `${n} 个 monitor（非预期多实例）→ 全部杀掉重建` };
}

/**
 * 枚举现存 monitor-server 进程 pid（只读）。
 * 用 execFileSync（参数数组，避开 shell 引号转义）；失败返回 { error }（非数组 → 决策判为不可信）。
 * @returns {number[]|{error:string}}
 */
function listMonitorPids() {
  const ps = 'Get-CimInstance Win32_Process | Where-Object { $_.Name -eq \'node.exe\' -and $_.CommandLine -match \'monitor-server\\.js\' } | Select-Object -ExpandProperty ProcessId';
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 15000 });
    return out.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s)).map(Number);
  } catch (e) {
    return { error: String(e.message).slice(0, 120) };
  }
}

/**
 * 终止给定 pid（尽力而为，单个失败不阻塞其余）。
 * @param {number[]} pids
 * @returns {number[]} 成功发起终止的 pid
 */
function killPids(pids) {
  const killed = [];
  for (const pid of pids) {
    try { process.kill(pid, 'SIGTERM'); killed.push(pid); } catch (e) { /* 已退出/无权限等，忽略 */ }
  }
  return killed;
}

/**
 * 执行对账（把「决策」落到「动作」）。IO 全部可注入，便于用真实进程做环境模拟验证。
 * 编排 = 决策 → 若有要杀的 pid 先杀 → 等旧进程退出 → 需要则启动一个。目标「恰好 1 个健康实例」。
 *
 * @param {object} deps
 * @param {()=>number[]|{error:string}} deps.listMonitorPids
 * @param {()=>number|null} deps.heartbeatAgeMs
 * @param {(pids:number[])=>number[]} deps.killPids
 * @param {(script:string)=>void} deps.start
 * @param {(msg:string)=>void} [deps.log]
 * @param {(ms:number)=>Promise<void>} [deps.sleep]
 * @param {number} [deps.staleMs]
 * @param {boolean} [deps.dry] 只决策不动作
 * @returns {Promise<{decision:object, killed:number[], spawned:boolean}>}
 */
async function reconcileMonitors({
  listMonitorPids: listFn, heartbeatAgeMs: hbFn, killPids: killFn, start: startFn,
  log = () => {}, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  staleMs, dry = false
} = {}) {
  const pids = listFn();
  const hbAge = hbFn();
  const decision = decideMonitorAction({ heartbeatAgeMs: hbAge, monitorPids: pids, staleMs });
  const pidStr = Array.isArray(pids) ? (pids.join(',') || '无') : `枚举失败(${pids && pids.error})`;
  const ageStr = Number.isFinite(hbAge) ? `${Math.round(hbAge / 1000)}s` : '缺失';
  log(`[keepalive] monitor 对账: 决策=${decision.action} 进程=${pidStr} 心跳=${ageStr}（${decision.reason}）`);

  if (dry) {
    if (decision.killPids.length) { log(`[dry] 将终止 monitor pid: ${decision.killPids.join(',')}`); }
    if (decision.spawn) { log('[dry] 将启动 scripts/monitor-server.js'); }
    return { decision, killed: [], spawned: false };
  }

  let killed = [];
  if (decision.killPids.length) {
    killed = killFn(decision.killPids);
    log(`[keepalive] 已终止 monitor pid: ${killed.join(',') || '无'}`);
    await sleep(800); // 等旧进程退出，避免新旧并存瞬间
  }
  let spawned = false;
  if (decision.spawn) { startFn('scripts/monitor-server.js'); spawned = true; }
  return { decision, killed, spawned };
}

module.exports = { decideMonitorAction, listMonitorPids, killPids, reconcileMonitors, STALE_MS };
