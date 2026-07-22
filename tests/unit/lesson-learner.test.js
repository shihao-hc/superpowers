describe('LessonLearner', () => {
  let LessonLearner;
  let fs;
  let learner;

  beforeAll(() => {
    fs = require('fs');
    LessonLearner = require('../../src/core/LessonLearner');
  });

  beforeEach(() => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('[]');
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    learner = new LessonLearner({ requireApproval: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('sets default paths', () => {
      const l = new LessonLearner();
      expect(l._pendingPath).toMatch(/\.opencode.*pending-lessons\.json$/);
      expect(l._lessonsPath).toMatch(/\.opencode.*lessons\.json$/);
      expect(l._autoApprovalThreshold).toBe(0.8);
    });

    it('accepts custom options', () => {
      const l = new LessonLearner({ pendingPath: '/tmp/p.json', lessonsPath: '/tmp/l.json', autoApprovalThreshold: 0.9, requireApproval: true });
      expect(l._pendingPath).toBe('/tmp/p.json');
      expect(l._lessonsPath).toBe('/tmp/l.json');
      expect(l._autoApprovalThreshold).toBe(0.9);
      expect(l._requireApproval).toBe(true);
    });

    it('creates directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);
      new LessonLearner();
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('recordEvent', () => {
    it('returns null for non-POST_TOOL_USE events', () => {
      const result = learner.recordEvent('PRE_TOOL_USE', { input: 'fix something' }, 0.9);
      expect(result).toBeNull();
    });

    it('returns null when not a fix operation', () => {
      const result = learner.recordEvent('POST_TOOL_USE', { input: 'hello world' }, 0.9);
      expect(result).toBeNull();
    });

    it('auto-approves when confidence >= threshold and no approval required', () => {
      fs.readFileSync.mockReturnValue('{"lessons":[]}');
      const result = learner.recordEvent('POST_TOOL_USE', { input: 'fix security bug', tags: ['bug'] }, 0.9);
      expect(result.status).toBe('auto_approved');
      expect(result.lesson.type).toBe('auto');
      expect(result.lesson.tags).toContain('security');
    });

    it('returns pending when requireApproval is true', () => {
      const l = new LessonLearner({ requireApproval: true });
      const result = l.recordEvent('POST_TOOL_USE', { input: 'fix the error', tags: ['fix'] }, 0.9);
      expect(result.status).toBe('pending');
      expect(result.id).toMatch(/^pending-/);
    });

    it('auto-approves with minimal data (no input/error/context fallback)', () => {
      fs.readFileSync.mockReturnValue('{"lessons":[]}');
      const result = learner.recordEvent('POST_TOOL_USE', { result: 'fixed' }, 0.9);
      expect(result.status).toBe('auto_approved');
    });

    it('logs audit during auto-approve when audit is configured', () => {
      const audit = { log: jest.fn() };
      const l = new LessonLearner({ requireApproval: false, audit });
      fs.readFileSync.mockReturnValue('{"lessons":[]}');
      l.recordEvent('POST_TOOL_USE', { input: 'fix bug', tags: ['bug'] }, 0.9);
      expect(audit.log).toHaveBeenCalled();
    });

    it('returns pending with minimal data when requireApproval is true', () => {
      const l = new LessonLearner({ requireApproval: true });
      const result = l.recordEvent('POST_TOOL_USE', { result: 'fixed' }, 0.9);
      expect(result.status).toBe('pending');
    });

    it('logs audit during pending lesson when audit is configured', () => {
      const audit = { log: jest.fn() };
      const l = new LessonLearner({ requireApproval: true, audit });
      l.recordEvent('POST_TOOL_USE', { input: 'fix error', tags: ['fix'] }, 0.9);
      expect(audit.log).toHaveBeenCalled();
    });
  });

  describe('_isFixOperation', () => {
    it('returns true when tags contain fix', () => {
      expect(learner._isFixOperation({ tags: ['fix'], input: 'hello' })).toBe(true);
    });

    it('returns true when tags contain debug', () => {
      expect(learner._isFixOperation({ tags: ['debug'], input: 'hello' })).toBe(true);
    });

    it('returns true when tags contain bug', () => {
      expect(learner._isFixOperation({ tags: ['bug'] })).toBe(true);
    });

    it('returns true when input contains fix keyword', () => {
      expect(learner._isFixOperation({ input: 'i need to fix this' })).toBe(true);
    });

    it('returns true when input contains Chinese fix keywords', () => {
      expect(learner._isFixOperation({ input: '有异常需要处理' })).toBe(true);
      expect(learner._isFixOperation({ input: '修復错误' })).toBe(true);
      expect(learner._isFixOperation({ input: '调试代码' })).toBe(true);
    });

    it('returns true when result contains success', () => {
      expect(learner._isFixOperation({ result: 'all tests pass' })).toBe(true);
    });

    it('returns true when result contains fixed', () => {
      expect(learner._isFixOperation({ result: 'everything is fixed' })).toBe(true);
    });

    it('returns false for null data', () => {
      expect(learner._isFixOperation(null)).toBe(false);
    });

    it('returns false for unrelated data', () => {
      expect(learner._isFixOperation({ input: 'add feature', result: 'done' })).toBe(false);
    });
  });

  describe('_inferTags', () => {
    it('detects security keywords', () => {
      const tags = learner._inferTags({ input: 'fix security vulnerability' });
      expect(tags).toContain('security');
    });

    it('detects performance keywords', () => {
      const tags = learner._inferTags({ input: 'slow performance' });
      expect(tags).toContain('performance');
    });

    it('detects test keywords', () => {
      const tags = learner._inferTags({ result: 'test asserts pass' });
      expect(tags).toContain('test');
    });

    it('detects typescript keywords', () => {
      const tags = learner._inferTags({ input: 'fix type interface' });
      expect(tags).toContain('typescript');
    });

    it('detects async keywords', () => {
      const tags = learner._inferTags({ input: 'async promise' });
      expect(tags).toContain('async');
    });

    it('detects memory keywords', () => {
      const tags = learner._inferTags({ input: 'memory leak' });
      expect(tags).toContain('memory');
    });

    it('detects concurrency keywords', () => {
      const tags = learner._inferTags({ input: 'race condition' });
      expect(tags).toContain('concurrency');
    });

    it('returns empty array for unrelated text', () => {
      const tags = learner._inferTags({ input: 'hello world', error: '', result: '' });
      expect(tags).toEqual([]);
    });
  });

  describe('_inferLessonText', () => {
    it('uses error text when present', () => {
      const text = learner._inferLessonText({ error: 'TypeError: cannot read', input: 'something' });
      expect(text).toContain('TypeError: cannot read');
    });

    it('uses result text when fixed', () => {
      const text = learner._inferLessonText({ result: 'tests pass and fixed', input: 'fix bug 123' });
      expect(text).toContain('成功修复');
      expect(text).toContain('fix bug 123');
    });

    it('falls back to input learning', () => {
      const text = learner._inferLessonText({ input: 'implement feature', result: 'ok' });
      expect(text).toContain('从实践中学习');
    });
  });

  describe('_inferImprovement', () => {
    it('suggests applying same fix when result is fixed', () => {
      const imp = learner._inferImprovement({ result: 'fixed the issue' });
      expect(imp).toContain('应用相同的修复');
    });

    it('suggests avoiding error when error present', () => {
      const imp = learner._inferImprovement({ error: 'SyntaxError: unexpected token' });
      expect(imp).toContain('避免同样的');
      expect(imp).toContain('SyntaxError');
    });

    it('returns keep good practice as fallback', () => {
      const imp = learner._inferImprovement({ result: 'ok' });
      expect(imp).toBe('保持良好实践');
    });
  });

  describe('getPendingLessons', () => {
    it('returns empty array when file missing', () => {
      fs.existsSync.mockReturnValue(false);
      expect(learner.getPendingLessons()).toEqual([]);
    });

    it('returns parsed pending lessons', () => {
      fs.readFileSync.mockReturnValue('[{"id":"p1","lesson":"test"}]');
      const pendings = learner.getPendingLessons();
      expect(pendings).toHaveLength(1);
      expect(pendings[0].id).toBe('p1');
    });

    it('returns empty array on parse error', () => {
      fs.readFileSync.mockReturnValue('not json');
      expect(learner.getPendingLessons()).toEqual([]);
    });
  });

  describe('approveLesson', () => {
    it('returns error for unknown id', () => {
      const result = learner.approveLesson('nonexistent');
      expect(result.error).toBe('not_found');
    });

    it('approves pending lesson with edits', () => {
      fs.readFileSync.mockReturnValue('[{"id":"p1","lesson":"old","source":"learner"}]');
      fs.readFileSync.mockReturnValueOnce('[{"id":"p1","lesson":"old","source":"learner"}]');
      fs.readFileSync.mockReturnValueOnce('[{"id":"p1","lesson":"old","source":"learner"}]');
      fs.readFileSync.mockReturnValueOnce('{"lessons":[]}');
      const result = learner.approveLesson('p1', { lesson: 'new lesson' });
      expect(result.status).toBe('approved');
      expect(result.lesson.lesson).toBe('new lesson');
    });

    it('returns lesson fallback when insertIntoLibrary returns null', () => {
      fs.existsSync.mockReturnValueOnce(true);
      fs.existsSync.mockReturnValueOnce(false);
      fs.readFileSync.mockReturnValue('[{"id":"p1","lesson":"fallback lesson"}]');
      const result = learner.approveLesson('p1');
      expect(result.status).toBe('approved');
      expect(result.lesson.lesson).toBe('fallback lesson');
    });

    it('logs audit when audit is configured and inserted succeeds', () => {
      const audit = { log: jest.fn() };
      const l = new LessonLearner({ requireApproval: true, audit });
      fs.existsSync.mockImplementation(() => true);
      fs.readFileSync
        .mockReturnValueOnce('[{"id":"p1","lesson":"old"}]')
        .mockReturnValueOnce('[{"id":"p1","lesson":"old"}]')
        .mockReturnValueOnce('{"lessons":[]}');
      l.approveLesson('p1');
      expect(audit.log).toHaveBeenCalled();
    });

    it('logs audit when audit is configured and inserted is null', () => {
      const audit = { log: jest.fn() };
      const l = new LessonLearner({ requireApproval: true, audit });
      fs.existsSync.mockImplementation((p) => p.includes('pending'));
      fs.readFileSync.mockReturnValue('[{"id":"p1","lesson":"old"}]');
      l.approveLesson('p1');
      expect(audit.log).toHaveBeenCalled();
    });
  });

  describe('rejectLesson', () => {
    it('returns error for unknown id', () => {
      const result = learner.rejectLesson('nonexistent');
      expect(result.error).toBe('not_found');
    });

    it('rejects pending lesson and removes it', () => {
      fs.readFileSync.mockReturnValue('[{"id":"p1","lesson":"bad"}]');
      const result = learner.rejectLesson('p1');
      expect(result.status).toBe('rejected');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('logs audit when audit is configured', () => {
      const audit = { log: jest.fn() };
      const l = new LessonLearner({ requireApproval: true, audit });
      fs.readFileSync.mockReturnValue('[{"id":"p1","lesson":"bad"}]');
      l.rejectLesson('p1');
      expect(audit.log).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('returns pending count', () => {
      fs.readFileSync.mockReturnValue('[{"id":"p1"},{"id":"p2"}]');
      const stats = learner.getStats();
      expect(stats.pendingCount).toBe(2);
    });
  });

  describe('_insertIntoLibrary', () => {
    it('returns null when lessons file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const record = learner._insertIntoLibrary({});
      expect(record).toBeNull();
    });

    it('inserts record into existing lessons file', () => {
      fs.readFileSync.mockReturnValue('{"lessons":[]}');
      const record = learner._insertIntoLibrary({ problem: 'test problem', lesson: 'test lesson', tags: ['security'] });
      expect(record).toBeTruthy();
      expect(record.id).toMatch(/^lesson-auto-/);
      expect(record.tags).toContain('security');
    });

    it('returns null on write error', () => {
      fs.writeFileSync.mockImplementationOnce(() => { throw new Error('write error'); });
      const record = learner._insertIntoLibrary({ problem: 'test' });
      expect(record).toBeNull();
    });
  });
});
