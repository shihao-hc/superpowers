const fs = require('fs');
const { execSync } = require('child_process');
const root = 'D:\\龙虾';

// Check config/index.js with eval
const f = 'config/index.js';
const orig = fs.readFileSync(f, 'utf8');
fs.appendFileSync(f, '\nconst _ev2 = eval("3");\n');
try {
  const r = execSync('npx eslint --format json ' + JSON.stringify(f), { cwd: root, stdio: 'pipe', encoding: 'utf8', timeout: 30000 });
  const d = JSON.parse(r.trim());
  console.log('config/index.js with eval:');
  console.log('  errors:', d[0]?.errorCount, '  warnings:', d[0]?.warningCount);
  if (d[0]?.messages?.length > 0) {
    for (const m of d[0].messages) console.log('  msg:', m.ruleId, m.message.slice(0, 80));
  }
} catch (e) {
  const d = JSON.parse(e.stdout.trim());
  console.log('config/index.js with eval:');
  console.log('  errors:', d[0]?.errorCount, '  warnings:', d[0]?.warningCount);
  if (d[0]?.messages?.length > 0) {
    for (const m of d[0].messages) console.log('  msg:', m.ruleId, m.message.slice(0, 80));
  }
}
fs.writeFileSync(f, orig);

// Check the test file
const t = 'tests/avatar-engine.test.js';
if (fs.existsSync(t)) {
  const origT = fs.readFileSync(t, 'utf8');
  fs.appendFileSync(t, '\ntest("ZC_adversarial_fail", () => { expect(1).toBe(2); });\n');
  try {
    const eslR = execSync('npx eslint --format json ' + JSON.stringify(t), { cwd: root, stdio: 'pipe', encoding: 'utf8', timeout: 30000 });
    const eD = JSON.parse(eslR.trim());
    console.log('test file with adversarial:');
    console.log('  errors:', eD[0]?.errorCount, '  warnings:', eD[0]?.warningCount);
  } catch (e) {
    const eD = JSON.parse(e.stdout.trim());
    console.log('test file with adversarial:');
    console.log('  errors:', eD[0]?.errorCount, '  warnings:', eD[0]?.warningCount);
  }
  fs.writeFileSync(t, origT);
}
