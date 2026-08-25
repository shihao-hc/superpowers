const fs = require('fs');
const path = 'D:/龙虾/src/core/BrainSystem.js';
let content = fs.readFileSync(path, 'utf8');

console.log('文件大小:', content.length);

// 找到第一套Agent类的开始（IntentAgent第一次出现）
const firstIntent = content.indexOf('class IntentAgent extends BaseAgent');
console.log('第一套IntentAgent位置:', firstIntent);

// 找到第二套Agent类的开始（IntentAgent第二次出现）
const secondIntent = content.indexOf('class IntentAgent extends BaseAgent', firstIntent + 100);
console.log('第二套IntentAgent位置:', secondIntent);

if (secondIntent === -1) {
  console.log('✗ 没找到第二套Agent类');
  process.exit(0);
}

// 找到第二套Agent类之前的注释（/** ... */）
let commentStart = content.lastIndexOf('/**', secondIntent);
console.log('第二套注释开始:', commentStart);

if (commentStart === -1) {
  console.log('✗ 找不到第二套的注释开始');
  process.exit(1);
}

// 删除从注释开始到AgentTeamManager之前的所有内容
// 但只删除Agent类部分，保留AgentTeamManager
const agentTeamStart = content.indexOf('class AgentTeamManager', secondIntent);
console.log('AgentTeamManager位置:', agentTeamStart);

if (agentTeamStart === -1) {
  console.log('✗ 找不到AgentTeamManager');
  process.exit(1);
}

// 删除第二套Agent类（从注释到AgentTeamManager之前）
const beforeSecond = content.substring(0, commentStart);
const afterSecond = content.substring(agentTeamStart);
const newContent = beforeSecond + '\n\n' + afterSecond;

fs.writeFileSync(path, newContent, 'utf8');
console.log('✓ 已删除第二套Agent类');
console.log('原大小:', content.length);
console.log('新大小:', newContent.length);

// 验证语法
try {
  require('child_process').spawnSync(process.execPath, ['-c', path], { stdio: 'pipe' });
  console.log('✓ 语法检查通过');
} catch (e) {
  console.log('✗ 语法检查失败:', e.stderr?.toString() || e.message);
}

// 验证加载
try {
  delete require.cache[require.resolve(path)];
  const BS = require(path);
  console.log('✓ 加载成功');
  console.log('版本:', BS.version || BS.BrainSystem?.version);
  console.log('Agent总数:', Object.keys(BS.AgentTeamManager?.agents || {}).length);
} catch (e) {
  console.log('✗ 加载失败:', e.message);
}
