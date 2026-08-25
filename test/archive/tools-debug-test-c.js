const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = 'D:\\龙虾';
const testFileC = 'tests/avatar-engine.test.js';

function run(cmd, opts = {}) {
  try {
    const timeout = opts.timeout || 60000;
    const child = execSync(cmd, { cwd: ROOT, timeout, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
    return { stdout: '' + child.stdout, stderr: '' + child.stderr, exitCode: child.status || 0 };
  } catch (e) {
    return { stdout: '' + e.stdout, stderr: '' + e.stderr, exitCode: e.status || 1 };
  }
}

// 1. Append adversarial code
const snippet = '\ndescribe("ZC_adversarial",()=>{it("ZC_fail",()=>{expect(1).toBe(2)});});\n';
const orig = fs.readFileSync(testFileC, 'utf8');
fs.appendFileSync(testFileC, snippet);
console.log('=== Adversarial code appended to', testFileC);
console.log('Last 100 chars:', fs.readFileSync(testFileC, 'utf8').slice(-100));

// 2. Run verify
console.log('\n=== Running verify...');
const r = run(`node tools/guardrail-fix.js verify tests/avatar-engine.test.js`, { timeout: 300000 });
console.log('\n=== VERIFY STDOUT (first 2000 chars):');
console.log(r.stdout.slice(0, 2000));
console.log('...');
console.log('\n=== VERIFY STDERR:', r.stderr.slice(0, 500));
console.log('\n=== EXIT CODE:', r.exitCode);

// 3. Check for specific strings
console.log('\n=== KEY CHECK STRINGS:');
console.log('Has "⚠ Test":', r.stdout.includes('⚠ Test'));
console.log('Has "⚠ Tests":', r.stdout.includes('⚠ Tests'));
console.log('Has "Test error":', r.stdout.includes('Test error'));
console.log('Has "Tests error":', r.stdout.includes('Tests error'));
console.log('Has "Regression detected":', r.stdout.includes('Regression detected'));
console.log('Has "hasTestTarget":', r.stdout.includes('hasTestTarget'));
console.log('Has "npm test":', r.stdout.includes('npm test'));
console.log('Has "505":', r.stdout.includes('505'));
console.log('Has "passed":', r.stdout.includes('passed'));
console.log('Has "failed":', r.stdout.includes('failed'));

// 4. Search for test output in verify stdout
const lines = r.stdout.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Tests') || lines[i].includes('Test') || lines[i].includes('pass') || lines[i].includes('fail') || lines[i].includes('error') || lines[i].includes('npm')) {
    console.log(`LINE ${i}: ${lines[i].trim()}`);
  }
}

// Cleanup
fs.writeFileSync(testFileC, orig);
console.log('\n=== Cleanup done');
