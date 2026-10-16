#!/usr/bin/env node
/**
 * xianyu-poc.js — 闲鱼网页版「可自动化程度」PoC（验证，不承诺可用）
 *
 * 目的：用真实浏览器验证——登录闲鱼网页版后，AI 能否代操作「发闲置」等流程，
 * 以及在哪一步被风控/登录墙卡住。用真实结果代替拍脑袋。
 *
 * 前提：用户本人在弹出的浏览器里扫码登录（脚本不碰账号密码，只复用登录后的本地会话）。
 *
 * 用法:
 *   node scripts/xianyu-poc.js                打开浏览器等你扫码登录 → 自动检测 → dump 发闲置页
 *   node scripts/xianyu-poc.js --wait=240     登录最多等 240 秒（默认 180）
 *   node scripts/xianyu-poc.js --no-wait      不等待登录，直接 dump 当前 /publish（机械自检用）
 *   node scripts/xianyu-poc.js --inspect      复用已存在的登录 profile，直接 dump
 *   node scripts/xianyu-poc.js --headless     无头（默认有头，方便你扫码/过验证）
 *   node scripts/xianyu-poc.js --dir=<路径>   profile 目录（默认 data/xianyu-profile）
 *
 * 安全：profile 含登录 Cookie，存放于 gitignore 的目录，绝不提交；只读页面结构，不自动提交任何发布。
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const getArg = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null; };
const has = (k) => args.includes(`--${k}`) || args.some((x) => x.startsWith(`--${k}=`));

const profileDir = getArg('dir') || path.join(ROOT, 'data', 'xianyu-profile');
const waitSec = Number(getArg('wait')) || 180;
const noWait = has('no-wait');
const headless = has('headless');

const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null;

function log(...a) { console.log(...a); }

async function dumpPublish(page) {
  const data = await page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const inputs = [...document.querySelectorAll('input,textarea,select')]
      .filter(vis)
      .map((f) => ({ tag: f.tagName.toLowerCase(), type: f.type || '', name: f.name || '', id: f.id || '', ph: f.placeholder || '', accept: f.accept || '' }))
      .slice(0, 40);
    const buttons = [...document.querySelectorAll('button,a[role=button],[class*=btn],[class*=Btn]')]
      .filter(vis)
      .map((b) => (b.innerText || '').trim())
      .filter((t) => t && t.length <= 12)
      .slice(0, 40);
    const text = (document.body ? document.body.innerText : '').trim();
    return { url: location.href, title: document.title, inputs, buttons, textLength: text.length, textPreview: text.slice(0, 400) };
  });
  return data;
}

async function main() {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { log('需要 playwright:', e.message); process.exit(1); }

  fs.mkdirSync(profileDir, { recursive: true });
  const shotDir = path.join(ROOT, 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true });

  log(`[PoC] profile: ${profileDir}`);
  log(`[PoC] 启动浏览器（${headless ? '无头' : '有头'}）…`);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    viewport: { width: 1280, height: 820 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
    ...(PROXY ? { proxy: { server: PROXY } } : {})
  });
  context.setDefaultTimeout(30000);

  let page = context.pages()[0] || await context.newPage();

  async function checkLoggedIn() {
    // /publish 未登录时不重定向，而是内联显示「立即登录」——用页面标记判断（确定性）
    const p = await context.newPage();
    try {
      await p.goto('https://www.goofish.com/publish', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await p.waitForTimeout(1800);
      const txt = await p.evaluate(() => (document.body ? document.body.innerText : ''));
      const loggedIn = !txt.includes('立即登录') && !txt.includes('登录后可以更懂你');
      return { loggedIn, url: p.url(), preview: txt.replace(/\s+/g, ' ').slice(0, 70) };
    } catch (e) {
      return { loggedIn: false, url: `ERR:${String(e.message).slice(0, 60)}` };
    } finally {
      await p.close().catch(() => {});
    }
  }

  try {
    if (!noWait && !has('inspect')) {
      await page.goto('https://www.goofish.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      log('');
      log('========================================================');
      log('  请在弹出的浏览器里：点右上角「登录」→ 用手机闲鱼/淘宝扫码');
      log(`  脚本会自动检测登录成功（最多等 ${waitSec} 秒）`);
      log('========================================================');
      log('');

      const start = Date.now();
      let ok = false;
      let streak = 0;
      while (Date.now() - start < waitSec * 1000) {
        const r = await checkLoggedIn();
        if (r.loggedIn) {
          streak += 1;
          log(`[PoC] 检测到登录态 (${streak}/2) … ${r.preview}`);
          if (streak >= 2) { ok = true; log(`[PoC] ✅ 确认已登录（${Math.round((Date.now() - start) / 1000)}s）`); break; }
        } else {
          streak = 0;
        }
        await new Promise((res) => setTimeout(res, 3000));
      }
      if (!ok) {
        const cookies = await context.cookies().catch(() => []);
        log(`[PoC] ⏱️ ${waitSec}s 内未检测到登录。当前 cookie 名: ${cookies.map((c) => c.name).join(', ').slice(0, 300)}`);
      }
    }

    // 打开发闲置页并 dump
    log('[PoC] 打开 https://www.goofish.com/publish …');
    page = context.pages().find((p) => /goofish/.test(p.url())) || page;
    await page.goto('https://www.goofish.com/publish', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);

    const shotPath = path.join(shotDir, `xianyu-publish-${Date.now()}.png`);
    await page.screenshot({ path: shotPath, fullPage: false }).catch(() => {});

    let data;
    try { data = await dumpPublish(page); } catch (e) { data = { error: e.message }; }

    log('');
    log('================= 发闲置页 真实结构 =================');
    log(JSON.stringify(data, null, 2));
    log(`截图: ${shotPath}`);
    log('===================================================');
    log('');
    log('结论口径：若 inputs 里有「标题/描述/价格」类字段 → 网页版可自动化填表；');
    log('         若被重定向 /login 或结构为空 → 登录墙/风控拦截，需 App 或人工。');
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => { console.error('[PoC] 异常:', e.message); process.exit(1); });
