// Stage A: End-to-end validation runner for Stage A
const { execSync } = require('child_process');

function run(cmd) {
  try {
    console.log(`Running: ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

let total = 0, ok = 0, failed = 0, details = [];

const steps = [
  { name: 'Endpoints Test', cmd: 'node scripts/stageA-endpoints-test.js' },
  { name: 'Nodes Test', cmd: 'node scripts/stageA-nodes-test.js' },
  { name: 'Dependencies Test', cmd: 'node scripts/stageA-deps-test.js' },
  { name: 'Core Executors Test', cmd: 'node scripts/stageA-test.js' }
];

for (const s of steps) {
  const res = run(s.cmd);
  total++;
  if (res.ok) {
    ok++;
  } else {
    failed++;
  }
  details.push({ step: s.name, ok: res.ok, error: res.error || null });
}

console.log('\nStage A Validation Summary:');
console.log(`Total: ${total}, OK: ${ok}, Failed: ${failed}`);
console.log('Details:', JSON.stringify(details, null, 2));

if (failed > 0) process.exit(1);
else process.exit(0);
