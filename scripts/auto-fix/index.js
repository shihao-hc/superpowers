const fixers = [];

function register(fixer) {
  fixers.push(fixer);
}

// Pre-export register so sub-modules can access it via require() before we finish loading
module.exports = { register };

// Load all fix modules so they register themselves
require('./body-limit-fix');
require('./cookie-fix');
require('./crypto-fix');
require('./empty-catch-fix');
require('./hash-fix');
require('./helmet-fix');
require('./node-env-fix');
require('./security-header-fix');
require('./trust-proxy-fix');
require('./var-declaration-fix');

function canFix(ruleId) {
  return fixers.some(f => f.ruleIds.includes(ruleId));
}

function applyFix(filePath, match, dryRun) {
  const fixer = fixers.find(f => f.ruleIds.includes(match.ruleId));
  if (!fixer) return null;
  return fixer.fix(filePath, match, dryRun);
}

function fixAll(results, dryRun) {
  const applied = [];
  for (const match of results) {
    const result = applyFix(match.file, match, dryRun);
    if (result) applied.push(result);
  }
  return applied;
}

module.exports = { register, canFix, applyFix, fixAll };
