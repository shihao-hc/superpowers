#!/usr/bin/env node
/**
 * monitor-sim.js — 对账执行器（reconcileMonitors）「真实进程」模拟验证
 *
 * 目的（4.3 真实验收）：不只单测纯决策，还用**真实 node 进程**跑通对账的**执行**——
 *   真杀进程（killPids → process.kill(SIGTERM)）、真起进程（注入 start，用同款 spawn 机制）。
 *
 * 安全隔离：
 *   - dummy 用通用参数（cmdline **不含** monitor-server.js）→ 真实枚举器 / 真实 keepalive 不会误认它，
 *     绝不触碰生产 monitor；本脚本注入 listMonitorPids，只作用于自己创建的 dummy。
 *   - finally 清理全部 dummy，不残留。
 *
 * 用法: node scripts/monitor-sim.js   （exit 0 = 全过）
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { reconcileMonitors, decideMonitorAction, listMonitorPids, killPids, STALE_MS } = require('./monitor-instance');

const dummies = [];
function spawnDummy() {
  const p = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  dummies.push(p);
  return p;
}
const alive = (p) => p.exitCode === null && p.signalCode === null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ FAIL: ${name}`); }
}

async function run() {
  // 1) replace：多实例（≥2）→ 全部杀掉 + 重建一个
  console.log('[1] 多实例（3 个真实 dummy 进程）+ 心跳新鲜 → 应全部被杀 + 起 1 个');
  const d1 = spawnDummy(); const d2 = spawnDummy(); const d3 = spawnDummy();
  await sleep(400);
  let spawned1 = 0;
  const r1 = await reconcileMonitors({
    listMonitorPids: () => [d1.pid, d2.pid, d3.pid],
    heartbeatAgeMs: () => 1000,
    killPids,
    start: () => { spawned1++; spawnDummy(); },
    sleep, log: (m) => console.log(`     ${m}`)
  });
  check('决策 = replace', r1.decision.action === 'replace');
  check('killed = 全部 3 个 pid', r1.killed.length === 3);
  check('spawned = true 且 start 调用 1 次', r1.spawned === true && spawned1 === 1);
  check('3 个原 dummy 均已终止（真被杀）', !alive(d1) && !alive(d2) && !alive(d3));

  // 2) replace：1 个但心跳过期（僵留）→ 杀掉 + 重建
  console.log('[2] 单实例 + 心跳过期（僵留）→ 应杀掉 + 起 1 个');
  const d4 = spawnDummy();
  await sleep(400);
  let spawned2 = 0;
  const r2 = await reconcileMonitors({
    listMonitorPids: () => [d4.pid],
    heartbeatAgeMs: () => STALE_MS + 5000,
    killPids,
    start: () => { spawned2++; spawnDummy(); },
    sleep, log: (m) => console.log(`     ${m}`)
  });
  check('决策 = replace', r2.decision.action === 'replace');
  check('killed = [该 pid]', r2.killed.length === 1 && r2.killed[0] === d4.pid);
  check('旧 dummy 已终止（真被杀）', !alive(d4));
  check('spawned = true 且 start 调用 1 次', r2.spawned === true && spawned2 === 1);

  // 3) spawn：无进程 + 心跳过期 → 只起一个，不杀
  console.log('[3] 无进程 + 心跳过期 → 应只起 1 个（不杀）');
  let spawned3 = 0; let killCalled3 = 0;
  const r3 = await reconcileMonitors({
    listMonitorPids: () => [],
    heartbeatAgeMs: () => null,
    killPids: (pids) => { killCalled3++; return killPids(pids); },
    start: () => { spawned3++; spawnDummy(); },
    sleep, log: (m) => console.log(`     ${m}`)
  });
  check('决策 = spawn', r3.decision.action === 'spawn');
  check('未调用 kill', killCalled3 === 0);
  check('spawned = true 且 start 调用 1 次', r3.spawned === true && spawned3 === 1);

  // 4) ok：1 个 + 心跳新鲜 → 不杀不启
  console.log('[4] 单实例 + 心跳新鲜 → 应不动作（不杀不启）');
  const d5 = spawnDummy();
  await sleep(400);
  let spawned4 = 0; let killCalled4 = 0;
  const r4 = await reconcileMonitors({
    listMonitorPids: () => [d5.pid],
    heartbeatAgeMs: () => 1000,
    killPids: (pids) => { killCalled4++; return killPids(pids); },
    start: () => { spawned4++; },
    sleep, log: (m) => console.log(`     ${m}`)
  });
  check('决策 = ok', r4.decision.action === 'ok');
  check('未杀未启', killCalled4 === 0 && spawned4 === 0);
  check('原 dummy 仍存活（未被误杀）', alive(d5));

  // 5) unknown：枚举失败 → 不杀不启（不用不可信数据动作）
  console.log('[5] 进程枚举失败 → 应不动作');
  let spawned5 = 0; let killCalled5 = 0;
  const r5 = await reconcileMonitors({
    listMonitorPids: () => ({ error: 'powershell timeout' }),
    heartbeatAgeMs: () => 1000,
    killPids: (pids) => { killCalled5++; return killPids(pids); },
    start: () => { spawned5++; },
    sleep, log: (m) => console.log(`     ${m}`)
  });
  check('决策 = unknown', r5.decision.action === 'unknown');
  check('未杀未启', killCalled5 === 0 && spawned5 === 0);

  // 6) 真实生产上下文：真心跳年龄 + 真实进程列表追加一个假想 pid → 决策应为 replace（不执行）
  console.log('[6] 真实生产上下文（真枚举 + 真心跳 + 追加一个假想 pid）→ 决策=replace（不执行）');
  const real = listMonitorPids();
  const base = Array.isArray(real) ? real : [];
  const synthetic = base.length ? base.concat([999999]) : [111111, 999999];
  let age = null;
  try { age = Date.now() - parseInt(fs.readFileSync(path.join(__dirname, '..', 'logs', 'monitor-heartbeat'), 'utf8'), 10); } catch (e) { /* 无心跳 */ }
  const d6 = decideMonitorAction({ heartbeatAgeMs: age, monitorPids: synthetic });
  console.log(`     真实枚举=${JSON.stringify(real)} 心跳年龄=${Number.isFinite(age) ? `${Math.round(age / 1000)}s` : '缺失'} 合成列表=${JSON.stringify(synthetic)}`);
  check('决策 = replace（多实例收敛）', d6.action === 'replace');
  check('killPids 覆盖全部（含生产 pid）', d6.killPids.length === synthetic.length);
}

run()
  .catch((e) => { console.log(`模拟异常: ${e.message}`); fail++; })
  .finally(() => {
    for (const p of dummies) { try { if (alive(p)) { p.kill(); } } catch (e) { /* ignore */ } }
    setTimeout(() => {
      const leftover = dummies.filter(alive).length;
      console.log('');
      console.log(`结果: PASS ${pass} / FAIL ${fail} ｜ dummy 残留存活=${leftover}`);
      process.exit(fail > 0 ? 1 : 0);
    }, 600);
  });
