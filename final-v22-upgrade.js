const fs = require('fs');
const path = 'D:/龙虾/src/core/BrainSystem.js';
let content = fs.readFileSync(path, 'utf8');

console.log('文件大小:', content.length);
console.log('当前版本:', content.match(/version [\d.]+/)?.[0] || '未知');

// 1. 更新文件头版本
content = content.replace(
  /\* @version [\d.]+/g, 
  '* @version 22.1.0'
);

// 2. 更新BrainSystem.version
content = content.replace(
  /BrainSystem\.version = "[\d.]+"/, 
  'BrainSystem.version = "22.1.0"'
);

// 3. 更新autoGetStatus中的版本
content = content.replace(
  /version: 'v[\d.]+'/,
  "version: 'v22.1'"
);

// 4. 确保AgentTeamManager正确初始化
// 检查_initAgents方法
if (!content.includes('_initAgents()')) {
  console.log('✗ 缺少_initAgents方法');
  process.exit(1);
}

// 5. 写入文件
fs.writeFileSync(path, content, 'utf8');
console.log('✓ v22.1版本更新完成');

// 6. 验证语法
try {
  require('child_process').spawnSync(process.execPath, ['-c', path], { stdio: 'pipe' });
  console.log('✓ 语法检查通过');
} catch (e) {
  console.log('✗ 语法检查失败:', e.stderr?.toString() || e.message);
  process.exit(1);
}

// 7. 验证加载和Agent初始化
try {
  delete require.cache[require.resolve(path)];
  const BS = require(path);
  console.log('✓ 加载成功');
  console.log('版本:', BS.version || BS.BrainSystem?.version || 'undefined');
  
  // 测试AgentTeamManager
  if (BS.AgentTeamManager) {
    console.log('✓ AgentTeamManager已导出');
    try {
      const team = new BS.AgentTeamManager();
      const agentCount = Object.keys(team._agents || {}).length;
      console.log('✓ Agent团队实例化成功，Agent数:', agentCount);
    } catch (e) {
      console.log('✗ AgentTeamManager实例化失败:', e.message);
    }
  } else {
    console.log('✗ AgentTeamManager未导出');
  }
  
} catch (e) {
  console.log('✗ 加载失败:', e.message);
}
