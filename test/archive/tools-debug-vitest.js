const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = 'D:\\龙虾';

// Try running just this one test file
const testFile = 'tests/avatar-engine.test.js';
const snippet = '\ndescribe("ZC_adversarial",()=>{it("ZC_fail",()=>{expect(1).toBe(2)});});\n';
const orig = fs.readFileSync(testFile, 'utf8');
fs.appendFileSync(testFile, snippet);

try {
  console.log('=== npx vitest run --reporter verbose (single test) ===');
  const r = execSync('npx vitest run tests/avatar-engine.test.js --reporter verbose 2>&1', { 
    cwd: ROOT, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' 
  });
  console.log('EXIT:', r.status || 0);
  console.log('OUTPUT:', r.stdout.slice(-2000));
} catch (e) {
  console.log('EXIT:', e.status || 1);
  console.log('STDOUT:', (e.stdout || '').length, 'bytes');
  console.log('STDERR:', (e.stderr || '').length, 'bytes');
  console.log('STDOUT_LAST:', (e.stdout || '').slice(-1000));
  console.log('STDERR_FIRST:', (e.stderr || '').slice(0, 1000));
  console.log('has PASS:', (e.stdout || '').includes('PASS'));
  console.log('has FAIL:', (e.stdout || '').includes('FAIL'));
  console.log('has Test Files:', (e.stdout || '').includes('Test Files'));
}

fs.writeFileSync(testFile, orig);
console.log('\n=== Done');
