require('dotenv').config();

const http = require('http');

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
        'Content-Type': 'application/json',
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

async function test() {
  console.log('\n🎮 UltraWork Game Module Test\n');
  console.log('=' .repeat(50));

  // 1. Check if game is enabled
  console.log('\n1️⃣ Game Status');
  const status = await request('GET', '/api/game/status');
  console.log('   Enabled:', status.data.enabled ? '✅' : '❌');
  if (status.data.enabled) {
    console.log('   Connected:', status.data.connected ? '✅' : '❌');
    console.log('   Bot:', status.data.bot?.name || 'N/A');
  } else {
    console.log('   Message:', status.data.message);
    console.log('\n💡 Enable game by setting ENABLE_GAME=true in .env');
  }

  // 2. Test chat routing (should route to GameAgent)
  console.log('\n2️⃣ Game Chat Routing');
  const routes = [
    { name: '我的世界', text: '我的世界好玩吗' },
    { name: '游戏', text: '想玩游戏' },
    { name: '挖矿', text: '去挖矿吧' }
  ];
  
  for (const r of routes) {
    const c = await request('POST', '/api/chat', { text: r.text });
    const target = c.data.routing?.target;
    console.log(`   ${r.name}: ${target || 'unknown'}`);
  }

  // 3. Test memory (game events)
  console.log('\n3️⃣ Memory System');
  const mem = await request('GET', '/api/memory');
  const gameMem = Object.keys(mem.data).filter(k => k.includes('game'));
  console.log('   Game memories:', gameMem.length);
  Object.entries(mem.data).slice(0, 3).forEach(([k, v]) => {
    console.log(`   - ${k}: ${typeof v === 'object' ? JSON.stringify(v).substring(0, 50) : v}`);
  });

  // 4. Integration test
  console.log('\n4️⃣ Integration Check');
  const chat = await request('POST', '/api/chat', { text: '你好' });
  console.log('   Chat:', chat.status === 200 ? '✅' : '❌');
  const health = await request('GET', '/health');
  console.log('   Health:', health.data.ok ? '✅' : '❌');
  const ollama = await request('GET', '/api/ollama/status');
  console.log('   Ollama:', ollama.data.available ? '✅' : '❌');

  console.log('\n' + '='.repeat(50));
  console.log('\n✅ Game module test complete!\n');
}

test().catch(console.error);
