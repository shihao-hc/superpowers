const express = require('express');
const app = express();
app.use(express.json());

const { PersonalityManager } = require('../src/personality/PersonalityManager');
const ChatAgent = require('../src/agents/ChatAgent');
const RouterAgent = require('../src/agents/RouterAgent');
const MemoryAgent = require('../src/agents/MemoryAgent');
const MediaAgent = require('../src/agents/MediaAgent');
const GameAgent = require('../src/agents/GameAgent');

const pm = new PersonalityManager('./data/personalities.json');
pm.loadSync();
const chat = new ChatAgent(pm);
const memory = new MemoryAgent();
const media = new MediaAgent();
const game = new GameAgent();
const router = new RouterAgent(pm, chat, memory, media, game);

app.get('/api/personality', (req, res) => {
  const persona = pm.getCurrentPersonality();
  res.json({ name: persona?.name, mood: pm.getMood(), tts: pm.getTTSConfig(), routing: persona?.routing });
});

app.post('/api/chat', (req, res) => {
  const { text } = req.body || {};
  const result = router.routeMessage(text);
  res.json(result);
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Full server ready on port ${PORT}`);
  runTests();
});

function runTests() {
  const http = require('http');
  
  function get(path) {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${PORT}${path}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });
  }
  
  function post(path, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request(`http://localhost:${PORT}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
      }, (res) => {
        let result = '';
        res.on('data', chunk => result += chunk);
        res.on('end', () => resolve(JSON.parse(result)));
      });
      req.write(data);
      req.end();
    });
  }
  
  async function test() {
    console.log('\n=== 1. Health ===');
    console.log(await get('/health'));
    
    console.log('\n=== 2. TTS Config (happy mood) ===');
    const personality = await get('/api/personality');
    console.log(JSON.stringify(personality.tts, null, 2));
    
    console.log('\n=== 3. Routing Tests ===');
    const tests = [
      { name: 'Media (下载视频)', text: '下载一个视频' },
      { name: 'Game (我的世界)', text: '我的世界好玩吗' },
      { name: 'Memory (记得)', text: '记得昨天天气' },
      { name: 'Weather', text: '今天天气怎么样' },
      { name: 'Search', text: '搜索一下' },
      { name: 'Chat (普通)', text: '你好啊' },
    ];
    
    for (const t of tests) {
      const result = await post('/api/chat', { text: t.text });
      console.log(`  ${t.name}: ${result.routing?.target || 'unknown'}`);
    }
    
    console.log('\n=== 4. Response Samples ===');
    const greetings = ['你好', 'hi', 'hello'];
    for (const g of greetings) {
      const result = await post('/api/chat', { text: g });
      console.log(`  "${g}" -> ${result.reply}`);
    }
    
    console.log('\n=== 5. Memory Test ===');
    memory.remember('user_preference', '喜欢mc');
    console.log('  Stored: user_preference = 喜欢mc');
    console.log('  Retrieved:', memory.retrieve('user_preference'));
    console.log('  Memory dump:', memory.dump());
    
    console.log('\n=== 6. Personality API ===');
    const allPersonas = await get('/api/personality');
    console.log('  All personalities:', allPersonas.allPersonalities);
    console.log('  Current:', allPersonas.name, '- Mood:', allPersonas.mood);
    
    console.log('\n✅ All tests completed!');
    process.exit(0);
  }
  
  test().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  });
}
