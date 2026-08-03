jest.mock('fs');
jest.mock('crypto', () => ({
  randomUUID: () => '12345678-1234-1234-1234-123456789abc'
}));

const fs = require('fs');
const { AuditReporter } = require('../../src/skills/enterprise/AuditReporter');

describe('AuditReporter', () => {
  let reporter;
  const fakeLogPath = '/fake/audit/path';

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    reporter = new AuditReporter({ logPath: fakeLogPath });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      fs.existsSync.mockReturnValue(false);
      const r = new AuditReporter();
      expect(r.logs).toEqual([]);
      expect(r.retentionDays).toBe(90);
      expect(r.maxLogs).toBe(100000);
    });

    it('should create log directory when it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      new AuditReporter({ logPath: '/new/path' });
      expect(fs.mkdirSync).toHaveBeenCalledWith('/new/path', { recursive: true });
    });

    it('should not create log directory when it already exists', () => {
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should accept custom options', () => {
      const r = new AuditReporter({ logPath: '/custom', retentionDays: 30, maxLogs: 5000 });
      expect(r.logPath).toBe('/custom');
      expect(r.retentionDays).toBe(30);
      expect(r.maxLogs).toBe(5000);
    });
  });

  describe('log', () => {
    it('should add an entry with id and timestamp', () => {
      const entry = reporter.log({ action: 'test', userId: 'user1' });
      expect(entry.id).toMatch(/^audit_\d+_/);
      expect(entry.timestamp).toBeGreaterThan(0);
      expect(entry.action).toBe('test');
      expect(entry.userId).toBe('user1');
    });

    it('should sanitize dangerous characters from event data', () => {
      const entry = reporter.log({ action: '<script>alert("xss")</script>' });
      expect(entry.action).not.toContain('<');
      expect(entry.action).not.toContain('>');
      expect(entry.action).not.toContain('"');
    });

    it('should rotate logs when exceeding maxLogs', () => {
      fs.writeFileSync.mockReturnValue(undefined);
      const r = new AuditReporter({ logPath: fakeLogPath, maxLogs: 5 });
      for (let i = 0; i < 6; i++) {
        r.log({ action: 'a' + i });
      }
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(r.logs.length).toBeLessThan(6);
    });

    it('should not rotate when under maxLogs', () => {
      const r = new AuditReporter({ logPath: fakeLogPath, maxLogs: 100 });
      for (let i = 0; i < 5; i++) {
        r.log({ action: 'a' + i });
      }
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(r.logs).toHaveLength(5);
    });
  });

  describe('_sanitizeEvent', () => {
    it('should strip angle brackets, quotes, and ampersands', () => {
      const result = reporter._sanitizeEvent({ name: '<b>"hello & goodbye"</b>' });
      expect(result.name).toBe('bhello  goodbye/b');
    });

    it('should truncate strings longer than 10000 characters', () => {
      const longStr = 'a'.repeat(20000);
      const result = reporter._sanitizeEvent({ msg: longStr });
      expect(result.msg).toHaveLength(10000);
    });

    it('should recursively sanitize nested objects', () => {
      const result = reporter._sanitizeEvent({ nested: { inner: '<script>' } });
      expect(result.nested.inner).toBe('script');
    });

    it('should preserve non-string values', () => {
      const result = reporter._sanitizeEvent({ count: 42, active: true, data: null });
      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe('query', () => {
    beforeEach(() => {
      reporter.logs = [
        { id: '1', userId: 'u1', action: 'login', resource: 'app', severity: 'info', timestamp: 1000 },
        { id: '2', userId: 'u2', action: 'delete', resource: 'doc', severity: 'error', timestamp: 2000 },
        { id: '3', userId: 'u1', action: 'login', resource: 'app', severity: 'info', timestamp: 3000 }
      ];
    });

    it('should return all logs with no filters', () => {
      expect(reporter.query()).toHaveLength(3);
    });

    it('should filter by userId', () => {
      const res = reporter.query({ userId: 'u1' });
      expect(res).toHaveLength(2);
    });

    it('should filter by action', () => {
      const res = reporter.query({ action: 'login' });
      expect(res).toHaveLength(2);
    });

    it('should filter by resource', () => {
      const res = reporter.query({ resource: 'doc' });
      expect(res).toHaveLength(1);
    });

    it('should filter by severity', () => {
      const res = reporter.query({ severity: 'error' });
      expect(res).toHaveLength(1);
    });

    it('should filter by from timestamp', () => {
      const res = reporter.query({ from: new Date(1500).toISOString() });
      expect(res).toHaveLength(2);
    });

    it('should filter by to timestamp', () => {
      const res = reporter.query({ to: new Date(1500).toISOString() });
      expect(res).toHaveLength(1);
    });

    it('should combine multiple filters', () => {
      const res = reporter.query({ userId: 'u1', action: 'login' });
      expect(res).toHaveLength(2);
    });

    it('should return empty array when no match', () => {
      const res = reporter.query({ userId: 'nonexistent' });
      expect(res).toEqual([]);
    });

    it('should sort results descending by timestamp', () => {
      const res = reporter.query();
      expect(res[0].timestamp).toBeGreaterThanOrEqual(res[1].timestamp);
      expect(res[1].timestamp).toBeGreaterThanOrEqual(res[2].timestamp);
    });
  });

  describe('getStats', () => {
    it('should aggregate recent logs by action, severity, user', () => {
      reporter.log({ action: 'login', userId: 'u1', severity: 'info' });
      reporter.log({ action: 'login', userId: 'u2', severity: 'info' });
      reporter.log({ action: 'delete', userId: 'u1', severity: 'error' });
      const stats = reporter.getStats(100000);
      expect(stats.totalEvents).toBe(3);
      expect(stats.byAction).toEqual({ login: 2, delete: 1 });
      expect(stats.bySeverity).toEqual({ info: 2, error: 1 });
      expect(stats.byUser).toEqual({ u1: 2, u2: 1 });
    });

    it('should collect error-severity events', () => {
      reporter.log({ action: 'delete', userId: 'u1', severity: 'error' });
      reporter.log({ action: 'login', userId: 'u2', severity: 'info' });
      const stats = reporter.getStats(100000);
      expect(stats.errors).toHaveLength(1);
      expect(stats.errors[0].action).toBe('delete');
    });

    it('should return empty stats when no logs exist', () => {
      const stats = reporter.getStats();
      expect(stats.totalEvents).toBe(0);
      expect(stats.byAction).toEqual({});
      expect(stats.errors).toEqual([]);
    });

    it('should generate 24-hour timeline', () => {
      reporter.log({ action: 'login', userId: 'u1', severity: 'info' });
      const stats = reporter.getStats(100000);
      expect(stats.timeline).toHaveLength(24);
      const currentHour = new Date().getHours();
      expect(stats.timeline[currentHour].count).toBe(1);
    });

    it('should exclude logs older than timeRange', () => {
      const r = new AuditReporter({ logPath: fakeLogPath });
      r.logs = [
        { action: 'old', userId: 'u1', severity: 'info', timestamp: 0 }
      ];
      const stats = r.getStats(1000);
      expect(stats.totalEvents).toBe(0);
    });
  });

  describe('export', () => {
    beforeEach(() => {
      reporter.log({ action: 'test', userId: 'u1', severity: 'info' });
    });

    it('should export as JSON by default', () => {
      const result = reporter.export();
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].action).toBe('test');
    });

    it('should export as CSV', () => {
      const result = reporter.export('csv');
      expect(result).toContain('action');
      expect(result).toContain('test');
      expect(result).toContain('\n');
    });

    it('should export as XLSX (simplified JSON)', () => {
      const result = reporter.export('xlsx');
      expect(typeof result).toBe('string');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should export as PDF (simplified JSON)', () => {
      const result = reporter.export('pdf');
      expect(typeof result).toBe('string');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('should apply filters when exporting', () => {
      reporter.log({ action: 'other', userId: 'u2', severity: 'info' });
      const result = reporter.export('json', { userId: 'u1' });
      expect(JSON.parse(result)).toHaveLength(1);
    });

    it('should return empty string for CSV when no data', () => {
      const r = new AuditReporter({ logPath: fakeLogPath });
      expect(r.export('csv')).toBe('');
    });
  });

  describe('_sanitizeCSVField', () => {
    it('should return empty string for null', () => {
      expect(reporter._sanitizeCSVField(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(reporter._sanitizeCSVField(undefined)).toBe('');
    });

    it('should prevent formula injection by prefixing dangerous characters', () => {
      expect(reporter._sanitizeCSVField('=SUM(1,1)')).toBe('"\'=SUM(1,1)"');
      expect(reporter._sanitizeCSVField('+SUM(1,1)')).toBe('"\'+SUM(1,1)"');
      expect(reporter._sanitizeCSVField('-SUM(1,1)')).toBe('"\'-SUM(1,1)"');
      expect(reporter._sanitizeCSVField('@SUM(1,1)')).toBe('"\'@SUM(1,1)"');
    });

    it('should escape double quotes by doubling them', () => {
      const result = reporter._sanitizeCSVField('he"llo');
      expect(result).toBe('"he""llo"');
    });

    it('should wrap field in quotes if it contains a comma', () => {
      const result = reporter._sanitizeCSVField('a,b');
      expect(result).toBe('"a,b"');
    });

    it('should wrap field in quotes if it contains a newline', () => {
      const result = reporter._sanitizeCSVField('a\nb');
      expect(result).toBe('"a\nb"');
    });

    it('should truncate long fields to 10000 characters', () => {
      const longStr = 'a'.repeat(20000);
      const result = reporter._sanitizeCSVField(longStr);
      expect(result).toHaveLength(10000);
    });

    it('should convert numbers to strings', () => {
      expect(reporter._sanitizeCSVField(42)).toBe('42');
    });

    it('should convert booleans to strings', () => {
      expect(reporter._sanitizeCSVField(true)).toBe('true');
    });
  });

  describe('_toCSV', () => {
    it('should produce CSV with headers and rows', () => {
      const csv = reporter._toCSV([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 }
      ]);
      const lines = csv.split('\n');
      expect(lines[0]).toContain('name');
      expect(lines[0]).toContain('age');
      expect(lines[1]).toContain('Alice');
      expect(lines[1]).toContain('30');
      expect(lines[2]).toContain('Bob');
      expect(lines[2]).toContain('25');
    });

    it('should return empty string for empty data', () => {
      expect(reporter._toCSV([])).toBe('');
    });
  });

  describe('_sanitizeFilename', () => {
    it('should remove path traversal sequences', () => {
      expect(reporter._sanitizeFilename('../etc/passwd')).toBe('..etcpasswd');
    });

    it('should remove shell-dangerous characters', () => {
      expect(reporter._sanitizeFilename('file; rm -rf /')).toBe('filerm-rf');
    });

    it('should preserve safe alphanumeric names', () => {
      expect(reporter._sanitizeFilename('audit_2024_01.json')).toBe('audit_2024_01.json');
    });

    it('should truncate names longer than 100 characters', () => {
      const longName = 'a'.repeat(200);
      expect(reporter._sanitizeFilename(longName)).toHaveLength(100);
    });
  });

  describe('_rotateLogs', () => {
    it('should write old half to file and keep recent half', () => {
      fs.writeFileSync.mockReturnValue(undefined);
      const r = new AuditReporter({ logPath: fakeLogPath, maxLogs: 5 });
      for (let i = 0; i < 6; i++) {
        r.logs.push({ id: '' + i, action: 'a' + i });
      }
      r._rotateLogs();
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(r.logs).toHaveLength(3);
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate SOX compliance report', () => {
      reporter.log({ action: 'auth', userId: 'u1', success: true, severity: 'info' });
      const report = reporter.generateComplianceReport('sox');
      expect(report.title).toBe('SOX Compliance Report');
      expect(report.sections.accessControls).toBeDefined();
      expect(report.sections.dataChanges).toBeDefined();
      expect(report.sections.privilegedOperations).toBeDefined();
      expect(report.sections.exceptions).toBeDefined();
    });

    it('should generate GDPR compliance report', () => {
      reporter.log({ action: 'read', userId: 'u1', dataType: 'personal' });
      const report = reporter.generateComplianceReport('gdpr');
      expect(report.title).toBe('GDPR Compliance Report');
      expect(report.sections.dataAccess).toBeDefined();
      expect(report.sections.consentRecords).toBeDefined();
      expect(report.sections.breachNotifications).toBeDefined();
    });

    it('should generate HIPAA compliance report', () => {
      reporter.log({ action: 'read', userId: 'u1', phi: true, authorized: true });
      const report = reporter.generateComplianceReport('hipaa');
      expect(report.title).toBe('HIPAA Compliance Report');
      expect(report.sections.phiAccess).toBeDefined();
      expect(report.sections.authorizationChecks).toBeDefined();
      expect(report.sections.auditControls).toBeDefined();
    });

    it('should default to SOX when no type given', () => {
      reporter.log({ action: 'auth', userId: 'u1', success: true });
      const report = reporter.generateComplianceReport();
      expect(report.title).toBe('SOX Compliance Report');
    });
  });

  describe('_groupBy', () => {
    it('should group items by the given key', () => {
      const items = [{ type: 'a' }, { type: 'b' }, { type: 'a' }];
      expect(reporter._groupBy(items, 'type')).toEqual({ a: 2, b: 1 });
    });

    it('should use "unknown" for items missing the key', () => {
      const items = [{ type: 'a' }, {}];
      expect(reporter._groupBy(items, 'type')).toEqual({ a: 1, unknown: 1 });
    });
  });

  describe('_detectUnusualPatterns', () => {
    it('should flag IPs with more than 5 failed attempts', () => {
      const events = Array(10).fill({ success: false, ip: '192.168.1.1' });
      const result = reporter._detectUnusualPatterns(events);
      expect(result).toHaveLength(1);
      expect(result[0].ip).toBe('192.168.1.1');
      expect(result[0].failedAttempts).toBe(10);
    });

    it('should not flag IPs with 5 or fewer failed attempts', () => {
      const events = Array(3).fill({ success: false, ip: '192.168.1.1' });
      const result = reporter._detectUnusualPatterns(events);
      expect(result).toHaveLength(0);
    });
  });
});
