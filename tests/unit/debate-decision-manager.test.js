const {
  DebateManager, Debater, BullDebater, BearDebater, Judge,
  createDebateManager, createBullDebater, createBearDebater, createJudge
} = require('../../src/multiagent/patterns/DebateDecisionManager');

describe('Debater', () => {
  it('constructor sets fields', () => {
    const d = new Debater({ id: 'd1', name: 'Test', stance: 'bullish', role: 'bull' });
    expect(d.id).toBe('d1');
    expect(d.name).toBe('Test');
    expect(d.stance).toBe('bullish');
  });

  it('argue throws not implemented', async () => {
    const d = new Debater({ name: 'Base' });
    await expect(d.argue({}, '', {})).rejects.toThrow('must be implemented');
  });

  it('getInfo returns metadata', () => {
    const d = new Debater({ id: 'd1', name: 'Test', stance: 'bullish', role: 'bull' });
    expect(d.getInfo()).toEqual({ id: 'd1', name: 'Test', stance: 'bullish', role: 'bull' });
  });
});

describe('BullDebater', () => {
  it('constructor sets bullish stance', () => {
    const b = new BullDebater({ name: 'Bull-1' });
    expect(b.stance).toBe('bullish');
    expect(b.role).toBe('bull');
  });

  it('_generateFallback returns bullish argument', () => {
    const b = new BullDebater({ name: 'Bull-1' });
    const result = b._generateFallback({});
    expect(result.stance).toBe('bullish');
    expect(result.arguments).toHaveLength(3);
    expect(result.confidence).toBe(0.7);
    expect(result.recommendation).toBe('proceed');
  });

  it('argue returns fallback when no llmAdapter', async () => {
    const b = new BullDebater({ name: 'Bull-1' });
    const result = await b.argue({ market: 'up' }, '', {});
    expect(result.stance).toBe('bullish');
    expect(result.recommendation).toBe('proceed');
  });

  it('_extractConfidence reads from text', () => {
    const b = new BullDebater();
    expect(b._extractConfidence('confidence: 0.85')).toBe(0.85);
    expect(b._extractConfidence('no match')).toBe(0.7);
  });

  it('_parseResponse extracts fields', () => {
    const b = new BullDebater();
    const result = b._parseResponse('confidence: 0.9');
    expect(result.stance).toBe('bullish');
    expect(result.confidence).toBe(0.9);
  });

  it('_parseResponse falls back on empty input', () => {
    const b = new BullDebater();
    const result = b._parseResponse('');
    expect(result.stance).toBe('bullish');
  });
});

describe('BearDebater', () => {
  it('constructor sets bearish stance', () => {
    const b = new BearDebater({ name: 'Bear-1' });
    expect(b.stance).toBe('bearish');
    expect(b.role).toBe('bear');
  });

  it('_generateFallback returns bearish argument', () => {
    const b = new BearDebater();
    const result = b._generateFallback({});
    expect(result.stance).toBe('bearish');
    expect(result.arguments).toHaveLength(3);
    expect(result.confidence).toBe(0.6);
    expect(result.recommendation).toBe('caution');
  });

  it('argue returns fallback when no llmAdapter', async () => {
    const b = new BearDebater();
    const result = await b.argue({ market: 'down' }, '', {});
    expect(result.stance).toBe('bearish');
  });

  it('_extractConfidence reads from text', () => {
    const b = new BearDebater();
    expect(b._extractConfidence('confidence: 0.4')).toBe(0.4);
    expect(b._extractConfidence('none')).toBe(0.6);
  });
});

