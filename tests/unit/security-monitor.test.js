const mockWatch = jest.fn();
const mockScanFiles = jest.fn();

jest.mock('chokidar', () => ({
  watch: (...args) => mockWatch(...args),
}));

jest.mock('../../scripts/security-scan', () => ({
  scanFiles: (...args) => mockScanFiles(...args),
}));

const { startSecurityMonitor, stopSecurityMonitor } = require('../../src/daemon/securityMonitor');

describe('securityMonitor', () => {
  let watcher;
  let listeners;
  let consoleErrorSpy;
  let consoleLogSpy;

  beforeEach(() => {
    listeners = {};
    watcher = {
      on: jest.fn((event, cb) => {
        listeners[event] = cb;
      }),
      close: jest.fn(),
    };
    mockWatch.mockReturnValue(watcher);
    mockScanFiles.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  test('startSecurityMonitor watches dirs and returns watcher', () => {
    const w = startSecurityMonitor();
    expect(mockWatch).toHaveBeenCalledTimes(1);
    expect(watcher.on).toHaveBeenCalledWith('change', expect.any(Function));
    expect(watcher.on).toHaveBeenCalledWith('add', expect.any(Function));
    expect(w).toBe(watcher);
  });

  test('file change schedules a debounced scan', () => {
    mockScanFiles.mockReturnValue([]);
    startSecurityMonitor();
    listeners.change('src/app/foo.js');
    expect(mockScanFiles).not.toHaveBeenCalled();
    jest.advanceTimersByTime(300);
    expect(mockScanFiles).toHaveBeenCalledTimes(1);
    expect(mockScanFiles).toHaveBeenCalledWith(['src/app/foo.js']);
  });

  test('ignored and non-js files are filtered out of scan', () => {
    mockScanFiles.mockReturnValue([]);
    startSecurityMonitor();
    listeners.add('src/app/foo.js');
    listeners.add('src/app/bar.js');
    listeners.add('node_modules/lib/index.js');
    listeners.add('src/app/.git/config.js');
    listeners.add('dist/bundle.js');
    listeners.add('coverage/lcov-report.js');
    listeners.add('test/foo.js');
    listeners.add('tests/foo.js');
    listeners.add('src/app/foo.test.js');
    listeners.add('src/app/foo.spec.js');
    listeners.add('src/app/styles.css');
    jest.advanceTimersByTime(300);
    const filesArg = mockScanFiles.mock.calls[0][0];
    expect(filesArg).toEqual(['src/app/foo.js', 'src/app/bar.js']);
  });

  test('debounce collapses multiple rapid events into one scan', () => {
    mockScanFiles.mockReturnValue([]);
    startSecurityMonitor();
    listeners.change('src/a.js');
    listeners.change('src/b.js');
    listeners.change('src/c.js');
    jest.advanceTimersByTime(100);
    listeners.change('src/d.js');
    jest.advanceTimersByTime(300);
    expect(mockScanFiles).toHaveBeenCalledTimes(1);
    expect(mockScanFiles.mock.calls[0][0]).toEqual(['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js']);
  });

  test('flushScan with no files does not call scanFiles', () => {
    mockScanFiles.mockReturnValue([]);
    startSecurityMonitor();
    listeners.change('node_modules/x.js');
    jest.advanceTimersByTime(300);
    expect(mockScanFiles).not.toHaveBeenCalled();
  });

  test('HIGH issues are reported to console.error', () => {
    mockScanFiles.mockReturnValue([
      { severity: 'HIGH', file: 'src/app/foo.js', message: 'hardcoded secret' },
    ]);
    startSecurityMonitor();
    listeners.change('src/app/foo.js');
    jest.advanceTimersByTime(300);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('1 HIGH severity issue(s)')
    );
  });

  test('HIGH issues with blockOnHigh report blocking message', () => {
    mockScanFiles.mockReturnValue([
      { severity: 'HIGH', file: 'src/app/foo.js', message: 'hardcoded secret' },
    ]);
    startSecurityMonitor({ blockOnHigh: true });
    listeners.change('src/app/foo.js');
    jest.advanceTimersByTime(300);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Blocking due to 1 HIGH issue(s)')
    );
  });

  test('MEDIUM issues are reported to console.log', () => {
    mockScanFiles.mockReturnValue([
      { severity: 'MEDIUM', file: 'src/app/foo.js', message: 'missing helmet' },
    ]);
    startSecurityMonitor();
    listeners.change('src/app/foo.js');
    jest.advanceTimersByTime(300);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('1 MEDIUM severity issue(s)')
    );
  });

  test('scan errors are caught and reported', () => {
    mockScanFiles.mockImplementation(() => {
      throw new Error('boom');
    });
    startSecurityMonitor();
    listeners.change('src/app/foo.js');
    jest.advanceTimersByTime(300);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Scan error: boom')
    );
  });

  test('stopSecurityMonitor closes watcher', () => {
    stopSecurityMonitor(watcher);
    expect(watcher.close).toHaveBeenCalled();
  });

  test('stopSecurityMonitor handles null watcher', () => {
    expect(() => stopSecurityMonitor(null)).not.toThrow();
  });
});
