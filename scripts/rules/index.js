const fs = require('fs');
const path = require('path');

const _rules = [];

function loadRules(rulesDir) {
  const files = fs.readdirSync(rulesDir)
    .filter(f => f.endsWith('.js') && f !== 'index.js')
    .sort();

  for (const file of files) {
    try {
      const rule = require(path.resolve(rulesDir, file));
      if (!rule.id || !rule.severity) {
        console.warn(`[rules] Skipping ${file}: missing id or severity`);
        continue;
      }
      rule.enabled = rule.enabled !== false;
      _rules.push(rule);
    } catch (err) {
      console.warn(`[rules] Failed to load ${file}: ${err.message}`);
    }
  }
  return _rules;
}

function getRules(options) {
  let result = _rules;
  if (options) {
    const { severity, enabled } = options;
    if (severity) result = result.filter(r => r.severity === severity);
    if (enabled !== undefined) result = result.filter(r => r.enabled === enabled);
  }
  return result;
}

function getRule(id) {
  return _rules.find(r => r.id === id);
}

function reloadRules(rulesDir) {
  _rules.length = 0;
  for (const key of Object.keys(require.cache)) {
    if (key.includes(rulesDir)) {
      delete require.cache[key];
    }
  }
  return loadRules(rulesDir);
}

module.exports = { loadRules, getRules, getRule, reloadRules, isCustomMatchRule };

function isCustomMatchRule(rule) {
  return typeof rule.match === 'function';
}
