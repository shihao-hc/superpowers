const fixers = [];

function register(fixer) {
  fixers.push(fixer);
}

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
