const { FINANCE_TEMPLATES, FINANCE_WORKFLOWS } = require('../../src/industry/finance/templates');

describe('Finance Templates', () => {
  test('exports templates and workflows', () => {
    expect(Array.isArray(FINANCE_TEMPLATES)).toBe(true);
    expect(Array.isArray(FINANCE_WORKFLOWS)).toBe(true);
  });

  test('each template has required fields', () => {
    for (const t of FINANCE_TEMPLATES) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('icon');
      expect(t).toHaveProperty('industry', 'finance');
      expect(t).toHaveProperty('description');
      expect(t).toHaveProperty('params');
      expect(t).toHaveProperty('steps');
      expect(Array.isArray(t.steps)).toBe(true);
    }
  });

  test('templates have unique ids', () => {
    const ids = FINANCE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('each workflow has required fields', () => {
    for (const w of FINANCE_WORKFLOWS) {
      expect(w).toHaveProperty('id');
      expect(w).toHaveProperty('name');
      expect(w).toHaveProperty('steps');
      expect(Array.isArray(w.steps)).toBe(true);
    }
  });

  test('workflows have unique ids', () => {
    const ids = FINANCE_WORKFLOWS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('templates count matches', () => {
    expect(FINANCE_TEMPLATES.length).toBe(5);
    expect(FINANCE_WORKFLOWS.length).toBe(3);
  });
});
