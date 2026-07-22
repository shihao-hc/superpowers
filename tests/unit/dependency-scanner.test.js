const fs = require('fs');
const { DependencyScanner } = require('../../src/security/DependencyScanner');

jest.mock('fs');

describe('DependencyScanner', () => {
  let scanner;

  beforeEach(() => {
    scanner = new DependencyScanner();
    jest.spyOn(process, 'cwd').mockReturnValue('/fake/project');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize known vulnerabilities', () => {
      expect(scanner.knownVulnerabilities['event-stream']).toBeDefined();
      expect(scanner.knownVulnerabilities['lodash']).toBeDefined();
    });

    it('should initialize suspicious patterns', () => {
      expect(scanner.suspiciousPatterns.length).toBeGreaterThan(0);
    });

    it('should initialize update recommendations', () => {
      expect(scanner.updateRecommendations.express).toBeDefined();
    });
  });

  describe('compareVersions', () => {
    it('should compare versions correctly', () => {
      expect(scanner.compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(scanner.compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(scanner.compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('should handle unequal length versions', () => {
      expect(scanner.compareVersions('1.0', '1.0.0')).toBe(0);
      expect(scanner.compareVersions('2.0', '2.0.1')).toBe(-1);
    });
  });

  describe('isVersionAffected', () => {
    it('should match wildcard', () => {
      expect(scanner.isVersionAffected('1.0.0', ['*'])).toBe(true);
    });

    it('should match less-than range', () => {
      expect(scanner.isVersionAffected('1.0.0', ['<1.2.0'])).toBe(true);
      expect(scanner.isVersionAffected('1.5.0', ['<1.2.0'])).toBe(false);
    });

    it('should strip version prefixes', () => {
      expect(scanner.isVersionAffected('^1.0.0', ['<1.2.0'])).toBe(true);
    });

    it('should return false for non-matching pattern that does not start with <', () => {
      expect(scanner.isVersionAffected('1.0.0', ['=2.0.0'])).toBe(false);
    });
  });

  describe('isSuspicious', () => {
    it('should detect suspicious names', () => {
      expect(scanner.isSuspicious('_-package')).toBe(true);
      expect(scanner.isSuspicious('temp-test-lib')).toBe(true);
      expect(scanner.isSuspicious('1.2.3')).toBe(true);
    });

    it('should pass normal names', () => {
      expect(scanner.isSuspicious('express')).toBe(false);
      expect(scanner.isSuspicious('lodash')).toBe(false);
      expect(scanner.isSuspicious('react')).toBe(false);
    });
  });

  describe('isOutdated', () => {
    it('should detect outdated packages', () => {
      expect(scanner.isOutdated('1.0.0', '^2.0.0')).toBe(true);
      expect(scanner.isOutdated('2.0.0', '^1.0.0')).toBe(false);
    });

    it('should strip carets for comparison', () => {
      expect(scanner.isOutdated('~1.0.0', '^2.0.0')).toBe(true);
    });
  });

  describe('calculateScore', () => {
    it('should start at 10', () => {
      const score = scanner.calculateScore({ vulnerabilities: [], suspicious: [], outdated: [] });
      expect(score).toBe(10);
    });

    it('should deduct for critical vulns', () => {
      const score = scanner.calculateScore({
        vulnerabilities: [{ severity: 'critical' }],
        suspicious: [],
        outdated: []
      });
      expect(score).toBe(7);
    });

    it('should not go below 0', () => {
      const score = scanner.calculateScore({
        vulnerabilities: [
          { severity: 'critical' },
          { severity: 'critical' },
          { severity: 'critical' },
          { severity: 'critical' }
        ],
        suspicious: [],
        outdated: []
      });
      expect(score).toBe(0);
    });
  });

  describe('scan', () => {
    it('should return results with package.json data', async () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({
        dependencies: {
          'express': '^4.18.0',
          'lodash': '^4.17.20',
          '_-evil-pkg': '1.0.0'
        },
        devDependencies: {}
      }));
      const results = await scanner.scan();
      expect(results.packageJson).toBeDefined();
      expect(results.vulnerabilities.length).toBeGreaterThanOrEqual(0);
      expect(results.suspicious.length).toBeGreaterThanOrEqual(0);
      expect(results.score).toBeGreaterThanOrEqual(0);
    });

    it('should detect known vulnerabilities', async () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({
        dependencies: { 'lodash': '^4.17.20' },
        devDependencies: {}
      }));
      const results = await scanner.scan();
      expect(results.vulnerabilities.some((v) => v.package === 'lodash')).toBe(true);
    });

    it('should detect suspicious packages', async () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({
        dependencies: { '_-evil': '1.0.0' },
        devDependencies: {}
      }));
      const results = await scanner.scan();
      expect(results.suspicious.some((s) => s.name === '_-evil')).toBe(true);
    });

    it('should handle missing package.json', async () => {
      fs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
      const results = await scanner.scan();
      expect(results.error).toBeDefined();
      expect(results.score).toBe(10);
    });
  });

  describe('generateReport', () => {
    it('should generate markdown report', () => {
      const results = {
        timestamp: '2024-01-01T00:00:00.000Z',
        score: 8,
        vulnerabilities: [{ package: 'bad-pkg', version: '1.0.0', severity: 'high', cve: 'CVE-123' }],
        suspicious: [],
        outdated: [],
        issues: []
      };
      const report = scanner.generateReport(results);
      expect(report).toContain('# Dependency Security Report');
      expect(report).toContain('bad-pkg');
      expect(report).toContain('CVE-123');
    });

    it('should handle empty results', () => {
      const results = {
        timestamp: '2024-01-01T00:00:00.000Z',
        score: 10,
        vulnerabilities: [],
        suspicious: [],
        outdated: [],
        issues: []
      };
      const report = scanner.generateReport(results);
      expect(report).toContain('Security Score');
    });

    it('should handle vulnerabilities without CVE', () => {
      const results = {
        timestamp: '2024-01-01T00:00:00.000Z',
        score: 8,
        vulnerabilities: [{ package: 'unknown-pkg', version: '1.0.0', severity: 'high' }],
        suspicious: [],
        outdated: [],
        issues: []
      };
      const report = scanner.generateReport(results);
      expect(report).toContain('unknown-pkg');
      expect(report).not.toContain('undefined');
    });

    it('should include suspicious packages section', () => {
      const results = {
        timestamp: '2024-01-01T00:00:00.000Z',
        score: 9,
        vulnerabilities: [],
        suspicious: [{ name: '_-evil', version: '1.0.0' }],
        outdated: [],
        issues: []
      };
      const report = scanner.generateReport(results);
      expect(report).toContain('## Suspicious Packages');
      expect(report).toContain('_-evil');
    });

    it('should include outdated packages section', () => {
      const results = {
        timestamp: '2024-01-01T00:00:00.000Z',
        score: 9.5,
        vulnerabilities: [],
        suspicious: [],
        outdated: [{ package: 'express', current: '4.0.0', recommended: '5.0.0' }],
        issues: []
      };
      const report = scanner.generateReport(results);
      expect(report).toContain('## Outdated Packages');
      expect(report).toContain('express');
      expect(report).toContain('4.0.0 → 5.0.0');
    });
  });
});
