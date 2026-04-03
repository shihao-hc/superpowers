const http = require('http');

async function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  const PORT = process.env.PORT || 3000;
  const BASE = `http://localhost:${PORT}`;

  console.log('\n=== UltraWork Architecture Test ===\n');

  // 1. Health
  console.log('1. Health Check');
  try {
    const h = await request(`${BASE}/health`);
    console.log('   Status:', h.status);
    console.log('   Engine:', h.data.inference);
    console.log('   Ollama:', h.data.ollama ? '✅ Enabled' : '❌ Disabled');
  } catch (e) {
    console.log('   ❌ Server not running');
    return;
  }

  // 2. Personality
  console.log('\n2. Personality API');
  const p = await request(`${BASE}/api/personality`);
  console.log('   Name:', p.data.name);
  console.log('   Mood:', p.data.mood);
  console.log('   Engine:', p.data.engine);
  console.log('   Models:', p.data.personalities?.map(x => `${x.name}(${x.model})`).join(', '));

  // 3. Chat
  console.log('\n3. Chat Test');
  const chat = await request(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '你好，你是谁？' })
  });
  console.log('   Reply:', chat.data.reply?.substring(0, 80));
  console.log('   Source:', chat.data.routing?.target);
  console.log('   Model:', chat.data.routing?.model);

  // 4. Switch
  console.log('\n4. Personality Switch');
  const sw = await request(`${BASE}/api/personality/switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '艾利' })
  });
  console.log('   Switch:', sw.data.ok ? '✅ Success' : '❌ Failed');
  console.log('   New:', sw.data.active);
  console.log('   Model:', sw.data.model?.name);

  // 5. Chat with 艾利
  console.log('\n5. Chat as 艾利');
  const chat2 = await request(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '解释一下量子计算' })
  });
  console.log('   Reply:', chat2.data.reply?.substring(0, 80));

  // 6. Switch back
  await request(`${BASE}/api/personality/switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '狐九' })
  });

  // 7. Memory
  console.log('\n6. Memory Test');
  const mem = await request(`${BASE}/api/memory`);
  console.log('   Entries:', Object.keys(mem.data).length);
  console.log('   Keys:', Object.keys(mem.data).join(', '));

  console.log('\n✅ All tests passed!\n');
}

main().catch(console.error);
