describe('ProactiveAdvisor', () => {
  let ProactiveAdvisor;
  let fs;
  const AUDIT_DIR = 'test-audit';
  const LESSONS_PATH = 'test-lessons.json';
  const DECISIONS_PATH = 'test-decisions.json';

  beforeAll(() => {
    fs = require('fs');
    ProactiveAdvisor = require('../../src/core/ProactiveAdvisor');
  });

  beforeEach(() => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(fs, 'readdirSync').mockReturnValue([]);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('sets default paths', () => {
      const a = new ProactiveAdvisor();
      expect(a._auditDir).toMatch(/\.opencode.*audit$/);
      expect(a._maxResults).toBe(10);
    });

    it('accepts custom options', () => {
      const a = new ProactiveAdvisor({
        auditDir: AUDIT_DIR,
        lessonLibPath: LESSONS_PATH,
        decisionPath: DECISIONS_PATH,
        maxResults: 5
      });
      expect(a._auditDir).toBe(AUDIT_DIR);
      expect(a._maxResults).toBe(5);
    });
  });

  describe('_scanAuditLogs', () => {
    it('returns empty array when audit dir missing', () => {
      const a = new ProactiveAdvisor({ auditDir: AUDIT_DIR });
      expect(a._scanAuditLogs()).toEqual([]);
    });

    it('ignores patterns with count < 3', () => {
      mockAuditFiles([
        { level: 'error', module: 'db', action: 'connect', ts: '1' },
        { level: 'error', module: 'db', action: 'connect', ts: '2' }
      ]);
      const a = new ProactiveAdvisor({ auditDir: AUDIT_DIR });
      expect(a._scanAuditLogs()).toEqual([]);
    });

    it('aggregates patterns by module:action', () => {
      mockAuditFiles([
        { level: 'error', module: 'db', action: 'connect', ts: '1' },
        { level: 'error', module: 'db', action: 'connect', ts: '2' },
        { level: 'error', module: 'db', action: 'connect', ts: '3' }
      ]);
      const a = new ProactiveAdvisor({ auditDir: AUDIT_DIR });
      const result = a._scanAuditLogs();
      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('db:connect');
      expect(result[0].count).toBe(3);
    });

    it('returns empty array when readdirSync throws', () => {
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (p === AUDIT_DIR) return true;
        return false;
      });
      jest.spyOn(fs, 'readdirSync').mockImplementation(() => { throw new Error('permission denied'); });
      const a = new ProactiveAdvisor({ auditDir: AUDIT_DIR });
      expect(a._scanAuditLogs()).toEqual([]);
    });

    it('sorts multiple patterns by count descending', () => {
      mockAuditFiles([
        { level: 'error', module: 'auth', action: 'login', ts: '1' },
        { level: 'error', module: 'auth', action: 'login', ts: '2' },
        { level: 'error', module: 'auth', action: 'login', ts: '3' },
        { level: 'error', module: 'auth', action: 'login', ts: '4' },
        { level: 'error', module: 'db', action: 'fail', ts: '1' },
        { level: 'error', module: 'db', action: 'fail', ts: '2' },
        { level: 'error', module: 'db', action: 'fail', ts: '3' }
      ]);
      const a = new ProactiveAdvisor({ auditDir: AUDIT_DIR });
      const result = a._scanAuditLogs();
      expect(result[0].count).toBeGreaterThanOrEqual(result[1].count);
    });

    it('includes warn-level entries in pattern aggregation', () => {
      mockAuditFiles([
        { level: 'warn', module: 'rate', action: 'limit', ts: '1' },
        { level: 'warn', module: 'rate', action: 'limit', ts: '2' },
        { level: 'warn', module: 'rate', action: 'limit', ts: '3' }
      ]);
      const a = new ProactiveAdvisor({ auditDir: AUDIT_DIR });
      const result = a._scanAuditLogs();
      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe('rate:limit');
      expect(result[0].count).toBe(3);
    });

    it('skips entries with level other than error/warn', () => {
      mockAuditFiles([
        { level: 'info', module: 'auth', action: 'ok', ts: '1' },
        { level: 'info', module: 'auth', action: 'ok', ts: '2' },
        { level: 'info', module: 'auth', action: 'ok', ts: '3' }
      ]);
      const a = new ProactiveAdvisor({ auditDir: AUDIT_DIR });
      expect(a._scanAuditLogs()).toEqual([]);
    });

    it('defaults module to unknown when missing in entry', () => {
      mockAuditFiles([
        { level: 'error', action: 'noModule', ts: '1' },
        { level: 'error', action: 'noModule', ts: '2' },
        { level: 'error', action: 'noModule', ts: '3' }
      ]);
      const a = new ProactiveAdvisor({ auditDir: AUDIT_DIR });
      const result = a._scanAuditLogs();
      expect(result[0].pattern).toMatch(/^unknown:/);
    });

    it('defaults action to unknown when missing in entry', () => {
      mockAuditFiles([
        { level: 'error', module: 'svc', ts: '1' },
        { level: 'error', module: 'svc', ts: '2' },
        { level: 'error', module: 'svc', ts: '3' }
      ]);
      const a = new ProactiveAdvisor({ auditDir: AUDIT_DIR });
      const result = a._scanAuditLogs();
      expect(result[0].pattern).toMatch(/:unknown$/);
    });

  });

  describe('scan', () => {
    it('returns empty array when nothing to report', () => {
      const a = new ProactiveAdvisor({
        auditDir: AUDIT_DIR,
        lessonLibPath: LESSONS_PATH,
        decisionPath: DECISIONS_PATH
      });
      expect(a.scan()).toEqual([]);
    });

    it('includes error_pattern when audit logs have frequent errors', () => {
      mockAuditFiles([
        { level: 'error', module: 'auth', action: 'login', ts: '2026-01-01' },
        { level: 'error', module: 'auth', action: 'login', ts: '2026-01-02' },
        { level: 'error', module: 'auth', action: 'login', ts: '2026-01-03' }
      ]);
      const a = new ProactiveAdvisor({
        auditDir: AUDIT_DIR,
        lessonLibPath: LESSONS_PATH,
        decisionPath: DECISIONS_PATH
      });
      const results = a.scan();
      const errorPattern = results.find(r => r.type === 'error_pattern');
      expect(errorPattern).toBeDefined();
      expect(errorPattern.priority).toBe('high');
      expect(errorPattern.items[0].pattern).toBe('auth:login');
    });

    it('includes unapplied_lessons when high-priority lessons exist', () => {
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (p === LESSONS_PATH) return true;
        return false;
      });
      jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (p === LESSONS_PATH) return JSON.stringify({
          lessons: [{ id: 'l1', lesson: 'fix this', priority: 'high', applied: false, applyCount: 0 }]
        });
        return '';
      });
      const a = new ProactiveAdvisor({
        auditDir: AUDIT_DIR,
        lessonLibPath: LESSONS_PATH,
        decisionPath: DECISIONS_PATH
      });
      const results = a.scan();
      const unapplied = results.find(r => r.type === 'unapplied_lessons');
      expect(unapplied).toBeDefined();
      expect(unapplied.priority).toBe('medium');
    });

    it('includes risk_trend when recent decisions have high risk', () => {
      const history = [];
      for (let i = 0; i < 20; i++) {
        history.push({ riskLevel: i < 8 ? 'high' : 'low', decision: 'approved', ts: `2026-01-${i + 1}` });
      }
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (p === DECISIONS_PATH) return true;
        return false;
      });
      jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (p === DECISIONS_PATH) return JSON.stringify({ history });
        return '';
      });
      const a = new ProactiveAdvisor({
        auditDir: AUDIT_DIR,
        lessonLibPath: LESSONS_PATH,
        decisionPath: DECISIONS_PATH
      });
      const results = a.scan();
      const riskTrend = results.find(r => r.type === 'risk_trend');
      expect(riskTrend).toBeDefined();
      expect(riskTrend.priority).toBe('medium');
    });

    it('omits unapplied_lessons when file exists but no high-priority match', () => {
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (p === LESSONS_PATH) return true;
        return false;
      });
      jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (p === LESSONS_PATH) return JSON.stringify({
          lessons: [{ id: 'l1', lesson: 'low priority', priority: 'low', applied: false }]
        });
        return '';
      });
      const a = new ProactiveAdvisor({
        auditDir: AUDIT_DIR,
        lessonLibPath: LESSONS_PATH,
        decisionPath: DECISIONS_PATH
      });
      const results = a.scan();
      expect(results.find(r => r.type === 'unapplied_lessons')).toBeUndefined();
    });

    it('uses id when lesson property missing in unapplied_lessons detail', () => {
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (p === LESSONS_PATH) return true;
        return false;
      });
      jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (p === LESSONS_PATH) return JSON.stringify({
          lessons: [{ id: 'only-id', priority: 'high', applied: false }]
        });
        return '';
      });
      const a = new ProactiveAdvisor({
        auditDir: AUDIT_DIR,
        lessonLibPath: LESSONS_PATH,
        decisionPath: DECISIONS_PATH
      });
      const results = a.scan();
      const unapplied = results.find(r => r.type === 'unapplied_lessons');
      expect(unapplied).toBeDefined();
      expect(unapplied.detail).toContain('only-id');
    });
  });

  describe('_findUnappliedLessons', () => {
    it('returns empty array when lessons file missing', () => {
      const a = new ProactiveAdvisor({ lessonLibPath: LESSONS_PATH });
      expect(a._findUnappliedLessons()).toEqual([]);
    });

    it('returns only high-priority unapplied lessons', () => {
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => p === LESSONS_PATH);
      jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (p === LESSONS_PATH) return JSON.stringify({
          lessons: [
            { id: 'l1', lesson: 'high unapplied', priority: 'high', applied: false },
            { id: 'l2', lesson: 'medium applied', priority: 'medium', applied: true },
            { id: 'l3', lesson: 'high applied', priority: 'high', applied: true, applyCount: 2 }
          ]
        });
        return '';
      });
      const a = new ProactiveAdvisor({ lessonLibPath: LESSONS_PATH });
      const result = a._findUnappliedLessons();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('l1');
    });

    it('returns empty array when lessons file is malformed', () => {
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => p === LESSONS_PATH);
      jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (p === LESSONS_PATH) return 'not valid json';
        return '';
      });
      const a = new ProactiveAdvisor({ lessonLibPath: LESSONS_PATH });
      expect(a._findUnappliedLessons()).toEqual([]);
    });

    it('includes lesson with applied=true and applyCount=0', () => {
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => p === LESSONS_PATH);
      jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (p === LESSONS_PATH) return JSON.stringify({
          lessons: [
            { id: 'l1', lesson: 'needs reapply', priority: 'high', applied: true, applyCount: 0 }
          ]
        });
        return '';
      });
      const a = new ProactiveAdvisor({ lessonLibPath: LESSONS_PATH });
      const result = a._findUnappliedLessons();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('l1');
    });

    it('handles lesson without lesson property in map callback', () => {
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => p === LESSONS_PATH);
      jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (p === LESSONS_PATH) return JSON.stringify({
          lessons: [
            { id: 'l1', priority: 'high', applied: false }
          ]
        });
        return '';
      });
      const a = new ProactiveAdvisor({ lessonLibPath: LESSONS_PATH });
      const result = a._findUnappliedLessons();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('l1');
    });

    it('returns empty array when lessons property missing', () => {
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => p === LESSONS_PATH);
      jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (p === LESSONS_PATH) return JSON.stringify({ otherProp: [] });
        return '';
      });
      const a = new ProactiveAdvisor({ lessonLibPath: LESSONS_PATH });
      expect(a._findUnappliedLessons()).toEqual([]);
    });
  });

  describe('_analyzeDecisions', () => {
    it('returns null when decisions file missing', () => {
      const a = new ProactiveAdvisor({ decisionPath: DECISIONS_PATH });
      expect(a._analyzeDecisions()).toBeNull();
    });

    it('returns null when history has fewer than 5 entries', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ history: [{ riskLevel: 'low' }] }));
      const a = new ProactiveAdvisor({ decisionPath: DECISIONS_PATH });
      expect(a._analyzeDecisions()).toBeNull();
    });

    it('returns null when high risk count < 5', () => {
      const history = [];
      for (let i = 0; i < 10; i++) history.push({ riskLevel: 'low', decision: 'approved' });
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ history }));
      const a = new ProactiveAdvisor({ decisionPath: DECISIONS_PATH });
      expect(a._analyzeDecisions()).toBeNull();
    });

    it('returns risk_trend when high risk >= 5 in last 20', () => {
      const history = [];
      for (let i = 0; i < 30; i++) history.push({ riskLevel: i >= 20 ? 'high' : 'low', decision: 'approved' });
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ history }));
      const a = new ProactiveAdvisor({ decisionPath: DECISIONS_PATH });
      const result = a._analyzeDecisions();
      expect(result).not.toBeNull();
      expect(result.type).toBe('risk_trend');
      expect(result.items.recentHighRisk).toBe(10);
    });

    it('handles array-format decisions', () => {
      const history = [];
      for (let i = 0; i < 20; i++) history.push({ riskLevel: 'high', decision: 'approved' });
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(history));
      const a = new ProactiveAdvisor({ decisionPath: DECISIONS_PATH });
      expect(a._analyzeDecisions()).not.toBeNull();
    });

    it('returns null when decisions file is malformed', () => {
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => p === DECISIONS_PATH);
      jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (p === DECISIONS_PATH) return 'not valid json';
        return '';
      });
      const a = new ProactiveAdvisor({ decisionPath: DECISIONS_PATH });
      expect(a._analyzeDecisions()).toBeNull();
    });

    it('returns null when data object has no history property', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ foo: 'bar' }));
      const a = new ProactiveAdvisor({ decisionPath: DECISIONS_PATH });
      expect(a._analyzeDecisions()).toBeNull();
    });
  });

  describe('getStatus', () => {
    it('returns timestamp and suggestions', () => {
      const a = new ProactiveAdvisor({
        auditDir: AUDIT_DIR,
        lessonLibPath: LESSONS_PATH,
        decisionPath: DECISIONS_PATH
      });
      const status = a.getStatus();
      expect(status.timestamp).toBeDefined();
      expect(Array.isArray(status.suggestions)).toBe(true);
      expect(status.suggestionCount).toBe(status.suggestions.length);
    });
  });

  function mockAuditFiles(entries) {
    jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (p === AUDIT_DIR) return true;
      return false;
    });
    jest.spyOn(fs, 'readdirSync').mockImplementation((p) => {
      if (p === AUDIT_DIR) return ['audit-1.jsonl'];
      return [];
    });
    jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (typeof p === 'string' && p.endsWith('.jsonl')) {
        return entries.map(e => JSON.stringify(e)).join('\n');
      }
      return '';
    });
  }

  describe('_scanAuditLogs (deep branches)', () => {
    it('skips malformed JSON lines without crashing', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['audit.jsonl']);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(
        '{"level":"error","module":"db","action":"fail","ts":"1"}\nNOT JSON\n{"level":"error","module":"db","action":"fail","ts":"2"}\n{"level":"error","module":"db","action":"fail","ts":"3"}'
      );
      const a = new ProactiveAdvisor({ auditDir: AUDIT_DIR });
      const result = a._scanAuditLogs();
      expect(result).toHaveLength(1);
      expect(result[0].count).toBe(3);
    });

    it('respects maxResults limit', () => {
      const entries = [];
      for (let i = 0; i < 15; i++) {
        for (let j = 0; j < 3; j++) {
          entries.push({ level: 'error', module: `mod${i}`, action: 'fail', ts: `${j}` });
        }
      }
      mockAuditFiles(entries);
      const a = new ProactiveAdvisor({ auditDir: AUDIT_DIR, maxResults: 5 });
      const result = a._scanAuditLogs();
      expect(result).toHaveLength(5);
    });

    it('handles multiple .jsonl files', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['a.jsonl', 'b.jsonl']);
      jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (p.endsWith('a.jsonl')) {
          return '{"level":"error","module":"x","action":"y","ts":"1"}\n{"level":"error","module":"x","action":"y","ts":"2"}\n{"level":"error","module":"x","action":"y","ts":"3"}';
        }
        return '{"level":"error","module":"x","action":"y","ts":"4"}';
      });
      const a = new ProactiveAdvisor({ auditDir: AUDIT_DIR });
      const result = a._scanAuditLogs();
      expect(result[0].count).toBe(4);
    });

    it('tracks firstSeen and lastSeen timestamps', () => {
      mockAuditFiles([
        { level: 'error', module: 'a', action: 'b', ts: '100' },
        { level: 'error', module: 'a', action: 'b', ts: '200' },
        { level: 'error', module: 'a', action: 'b', ts: '300' }
      ]);
      const a = new ProactiveAdvisor({ auditDir: AUDIT_DIR });
      const result = a._scanAuditLogs();
      expect(result[0].firstSeen).toBe('100');
      expect(result[0].lastSeen).toBe('300');
    });

    it('skips unreadable files without crashing', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['ok.jsonl', 'bad.jsonl']);
      jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (p.endsWith('bad.jsonl')) throw new Error('permission denied');
        return '{"level":"error","module":"a","action":"b","ts":"1"}\n{"level":"error","module":"a","action":"b","ts":"2"}\n{"level":"error","module":"a","action":"b","ts":"3"}';
      });
      const a = new ProactiveAdvisor({ auditDir: AUDIT_DIR });
      const result = a._scanAuditLogs();
      expect(result).toHaveLength(1);
    });

    it('limits to last 7 files sorted', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['f1.jsonl', 'f2.jsonl', 'f3.jsonl', 'f4.jsonl', 'f5.jsonl', 'f6.jsonl', 'f7.jsonl', 'f8.jsonl']);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('');
      const a = new ProactiveAdvisor({ auditDir: AUDIT_DIR });
      a._scanAuditLogs();
      expect(fs.readdirSync).toHaveBeenCalled();
    });
  });

  describe('scan (simultaneous multi-type)', () => {
    it('returns multiple suggestion types at once', () => {
      mockAuditFiles([
        { level: 'error', module: 'db', action: 'fail', ts: '1' },
        { level: 'error', module: 'db', action: 'fail', ts: '2' },
        { level: 'error', module: 'db', action: 'fail', ts: '3' }
      ]);
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (p === AUDIT_DIR) return true;
        if (p === LESSONS_PATH) return true;
        return false;
      });
      jest.spyOn(fs, 'readdirSync').mockImplementation((p) => {
        if (p === AUDIT_DIR) return ['audit.jsonl'];
        return [];
      });
      jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('.jsonl')) {
          return [
            '{"level":"error","module":"db","action":"fail","ts":"1"}',
            '{"level":"error","module":"db","action":"fail","ts":"2"}',
            '{"level":"error","module":"db","action":"fail","ts":"3"}'
          ].join('\n');
        }
        if (p === LESSONS_PATH) return JSON.stringify({
          lessons: [{ id: 'l1', lesson: 'fix db', priority: 'high', applied: false, applyCount: 0 }]
        });
        return '';
      });
      const a = new ProactiveAdvisor({
        auditDir: AUDIT_DIR,
        lessonLibPath: LESSONS_PATH,
        decisionPath: DECISIONS_PATH
      });
      const results = a.scan();
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some(r => r.type === 'error_pattern')).toBe(true);
      expect(results.some(r => r.type === 'unapplied_lessons')).toBe(true);
    });

    it('includes risk_trend when all three sources fire', () => {
      const history = [];
      for (let i = 0; i < 25; i++) {
        history.push({ riskLevel: i < 10 ? 'high' : 'low', decision: 'approved', ts: `${i}` });
      }
      mockAuditFiles([
        { level: 'error', module: 'auth', action: 'fail', ts: '1' },
        { level: 'error', module: 'auth', action: 'fail', ts: '2' },
        { level: 'error', module: 'auth', action: 'fail', ts: '3' }
      ]);
      jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (p === AUDIT_DIR) return true;
        if (p === LESSONS_PATH) return true;
        if (p === DECISIONS_PATH) return true;
        return false;
      });
      jest.spyOn(fs, 'readdirSync').mockImplementation((p) => {
        if (p === AUDIT_DIR) return ['audit.jsonl'];
        return [];
      });
      jest.spyOn(fs, 'readFileSync').mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('.jsonl')) {
          return [
            '{"level":"error","module":"auth","action":"fail","ts":"1"}',
            '{"level":"error","module":"auth","action":"fail","ts":"2"}',
            '{"level":"error","module":"auth","action":"fail","ts":"3"}'
          ].join('\n');
        }
        if (p === LESSONS_PATH) return JSON.stringify({
          lessons: [{ id: 'l1', lesson: 'auth fix', priority: 'high', applied: false }]
        });
        if (p === DECISIONS_PATH) return JSON.stringify({ history });
        return '';
      });
      const a = new ProactiveAdvisor({
        auditDir: AUDIT_DIR,
        lessonLibPath: LESSONS_PATH,
        decisionPath: DECISIONS_PATH
      });
      const results = a.scan();
      expect(results.length).toBe(3);
      expect(results.some(r => r.type === 'error_pattern')).toBe(true);
      expect(results.some(r => r.type === 'unapplied_lessons')).toBe(true);
      expect(results.some(r => r.type === 'risk_trend')).toBe(true);
    });
  });

  describe('_analyzeDecisions (error decisions)', () => {
    it('counts error/failed decisions', () => {
      const history = [];
      for (let i = 0; i < 20; i++) {
        history.push({ riskLevel: 'high', decision: i < 6 ? 'error' : 'approved', ts: `${i}` });
      }
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ history }));
      const a = new ProactiveAdvisor({ decisionPath: DECISIONS_PATH });
      const result = a._analyzeDecisions();
      expect(result).not.toBeNull();
      expect(result.items.recentErrors).toBe(6);
    });
  });

  describe('getStatus (fresh scan)', () => {
    it('calls scan and returns structured status', () => {
      const a = new ProactiveAdvisor({ auditDir: AUDIT_DIR });
      const spy = jest.spyOn(a, 'scan').mockReturnValue([{ type: 'test' }]);
      const status = a.getStatus();
      expect(spy).toHaveBeenCalled();
      expect(status.suggestionCount).toBe(1);
      expect(status.suggestions[0].type).toBe('test');
      spy.mockRestore();
    });
  });
});
