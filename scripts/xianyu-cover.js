#!/usr/bin/env node
/**
 * xianyu-cover.js — 生成闲鱼上架首图（原始 vs 成品 对比，1:1）
 *
 * 用 Playwright 渲染 HTML → 截图 PNG（不依赖人工截图）。纯本地 HTML，无风控。
 *
 * 用法:
 *   node scripts/xianyu-cover.js                生成 service/data-report/cover/首图-对比.png
 *   node scripts/xianyu-cover.js --out=路径     指定输出
 *   node scripts/xianyu-cover.js --w=1080 --h=1080
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const getArg = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null; };
const W = Number(getArg('w')) || 1080;
const H = Number(getArg('h')) || 1080;
const outDir = path.join(ROOT, 'service', 'data-report', 'cover');
fs.mkdirSync(outDir, { recursive: true });
const outFile = getArg('out') || path.join(outDir, '首图-对比.png');

// 原始（脏）数据
const dirtyRows = [
  ['2026/3/1', ' 朝阳店 ', 'A款', '12', '¥1,188.00'],
  ['2026-03-01', '海淀店', 'B款', '5', '￥1,000'],
  ['2026.3.5', ' 朝阳店 ', 'C款', '3', '¥451.50'],
  ['2026年3月9日', '海淀店 ', 'A款', '20', '1,980.00'],
  ['', '', '', '', '']
];
// 成品（干净汇总）
const cleanRows = [
  ['海淀店', '3,980.00', '30', '3'],
  ['西城店', '3,283.00', '17', '2'],
  ['朝阳店', '2,431.50', '23', '3'],
  ['东城店', '1,799.00', '3', '3']
];

const dirtyHtml = dirtyRows.map((r) => `<tr>${r.map((c) => `<td>${c || '&nbsp;'}</td>`).join('')}</tr>`).join('');
const cleanHtml = cleanRows.map((r, i) => `<tr class="${i % 2 ? 'alt' : ''}">${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');

const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:"Microsoft YaHei","微软雅黑",sans-serif; }
  body { width:${W}px; height:${H}px; background:#f4f6fb; display:flex; flex-direction:column; padding:56px; }
  .brand { font-size:30px; color:#8a94a6; letter-spacing:2px; margin-bottom:8px; }
  h1 { font-size:74px; color:#1f2a44; line-height:1.1; }
  h1 em { color:#4472C4; font-style:normal; }
  .sub { font-size:30px; color:#5b6478; margin-top:18px; }
  .panels { display:flex; gap:40px; margin-top:52px; flex:1; }
  .panel { flex:1; background:#fff; border-radius:20px; box-shadow:0 12px 34px rgba(31,42,68,.12); padding:30px; display:flex; flex-direction:column; }
  .tag { display:inline-block; font-size:26px; font-weight:700; color:#fff; padding:8px 20px; border-radius:999px; align-self:flex-start; margin-bottom:22px; }
  .bad { background:#d9534f; } .good { background:#2e9e5b; }
  table { width:100%; border-collapse:collapse; font-size:22px; }
  td { padding:10px 12px; border-bottom:1px solid #eef1f6; color:#3a4358; white-space:nowrap; overflow:hidden; }
  .panel.dirty td { color:#b0b6c3; }
  .panel.clean thead td { background:#4472C4; color:#fff; font-weight:700; border-bottom:none; }
  .panel.clean tr.alt td { background:#f7f9fd; }
  .arrow { position:absolute; }
  .foot { margin-top:40px; display:flex; justify-content:space-between; align-items:center; }
  .foot .big { font-size:38px; font-weight:800; color:#1f2a44; }
  .foot .big em { color:#ef6c1a; font-style:normal; }
  .foot .note { font-size:24px; color:#8a94a6; }
</style></head><body>
  <div class="brand">EXCEL 数据处理服务</div>
  <h1>Excel <em>表格代做</em> · 报表汇总</h1>
  <div class="sub">多表合并 · 数据清洗 · 分组汇总 · 透视图表 · 当天交付</div>
  <div class="panels">
    <div class="panel dirty">
      <span class="tag bad">原始 · 又乱又脏</span>
      <table><tbody>${dirtyHtml}</tbody></table>
    </div>
    <div class="panel clean">
      <span class="tag good">成品 · 干净报表</span>
      <table><thead><tr><td>门店</td><td>金额</td><td>数量</td><td>笔数</td></tr></thead><tbody>${cleanHtml}</tbody></table>
    </div>
  </div>
  <div class="foot">
    <div class="big">脏活累活交给我 → <em>30 分钟出结果</em></div>
    <div class="note">先发样本 · 看完报价 · 合适开工</div>
  </div>
</body></html>`;

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const diag = await page.evaluate(() => {
      const foot = document.querySelector('.foot');
      return {
        scrollH: document.body.scrollHeight,
        footBottom: foot ? Math.round(foot.getBoundingClientRect().bottom) : -1,
        title: (document.querySelector('h1') || {}).innerText || ''
      };
    });
    await page.screenshot({ path: outFile, clip: { x: 0, y: 0, width: W, height: H } });
    const size = fs.statSync(outFile).size;
    console.log(`✅ 首图已生成: ${outFile} (${W}x${H}, ${(size / 1024).toFixed(1)} KB)`);
    console.log(`   诊断: 标题="${diag.title}" | 内容高=${diag.scrollH} | 页脚底=${diag.footBottom} (画布 ${H})`);
    console.log(`   ${diag.footBottom <= H && diag.footBottom > 0 ? '✅ 未溢出' : '⚠️ 可能溢出，需调整字号/间距'}`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('生成失败:', e.message); process.exit(1); });
