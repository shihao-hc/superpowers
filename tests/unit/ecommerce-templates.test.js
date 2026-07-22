const { ECOMMERCE_TEMPLATES, ECOMMERCE_WORKFLOWS } = require('../../src/industry/ecommerce/templates');

describe('Ecommerce Templates', () => {
  test('exports templates and workflows', () => {
    expect(Array.isArray(ECOMMERCE_TEMPLATES)).toBe(true);
    expect(Array.isArray(ECOMMERCE_WORKFLOWS)).toBe(true);
  });

  test('each template has required fields', () => {
    for (const t of ECOMMERCE_TEMPLATES) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('icon');
      expect(t).toHaveProperty('industry', 'ecommerce');
      expect(t).toHaveProperty('description');
      expect(t).toHaveProperty('params');
      expect(t).toHaveProperty('steps');
      expect(Array.isArray(t.steps)).toBe(true);
    }
  });

  test('templates have unique ids', () => {
    const ids = ECOMMERCE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('each workflow has required fields', () => {
    for (const w of ECOMMERCE_WORKFLOWS) {
      expect(w).toHaveProperty('id');
      expect(w).toHaveProperty('name');
      expect(w).toHaveProperty('steps');
      expect(Array.isArray(w.steps)).toBe(true);
    }
  });

  test('workflows have unique ids', () => {
    const ids = ECOMMERCE_WORKFLOWS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('templates count matches', () => {
    expect(ECOMMERCE_TEMPLATES.length).toBe(5);
    expect(ECOMMERCE_WORKFLOWS.length).toBe(3);
  });
});
