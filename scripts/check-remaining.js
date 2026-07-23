#!/usr/bin/env node
const { execFileSync } = require('child_process');
const fs = require('fs');
const curl = 'curl.exe';

const projects = [
  ['n8n-io', 'n8n', 'D:/龙虾/.opencode/skills/n8n-workflow/SKILL.md', 'n8n'],
  ['run-llama', 'llamaindex', 'D:/龙虾/.opencode/skills/llamaindex/SKILL.md', 'llamaindex'],
  ['lightpanda-io', 'browser', 'D:/龙虾/.opencode/skills/lightpanda-browser/SKILL.md', 'lightpanda'],
  ['bytedance', 'deer-flow', 'D:/龙虾/.opencode/skills/deerflow-superagent/SKILL.md', 'deer-flow']
];

console.log('检查并更新所有项目...\n');

for (const [owner, repo, skillPath, name] of projects) {
  console.log(`[${name}] 检查 ${owner}/${repo}...`);
  
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const result = execFileSync(curl, ['-s', url], { encoding: 'utf8', timeout: 15000 });
    const data = JSON.parse(result);
    const version = data.tag_name || data.name || 'unknown';
    
    if (fs.existsSync(skillPath)) {
      let content = fs.readFileSync(skillPath, 'utf8');
      const versionMatch = content.match(/\*\*版本\*\*[：:]\s*([^\n]+)/);
      const currentVersion = versionMatch ? versionMatch[1].trim() : 'latest';
      
      if (currentVersion !== version && !content.includes(version)) {
        content = content.replace(/\*\*版本\*\*[：:]\s*[^\n]+/, `**版本**: ${version}`);
        fs.writeFileSync(skillPath, content);
        console.log(`  -> 更新版本: ${currentVersion} -> ${version}`);
      } else {
        console.log(`  无更新: ${currentVersion}`);
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message.slice(0, 50)}`);
  }
}

console.log('\n完成！');