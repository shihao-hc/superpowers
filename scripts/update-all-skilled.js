const { execFileSync } = require('child_process');
const fs = require('fs');
const curl = 'curl.exe';

const dirs = fs.readdirSync('D:/龙虾/.opencode/skills').filter(d => !d.startsWith('.'));

console.log('更新所有 SKILL.md 版本...\n');

let updated = 0, error = 0, skipped = 0;

for (const d of dirs) {
  const path = `D:/龙虾/.opencode/skills/${d}/SKILL.md`;
  if (!fs.existsSync(path)) continue;
  
  let c = fs.readFileSync(path, 'utf8');
  const versionMatch = c.match(/\*\*版本\*\*[：:]\s*([^\n]+)/);
  
  if (versionMatch && versionMatch[1].trim() !== 'latest') {
    skipped++;
    continue;
  }
  
  const ghMatch = c.match(/github\.com\/([^\/\s]+)\/([^\/\s\)]+)/);
  if (!ghMatch) continue;
  
  let owner = ghMatch[1];
  let repo = ghMatch[2].replace(/[^a-zA-Z0-9\-_]/g, '');
  
  if (!owner || !repo || owner.includes('example')) continue;
  
  try {
    let url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    let result = execFileSync(curl, ['-s', url], { encoding: 'utf8', timeout: 10000 });
    let data = JSON.parse(result);
    let version = data.tag_name || data.name;
    
    if (!version) {
      url = `https://api.github.com/repos/${owner}/${repo}/tags?per_page=1`;
      result = execFileSync(curl, ['-s', url], { encoding: 'utf8', timeout: 10000 });
      data = JSON.parse(result);
      version = data[0]?.name;
    }
    
    if (version) {
      if (versionMatch) {
        c = c.replace(/\*\*版本\*\*[：:]\s*[^\n]+/, `**版本**: ${version}`);
      } else {
        const starsMatch = c.match(/(GitHub[^\n]*\n[^\n]*Stars[^\n]*\n)/);
        if (starsMatch) {
          c = c.replace(starsMatch[1], `${starsMatch[1]}**版本**: ${version}\n`);
        }
      }
      fs.writeFileSync(path, c);
      updated++;
      console.log(`  ${d}: ${version}`);
    }
  } catch(e) {
    error++;
  }
}

console.log(`\n更新完成: ${updated} 个, 跳过: ${skipped} 个, 错误: ${error}`);