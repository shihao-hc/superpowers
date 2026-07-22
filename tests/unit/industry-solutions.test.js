const { IndustrySolutions } = require('../../src/skills/solutions/IndustrySolutions');

describe('IndustrySolutions', () => {
  let solutions;

  beforeEach(() => {
    solutions = new IndustrySolutions();
  });

  describe('constructor', () => {
    it('should initialize with pre-defined solutions', () => {
      const all = solutions.getAllSolutions();
      expect(all.length).toBeGreaterThan(0);
    });
  });

  describe('getAllSolutions', () => {
    it('should return all solutions as array', () => {
      const all = solutions.getAllSolutions();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBe(11);
    });

    it('should return unique solution objects', () => {
      const all = solutions.getAllSolutions();
      const ids = all.map((s) => s.id);
      expect(new Set(ids).size).toBe(all.length);
    });
  });

  describe('getSolution', () => {
    it('should return a solution by id', () => {
      const sol = solutions.getSolution('bank-compliance');
      expect(sol).not.toBeNull();
      expect(sol.name).toBe('银行智能合规助手');
    });

    it('should return null for non-existent id', () => {
      expect(solutions.getSolution('non-existent')).toBeUndefined();
    });
  });

  describe('getSolutionsByCategory', () => {
    it('should return solutions for given category', () => {
      const banking = solutions.getSolutionsByCategory('banking');
      expect(banking.length).toBe(1);
      expect(banking[0].id).toBe('bank-compliance');
    });

    it('should return empty array for non-existent category', () => {
      expect(solutions.getSolutionsByCategory('non-existent')).toEqual([]);
    });
  });

  describe('getSolutionSkills', () => {
    it('should return skills for existing solution', () => {
      const skills = solutions.getSolutionSkills('bank-compliance');
      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBeGreaterThan(0);
      expect(skills).toContain('aml-transaction-monitor');
    });

    it('should return empty array for non-existent solution', () => {
      expect(solutions.getSolutionSkills('non-existent')).toEqual([]);
    });
  });

  describe('getSolutionWorkflows', () => {
    it('should return workflows for existing solution', () => {
      const workflows = solutions.getSolutionWorkflows('bank-compliance');
      expect(Array.isArray(workflows)).toBe(true);
      expect(workflows.length).toBeGreaterThan(0);
      expect(workflows[0]).toHaveProperty('id');
      expect(workflows[0]).toHaveProperty('steps');
    });

    it('should return empty array for non-existent solution', () => {
      expect(solutions.getSolutionWorkflows('non-existent')).toEqual([]);
    });
  });

  describe('getEndToEndSolutions', () => {
    it('should return e2e solutions for a solution with them', () => {
      const e2e = solutions.getEndToEndSolutions('bank-compliance');
      expect(Array.isArray(e2e)).toBe(true);
      expect(e2e.length).toBeGreaterThan(0);
    });

    it('should return empty array for solution without e2e', () => {
      const e2e = solutions.getEndToEndSolutions('smart-school');
      expect(e2e).toEqual([]);
    });

    it('should return empty array for non-existent solution', () => {
      expect(solutions.getEndToEndSolutions('non-existent')).toEqual([]);
    });
  });

  describe('getEndToEndSolution', () => {
    it('should return a specific e2e solution', () => {
      const e2e = solutions.getEndToEndSolution('bank-compliance', 'smart-credit-fullflow');
      expect(e2e).not.toBeNull();
      expect(e2e.name).toBe('智能信贷全流程');
    });

    it('should return null for non-existent e2e id', () => {
      expect(solutions.getEndToEndSolution('bank-compliance', 'non-existent')).toBeNull();
    });

    it('should return null for non-existent solution id', () => {
      expect(solutions.getEndToEndSolution('non-existent', 'some-id')).toBeNull();
    });
  });

  describe('getAllEndToEndSolutions', () => {
    it('should return all e2e solutions across all parent solutions', () => {
      const all = solutions.getAllEndToEndSolutions();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThan(0);
      all.forEach((e2e) => {
        expect(e2e).toHaveProperty('parentSolution');
        expect(e2e).toHaveProperty('parentCategory');
      });
    });
  });

  describe('executeWorkflow', () => {
    it('should execute a valid workflow with inputs', () => {
      const result = solutions.executeWorkflow('bank-compliance', 'new-customer-onboarding', { customerId: '123' });
      expect(result.solution).toBe('银行智能合规助手');
      expect(result.workflow).toBe('新客户开户流程');
      expect(result.steps).toEqual(['kyc-customer-verification', 'aml-transaction-monitor', 'risk-assessment']);
      expect(result.estimatedTime).toBe(15);
      expect(result.readyForExecution).toBe(true);
      expect(result.inputs).toEqual({ customerId: '123' });
    });

    it('should reject invalid solution ID format', () => {
      const result = solutions.executeWorkflow('INVALID!', 'workflow-1', {});
      expect(result.error).toBe('Invalid solution ID format');
    });

    it('should reject invalid workflow ID format', () => {
      const result = solutions.executeWorkflow('bank-compliance', 'INVALID!', {});
      expect(result.error).toBe('Invalid workflow ID format');
    });

    it('should reject empty solution ID', () => {
      const result = solutions.executeWorkflow('', 'workflow-1', {});
      expect(result.error).toBe('Invalid solution ID format');
    });

    it('should reject non-string solution ID', () => {
      const result = solutions.executeWorkflow(123, 'workflow-1', {});
      expect(result.error).toBe('Invalid solution ID format');
    });

    it('should return error for non-existent solution', () => {
      const result = solutions.executeWorkflow('non-existent', 'workflow-1', {});
      expect(result.error).toBe('Solution not found');
    });

    it('should return error for non-existent workflow', () => {
      const result = solutions.executeWorkflow('bank-compliance', 'non-existent', {});
      expect(result.error).toBe('Workflow not found');
    });
  });

  describe('_sanitizeInputs', () => {
    it('should sanitize string values', () => {
      const result = solutions._sanitizeInputs({ name: '<script>alert(1)</script>' });
      expect(result.name).toBe('scriptalert(1)/script');
    });

    it('should truncate long string values', () => {
      const long = 'a'.repeat(15000);
      const result = solutions._sanitizeInputs({ key: long });
      expect(result.key.length).toBe(10000);
    });

    it('should preserve valid numbers', () => {
      const result = solutions._sanitizeInputs({ count: 42 });
      expect(result.count).toBe(42);
    });

    it('should reject Infinity and NaN', () => {
      const result = solutions._sanitizeInputs({ a: Infinity, b: NaN });
      expect(result.a).toBeUndefined();
      expect(result.b).toBeUndefined();
    });

    it('should preserve booleans', () => {
      const result = solutions._sanitizeInputs({ flag: true });
      expect(result.flag).toBe(true);
    });

    it('should handle string arrays', () => {
      const result = solutions._sanitizeInputs({ tags: ['a', 'b'] });
      expect(result.tags).toEqual(['a', 'b']);
    });

    it('should truncate long arrays', () => {
      const arr = new Array(200).fill('x');
      const result = solutions._sanitizeInputs({ tags: arr });
      expect(result.tags.length).toBe(100);
    });

    it('should reject arrays with non-string elements', () => {
      const result = solutions._sanitizeInputs({ tags: [1, 2, 3] });
      expect(result.tags).toBeUndefined();
    });

    it('should reject invalid key names', () => {
      const result = solutions._sanitizeInputs({ 'invalid-key': 'value' });
      expect(result['invalid-key']).toBeUndefined();
    });

    it('should return empty object for non-object inputs', () => {
      expect(solutions._sanitizeInputs(null)).toEqual({});
      expect(solutions._sanitizeInputs('string')).toEqual({});
      expect(solutions._sanitizeInputs(undefined)).toEqual({});
    });
  });

  describe('generateSolutionReport', () => {
    it('should generate report for existing solution', () => {
      const report = solutions.generateSolutionReport('bank-compliance');
      expect(report).not.toBeNull();
      expect(report.solution).toBe('银行智能合规助手');
      expect(report.description).toBeTruthy();
      expect(report.targetCustomers).toBeInstanceOf(Array);
      expect(report.roi).toBeTruthy();
      expect(report.implementationPlan).toHaveProperty('phase1');
      expect(report.implementationPlan).toHaveProperty('totalDuration');
      expect(report.successStories).toBeInstanceOf(Array);
    });

    it('should return null for non-existent solution', () => {
      expect(solutions.generateSolutionReport('non-existent')).toBeNull();
    });
  });

  describe('_getSuccessStories', () => {
    it('should return stories for known category', () => {
      const stories = solutions._getSuccessStories('banking');
      expect(stories.length).toBeGreaterThan(0);
    });

    it('should return empty array for unknown category', () => {
      expect(solutions._getSuccessStories('unknown')).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle solution with no endToEndSolutions', () => {
      const e2e = solutions.getEndToEndSolutions('smart-school');
      expect(e2e).toEqual([]);
    });

    it('should return all solutions with unique categories', () => {
      const all = solutions.getAllSolutions();
      const categories = [...new Set(all.map((s) => s.category))];
      expect(categories).toContain('banking');
      expect(categories).toContain('healthcare');
      expect(categories).toContain('manufacturing');
    });
  });
});
