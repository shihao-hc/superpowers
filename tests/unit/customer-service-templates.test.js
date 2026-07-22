const { CUSTOMER_SERVICE_TEMPLATES, CUSTOMER_SERVICE_WORKFLOWS } = require('../../src/industry/customer_service/templates');

describe('CustomerService Templates', () => {
  test('exports templates and workflows', () => {
    expect(Array.isArray(CUSTOMER_SERVICE_TEMPLATES)).toBe(true);
    expect(Array.isArray(CUSTOMER_SERVICE_WORKFLOWS)).toBe(true);
  });

  test('each template has required fields', () => {
    for (const t of CUSTOMER_SERVICE_TEMPLATES) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('icon');
      expect(t).toHaveProperty('industry', 'customer_service');
      expect(t).toHaveProperty('description');
      expect(t).toHaveProperty('params');
      expect(t).toHaveProperty('steps');
      expect(Array.isArray(t.steps)).toBe(true);
    }
  });

  test('templates have unique ids', () => {
    const ids = CUSTOMER_SERVICE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('each workflow has required fields', () => {
    for (const w of CUSTOMER_SERVICE_WORKFLOWS) {
      expect(w).toHaveProperty('id');
      expect(w).toHaveProperty('name');
      expect(w).toHaveProperty('steps');
      expect(Array.isArray(w.steps)).toBe(true);
    }
  });

  test('workflows have unique ids', () => {
    const ids = CUSTOMER_SERVICE_WORKFLOWS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('templates count matches', () => {
    expect(CUSTOMER_SERVICE_TEMPLATES.length).toBe(5);
    expect(CUSTOMER_SERVICE_WORKFLOWS.length).toBe(4);
  });

  test('templates have valid step actions', () => {
    for (const t of CUSTOMER_SERVICE_TEMPLATES) {
      for (const step of t.steps) {
        expect(step).toHaveProperty('action');
      }
    }
  });
});
