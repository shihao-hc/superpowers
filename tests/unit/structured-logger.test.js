const { StructuredLogger } = require('../../src/logging/StructuredLogger');

describe('StructuredLogger', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('applies default options', () => {
      const logger = new StructuredLogger();
      expect(logger.service).toBe('ultrawork');
      expect(logger.level).toBe('info');
      expect(logger.output).toBe('console');
      expect(logger.maxLogs).toBe(10000);
      expect(logger.logs).toEqual([]);
    });

    it('accepts custom options', () => {
      const logger = new StructuredLogger({
        service: 'custom-svc', level: 'debug', output: 'buffer', maxLogs: 500
      });
      expect(logger.service).toBe('custom-svc');
      expect(logger.level).toBe('debug');
      expect(logger.output).toBe('buffer');
      expect(logger.maxLogs).toBe(500);
    });
  });

  describe('start / stop', () => {
    it('does not start timer for console output', () => {
      jest.spyOn(global, 'setInterval');
      const logger = new StructuredLogger();
      logger.start();
      expect(setInterval).not.toHaveBeenCalled();
    });

    it('starts flush interval for buffer output', () => {
      jest.spyOn(global, 'setInterval');
      const logger = new StructuredLogger({ output: 'buffer' });
      logger.start();
      expect(setInterval).toHaveBeenCalled();
      clearInterval(logger._timer);
    });

    it('does not start timer twice', () => {
      jest.spyOn(global, 'setInterval');
      const logger = new StructuredLogger({ output: 'buffer' });
      logger.start();
      logger.start();
      expect(setInterval).toHaveBeenCalledTimes(1);
      clearInterval(logger._timer);
    });

    it('stops timer and flushes buffer', () => {
      const logger = new StructuredLogger({ output: 'buffer' });
      logger.start();
      const flushSpy = jest.spyOn(logger, '_flush');
      logger.stop();
      expect(logger._timer).toBeNull();
      expect(flushSpy).toHaveBeenCalled();
    });

    it('stop is safe when timer is not running', () => {
      const logger = new StructuredLogger();
      expect(() => { logger.stop(); }).not.toThrow();
    });
  });

  describe('_shouldLog', () => {
    it('filters levels below threshold', () => {
      const logger = new StructuredLogger({ level: 'warn' });
      expect(logger._shouldLog('error')).toBe(true);
      expect(logger._shouldLog('warn')).toBe(true);
      expect(logger._shouldLog('info')).toBe(false);
      expect(logger._shouldLog('debug')).toBe(false);
      expect(logger._shouldLog('trace')).toBe(false);
    });
  });

  describe('_createEntry', () => {
    it('creates entry with all fields', () => {
      const logger = new StructuredLogger();
      const entry = logger._createEntry('info', 'test message', { extra: 'data' });

      expect(entry.timestamp).toBeDefined();
      expect(entry.level).toBe('info');
      expect(entry.service).toBe('ultrawork');
      expect(entry.message).toBe('test message');
      expect(entry.pid).toBe(process.pid);
      expect(entry.extra).toBe('data');
    });

    it('generates traceId when not provided', () => {
      const logger = new StructuredLogger();
      const entry = logger._createEntry('info', 'no traceId');
      expect(entry.traceId).toBeUndefined();
    });

    it('preserves traceId when provided in data', () => {
      const logger = new StructuredLogger();
      const entry = logger._createEntry('error', 'has trace', { traceId: 'custom-123' });
      expect(entry.traceId).toBe('custom-123');
    });
  });

  describe('_output', () => {
    it('outputs error level to console.error', () => {
      const logger = new StructuredLogger();
      logger._output({ level: 'error', message: 'err' });
      expect(console.error).toHaveBeenCalled();
    });

    it('outputs warn level to console.warn', () => {
      const logger = new StructuredLogger();
      logger._output({ level: 'warn', message: 'wrn' });
      expect(console.warn).toHaveBeenCalled();
    });

    it('outputs info and other levels to console.log', () => {
      const logger = new StructuredLogger();
      logger._output({ level: 'info', message: 'inf' });
      logger._output({ level: 'debug', message: 'dbg' });
      expect(console.log).toHaveBeenCalledTimes(2);
    });

    it('serialises entry as JSON', () => {
      const logger = new StructuredLogger();
      logger._output({ level: 'info', message: 'json check' });
      const callArg = console.log.mock.calls[0][0];
      const parsed = JSON.parse(callArg);
      expect(parsed.message).toBe('json check');
    });

    it('stores entry in buffer mode', () => {
      const logger = new StructuredLogger({ output: 'buffer' });
      logger._output({ level: 'info', message: 'buffered' });
      expect(logger.logs).toHaveLength(1);
      expect(logger.logs[0].message).toBe('buffered');
    });

    it('uses default case for unknown output mode', () => {
      const logger = new StructuredLogger({ output: 'unknown' });
      logger._output({ level: 'info', message: 'fallback' });
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('sanitizes macOS stack paths', () => {
      const logger = new StructuredLogger();
      logger.error('fail', {
        stack: 'Error\n    at run (/Users/john/project/file.js:10)'
      });
      const entry = JSON.parse(console.error.mock.calls[0][0]);
      expect(entry.stack).toBe('Error\n    at run (/[user]/project/file.js:10)');
    });

    it('sanitizes Linux stack paths', () => {
      const logger = new StructuredLogger();
      logger.error('fail', {
        stack: 'Error\n    at run (/home/john/project/file.js:10)'
      });
      const entry = JSON.parse(console.error.mock.calls[0][0]);
      expect(entry.stack).toBe('Error\n    at run (/[user]/project/file.js:10)');
    });

    it('sanitizes Windows stack paths', () => {
      const logger = new StructuredLogger();
      logger.error('fail', {
        stack: 'Error\n    at run (\\\\Users\\\\john\\\\project\\\\file.js:10)'
      });
      const entry = JSON.parse(console.error.mock.calls[0][0]);
      expect(entry.stack).toContain('\\\\[user]');
      expect(entry.stack).not.toContain('\\\\Users\\\\john');
    });

    it('removes sensitive fields from data', () => {
      const logger = new StructuredLogger();
      logger.error('leak', {
        password: 'secret123',
        token: 'abc',
        secret: 'mykey',
        apiKey: 'xxxx'
      });
      const entry = JSON.parse(console.error.mock.calls[0][0]);
      expect(entry.password).toBeUndefined();
      expect(entry.token).toBeUndefined();
      expect(entry.secret).toBeUndefined();
      expect(entry.apiKey).toBeUndefined();
    });

    it('skips logging when error level is filtered', () => {
      const logger = new StructuredLogger({ level: 'error' });
      logger.trace('filtered out');
      expect(console.error).not.toHaveBeenCalled();
    });

    it('returns early when error is filtered', () => {
      const logger = new StructuredLogger({ level: 'invalid' });
      logger.error('should be filtered');
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe('warn / info / debug / trace', () => {
    it('logs warn to console.warn', () => {
      const logger = new StructuredLogger();
      logger.warn('warning message');
      expect(console.warn).toHaveBeenCalled();
    });

    it('logs info to console.log', () => {
      const logger = new StructuredLogger();
      logger.info('info message');
      expect(console.log).toHaveBeenCalled();
    });

    it('logs debug to console.log', () => {
      const logger = new StructuredLogger({ level: 'debug' });
      logger.debug('debug message');
      expect(console.log).toHaveBeenCalled();
    });

    it('logs trace to console.log', () => {
      const logger = new StructuredLogger({ level: 'trace' });
      logger.trace('trace message');
      expect(console.log).toHaveBeenCalled();
    });

    it('respects level filtering in warn', () => {
      const logger = new StructuredLogger({ level: 'error' });
      logger.warn('should not log');
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('respects level filtering in info', () => {
      const logger = new StructuredLogger({ level: 'warn' });
      logger.info('should not log');
      expect(console.log).not.toHaveBeenCalled();
    });

    it('respects level filtering in debug', () => {
      const logger = new StructuredLogger({ level: 'info' });
      logger.debug('should not log');
      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe('request', () => {
    it('logs HTTP request info', () => {
      const logger = new StructuredLogger();
      const req = { method: 'GET', path: '/api/test', ip: '127.0.0.1', headers: { 'user-agent': 'test-agent/1.0' } };
      const res = { statusCode: 200 };

      logger.request(req, res, 150);

      const entry = JSON.parse(console.log.mock.calls[0][0]);
      expect(entry.message).toBe('HTTP Request');
      expect(entry.method).toBe('GET');
      expect(entry.path).toBe('/api/test');
      expect(entry.status).toBe(200);
      expect(entry.duration).toBe(150);
      expect(entry.ip).toBe('127.0.0.1');
      expect(entry.userAgent).toBe('test-agent/1.0');
    });

    it('truncates user agent to 100 chars', () => {
      const logger = new StructuredLogger();
      const longUA = 'A'.repeat(200);
      const req = { method: 'POST', path: '/', ip: '::1', headers: { 'user-agent': longUA } };
      const res = { statusCode: 201 };

      logger.request(req, res, 50);

      const entry = JSON.parse(console.log.mock.calls[0][0]);
      expect(entry.userAgent).toHaveLength(100);
    });

    it('handles missing user-agent header', () => {
      const logger = new StructuredLogger();
      const req = { method: 'GET', path: '/', ip: '::1', headers: {} };
      const res = { statusCode: 200 };

      logger.request(req, res, 10);

      const entry = JSON.parse(console.log.mock.calls[0][0]);
      expect(entry.userAgent).toBeUndefined();
    });
  });

  describe('workflow / agent / security', () => {
    it('logs workflow events', () => {
      const logger = new StructuredLogger();
      logger.workflow('wf-1', 'start', { payload: 'data' });
      const entry = JSON.parse(console.log.mock.calls[0][0]);
      expect(entry.message).toBe('Workflow Event');
      expect(entry.workflowId).toBe('wf-1');
      expect(entry.event).toBe('start');
      expect(entry.payload).toBe('data');
    });

    it('logs agent events', () => {
      const logger = new StructuredLogger();
      logger.agent('agent-1', 'task_complete', { result: 'ok' });
      const entry = JSON.parse(console.log.mock.calls[0][0]);
      expect(entry.message).toBe('Agent Event');
      expect(entry.agentId).toBe('agent-1');
      expect(entry.event).toBe('task_complete');
      expect(entry.result).toBe('ok');
    });

    it('logs security events as warn', () => {
      const logger = new StructuredLogger();
      logger.security('login_failed', { ip: '1.2.3.4' });
      expect(console.warn).toHaveBeenCalled();
      const entry = JSON.parse(console.warn.mock.calls[0][0]);
      expect(entry.message).toBe('Security Event');
      expect(entry.event).toBe('login_failed');
      expect(entry.ip).toBe('1.2.3.4');
    });

    it('workflow works without data argument', () => {
      const logger = new StructuredLogger();
      logger.workflow('wf-1', 'start');
      const entry = JSON.parse(console.log.mock.calls[0][0]);
      expect(entry.workflowId).toBe('wf-1');
      expect(entry.event).toBe('start');
    });

    it('agent works without data argument', () => {
      const logger = new StructuredLogger();
      logger.agent('agent-1', 'ready');
      const entry = JSON.parse(console.log.mock.calls[0][0]);
      expect(entry.agentId).toBe('agent-1');
      expect(entry.event).toBe('ready');
    });

    it('security works without data argument', () => {
      const logger = new StructuredLogger();
      logger.security('access_denied');
      expect(console.warn).toHaveBeenCalled();
      const entry = JSON.parse(console.warn.mock.calls[0][0]);
      expect(entry.event).toBe('access_denied');
    });
  });

  describe('getLogs', () => {
    it('returns empty array when buffer is empty', () => {
      const logger = new StructuredLogger({ output: 'buffer' });
      expect(logger.getLogs()).toEqual([]);
    });

    it('returns all buffered logs by default', () => {
      const logger = new StructuredLogger({ output: 'buffer' });
      logger.info('msg1');
      logger.info('msg2');
      expect(logger.getLogs()).toHaveLength(2);
    });

    it('filters by level', () => {
      const logger = new StructuredLogger({ output: 'buffer' });
      logger.info('info msg');
      logger.error('error msg');
      logger.warn('warn msg');

      const errors = logger.getLogs({ level: 'error' });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('error msg');
    });

    it('filters by service', () => {
      const logger = new StructuredLogger({ output: 'buffer', service: 'my-svc' });
      logger.info('test');
      expect(logger.getLogs({ service: 'my-svc' })).toHaveLength(1);
      expect(logger.getLogs({ service: 'other' })).toHaveLength(0);
    });

    it('filters by since timestamp', () => {
      const logger = new StructuredLogger({ output: 'buffer' });
      logger.info('old');
      const future = new Date(Date.now() + 86400000).toISOString();
      expect(logger.getLogs({ since: future })).toHaveLength(0);
    });

    it('respects limit option', () => {
      const logger = new StructuredLogger({ output: 'buffer' });
      for (let i = 0; i < 150; i++) {
        logger.info(`msg${i}`);
      }
      expect(logger.getLogs({ limit: 50 })).toHaveLength(50);
    });
  });

  describe('getStats', () => {
    it('returns zero counts for empty log', () => {
      const logger = new StructuredLogger({ output: 'buffer' });
      const stats = logger.getStats();
      expect(stats.total).toBe(0);
      expect(stats.levelCounts).toEqual({});
      expect(stats.service).toBe('ultrawork');
      expect(stats.level).toBe('info');
    });

    it('counts entries by level', () => {
      const logger = new StructuredLogger({ output: 'buffer' });
      logger.error('e1');
      logger.info('i1');
      logger.info('i2');
      logger.warn('w1');

      const stats = logger.getStats();
      expect(stats.total).toBe(4);
      expect(stats.levelCounts).toEqual({ error: 1, info: 2, warn: 1 });
    });
  });

  describe('destroy', () => {
    it('stops timer and clears state', () => {
      const logger = new StructuredLogger({ output: 'buffer' });
      logger.start();
      logger.info('entry');
      logger.destroy();
      expect(logger._timer).toBeNull();
      expect(logger.logs).toHaveLength(0);
    });
  });

  describe('_flush', () => {
    it('clears buffer', () => {
      const logger = new StructuredLogger();
      logger._buffer = [1, 2, 3];
      logger._flush();
      expect(logger._buffer).toEqual([]);
    });
  });

  describe('buffer overflow', () => {
    it('trims oldest entries when exceeding maxLogs', () => {
      const logger = new StructuredLogger({ output: 'buffer', maxLogs: 10 });
      for (let i = 0; i < 15; i++) {
        logger.info(`msg${i}`);
      }
      expect(logger.logs.length).toBeLessThanOrEqual(10);
    });
  });

  describe('data spread in _createEntry', () => {
    it('allows data fields to override entry fields', () => {
      const logger = new StructuredLogger({ service: 'original' });
      const entry = logger._createEntry('info', 'msg', { service: 'overridden' });
      expect(entry.service).toBe('overridden');
    });
  });
});
