const { Supervisor, Expert, createSupervisor, createExpert } = require('../../src/multiagent/patterns/SupervisorExpertOrchestrator');

describe('Expert', () => {
  it('constructor sets fields', () => {
    const e = new Expert({ id: 'e1', name: 'Analyst', role: 'analyst', description: 'Market analyst', capabilities: ['finance'] });
    expect(e.id).toBe('e1');
    expect(e.name).toBe('Analyst');
    expect(e.role).toBe('analyst');
    expect(e.description).toBe('Market analyst');
    expect(e.capabilities).toEqual(['finance']);
  });

  it('enabled defaults to true', () => {
    const e = new Expert({ name: 'Test' });
    expect(e.enabled).toBe(true);
  });

  it('can be disabled', () => {
    const e = new Expert({ name: 'Test', enabled: false });
    expect(e.enabled).toBe(false);
  });

  it('analyze throws not implemented', async () => {
    const e = new Expert({ name: 'Test' });
    await expect(e.analyze({}, {})).rejects.toThrow('must be implemented');
  });

  it('getInfo returns metadata', () => {
    const e = new Expert({ id: 'e1', name: 'Analyst', role: 'analyst', description: 'Market', capabilities: ['finance'], enabled: true });
    expect(e.getInfo()).toEqual({
      id: 'e1', name: 'Analyst', role: 'analyst', description: 'Market',
      capabilities: ['finance'], enabled: true
    });
  });
});

