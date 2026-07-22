const fs = require('fs');
const { execSync } = require('child_process');
const f = 'config/index.js';
const orig = fs.readFileSync(f, 'utf8');
fs.appendFileSync(f, '\n// adversarial\nconst _ev2 = eval("3");\n');
try {
  const r = execSync('npx eslint --format json ' + JSON.stringify(f), { cwd: 'D:\\龙虾', stdio: 'pipe', encoding: 'utf8', timeout: 30000 });
  console.log('stdout:', r.trim());
} catch (e) {
  console.log('stdout:', (e.stdout || '').trim());
  console.log('stderr:', (e.stderr || '').trim().slice(0, 200));
}
fs.writeFileSync(f, orig);
