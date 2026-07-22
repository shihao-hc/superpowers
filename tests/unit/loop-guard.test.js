describe('LoopGuard', () => {
  let LoopGuard;
  let fs;

  beforeAll(() => {
    fs = require('fs');
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    LoopGuard = require('../../src/core/LoopGuard');
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('uses default options', () => {
      const g = new LoopGuard();
      expect(g.maxHistory).toBe(50);
      expect(g.maxPerMinute).toBe(3);
      expect(g.isTripped).toBe(false);
    });

    it('accepts custom options', () => {
      const g = new LoopGuard({ maxHistory: 10, maxPerMinute: 5 });
      expect(g.maxHistory).toBe(10);
      expect(g.maxPerMinute).toBe(5);
    });
  });

  describe('check', () => {
    it('returns not tripped on first call', () => {
      const g = new LoopGuard();
      expect(g.check('test', 'action')).toEqual({ tripped: false });
    });

    it('trips after exceeding maxPerMinute', () => {
      const g = new LoopGuard({ maxPerMinute: 2 });
      expect(g.check('mod', 'act').tripped).toBe(false);
      expect(g.check('mod', 'act').tripped).toBe(false);
      const t = g.check('mod', 'act');
      expect(t.tripped).toBe(true);
      expect(t.pattern).toBe('mod:act');
      expect(g.isTripped).toBe(true);
    });

    it('resets trip when tripped pattern no longer in history', () => {
      const g = new LoopGuard({ maxPerMinute: 1 });
      g.check('mod', 'act');
      g.check('mod', 'act');
      expect(g.isTripped).toBe(true);
      g._history = [];
      expect(g.check('other', 'act').tripped).toBe(false);
      expect(g.isTripped).toBe(false);
    });

    it('caps history at maxHistory', () => {
      const g = new LoopGuard({ maxHistory: 3, maxPerMinute: 10 });
      for (let i = 0; i < 10; i++) g.check('mod', 'act');
      expect(g._history.length).toBe(3);
    });

    it('different keys are counted separately', () => {
      const g = new LoopGuard({ maxPerMinute: 1 });
      g.check('mod1', 'act');
      expect(g.check('mod2', 'act').tripped).toBe(false);
    });
  });

describe('additional branch coverage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
  });

  it('loads persisted state from disk', () => {
    fs.existsSync.mockReturnValueOnce(true);
    const history = [{ key: 'mod:act', time: Date.now() - 1000 }];
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
      history,
      tripped: true,
      trippedPattern: 'mod:act'
    }));
    const g = new LoopGuard();
    expect(g._history).toEqual(history);
    expect(g._tripped).toBe(true);
    expect(g._trippedPattern).toBe('mod:act');
  });

  it('falls back to defaults when persisted data has null fields', () => {
    fs.existsSync.mockReturnValueOnce(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('{}');
    const g = new LoopGuard();
    expect(g._history).toEqual([]);
    expect(g._tripped).toBe(false);
    expect(g._trippedPattern).toBeNull();
  });

  it('handles invalid persisted data gracefully', () => {
    fs.existsSync.mockReturnValueOnce(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('not valid json');
    const g = new LoopGuard();
    expect(g._history).toEqual([]);
    expect(g._tripped).toBe(false);
  });

  it('handles read failure gracefully', () => {
    fs.existsSync.mockReturnValueOnce(true);
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw new Error('read error'); });
    const g = new LoopGuard();
    expect(g._history).toEqual([]);
    expect(g._tripped).toBe(false);
  });

  it('does not reset trip when tripped pattern still has entries', () => {
    const g = new LoopGuard({ maxPerMinute: 1 });
    g.check('mod', 'act');
    g.check('mod', 'act');
    const result = g.check('other', 'diff');
    expect(g.isTripped).toBe(true);
    expect(result.tripped).toBe(false);
  });

  it('skips mkdir when directory already exists', () => {
    const g = new LoopGuard({ maxPerMinute: 1 });
    g.check('mod', 'act');
    fs.existsSync.mockReturnValueOnce(true);
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync');
    g.check('mod', 'act');
    expect(mkdirSpy).not.toHaveBeenCalled();
    expect(g.isTripped).toBe(true);
  });

  it('handles save failure gracefully', () => {
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('write failed'); });
    const g = new LoopGuard({ maxPerMinute: 1 });
    g.check('mod', 'act');
    g.check('mod', 'act');
    expect(g.isTripped).toBe(true);
  });
});
});
