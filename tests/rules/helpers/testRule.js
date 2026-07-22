const path = require('path');
const { loadRules, getRules, getRule, isCustomMatchRule } = require('../../../scripts/rules');

const RULES_DIR = path.resolve(__dirname, '../../../scripts/rules');

let _loaded = false;
function ensureRules() {
  if (!_loaded) {
    loadRules(RULES_DIR);
    _loaded = true;
  }
}

function resetRules() {
  _loaded = false;
  const { reloadRules } = require('../../../scripts/rules');
  reloadRules(RULES_DIR);
  _loaded = true;
}

function runRule(content, ruleId, relativePath = 'test.js') {
  ensureRules();
  const rule = getRule(ruleId);
  if (!rule) {throw new Error(`Rule ${ruleId} not found (loaded rules: ${getRules().map((r) => r.id).join(', ')})`);}

  const results = [];
  const lines = content.replace(/\r\n/g, '\n').split('\n');

  if (isCustomMatchRule(rule)) {
    rule.match(lines, relativePath, `/fake/path/${relativePath}`, (severity, rid, detail, message) => {
      results.push({ severity, ruleId: rid, file: relativePath, message, detail });
    });
  } else {
    for (const pattern of rule.patterns) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!pattern.test(line)) {continue;}
        if (rule.excludePatterns && rule.excludePatterns.some((ep) => ep.test(line))) {continue;}
        if (rule.context && rule.context.requireKeywords && rule.context.requireKeywords.length > 0) {
          const hasKeyword = rule.context.requireKeywords.some((kw) =>
            line.toLowerCase().includes(kw.toLowerCase())
          );
          if (!hasKeyword) {continue;}
        }
        results.push({
          severity: rule.severity,
          ruleId: rule.id,
          file: relativePath,
          message: rule.description,
          detail: `行 ${i + 1}: ${line.trim().substring(0, 100)}`
        });
      }
    }
  }

  return results;
}

function getAllRuleIds(severity) {
  ensureRules();
  let rules = getRules({ enabled: true });
  if (severity) {rules = rules.filter((r) => r.severity === severity);}
  return rules.map((r) => r.id);
}

module.exports = { runRule, getAllRuleIds, resetRules };
