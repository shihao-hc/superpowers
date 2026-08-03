const fs = require('fs');
const { AuditReporter, AuditEntry } = require('../../src/enterprise/AuditReporter');

jest.mock('fs');
jest.mock('../../src/utils/UltraWorkUtils', () => ({
  splitLines: (content) => content.replace(/\r\n/g, '\n').split('\n')
}));

jest.mock('zlib', () => ({
  createGzip: jest.fn(() => ({
    pipe: jest.fn(() => ({ pipe: jest.fn() }))
  }))
}));

const mockDate = new Date('2026-07-31T12:00:00.000Z');

describe('AuditEntry', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('generates ID if not provided', () => {
    const entry = new AuditEntry({ eventType: 'test' });
    expect(entry.id).toMatch(/^audit_\d+_[a-f0-9]{8}$/);
  });

  it('uses provided ID', () => {
    const entry = new AuditEntry({ id: 'custom-id', eventType: 'test' });
    expect(entry.id).toBe('custom-id');
  });

  it('sets defaults for missing fields', () => {
    const entry = new AuditEntry({ eventType: 'test' });
    expect(entry.timestamp).toBe(mockDate.getTime());
    expect(entry.severity).toBe('info');
    expect(entry.details).toEqual({});
    expect(entry.changes).toEqual([]);
    expect(entry.metadata).toEqual({});
  });

  it('assigns all provided fields', () => {
    const data = {
      id: 'a1',
      timestamp: 1000,
      eventType: 'login',
      severity: 'error',
      userId: 'u1',
      userName: 'Alice',
      action: 'login',
      resource: 'system',
      resourceId: 'r1',
      details: { browser: 'Chrome' },
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla',
      sessionId: 'sess1',
      changes: [{ field: 'email' }],
      metadata: { env: 'prod' }
    };
    const entry = new AuditEntry(data);
    expect(entry.id).toBe('a1');
    expect(entry.timestamp).toBe(1000);
    expect(entry.eventType).toBe('login');
    expect(entry.severity).toBe('error');
    expect(entry.userId).toBe('u1');
    expect(entry.userName).toBe('Alice');
    expect(entry.action).toBe('login');
    expect(entry.resource).toBe('system');
    expect(entry.resourceId).toBe('r1');
    expect(entry.details).toEqual({ browser: 'Chrome' });
    expect(entry.ipAddress).toBe('127.0.0.1');
    expect(entry.userAgent).toBe('Mozilla');
    expect(entry.sessionId).toBe('sess1');
    expect(entry.changes).toEqual([{ field: 'email' }]);
    expect(entry.metadata).toEqual({ env: 'prod' });
  });
});

