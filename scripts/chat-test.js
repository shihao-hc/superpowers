/**
 * chat-test.js — 真实对话体验测试客户端（弥补测试纪律短板的工具保证）
 *
 * 用法:
 *   node scripts/chat-test.js "消息文本"            # 自动生成合法 sid（≥16字符）
 *   node scripts/chat-test.js "消息文本" mysid123   # 指定 sid
 *   node scripts/chat-test.js --sequence "第一句" "第二句"  # 同 sid 多轮（测记忆/上下文）
 *
 * 为什么存在: 曾连续两次用短 sid 测记忆导致"假失效"（14/15字符 < 16被拒 → 每次不同 anon）。
 * 光"记得数长度"不够（靠意志会手滑）——用工具保证 sid 合法，这是把短板变成条件反射。
 */
const http = require('http');

const HOST = 'localhost';
const PORT = 3000;

function makeSid() {
  // 合法 sid: /^[a-zA-Z0-9_-]{16,64}$/
  return `autotest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`.slice(0, 32);
}

function call(text, sid) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ text });
    const req = http.request({
      host: HOST, port: PORT, path: '/api/chat', method: 'POST', timeout: 60000,
      headers: { 'Content-Type': 'application/json', 'x-session-id': sid, 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('bad json: ' + data.slice(0, 80))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(body); req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  let texts = [];
  let explicitSid = null;
  if (args[0] === '--sequence') {
    texts = args.slice(1);
  } else {
    texts = [args[0]];
    if (args[1]) { explicitSid = args[1]; }
  }
  if (texts.length === 0 || !texts[0]) {
    console.log('用法: node scripts/chat-test.js "消息" [sid]  |  node scripts/chat-test.js --sequence "第一句" "第二句"');
    process.exit(1);
  }
  const sid = explicitSid || makeSid();
  if (!/^[a-zA-Z0-9_-]{16,64}$/.test(sid)) {
    console.log(`❌ sid 非法（长度 ${sid.length}，需 ≥16）: "${sid}"`);
    process.exit(1);
  }
  console.log(`sid: ${sid}（合法 ${sid.length} 字符）`);
  for (const text of texts) {
    const t = Date.now();
    const r = await call(text, sid);
    const ms = Date.now() - t;
    const src = r.data ? r.data.source : '?';
    const reply = (r.data && r.data.text || '').replace(/\n/g, ' | ').substring(0, 120);
    console.log(`[${ms}ms | ${src}] "${text}"\n  → ${reply}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1); });