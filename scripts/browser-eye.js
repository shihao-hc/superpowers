#!/usr/bin/env node
/**
 * browser-eye.js — 手眼 CLI（接入 opencode 用户路径）
 *
 * 让 opencode（AI 或用户）通过命令使用"手"（浏览器操作）和"眼"（视觉理解）。
 *
 * 用法:
 *   node scripts/browser-eye.js <url>                        打开页面 → 中文理解（默认 webpage）
 *   node scripts/browser-eye.js <url> --task=ocr             OCR 提取文字
 *   node scripts/browser-eye.js <url> --task=describe        通用描述
 *   node scripts/browser-eye.js <url> --extract              结构化提取（DOM，零模型，精确）
 *   node scripts/browser-eye.js <url> --extract --json       结构化提取（JSON 输出）
 *   node scripts/browser-eye.js <url> --text                 页面全文
 *
 * 示例:
 *   node scripts/browser-eye.js https://example.com
 *   node scripts/browser-eye.js https://github.com --extract
 */
const { BrowserAgent } = require('../src/agent/BrowserAgent');

function printStructured(d) {
  if (!d) { console.log('（无数据）'); return; }
  console.log(`标题: ${d.title}`);
  console.log(`URL: ${d.url}`);
  console.log(`正文长度: ${d.textLength}`);
  console.log(`标题元素: ${(d.headings || []).slice(0, 5).join(' / ') || '（无）'}`);
  console.log(`链接 (${(d.links || []).length}):`);
  (d.links || []).slice(0, 10).forEach((l) => console.log(`  - ${l.text} → ${l.href}`));
  console.log(`表单输入 (${(d.inputs || []).length}): ${(d.inputs || []).slice(0, 6).map((i) => i.name || i.type).join(', ')}`);
  console.log(`图片: ${(d.images || []).length}`);
  if (d.textPreview) { console.log(`正文预览: ${d.textPreview.substring(0, 200)}`); }
}

async function main() {
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith('--'));
  if (!url) {
    console.log('用法: node scripts/browser-eye.js <url> [--task=webpage|ocr|describe|identify] [--extract] [--json] [--text]');
    process.exit(1);
  }
  const taskArg = args.find((a) => a.startsWith('--task='));
  const task = taskArg ? taskArg.split('=')[1] : 'webpage';
  const doExtract = args.includes('--extract');
  const doText = args.includes('--text');
  const asJson = args.includes('--json');

  const agent = new BrowserAgent({ headless: true });
  try {
    await agent.init();
    const g = await agent.goto(url);
    if (!g.success) { console.log(`❌ 打开失败: ${g.error}`); process.exit(1); }

    if (doExtract) {
      const r = await agent.extractStructured();
      if (!r.success) { console.log(`❌ 提取失败: ${r.error}`); process.exit(1); }
      if (asJson) { console.log(JSON.stringify(r.data, null, 2)); } else { printStructured(r.data); }
    } else if (doText) {
      const text = await agent.getPageText();
      console.log(text);
    } else {
      const r = await agent.understand(task);
      if (!r.ok) { console.log(`❌ 理解失败: ${r.error}`); process.exit(1); }
      console.log(`【${url} · ${task}】\n${r.result.description}`);
    }
    await agent.close();
    process.exit(0);
  } catch (e) {
    console.log(`❌ 错误: ${e.message}`);
    try { await agent.close(); } catch (_) { /* ignore */ }
    process.exit(1);
  }
}

main();