describe('AuditReporter', () => {
  let reporter;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ size: 0 });
    fs.readdirSync.mockReturnValue([]);
    fs.appendFileSync.mockReturnValue(undefined);
    reporter = new AuditReporter({ storageDir: '/tmp/audit' });
  });

  describe('constructor', () => {
    it('sets default options', () => {
      const r = new AuditReporter({ storageDir: '/tmp/test' });
      expect(r.options.storageDir).toBe('/tmp/test');
      expect(r.options.retentionDays).toBe(365);
      expect(r.options.maxFileSize).toBe(10 * 1024 * 1024);
      expect(r.options.compressOld).toBe(true);
    });

    it('allows custom options override', () => {
      const r = new AuditReporter({
        storageDir: '/custom/path',
        retentionDays: 90,
        maxFileSize: 1024,
        compressOld: false
      });
      expect(r.options.storageDir).toBe('/custom/path');
      expect(r.options.retentionDays).toBe(90);
      expect(r.options.maxFileSize).toBe(1024);
      expect(r.options.compressOld).toBe(false);
    });

    it('creates storage directory when missing', () => {
      fs.existsSync.mockReturnValue(false);
      const _r = new AuditReporter({ storageDir: '/new/dir' });
      expect(fs.mkdirSync).toHaveBeenCalledWith('/new/dir', { recursive: true });
    });

    it('initializes entries and currentFile', () => {
      expect(reporter.entries).toEqual([]);
      expect(reporter.currentFile).toMatch(/audit_2026-07-31\.log$/);
      expect(reporter.currentFileSize).toBe(0);
    });
  });

  describe('log', () => {
    it('creates an entry and stores it', () => {
      const entry = reporter.log('test_event', { severity: 'error' });
      expect(reporter.entries).toHaveLength(1);
      expect(reporter.entries[0]).toBe(entry);
      expect(entry.eventType).toBe('test_event');
      expect(entry.severity).toBe('error');
    });

    it('writes entry JSON to file', () => {
      const entry = reporter.log('test_event');
      expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
      const written = JSON.parse(fs.appendFileSync.mock.calls[0][1]);
      expect(written.eventType).toBe('test_event');
      expect(written.id).toBe(entry.id);
    });
  });

  describe('log shortcuts', () => {
    it('logUserAction creates user_action entry', () => {
      const user = { id: 'u1', name: 'Alice' };
      const entry = reporter.logUserAction(user, 'login', 'system', { browser: 'Chrome' });
      expect(entry.eventType).toBe('user_action');
      expect(entry.userId).toBe('u1');
      expect(entry.userName).toBe('Alice');
      expect(entry.action).toBe('login');
      expect(entry.resource).toBe('system');
      expect(entry.severity).toBe('info');
      expect(entry.details).toEqual({ browser: 'Chrome' });
    });

    it('logUserAction works with empty details', () => {
      const entry = reporter.logUserAction({ id: 'u1', name: 'Bob' }, 'logout', 'app');
      expect(entry.details).toEqual({});
    });

    it('logSecurityEvent creates security entry', () => {
      const entry = reporter.logSecurityEvent({ id: 'u1', name: 'Alice' }, 'failed_login');
      expect(entry.eventType).toBe('security');
      expect(entry.severity).toBe('warning');
      expect(entry.action).toBe('failed_login');
    });

    it('logSecurityEvent handles null user', () => {
      const entry = reporter.logSecurityEvent(null, 'brute_force');
      expect(entry.userId).toBeUndefined();
      expect(entry.userName).toBeUndefined();
    });

    it('logSystemEvent creates system entry', () => {
      const entry = reporter.logSystemEvent('server_start', { port: 3000 });
      expect(entry.eventType).toBe('system');
      expect(entry.severity).toBe('info');
      expect(entry.action).toBe('server_start');
    });

    it('logDataChange creates data_change entry', () => {
      const changes = [{ field: 'email', old: 'a@b.com', new: 'c@d.com' }];
      const entry = reporter.logDataChange({ id: 'u1', name: 'Alice' }, 'users', changes);
      expect(entry.eventType).toBe('data_change');
      expect(entry.action).toBe('update');
      expect(entry.changes).toEqual(changes);
      expect(entry.severity).toBe('info');
    });

    it('logDataChange handles null user', () => {
      const entry = reporter.logDataChange(null, 'users', []);
      expect(entry.userId).toBeUndefined();
    });

    it('logError creates error entry with stack trace', () => {
      const error = new Error('Something broke');
      const entry = reporter.logError({ id: 'u1' }, error, { source: 'api' });
      expect(entry.eventType).toBe('error');
      expect(entry.severity).toBe('error');
      expect(entry.details.message).toBe('Something broke');
      expect(entry.details.stack).toBeDefined();
      expect(entry.details.source).toBe('api');
    });
  });

  describe('writeEntry', () => {
    it('rotates file when size exceeds maxFileSize', () => {
      const r = new AuditReporter({ storageDir: '/tmp/audit', maxFileSize: 50 });
      fs.statSync.mockReturnValue({ size: 100 });
      fs.createReadStream.mockReturnValue({ pipe: jest.fn().mockReturnThis() });
      fs.createWriteStream.mockReturnValue({});
      r.log('x', {});
      expect(fs.createReadStream).toHaveBeenCalled();
      expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('rotateFile', () => {
    it('creates a new dated file', () => {
      const r = new AuditReporter({ storageDir: '/tmp/audit' });
      r.currentFile = '/tmp/audit/audit_old.log';
      fs.statSync.mockReturnValue({ size: 0 });
      r.rotateFile();
      expect(r.currentFile).toMatch(/audit_2026-07-31\.log$/);
      expect(r.currentFileSize).toBe(0);
    });

    it('compresses old file when compressOld is true and size > 0', () => {
      const createReadStreamMock = { pipe: jest.fn().mockReturnThis() };
      const gzipMock = { pipe: jest.fn() };
      const mockCreateGzip = jest.fn(() => gzipMock);
      jest.isolateModules(() => {
        jest.mock('zlib', () => ({ createGzip: mockCreateGzip }));
        const r = new AuditReporter({ storageDir: '/tmp/audit' });
        r.currentFile = '/tmp/audit/audit_old.log';
        fs.statSync.mockReturnValue({ size: 500 });
        fs.createReadStream.mockReturnValue(createReadStreamMock);
        fs.createWriteStream.mockReturnValue({});
        r.rotateFile();
        expect(fs.createReadStream).toHaveBeenCalledWith('/tmp/audit/audit_old.log');
        expect(fs.createWriteStream).toHaveBeenCalledWith('/tmp/audit/audit_old.log.gz');
        expect(createReadStreamMock.pipe).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('query', () => {
    const entry1 = JSON.stringify({ id: '1', eventType: 'login', userId: 'u1', severity: 'info', resource: 'system', action: 'login', timestamp: 1000 });
    const entry2 = JSON.stringify({ id: '2', eventType: 'error', userId: 'u2', severity: 'error', resource: 'db', action: 'query', timestamp: 2000 });
    const entry3 = JSON.stringify({ id: '3', eventType: 'login', userId: 'u1', severity: 'info', resource: 'system', action: 'logout', timestamp: 1500 });

    beforeEach(() => {
      fs.readdirSync.mockReturnValue(['audit_2026-07-31.log']);
      fs.readFileSync.mockReturnValue([entry1, entry2, entry3].join('\n'));
    });

    it('returns all entries with default options', () => {
      const result = reporter.query();
      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(3);
      expect(result.hasMore).toBe(false);
    });

    it('returns empty when no log files exist', () => {
      fs.readdirSync.mockReturnValue([]);
      const result = reporter.query();
      expect(result.total).toBe(0);
      expect(result.data).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('filters by eventType', () => {
      const result = reporter.query({ eventType: 'login' });
      expect(result.total).toBe(2);
      expect(result.data.every(e => e.eventType === 'login')).toBe(true);
    });

    it('filters by userId', () => {
      const result = reporter.query({ userId: 'u2' });
      expect(result.total).toBe(1);
      expect(result.data[0].userId).toBe('u2');
    });

    it('filters by severity', () => {
      const result = reporter.query({ severity: 'error' });
      expect(result.total).toBe(1);
      expect(result.data[0].severity).toBe('error');
    });

    it('filters by resource', () => {
      const result = reporter.query({ resource: 'db' });
      expect(result.total).toBe(1);
      expect(result.data[0].resource).toBe('db');
    });

    it('filters by action', () => {
      const result = reporter.query({ action: 'logout' });
      expect(result.total).toBe(1);
      expect(result.data[0].action).toBe('logout');
    });

    it('filters by date range', () => {
      const result = reporter.query({ startDate: 1200, endDate: 1800 });
      expect(result.total).toBe(1);
      expect(result.data[0].id).toBe('3');
    });

    it('applies limit and offset', () => {
      const result = reporter.query({ limit: 1, offset: 1 });
      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(true);
    });

    it('returns hasMore false at end of results', () => {
      const result = reporter.query({ limit: 10, offset: 0 });
      expect(result.hasMore).toBe(false);
    });

    it('sorts results by timestamp descending', () => {
      const result = reporter.query();
      expect(result.data[0].timestamp).toBe(2000);
      expect(result.data[1].timestamp).toBe(1500);
      expect(result.data[2].timestamp).toBe(1000);
    });

    it('skips invalid JSON lines', () => {
      fs.readFileSync.mockReturnValue([entry1, 'not json', entry2].join('\n'));
      const result = reporter.query();
      expect(result.total).toBe(2);
    });

    it('skips unreadable files silently', () => {
      fs.readFileSync.mockImplementation(() => { throw new Error('permission denied'); });
      const result = reporter.query();
      expect(result.total).toBe(0);
    });

    it('filters multiple files', () => {
      fs.readdirSync.mockReturnValue(['audit_2026-07-30.log', 'audit_2026-07-31.log']);
      fs.readFileSync
        .mockReturnValueOnce(entry1)
        .mockReturnValueOnce(entry2);
      const result = reporter.query();
      expect(result.total).toBe(2);
    });
  });

  describe('getUserActivity', () => {
    it('delegates to query with userId filter', () => {
      fs.readdirSync.mockReturnValue(['audit.log']);
      fs.readFileSync.mockReturnValue('');
      jest.spyOn(reporter, 'query');
      reporter.getUserActivity('u1', { severity: 'error' });
      expect(reporter.query).toHaveBeenCalledWith({ severity: 'error', userId: 'u1' });
    });
  });

  describe('getResourceHistory', () => {
    it('delegates to query with resourceId into options', () => {
      fs.readdirSync.mockReturnValue(['audit.log']);
      fs.readFileSync.mockReturnValue('');
      jest.spyOn(reporter, 'query');
      reporter.getResourceHistory('doc-123', { limit: 50 });
      expect(reporter.query).toHaveBeenCalledWith({ limit: 50, resourceId: 'doc-123' });
    });
  });

  describe('generateReport', () => {
    const now = mockDate.getTime();
    const entries = [
      { id: '1', eventType: 'login', severity: 'info', userId: 'u1', resource: 'app', timestamp: now - 60000 },
      { id: '2', eventType: 'login', severity: 'info', userId: 'u1', resource: 'app', timestamp: now - 30000 },
      { id: '3', eventType: 'error', severity: 'error', userId: 'u2', resource: 'db', timestamp: now }
    ];

    beforeEach(() => {
      fs.readdirSync.mockReturnValue(['audit_2026-07-31.log']);
      fs.readFileSync.mockReturnValue(entries.map(e => JSON.stringify(e)).join('\n'));
    });

    it('returns stats grouped by type, severity, user, resource', () => {
      const report = reporter.generateReport();
      expect(report.stats.total).toBe(3);
      expect(report.stats.byType).toEqual({ login: 2, error: 1 });
      expect(report.stats.bySeverity).toEqual({ info: 2, error: 1 });
      expect(report.stats.byUser).toEqual({ u1: 2, u2: 1 });
      expect(report.stats.byResource).toEqual({ app: 2, db: 1 });
    });

    it('includes timeDistribution by hour', () => {
      const report = reporter.generateReport();
      expect(report.stats.timeDistribution).toBeDefined();
      const totalByHour = Object.values(report.stats.timeDistribution).reduce((a, b) => a + b, 0);
      expect(totalByHour).toBe(3);
    });

    it('returns top users sorted by count descending', () => {
      const now = mockDate.getTime();
      const manyEntries = [];
      for (let i = 0; i < 15; i++) {
        manyEntries.push({ id: String(i), eventType: 'login', severity: 'info', userId: `u${i % 8}`, resource: 'app', timestamp: now - i * 1000 });
      }
      fs.readFileSync.mockReturnValue(manyEntries.map(e => JSON.stringify(e)).join('\n'));
      const report = reporter.generateReport();
      expect(report.topUsers).toHaveLength(8);
      expect(report.topUsers[0].count).toBeGreaterThanOrEqual(report.topUsers[1].count);
    });

    it('uses default date range of last 7 days', () => {
      const report = reporter.generateReport();
      expect(report.period.startDate).toBe(mockDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      expect(report.period.endDate).toBe(mockDate.getTime());
    });

    it('includes generatedAt timestamp', () => {
      const report = reporter.generateReport();
      expect(report.generatedAt).toBe(mockDate.getTime());
    });
  });

  describe('exportReport', () => {
    beforeEach(() => {
      fs.readdirSync.mockReturnValue(['audit_2026-07-31.log']);
      fs.readFileSync.mockReturnValue(JSON.stringify({ id: '1', eventType: 'login', severity: 'info', timestamp: mockDate.getTime() }));
    });

    it('exports JSON format', () => {
      const result = reporter.exportReport('json');
      const parsed = JSON.parse(result);
      expect(parsed.stats).toBeDefined();
      expect(parsed.period).toBeDefined();
    });

    it('exports CSV format', () => {
      const result = reporter.exportReport('csv');
      expect(result).toContain('Type,Count');
      expect(result).toContain('login,1');
    });

    it('exports HTML format', () => {
      const result = reporter.exportReport('html');
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('Audit Report');
      expect(result).toContain('<table>');
    });

    it('defaults to JSON for unknown format', () => {
      const result = reporter.exportReport('xml');
      const parsed = JSON.parse(result);
      expect(parsed.stats).toBeDefined();
    });
  });

  describe('generateHTMLReport', () => {
    it('renders a complete HTML document with stats tables', () => {
      const report = {
        period: { startDate: 1000, endDate: 2000 },
        stats: { total: 5, byType: { login: 3, error: 2 }, bySeverity: { info: 3, error: 2 } },
        topUsers: [],
        generatedAt: 3000
      };
      const html = reporter.generateHTMLReport(report);
      expect(html).toContain('<title>Audit Report</title>');
      expect(html).toContain('Total Events: 5');
      expect(html).toContain('login</td><td>3');
      expect(html).toContain('class="severity-info"');
    });
  });

  describe('getLogFiles', () => {
    it('only includes audit_ prefixed .log and .log.gz files', () => {
      fs.readdirSync.mockReturnValue([
        'audit_2026-07-31.log',
        'audit_2026-07-30.log.gz',
        'other.log',
        'readme.txt',
        'audit_backup.zip'
      ]);
      const files = reporter.getLogFiles();
      expect(files).toHaveLength(2);
      expect(files[0]).toContain('audit_2026-07-30.log.gz');
      expect(files[1]).toContain('audit_2026-07-31.log');
    });

    it('returns full paths sorted alphabetically', () => {
      fs.readdirSync.mockReturnValue(['audit_b.log', 'audit_a.log']);
      const files = reporter.getLogFiles();
      expect(files).toHaveLength(2);
      expect(files[0]).toContain('audit_a.log');
      expect(files[1]).toContain('audit_b.log');
    });
  });

  describe('cleanup', () => {
    it('returns count of cleaned files', () => {
      fs.readdirSync.mockReturnValue(['audit_2026-07-31.log', 'audit_2026-07-30.log.gz']);
      fs.statSync.mockReturnValue({ size: 100 });
      const count = reporter.cleanup();
      expect(count).toBe(2);
    });
  });

  describe('ensureStorage', () => {
    it('does nothing if directory exists', () => {
      fs.existsSync.mockReturnValue(true);
      reporter.ensureStorage();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('creates directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);
      reporter.ensureStorage();
      expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/audit', { recursive: true });
    });
  });
});
