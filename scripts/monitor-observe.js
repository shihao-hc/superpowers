#!/usr/bin/env node
/**
 * monitor-observe.js — 只读观测：记录「monitor 实例数 + 心跳年龄」
 *
 * 目的：确认「重复 monitor-server 进程」是否**真的会复发**（此前只观测到一次，未证实）。
 * 只读——不杀、不启任何进程；每次调用向 logs/monitor-instances.jsonl 追加一行。
 * 由 monitor-server 每 5 分钟调用（不做新计划任务、不改 keepalive）。
 *
 * 用法: node scripts/monitor-observe.js
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOG = path.join(ROOT, 'logs', 'monitor-instances.jsonl');
const HEARTBEAT = path.join(ROOT, 'logs', 'monitor-heartbeat');
const MAX_LINES = 20000;

// 读进程用 execFileSync（参数数组，避开 shell 引号转义问题）
function listMonitorPids() {
  const ps = 'Get-CimInstance Win32_Process | Where-Object { $_.Name -eq \'node.exe\' -and $_.CommandLine -match \'monitor-server.js\' } | Select-Object -ExpandProperty ProcessId';
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 15000 });
    return out.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
  } catch (e) {
    return { error: String(e.message).slice(0, 120) };
  }
}

function heartbeatAgeSec() {
  try { return Math.round((Date.now() - parseInt(fs.readFileSync(HEARTBEAT, 'utf8'), 10)) / 1000); }
  catch (e) { return null; }
}

function main() {
  const pids = listMonitorPids();
  const rec = {
    ts: new Date().toISOString(),
    monitorCount: Array.isArray(pids) ? pids.length : null,
    pids,
    heartbeatAgeSec: heartbeatAgeSec()
  };
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, `${JSON.stringify(rec)}\n`);
    // 简单滚动，避免无限增长
    const lines = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean);
    if (lines.length > MAX_LINES) { fs.writeFileSync(LOG, `${lines.slice(-MAX_LINES / 2).join('\n')}\n`); }
  } catch (e) { /* 观测失败不阻塞 */ }
  console.log(JSON.stringify(rec));
}

main();
