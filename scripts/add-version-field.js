const fs = require('fs');
const dirs = fs.readdirSync('D:/龙虾/.opencode/skills').filter(d => !d.startsWith('.'));

console.log('搜索GitHub仓库并添加版本字段...\n');

let i = 0;
for (const d of dirs) {
  const path = `D:/龙虾/.opencode/skills/${d}/SKILL.md`;
  if (fs.existsSync(path)) {
    let c = fs.readFileSync(path, 'utf8');
    if (c.includes('github.com') && !c.includes('**版本**:')) {
      const match = c.match(/github\.com\/([^\/\s]+)\/([^\/\s]+)/);
      if (match && !match[1].includes('example')) {
        c = c.replace(/(GitHub[^\n]*\n[^\n]*Stars[^\n]*\n)/, '$1**版本**: latest\n');
        fs.writeFileSync(path, c);
        i++;
        console.log(`  ${d}: ${match[1]}/${match[2]}`);
      }
    }
  }
}

console.log(`\n已添加版本字段: ${i}`);