const { SecureErrorHandler, errors } = require('../../src/security/SecureErrorHandler');

describe('SecureErrorHandler', () => {
  let handler;

  beforeEach(() => {
    handler = new SecureErrorHandler();
  });

  describe('classifyError', () => {
    it('classifies known error types', () => {
      const err = new Error('test');
      err.type = 'VALIDATION';
      const result = handler.classifyError(err);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.status).toBe(400);
    });

    it('defaults to INTERNAL for missing type', () => {
      const result = handler.classifyError(new Error('test'));
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.status).toBe(500);
    });

    it('defaults to INTERNAL for unknown type name', () => {
      const err = new Error('test');
      err.type = 'UNKNOWN_TYPE';
      const result = handler.classifyError(err);
      expect(result.code).toBe('INTERNAL_ERROR');
    });

    it('handles all error types', () => {
      const types = ['VALIDATION', 'AUTHENTICATION', 'AUTHORIZATION', 'NOT_FOUND', 'RATE_LIMIT', 'EXTERNAL'];
      types.forEach((type) => {
        const err = new Error('test');
        err.type = type;
        const result = handler.classifyError(err);
        expect(result.type).toBe(type);
      });
    });
  });

  describe('handle', () => {
    it('returns error response with status and body', () => {
      const err = new Error('test error');
      err.type = 'VALIDATION';
      const { status, body } = handler.handle(err);
      expect(status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('exposes message for expose=true types', () => {
      const err = new Error('not found');
      err.type = 'NOT_FOUND';
      const { body } = handler.handle(err);
      expect(body.error.message).toBe('not found');
    });

    it('hides message for expose=false types', () => {
      const err = new Error('internal details');
      err.type = 'INTERNAL';
      const { body } = handler.handle(err);
      expect(body.error.message).not.toBe('internal details');
    });

    it('includes requestId when provided', () => {
      const err = new Error('test');
      err.type = 'VALIDATION';
      const { body } = handler.handle(err, { requestId: 'req-123' });
      expect(body.requestId).toBe('req-123');
    });

    it('includes stack trace in development mode', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const err = new Error('test');
      err.type = 'VALIDATION';
      const { body } = handler.handle(err);
      expect(body.error.details).toBeDefined();
      expect(body.error.details).toContain('Error: test');
      process.env.NODE_ENV = origEnv;
    });
  });

  describe('filterSensitiveData', () => {
    it('redacts sensitive fields', () => {
      const data = { username: 'john', password: 'secret123', apiKey: 'abc' };
      const filtered = handler.filterSensitiveData(data);
      expect(filtered.username).toBe('john');
      expect(filtered.password).toBe('[REDACTED]');
      expect(filtered.apiKey).toBe('[REDACTED]');
    });

    it('recurses into nested objects', () => {
      const data = { user: { name: 'john', password: 'secret' } };
      const filtered = handler.filterSensitiveData(data);
      expect(filtered.user.name).toBe('john');
      expect(filtered.user.password).toBe('[REDACTED]');
    });

    it('stops at max depth', () => {
      const deep = { a: { b: { c: { d: { e: { f: { g: 'deep' } } } } } } };
      const result = handler.filterSensitiveData(deep);
      expect(typeof result).toBe('object');
    });

    it('handles null and undefined', () => {
      expect(handler.filterSensitiveData(null)).toBeNull();
      expect(handler.filterSensitiveData(undefined)).toBeUndefined();
    });

    it('returns non-object, non-string types as-is', () => {
      expect(handler.filterSensitiveData(42)).toBe(42);
      expect(handler.filterSensitiveData(true)).toBe(true);
    });

    it('masks sensitive string values', () => {
      const result = handler.filterSensitiveData('my-secret-token');
      expect(result).not.toBe('my-secret-token');
    });
  });

  describe('isSensitiveField', () => {
    it('detects known sensitive fields', () => {
      expect(handler.isSensitiveField('password')).toBe(true);
      expect(handler.isSensitiveField('apiKey')).toBe(true);
      expect(handler.isSensitiveField('token')).toBe(true);
    });

    it('detects fields containing secret or password', () => {
      expect(handler.isSensitiveField('newPassword')).toBe(true);
      expect(handler.isSensitiveField('secretKey')).toBe(true);
    });

    it('is case insensitive', () => {
      expect(handler.isSensitiveField('PASSWORD')).toBe(true);
      expect(handler.isSensitiveField('ApiKey')).toBe(true);
    });

    it('returns false for non-sensitive fields', () => {
      expect(handler.isSensitiveField('username')).toBe(false);
      expect(handler.isSensitiveField('email')).toBe(false);
    });
  });

  describe('maskSensitiveValue', () => {
    it('masks long values showing first 2 and last 2 chars', () => {
      expect(handler.maskSensitiveValue('abcdefgh')).toBe('ab****gh');
    });

    it('returns **** for short values', () => {
      expect(handler.maskSensitiveValue('abc')).toBe('****');
      expect(handler.maskSensitiveValue('ab')).toBe('****');
    });

    it('caps masking length to 20 asterisks', () => {
      const long = 'a'.repeat(52);
      const masked = handler.maskSensitiveValue(long);
      expect(masked).toBe('aa' + '*'.repeat(20) + 'aa');
    });

    it('returns non-string values as-is', () => {
      expect(handler.maskSensitiveValue(123)).toBe(123);
      expect(handler.maskSensitiveValue(null)).toBeNull();
    });
  });

  describe('maskIP', () => {
    it('masks IPv4 addresses', () => {
      expect(handler.maskIP('192.168.1.1')).toBe('192.xxx.xxx.1');
    });

    it('masks IPv6 addresses', () => {
      const masked = handler.maskIP('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      expect(masked).toContain('...');
      expect(masked.length).toBeLessThan(20);
    });

    it('returns null for null/undefined', () => {
      expect(handler.maskIP(null)).toBeNull();
      expect(handler.maskIP(undefined)).toBeNull();
    });

    it('returns fallback for unrecognized IP format', () => {
      expect(handler.maskIP('invalid-ip')).toBe('xxx.xxx.xxx.xxx');
    });
  });

  describe('generateRequestId', () => {
    it('generates request ID with req_ prefix', () => {
      expect(handler.generateRequestId()).toMatch(/^req_/);
    });

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => handler.generateRequestId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('getErrorLog', () => {
    it('returns logged errors', () => {
      handler.logError(new Error('test1'), {}, { type: 'VALIDATION', code: 'VALIDATION_ERROR' });
      handler.logError(new Error('test2'), {}, { type: 'INTERNAL', code: 'INTERNAL_ERROR' });
      expect(handler.getErrorLog()).toHaveLength(2);
    });

    it('filters by type', () => {
      handler.logError(new Error('test1'), {}, { type: 'VALIDATION', code: 'VALIDATION_ERROR' });
      handler.logError(new Error('test2'), {}, { type: 'INTERNAL', code: 'INTERNAL_ERROR' });
      expect(handler.getErrorLog({ type: 'VALIDATION' })).toHaveLength(1);
    });

    it('filters by since timestamp', () => {
      handler.logError(new Error('old'), {}, { type: 'VALIDATION', code: 'VALIDATION_ERROR' });
      handler.logError(new Error('new'), {}, { type: 'VALIDATION', code: 'VALIDATION_ERROR' });
      const logs = handler.getErrorLog({ since: new Date(Date.now() - 1000).toISOString() });
      expect(logs).toHaveLength(2);
    });
  });

  describe('getErrorStats', () => {
    it('returns counts by type', () => {
      handler.logError(new Error('test1'), {}, { type: 'VALIDATION', code: 'VALIDATION_ERROR' });
      handler.logError(new Error('test2'), {}, { type: 'VALIDATION', code: 'VALIDATION_ERROR' });
      handler.logError(new Error('test3'), {}, { type: 'INTERNAL', code: 'INTERNAL_ERROR' });
      const stats = handler.getErrorStats();
      expect(stats.VALIDATION).toBe(2);
      expect(stats.INTERNAL).toBe(1);
    });
  });

  describe('createMiddleware', () => {
    it('returns error middleware function', () => {
      const middleware = handler.createMiddleware();
      expect(middleware).toBeInstanceOf(Function);
      expect(middleware.length).toBe(4);
    });

    it('returns error response via middleware', () => {
      const middleware = handler.createMiddleware();
      const err = new Error('test error');
      err.type = 'VALIDATION';
      const req = { id: 'req-1', user: { id: 'user-1' }, path: '/test', method: 'POST', headers: { 'user-agent': 'test' }, ip: '192.168.1.1' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      middleware(err, req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
      const body = res.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('errorLog size limit', () => {
    it('trims log when exceeding maxLogSize', () => {
      handler.maxLogSize = 3;
      for (let i = 0; i < 5; i++) {
        handler.logError(new Error(`test${i}`), {}, { type: 'VALIDATION', code: 'VALIDATION_ERROR' });
      }
      expect(handler.errorLog.length).toBe(3);
    });
  });

  describe('createError', () => {
    it('creates error with type and details', () => {
      const err = handler.createError('VALIDATION', 'invalid input', { field: 'email' });
      expect(err.message).toBe('invalid input');
      expect(err.type).toBe('VALIDATION');
      expect(err.details).toEqual({ field: 'email' });
    });

    it('creates error without details', () => {
      const err = handler.createError('INTERNAL', 'something broke');
      expect(err.message).toBe('something broke');
      expect(err.details).toEqual({});
    });
  });

  describe('static errors', () => {
    it('creates validation error', () => {
      const err = errors.ValidationError('invalid', { field: 'x' });
      expect(err.type).toBe('VALIDATION');
      expect(err.message).toBe('invalid');
    });

    it('creates authentication error', () => {
      expect(errors.AuthenticationError('unauthorized').type).toBe('AUTHENTICATION');
    });

    it('creates not found error with resource message', () => {
      expect(errors.NotFoundError('User').message).toBe('User not found');
    });

    it('creates authorization error', () => {
      expect(errors.AuthorizationError('forbidden').type).toBe('AUTHORIZATION');
    });

    it('creates rate limit error with default message', () => {
      expect(errors.RateLimitError().message).toBe('Rate limit exceeded');
    });

    it('creates internal error', () => {
      expect(errors.InternalError('oops').type).toBe('INTERNAL');
    });

    it('creates external error', () => {
      expect(errors.ExternalError('downstream failed').type).toBe('EXTERNAL');
    });
  });
});
