const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const skillsDir = 'D:/龙虾/.opencode/skills';

const curl = 'curl.exe';

const projectMap = {
  'agency-agents-personas': { owner: 'msitarzewski', repo: 'agency-agents' },
  'llamaindex': { owner: 'run-llama', repo: 'llamaindex' },
  'three-provinces-six-ministries': { owner: 'cft0808', repo: 'edict' }
};

console.log('更新 latest 版本...\n');

for (const skill of Object.keys(projectMap)) {
  const p = projectMap[skill];
  const skillPath = path.join(skillsDir, skill, 'SKILL.md');
  
  if (!fs.existsSync(skillPath)) continue;
  
  let c = fs.readFileSync(skillPath, 'utf8');
  if (!c.includes('**版本**: latest')) continue;
  
  try {
    let url = `https://api.github.com/repos/${p.owner}/${p.repo}/releases/latest`;
    let result = execFileSync(curl, ['-s', url], { encoding: 'utf8', timeout: 10000 });
    
    if (result.includes('rate limit')) {
      console.log(`  ${skill}: API 限流，需等待`);
      continue;
    }
    
    let data = JSON.parse(result);
    let version = data.tag_name || data.name;
    
    if (!version) {
      url = `https://api.github.com/repos/${p.owner}/${p.repo}/tags?per_page=1`;
      result = execFileSync(curl, ['-s', url], { encoding: 'utf8', timeout: 10000 });
      data = JSON.parse(result);
      version = data[0]?.name;
    }
    
    if (version) {
      c = c.replace('**版本**: latest', `**版本**: ${version}`);
      fs.writeFileSync(skillPath, c);
      console.log(`  ${skill}: ${version}`);
    }
  } catch(e) {
    console.log(`  ${skill}: ERROR`);
  }
}

console.log('\n完成！');