#!/usr/bin/env node
const fs = require('fs');
const { spawnSync } = require('child_process');
const b = JSON.parse(fs.readFileSync('.guardrail-baseline.json', 'utf8'));
const before = b.perFile.length;
const root = fs.realpathSync('.');
const filtered = [];
for (const e of b.perFile) {
  const f = require('path').join(root, e.file);
  if (fs.existsSync(f)) { filtered.push(e); continue; }
  try {
    const r = spawnSync('git', ['ls-files', '--', e.file], { cwd: root, stdio: 'pipe', encoding: 'utf8', timeout: 5000 });
    if (r.stdout.trim().length > 0) { filtered.push(e); console.log('Kept (git tracked):', e.file); }
    else { console.log('Removing stale:', e.file, e.errors + 'e/' + e.warnings + 'w'); }
  } catch (ex) {
    console.log('Removing stale (git error):', e.file);
  }
}
b.perFile = filtered;
b.totalErrors = filtered.reduce((s, e) => s + (e.errors || 0), 0);
b.totalWarnings = filtered.reduce((s, e) => s + (e.warnings || 0), 0);
fs.writeFileSync('.guardrail-baseline.json', JSON.stringify(b, null, 2));
console.log('Baseline cleaned. Before: ' + before + ' After: ' + filtered.length);
