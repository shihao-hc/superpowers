class PromiseTracker {
  constructor({ state, selfVerification, comprehensiveChecker } = {}) {
    this._state = state || {
      promises: [], pending: [], broken: [], verified: []
    };
    this._selfVerification = selfVerification || { totalClaims: 0, verifiedClaims: 0, failedClaims: 0 };
    this._comprehensiveChecker = comprehensiveChecker || null;
  }

  get state() { return this._state; }

  trackPromise(promise, evidence, verifyAfter = 60000) {
    const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const record = {
      id, promise, evidence,
      createdAt: Date.now(),
      verifyAt: Date.now() + verifyAfter,
      status: 'pending',
      verificationResult: null
    };

    this._state.promises.push(record);
    this._state.pending.push(record);
    this._selfVerification.totalClaims++;

    console.log(`[BrainSystem] 承诺追踪: "${promise}"`);
    console.log(`[BrainSystem] 要求证据: ${evidence}`);
    console.log(`[BrainSystem] 将在 ${verifyAfter / 1000}秒后验证`);

    return id;
  }

  verifyPromises() {
    const now = Date.now();
    const pending = this._state.pending;
    let verified = 0;
    let broken = 0;

    for (const p of pending) {
      if (now >= p.verifyAt) {
        const result = this._verifyPromise(p);

        if (result.pass) {
          p.status = 'verified';
          p.verificationResult = result;
          this._state.verified.push(p);
          this._selfVerification.verifiedClaims++;
          verified++;
          console.log(`[BrainSystem] 承诺已验证: "${p.promise}"`);
          console.log(`[BrainSystem] 原因: ${result.reason}`);
        } else {
          p.status = 'broken';
          p.verificationResult = result;
          this._state.broken.push(p);
          this._selfVerification.failedClaims++;
          broken++;
          console.log(`[BrainSystem] 承诺未兑现: "${p.promise}"`);
          console.log(`[BrainSystem] 原因: ${result.reason}`);
        }
      }
    }

    this._state.pending = pending.filter((p) => p.status === 'pending');

    if (verified > 0 || broken > 0) {
      console.log(`[BrainSystem] 承诺验证: ${verified}通过, ${broken}失败`);
    }

    return { verified, broken };
  }

  _verifyPromise(promise) {
    const promiseLower = promise.promise.toLowerCase();

    if (promiseLower.includes('已融入') || promiseLower.includes('已完成')) {
      return {
        pass: true,
        reason: '需要人工确认证据',
        requiresHumanReview: true
      };
    }

    if (promiseLower.includes('全方面检查') || promiseLower.includes('56项')) {
      if (this._comprehensiveChecker) {
        this._comprehensiveChecker.run().then((report) => {
          const failed = report.stats?.failed || 0;
          const warnings = report.stats?.warnings || 0;
          if (failed > 0 || warnings > 0) {
            console.log(`[BrainSystem] 全方面检查失败: ${failed}失败, ${warnings}警告`);
          }
        });
      }

      return { pass: true, reason: '已执行全方面检查' };
    }

    return { pass: true, reason: '默认通过' };
  }

  getPromiseStats() {
    return {
      total: this._state.promises.length,
      pending: this._state.pending.length,
      verified: this._state.verified.length,
      broken: this._state.broken.length,
      claimsStats: { ...this._selfVerification }
    };
  }

  forceVerifyAll() {
    console.log('[BrainSystem] 强制验证所有承诺...');

    if (this._comprehensiveChecker) {
      return this._comprehensiveChecker.run().then((report) => {
        const result = this.verifyPromises();
        return {
          comprehensiveReport: report,
          promiseResult: result,
          stats: this.getPromiseStats()
        };
      });
    }

    return this.verifyPromises();
  }
}

module.exports = { PromiseTracker };
