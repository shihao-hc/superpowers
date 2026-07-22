const fs = require('fs');
const path = require('path');

const root = 'D:/龙虾';
const files = [];

function walk(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
        walk(p);
      } else if (e.name.endsWith('.js')) {
        files.push(p);
      }
    }
  } catch (e) {}
}

walk(path.join(root, 'src'));

console.log('=== 路径安全检查 ===\n');
console.log('检查文件数:', files.length);

let pathRisks = [];
let safeFiles = 0;

for (const file of files.slice(0, 20)) {
  try {
    const content = fs.readFileSync(file, 'utf-8');
    
    // 检查 path.join + dirname 模式
    if (content.includes('path.join') && content.includes('__dirname')) {
      const relPath = path.relative(root, file);
      pathRisks.push({ file: relPath, issue: 'path.join + __dirname' });
      continue;
    }
    
    // 检查 ../ 路径遍历
    if (content.includes('../') && !content.includes('// safe')) {
      const relPath = path.relative(root, file);
      pathRisks.push({ file: relPath, issue: '../ traversal' });
      continue;
    }
    
    safeFiles++;
  } catch (e) {
    console.log('Error:', e.message);
  }
}

console.log('\n【结果】');
console.log('安全文件:', safeFiles);
console.log('风险文件:', pathRisks.length);

if (pathRisks.length > 0) {
  console.log('\n【风险详情】');
  pathRisks.forEach(r => {
    console.log(`  ⚠️  ${r.file}`);
    console.log(`     问题: ${r.issue}`);
    console.log(`     建议: 使用 path.resolve 或 path.join(__dirname, 'subdir') 代替`);
  });
} else {
  console.log('\n✅ 无路径安全问题');
}