describe('Judge', () => {
  it('constructor sets defaults', () => {
    const j = new Judge();
    expect(j.name).toBe('Judge');
    expect(j.bias).toBe(0);
  });

  it('constructor sets bias', () => {
    const j = new Judge({ bias: 0.2 });
    expect(j.bias).toBe(0.2);
  });

  describe('_generateFallbackDecision', () => {
    it('returns proceed when bull confidence is significantly higher', () => {
      const j = new Judge();
      const result = j._generateFallbackDecision(
        { stance: 'bullish', confidence: 0.9 },
        { stance: 'bearish', confidence: 0.3 }
      );
      expect(result.decision).toBe('proceed');
    });

    it('returns abort when bear confidence is significantly higher', () => {
      const j = new Judge();
      const result = j._generateFallbackDecision(
        { stance: 'bullish', confidence: 0.2 },
        { stance: 'bearish', confidence: 0.8 }
      );
      expect(result.decision).toBe('abort');
    });

    it('returns caution when scores are close', () => {
      const j = new Judge();
      const result = j._generateFallbackDecision(
        { stance: 'bullish', confidence: 0.6 },
        { stance: 'bearish', confidence: 0.5 }
      );
      expect(result.decision).toBe('caution');
    });
  });

  describe('_parseDecision', () => {
    it('parses structured response', () => {
      const j = new Judge();
      const text = 'decision: proceed\nconfidence: 0.85\nreasoning: Looks good';
      const result = j._parseDecision(text, { confidence: 0.7 }, { confidence: 0.5 });
      expect(result.decision).toBe('proceed');
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toBe('Looks good');
    });

    it('falls back to comparison when text lacks fields', () => {
      const j = new Judge();
      const result = j._parseDecision('blah', { confidence: 0.9 }, { confidence: 0.3 });
      expect(result.decision).toBe('proceed');
    });
  });

  describe('decide', () => {
    it('returns fallback decision when no llmAdapter', async () => {
      const j = new Judge();
      const result = await j.decide(
        { stance: 'bullish', confidence: 0.8 },
        { stance: 'bearish', confidence: 0.4 },
        { symbol: 'AAPL' },
        {}
      );
      expect(result.decision).toBe('proceed');
    });
  });
});

