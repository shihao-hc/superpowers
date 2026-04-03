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
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

async function test() {
  console.log('\n🎮 UltraWork Game Integration Test\n');
  console.log('='.repeat(50));

  // 1. Check game status
  console.log('\n1️⃣ Game Status');
  try {
    const status = await request('GET', '/api/game/status');
    console.log('   Enabled:', status.data.enabled ? '✅' : '❌');
    console.log('   Connected:', status.data.connected ? '✅' : '❌');
    if (status.data.bot) {
      console.log('   Bot name:', status.data.bot.username);
      console.log('   Position:', JSON.stringify(status.data.bot.position));
    }
  } catch (e) {
    console.log('   ❌ Game not available:', e.message);
  }

  // 2. Test game commands
  console.log('\n2️⃣ Game Commands');
  const commands = [
    { cmd: '/status', desc: 'Status' },
    { cmd: '/inventory', desc: 'Inventory' },
    { cmd: '/say Hello!', desc: 'Broadcast' }
  ];
  
  for (const { cmd, desc } of commands) {
    try {
      const res = await request('POST', '/api/game/command', { command: cmd });
      console.log(`   ${desc}:`, res.status === 200 ? '✅' : '❌');
    } catch (e) {
      console.log(`   ${desc}: ⚠️ ${e.message}`);
    }
  }

  // 3. Test chat routing to game
  console.log('\n3️⃣ Chat Routing to Game');
  const routes = [
    '我的世界',
    '玩游戏',
    '挖矿',
    '建造房子'
  ];
  
  for (const text of routes) {
    try {
      const res = await request('POST', '/api/chat', { text });
      const target = res.data.routing?.target;
      console.log(`   "${text}" → ${target}`);
    } catch (e) {
      console.log(`   "${text}": ⚠️`);
    }
  }

  // 4. Events history
  console.log('\n4️⃣ Events History');
  try {
    const events = await request('GET', '/api/game/events');
    console.log('   Events:', events.data.length || 0);
  } catch (e) {
    console.log('   ⚠️ Not available');
  }

  // 5. Performance test
  console.log('\n5️⃣ Performance');
  const start = Date.now();
  try {
    await request('GET', '/api/game/status');
    console.log('   Response time:', Date.now() - start, 'ms ✅');
  } catch (e) {
    console.log('   ❌ Failed');
  }

  console.log('\n' + '='.repeat(50));
  console.log('\n✅ Game integration test complete!\n');
}

test().catch(console.error);
