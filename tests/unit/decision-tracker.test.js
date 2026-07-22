const path = require('path');
const os = require('os');
const fs = require('fs');
const DecisionTracker = require('../../src/core/DecisionTracker');

describe('DecisionTracker', () => {
  let tracker;
  let tmpPath;

  beforeEach(() => {
    tmpPath = path.join(os.tmpdir(), `decision-tracker-test-${Date.now()}.json`);
    tracker = new DecisionTracker({ storagePath: tmpPath });
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpPath); } catch {}
  });

  describe('constructor', () => {
    it('creates storage file on init', () => {
      expect(fs.existsSync(tmpPath)).toBe(true);
      const data = JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
      expect(data.decisions).toEqual([]);
      expect(data.lastUpdated).toBeDefined();
    });
  });

  describe('record', () => {
    it('records a valid entry', () => {
      const entry = { input: 'test input', taskType: 'security', decision: 'allow', outcome: 'success' };
      const record = tracker.record(entry);
      expect(record.id).toMatch(/^dec-/);
      expect(record.taskType).toBe('security');
      expect(record.decision).toBe('allow');
    });

    it('truncates long input to 200 chars', () => {
      const longInput = 'x'.repeat(500);
      const record = tracker.record({ input: longInput });
      expect(record.input.length).toBe(200);
    });

    it('returns null for invalid entry', () => {
      expect(tracker.record(null)).toBeNull();
      expect(tracker.record('string')).toBeNull();
      expect(tracker.record(undefined)).toBeNull();
    });

    it('sets defaults for missing fields', () => {
      const record = tracker.record({ input: 'test' });
      expect(record.decision).toBeNull();
      expect(record.riskLevel).toBe('low');
      expect(record.durationMs).toBe(0);
      expect(record.lessonsApplied).toEqual([]);
    });

    it('calls audit logger when provided', () => {
      const audit = { log: jest.fn() };
      const t = new DecisionTracker({ storagePath: tmpPath, audit });
      t.record({ input: 'test' });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'info', module: 'tracker', action: 'recorded' })
      );
    });
  });

  describe('getHistory', () => {
    it('returns empty array when no decisions', () => {
      expect(tracker.getHistory()).toEqual([]);
    });

    it('returns decisions in reverse order', () => {
      tracker.record({ input: 'first' });
      tracker.record({ input: 'second' });
      const history = tracker.getHistory();
      expect(history[0].input).toBe('second');
      expect(history[1].input).toBe('first');
    });

    it('respects limit parameter', () => {
      tracker.record({ input: 'a' });
      tracker.record({ input: 'b' });
      tracker.record({ input: 'c' });
      expect(tracker.getHistory(1)).toHaveLength(1);
      expect(tracker.getHistory(2)).toHaveLength(2);
    });

    it('returns all decisions when limit exceeds total', () => {
      tracker.record({ input: 'a' });
      expect(tracker.getHistory(100)).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    it('returns zero stats for empty tracker', () => {
      const stats = tracker.getStats();
      expect(stats.total).toBe(0);
      expect(stats.applicationRate).toBe(0);
    });

    it('groups by taskType', () => {
      tracker.record({ input: 'a', taskType: 'security' });
      tracker.record({ input: 'b', taskType: 'security' });
      tracker.record({ input: 'c', taskType: 'performance' });
      const stats = tracker.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byType.security).toBe(2);
      expect(stats.byType.performance).toBe(1);
    });

    it('counts lessons applied', () => {
      tracker.record({ input: 'a', lessonsApplied: ['L1'] });
      tracker.record({ input: 'b' });
      const stats = tracker.getStats();
      expect(stats.withLessonsApplied).toBe(1);
      expect(stats.applicationRate).toBe(50);
    });
  });

  describe('getRecentLessons', () => {
    it('returns empty array when no lessons applied', () => {
      expect(tracker.getRecentLessons()).toEqual([]);
    });

    it('returns lessons sorted by frequency', () => {
      tracker.record({ input: 'a', lessonsApplied: ['L1'] });
      tracker.record({ input: 'b', lessonsApplied: ['L2'] });
      tracker.record({ input: 'c', lessonsApplied: ['L1'] });
      const lessons = tracker.getRecentLessons();
      expect(lessons[0]).toEqual({ lessonId: 'L1', applyCount: 2 });
      expect(lessons[1]).toEqual({ lessonId: 'L2', applyCount: 1 });
    });

    it('respects limit parameter', () => {
      tracker.record({ input: 'a', lessonsApplied: ['L1'] });
      tracker.record({ input: 'b', lessonsApplied: ['L2'] });
      tracker.record({ input: 'c', lessonsApplied: ['L3'] });
      expect(tracker.getRecentLessons(1)).toHaveLength(1);
    });
  });

  describe('_maxEntries', () => {
    it('trims decisions beyond max entries', () => {
      const small = new DecisionTracker({ storagePath: tmpPath, maxEntries: 2 });
      small.record({ input: 'first' });
      small.record({ input: 'second' });
      small.record({ input: 'third' });
      const history = small.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].input).toBe('third');
      expect(history[1].input).toBe('second');
    });
  });

  describe('constructor default options', () => {
    it('fills defaults when called without arguments', () => {
      const t = new DecisionTracker();
      expect(t._audit).toBeNull();
      expect(t._maxEntries).toBe(500);
      expect(t._storagePath).toContain('.opencode');
      expect(t._storagePath).toContain('decisions.json');
      try { if (fs.existsSync(t._storagePath)) fs.unlinkSync(t._storagePath); } catch {}
    });
  });

  describe('_load error handling', () => {
    it('returns empty decisions when file is corrupted', () => {
      fs.writeFileSync(tmpPath, 'not valid json');
      expect(tracker.getHistory()).toEqual([]);
      expect(tracker.getStats()).toEqual({ total: 0, byType: {}, withLessonsApplied: 0, applicationRate: 0 });
      expect(tracker.getRecentLessons()).toEqual([]);
    });
  });

  describe('record edge cases', () => {
    it('handles entries without input field', () => {
      const record = tracker.record({ taskType: 'security' });
      expect(record.input).toBe('');
      expect(record.taskType).toBe('security');
    });
  });

  describe('getRecentLessons with mixed entries', () => {
    it('handles entries where lessonsApplied is falsy in storage', () => {
      tracker.record({ input: 'a', lessonsApplied: ['L1'] });
      const raw = JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
      raw.decisions.push({ id: 'test-1', input: 'b', lessonsApplied: null });
      raw.decisions.push({ id: 'test-2', input: 'c', lessonsApplied: ['L2'] });
      fs.writeFileSync(tmpPath, JSON.stringify(raw));
      const lessons = tracker.getRecentLessons();
      expect(lessons).toHaveLength(2);
      expect(lessons[0]).toEqual({ lessonId: 'L1', applyCount: 1 });
      expect(lessons[1]).toEqual({ lessonId: 'L2', applyCount: 1 });
    });
  });

  describe('_ensure directory creation', () => {
    it('creates directory structure when it does not exist', () => {
      const baseDir = path.join(os.tmpdir(), `dt-depth-${Date.now()}`);
      const deepPath = path.join(baseDir, 'nested', 'decisions.json');
      const _t = new DecisionTracker({ storagePath: deepPath });
      expect(fs.existsSync(deepPath)).toBe(true);
      const data = JSON.parse(fs.readFileSync(deepPath, 'utf8'));
      expect(data.decisions).toEqual([]);
      try { fs.rmSync(baseDir, { recursive: true }); } catch {}
    });
  });
});
