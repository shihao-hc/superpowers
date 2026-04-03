#!/usr/bin/env node
const http = require('http');

const BASE_URL = 'http://localhost:3000';

const tests = [
  { name: 'Game Panel HTML', url: '/frontend/game-panel.html', expect: 200 },
  { name: 'Game Status API', url: '/api/game/status', expect: 200 },
  { name: 'Game Events API', url: '/api/game/events', expect: 200 },
];

function makeRequest(test) {
  return new Promise((resolve) => {
    const url = new URL(test.url, BASE_URL);
    const req = http.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let result = { 
          ...test, 
          statusCode: res.statusCode,
          ok: res.statusCode === test.expect 
        };
        
        if (test.url.includes('api/game/status')) {
          try {
            const json = JSON.parse(data);
            result.data = json;
            result.details = `enabled=${json.enabled}, connected=${json.connected}`;
            result.gameFeatures = {
              hasBot: !!json.bot,
              hasTaskPlanner: !!json.taskPlanner,
              hasRecentEvents: Array.isArray(json.recentEvents)
            };
          } catch (e) {
            result.details = 'JSON parse failed';
          }
        } else {
          result.details = `HTML size: ${data.length} bytes`;
        }
        
        resolve(result);
      });
    });
    req.on('error', (err) => {
      resolve({ ...test, ok: false, statusCode: 0, details: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ...test, ok: false, statusCode: 0, details: 'Timeout' });
    });
  });
}

async function testGamePanel() {
  console.log('🎮 游戏面板集成测试\n');
  console.log('='.repeat(50));
  
  console.log('\n📡 端点测试:\n');
  
  const results = await Promise.all(tests.map(testUrl => makeRequest(testUrl)));
  
  let passed = 0;
  let failed = 0;
  
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    console.log(`${icon} ${r.name}`);
    console.log(`   URL: ${r.url}`);
    console.log(`   Status: HTTP ${r.statusCode}`);
    console.log(`   Details: ${r.details}`);
    
    if (r.gameFeatures) {
      console.log('   Game Features:');
      console.log(`   - Bot Status: ${r.gameFeatures.hasBot ? '✅' : '❌'}`);
      console.log(`   - Task Planner: ${r.gameFeatures.hasTaskPlanner ? '✅' : '❌'}`);
      console.log(`   - Recent Events: ${r.gameFeatures.hasRecentEvents ? '✅' : '❌'}`);
    }
    console.log('');
    
    if (r.ok) passed++;
    else failed++;
  }
  
  console.log('─'.repeat(50));
  console.log('\n📋 游戏功能检查:\n');
  
  const gameStatus = results.find(r => r.url.includes('api/game/status'));
  if (gameStatus && gameStatus.data) {
    console.log(`✅ 游戏模块已启用: ${gameStatus.data.enabled}`);
    console.log(`⚠️  Minecraft 服务器: ${gameStatus.data.connected ? '已连接' : '未连接 (需要启动 MC 服务器)'}`);
    
    if (gameStatus.data.bot) {
      console.log(`   - 机器人: ${gameStatus.data.bot.username || 'N/A'}`);
      console.log(`   - 状态: ${gameStatus.data.bot.connected ? '在线' : '离线'}`);
    }
    
    if (gameStatus.data.taskPlanner) {
      console.log(`✅ TaskPlanner 已集成`);
      console.log(`   - 当前任务: ${gameStatus.data.taskPlanner.currentTask || '无'}`);
    }
  }
  
  console.log('\n🔧 WebSocket 事件测试 (需要浏览器):\n');
  console.log('1. 打开 http://localhost:3000/frontend/game-panel.html');
  console.log('2. 打开浏览器开发者工具 (F12)');
  console.log('3. 在 Console 中测试 Socket.IO:');
  console.log('   socket.emit("game_status")');
  console.log('   socket.emit("game_command", "/status")');
  console.log('');
  console.log('4. 观察事件是否正确显示在面板上');
  
  console.log('\n📝 测试检查清单:\n');
  console.log('□ 连接状态指示器是否显示 "未连接" (因为无 MC 服务器)');
  console.log('□ WebSocket 是否成功连接 (查看 Console 日志)');
  console.log('□ 事件列表是否正常显示');
  console.log('□ 命令输入框是否可用');
  
  console.log('\n' + '─'.repeat(50));
  console.log(`\nResults: ${passed} passed, ${failed} failed, ${tests.length} total`);
  console.log(`\n🎮 游戏面板集成测试完成!`);
  console.log('\n注意: 由于没有运行 Minecraft 服务器，游戏状态显示"未连接"。');
  console.log('启动 MC 服务器后，机器人将自动连接并开始显示实时状态。');
}

testGamePanel().catch(console.error);
