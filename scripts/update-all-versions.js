const { execSync } = require('child_process');
const fs = require('fs');
const curl = 'curl.exe';

const dirs = fs.readdirSync('D:/龙虾/.opencode/skills').filter(d => !d.startsWith('.'));

console.log('检查并更新所有项目...\n');

for (const d of dirs) {
  const path = `D:/龙虾/.opencode/skills/${d}/SKILL.md`;
  if (fs.existsSync(path)) {
    let c = fs.readFileSync(path, 'utf8');
    if (c.includes('**版本**: latest')) {
      const match = c.match(/github\.com\/([^\/\s]+)\/([^\/\s]+)/);
      if (match) {
        let owner = match[1];
        let repo = match[2].replace(/[^a-zA-Z0-9\-_]/g, '');
        if (owner && repo) {
          try {
            let url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
            let result = execSync(`${curl} -s "${url}"`, { encoding: 'utf8' });
            let data = JSON.parse(result);
            let version = data.tag_name || data.name;
            
            if (!version) {
              url = `https://api.github.com/repos/${owner}/${repo}/tags?per_page=1`;
              result = execSync(`${curl} -s "${url}"`, { encoding: 'utf8' });
              data = JSON.parse(result);
              version = data[0]?.name;
            }
            
            if (version) {
              c = c.replace(/\*\*版本\*\*:\s*latest/, `**版本**: ${version}`);
              fs.writeFileSync(path, c);
              console.log(`  ${d}: ${version}`);
            }
          } catch(e) {
            console.log(`  ${d}: ERROR`);
          }
        }
      }
    }
  }
}

console.log('\n完成！');