describe('Supervisor', () => {
  let supervisor;
  let mockExpert;

  it('constructor defaults use generated id', () => {
    const s = new Supervisor({});
    expect(s.id).toMatch(/^supervisor_/);
    expect(s._generateId()).toMatch(/^expert_/);
  });

  beforeEach(() => {
    supervisor = new Supervisor({ id: 'sup-1', maxParallelism: 3, timeout: 5000, retries: 1 });
    mockExpert = new Expert({ id: 'ex-1', name: 'MockAnalyst', role: 'analyst', description: 'Test expert' });
    mockExpert.analyze = jest.fn().mockResolvedValue({ sentiment: 'bullish', recommendation: 'buy', risks: ['volatility'] });
  });

  describe('constructor', () => {
    it('sets config defaults', () => {
      const s = new Supervisor();
      expect(s.name).toBe('Supervisor');
      expect(s.role).toBe('coordinator');
      expect(s.maxParallelism).toBe(5);
      expect(s.timeout).toBe(120000);
      expect(s.retries).toBe(2);
    });

    it('accepts custom config', () => {
      expect(supervisor.id).toBe('sup-1');
      expect(supervisor.maxParallelism).toBe(3);
      expect(supervisor.timeout).toBe(5000);
      expect(supervisor.retries).toBe(1);
    });
  });

  describe('registerExpert', () => {
    it('registers an expert and returns this', () => {
      const result = supervisor.registerExpert(mockExpert);
      expect(result).toBe(supervisor);
      expect(supervisor.getExperts()).toHaveLength(1);
    });

    it('throws for non-Expert instance', () => {
      expect(() => supervisor.registerExpert({})).toThrow('Must register an Expert instance');
    });

    it('skips disabled experts', () => {
      const disabled = new Expert({ id: 'ex-2', name: 'Disabled', enabled: false });
      supervisor.registerExpert(disabled);
      expect(supervisor.getExperts()).toHaveLength(0);
    });

    it('registers multiple experts', () => {
      const e2 = new Expert({ id: 'ex-2', name: 'E2' });
      supervisor.registerExpert(mockExpert).registerExpert(e2);
      expect(supervisor.getExperts()).toHaveLength(2);
    });
  });

  describe('unregisterExpert', () => {
    it('removes an expert', () => {
      supervisor.registerExpert(mockExpert);
      supervisor.unregisterExpert('ex-1');
      expect(supervisor.getExperts()).toHaveLength(0);
    });

    it('returns this', () => {
      expect(supervisor.unregisterExpert('ghost')).toBe(supervisor);
    });
  });

  describe('getExperts', () => {
    it('returns array of expert info', () => {
      supervisor.registerExpert(mockExpert);
      const experts = supervisor.getExperts();
      expect(experts[0].name).toBe('MockAnalyst');
      expect(experts[0].id).toBe('ex-1');
    });
  });

  describe('analyze', () => {
    it('collects results from registered experts', async () => {
      supervisor.registerExpert(mockExpert);
      const result = await supervisor.analyze({ symbol: 'AAPL' });
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].expertName).toBe('MockAnalyst');
    });

    it('returns aggregated result', async () => {
      supervisor.registerExpert(mockExpert);
      const result = await supervisor.analyze({ symbol: 'AAPL' });
      expect(result.aggregated).toBeTruthy();
      expect(result.aggregated.summary.successful).toBe(1);
      expect(result.aggregated.summary.failed).toBe(0);
      expect(result.aggregated.perspectives).toHaveLength(1);
    });

    it('retries on failure and returns failure result', async () => {
      const failingExpert = new Expert({ id: 'ex-fail', name: 'FailBot', role: 'tester' });
      failingExpert.analyze = jest.fn().mockRejectedValue(new Error('timeout'));
      supervisor.registerExpert(failingExpert);
      const result = await supervisor.analyze({ test: true });
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('timeout');
      expect(result.results[0].attempts).toBe(2);
    });

    it('handles multiple experts with mixed results', async () => {
      const e2 = new Expert({ id: 'ex-2', name: 'E2', role: 'reviewer' });
      e2.analyze = jest.fn().mockResolvedValue({ sentiment: 'bearish', recommendation: 'sell' });

      supervisor.registerExpert(mockExpert).registerExpert(e2);
      const result = await supervisor.analyze({ symbol: 'TSLA' });
      expect(result.results).toHaveLength(2);
      expect(result.aggregated.summary.successful).toBe(2);
    });

    it('produces state with messages', async () => {
      supervisor.registerExpert(mockExpert);
      const result = await supervisor.analyze({ symbol: 'AAPL' });
      expect(result.state.messages.length).toBeGreaterThanOrEqual(2);
      expect(result.state.status).toBe('completed');
    });

    it('includes metadata in result', async () => {
      supervisor.registerExpert(mockExpert);
      const result = await supervisor.analyze({ symbol: 'AAPL' });
      expect(result.metadata.expertCount).toBe(1);
      expect(result.metadata.timestamp).toBeTruthy();
    });
  });

  describe('_aggregateResults', () => {
    it('generates summary with success rate', async () => {
      const results = [
        { success: true, expertName: 'A', role: 'r1', result: { sentiment: 'bullish' } },
        { success: false, expertName: 'B', role: 'r2', error: 'fail' }
      ];
      const agg = await supervisor._aggregateResults(results, {}, {});
      expect(agg.summary.successful).toBe(1);
      expect(agg.summary.failed).toBe(1);
      expect(agg.summary.successRate).toBe('50.0%');
    });

    it('identifies consensus when majority sentiment exists', async () => {
      const results = [
        { success: true, expertName: 'A', role: 'r1', result: { sentiment: 'bullish' } },
        { success: true, expertName: 'B', role: 'r2', result: { sentiment: 'bullish' } },
        { success: true, expertName: 'C', role: 'r3', result: { sentiment: 'bearish' } }
      ];
      const agg = await supervisor._aggregateResults(results, {}, {});
      expect(agg.consensus).toEqual({ point: 'bullish', confidence: '66.7%' });
    });

    it('returns null consensus with insufficient sentiment data', async () => {
      const results = [
        { success: true, expertName: 'A', role: 'r1', result: { sentiment: 'bullish' } }
      ];
      const agg = await supervisor._aggregateResults(results, {}, {});
      expect(agg.consensus).toBeNull();
    });

    it('detects sentiment conflicts', async () => {
      const results = [
        { success: true, expertName: 'A', role: 'r1', result: { sentiment: 'bullish' } },
        { success: true, expertName: 'B', role: 'r2', result: { sentiment: 'bearish' } }
      ];
      const agg = await supervisor._aggregateResults(results, {}, {});
      expect(agg.conflicts).toHaveLength(1);
      expect(agg.conflicts[0].issue).toBe('Sentiment mismatch');
    });

    it('detects recommendation conflicts', async () => {
      const results = [
        { success: true, expertName: 'A', role: 'r1', result: { sentiment: 'bullish', recommendation: 'buy' } },
        { success: true, expertName: 'B', role: 'r2', result: { sentiment: 'bearish', recommendation: 'sell' } }
      ];
      const agg = await supervisor._aggregateResults(results, {}, {});
      expect(agg.conflicts).toHaveLength(2);
    });

    it('generates primary recommendation from majority', async () => {
      const results = [
        { success: true, expertName: 'A', role: 'r1', result: { recommendation: 'buy' } },
        { success: true, expertName: 'B', role: 'r2', result: { recommendation: 'buy' } },
        { success: true, expertName: 'C', role: 'r3', result: { recommendation: 'sell' } }
      ];
      const agg = await supervisor._aggregateResults(results, {}, {});
      expect(agg.recommendations).toHaveLength(1);
      expect(agg.recommendations[0].type).toBe('primary');
      expect(agg.recommendations[0].recommendation).toBe('buy');
    });

    it('extracts risks from results', async () => {
      const results = [
        { success: true, expertName: 'A', role: 'r1', result: { risks: [{ description: 'high volatility' }] } },
        { success: true, expertName: 'B', role: 'r2', result: { risks: ['market uncertainty'] } }
      ];
      const agg = await supervisor._aggregateResults(results, {}, {});
      expect(agg.recommendations).toHaveLength(1);
    });

    it('skips empty-string recommendation in aggregations', async () => {
      const results = [
        { success: true, expertName: 'A', role: 'r1', result: { recommendation: { toString: () => '' } } }
      ];
      const agg = await supervisor._aggregateResults(results, {}, {});
      expect(agg.recommendations).toHaveLength(0);
    });
  });

  describe('_runExpertsConcurrently', () => {
    it('works without options', async () => {
      supervisor.registerExpert(mockExpert);
      const state = new (require('../../src/multiagent/patterns/AgentState').AgentState)({ status: 'running' });
      const results = await supervisor._runExpertsConcurrently({}, state);
      expect(results).toHaveLength(1);
    });
  });

  describe('_mostCommon', () => {
    it('returns null for empty array', () => {
      expect(supervisor._mostCommon([])).toBeNull();
    });
  });

  describe('_withTimeout', () => {
    it('resolves when promise completes before timeout', async () => {
      const result = await supervisor._withTimeout(
        Promise.resolve('done'), 1000, 'timeout'
      );
      expect(result).toBe('done');
    });

    it('rejects when timeout fires first', async () => {
      jest.useFakeTimers();
      const slow = new Promise(() => {});
      const promise = supervisor._withTimeout(slow, 100, 'slow expert timed out');
      jest.advanceTimersByTime(100);
      await expect(promise).rejects.toThrow('slow expert timed out');
      jest.useRealTimers();
    });
  });
});

describe('factory functions', () => {
  it('createSupervisor returns Supervisor', () => {
    expect(createSupervisor({})).toBeInstanceOf(Supervisor);
  });

  it('createExpert returns Expert', () => {
    expect(createExpert({ name: 'Test' })).toBeInstanceOf(Expert);
  });
});
