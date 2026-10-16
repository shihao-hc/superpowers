#!/usr/bin/env node
/**
 * cost-report.js — opencode token 成本报表（"节流"的量化眼睛）
 *
 * 为什么有它：token 消耗"入不敷出"，但此前只能"凭感觉"。本工具从 opencode 自己的
 * 会话库读真实成本，把"今天烧了多少、谁在烧、烧在哪"变成可看见的数字——节流才可度量。
 *
 * 数据源：opencode 会话库（node:sqlite，只读，不写库）。
 *   路径优先级：环境变量 OPENCODE_DB > $XDG_DATA_HOME/opencode/opencode.db > D:/opencode-data/opencode/opencode.db
 * 成本口径：session.cost（opencode 记录的单位，随网关，可能为美元/积分）；按会话"最后活动日"归日（近似）。
 *
 * 用法:
 *   node scripts/cost-report.js                 今日 + 近 7 天 + 按模型 + Top 会话
 *   node scripts/cost-report.js --days=14       看近 14 天
 *   node scripts/cost-report.js --dir=龙虾       只看当前项目（按目录子串过滤）
 *   node scripts/cost-report.js --json          输出 JSON（给脚本/定时用）
 *   node scripts/cost-report.js --log           追加今日快照到 logs/cost-report.jsonl
 *
 * 节流第一杠杆：**短会话**（长会话每轮重发全部上下文，输入 token 滚到千万级 → 成本爆炸；
 * 实证：同样 flash 模型，马拉松会话 cost 10.8，短会话 0.05）。一个会话做一件事，做完就新开。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// node:sqlite 是实验特性，require 时打警告——报表工具不该被噪声干扰，require 前静音
const _origEmitWarning = process.emitWarning;
process.emitWarning = () => {};
let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  process.emitWarning = _origEmitWarning;
  console.log('本工具的数据库读取依赖 Node 内置 node:sqlite（需 Node >= 22）。当前版本不支持：', e.message);
  process.exit(1);
}
process.emitWarning = _origEmitWarning;

// ===== 参数 =====
const argv = process.argv.slice(2);
const days = Number((argv.find((a) => a.startsWith('--days=')) || '').split('=')[1]) || 7;
const dirFilter = (argv.find((a) => a.startsWith('--dir=')) || '').split('=')[1] || '';
const asJson = argv.includes('--json');
const doLog = argv.includes('--log');

function resolveDb() {
  if (process.env.OPENCODE_DB) return process.env.OPENCODE_DB;
  if (process.env.XDG_DATA_HOME) return path.join(process.env.XDG_DATA_HOME, 'opencode', 'opencode.db');
  return 'D:/opencode-data/opencode/opencode.db';
}

function localDay(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function modelId(model) {
  try { return JSON.parse(model).id; } catch { return model || '?'; }
}

function main() {
  const dbPath = resolveDb();
  if (!fs.existsSync(dbPath)) {
    console.log(`找不到 opencode 会话库: ${dbPath}`);
    console.log('可用 OPENCODE_DB 环境变量指定，例如: OPENCODE_DB=D:/opencode-data/opencode/opencode.db');
    process.exit(1);
  }

  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch (e) {
    console.log('打开会话库失败（可能被占用/正在写入）:', e.message);
    process.exit(1);
  }

  let rows;
  try {
    rows = db.prepare(
      'SELECT title, directory, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, time_created, time_updated FROM session'
    ).all();
  } catch (e) {
    console.log('查询会话表失败:', e.message);
    process.exit(1);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }

  if (dirFilter) rows = rows.filter((r) => (r.directory || '').includes(dirFilter));

  const todayStr = localDay(Date.now());
  const dayMap = {};
  const modelMap = {};
  let today = { cost: 0, sessions: 0, tin: 0, tout: 0 };
  let grand = { cost: 0, sessions: 0, tin: 0, tout: 0 };
  const priced = rows.filter((r) => (r.cost || 0) > 0);

  for (const r of priced) {
    const c = r.cost || 0;
    const day = localDay(r.time_updated || r.time_created);
    const m = modelId(r.model);
    dayMap[day] = dayMap[day] || { cost: 0, sessions: 0 };
    dayMap[day].cost += c; dayMap[day].sessions++;
    modelMap[m] = modelMap[m] || { cost: 0, sessions: 0 };
    modelMap[m].cost += c; modelMap[m].sessions++;
    grand.cost += c; grand.sessions++;
    grand.tin += r.tokens_input || 0; grand.tout += r.tokens_output || 0;
    if (day === todayStr) {
      today.cost += c; today.sessions++;
      today.tin += r.tokens_input || 0; today.tout += r.tokens_output || 0;
    }
  }

  const recentDays = Object.keys(dayMap).sort().reverse().slice(0, days);
  const topSessions = [...priced].sort((a, b) => (b.cost || 0) - (a.cost || 0)).slice(0, 5);

  const report = {
    generatedAt: new Date().toISOString(),
    dbPath,
    dirFilter: dirFilter || null,
    note: 'cost 单位为 opencode 记录值（随网关，可能为美元/积分）；按会话最后活动日归日（近似）',
    today: { date: todayStr, ...today },
    recentDays: recentDays.map((d) => ({ date: d, ...dayMap[d] })),
    byModel: Object.keys(modelMap).map((m) => ({ model: m, ...modelMap[m] })).sort((a, b) => b.cost - a.cost),
    topSessions: topSessions.map((r) => ({
      cost: Number((r.cost || 0).toFixed(4)),
      inputTokens: r.tokens_input || 0,
      model: modelId(r.model),
      title: String(r.title || '').slice(0, 50)
    })),
    total: grand
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const f = (n) => (n || 0).toFixed(2);
    console.log('=== opencode 成本报表 ===');
    console.log(`数据源: ${dbPath}${dirFilter ? `  (过滤目录含 "${dirFilter}")` : ''}`);
    console.log('');
    console.log(`今日 (${todayStr}): cost=${f(today.cost)}  会话=${today.sessions}  输入=${today.tin}  输出=${today.tout}`);
    console.log('');
    console.log(`近 ${recentDays.length} 天:`);
    for (const d of recentDays) {
      console.log(`  ${d}  cost=${f(dayMap[d].cost)}  会话=${dayMap[d].sessions}`);
    }
    console.log('');
    console.log('按模型（全部）:');
    for (const m of report.byModel) console.log(`  ${m.model.padEnd(24)} cost=${f(m.cost)}  会话=${m.sessions}`);
    console.log('');
    console.log('最贵的 5 个会话:');
    for (const s of report.topSessions) console.log(`  ${String(s.cost).padEnd(8)} in=${String(s.inputTokens).padEnd(10)} ${s.model}  | ${s.title}`);
    console.log('');
    console.log(`合计: cost=${f(grand.cost)}  会话=${grand.sessions}  输入=${grand.tin}  输出=${grand.tout}`);
    console.log('');
    console.log('节流第一杠杆 = 短会话：一个会话做一件事，做完新开（长会话每轮重发全部上下文，成本滚雪球）。');
  }

  if (doLog) {
    try {
      const dir = path.join(ROOT, 'logs');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'cost-report.jsonl'), JSON.stringify(report) + '\n');
      if (!asJson) console.log(`\n[已记录] logs/cost-report.jsonl (${todayStr})`);
    } catch (e) {
      if (!asJson) console.log('\n[记录失败]', e.message);
    }
  }
}

main();
