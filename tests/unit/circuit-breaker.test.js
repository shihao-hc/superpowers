describe('CircuitBreaker', () => {
  let CircuitBreaker;

  beforeAll(() => {
    CircuitBreaker = require('../../src/core/CircuitBreaker');
  });

  describe('constructor', () => {
    it('starts OPEN by default', () => {
      const cb = new CircuitBreaker();
      expect(cb.state).toBe('OPEN');
      expect(cb.failureCount).toBe(0);
    });

    it('accepts custom options', () => {
      const cb = new CircuitBreaker({ maxRetries: 5, resetAfterMs: 30000 });
      expect(cb.maxRetries).toBe(5);
      expect(cb.resetAfterMs).toBe(30000);
    });
  });

  describe('isAllowed', () => {
    it('returns true when OPEN', () => {
      const cb = new CircuitBreaker();
      expect(cb.isAllowed()).toBe(true);
    });
  });

  describe('recordFailure', () => {
    it('increments failure count', () => {
      const cb = new CircuitBreaker({ maxRetries: 3 });
      cb.recordFailure();
      expect(cb.failureCount).toBe(1);
    });

    it('transitions to CLOSED after maxRetries', () => {
      const cb = new CircuitBreaker({ maxRetries: 2 });
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.state).toBe('CLOSED');
    });

    it('blocks when CLOSED', () => {
      const cb = new CircuitBreaker({ maxRetries: 1 });
      cb.recordFailure();
      expect(cb.state).toBe('CLOSED');
      expect(cb.isAllowed()).toBe(false);
    });
  });

  describe('HALF_OPEN state', () => {
    it('transitions to HALF_OPEN after reset period', () => {
      const cb = new CircuitBreaker({ maxRetries: 1, resetAfterMs: -1 });
      cb.recordFailure();
      expect(cb.state).toBe('CLOSED');
      expect(cb.isAllowed()).toBe(true);
      expect(cb.state).toBe('HALF_OPEN');
    });

    it('transitions HALF_OPEN back to OPEN after timeout', () => {
      const cb = new CircuitBreaker({ maxRetries: 1, resetAfterMs: -1 });
      cb.recordFailure();
      cb.isAllowed();
      expect(cb.state).toBe('HALF_OPEN');
      cb.isAllowed();
      expect(cb.state).toBe('OPEN');
      expect(cb.failureCount).toBe(0);
    });
  });

  describe('recordSuccess', () => {
    it('resets to OPEN', () => {
      const cb = new CircuitBreaker({ maxRetries: 1 });
      cb.recordFailure();
      expect(cb.state).toBe('CLOSED');
      cb.recordSuccess();
      expect(cb.state).toBe('OPEN');
      expect(cb.failureCount).toBe(0);
    });
  });

  describe('reset', () => {
    it('resets all state', () => {
      const cb = new CircuitBreaker({ maxRetries: 1 });
      cb.recordFailure();
      expect(cb.state).toBe('CLOSED');
      cb.reset();
      expect(cb.state).toBe('OPEN');
      expect(cb.failureCount).toBe(0);
      expect(cb.isAllowed()).toBe(true);
    });
  });

  describe('isAllowed - HALF_OPEN when timeout not elapsed', () => {
    it('returns false in HALF_OPEN before resetAfterMs elapses', () => {
      const cb = new CircuitBreaker({ maxRetries: 1, resetAfterMs: 60000 });
      cb.recordFailure();
      expect(cb.state).toBe('CLOSED');
      cb._state = 'HALF_OPEN';
      expect(cb.isAllowed()).toBe(false);
    });
  });

  describe('persistence (persist: true)', () => {
    const fs = require('fs');

    afterEach(() => {
      jest.restoreAllMocks();
    });

    describe('_load', () => {
      it('restores failureCount and lastFailureTime from file', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(
          JSON.stringify({ failureCount: 2, lastFailureTime: 99999 })
        );
        const cb = new CircuitBreaker({ maxRetries: 3, persist: true });
        expect(cb.failureCount).toBe(2);
        expect(cb._lastFailureTime).toBe(99999);
        expect(cb.state).toBe('OPEN');
      });

      it('restores CLOSED when failureCount >= maxRetries', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(
          JSON.stringify({ failureCount: 5, lastFailureTime: 88888 })
        );
        const cb = new CircuitBreaker({ maxRetries: 3, persist: true });
        expect(cb.state).toBe('CLOSED');
      });

      it('uses default 0 for missing fields', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({}));
        const cb = new CircuitBreaker({ persist: true });
        expect(cb.failureCount).toBe(0);
        expect(cb._lastFailureTime).toBe(0);
      });

      it('uses defaults when state file does not exist', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(false);
        const cb = new CircuitBreaker({ persist: true });
        expect(cb.failureCount).toBe(0);
        expect(cb.state).toBe('OPEN');
      });

      it('uses defaults when file content is invalid JSON', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue('not json');
        const cb = new CircuitBreaker({ persist: true });
        expect(cb.failureCount).toBe(0);
        expect(cb.state).toBe('OPEN');
      });
    });

    describe('_save', () => {
      it('writes state on recordFailure', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(
          JSON.stringify({ failureCount: 0, lastFailureTime: 0 })
        );
        const wsSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        const cb = new CircuitBreaker({ persist: true });
        wsSpy.mockClear();
        cb.recordFailure();
        expect(wsSpy).toHaveBeenCalledTimes(1);
        const saved = JSON.parse(wsSpy.mock.calls[0][1]);
        expect(saved.failureCount).toBe(1);
        expect(typeof saved.lastFailureTime).toBe('number');
      });

      it('creates directory when it does not exist', () => {
        jest.spyOn(fs, 'existsSync').mockImplementation((p) => p.endsWith('.json'));
        jest.spyOn(fs, 'readFileSync').mockReturnValue(
          JSON.stringify({ failureCount: 0, lastFailureTime: 0 })
        );
        const msSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
        const wsSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        const cb = new CircuitBreaker({ persist: true });
        wsSpy.mockClear();
        msSpy.mockClear();
        cb.recordFailure();
        expect(msSpy).toHaveBeenCalled();
        expect(wsSpy).toHaveBeenCalled();
      });

      it('skips mkdir when directory already exists', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(
          JSON.stringify({ failureCount: 0, lastFailureTime: 0 })
        );
        const msSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
        const wsSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        const cb = new CircuitBreaker({ persist: true });
        wsSpy.mockClear();
        msSpy.mockClear();
        cb.recordFailure();
        expect(msSpy).not.toHaveBeenCalled();
        expect(wsSpy).toHaveBeenCalled();
      });

      it('handles write errors gracefully', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(
          JSON.stringify({ failureCount: 0, lastFailureTime: 0 })
        );
        jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('disk full'); });
        const cb = new CircuitBreaker({ persist: true });
        expect(() => cb.recordFailure()).not.toThrow();
        expect(cb.failureCount).toBe(1);
      });

      it('handles mkdir errors gracefully', () => {
        jest.spyOn(fs, 'existsSync').mockImplementation((p) => p.endsWith('.json'));
        jest.spyOn(fs, 'readFileSync').mockReturnValue(
          JSON.stringify({ failureCount: 0, lastFailureTime: 0 })
        );
        jest.spyOn(fs, 'mkdirSync').mockImplementation(() => { throw new Error('perm'); });
        jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('no dir'); });
        const cb = new CircuitBreaker({ persist: true });
        expect(() => cb.recordFailure()).not.toThrow();
        expect(cb.failureCount).toBe(1);
      });

      it('skips save when persist is false', () => {
        const wsSpy = jest.spyOn(fs, 'writeFileSync');
        const cb = new CircuitBreaker({ persist: false });
        cb.recordFailure();
        expect(wsSpy).not.toHaveBeenCalled();
      });
    });
  });
});
