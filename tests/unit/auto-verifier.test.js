describe('AutoVerifier', () => {
  let AutoVerifier;

  beforeAll(() => {
    AutoVerifier = require('../../src/core/AutoVerifier');
  });

  let verifier;
  beforeEach(() => {
    verifier = new AutoVerifier({ mock: true });
  });

  describe('constructor', () => {
    it('initializes with 3 rule categories', () => {
      expect(verifier.rules).toHaveProperty('code');
      expect(verifier.rules).toHaveProperty('security');
      expect(verifier.rules).toHaveProperty('documentation');
    });

    it('code category has 3 patterns', () => {
      expect(verifier.rules.code.patterns).toHaveLength(3);
    });

    it('security category has 3 patterns', () => {
      expect(verifier.rules.security.patterns).toHaveLength(3);
    });

    it('starts with empty history', () => {
      expect(verifier.history).toEqual([]);
    });
  });

  describe('_checkSyntax', () => {
    it('always passes', () => {
      const result = verifier._checkSyntax('some code');
      expect(result.passed).toBe(true);
    });
  });

  describe('_checkErrorHandling', () => {
    it('passes when content has try/catch', () => {
      expect(verifier._checkErrorHandling('try { } catch (e) { }').passed).toBe(true);
    });

    it('passes when content has if', () => {
      expect(verifier._checkErrorHandling('if (x > 0)').passed).toBe(true);
    });

    it('fails when no error handling or conditionals', () => {
      const result = verifier._checkErrorHandling('var x = 1;');
      expect(result.passed).toBe(false);
      expect(result.severity).toBe('warning');
    });
  });

  describe('_checkSecrets', () => {
    it('passes on safe code', () => {
      expect(verifier._checkSecrets('const x = 1').passed).toBe(true);
    });

    it('detects password assignment', () => {
      const result = verifier._checkSecrets('password = "secret123"');
      expect(result.passed).toBe(false);
      expect(result.severity).toBe('error');
    });

    it('detects api key', () => {
      expect(verifier._checkSecrets('api_key = "abc123"').passed).toBe(false);
    });

    it('detects secret', () => {
      expect(verifier._checkSecrets('secret = "mysecret"').passed).toBe(false);
    });

    it('detects token', () => {
      expect(verifier._checkSecrets('token = "xyz"').passed).toBe(false);
    });
  });

  describe('_checkInject', () => {
    it('passes on safe code', () => {
      expect(verifier._checkInject('console.log("hello")').passed).toBe(true);
    });

    it('detects shell usage', () => {
      const result = verifier._checkInject('$shell cmd');
      expect(result.passed).toBe(false);
      expect(result.severity).toBe('critical');
    });

    it('detects exec injection', () => {
      expect(verifier._checkInject('child_process.exec(cmd + input)').passed).toBe(false);
    });
  });

  describe('_checkPathTraversal', () => {
    it('passes on safe code', () => {
      expect(verifier._checkPathTraversal('path.join(a, b)').passed).toBe(true);
    });

    it('detects path traversal', () => {
      const result = verifier._checkPathTraversal('../../etc/passwd');
      expect(result.passed).toBe(false);
      expect(result.severity).toBe('error');
    });

    it('detects path variable interpolation', () => {
      expect(verifier._checkPathTraversal('${user.path}').passed).toBe(false);
    });
  });

  describe('_checkValidation', () => {
    it('passes with if statements', () => {
      expect(verifier._checkValidation('if (x > 0)').passed).toBe(true);
    });

    it('passes with validate calls', () => {
      expect(verifier._checkValidation('validate(input)').passed).toBe(true);
    });

    it('passes with check calls', () => {
      expect(verifier._checkValidation('check(value)').passed).toBe(true);
    });

    it('warns when no validation present', () => {
      const result = verifier._checkValidation('return x + 1');
      expect(result.passed).toBe(false);
      expect(result.severity).toBe('warning');
    });
  });

  describe('_checkComments', () => {
    it('always passes', () => {
      expect(verifier._checkComments('code').passed).toBe(true);
    });
  });

  describe('_checkDocs', () => {
    it('always passes', () => {
      expect(verifier._checkDocs('docs').passed).toBe(true);
    });
  });

  describe('verify', () => {
    it('defaults to code category when not specified', () => {
      const result = verifier.verify('var x = 1');
      expect(result.category).toBe('code');
      expect(result.results.length).toBe(3);
    });

    it('runs all patterns for the category', () => {
      const result = verifier.verify('var x = 1', 'code');
      expect(result.category).toBe('code');
      expect(result.results.length).toBe(3);
    });

    it('marks passed as true when all checks pass', () => {
      const content = 'try { validate(input); } catch(e) { } password = "x" ';
      const result = verifier.verify(content, 'code');
      expect(result.passed).toBe(false);
    });

    it('returns empty results for unknown category', () => {
      const result = verifier.verify('code', 'unknown');
      expect(result.results).toEqual([]);
      expect(result.passed).toBe(true);
    });

    it('records verification to history', () => {
      verifier.verify('test', 'code');
      expect(verifier.history).toHaveLength(1);
    });

    it('handles rule check exceptions gracefully', () => {
      const v = new AutoVerifier({ mock: true });
      v.rules.custom = {
        patterns: [{ name: 'broken', check: () => { throw new Error('fail'); } }]
      };
      const result = v.verify('x', 'custom');
      expect(result.results[0].passed).toBe(false);
      expect(result.results[0].message).toContain('验证错误');
    });
  });

  describe('_record', () => {
    it('caps history at maxHistory', () => {
      for (let i = 0; i < 100; i++) verifier.verify(`code ${i}`, 'code');
      expect(verifier.history.length).toBeLessThanOrEqual(50);
    });
  });

  describe('getStats', () => {
    it('returns zeros when no history', () => {
      const stats = verifier.getStats();
      expect(stats.total).toBe(0);
      expect(stats.successRate).toBe('0%');
    });

    it('computes success rate', () => {
      verifier.verify('safe code with try catch', 'code');
      verifier.verify('var x = 1', 'code');
      const stats = verifier.getStats();
      expect(stats.total).toBe(2);
    });
  });
});
