jest.mock('fs');
const fs = require('fs');
const ProactiveTaskEngine = require('../../src/core/ProactiveTaskEngine');

describe('ProactiveTaskEngine', () => {
  let engine;

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue([]);
    fs.readFileSync.mockReturnValue('module.exports = {};');
    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});
    engine = new ProactiveTaskEngine();
  });

  describe('runLessonVerification', () => {
    it('marks applied when lesson keywords found in src', () => {
      const markApplied = jest.fn();
      engine._getLessonLib = () => ({ lessons: [{ id: 'l1', lesson: 'use lint before commit', improvement: 'add lint step' }], markApplied });
      engine._buildSrcIndex = () => [{ file: 'a.js', content: 'lint config here' }];
      const r = engine.runLessonVerification();
      expect(markApplied).toHaveBeenCalledWith('l1');
      expect(r.verified).toContain('l1');
    });

    it('records pending when no keywords found', () => {
      const recordSpy = jest.spyOn(engine, '_recordAction');
      engine._getLessonLib = () => ({ lessons: [{ id: 'l1', lesson: 'xyzzy should not exist', improvement: 'plugh' }], markApplied: jest.fn() });
      engine._buildSrcIndex = () => [{ file: 'a.js', content: 'clean file' }];
      const r = engine.runLessonVerification();
      expect(r.pending).toContain('l1');
      expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({ action: 'verify-pending', lessonRef: 'l1' }));
    });

    it('skips already-applied lessons', () => {
      const markApplied = jest.fn();
      engine._getLessonLib = () => ({ lessons: [{ id: 'l1', _applied: true }], markApplied });
      engine._buildSrcIndex = () => [];
      const r = engine.runLessonVerification();
      expect(markApplied).not.toHaveBeenCalled();
      expect(r.total).toBe(0);
    });

    it('returns empty when no active lessons', () => {
      engine._getLessonLib = () => ({ lessons: [], markApplied: jest.fn() });
      const r = engine.runLessonVerification();
      expect(r).toEqual({ total: 0, verified: [], pending: [] });
    });
  });

  describe('runHealthCheck', () => {
    it('reports pending-lessons backlog', () => {
      engine._loadPending = () => [{ id: 'p1' }];
      const recordSpy = jest.spyOn(engine, '_recordAction');
      const r = engine.runHealthCheck();
      expect(r.anomalies.some((a) => a.issue === 'pending-lessons-backlog')).toBe(true);
      expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({ action: 'pending-backlog' }));
    });

    it('reports manual-required backlog', () => {
      engine._loadPending = () => [];
      engine._loadActions = () => [{ result: 'needs-human' }, { result: 'fixed' }];
      const r = engine.runHealthCheck();
      expect(r.anomalies.some((a) => a.issue === 'manual-required-backlog')).toBe(true);
    });

    it('reports lessons-not-applied when active ratio high', () => {
      engine._loadPending = () => [];
      engine._loadActions = () => [];
      engine._getLessonLib = () => ({ getStats: () => ({ total: 10, active: 9, applied: 1 }) });
      const r = engine.runHealthCheck();
      expect(r.anomalies.some((a) => a.issue === 'lessons-not-applied')).toBe(true);
    });

    it('no anomalies when healthy', () => {
      engine._loadPending = () => [];
      engine._loadActions = () => [];
      engine._getLessonLib = () => ({ getStats: () => ({ total: 10, active: 5, applied: 5 }) });
      const r = engine.runHealthCheck();
      expect(r.anomalies).toEqual([]);
    });
  });

  describe('_recordAction', () => {
    it('dedupes identical actions', () => {
      let store = '[]';
      fs.readFileSync.mockImplementation((p) => (String(p).includes('actions') ? store : '{}'));
      fs.writeFileSync.mockImplementation((p, d) => { if (String(p).includes('actions')) { store = d; } });
      const a = { type: 'lesson-verify', action: 'verify-applied', lessonRef: 'l1', result: 'verified' };
      engine._recordAction(a);
      const r2 = engine._recordAction(a);
      expect(r2.recorded).toBe(false);
      expect(JSON.parse(store)).toHaveLength(1);
    });

    it('appends distinct actions', () => {
      let store = '[]';
      fs.readFileSync.mockImplementation((p) => (String(p).includes('actions') ? store : '{}'));
      fs.writeFileSync.mockImplementation((p, d) => { if (String(p).includes('actions')) { store = d; } });
      engine._recordAction({ type: 'a', action: 'x', lessonRef: 'l1', result: 'r1' });
      engine._recordAction({ type: 'a', action: 'x', lessonRef: 'l2', result: 'r1' });
      expect(JSON.parse(store)).toHaveLength(2);
    });
  });

  describe('startAutoLoop / stopAutoLoop', () => {
    it('starts and stops the loop', () => {
      engine.runTasks = jest.fn();
      engine.startAutoLoop(60000);
      expect(engine._engineLoop).toBeTruthy();
      expect(engine.runTasks).toHaveBeenCalled(); // 立即执行一次
      engine.stopAutoLoop();
      expect(engine._engineLoop).toBeNull();
    });

    it('does not double-start', () => {
      engine.startAutoLoop(60000);
      const first = engine._engineLoop;
      engine.startAutoLoop(60000);
      expect(engine._engineLoop).toBe(first);
      engine.stopAutoLoop();
    });
  });
});