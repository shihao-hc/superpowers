const fs = require('fs');
const { execSync } = require('child_process');
const ROOT = 'D:\\龙虾';

// Test with simple.test.ts (included in vitest)
const testFile = 'tests/simple.test.ts';
const orig = fs.readFileSync(testFile, 'utf8');
fs.appendFileSync(testFile, '\ntest("ZC_adversarial_fail", () => { expect(1).toBe(2); });\n');

try {
  const r = execSync('npm test 2>&1', { cwd: ROOT, timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
  console.log('EXIT:', r.status || 0);
  console.log('OUTPUT:', r.stdout.length, 'bytes');
  const lines = r.stdout.split('\n').filter(l => l.includes('Test') || l.includes('test') || l.includes('failed') || l.includes('passed'));
  for (const l of lines.slice(-5)) console.log(l);
} catch (e) {
  console.log('EXIT:', e.status || 1);
  console.log('STDOUT:', (e.stdout || '').length, 'bytes');
  console.log('STDERR:', (e.stderr || '').length, 'bytes');
  const all = (e.stdout || '') + (e.stderr || '');
  console.log('ALL LAST 500:', all.slice(-500));
}

fs.writeFileSync(testFile, orig);
console.log('\nDone');