describe('DebateManager', () => {
  beforeEach(() => {
    jest.spyOn(DebateManager.prototype, '_delay').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('constructor sets config', () => {
    const dm = new DebateManager({ id: 'debate-1', maxRounds: 5, convergenceThreshold: 0.9 });
    expect(dm.id).toBe('debate-1');
    expect(dm.maxRounds).toBe(5);
    expect(dm.convergenceThreshold).toBe(0.9);
  });

  it('constructor creates default participants', () => {
    const dm = new DebateManager();
    expect(dm.bull).toBeInstanceOf(BullDebater);
    expect(dm.bear).toBeInstanceOf(BearDebater);
    expect(dm.judge).toBeInstanceOf(Judge);
  });

  describe('debate', () => {
    it('completes full debate flow with fallback participants', async () => {
      const dm = new DebateManager({ maxRounds: 2 });
      const result = await dm.debate({ symbol: 'AAPL', price: 150 });
      expect(result.success).toBe(true);
      expect(result.rounds).toBeGreaterThanOrEqual(1);
      expect(result.history.length).toBeGreaterThanOrEqual(1);
      expect(result.decision).toBeTruthy();
      expect(result.state).toBeTruthy();
    });

    it('stores debate history', async () => {
      const dm = new DebateManager({ maxRounds: 2 });
      await dm.debate({ symbol: 'TSLA' });
      expect(dm.getHistory().length).toBeGreaterThanOrEqual(1);
    });

    it('converges when confidence meets threshold', async () => {
      const dm = new DebateManager({ convergenceThreshold: 0.5 });
      const result = await dm.debate({ symbol: 'AAPL' });
      expect(result.converged).toBe(true);
    });

    it('handles custom bull and bear', async () => {
      const customBull = new BullDebater({ name: 'CustomBull' });
      const customBear = new BearDebater({ name: 'CustomBear' });
      const dm = new DebateManager({
        bull: customBull,
        bear: customBear,
        maxRounds: 1
      });
      const result = await dm.debate({ symbol: 'GOOG' });
      expect(result.success).toBe(true);
    });

    it('sets final decision on max rounds', async () => {
      const dm = new DebateManager({ maxRounds: 1, convergenceThreshold: 0.99 });
      const result = await dm.debate({ symbol: 'MSFT' });
      expect(result.converged).toBe(false);
      expect(result.decision).toBeTruthy();
    });
  });
});

describe('factory functions', () => {
  it('createDebateManager returns DebateManager', () => {
    expect(createDebateManager({})).toBeInstanceOf(DebateManager);
  });

  it('createBullDebater returns BullDebater', () => {
    expect(createBullDebater({})).toBeInstanceOf(BullDebater);
  });

  it('createBearDebater returns BearDebater', () => {
    expect(createBearDebater({})).toBeInstanceOf(BearDebater);
  });

  it('createJudge returns Judge', () => {
    expect(createJudge({})).toBeInstanceOf(Judge);
  });
});

describe('BullDebater llmAdapter path', () => {
  it('argue uses llmAdapter when available', async () => {
    const llmAdapter = { generate: jest.fn().mockResolvedValue('confidence: 0.85') };
    const b = new BullDebater({ llmAdapter });
    const result = await b.argue({ market: 'up' }, '', {});
    expect(result.stance).toBe('bullish');
    expect(result.confidence).toBe(0.85);
    expect(llmAdapter.generate).toHaveBeenCalled();
  });

  it('_parseResponse falls back when _extractConfidence throws', () => {
    const b = new BullDebater();
    jest.spyOn(b, '_extractConfidence').mockImplementation(() => { throw new Error('fail'); });
    const result = b._parseResponse('test');
    expect(result.stance).toBe('bullish');
    expect(result.confidence).toBe(0.7);
  });
});

describe('BearDebater llmAdapter path', () => {
  it('argue uses llmAdapter when available', async () => {
    const llmAdapter = { generate: jest.fn().mockResolvedValue('confidence: 0.4') };
    const b = new BearDebater({ llmAdapter });
    const result = await b.argue({ market: 'down' }, '', {});
    expect(result.stance).toBe('bearish');
    expect(result.confidence).toBe(0.4);
    expect(llmAdapter.generate).toHaveBeenCalled();
  });

  it('_parseResponse extracts fields directly', () => {
    const b = new BearDebater();
    const result = b._parseResponse('confidence: 0.5');
    expect(result.stance).toBe('bearish');
    expect(result.confidence).toBe(0.5);
  });

  it('_parseResponse catches errors from _extractConfidence', () => {
    const b = new BearDebater();
    jest.spyOn(b, '_extractConfidence').mockImplementation(() => { throw new Error('fail'); });
    const result = b._parseResponse('test');
    expect(result.stance).toBe('bearish');
    expect(result.confidence).toBe(0.6);
  });
});

describe('Judge llmAdapter path', () => {
  it('_parseDecision falls back to caution when decision missing and bull not stronger', () => {
    const j = new Judge();
    const result = j._parseDecision('blah', { stance: 'bullish', confidence: 0.3 }, { stance: 'bearish', confidence: 0.9 });
    expect(result.decision).toBe('caution');
  });

  it('decide uses llmAdapter when available', async () => {
    const llmAdapter = { generate: jest.fn().mockResolvedValue('decision: abort\nconfidence: 0.3\nreasoning: Too risky') };
    const j = new Judge({ llmAdapter });
    const result = await j.decide(
      { stance: 'bullish', confidence: 0.9 },
      { stance: 'bearish', confidence: 0.8 },
      { symbol: 'AAPL' },
      {}
    );
    expect(result.decision).toBe('abort');
    expect(llmAdapter.generate).toHaveBeenCalled();
  });
});

describe('DebateManager _delay', () => {
  it('resolves after specified time', async () => {
    const start = Date.now();
    await DebateManager.prototype._delay(10);
    expect(Date.now() - start).toBeGreaterThanOrEqual(5);
  });
});

describe('Judge fallback confidence branches', () => {
  it('_parseDecision defaults to 0.5 when confidences are missing', () => {
    const j = new Judge();
    const result = j._parseDecision('nodata', { stance: 'bullish' }, { stance: 'bearish' });
    expect(result.decision).toBe('caution');
    expect(result.confidence).toBe(0.5);
  });

  it('_generateFallbackDecision defaults to 0.5 when confidences are missing', () => {
    const j = new Judge();
    const result = j._generateFallbackDecision({ stance: 'bullish' }, { stance: 'bearish' });
    expect(result.decision).toBe('caution');
  });
});

describe('DebateManager empty history branch', () => {
  it('handles empty history when no rounds execute', async () => {
    const dm = new DebateManager({ maxRounds: -1, convergenceThreshold: 0.99 });
    const result = await dm.debate({ symbol: 'TEST' });
    expect(result.success).toBe(true);
    expect(result.rounds).toBe(0);
    expect(result.converged).toBe(false);
    expect(result.decision).toBeTruthy();
  });
});
