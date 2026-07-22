const { execSync } = require('child_process');
const curl = 'curl.exe';

const repos = [
  ['run-llama', 'llamaindex'],
  ['bytedance', 'deer-flow']
];

for (const [owner, repo] of repos) {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/tags?per_page=1`;
    const result = execSync(`${curl} -s "${url}"`, { encoding: 'utf8', timeout: 15000 }).trim();
    const data = JSON.parse(result);
    console.log(`${repo}:`, data[0]?.name || 'N/A');
  } catch (e) {
    console.log(`${repo}: ERROR -`, e.message.slice(0,30));
  }
}