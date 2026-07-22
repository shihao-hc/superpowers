const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const skillsDir = 'D:/龙虾/.opencode/skills';

const curl = 'curl.exe';

const projectMap = {
  'agency-agents-personas': { owner: 'msitarzewski', repo: 'agency-agents' },
  'bettafish-patterns': { owner: '666ghj', repo: 'BettaFish' },
  'browser-inline-ai': { owner: 'duckdb', repo: 'duckdb-wasm' },
  'browser-use': { owner: 'browser-use', repo: 'browser-use' },
  'buddy-pet-system': { owner: 'pengchengneo', repo: 'Claude-Code' },
  'china-platform-integration': { owner: 'msitarzewski', repo: 'agency-agents' },
  'chinese-translation-system': { owner: 'i18n-actions', repo: 'ai-i18n' },
  'claude-code-architecture': { owner: 'tvytlx', repo: 'claude-code-deep-dive' },
  'crawl4ai-patterns': { owner: 'unclecode', repo: 'crawl4ai' },
  'crawlee-patterns': { owner: 'apify', repo: 'crawlee-python' },
  'crewai-multiagent': { owner: 'crewaiinc', repo: 'crewai' },
  'deerflow-superagent': { owner: 'bytedance', repo: 'deer-flow' },
  'digital-pet-generator': { owner: 'dyz2102', repo: 'buddy-card' },
  'easyspider-patterns': { owner: 'NaiboWang', repo: 'EasySpider' },
  'firecrawl-patterns': { owner: 'mendableai', repo: 'firecrawl' },
  'gep-evolution-protocol': { owner: 'EvoMap', repo: 'evolver' },
  'letta-architecture': { owner: 'letta-ai', repo: 'letta' },
  'lightpanda-browser': { owner: 'lightpanda-io', repo: 'browser' },
  'mcp-comparison-analysis': { owner: 'modelcontextprotocol', repo: 'servers' },
  'mcp-server-builder': { owner: 'modelcontextprotocol', repo: 'typescript-sdk' },
  'mem0-memory': { owner: 'mem0ai', repo: 'mem0' },
  'multi-orchestrate': { owner: 'affaan-m', repo: 'everything-claude-code' },
  'opensage-framework': { owner: 'opensage-agent', repo: 'OpenSage' },
  'scrapling': { owner: 'D4Vinci', repo: 'Scrapling' },
  'security-audit': { owner: 'affaan-m', repo: 'agentshield' },
  'ui-ux-design': { owner: 'nextlevelbuilder', repo: 'ui-ux-pro-max-skill' },
  'three-provinces-six-ministries': { owner: 'cft0808', repo: 'edict' },
  'paperclip-orchestration': { owner: 'paperclipai', repo: 'paperclip' },
  'hooks-system': { owner: 'claude-code', repo: 'claude-code' }
};

console.log('更新所有技能版本 (修复版本字段)...\n');

let updated = 0, errors = 0;

for (const skill of Object.keys(projectMap)) {
  const p = projectMap[skill];
  const skillPath = path.join(skillsDir, skill, 'SKILL.md');
  
  if (!fs.existsSync(skillPath)) continue;
  
  try {
    let url = `https://api.github.com/repos/${p.owner}/${p.repo}/releases/latest`;
    let result = execSync(`${curl} -s "${url}"`, { encoding: 'utf8', timeout: 10000 });
    let data = JSON.parse(result);
    let version = data.tag_name || data.name;
    
    if (!version || version === 'null') {
      const tagsUrl = `https://api.github.com/repos/${p.owner}/${p.repo}/tags?per_page=1`;
      result = execSync(`${curl} -s "${tagsUrl}"`, { encoding: 'utf8', timeout: 10000 });
      data = JSON.parse(result);
      version = data[0]?.name;
    }
    
    if (version) {
      let c = fs.readFileSync(skillPath, 'utf8');
      if (c.includes('**版本**: latest') || c.includes('**版本**: latest')) {
        c = c.replace(/\*\*版本\*\*[：:]\s*latest/, `**版本**: ${version}`);
        fs.writeFileSync(skillPath, c);
        updated++;
        console.log(`  ${skill}: ${version}`);
      }
    }
  } catch(e) {
    errors++;
  }
}

console.log(`\n更新完成: ${updated} 个, 错误: ${errors}`);