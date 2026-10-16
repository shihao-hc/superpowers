#!/usr/bin/env node
/**
 * xianyu-covers.js — 批量生成闲鱼上架首图（多 listing 用，1:1）
 *
 * 与 xianyu-cover.js（单张「原始vs成品对比图」）互补：
 *   本脚本按「listing 角度」生成不同卖点的首图，供多 listing 铺货使用。
 *   纯本地 HTML → 截图 PNG，无风控、无网络。
 *
 * 用法:
 *   node scripts/xianyu-covers.js                生成全部（B 清洗 / C 自动化）
 *   node scripts/xianyu-covers.js --only=B       只生成指定
 *   node scripts/xianyu-covers.js --w=1080 --h=1080
 *   node scripts/xianyu-covers.js --out=目录     指定输出目录（默认 service/data-report/cover）
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const getArg = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null; };
const W = Number(getArg('w')) || 1080;
const H = Number(getArg('h')) || 1080;
const only = (getArg('only') || '').toUpperCase();
const outDir = getArg('out') || path.join(ROOT, 'service', 'data-report', 'cover');
fs.mkdirSync(outDir, { recursive: true });

const BASE_CSS = `
  * { margin:0; padding:0; box-sizing:border-box; font-family:"Microsoft YaHei","微软雅黑",sans-serif; }
  body { width:${W}px; height:${H}px; background:#f4f6fb; display:flex; flex-direction:column; padding:56px; }
  .brand { font-size:30px; color:#8a94a6; letter-spacing:2px; margin-bottom:8px; }
  h1 { font-size:${Math.round(W * 0.066)}px; color:#1f2a44; line-height:1.12; }
  h1 em { color:#4472C4; font-style:normal; }
  .sub { font-size:30px; color:#5b6478; margin-top:16px; }
  .foot { margin-top:auto; display:flex; justify-content:space-between; align-items:center; }
  .foot .big { font-size:38px; font-weight:800; color:#1f2a44; }
  .foot .big em { color:#ef6c1a; font-style:normal; }
  .foot .note { font-size:24px; color:#8a94a6; }
`;

// ---------- B: 数据清洗（聚焦「乱数据变规范」）----------
function htmlClean() {
  const fixes = [
    ['日期乱七八糟', '2026/3/1 · 2026-03-01 · 2026.3.5 · 2026年3月9日', '统一为 2026-03-01'],
    ['金额带符号千分位', '¥1,188.00 · ￥1,000 · 1,980.00', '统一为数字 1188'],
    ['空格 / 重复 / 空行', '「 朝阳店 」· 重复行 · 空行', '去空格 · 去重复 · 删空行'],
    ['编号前导零丢失', '00123 → 123（错）', '保留为「00123」']
  ];
  const rows = fixes.map((f, i) => `
    <div class="fix ${i % 2 ? 'alt' : ''}">
      <div class="k">${f[0]}</div>
      <div class="bad">${f[1]}</div>
      <div class="arrow">→</div>
      <div class="good">${f[2]}</div>
    </div>`).join('');
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><style>${BASE_CSS}
    h1 { font-size:${Math.round(W * 0.062)}px; }
    .fixes { margin-top:44px; background:#fff; border-radius:20px; box-shadow:0 12px 34px rgba(31,42,68,.12); padding:20px 34px; flex:1; }
    .fix { display:grid; grid-template-columns:230px 1fr 60px 340px; align-items:center; gap:14px; padding:22px 0; border-bottom:1px solid #eef1f6; }
    .fix:last-child { border-bottom:none; }
    .fix.alt { background:#fafbfe; }
    .k { font-size:25px; font-weight:700; color:#1f2a44; }
    .bad { font-size:23px; color:#c0554f; }
    .good { font-size:24px; font-weight:700; color:#2e7d4f; }
    .arrow { font-size:30px; color:#b8c0d0; text-align:center; }
  </style></head><body>
    <div class="brand">EXCEL 数据处理服务</div>
    <h1>Excel <em>数据清洗</em> · 表格整理</h1>
    <div class="sub">乱数据 → 规范表 · 日期统一 · 金额转数字 · 去重复 · 删空行 · 当天交付</div>
    <div class="fixes">${rows}</div>
    <div class="foot">
      <div class="big">脏乱表交给我 → <em>当天出干净表</em></div>
      <div class="note">先发样本 · 看完报价 · 合适开工</div>
    </div>
  </body></html>`;
}

// ---------- C: 月度报表自动化（聚焦「一次配置，每月几秒」）----------
function htmlAuto() {
  const steps = [
    ['1', '一次配置', '梳理好你的报表逻辑，配好汇总规则'],
    ['2', '每月一键', '把当月数据丢进来，运行一次'],
    ['3', '几秒出新表', '格式/公式/汇总自动套用，直接能用']
  ];
  const cards = steps.map((s, i) => `
    <div class="step ${i === 2 ? 'hot' : ''}">
      <div class="num">${s[0]}</div>
      <div class="st">${s[1]}</div>
      <div class="sd">${s[2]}</div>
    </div>`).join('<div class="jd">›</div>');
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><style>${BASE_CSS}
    h1 { font-size:${Math.round(W * 0.062)}px; }
    .flow { display:flex; align-items:stretch; gap:14px; margin-top:52px; flex:1; }
    .step { flex:1; background:#fff; border-radius:20px; box-shadow:0 12px 34px rgba(31,42,68,.12); padding:34px 24px; display:flex; flex-direction:column; }
    .step.hot { background:linear-gradient(160deg,#4472C4,#2f5bb0); }
    .step.hot .st, .step.hot .sd { color:#fff; }
    .step.hot .num { background:#fff; color:#4472C4; }
    .num { width:64px; height:64px; border-radius:50%; background:#eaeffb; color:#4472C4; font-size:36px; font-weight:800; display:flex; align-items:center; justify-content:center; margin-bottom:22px; }
    .st { font-size:34px; font-weight:800; color:#1f2a44; margin-bottom:14px; }
    .sd { font-size:24px; color:#6b7488; line-height:1.5; }
    .jd { align-self:center; font-size:40px; color:#b8c0d0; font-weight:800; }
    .save { margin-top:34px; background:#fff5ee; border:2px solid #ffd9bf; border-radius:16px; padding:24px 30px; font-size:29px; color:#9a4b12; text-align:center; }
    .save b { color:#ef6c1a; }
  </style></head><body>
    <div class="brand">EXCEL 报表自动化</div>
    <h1>每月重复的报表<br><em>一次配置就够了</em></h1>
    <div class="sub">多表合并 · 月度汇总 · 一键出表 · 模板定制</div>
    <div class="flow">${cards}</div>
    <div class="save">每月手动做 <b>3 小时</b> → 现在 <b>几秒出新表</b>（可签月包）</div>
    <div class="foot">
      <div class="big">拒绝重复劳动 → <em>一次搭建，长期省时</em></div>
      <div class="note">先聊清需求 · 报价后开工</div>
    </div>
  </body></html>`;
}

const VARIANTS = [
  { key: 'B', file: '首图B-数据清洗.png', html: htmlClean },
  { key: 'C', file: '首图C-报表自动化.png', html: htmlAuto }
];

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const results = [];
  try {
    const targets = only ? VARIANTS.filter((v) => v.key === only) : VARIANTS;
    if (!targets.length) { console.error(`未知 --only=${only}（可选 B / C）`); process.exit(1); }
    for (const v of targets) {
      const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      await page.setContent(v.html(), { waitUntil: 'load' });
      await page.waitForTimeout(350);
      const diag = await page.evaluate(() => {
        const foot = document.querySelector('.foot');
        return { scrollH: document.body.scrollHeight, footBottom: foot ? Math.round(foot.getBoundingClientRect().bottom) : -1 };
      });
      const outFile = path.join(outDir, v.file);
      await page.screenshot({ path: outFile, clip: { x: 0, y: 0, width: W, height: H } });
      await page.close();
      const ok = diag.footBottom > 0 && diag.footBottom <= H && diag.scrollH <= H + 2;
      results.push({ file: v.file, ok, footBottom: diag.footBottom, scrollH: diag.scrollH, size: fs.statSync(outFile).size });
      console.log(`${ok ? '✅' : '⚠️'} ${v.file} — 内容高=${diag.scrollH} 页脚底=${diag.footBottom} (画布 ${H}) ${(fs.statSync(outFile).size / 1024).toFixed(1)}KB`);
    }
  } finally {
    await browser.close();
  }
  const bad = results.filter((r) => !r.ok);
  console.log(bad.length ? `\n⚠️ ${bad.length} 张可能溢出，请调整字号/间距` : `\n✅ 全部 ${results.length} 张未溢出，输出目录: ${outDir}`);
})().catch((e) => { console.error('生成失败:', e.message); process.exit(1); });
