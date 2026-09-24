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
 *   node scripts/browser-eye.js --image=<path>               直接理解一张本地图片（不开浏览器）
 *   node scripts/browser-eye.js --image=<path> --task=ocr    图片文字提取
 *   node scripts/browser-eye.js <url> --search="opencode"    搜索框输入+回车（交互）
 *   node scripts/browser-eye.js <url> --click="#button"      点击元素
 *   node scripts/browser-eye.js <url> --fill="input#name":"小明" --after=extract  填表后提取
 *   （--after=webpage|extract|text 决定交互后的输出，默认 webpage）
 *
 * 示例:
 *   node scripts/browser-eye.js https://example.com
 *   node scripts/browser-eye.js https://github.com --extract
 *   node scripts/browser-eye.js --image=./shot.png --task=describe
 *   node scripts/browser-eye.js https://www.bing.com --search="opencode" --after=extract
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
  const imageArg = args.find((a) => a.startsWith('--image='));
  const url = args.find((a) => !a.startsWith('--'));
  if (!url && !imageArg) {
    console.log('用法: node scripts/browser-eye.js <url> [--task=webpage|ocr|describe|identify] [--extract] [--json] [--text]');
    console.log('      node scripts/browser-eye.js --image=<path> [--task=describe|ocr|identify]');
    process.exit(1);
  }
  const taskArg = args.find((a) => a.startsWith('--task='));
  const task = taskArg ? taskArg.split('=')[1] : 'webpage';
  const doExtract = args.includes('--extract');
  const doText = args.includes('--text');
  const asJson = args.includes('--json');

  // 图片理解模式：不开浏览器，直接理解本地图片（覆盖"看图"场景）
  if (imageArg) {
    const { VisionExecutor } = require('../src/skills/executors/VisionExecutor');
    const imgPath = imageArg.split('=')[1];
    if (!require('fs').existsSync(imgPath)) {
      console.log(`❌ 图片不存在: ${imgPath}`);
      process.exit(1);
    }
    const r = await VisionExecutor.execute({ image: imgPath, task });
    if (!r.ok) { console.log(`❌ 理解失败: ${r.error}`); process.exit(1); }
    console.log(`【${imgPath} · ${task}】\n${r.result.description}`);
    process.exit(0);
  }

  const agent = new BrowserAgent({ headless: true });
  try {
    await agent.init();
    const g = await agent.goto(url);
    if (!g.success) { console.log(`❌ 打开失败: ${g.error}`); process.exit(1); }

    // 交互（真实使用暴露的缺口：搜索/点击/填表）
    const searchArg = args.find((a) => a.startsWith('--search='));
    const clickArg = args.find((a) => a.startsWith('--click='));
    const fillArg = args.find((a) => a.startsWith('--fill='));
    const afterArg = args.find((a) => a.startsWith('--after='));
    const after = afterArg ? afterArg.split('=')[1] : null;

    if (searchArg) {
      const q = searchArg.split('=')[1].replace(/^"|"$/g, '');
      const typed = await agent.typeFirstInput(q);
      if (!typed.success) { console.log(`❌ 搜索输入失败: ${typed.error}`); await agent.close(); process.exit(1); }
      await agent.pressKey('Enter');
      // 交互后等导航跳转（固定等待，简单可靠；提取失败有重试兜底导航竞态）
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (fillArg) {
      const [sel, val] = fillArg.split('=')[1].split(':').slice(0, 2).map((x) => x.replace(/^"|"$/g, ''));
      const filled = await agent.type(sel, val);
      if (!filled.success) { console.log(`❌ 填表失败: ${filled.error}`); await agent.close(); process.exit(1); }
    }
    if (clickArg) {
      const sel = clickArg.split('=')[1].replace(/^"|"$/g, '');
      const clicked = await agent.click(sel);
      if (!clicked.success) { console.log(`❌ 点击失败: ${clicked.error}`); await agent.close(); process.exit(1); }
      await new Promise((r) => setTimeout(r, 1500));
    }

    // 输出：--after 优先，否则按原逻辑
    const outputTask = after || (doExtract ? 'extract' : doText ? 'text' : task);
    if (outputTask === 'extract') {
      // 交互后可能导航中（旧上下文销毁）→ 失败重试一次（真实使用暴露的竞态）
      let r = await agent.extractStructured();
      if (!r.success) {
        await new Promise((res) => setTimeout(res, 2000));
        r = await agent.extractStructured();
      }
      if (!r.success) { console.log(`❌ 提取失败: ${r.error}`); process.exit(1); }
      if (asJson) { console.log(JSON.stringify(r.data, null, 2)); } else { printStructured(r.data); }
    } else if (outputTask === 'text') {
      const text = await agent.getPageText();
      console.log(text);
    } else {
      const r = await agent.understand(outputTask);
      if (!r.ok) { console.log(`❌ 理解失败: ${r.error}`); process.exit(1); }
      console.log(`【${url} · ${outputTask}】\n${r.result.description}`);
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