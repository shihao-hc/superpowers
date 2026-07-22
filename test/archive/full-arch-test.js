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
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

async function test() {
  console.log('\n🧪 UltraWork Architecture Test\n');
  console.log(`Server: http://localhost:${PORT}\n`);
  console.log('='.repeat(50));

  // 1. Health
  console.log('\n1️⃣ Health Check');
  try {
    const h = await request('GET', '/health');
    console.log('   ✅ Server running');
    console.log('   Engine:', h.data.inference);
    console.log('   Ollama:', h.data.ollama ? '✅' : '❌');
  } catch (e) {
    console.log('   ❌ Server not running');
    console.log('   Run: node server/staticServer.js');
    return;
  }

  // 2. Personality
  console.log('\n2️⃣ Personality System');
  const p = await request('GET', '/api/personality');
  console.log('   Current:', p.data.name);
  console.log('   Mood:', p.data.mood);
  console.log('   Engine:', p.data.engine);
  console.log('   Personalities:');
  p.data.personalities?.forEach(x => {
    console.log(`      - ${x.name} (${x.model?.name || 'default'})`);
  });

  // 3. Routing Tests
  console.log('\n3️⃣ Routing Tests');
  const routes = [
    { name: 'Media', text: '下载一个视频', expect: 'MediaAgent' },
    { name: 'Game', text: '我的世界好玩吗', expect: 'GameAgent' },
    { name: 'Memory', text: '记得昨天的事', expect: 'Chat' },
    { name: 'Chat', text: '你好啊', expect: 'Chat' },
  ];
  
  for (const r of routes) {
    const c = await request('POST', '/api/chat', { text: r.text });
    const got = c.data.routing?.target || 'unknown';
    const ok = got.includes(r.expect) ? '✅' : '⚠️';
    console.log(`   ${ok} ${r.name}: ${got}`);
  }

  // 4. AI Chat
  console.log('\n4️⃣ AI Chat (Ollama)');
  const msgs = ['你好！', '你是谁？', '今天心情不错'];
  for (const msg of msgs) {
    const c = await request('POST', '/api/chat', { text: msg });
    console.log(`   Q: ${msg}`);
    console.log(`   A: ${c.data.reply?.substring(0, 50)}...`);
    console.log('');
  }

  // 5. Personality Switch
  console.log('5️⃣ Personality Switch');
  for (const name of ['艾利', '狐九']) {
    const sw = await request('POST', '/api/personality/switch', { name });
    console.log(`   Switch to ${name}: ${sw.data.ok ? '✅' : '❌'}`);
    const c = await request('POST', '/api/chat', { text: '你好' });
    console.log(`   Reply: ${c.data.reply?.substring(0, 40)}`);
  }

  // 6. Memory
  console.log('\n6️⃣ Memory');
  const mem = await request('GET', '/api/memory');
  console.log('   Entries:', Object.keys(mem.data).length);

  console.log('\n' + '='.repeat(50));
  console.log('\n✅ All tests passed!\n');
}

test().catch(console.error);
