const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const skillsDir = 'D:/龙虾/.opencode/skills';

const curl = 'curl.exe';

const projectMap = {
  'agency-agents-personas': { owner: 'msitarzewski', repo: 'agency-agents' },
  'llamaindex': { owner: 'run-llama', repo: 'llamaindex' },
  'three-provinces-six-ministries': { owner: 'cft0808', repo: 'edict' },
  'hooks-system': { owner: 'claude-code', repo: 'claude-code' },
  'github-actions-workflows': { owner: 'actions', repo: 'github' },
  'lightpanda-browser': { owner: 'lightpanda-io', repo: 'browser' },
  'paperclip-orchestration': { owner: 'paperclipai', repo: 'paperclip' },
  'mem0-memory': { owner: 'mem0ai', repo: 'mem0' },
  'deeprflow-superagent': { owner: 'bytedance', repo: 'deeprflow' },
  'crawl4ai-patterns': { owner: 'unclecode', repo: 'crawl4ai' },
  'firecrawl-patterns': { owner: 'mendableai', repo: 'firecrawl' },
  'geo-evolution-protocol': { owner: 'EvoMap', repo: 'evolver' },
  'easyspider-patterns': { owner: 'NaiboWang', repo: 'EasySpider' },
  'scrapling': { owner: 'D4Vinci', repo: 'Scrapling' },
  'deeprflow-superagent': { owner: 'bytedance', repo: 'deeprflow' },
  'multi-orchestrate': { owner: 'affaan-m', repo: 'everything-claude-code' },
  'opensage-framework': { owner: 'opensage-agent', repo: 'OpenSage' },
  'security-audit': { owner: 'affaan-m', repo: 'agentshield' },
  'ui-ux-design': { owner: 'nextlevelbuilder', repo: 'ui-ux-pro-max-skill' },
  'bettafish-patterns': { owner: '666ghj', repo: 'BettaFish' },
  'chinese-translation-system': { owner: 'i18n-actions', repo: 'ai-i18n' },
  'claude-code-architecture': { owner: 'tvytlx', repo: 'claude-code-deep-dive' },
  'digital-pet-generator': { owner: 'dyz2102', repo: 'buddy-card' },
  'buddy-pet-system': { owner: 'pengchengneo', repo: 'Claude-Code' },
  'browser-inline-ai': { owner: 'duckdb', repo: 'duckdb-wasm' },
  'mcp-comparison-analysis': { owner: 'modelcontextprotocol', repo: 'servers' }
};

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

console.log('=== 继续更新所有 SKLL.md 版本 ===\n');
console.log('注意: GitHub API 每小时限流60次\n');
console.log('如遇限流，请设置环境变量 GITHUB_TOKEN 后重试\n\n');

let updated = 0, skipped = 0, errors = 0, rateLimited = 0;

for (const skill of Object.keys(projectMap)) {
  const p = projectMap[skill];
  const skillPath = path.join(skillsDir, skill, 'SKILL.md');
  
  if (!fs.existsSync(skillPath)) {
    skipped++;
    continue;
  }
  
  let c = fs.readFileSync(skillPath, 'utf8');
  
  if (!c.includes('**版本**:') && !c.includes('版本**:')) {
    skipped++;
    continue;
  }
  
  if (!c.includes('latest')) {
    skipped++;
    continue;
  }
  
  console.log(`[${updated + skipped + errors + rateLimited + 1}] ${skill}...`);
  
  try {
    const authHeader = GITHUB_TOKEN ? `-H "Authorization: Bearer ${GITHUB_TOKEN}" ` : '';
    let url = `https://api.github.com/repos/${p.owner}/${p.repo}/releases/latest`;
    let result = execSync(`${curl} -s ${authHeader}"${url}"`, { encoding: 'utf8', timeout: 10000 });
    
    if (result.includes('rate limit')) {
      rateLimited++;
      console.log(`  ⚠️ API 限流`);
      continue;
    }
    
    let data = JSON.parse(result);
    let version = data.tag_name || data.name;
    
    if (!version) {
      url = `https://api.github.com/repos/${p.owner}/${p.repo}/tags?per_page=1`;
      result = execSync(`${curl} -s ${authHeader}"${url}"`, { encoding: 'utf8', timeout: 10000 });
      data = JSON.parse(result);
      version = data[0]?.name;
    }
    
    if (version) {
      c = c.replace(/\*\*版本\*\*[：:]\s*latest/, `**版本**: ${version}`).replace(/版本\*\*[：:]\s*latest/, `**版本**: ${version}`);
      fs.writeFileSync(skillPath, c);
      updated++;
      console.log(`  ✅ ${version}`);
    } else {
      skipped++;
    }
  } catch(e) {
    errors++;
    console.log(`  ❌ ERROR: ${e.message.slice(0, 30)}`);
  }
}

console.log('\n=== 统计 ===');
console.log(`更新: ${updated}`);
console.log(`跳过: ${skipped}`);
console.log(`错误: ${errors}`);
console.log(`限流: ${rateLimited}`);

if (rateLimited > 0) {
  console.log('\n💡 提示: 设置 GITHUB_TOKEN 环境变量后可继续:');
  console.log('   export GITHUB_TOKEN=your_token');
  console.log('   node scripts/update-remaining.js');
}