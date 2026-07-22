const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = 'D:\\龙虾';
const testFile = 'tests/avatar-engine.test.js';

// Append adversarial code
const snippet = '\ndescribe("ZC_adversarial",()=>{it("ZC_fail",()=>{expect(1).toBe(2)});});\n';
const orig = fs.readFileSync(testFile, 'utf8');
fs.appendFileSync(testFile, snippet);

  console.log('=== Running npm test with adversarial code ===\n');
try {
  const r = execSync('npm test', { cwd: ROOT, timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
  console.log('EXIT CODE:', r.status || 0);
  console.log('STDOUT:', r.stdout.length, 'bytes');
  console.log('STDERR:', r.stderr.length, 'bytes');
  const lines = (r.stdout + r.stderr).split('\n').filter(l => l.includes('Test') || l.includes('test') || l.includes('failed') || l.includes('passed'));
  for (const l of lines.slice(-10)) console.log(l);
} catch (e) {
  console.log('EXIT CODE:', e.status || 1);
  console.log('STDOUT LENGTH:', (e.stdout || '').length);
  console.log('STDERR LENGTH:', (e.stderr || '').length);
  console.log('STDERR SAMPLE:', (e.stderr || '').slice(0, 500));
  const all = (e.stdout || '') + (e.stderr || '');
  const lines = all.split('\n').filter(l => l.includes('Test') || l.includes('test') || l.includes('failed') || l.includes('passed'));
  for (const l of lines.slice(-10)) console.log(l);
}

fs.writeFileSync(testFile, orig);
console.log('\n=== Cleanup done');
