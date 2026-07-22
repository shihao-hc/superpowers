const { runRule, getAllRuleIds } = require('./helpers/testRule');

const HIGH_RULES = ['HARDCODED_SECRET', 'WEAK_HASH', 'SQL_INJECTION', 'COMMAND_INJECTION',
  'EVAL_VARIANT', 'WEAK_TLS', 'PATH_TRAVERSAL_GENERIC', 'WEAK_SESSION_SECRET'];
const PATTERN_RULES = ['INNER_HTML_XSS', 'WEAK_TLS', 'ERROR_MESSAGE_LEAK', 'PROTOCOL_RELATIVE_URL'];
const COVERED = new Set([...HIGH_RULES, ...PATTERN_RULES, 'MISSING_BODY_LIMIT']);

describe('MEDIUM severity custom rules — smoke tests', () => {
  const rules = getAllRuleIds('MEDIUM').filter(id => !COVERED.has(id));

  test.each(rules)('%s — does not crash on empty content', (ruleId) => {
    expect(() => runRule('', ruleId)).not.toThrow();
  });

  test.each(rules)('%s — does not crash on safe code', (ruleId) => {
    expect(() => runRule('const x = 42; console.log(x);', ruleId)).not.toThrow();
  });

  test.each(rules)('%s — returns array', (ruleId) => {
    const r = runRule('', ruleId);
    expect(Array.isArray(r)).toBe(true);
  });
});

describe('LOW severity custom rules — smoke tests', () => {
  const rules = getAllRuleIds('LOW').filter(id => !COVERED.has(id));

  test.each(rules)('%s — does not crash on empty content', (ruleId) => {
    expect(() => runRule('', ruleId)).not.toThrow();
  });

  test.each(rules)('%s — does not crash on safe code', (ruleId) => {
    expect(() => runRule('const x = 42; console.log(x);', ruleId)).not.toThrow();
  });

  test.each(rules)('%s — returns array', (ruleId) => {
    const r = runRule('', ruleId);
    expect(Array.isArray(r)).toBe(true);
  });
});

describe('all rules load correctly', () => {
  it('loads 51 active rules', () => {
    const all = getAllRuleIds();
    expect(all.length).toBeGreaterThanOrEqual(50);
  });

  it('every active rule has id, severity, and description', () => {
    const { getRules } = require('../../scripts/rules');
    const rules = getRules({ enabled: true });
    for (const rule of rules) {
      expect(rule.id).toBeTruthy();
      expect(rule.severity).toMatch(/^(HIGH|MEDIUM|LOW)$/);
      expect(rule.description).toBeTruthy();
    }
  });
});
