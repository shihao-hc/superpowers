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

    it('creates temp directory when missing', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      jest.spyOn(fs, 'readFileSync').mockReturnValue('---\nname: test\n---\n# Test');
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['skill.md']);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, mode: 0o644 });
      const result = await validator.validateZipPackage(Buffer.alloc(100), 'test');
      expect(mkdirSpy).toHaveBeenCalled();
      expect(result).toBeDefined();
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

    it('handles validation error', async () => {
      const result = await validator.validateGitRepository(null, '/tmp');
      expect(result.errors.some(e => e.includes('Git validation failed'))).toBe(true);
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

    it('handles blocked pattern with low severity default', async () => {
      validator.securityRules.blockedPatterns.push({ pattern: /weird\/\/x/i, severity: 'low', message: 'low blocked' });
      jest.spyOn(fs, 'readFileSync').mockReturnValue('weird//x');
      const result = await validator._analyzeSecurity('/fake', ['a.js']);
      expect(result.summary.lowRiskCount).toBe(1);
    });

    it('handles high-risk pattern with high severity', async () => {
      jest.spyOn(fs, 'readFileSync').mockReturnValue('process.kill(pid)');
      const result = await validator._analyzeSecurity('/fake', ['a.js']);
      expect(result.summary.highRiskCount).toBeGreaterThan(0);
    });

    it('handles high-risk pattern with low severity default', async () => {
      jest.spyOn(fs, 'readFileSync').mockReturnValue('const f = open("file")');
      const result = await validator._analyzeSecurity('/fake', ['a.js']);
      expect(result.summary.lowRiskCount).toBeGreaterThan(0);
    });

    it('handles suspicious pattern with low severity default', async () => {
      jest.spyOn(fs, 'readFileSync').mockReturnValue('const b = btoa("data")');
      const result = await validator._analyzeSecurity('/fake', ['a.js']);
      expect(result.summary.suspiciousPatterns).toBeGreaterThan(0);
    });

    it('handles suspicious pattern with high severity', async () => {
      validator.securityRules.suspiciousPatterns.push({ pattern: /HACK\/\/I/i, severity: 'high', message: 'high susp' });
      jest.spyOn(fs, 'readFileSync').mockReturnValue('HACK//I');
      const result = await validator._analyzeSecurity('/fake', ['a.js']);
      expect(result.summary.suspiciousPatterns).toBeGreaterThan(0);
    });

    it('handles blocked pattern with medium severity', async () => {
      jest.spyOn(fs, 'readFileSync').mockReturnValue('fs.writeFileSync("x", "y")');
      const result = await validator._analyzeSecurity('/fake', ['a.js']);
      expect(result.summary.mediumRiskCount).toBeGreaterThan(0);
    });

    it('handles high-risk pattern with medium severity', async () => {
      jest.spyOn(fs, 'readFileSync').mockReturnValue('fetch("https://x.com")');
      const result = await validator._analyzeSecurity('/fake', ['a.js']);
      expect(result.summary.mediumRiskCount).toBeGreaterThan(0);
    });

    it('reports executable bit on non-script file on unix', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      jest.spyOn(fs, 'readFileSync').mockReturnValue('plain text');
      jest.spyOn(fs, 'statSync').mockReturnValue({ mode: 0o755 });
      const result = await validator._analyzeSecurity('/fake', ['data.bin']);
      expect(result.warnings.some(w => w.message.includes('Executable bit'))).toBe(true);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('skips non-executable files on unix', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      jest.spyOn(fs, 'readFileSync').mockReturnValue('plain text');
      jest.spyOn(fs, 'statSync').mockReturnValue({ mode: 0o644 });
      const result = await validator._analyzeSecurity('/fake', ['data.bin']);
      expect(result.warnings.some(w => w.message.includes('Executable bit'))).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('allows executable bit on script files on unix', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      jest.spyOn(fs, 'readFileSync').mockReturnValue('#!/bin/sh\necho hi');
      jest.spyOn(fs, 'statSync').mockReturnValue({ mode: 0o755 });
      const result = await validator._analyzeSecurity('/fake', ['run.sh']);
      expect(result.warnings.some(w => w.message.includes('Executable bit'))).toBe(false);
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('returns zero score and high risk on analysis error', async () => {
      jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw new Error('read failed'); });
      const result = await validator._analyzeSecurity('/fake', ['a.js']);
      expect(result.score).toBe(0);
      expect(result.riskLevel).toBe('high');
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

    it('stops description at next heading', () => {
      const result = validator._parseSkillMd('# Title\nfirst line\n## Next\nmore', 'test');
      expect(result.description).toContain('first line');
      expect(result.description).not.toContain('more');
    });

    it('handles yaml parse failure with warn', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      const result = validator._parseSkillMd('---\n: bad: [unclosed\n---\n# Body', 'test');
      expect(result.name).toBe('test');
    });

    it('handles empty yaml frontmatter', () => {
      const result = validator._parseSkillMd('---\n\n---\n# Body', 'test');
      expect(result.name).toBe('test');
    });

    it('stops description when heading directly follows', () => {
      const result = validator._parseSkillMd('# Only\n\n## Next', 'test');
      expect(result.description).toBe('');
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

    it('rejects skill.md without a name', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['skill.md', 'index.js']);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(
        '---\ndescription: no name here\nversion: 1.0.0\n---\n# Test'
      );
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, mode: 0o644 });
      const result = await validator.validateSkillDirectory('/fake');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Skill name not found'))).toBe(true);
    });

    it('warns on skill name mismatch with expected name', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['skill.md', 'index.js']);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(
        '---\nname: actual-skill\nversion: 1.0.0\nauthor: me\ndescription: a test skill\n---\n# Test'
      );
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, mode: 0o644 });
      const result = await validator.validateSkillDirectory('/fake', 'expected-skill');
      expect(result.warnings.some(w => w.includes('name mismatch'))).toBe(true);
    });

    it('warns on too many dependencies', async () => {
      const v = new SkillValidator({ maxDependencyCount: 2 });
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['skill.md', 'index.js']);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(
        '---\nname: test\nversion: 1.0.0\nauthor: me\ndescription: a test skill\ndependencies: [a, b, c]\n---\n# Test'
      );
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, mode: 0o644 });
      const result = await v.validateSkillDirectory('/fake', 'test');
      expect(result.warnings.some(w => w.includes('Too many dependencies'))).toBe(true);
    });

    it('catches validation errors', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['skill.md']);
      jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw new Error('disk read fail'); });
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, mode: 0o644 });
      const result = await validator.validateSkillDirectory('/fake', 'test');
      expect(result.errors.some(e => e.includes('Validation failed'))).toBe(true);
    });

    it('uses fallback metadata for sparse skill.md', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['skill.md', 'index.js']);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(
        '---\nname: sparse\nversion: 2.0.0\nauthor: me\ndescription: a very short skill that needs ten chars\nriskLevel: medium\n---\n# Sparse'
      );
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, mode: 0o644 });
      const result = await validator.validateSkillDirectory('/fake', 'sparse');
      expect(result.valid).toBe(true);
      expect(result.metadata.version).toBe('2.0.0');
      expect(result.metadata.riskLevel).toBe('medium');
      expect(result.metadata.dependencies).toEqual([]);
    });

    it('applies fallback metadata defaults when fields missing', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['skill.md', 'index.js']);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(
        '---\nname: missing-fields\ndescription: a very short skill that needs ten chars\n---\n# Missing'
      );
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, mode: 0o644 });
      const result = await validator.validateSkillDirectory('/fake', 'missing-fields');
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.metadata.riskLevel).toBe('low');
      expect(result.metadata.pure).toBe(false);
      expect(result.metadata.dependencies).toEqual([]);
    });

    it('skips dependency limit check when no dependencies', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['skill.md', 'index.js']);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(
        '---\nname: nodeps\nversion: 1.0.0\nauthor: me\ndescription: a test skill\nriskLevel: low\n---\n# NoDeps'
      );
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false, mode: 0o644 });
      const result = await validator.validateSkillDirectory('/fake', 'nodeps');
      expect(result.valid).toBe(true);
      expect(result.metadata.dependencies).toEqual([]);
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

    it('handles missing files in report', () => {
      const report = validator.generateReport({
        valid: true, securityScore: 100, riskLevel: 'low',
        errors: [], warnings: []
      });
      expect(report.summary.files).toBe(0);
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

    it('warns on cleanup failure', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'rmSync').mockImplementation(() => { throw new Error('permission'); });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      validator._cleanupTempDir('/tmp/test');
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
