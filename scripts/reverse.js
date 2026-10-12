#!/usr/bin/env node
/**
 * reverse.js — 我的逆向工程（REA 的思想 + 我量身定做的能力）
 *
 * 借鉴 REA：证据驱动 + 三分类（观察/推断/不知道）+ 逆向思维
 * 量身定做：REA 逆向"二进制"，我逆向"代码/网页/系统"——我有源码 + 手眼 + 运行验证
 *
 * 用法:
 *   node scripts/reverse.js <文件|目录>              逆向代码（结构/依赖/设计意图）
 *   node scripts/reverse.js <url> --web              逆向网页（手眼：DOM 事实 + 技术推断）
 *   node scripts/reverse.js --system                 逆向系统状态（进程/端口/服务）
 *
 * 输出: 【观察到的】(证据) 【推断的】(依据) 【不知道的】(诚实)
 */
const fs = require('fs');
const path = require('path');

function out(observed, inferred, unknown) {
  console.log('\n===== 逆向分析结果 =====\n');
  console.log('【观察到的（有证据）】');
  observed.forEach((x) => console.log(`  • ${x}`));
  console.log('\n【推断的（说明依据）】');
  inferred.forEach((x) => console.log(`  • ${x}`));
  console.log('\n【不知道的（诚实）】');
  unknown.forEach((x) => console.log(`  • ${x}`));
}

// 逆向代码：从代码结构反推设计/意图
function reverseCode(target) {
  const stat = fs.statSync(target);
  const observed = [];
  const inferred = [];
  const unknown = [];

  const files = [];
  if (stat.isDirectory()) {
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory() && !/node_modules|\.git/.test(e.name)) { walk(full); }
        else if (/\.(js|ts)$/.test(e.name)) { files.push(full); }
      }
    };
    walk(target);
    observed.push(`目录含 ${files.length} 个 JS/TS 文件`);
  } else {
    files.push(target);
  }

  // 分析（观察：结构/导出/依赖）
  let totalLines = 0;
  const exports = [];
  const requires = new Set();
  const funcs = [];
  for (const f of files.slice(0, 50)) {
    const src = fs.readFileSync(f, 'utf8');
    totalLines += src.split('\n').length;
    const exp = src.match(/module\.exports\s*=\s*(\{[^}]*\}|[\w.]+)/);
    if (exp) { exports.push(`${path.basename(f)}: ${exp[1].substring(0, 60).replace(/\s+/g, ' ')}`); }
    (src.match(/require\(['"]([^'"]+)['"]\)/g) || []).forEach((m) => requires.add(m.replace(/require\(['"]|['"]\)/g, '')));
    (src.match(/(?:async\s+)?(?:function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s*)?\()/g) || []).slice(0, 3).forEach((m) => funcs.push(m.trim()));
  }
  observed.push(`总代码 ${totalLines} 行`);
  if (exports.length) { observed.push(`模块导出 ${exports.length} 处，如: ${exports[0]}`); }
  if (requires.size) { observed.push(`外部依赖 ${requires.size} 个: ${[...requires].slice(0, 5).join(', ')}`); }

  // 推断（依据结构）
  if (totalLines > 500) { inferred.push(`代码量大（${totalLines} 行）→ 推断为复杂模块/核心组件`); }
  if (requires.size > 5) { inferred.push(`依赖多（${requires.size}）→ 推断为集成型模块（协调多个子系统）`); }
  if (exports.length > 0) { inferred.push(`有明确导出 → 推断为可复用库/服务模块`); }

  // 不知道（诚实）
  unknown.push('运行时行为（静态分析看不到执行路径）');
  unknown.push('真实调用方（需要全局搜索调用处）');
  if (files.length > 50) { unknown.push(`仅分析前 50 文件（共 ${files.length}）`); }

  out(observed, inferred, unknown);
}

// 逆向网页：手眼（DOM 事实 + 技术推断）
async function reverseWeb(url) {
  const { BrowserAgent } = require('../src/agent/BrowserAgent');
  const agent = new BrowserAgent({ headless: true });
  try {
    await agent.init();
    const g = await agent.goto(url);
    if (!g.success) { console.log(`打开失败: ${g.error}`); process.exit(1); }
    const s = await agent.extractStructured();
    const observed = [];
    const inferred = [];
    const unknown = [];
    if (s.success) {
      const d = s.data;
      observed.push(`标题: ${d.title}`);
      observed.push(`正文长度: ${d.textLength} 字符`);
      observed.push(`链接 ${(d.links || []).length} 个，表单 ${(d.inputs || []).length} 个，图片 ${(d.images || []).length} 个`);
      if ((d.headings || []).length) { observed.push(`标题元素: ${d.headings.slice(0, 3).join(' / ')}`); }
      // 推断技术特征（依据 DOM 特征）
      const html = await agent.page.content();
      if (/react|__next|_next/i.test(html)) { inferred.push('检测到 React/Next.js 特征（依据 __next/_react 标记）'); }
      if (/vue|__vue/i.test(html)) { inferred.push('检测到 Vue 特征'); }
      if ((d.inputs || []).length > 0) { inferred.push('有表单 → 推断为交互型站点（登录/搜索/提交）'); }
      if ((d.links || []).length > 20) { inferred.push('链接多 → 推断为内容/导航密集型页面'); }
    }
    unknown.push('后端实现（前端看不到服务端逻辑）');
    unknown.push('动态数据来源（需要网络捕获）');
    await agent.close();
    out(observed, inferred, unknown);
  } catch (e) {
    console.log(`失败: ${e.message}`);
    try { await agent.close(); } catch (_) { /* ignore */ }
    process.exit(1);
  }
}

// 逆向系统：进程/端口/服务
function reverseSystem() {
  const { execSync } = require('child_process');
  const observed = [];
  const inferred = [];
  const unknown = [];
  try {
    const procs = execSync('tasklist', { encoding: 'utf8', windowsHide: true });
    const nodeProcs = (procs.match(/node\.exe/g) || []).length;
    const ollamaProcs = (procs.match(/ollama\.exe/g) || []).length;
    observed.push(`运行中 node.exe: ${nodeProcs} 个，ollama.exe: ${ollamaProcs} 个`);
    const netstat = execSync('netstat -ano', { encoding: 'utf8', windowsHide: true });
    const listening = (netstat.match(/LISTENING/g) || []).length;
    observed.push(`监听端口总数: ${listening}`);
    const has3000 = /:3000\s/.test(netstat);
    const has11434 = /:11434\s/.test(netstat);
    observed.push(`server(3000): ${has3000 ? '在跑' : '未跑'}，ollama(11434): ${has11434 ? '在跑' : '未跑'}`);
    if (has3000 && has11434) { inferred.push('server + ollama 都在 → 推断 AI 对话链路可用'); }
  } catch (e) {
    unknown.push(`系统查询失败: ${e.message}`);
  }
  unknown.push('各进程的详细状态/内存/健康度');
  out(observed, inferred, unknown);
}

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
if (args.includes('--system')) { reverseSystem(); } else if (args.includes('--web')) { reverseWeb(target); } else if (target) { reverseCode(target); } else {
  console.log('我的逆向工程（REA 思想 + 量身定做）');
  console.log('用法: node scripts/reverse.js <文件|目录>       逆向代码');
  console.log('      node scripts/reverse.js <url> --web       逆向网页（手眼）');
  console.log('      node scripts/reverse.js --system          逆向系统状态');
  console.log('输出: 【观察到的】(证据) 【推断的】(依据) 【不知道的】(诚实)');
  process.exit(1);
}