require('./auto-fix/crypto-fix');
require('./auto-fix/hash-fix');
require('./auto-fix/body-limit-fix');
require('./auto-fix/helmet-fix');
require('./auto-fix/security-header-fix');
require('./auto-fix/trust-proxy-fix');
require('./auto-fix/node-env-fix');
require('./auto-fix/empty-catch-fix');
require('./auto-fix/cookie-fix');
require('./auto-fix/var-declaration-fix');
const { canFix, fixAll } = require('./auto-fix');
const { scanFiles } = require('./security-scan');

const isDryRun = process.argv.includes('--fix-dry-run') || !process.argv.includes('--fix');
const files = process.argv.slice(2).filter(f => f && !f.startsWith('-'));

if (files.length === 0) {
  console.log('Usage: node scripts/security-fix.js [--fix | --fix-dry-run] <file1.js> [file2.js ...]');
  console.log('  --fix           修改文件应用修复');
  console.log('  --fix-dry-run   只输出建议不修改（默认）');
  process.exit(0);
}

const results = scanFiles(files);
const fixable = results.filter(r => canFix(r.ruleId));

if (fixable.length === 0) {
  console.log('No fixable issues found.');
  process.exit(0);
}

console.log(`Found ${fixable.length} fixable issue(s):`);
const applied = fixAll(fixable, isDryRun);
for (const a of applied) {
  if (isDryRun) {
    console.log(`  ${a.file}:${a.line}`);
    console.log(`    - ${a.before}`);
    console.log(`    + ${a.after}`);
  } else {
    console.log(`  ${a.file}:${a.line} - fixed`);
  }
}
