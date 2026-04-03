#!/usr/bin/env node
require('dotenv').config();

const http = require('http');

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;
const results = [];

function log(msg, type = '') {
  const prefix = { pass: '✅', fail: '❌', info: '📋', warn: '⚠️' }[type] || '  ';
  console.log(`${prefix} ${msg}`);
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': data ? Buffer.byteLength(data) : 0
      }
    };
    const req = http.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch (e) { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

async function test(name, fn) {
  try {
    const result = await fn();
    if (result) {
      log(name, 'pass');
      passed++;
      results.push({ name, status: 'PASS' });
      return true;
    } else {
      log(name, 'fail');
      failed++;
      results.push({ name, status: 'FAIL' });
      return false;
    }
  } catch (e) {
    log(`${name}: ${e.message}`, 'fail');
    failed++;
    results.push({ name, status: 'FAIL', error: e.message });
    return false;
  }
}

async function run() {
  console.log('\n');
  console.log('='.repeat(60));
  console.log('   UltraWork Minecraft 联动验收测试');
  console.log('='.repeat(60));
  console.log('');

  // Pre-check
  log('前提条件检查', 'info');
  console.log('');

  try {
    await request('GET', '/health');
    log('服务器运行中', 'pass');
  } catch (e) {
    log('服务器未运行，请执行: npm start', 'fail');
    console.log('\n');
    printSummary();
    process.exit(1);
  }

  // 重置到狐九人格
  await request('POST', '/api/personality/switch', { name: '狐九' });

  // 1. 服务启动
  console.log('\n📋 1. 服务启动验收\n');
  await test('健康检查', async () => {
    const r = await request('GET', '/health');
    return r.data.ok === true;
  });
  await test('推理引擎配置', async () => {
    const r = await request('GET', '/health');
    return r.data.inference === 'ollama';
  });
  await test('Ollama 可用', async () => {
    const r = await request('GET', '/health');
    return r.data.ollama === true;
  });

  // 2. 前端
  console.log('\n📋 2. 前端功能验收\n');
  await test('人格 API 正常', async () => {
    const r = await request('GET', '/api/personality');
    return r.status === 200 && r.data.name === '狐九';
  });
  await test('人格切换正常', async () => {
    await request('POST', '/api/personality/switch', { name: '艾利' });
    const r = await request('GET', '/api/personality');
    return r.data.name === '艾利';
  });
  
  // 切换回狐九用于后续测试
  await request('POST', '/api/personality/switch', { name: '狐九' });

  // 3. 聊天
  console.log('\n📋 3. 基础聊天验收\n');
  await test('聊天回复正常', async () => {
    const r = await request('POST', '/api/chat', { text: '你好' });
    return r.status === 200 && r.data.reply && r.data.reply.length > 0;
  });
  await test('回复携带心情', async () => {
    const r = await request('POST', '/api/chat', { text: '测试' });
    return r.data.mood && typeof r.data.mood === 'string';
  });

  // 4. 路由
  console.log('\n📋 4. 路由功能验收\n');
  await test('Media 路由', async () => {
    const r = await request('POST', '/api/chat', { text: '下载一个视频' });
    return r.data.routing?.target === 'MediaAgent';
  });
  await test('Game 路由', async () => {
    const r = await request('POST', '/api/chat', { text: '我的世界好玩吗' });
    return r.data.routing?.target === 'GameAgent';
  });
  await test('普通聊天路由', async () => {
    const r = await request('POST', '/api/chat', { text: '今天天气' });
    const target = r.data.routing?.target;
    return target === 'ollama' || target === 'ChatAgent' || target === 'fallback';
  });

  // 5. 记忆
  console.log('\n📋 5. 记忆功能验收\n');
  await test('记忆获取正常', async () => {
    const r = await request('GET', '/api/memory');
    return r.status === 200 && typeof r.data === 'object';
  });
  await test('人格切换记录记忆', async () => {
    const r = await request('GET', '/api/memory');
    return Object.keys(r.data).some(k => k.includes('personality_switch'));
  });

  // 6. 游戏模块
  console.log('\n📋 6. 游戏模块验收\n');
  await test('游戏模块启用', async () => {
    const r = await request('GET', '/api/game/status');
    return r.data.enabled === true;
  });
  await test('游戏命令正常', async () => {
    const r = await request('POST', '/api/game/command', { command: '/status' });
    return r.status === 200;
  });
  await test('游戏事件 API 正常', async () => {
    const r = await request('GET', '/api/game/events');
    return r.status === 200;
  });

  // 7. Ollama
  console.log('\n📋 7. Ollama 验收\n');
  await test('Ollama 状态 API', async () => {
    const r = await request('GET', '/api/ollama/status');
    return r.data !== undefined;
  });

  // Summary
  console.log('\n');
  printSummary();
  
  if (failed === 0) {
    console.log('\n🎉 所有验收测试通过!\n');
    process.exit(0);
  } else {
    console.log(`\n⚠️  有 ${failed} 项测试未通过\n`);
    process.exit(1);
  }
}

function printSummary() {
  console.log('='.repeat(60));
  console.log(`   测试结果: ${passed} 通过, ${failed} 失败`);
  console.log('='.repeat(60));
  
  console.log('\n详细结果:\n');
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}`);
  });
}

run().catch(e => {
  console.error('测试失败:', e.message);
  process.exit(1);
});
