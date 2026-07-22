const { SecurityHardening } = require('../../src/security/SecurityHardening');

describe('SecurityHardening', () => {
  let sh;

  beforeEach(() => {
    sh = new SecurityHardening();
  });

  describe('scanDependencies', () => {
    it('returns default vulnerabilities', async () => {
      const results = await sh.scanDependencies();
      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe('medium');
      expect(results[0].package).toBe('sample-package');
      expect(sh.scanResults).toEqual(results);
    });
  });

  describe('checkPermissions', () => {
    it('grants access when all permissions met', () => {
      const result = sh.checkPermissions({ permissions: ['read', 'write'] }, ['read', 'write']);
      expect(result.allowed).toBe(true);
      expect(result.missingPermissions).toEqual([]);
    });

    it('denies access when permissions missing', () => {
      const result = sh.checkPermissions({ permissions: ['read'] }, ['read', 'write']);
      expect(result.allowed).toBe(false);
      expect(result.missingPermissions).toEqual(['write']);
    });

    it('handles module with no permissions', () => {
      const result = sh.checkPermissions({}, ['read']);
      expect(result.allowed).toBe(false);
    });
  });

  describe('audit', () => {
    it('logs action with details', () => {
      sh.audit('FILE_ACCESS', { file: '/etc/passwd', ip: '192.168.1.1' });
      expect(sh.auditLog).toHaveLength(1);
      expect(sh.auditLog[0].action).toBe('FILE_ACCESS');
      expect(sh.auditLog[0].details.file).toBe('/etc/passwd');
      expect(sh.auditLog[0].ip).toBe('192.168.1.1');
    });

    it('uses internal as default IP', () => {
      sh.audit('TEST', {});
      expect(sh.auditLog[0].ip).toBe('internal');
    });
  });

  describe('enforcePolicy', () => {
    it('adds policy with timestamp', () => {
      sh.enforcePolicy({ name: 'no-eval', rule: 'block' });
      expect(sh.policies).toHaveLength(1);
      expect(sh.policies[0].name).toBe('no-eval');
      expect(sh.policies[0].enforcedAt).toBeDefined();
    });
  });

  describe('generateReport', () => {
    it('returns empty report initially', () => {
      const report = sh.generateReport();
      expect(report.vulnerabilities).toEqual([]);
      expect(report.policiesCount).toBe(0);
      expect(report.auditEntries).toBe(0);
    });

    it('reflects collected data', async () => {
      await sh.scanDependencies();
      sh.audit('TEST', {});
      sh.enforcePolicy({ name: 'test' });
      const report = sh.generateReport();
      expect(report.vulnerabilities).toHaveLength(1);
      expect(report.policiesCount).toBe(1);
      expect(report.auditEntries).toBe(1);
    });
  });
});
