const { execFileSync } = require('child_process');
const fs = require('fs');
const curl = 'curl.exe';

const projects = [
  ['run-llama', 'llamaindex', 'D:/龙虾/.opencode/skills/llamaindex/SKILL.md'],
  ['bytedance', 'deer-flow', 'D:/龙虾/.opencode/skills/deerflow-superagent/SKILL.md']
];

console.log('检查并更新剩余项目...\n');

for (const [owner, repo, path] of projects) {
  console.log(`检查: ${owner}/${repo}`);
  let version = 'N/A';
  
  try {
    let url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    let result = execFileSync(curl, ['-s', url], { encoding: 'utf8' });
    let data = JSON.parse(result);
    version = data.tag_name || data.name;
    
    if (!version) {
      url = `https://api.github.com/repos/${owner}/${repo}/tags?per_page=1`;
      result = execFileSync(curl, ['-s', url], { encoding: 'utf8' });
      data = JSON.parse(result);
      version = data[0]?.name || 'N/A';
    }
    
    console.log(`  最新版本: ${version}`);
    
    if (fs.existsSync(path)) {
      let content = fs.readFileSync(path, 'utf8');
      content = content.replace(/\*\*版本\*\*[：:]\s*[^\n]+/, `**版本**: ${version}`);
      fs.writeFileSync(path, content);
      console.log(`  -> 已更新 SKILL.md`);
    }
  } catch(e) {
    console.log(`  ERROR: ${e.message.slice(0,30)}`);
  }
}

console.log('\n完成！');