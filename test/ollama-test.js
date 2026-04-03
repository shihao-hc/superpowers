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
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function main() {
  const PORT = 3000;
  const BASE = `http://localhost:${PORT}`;

  console.log('\n=== UltraWork Ollama Integration Test ===\n');

  // 1. Health Check
  console.log('1. Health Check');
  try {
    const health = await request(`${BASE}/health`);
    console.log('   Status:', health.status);
    console.log('   Inference:', health.data.inference || 'unknown');
    console.log('   Ollama:', health.data.ollamaConnected ? 'Connected' : 'Not connected');
  } catch (e) {
    console.log('   ❌ Server not running:', e.message);
    console.log('\n💡 Start server with: USE_OLLAMA=true node server/staticServer.js');
    console.log('   Or: npm start');
    return;
  }

  // 2. Ollama Status
  console.log('\n2. Ollama Status');
  try {
    const ollama = await request(`${BASE}/api/ollama/status`);
    console.log('   Available:', ollama.data.available ? '✅ Yes' : '❌ No');
    if (ollama.data.models) {
      console.log('   Models:', ollama.data.models.map(m => m.name).join(', ') || 'none');
    }
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 3. Personality API
  console.log('\n3. Personality API');
  try {
    const persona = await request(`${BASE}/api/personality`);
    console.log('   Name:', persona.data.name);
    console.log('   Mood:', persona.data.mood);
    console.log('   Personalities:', persona.data.allPersonalities?.join(', ') || 'unknown');
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 4. Chat Test (Mock Response)
  console.log('\n4. Chat Test');
  try {
    const chat = await request(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '你好，你叫什么名字？' })
    });
    console.log('   Response:', chat.data.reply?.substring(0, 100));
    console.log('   Engine:', chat.data.routing?.target || 'unknown');
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // 5. Test with Ollama if available
  console.log('\n5. Ollama Direct Test');
  try {
    const res = await request(`http://localhost:11434/api/tags`);
    if (res.status === 200) {
      console.log('   ✅ Ollama API accessible');
      console.log('   Available models:', res.data.models?.map(m => m.name).join(', ') || 'none');
    } else {
      console.log('   ❌ Ollama not responding');
    }
  } catch (e) {
    console.log('   ❌ Ollama not running');
    console.log('\n💡 Install Ollama: https://ollama.ai');
    console.log('   Then run: ollama pull llama3.2');
  }

  console.log('\n=== Test Complete ===\n');
}

main().catch(console.error);
