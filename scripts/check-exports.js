/**
 * check-exports.js — 导出一致性审计（同根源收口工具）
 * 用法: node scripts/check-exports.js [模块路径] [扫描目录]
 * 示例: node scripts/check-exports.js src/core/BrainSystem.js server
 *
 * 检查: 扫描目录下所有 `Module.<method>` 调用 vs 模块实际导出
 * 用途: 修复"导出遗漏"类问题后，证明"同根源无其他实例"（AGENTS.md 5.3 追根源收口）
 */
const fs = require('fs');
const path = require('path');

const modulePath = process.argv[2] || 'src/core/BrainSystem.js';
const scanDir = process.argv[3] || 'server';

function main() {
  const module = require(path.resolve(modulePath));
  const exported = new Set(Object.keys(module));
  const moduleName = path.basename(modulePath).replace(/\.js$/, '');

  const calls = new Set();
  function walk(dir) {
    if (!fs.existsSync(dir)) { return; }
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); }
      else if (/\.js$/.test(e.name) && !/\.test\./.test(e.name)) {
        const src = fs.readFileSync(full, 'utf8');
        const re = new RegExp(`\\b${moduleName}\\.([A-Za-z_$][\\w$]*)`, 'g');
        let m;
        while ((m = re.exec(src))) { calls.add(m[1]); }
      }
    }
  }
  walk(scanDir);

  const missing = [...calls].filter((c) => !exported.has(c));
  console.log(`导出一致性审计: ${moduleName} 导出 ${exported.size} 个方法`);
  console.log(`扫描目录: ${scanDir}（调用 ${calls.size} 个方法）`);
  if (missing.length === 0) {
    console.log('✅ 调用但未导出: 无（同根源无其他实例）');
    process.exit(0);
  }
  console.log(`❌ 调用但未导出: ${missing.length} 个`);
  missing.forEach((m) => console.log(`   - ${moduleName}.${m}`));
  process.exit(1);
}

main();