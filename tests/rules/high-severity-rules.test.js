const { runRule } = require('./helpers/testRule');

describe('HIGH severity custom rules', () => {
  describe('HARDCODED_SECRET', () => {
    it('detects hardcoded password', () => {
      const r = runRule('const password = "superSecret123!";', 'HARDCODED_SECRET');
      expect(r).toHaveLength(1);
      expect(r[0].ruleId).toBe('HARDCODED_SECRET');
    });

    it('detects hardcoded apiKey', () => {
      const r = runRule('apiKey: "sk-1234567890abcdef"', 'HARDCODED_SECRET');
      expect(r).toHaveLength(1);
    });

    it('allows process.env references', () => {
      const r = runRule('const password = process.env.DB_PASSWORD;', 'HARDCODED_SECRET');
      expect(r).toHaveLength(0);
    });

    it('ignores placeholder/default values', () => {
      const r = runRule('const password = "changeme12345678";', 'HARDCODED_SECRET');
      expect(r).toHaveLength(0);
    });
  });

  describe('WEAK_HASH', () => {
    it('detects md5 for password hashing', () => {
      const r = runRule('crypto.createHash("md5").update(password).digest("hex");', 'WEAK_HASH');
      expect(r).toHaveLength(1);
      expect(r[0].ruleId).toBe('WEAK_HASH');
    });

    it('detects sha1 for token signing', () => {
      const r = runRule('crypto.createHash("sha1").update(token).digest("hex");', 'WEAK_HASH');
      expect(r).toHaveLength(1);
    });

    it('does not flag sha256', () => {
      const r = runRule('crypto.createHash("sha256").update(data).digest("hex");', 'WEAK_HASH');
      expect(r).toHaveLength(0);
    });
  });

  describe('SQL_INJECTION', () => {
    it('detects .query() with string interpolation', () => {
      const r = runRule('connection.query("SELECT * FROM users WHERE id = " + userId);', 'SQL_INJECTION');
      expect(r).toHaveLength(1);
      expect(r[0].ruleId).toBe('SQL_INJECTION');
    });

    it('detects .execute() with string interpolation', () => {
      const r = runRule('conn.execute("INSERT INTO users VALUES(" + data + ")");', 'SQL_INJECTION');
      expect(r).toHaveLength(1);
    });

    it('detects template literal in SQL query', () => {
      const r = runRule('client.raw(`SELECT * FROM users WHERE name = "${userName}"`);', 'SQL_INJECTION');
      expect(r).toHaveLength(1);
    });

    it('allows .query() with parameterized syntax', () => {
      const r = runRule('db.query("SELECT * FROM users WHERE id = ?", [userId]);', 'SQL_INJECTION');
      expect(r).toHaveLength(0);
    });

    it('allows .execute() with parameterized syntax', () => {
      const r = runRule('conn.execute("SELECT * FROM users WHERE id = ?", [id]);', 'SQL_INJECTION');
      expect(r).toHaveLength(0);
    });
  });

  describe('EVAL_VARIANT', () => {
    it('detects setTimeout with string building', () => {
      const r = runRule('setTimeout("alert(" + msg + ")", 100);', 'EVAL_VARIANT');
      expect(r).toHaveLength(1);
      expect(r[0].ruleId).toBe('EVAL_VARIANT');
    });

    it('detects new Function with dynamic string', () => {
      const r = runRule('const fn = new Function("return " + code);', 'EVAL_VARIANT');
      expect(r).toHaveLength(1);
    });

    it('allows setTimeout with function reference', () => {
      const r = runRule('setTimeout(handleTimeout, 1000);', 'EVAL_VARIANT');
      expect(r).toHaveLength(0);
    });
  });

  describe('COMMAND_INJECTION', () => {
    it('detects exec with user input', () => {
      const r = runRule('exec("rm -rf " + dirPath);', 'COMMAND_INJECTION');
      expect(r).toHaveLength(1);
      expect(r[0].ruleId).toBe('COMMAND_INJECTION');
    });

    it('allows execFile (no shell)', () => {
      const r = runRule('execFile("rm", ["-rf", dirPath]);', 'COMMAND_INJECTION');
      expect(r).toHaveLength(0);
    });

    it('allows npm test in exec', () => {
      const r = runRule('exec("npm test");', 'COMMAND_INJECTION');
      expect(r).toHaveLength(0);
    });
  });

  describe('PATH_TRAVERSAL_GENERIC', () => {
    it('detects user input in path.join', () => {
      const r = runRule('const p = path.join("/data", req.query.file);', 'PATH_TRAVERSAL_GENERIC');
      expect(r).toHaveLength(1);
      expect(r[0].ruleId).toBe('PATH_TRAVERSAL_GENERIC');
    });

    it('allows with validation', () => {
      const r = runRule('const p = path.join("/data", validate(sanitize(req.query.file)));', 'PATH_TRAVERSAL_GENERIC');
      expect(r).toHaveLength(0);
    });
  });

  describe('WEAK_SESSION_SECRET', () => {
    it('detects short session secret', () => {
      const r = runRule('session({ secret: "short" })', 'WEAK_SESSION_SECRET');
      expect(r).toHaveLength(1);
      expect(r[0].ruleId).toBe('WEAK_SESSION_SECRET');
    });

    it('detects placeholder session secret', () => {
      const r = runRule('session({ secret: "change-me-123" })', 'WEAK_SESSION_SECRET');
      expect(r).toHaveLength(1);
    });

    it('allows env-based secret', () => {
      const r = runRule('session({ secret: process.env.SESSION_SECRET })', 'WEAK_SESSION_SECRET');
      expect(r).toHaveLength(0);
    });
  });
});
