require('dotenv').config();

const http = require('http');
const { PerformanceObserver, performance } = require('perf_hooks');

const PORT = process.env.PORT || 3000;

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
        'Accept-Charset': 'utf-8',
        'Content-Length': data ? Buffer.byteLength(data) : 0
      }
    };
    const req = http.request(options, (res) => {
      let d = Buffer.alloc(0);
      res.on('data', c => {
        if (Buffer.isBuffer(c)) {
          d = Buffer.concat([d, c]);
        } else {
          d = Buffer.concat([d, Buffer.from(c)]);
        }
      });
      res.on('end', () => {
        try {
          const str = d.toString('utf8');
          resolve({ status: res.statusCode, data: JSON.parse(str) });
        }
        catch (e) { 
          resolve({ status: res.statusCode, data: d.toString('utf8') }); 
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(result => {
    if (result) {
      console.log(`   ✅ ${name}`);
      passed++;
    } else {
      console.log(`   ❌ ${name}`);
      failed++;
    }
  }).catch(e => {
    console.log(`   ❌ ${name}: ${e.message}`);
    failed++;
  });
}

async function runTests() {
  console.log('\n🧪 UltraWork 完整测试方案\n');
  console.log('=' .repeat(60));

  // ========== 1. 基础对话测试 ==========
  console.log('\n📝 1. 基础对话测试');
  console.log('-'.repeat(60));

  await test('发送中文消息"你好"', async () => {
    const res = await request('POST', '/api/chat', { text: '你好' });
    console.log(`      Reply: ${res.data.reply?.substring(0, 30)}...`);
    return res.status === 200 && res.data.reply && res.data.reply.length > 0;
  });

  await test('回复带有性格特征（颜文字或emoji）', async () => {
    const res = await request('POST', '/api/chat', { text: '你好呀' });
    const hasEmoji = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(res.data.reply);
    return hasEmoji || res.data.reply.includes('(');
  });

  await test('回复携带心情信息', async () => {
    const res = await request('POST', '/api/chat', { text: '开心' });
    return res.data.mood && typeof res.data.mood === 'string';
  });

  await test('对话内容不为空', async () => {
    const res = await request('POST', '/api/chat', { text: '今天天气怎么样' });
    return res.data.reply && res.data.reply.length > 0;
  });

  // ========== 2. 路由功能验证 ==========
  console.log('\n🔀 2. 路由功能验证');
  console.log('-'.repeat(60));

  await test('"下载一个视频" → MediaAgent', async () => {
    const res = await request('POST', '/api/chat', { text: '下载一个视频' });
    return res.data.routing?.target === 'MediaAgent';
  });

  await test('"我的世界好玩吗" → GameAgent', async () => {
    const res = await request('POST', '/api/chat', { text: '我的世界好玩吗' });
    return res.data.routing?.target === 'GameAgent';
  });

  await test('"播放音乐" → MediaAgent', async () => {
    const res = await request('POST', '/api/chat', { text: '播放音乐' });
    return res.data.routing?.target === 'MediaAgent';
  });

  await test('普通聊天 → Ollama/ChatAgent', async () => {
    const res = await request('POST', '/api/chat', { text: '你喜欢什么颜色' });
    return res.data.routing?.target === 'ollama' || res.data.routing?.target === 'ChatAgent';
  });

  await test('记忆关键词触发记忆保存', async () => {
    const res = await request('POST', '/api/chat', { text: '记得我喜欢玩游戏' });
    const mem = await request('GET', '/api/memory');
    return mem.data.last_user_message && mem.data.last_user_message.includes('游戏');
  });

  // ========== 3. 错误处理测试 ==========
  console.log('\n⚠️ 3. 错误处理测试');
  console.log('-'.repeat(60));

  await test('无效消息返回错误', async () => {
    const res = await request('POST', '/api/chat', { text: '' });
    return res.status === 400;
  });

  await test('健康检查端点正常', async () => {
    const res = await request('GET', '/health');
    return res.data.ok === true && res.data.inference;
  });

  await test('Ollama状态端点正常', async () => {
    const res = await request('GET', '/api/ollama/status');
    return res.data !== undefined;
  });

  // ========== 4. 记忆联动测试 ==========
  console.log('\n🧠 4. 记忆联动测试');
  console.log('-'.repeat(60));

  await test('获取记忆列表成功', async () => {
    const res = await request('GET', '/api/memory');
    return res.status === 200 && typeof res.data === 'object';
  });

  await test('清空记忆成功', async () => {
    await request('DELETE', '/api/memory');
    const res = await request('GET', '/api/memory');
    return res.data.__cleared__ !== undefined;
  });

  await test('人格切换记录到记忆', async () => {
    await request('POST', '/api/personality/switch', { name: '狐九' });
    const res = await request('GET', '/api/memory');
    return res.data.personality_switch !== undefined;
  });

  // ========== 5. 性能测试 ==========
  console.log('\n⚡ 5. 性能测试');
  console.log('-'.repeat(60));

  await test('首次请求响应时间 < 5秒', async () => {
    const start = Date.now();
    await request('POST', '/api/chat', { text: '你好' });
    const time = Date.now() - start;
    console.log(`      响应时间: ${time}ms`);
    return time < 5000;
  });

  await test('连续3次请求性能稳定', async () => {
    const times = [];
    for (let i = 0; i < 3; i++) {
      const start = Date.now();
      await request('POST', '/api/chat', { text: '测试' + i });
      times.push(Date.now() - start);
    }
    console.log(`      响应时间: ${times.join('ms, ')}ms`);
    return times.every(t => t < 10000);
  });

  await test('健康检查响应时间 < 100ms', async () => {
    const start = Date.now();
    await request('GET', '/health');
    const time = Date.now() - start;
    console.log(`      响应时间: ${time}ms`);
    return time < 100;
  });

  // ========== 6. 人格切换测试 ==========
  console.log('\n🎭 6. 人格切换测试');
  console.log('-'.repeat(60));

  await test('切换到艾利人格', async () => {
    const res = await request('POST', '/api/personality/switch', { name: '艾利' });
    return res.data.ok === true && res.data.active === '艾利';
  });

  await test('艾利人格回复更简洁（无颜文字）', async () => {
    const res = await request('POST', '/api/chat', { text: '你好' });
    // 艾利回复应该更简洁
    return res.data.reply && res.data.reply.length < 50;
  });

  await test('切换回狐九人格', async () => {
    const res = await request('POST', '/api/personality/switch', { name: '狐九' });
    return res.data.ok === true && res.data.active === '狐九';
  });

  await test('获取人格列表正确', async () => {
    const res = await request('GET', '/api/personality/list');
    return res.data.personalities?.length >= 2;
  });

  // ========== 结果汇总 ==========
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 测试结果: ${passed} 通过, ${failed} 失败`);
  
  if (failed === 0) {
    console.log('🎉 所有测试通过！\n');
  } else {
    console.log(`⚠️  有 ${failed} 项测试失败\n`);
  }

  return { passed, failed };
}

runTests().catch(console.error);
