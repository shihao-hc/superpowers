const { PromiseTracker } = require('../../src/utils/PromiseTracker');

describe('PromiseTracker', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('constructor applies defaults', () => {
    const tracker = new PromiseTracker();
    expect(tracker.state.promises).toEqual([]);
    expect(tracker.state.pending).toEqual([]);
    expect(tracker.state.broken).toEqual([]);
    expect(tracker.state.verified).toEqual([]);
    expect(tracker._selfVerification).toEqual({ totalClaims: 0, verifiedClaims: 0, failedClaims: 0 });
    expect(tracker._comprehensiveChecker).toBeNull();
  });

  test('constructor accepts custom state and checker', () => {
    const checker = { run: jest.fn() };
    const tracker = new PromiseTracker({ comprehensiveChecker: checker });
    expect(tracker._comprehensiveChecker).toBe(checker);
  });

  test('state getter returns internal state', () => {
    const tracker = new PromiseTracker();
    expect(tracker.state).toBe(tracker._state);
  });

  test('trackPromise records promise, increments totalClaims, returns id', () => {
    const _log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const tracker = new PromiseTracker();
    const id = tracker.trackPromise('已完成核心重构', 'refactor-commit', 30000);
    expect(typeof id).toBe('string');
    expect(tracker.state.promises).toHaveLength(1);
    expect(tracker.state.pending).toHaveLength(1);
    expect(tracker._selfVerification.totalClaims).toBe(1);
    const record = tracker.state.promises[0];
    expect(record.promise).toBe('已完成核心重构');
    expect(record.evidence).toBe('refactor-commit');
    expect(record.status).toBe('pending');
    expect(record.verifyAt).toBe(record.createdAt + 30000);
    expect(_log).toHaveBeenCalled();
  });

  test('verifyPromises leaves not-due promises pending', () => {
    const _log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const state = {
      promises: [], pending: [], broken: [], verified: []
    };
    const tracker = new PromiseTracker({ state });
    tracker.trackPromise('正在进行的任务', 'evidence');
    const result = tracker.verifyPromises();
    expect(result).toEqual({ verified: 0, broken: 0 });
    expect(tracker.state.pending).toHaveLength(1);
  });

  test('verifyPromises verifies due promise with 已融入 text', () => {
    const _log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const record = {
      id: 'p1', promise: '已融入新能力', evidence: 'e', createdAt: 0,
      verifyAt: 0, status: 'pending', verificationResult: null
    };
    const tracker = new PromiseTracker({
      state: { promises: [record], pending: [record], broken: [], verified: [] }
    });
    const result = tracker.verifyPromises();
    expect(result).toEqual({ verified: 1, broken: 0 });
    expect(record.status).toBe('verified');
    expect(record.verificationResult).toMatchObject({ pass: true, requiresHumanReview: true });
    expect(tracker.state.verified).toContain(record);
    expect(tracker._selfVerification.verifiedClaims).toBe(1);
  });

  test('verifyPromises marks broken for due promise that fails', () => {
    const _log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const record = {
      id: 'p2', promise: '目标未达成', evidence: 'e', createdAt: 0,
      verifyAt: 0, status: 'pending', verificationResult: null
    };
    const tracker = new PromiseTracker({
      state: { promises: [record], pending: [record], broken: [], verified: [] }
    });
    jest.spyOn(tracker, '_verifyPromise').mockReturnValue({ pass: false, reason: '证据不足' });
    const result = tracker.verifyPromises();
    expect(result).toEqual({ verified: 0, broken: 1 });
    expect(record.status).toBe('broken');
    expect(tracker.state.broken).toContain(record);
    expect(tracker._selfVerification.failedClaims).toBe(1);
  });

  test('verifyPromises runs comprehensive checker when promise mentions 全方面检查', async () => {
    const _log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const checker = {
      run: jest.fn().mockResolvedValue({ stats: { failed: 2, warnings: 1 } })
    };
    const record = {
      id: 'p3', promise: '完成全方面检查', evidence: 'e', createdAt: 0,
      verifyAt: 0, status: 'pending', verificationResult: null
    };
    const tracker = new PromiseTracker({
      state: { promises: [record], pending: [record], broken: [], verified: [] },
      comprehensiveChecker: checker
    });
    const result = tracker.verifyPromises();
    expect(result).toEqual({ verified: 1, broken: 0 });
    expect(record.verificationResult.reason).toBe('已执行全方面检查');
    await new Promise((resolve) => setImmediate(resolve));
    expect(checker.run).toHaveBeenCalled();
  });

  test('verifyPromises handles 56项 promise with checker', async () => {
    const _log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const checker = { run: jest.fn().mockResolvedValue({ stats: { failed: 0, warnings: 0 } }) };
    const record = {
      id: 'p4', promise: '完成56项检查', evidence: 'e', createdAt: 0,
      verifyAt: 0, status: 'pending', verificationResult: null
    };
    const tracker = new PromiseTracker({
      state: { promises: [record], pending: [record], broken: [], verified: [] },
      comprehensiveChecker: checker
    });
    const result = tracker.verifyPromises();
    expect(result.verified).toBe(1);
    await new Promise((resolve) => setImmediate(resolve));
    expect(checker.run).toHaveBeenCalled();
  });

  test('_verifyPromise returns default pass for unrelated text', () => {
    const tracker = new PromiseTracker();
    const result = tracker._verifyPromise({ promise: '普通承诺' });
    expect(result).toEqual({ pass: true, reason: '默认通过' });
  });

  test('_verifyPromise handles 已完成 text', () => {
    const tracker = new PromiseTracker();
    const result = tracker._verifyPromise({ promise: '已完成部署' });
    expect(result.pass).toBe(true);
    expect(result.requiresHumanReview).toBe(true);
  });

  test('_verifyPromise skips checker when none present', () => {
    const tracker = new PromiseTracker();
    const result = tracker._verifyPromise({ promise: '全方面检查' });
    expect(result).toEqual({ pass: true, reason: '已执行全方面检查' });
  });

  test('getPromiseStats reports counters and claims snapshot', () => {
    const tracker = new PromiseTracker();
    tracker.trackPromise('已完成任务', 'e');
    const stats = tracker.getPromiseStats();
    expect(stats).toEqual({
      total: 1, pending: 1, verified: 0, broken: 0,
      claimsStats: { totalClaims: 1, verifiedClaims: 0, failedClaims: 0 }
    });
  });

  test('forceVerifyAll without checker returns verifyPromises result', () => {
    const _log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const record = {
      id: 'p5', promise: '已完成', evidence: 'e', createdAt: 0,
      verifyAt: 0, status: 'pending', verificationResult: null
    };
    const tracker = new PromiseTracker({
      state: { promises: [record], pending: [record], broken: [], verified: [] }
    });
    const result = tracker.forceVerifyAll();
    expect(result).toEqual({ verified: 1, broken: 0 });
  });

  test('forceVerifyAll with checker returns report + stats', async () => {
    const _log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const checker = { run: jest.fn().mockResolvedValue({ ok: true }) };
    const tracker = new PromiseTracker({ comprehensiveChecker: checker });
    tracker.trackPromise('已完成', 'e', 0);
    const result = await tracker.forceVerifyAll();
    expect(result.comprehensiveReport).toEqual({ ok: true });
    expect(result.promiseResult).toEqual({ verified: 1, broken: 0 });
    expect(result.stats.verified).toBe(1);
  });
});
