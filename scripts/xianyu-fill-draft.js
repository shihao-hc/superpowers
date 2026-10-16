#!/usr/bin/env node
/**
 * xianyu-fill-draft.js — 闲鱼「发闲置」填草稿 PoC（填表验证，绝不点发布）
 *
 * 复用已登录的本地 profile（见 xianyu-poc.js），打开 /publish：
 *   1) 探测表单真实元素（textarea / contenteditable / file / text input）
 *   2) 用样例文案填入「描述」+「价格」
 *   3) 读回字段值 + 截图验证
 *   绝不点击[发布]，绝不提交。
 *
 * 用法:
 *   node scripts/xianyu-fill-draft.js           探测 + 填草稿 + 读回
 *   node scripts/xianyu-fill-draft.js --probe   只探测，不填
 *   node scripts/xianyu-fill-draft.js --dir=<路径>
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const getArg = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null; };
const probeOnly = args.includes('--probe');
const profileDir = getArg('dir') || path.join(ROOT, 'data', 'xianyu-profile');
const imagePath = getArg('image') || path.join(ROOT, 'service', 'data-report', 'cover', '首图-对比.png');
const priceVal = getArg('price') || '50';
const shipLabel = getArg('ship') || '无需邮寄';

const DRAFT_DESC = [
  '【能做什么】表格太乱不想整理？多个表格要合并？每个月重复做同一张报表？我用脚本+AI帮你快速搞定。',
  '【常见需求】多表合并、数据清洗（统一日期/金额去符号/去重复）、分组汇总、透视表、图表、重复报表自动化。',
  '【交付】清洗/汇总类当天交付；交付内容：处理好的Excel+操作说明。先发前100行样本，看完报价，合适开工。'
].join('\n');

const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null;
const log = (...a) => console.log(...a);

async function probe(page) {
  return page.evaluate(() => {
    const q = (s) => [...document.querySelectorAll(s)];
    const info = (el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      cls: String(el.className || '').slice(0, 50),
      ph: el.getAttribute('placeholder') || '',
      ce: el.getAttribute('contenteditable') || '',
      txt: (el.innerText || el.value || '').toString().slice(0, 40)
    });
    return {
      textareas: q('textarea').map(info),
      editables: q('[contenteditable="true"],[contenteditable=""]').map(info),
      files: q('input[type="file"]').map(info),
      textInputs: q('input[type="text"],input:not([type])').map(info),
      radios: q('input[type="radio"]').map((el) => {
        let label = (el.closest('label') || {}).innerText || '';
        if (!label && el.parentElement) { label = el.parentElement.innerText || ''; }
        return { checked: el.checked, label: label.replace(/\s+/g, ' ').trim().slice(0, 30) };
      }),
      addrEls: q('[class*="address"],[class*="Address"],[class*="location"],[class*="Location"],[class*="region"],[class*="city"]')
        .slice(0, 8).map(info),
      buttons: q('button').map((b) => (b.innerText || '').trim()).filter(Boolean).slice(0, 20)
    };
  });
}

async function readBack(page) {
  return page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input[type="text"]')].map((i) => i.value);
    const ta = document.querySelector('textarea');
    const ce = document.querySelector('[contenteditable="true"]');
    return {
      priceInputs: inputs,
      textarea: ta ? ta.value : null,
      editable: ce ? (ce.innerText || '').slice(0, 120) : null,
      bodyHasDesc: document.body.innerText.includes('多表合并'),
      radiosChecked: [...document.querySelectorAll('input[type="radio"]')].filter((r) => r.checked)
        .map((r) => { const w = r.closest('label') || r.parentElement; return (w ? w.innerText : '').replace(/\s+/g, ' ').trim().slice(0, 20); }),
      imgCount: [...document.querySelectorAll('img')].filter((i) => i.src && (i.src.startsWith('blob:') || i.src.includes('alicdn') || i.src.includes('goofish'))).length
    };
  });
}

async function main() {
  const { chromium } = require('playwright');
  fs.mkdirSync(profileDir, { recursive: true });
  const shotDir = path.join(ROOT, 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true });

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
    await page.goto('https://www.goofish.com/publish', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    if (page.url().includes('/login') || (await page.evaluate(() => document.body.innerText.includes('立即登录')))) {
      log('❌ 当前未登录（profile 登录态失效）→ 请先跑 node scripts/xianyu-poc.js 扫码登录');
      return;
    }

    log('\n===== 1) 表单元素探测 =====');
    const p = await probe(page);
    log(JSON.stringify(p, null, 2));

    if (probeOnly) { log('\n(--probe 模式，未填表)'); return; }

    log('\n===== 2) 填草稿（不发布）=====');
    const report = {};

    // 图片：上传首图到 file input
    if (fs.existsSync(imagePath) && await page.$('input[type="file"]')) {
      await page.locator('input[type="file"]').first().setInputFiles(imagePath);
      report.image = `uploaded ${path.basename(imagePath)}`;
      await page.waitForTimeout(2500);
    } else {
      report.image = await page.$('input[type="file"]') ? `skip(缺文件 ${imagePath})` : 'NOT FOUND';
    }

    // 描述：优先 textarea，其次 contenteditable（闲鱼为富文本）
    if (await page.$('textarea')) {
      await page.locator('textarea').first().fill(DRAFT_DESC);
      report.desc = 'textarea filled';
    } else if (await page.$('[contenteditable="true"]')) {
      const el = page.locator('[contenteditable="true"]').first();
      await el.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      await page.keyboard.insertText(DRAFT_DESC);
      report.desc = 'contenteditable filled';
    } else {
      report.desc = 'NOT FOUND';
    }

    // 价格：第一个 placeholder 为 0.00 的 text input
    const priceInput = page.locator('input[placeholder="0.00"]').first();
    if (await priceInput.count()) {
      await priceInput.fill(priceVal);
      report.price = `filled ${priceVal}`;
    } else if (await page.locator('input[type="text"]').count()) {
      await page.locator('input[type="text"]').first().fill(priceVal);
      report.price = `first text input = ${priceVal}`;
    } else {
      report.price = 'NOT FOUND';
    }

    // 发货设置：点击标签含 shipLabel 的 radio
    const shipClicked = await page.evaluate((label) => {
      const radios = [...document.querySelectorAll('input[type="radio"]')];
      for (const r of radios) {
        const wrap = r.closest('label') || r.parentElement;
        const t = (wrap ? wrap.innerText : '').replace(/\s+/g, ' ').trim();
        if (t.includes(label)) { wrap.click(); return t; }
      }
      return null;
    }, shipLabel);
    report.shipping = shipClicked ? `clicked "${shipClicked}"` : `NOT FOUND(${shipLabel})`;

    await page.waitForTimeout(2000);

    log('\n===== 3) 读回验证 =====');
    const rb = await readBack(page);
    log(JSON.stringify(rb, null, 2));
    log(`\n填入动作: ${JSON.stringify(report)}`);

    const shot = path.join(shotDir, `xianyu-draft-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    log(`截图: ${shot}`);
    log('\n⚠️ 脚本不会点发布。你可在窗口内核对后自行点[发布]。');

    // 保持窗口打开，等你在场操作（点发布后 URL 会离开 /publish → 自动识别）
    const holdSec = Number(getArg('hold')) || 10;
    log(`\n窗口保持 ${holdSec}s（最多 ${Math.round(holdSec / 60)} 分钟）…`);
    const t0 = Date.now();
    let published = false;
    while (Date.now() - t0 < holdSec * 1000) {
      await new Promise((r) => setTimeout(r, 2000));
      const u = page.url();
      if (!u.includes('/publish')) { published = true; break; }
    }
    log(published ? '🎉 检测到页面离开发闲置页（可能已发布/跳转）' : '⏱️ 保持时间到，未检测到发布');
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((e) => { console.error('[fill-draft] 异常:', e.message); process.exit(1); });
