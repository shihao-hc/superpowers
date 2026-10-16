#!/usr/bin/env node
/**
 * xianyu-polish.js — 闲鱼「擦亮」助手（半自动 / 每日）
 *
 * 背景（真机探索结论，2026-10-17）：
 *   - 闲鱼网页版 **没有** 擦亮按钮（/personal 只列宝贝，无任何管理/擦亮入口；
 *     seller.goofish.com = 禁止访问；m.goofish.com 连不上；h5 根路径 404）。
 *   - 擦亮 UI 只在 App（我的 → 我发布的 → 一键擦亮宝贝）。
 *   - 但擦亮底层是 mtop 接口 `mtop.taobao.idle.item.polish`，可由「已登录会话」调用
 *     （参考 zhinianboke/xianyu-auto-reply 的定时擦亮 + nite07 goofish 技能）。
 *
 * 本脚本做法：复用 data/xianyu-profile 登录态，在 goofish 页面内用 fetch 调 mtop
 *   （同源 cookie、自动处理 Set-Cookie 刷新 token），逐个宝贝擦亮 —— 无头会被风控拦，用有头。
 *
 * 安全：只做「擦亮」这一项低危动作（不发布/不删除/不改价）；写操作由人手动触发（本脚本即触发）。
 *       profile 含登录 Cookie，存放于 gitignore 目录，绝不提交。
 *
 * 用法:
 *   node scripts/xianyu-polish.js --probe     只读：登录检测 + 拉取我的宝贝列表（打印原始结构）
 *   node scripts/xianyu-polish.js --dry       预演：列出将擦亮的宝贝，不发请求
 *   node scripts/xianyu-polish.js             执行擦亮（每个宝贝一次，间隔 2.5s）
 *   node scripts/xianyu-polish.js --dir=<路径>       profile 目录（默认 data/xianyu-profile）
 *   node scripts/xianyu-polish.js --max=3            只擦前 N 个（默认全部）
 *   node scripts/xianyu-polish.js --hold=30          结束前保持窗口秒数（默认 8）
 *
 * 参考：mtop h5 请求形状 / sign 算法 / ret 语义 见
 *   https://git.nite07.com/nite/skills/.../goofish-browsing/references/mtop-apis.md
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const getArg = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null; };
const has = (k) => args.includes(`--${k}`);

const profileDir = getArg('dir') || path.join(ROOT, 'data', 'xianyu-profile');
const holdSec = Number(getArg('hold')) || 8;
const maxItems = Number(getArg('max')) || Infinity;
const APP_KEY = '34839810';
const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null;
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const REQUEST_PRELUDE = 'a21ybx.personal.feeds.1.';

// 淘宝 mtop 协议签名算法固定为 MD5（sign = md5(token&t&appKey&data)）——协议要求，非安全敏感哈希，不可替换为 sha256
const MTOP_SIGN_ALGORITHM = 'md5';
function mtopSign(preimage) {
  return crypto.createHash(MTOP_SIGN_ALGORITHM).update(preimage, 'utf8').digest('hex');
}

async function isLoggedIn(page) {
  const txt = await page.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => '');
  return !txt.includes('立即登录') && !txt.includes('登录后可以更懂你');
}

// 在 goofish 页面内用 fetch 调 mtop（同源带 cookie；浏览器自动更新 Set-Cookie）
async function mtop(page, { api, version, dataObj, spmCnt }) {
  const cookies = await page.context().cookies();
  const jar = Object.fromEntries(cookies.map((c) => [c.name, c.value]));
  const token = String(jar['_m_h5_tk'] || '').split('_')[0];
  if (!token) {throw new Error('Cookie 中无 _m_h5_tk（登录态异常，请重新扫码）');}

  const t = Date.now().toString();
  const dataVal = JSON.stringify(dataObj);
  const sign = mtopSign(`${token}&${t}&${APP_KEY}&${dataVal}`);
  const params = {
    jsv: '2.7.2', appKey: APP_KEY, t, sign, v: version, type: 'originaljson',
    accountSite: 'xianyu', dataType: 'json', timeout: '20000', api,
    sessionOption: 'AutoLoginOnly', spm_cnt: spmCnt || 'a21ybx.item.0.0'
  };
  const url = `https://h5api.m.goofish.com/h5/${api}/${version}/?${new URLSearchParams(params).toString()}`;
  const body = `data=${encodeURIComponent(dataVal)}`;

  const out = await page.evaluate(async ({ url, body }) => {
    try {
      const r = await fetch(url, {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/x-www-form-urlencoded' }, body
      });
      const text = await r.text();
      try { return { status: r.status, json: JSON.parse(text) }; }
      catch { return { status: r.status, text: text.slice(0, 400) }; }
    } catch (e) { return { error: String(e.message).slice(0, 160) }; }
  }, { url, body });
  return out;
}

// 调一次 + 令牌过期自动重试一次（读重试前刷新后的 cookie）
async function mtopRetry(page, opts) {
  let r = await mtop(page, opts);
  const ret = (r && r.json && r.json.ret) || [];
  if (ret.some((x) => /TOKEN_EXOIRED|TOKEN_EXPIRED|SESSION_EXPIRED/i.test(x))) {
    await sleep(800);
    r = await mtop(page, opts);
  }
  return r;
}

function getUnb(cookies) { const j = Object.fromEntries(cookies.map((c) => [c.name, c.value])); return j['unb'] || null; }

// 收集节点内所有 label 文本（itemLabelDataVO.labelData.<rN>.tagList[].data.content）
function collectLabels(node) {
  const labels = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') {return;}
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (Array.isArray(n.tagList)) {
      for (const tag of n.tagList) { const c = tag && tag.data && tag.data.content; if (c && typeof c === 'string') {labels.push(c);} }
    }
    for (const k of Object.keys(n)) {walk(n[k]);}
  };
  walk(node);
  return [...new Set(labels)];
}

// 从商品列表响应里提取 [{itemId, title, labels, status}]
function extractItems(json) {
  const out = [];
  const seen = new Set();
  const push = (id, title, labels, status, raw) => {
    const key = String(id);
    if (!key || seen.has(key)) {return;}
    seen.add(key);
    out.push({ itemId: key, title: String(title || '').slice(0, 40), labels, status, raw });
  };
  const cards = json && json.data && json.data.cardList;
  if (Array.isArray(cards)) {
    for (const card of cards) {
      const cd = card.cardData || card;
      const dp = cd.detailParams || {};
      push(dp.itemId || cd.id, cd.title || dp.title, collectLabels(cd), cd.itemStatus, cd);
    }
    if (out.length) {return out;}
  }
  const walk = (node) => {
    if (!node || typeof node !== 'object') {return;}
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const id = node.itemId || node.idleItemId || node.item_id;
    const title = node.title || node.itemTitle;
    if (id && title) {push(id, title, collectLabels(node), node.itemStatus, node);}
    for (const k of Object.keys(node)) {walk(node[k]);}
  };
  walk(json && json.data);
  return out;
}

async function fetchMyItems(page) {
  const cookies = await page.context().cookies();
  const unb = getUnb(cookies);
  const dataObj = { needGroupInfo: true, pageNumber: 1, userId: unb || '', pageSize: 10 };
  const r = await mtopRetry(page, { api: 'mtop.idle.web.xyh.item.list', version: '1.0', dataObj, spmCnt: 'a21ybx.personal.0.0' });
  return { unb, r, items: extractItems(r.json) };
}

async function polishOne(page, itemId) {
  const r = await mtopRetry(page, {
    api: 'mtop.taobao.idle.item.polish', version: '2.0',
    dataObj: { itemId }, spmCnt: `${REQUEST_PRELUDE}0.0`
  });
  const ret = (r && r.json && r.json.ret && r.json.ret[0]) || (r.error ? `ERR:${r.error}` : '未知');
  let verdict;
  if (/SUCCESS/.test(ret)) {verdict = 'ok';}
  else if (/IDLEITEM_POLISH_AGAIN|宝贝已经擦亮过了|一天只能擦亮一次|POLISH_DUPLICATE/.test(ret)) {verdict = 'already';}
  else if (/UNSUPPORTED_ITEM_STATUS|已下架/.test(ret)) {verdict = 'delisted';}
  else if (/USER_VALIDATE|RGV587|punish|哎哟喂|ILLEGAL_ACCESS/.test(ret)) {verdict = 'risk';}
  else if (/TOKEN_EXOIRED|TOKEN_EXPIRED|SESSION_EXPIRED|请重新登录/.test(ret)) {verdict = 'session';}
  else {verdict = 'fail';}
  return { ret, verdict };
}

function appendLog(entry) {
  try {
    const dir = path.join(ROOT, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'xianyu-polish.jsonl'), `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
  } catch (e) { log(`(日志写入失败: ${e.message})`); }
}

async function main() {
  const { chromium } = require('playwright');
  fs.mkdirSync(profileDir, { recursive: true });
  const shotDir = path.join(ROOT, 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true });

  log(`[polish] profile: ${profileDir}`);
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
    ...(PROXY ? { proxy: { server: PROXY } } : {})
  });
  context.setDefaultTimeout(30000);
  const page = context.pages()[0] || await context.newPage();

  try {
    await page.goto('https://www.goofish.com/personal', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    if (!(await isLoggedIn(page))) {
      log('❌ 未登录（profile 登录态失效）→ 请先跑 node scripts/xianyu-poc.js 扫码登录');
      log('   窗口保持 120s 等你登录…');
      const t0 = Date.now();
      while (Date.now() - t0 < 120000) {
        await sleep(3000);
        await page.goto('https://www.goofish.com/personal', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        if (await isLoggedIn(page)) { log('✅ 检测到登录'); break; }
      }
      if (!(await isLoggedIn(page))) { log('⏱️ 仍未登录，退出'); return; }
    } else {
      log('✅ 登录态有效');
    }

    // 1) 拉我的宝贝列表
    log('\n===== 1) 读取我的宝贝 =====');
    const { unb, r, items } = await fetchMyItems(page);
    if (r.error) { log(`❌ 商品列表请求失败: ${r.error}`); return; }
    const listRet = (r.json && r.json.ret && r.json.ret[0]) || '(无 ret)';
    log(`unb=${unb || '(缺失)'}  item.list ret=${listRet}  解析到 ${items.length} 个宝贝`);
    for (const it of items) {log(`  - ${it.itemId}  ${it.title}  [${it.labels.join(' | ') || '无标签'}]`);}

    if (has('probe')) {
      log('\n===== (--probe) 原始商品列表响应 =====');
      log(JSON.stringify(r.json, null, 2).slice(0, 4000));
      return;
    }
    if (!items.length) { log('⚠️ 未解析到宝贝（可能字段结构变化，用 --probe 看原始 JSON）'); return; }

    const todo = items.slice(0, maxItems === Infinity ? items.length : maxItems);

    if (has('dry')) {
      log(`\n===== (--dry) 将擦亮 ${todo.length} 个宝贝（不发送请求）=====`);
      for (const it of todo) {log(`  [dry] ${it.itemId}  ${it.title}`);}
      log('去掉 --dry 即执行真实擦亮。');
      return;
    }

    // 2) 逐个擦亮
    log(`\n===== 2) 执行擦亮（${todo.length} 个，间隔 2.5s）=====`);
    const summary = { ok: 0, already: 0, delisted: 0, risk: 0, session: 0, fail: 0 };
    for (const it of todo) {
      const { ret, verdict } = await polishOne(page, it.itemId);
      summary[verdict] = (summary[verdict] || 0) + 1;
      const flag = verdict === 'ok' ? '✅' : verdict === 'already' ? '☑️' : verdict === 'risk' ? '🛑' : verdict === 'session' ? '🔒' : '⚠️';
      log(`  ${flag} ${it.itemId}  ${it.title}  → ${ret}`);
      appendLog({ itemId: it.itemId, title: it.title, verdict, ret });
      if (verdict === 'risk') { log('🛑 触发风控，立即停止（重试会加重风险）'); break; }
      if (verdict === 'session') { log('🔒 登录态失效，停止剩余（请重新扫码）'); break; }
      await sleep(2500);
    }

    log('\n===== 汇总 =====');
    log(`成功 ${summary.ok} · 今日已擦亮 ${summary.already} · 已下架 ${summary.delisted} · 风控 ${summary.risk} · 登录失效 ${summary.session} · 失败 ${summary.fail}`);
    const shot = path.join(shotDir, `xianyu-polish-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    log(`截图: ${shot}`);
  } finally {
    if (holdSec > 0) { log(`\n窗口保持 ${holdSec}s…`); await sleep(holdSec * 1000); }
    await context.close().catch(() => {});
  }
}

main().catch((e) => { console.error('[polish] 异常:', e.message); process.exit(1); });
