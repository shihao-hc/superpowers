const fs = require('fs');

jest.mock('unzipper', () => ({
  Open: { buffer: jest.fn().mockResolvedValue({ extract: jest.fn().mockResolvedValue() }) }
}), { virtual: true });

describe('SkillValidator', () => {
  let SkillValidator;
  let validator;

  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    SkillValidator = require('../../src/skills/SkillValidator');
    SkillValidator = SkillValidator.SkillValidator || SkillValidator;
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'rmSync').mockImplementation(() => {});
    jest.spyOn(fs, 'readdirSync').mockReturnValue([]);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('');
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, mode: 0o644 });
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    validator = new SkillValidator({ maxZipSize: 1000 });
  });

  describe('constructor', () => {
    it('sets defaults', () => {
      const v = new SkillValidator();
      expect(v.maxZipSize).toBe(10 * 1024 * 1024);
      expect(v.allowedExtensions).toContain('.js');
      expect(v.requiredMetadataFields).toContain('name');
    });

    it('has security rules', () => {
      expect(validator.securityRules.blockedPatterns.length).toBeGreaterThan(0);
      expect(validator.securityRules.highRiskPatterns.length).toBeGreaterThan(0);
      expect(validator.securityRules.suspiciousPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('validateZipPackage', () => {
    it('rejects oversized zip', async () => {
      const result = await validator.validateZipPackage(Buffer.alloc(2000), 'test');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('too large');
    });

    it('processes valid zip', async () => {
      jest.spyOn(fs, 'readFileSync').mockReturnValue('---\nname: test\n---\n# Test');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['skill.md']);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, mode: 0o644 });
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      const result = await validator.validateZipPackage(Buffer.alloc(100), 'test');
      expect(result).toBeDefined();
    });

    it('handles extraction error', async () => {
      const unzip = require('unzipper');
      unzip.Open.buffer.mockRejectedValueOnce(new Error('extract fail'));
      const result = await validator.validateZipPackage(Buffer.alloc(100), 'test');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateGitRepository', () => {
    it('accepts valid https URL', async () => {
      const result = await validator.validateGitRepository('https://github.com/user/repo.git', '/tmp');
      expect(result.valid).toBe(true);
    });

    it('accepts valid git@ URL', async () => {
      const result = await validator.validateGitRepository('git@github.com:user/repo.git', '/tmp');
      expect(result.valid).toBe(true);
    });

    it('warns on non-git URL', async () => {
      const result = await validator.validateGitRepository('https://example.com', '/tmp');
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    });

    it('warns on private repo patterns', async () => {
      const result = await validator.validateGitRepository('https://github.com/private/repo.git', '/tmp');
      expect(result.warnings.some(w => w.includes('private'))).toBe(true);
    });
  });

  describe('_analyzeSecurity', () => {
    it('returns 100 score for clean file', async () => {
      jest.spyOn(fs, 'readFileSync').mockReturnValue('const x = 1;');
      const result = await validator._analyzeSecurity('/fake', ['test.js']);
      expect(result.score).toBe(100);
      expect(result.riskLevel).toBe('low');
    });

    it('detects eval pattern', async () => {
      jest.spyOn(fs, 'readFileSync').mockReturnValue('eval("danger")');
      const result = await validator._analyzeSecurity('/fake', ['test.js']);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings.some(f => f.message.includes('eval'))).toBe(true);
      expect(result.score).toBeLessThan(100);
    });

    it('detects hardcoded password', async () => {
      jest.spyOn(fs, 'readFileSync').mockReturnValue('password = "secret123"');
      const result = await validator._analyzeSecurity('/fake', ['test.js']);
      expect(result.summary.highRiskCount).toBeGreaterThan(0);
    });

    it('detects hex encoding', async () => {
      jest.spyOn(fs, 'readFileSync').mockReturnValue('const x = "\\x48\\x65\\x6c"');
      const result = await validator._analyzeSecurity('/fake', ['test.js']);
      expect(result.summary.suspiciousPatterns).toBeGreaterThan(0);
    });

    it('sets riskLevel to high when score < 50', async () => {
      jest.spyOn(fs, 'readFileSync').mockReturnValue('password="x"; eval("x")');
      const result = await validator._analyzeSecurity('/fake', ['test.js']);
      expect(result.score).toBeLessThan(50);
      expect(result.riskLevel).toBe('high');
    });

    it('normalizes score to 0-100 range when over 100', async () => {
      jest.spyOn(fs, 'readFileSync').mockReturnValue('// safe');
      const result = await validator._analyzeSecurity('/fake', ['clean.js']);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('_findPatternMatches', () => {
    it('finds matches with line numbers', () => {
      const matches = validator._findPatternMatches('line1\neval(x)\nline3', /eval/);
      expect(matches).toHaveLength(1);
      expect(matches[0].line).toBe(2);
    });

    it('returns empty for no match', () => {
      expect(validator._findPatternMatches('safe code', /eval/)).toEqual([]);
    });

    it('truncates snippet to 100 chars', () => {
      const longLine = 'x'.repeat(200) + 'eval()';
      const matches = validator._findPatternMatches(longLine, /eval/);
      expect(matches[0].snippet.length).toBeLessThanOrEqual(100);
    });
  });

  describe('_generateSecuritySummary', () => {
    it('reports high risk patterns', () => {
      const msg = validator._generateSecuritySummary({
        summary: { highRiskCount: 2, mediumRiskCount: 0, lowRiskCount: 0, suspiciousPatterns: 0, filesScanned: 5 }
      });
      expect(msg).toContain('high-risk');
    });

    it('reports medium risk patterns', () => {
      const msg = validator._generateSecuritySummary({
        summary: { highRiskCount: 0, mediumRiskCount: 3, lowRiskCount: 0, suspiciousPatterns: 1, filesScanned: 5 }
      });
      expect(msg).toContain('medium-risk');
    });

    it('reports suspicious patterns', () => {
      const msg = validator._generateSecuritySummary({
        summary: { highRiskCount: 0, mediumRiskCount: 0, lowRiskCount: 0, suspiciousPatterns: 2, filesScanned: 5 }
      });
      expect(msg).toContain('suspicious');
    });

    it('reports clean', () => {
      const msg = validator._generateSecuritySummary({
        summary: { highRiskCount: 0, mediumRiskCount: 0, lowRiskCount: 0, suspiciousPatterns: 0, filesScanned: 3 }
      });
      expect(msg).toContain('No significant');
    });
  });

  describe('_validateMetadata', () => {
    it('passes for complete data', () => {
      const result = validator._validateMetadata({
        name: 'test', description: 'does something', version: '1.0.0', author: 'me', riskLevel: 'low'
      });
      expect(result.valid).toBe(true);
    });

    it('fails on missing fields', () => {
      const result = validator._validateMetadata({ name: 'test' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('warns on missing recommended fields', () => {
      const result = validator._validateMetadata({
        name: 'test', description: 'does something', version: '1.0.0', author: 'me', riskLevel: 'low'
      });
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('warns on invalid risk level', () => {
      const result = validator._validateMetadata({
        name: 'test', description: 'does something', version: '1.0.0', author: 'me', riskLevel: 'critical'
      });
      expect(result.warnings.some(w => w.includes('risk level'))).toBe(true);
    });

    it('warns on short description', () => {
      const result = validator._validateMetadata({
        name: 'test', description: 'short', version: '1.0.0', author: 'me', riskLevel: 'low'
      });
      expect(result.warnings.some(w => w.includes('Description'))).toBe(true);
    });
  });

  describe('_isValidSemVer', () => {
    it('validates correct versions', () => {
      expect(validator._isValidSemVer('1.0.0')).toBe(true);
      expect(validator._isValidSemVer('0.0.1')).toBe(true);
      expect(validator._isValidSemVer('2.3.4-beta')).toBe(true);
      expect(validator._isValidSemVer('2.3.4+build')).toBe(true);
    });

    it('rejects invalid versions', () => {
      expect(validator._isValidSemVer('1.0')).toBe(false);
      expect(validator._isValidSemVer('1')).toBe(false);
      expect(validator._isValidSemVer('abc')).toBe(false);
      expect(validator._isValidSemVer('1.0.0.0')).toBe(false);
    });
  });

  describe('_parseSkillMd', () => {
    it('parses frontmatter', () => {
      const result = validator._parseSkillMd(
        '---\nname: my-skill\ndescription: A test skill\nversion: 2.0.0\nriskLevel: high\n---\n# Content',
        'my-skill'
      );
      expect(result.name).toBe('my-skill');
      expect(result.version).toBe('2.0.0');
      expect(result.riskLevel).toBe('high');
    });

    it('falls back to expected name without frontmatter', () => {
      const result = validator._parseSkillMd('# My Skill\nDoes things', 'fallback-name');
      expect(result.name).toBe('fallback-name');
    });

    it('extracts description from headings', () => {
      const result = validator._parseSkillMd('## My Skill\nDoes useful things\nMore desc', 'test');
      expect(result.description).toBeTruthy();
    });

    it('returns defaults on parse error', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      const result = validator._parseSkillMd('---\ninvalid: [\n---', 'test');
      expect(result.name).toBe('test');
    });
  });

  describe('_findRequiredFiles', () => {
    beforeEach(() => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, mode: 0o644 });
    });

    it('finds skill.md', () => {
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['skill.md']);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('content');
      const files = validator._listFilesRecursive('/fake');
      const result = validator._findRequiredFiles(files, '/fake');
      expect(result.skillMd).toBeTruthy();
    });

    it('prefers skill.md over readme.md', () => {
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['skill.md', 'readme.md']);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('content');
      const files = validator._listFilesRecursive('/fake');
      const result = validator._findRequiredFiles(files, '/fake');
      expect(result.skillMd).toContain('skill.md');
    });
  });

  describe('_listFilesRecursive', () => {
    it('lists files in flat directory', () => {
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['a.js', 'b.py']);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, mode: 0o644 });
      const files = validator._listFilesRecursive('/fake');
      expect(files).toContain('a.js');
      expect(files).toContain('b.py');
    });

    it('recurses into subdirectories', () => {
      jest.spyOn(fs, 'readdirSync').mockImplementation((p) => {
        const pStr = String(p);
        if (pStr.endsWith('sub')) return ['a.js'];
        return ['sub'];
      });
      jest.spyOn(fs, 'statSync').mockImplementation((p) => ({
        isDirectory: () => !String(p).endsWith('.js'),
        mode: 0o644
      }));
      const files = validator._listFilesRecursive('/fake');
      expect(files).toContain('sub/a.js');
    });

    it('skips hidden dirs and node_modules', () => {
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['.git', 'node_modules']);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true, mode: 0o644 });
      jest.spyOn(fs, 'readFileSync').mockReturnValue('');
      const files = validator._listFilesRecursive('/fake');
      expect(files).toHaveLength(0);
    });
  });

  describe('validateSkillDirectory', () => {
    it('rejects missing directory', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      const result = await validator.validateSkillDirectory('/nonexistent', 'test');
      expect(result.valid).toBe(false);
    });

    it('rejects missing skill.md', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValueOnce(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['random.txt']);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, mode: 0o644 });
      const result = await validator.validateSkillDirectory('/fake', 'test');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Missing'))).toBe(true);
    });

    it('validates complete skill directory', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['skill.md', 'index.js']);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('---\nname: test\nversion: 1.0.0\nauthor: me\ndescription: a test skill\n---\n# Test');
      const statMock = jest.spyOn(fs, 'statSync');
      statMock.mockReturnValue({ isDirectory: () => false, mode: 0o644 });
      const result = await validator.validateSkillDirectory('/fake', 'test');
      expect(result.valid).toBe(true);
      expect(result.metadata.name).toBe('test');
    });

    it('warns on SemVer violation', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['skill.md', 'index.js']);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(
        '---\nname: test\nversion: 1.0\nauthor: me\ndescription: a test skill\n---\n# Test'
      );
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, mode: 0o644 });
      const result = await validator.validateSkillDirectory('/fake', 'test');
      expect(result.warnings.some(w => w.includes('Invalid version'))).toBe(true);
    });

    it('warns on file extension violation', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['skill.md', 'index.js', 'malware.exe']);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(
        '---\nname: test\nversion: 1.0.0\nauthor: me\ndescription: a test skill\n---\n# Test'
      );
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, mode: 0o644 });
      const result = await validator.validateSkillDirectory('/fake', 'test');
      expect(result.warnings.some(w => w.includes('unsafe'))).toBe(true);
    });
  });

  describe('generateReport', () => {
    it('creates report from validation result', () => {
      const report = validator.generateReport({
        valid: true, securityScore: 85, riskLevel: 'medium',
        errors: ['err1'], warnings: ['warn1'], files: ['a.js']
      });
      expect(report.valid).toBe(true);
      expect(report.securityScore).toBe(85);
      expect(report.summary.errors).toBe(1);
      expect(report.timestamp).toBeDefined();
    });
  });

  describe('_cleanupTempDir', () => {
    it('removes directory if it exists', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const rmSync = jest.spyOn(fs, 'rmSync').mockImplementation(() => {});
      validator._cleanupTempDir('/tmp/test');
      expect(rmSync).toHaveBeenCalled();
    });

    it('ignores missing directory', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(() => validator._cleanupTempDir('/tmp/test')).not.toThrow();
    });
  });
});
