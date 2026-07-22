const { EnhancedInputValidator, validator } = require('../../src/security/EnhancedInputValidator');

describe('EnhancedInputValidator', () => {
  let v;

  beforeEach(() => {
    v = new EnhancedInputValidator();
  });

  describe('validate', () => {
    it('validates email format', () => {
      const r = v.validate('test@example.com', 'email');
      expect(r.valid).toBe(true);
    });

    it('rejects invalid email', () => {
      const r = v.validate('not-an-email', 'email');
      expect(r.valid).toBe(false);
      expect(r.errors).toContain('Invalid email format');
    });

    it('validates URL format', () => {
      expect(v.validate('https://example.com', 'url').valid).toBe(true);
      expect(v.validate('http://example.com/path', 'url').valid).toBe(true);
      expect(v.validate('not-a-url', 'url').valid).toBe(false);
    });

    it('validates phone format', () => {
      expect(v.validate('+86 138-0000-0000', 'phone').valid).toBe(true);
      expect(v.validate('abc', 'phone').valid).toBe(false);
    });

    it('validates IPv4', () => {
      expect(v.validate('192.168.1.1', 'ipv4').valid).toBe(true);
      expect(v.validate('abc.def.ghi.jkl', 'ipv4').valid).toBe(false);
    });

    it('validates UUID', () => {
      expect(v.validate('550e8400-e29b-41d4-a716-446655440000', 'uuid').valid).toBe(true);
      expect(v.validate('not-a-uuid', 'uuid').valid).toBe(false);
    });

    it('validates alphanumeric', () => {
      expect(v.validate('abc123', 'alphanumeric').valid).toBe(true);
      expect(v.validate('abc-123', 'alphanumeric').valid).toBe(false);
    });

    it('returns valid for text type without checks', () => {
      const r = v.validate('anything goes here', 'text');
      expect(r.valid).toBe(true);
    });

    it('handles null and undefined', () => {
      expect(v.validate(null, 'text').valid).toBe(true);
      expect(v.validate(undefined, 'text').valid).toBe(true);
    });

    it('uses default type and options when omitted', () => {
      expect(v.validate('hello').valid).toBe(true);
    });

    it('rejects null when required', () => {
      const r = v.validate(null, 'text', { required: true });
      expect(r.valid).toBe(false);
      expect(r.errors).toContain('Input is required');
    });

    it('enforces minLength', () => {
      const r = v.validate('ab', 'text', { minLength: 3 });
      expect(r.valid).toBe(false);
      expect(r.errors).toContain('Minimum length is 3');
    });

    it('enforces maxLength with truncation warning', () => {
      const r = v.validate('hello world', 'text', { maxLength: 5 });
      expect(r.valid).toBe(true);
      expect(r.warnings).toContain('Truncated to 5 characters');
      expect(r.value).toBe('hello');
    });

    it('detects XSS patterns by default', () => {
      const r = v.validate('<script>alert("xss")</script>', 'text');
      expect(r.valid).toBe(false);
      expect(r.errors.some(e => e.includes('Dangerous'))).toBe(true);
    });

    it('skips dangerous check when disabled', () => {
      const r = v.validate('<script>alert("xss")</script>', 'text', { checkDangerous: false });
      expect(r.valid).toBe(true);
    });

    it('detects SQL injection by default', () => {
      const r = v.validate('SELECT * FROM users', 'text');
      expect(r.valid).toBe(false);
    });

    it('skips SQL check when disabled', () => {
      const r = v.validate('SELECT * FROM users', 'text', { checkSQL: false });
      expect(r.valid).toBe(true);
    });

    it('detects path traversal by default', () => {
      const r = v.validate('../../../etc/passwd', 'text');
      expect(r.valid).toBe(false);
    });

    it('skips path traversal check when disabled', () => {
      const r = v.validate('../../../etc/passwd', 'text', { checkPathTraversal: false });
      expect(r.valid).toBe(true);
    });

    it('returns sanitized value on valid input', () => {
      const r = v.validate('safe input', 'text');
      expect(r.valid).toBe(true);
      expect(r.sanitized).toBe('safe input');
    });

    it('converts non-string input to string', () => {
      const r = v.validate(12345, 'text');
      expect(r.valid).toBe(true);
      expect(r.sanitized).toBe('12345');
    });

    it('uses regex for type-specific validation', () => {
      const r = v.validate('abc', 'numeric');
      expect(r.valid).toBe(false);
    });

    it('validates alpha type', () => {
      expect(v.validate('abc', 'alpha').valid).toBe(true);
      expect(v.validate('abc123', 'alpha').valid).toBe(false);
    });
  });

  describe('checkDangerousPatterns', () => {
    it('detects script tags', () => {
      const r = v.checkDangerousPatterns('<script>evil()</script>');
      expect(r.dangerous).toBe(true);
    });

    it('detects javascript: protocol', () => {
      // eslint-disable-next-line no-script-url
      const r = v.checkDangerousPatterns('javascript:alert(1)');
      expect(r.dangerous).toBe(true);
    });

    it('detects event handlers', () => {
      const r = v.checkDangerousPatterns('<div onload="evil()">');
      expect(r.dangerous).toBe(true);
    });

    it('detects eval()', () => {
      const r = v.checkDangerousPatterns('eval(something)');
      expect(r.dangerous).toBe(true);
    });

    it('detects iframe injection', () => {
      const r = v.checkDangerousPatterns('<iframe src="http://evil.com">');
      expect(r.dangerous).toBe(true);
    });

    it('detects template injection', () => {
      const r = v.checkDangerousPatterns('${code.injection}');
      expect(r.dangerous).toBe(true);
    });

    it('returns safe for clean input', () => {
      const r = v.checkDangerousPatterns('hello world');
      expect(r.dangerous).toBe(false);
    });
  });

  describe('checkSQLInjection', () => {
    it('detects SELECT', () => {
      expect(v.checkSQLInjection('SELECT * FROM users').dangerous).toBe(true);
    });

    it('detects UNION', () => {
      expect(v.checkSQLInjection('UNION SELECT password').dangerous).toBe(true);
    });

    it('detects comments', () => {
      expect(v.checkSQLInjection('admin\'--').dangerous).toBe(true);
      expect(v.checkSQLInjection('/* comment */').dangerous).toBe(true);
    });

    it('detects DROP', () => {
      expect(v.checkSQLInjection('DROP TABLE users').dangerous).toBe(true);
    });

    it('detects INTO OUTFILE', () => {
      expect(v.checkSQLInjection('INTOsOUTFILE').dangerous).toBe(true);
    });

    it('returns safe for clean input', () => {
      expect(v.checkSQLInjection('hello world').dangerous).toBe(false);
    });
  });

  describe('checkPathTraversal', () => {
    it('detects ../ patterns', () => {
      expect(v.checkPathTraversal('../../../etc/passwd').dangerous).toBe(true);
    });

    it('detects URL-encoded traversal', () => {
      expect(v.checkPathTraversal('%2e%2e%2fetc').dangerous).toBe(true);
      expect(v.checkPathTraversal('%252e%252e%252fetc').dangerous).toBe(true);
    });

    it('detects Windows paths', () => {
      expect(v.checkPathTraversal('c:\\windows\\system32').dangerous).toBe(true);
    });

    it('detects /etc/passwd references', () => {
      expect(v.checkPathTraversal('/etc/passwd').dangerous).toBe(true);
      expect(v.checkPathTraversal('/etc/shadow').dangerous).toBe(true);
    });

    it('returns safe for clean input', () => {
      expect(v.checkPathTraversal('hello world').dangerous).toBe(false);
    });
  });

  describe('checkCommandInjection', () => {
    it('detects shell metacharacters', () => {
      expect(v.checkCommandInjection('ls; rm -rf /').dangerous).toBe(true);
      expect(v.checkCommandInjection('cmd | more').dangerous).toBe(true);
      expect(v.checkCommandInjection('cmd && echo').dangerous).toBe(true);
    });

    it('detects backtick commands', () => {
      expect(v.checkCommandInjection('`cat /etc/passwd`').dangerous).toBe(true);
    });

    it('detects rm -rf via semicolon', () => {
      expect(v.checkCommandInjection('; rm -rf /').dangerous).toBe(true);
    });

    it('detects del command', () => {
      expect(v.checkCommandInjection('; del /f file.txt').dangerous).toBe(true);
    });

    it('detects redirect to /dev/', () => {
      expect(v.checkCommandInjection('> /dev/null').dangerous).toBe(true);
    });

    it('returns safe for clean input', () => {
      expect(v.checkCommandInjection('hello world').dangerous).toBe(false);
    });
  });

  describe('IPv6 validation', () => {
    it('validates IPv6', () => {
      expect(v.validate('fe80:0000:0000:0000:0000:0000:0000:0001', 'ipv6').valid).toBe(true);
      expect(v.validate('2001:0db8:85a3:0000:0000:8a2e:0370:7334', 'ipv6').valid).toBe(true);
      expect(v.validate('invalid', 'ipv6').valid).toBe(false);
    });
  });

  describe('sanitize', () => {
    it('removes null bytes', () => {
      expect(v.sanitize('hello\x00world')).toBe('helloworld');
    });

    it('removes control characters', () => {
      expect(v.sanitize('hello\x01world')).toBe('helloworld');
    });

    it('preserves whitespace characters by default', () => {
      const result = v.sanitize('hello\nworld\t!');
      expect(result).toContain('\n');
    });

    it('removes HTML tags', () => {
      expect(v.sanitize('<b>bold</b>')).toBe('bold');
    });

    it('preserves HTML when allowHTML is true', () => {
      expect(v.sanitize('<b>bold</b>', { allowHTML: true })).toBe('<b>bold</b>');
    });

    it('removes event handlers', () => {
      expect(v.sanitize('<div onclick="evil()">')).toBe('');
    });

    it('removes javascript: protocol', () => {
      // eslint-disable-next-line no-script-url
      expect(v.sanitize('javascript:alert(1)')).toBe('alert(1)');
    });

    it('removes data: protocol', () => {
      expect(v.sanitize('data:text/html,<script>')).toBe('text/html,');
    });

    it('preserves newlines and tabs with preserveWhitespace option', () => {
      const result = v.sanitize('hello\x00world\n\t!', { preserveWhitespace: true });
      expect(result).not.toContain('\x00');
      expect(result).toContain('\n');
      expect(result).toContain('\t');
    });

    it('removes control chars when preserveWhitespace is false', () => {
      const result = v.sanitize('hello\x01world', { preserveWhitespace: false });
      expect(result).not.toContain('\x01');
    });

    it('truncates to maxLength', () => {
      expect(v.sanitize('hello world', { maxLength: 5 })).toBe('hello');
    });

    it('returns string from non-string input', () => {
      expect(v.sanitize(123)).toBe('123');
    });
  });

  describe('expression detection', () => {
    it('detects expression()', () => {
      const r = v.checkDangerousPatterns('expression(something)');
      expect(r.dangerous).toBe(true);
    });
  });

  describe('validateBatch', () => {
    it('validates multiple inputs', () => {
      const inputs = ['valid@email.com', 'not-email', 'another@test.com'];
      const results = v.validateBatch(inputs, 'email');
      expect(results).toHaveLength(3);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(false);
      expect(results[2].valid).toBe(true);
    });

    it('includes index in results', () => {
      const results = v.validateBatch(['a', 'b'], 'text');
      expect(results[0].index).toBe(0);
      expect(results[1].index).toBe(1);
    });

    it('uses default type when not provided', () => {
      const results = v.validateBatch(['a', 'b']);
      expect(results).toHaveLength(2);
      expect(results[0].valid).toBe(true);
    });
  });

  describe('createMiddleware', () => {
    it('returns middleware function', () => {
      const middleware = v.createMiddleware();
      expect(middleware).toBeInstanceOf(Function);
      expect(middleware.length).toBe(3);
    });

    it('sanitizes req.body fields', () => {
      const middleware = v.createMiddleware('text');
      const req = { body: { name: '  hello  ', age: '123' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      middleware(req, res, next);

      expect(req.body.name).toBe('  hello  ');
      expect(req.body.age).toBe('123');
      expect(next).toHaveBeenCalled();
    });

    it('updates body when sanitization removes dangerous chars', () => {
      const middleware = v.createMiddleware('text');
      const req = { body: { name: 'hello\x00world' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      middleware(req, res, next);

      expect(req.body.name).toBe('helloworld');
      expect(next).toHaveBeenCalled();
    });

    it('skips body update when value passes through without sanitization', () => {
      const middleware = v.createMiddleware('text');
      const req = { body: { name: null } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      middleware(req, res, next);

      expect(req.body.name).toBeNull();
      expect(next).toHaveBeenCalled();
    });

    it('rejects invalid body fields', () => {
      const middleware = v.createMiddleware('email');
      const req = { body: { email: 'not-an-email' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('singleton validator', () => {
    it('exports a pre-created instance', () => {
      expect(validator).toBeInstanceOf(EnhancedInputValidator);
      expect(validator.validate('test', 'text').valid).toBe(true);
    });
  });
});
