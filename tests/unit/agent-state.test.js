const { AgentState, MultiExpertState } = require('../../src/multiagent/patterns/AgentState');

describe('AgentState', () => {
  let state;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    state = new AgentState({ id: 'test-1' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('creates with default values', () => {
      const s = new AgentState();
      expect(s.get('status')).toBe('initialized');
      expect(s.get('messages')).toEqual([]);
      expect(s.get('expertReports')).toEqual({});
      expect(s.get('decision')).toBeNull();
      expect(s.get('errors')).toEqual([]);
    });

    it('accepts custom initialState', () => {
      const s = new AgentState({ status: 'running', decision: 'go' });
      expect(s.get('status')).toBe('running');
      expect(s.get('decision')).toBe('go');
    });

    it('preserves provided id', () => {
      expect(state.get('id')).toBe('test-1');
    });

    it('merges customState', () => {
      const s = new AgentState({ customState: { foo: 'bar', score: 42 } });
      expect(s.get('foo')).toBe('bar');
      expect(s.get('score')).toBe(42);
    });

    it('records initial state in history', () => {
      expect(state.getHistory()).toHaveLength(1);
    });
  });

  describe('getState', () => {
    it('returns a copy of state', () => {
      const result = state.getState();
      result.foo = 'bar';
      expect(state.get('foo')).toBeUndefined();
    });
  });

  describe('get', () => {
    it('returns field value', () => {
      expect(state.get('status')).toBe('initialized');
    });

    it('returns undefined for missing field', () => {
      expect(state.get('nonexistent')).toBeUndefined();
    });
  });

  describe('set', () => {
    it('updates state and returns this', () => {
      const result = state.set({ status: 'running' });
      expect(result).toBe(state);
      expect(state.get('status')).toBe('running');
    });

    it('updates updatedAt', () => {
      const before = state.get('updatedAt');
      jest.advanceTimersByTime(1000);
      state.set({ status: 'running' });
      expect(state.get('updatedAt')).not.toBe(before);
    });

    it('pushes snapshot to history', () => {
      state.set({ status: 'running' });
      expect(state.getHistory()).toHaveLength(2);
    });

    it('notifies update listeners', () => {
      const listener = jest.fn();
      state.subscribe('update', listener);
      state.set({ status: 'running' }, 'test');
      expect(listener).toHaveBeenCalledWith('update', expect.objectContaining({
        source: 'test'
      }), expect.anything());
    });
  });

  describe('addMessage', () => {
    it('adds message with correct structure', () => {
      const msg = state.addMessage('user', 'hello', { key: 'val' });
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('hello');
      expect(msg.metadata).toEqual({ key: 'val' });
      expect(msg.id).toBeTruthy();
      expect(msg.timestamp).toBeTruthy();
    });

    it('pushes message to state.messages', () => {
      state.addMessage('system', 'start');
      expect(state.get('messages')).toHaveLength(1);
    });

    it('notifies message listeners', () => {
      const listener = jest.fn();
      state.subscribe('message', listener);
      state.addMessage('user', 'hi');
      expect(listener).toHaveBeenCalledWith('message', expect.objectContaining({ role: 'user', content: 'hi' }), expect.anything());
    });
  });

  describe('expertReports', () => {
    it('adds and retrieves expert report', () => {
      state.addExpertReport('expert-1', { analysis: 'bullish' }, { confidence: 0.9 });
      const reports = state.getExpertReports();
      expect(reports['expert-1'].report).toEqual({ analysis: 'bullish' });
      expect(reports['expert-1'].metadata.confidence).toBe(0.9);
    });

    it('returns copy of expertReports', () => {
      state.addExpertReport('e1', { x: 1 });
      const reports = state.getExpertReports();
      reports.e1 = 'hacked';
      expect(state.getExpertReports().e1).not.toBe('hacked');
    });

    it('notifies on expertReport', () => {
      const listener = jest.fn();
      state.subscribe('expertReport', listener);
      state.addExpertReport('e1', { x: 1 });
      expect(listener).toHaveBeenCalledWith('expertReport', expect.objectContaining({ expertId: 'e1' }), expect.anything());
    });
  });

  describe('debate state', () => {
    it('updates debate state', () => {
      state.updateDebateState({ round: 1, bullPosition: 'up' });
      const ds = state.get('debateState');
      expect(ds.round).toBe(1);
      expect(ds.bullPosition).toBe('up');
    });

    it('increments debate round', () => {
      state.incrementDebateRound();
      expect(state.get('debateState').round).toBe(1);
    });

    it('notifies on debateUpdate', () => {
      const listener = jest.fn();
      state.subscribe('debateUpdate', listener);
      state.updateDebateState({ round: 1 });
      expect(listener).toHaveBeenCalled();
    });

    it('notifies on roundIncrement', () => {
      const listener = jest.fn();
      state.subscribe('roundIncrement', listener);
      state.incrementDebateRound();
      expect(listener).toHaveBeenCalledWith('roundIncrement', 1, expect.anything());
    });
  });

  describe('setDecision', () => {
    it('sets decision and status', () => {
      state.setDecision({ action: 'buy', amount: 100 }, { source: 'debate' });
      const decision = state.get('decision');
      expect(decision.action).toBe('buy');
      expect(decision.amount).toBe(100);
      expect(decision.metadata.source).toBe('debate');
      expect(decision.decidedAt).toBeTruthy();
      expect(state.get('status')).toBe('decided');
    });

    it('notifies on decision', () => {
      const listener = jest.fn();
      state.subscribe('decision', listener);
      state.setDecision({ action: 'sell' });
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('addError', () => {
    it('adds error record', () => {
      state.addError(new Error('boom'), { step: 1 });
      const errors = state.get('errors');
      expect(errors).toHaveLength(1);
      expect(errors[0].error).toBe('boom');
      expect(errors[0].context.step).toBe(1);
    });

    it('handles string error', () => {
      state.addError('something went wrong');
      expect(state.get('errors')[0].error).toBe('something went wrong');
    });

    it('notifies on error', () => {
      const listener = jest.fn();
      state.subscribe('error', listener);
      state.addError('fail');
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('canTransitionTo', () => {
    it('allows valid transitions', () => {
      expect(state.canTransitionTo('running')).toBe(true);
      expect(state.canTransitionTo('cancelled')).toBe(true);
    });

    it('rejects invalid transitions', () => {
      expect(state.canTransitionTo('decided')).toBe(false);
      expect(state.canTransitionTo('failed')).toBe(false);
    });

    it('rejects transitions from terminal states', () => {
      state.set({ status: 'cancelled' });
      expect(state.canTransitionTo('running')).toBe(false);
    });

    it('chains through valid lifecycle', () => {
      state.transitionTo('running');
      expect(state.canTransitionTo('decided')).toBe(true);
      expect(state.canTransitionTo('failed')).toBe(true);
      expect(state.canTransitionTo('cancelled')).toBe(true);

      state.transitionTo('decided');
      expect(state.canTransitionTo('finalized')).toBe(true);
      expect(state.canTransitionTo('running')).toBe(false);
    });

    it('handles retry cycle', () => {
      state.set({ status: 'failed' });
      expect(state.canTransitionTo('retrying')).toBe(true);

      state.set({ status: 'retrying' });
      expect(state.canTransitionTo('running')).toBe(true);
      expect(state.canTransitionTo('failed')).toBe(true);
    });
  });

  describe('transitionTo', () => {
    it('executes valid transition', () => {
      state.transitionTo('running');
      expect(state.get('status')).toBe('running');
    });

    it('throws on invalid transition', () => {
      expect(() => state.transitionTo('decided')).toThrow(/Invalid state transition/);
    });

    it('adds error record on invalid transition', () => {
      try { state.transitionTo('decided'); } catch {}
      expect(state.get('errors')).toHaveLength(1);
    });

    it('passes metadata through set', () => {
      state.transitionTo('running', { triggeredBy: 'system' });
      expect(state.get('triggeredBy')).toBe('system');
    });
  });

  describe('snapshot and restore', () => {
    it('snapshot returns deep copy of state', () => {
      state.addMessage('user', 'hi');
      const snap = state.snapshot();
      state.addMessage('user', 'there');
      expect(snap.messages).toHaveLength(1);
    });

    it('restore from object', () => {
      const snap = state.snapshot();
      state.addMessage('user', 'hello');
      state.restore(snap);
      expect(state.get('messages')).toHaveLength(0);
    });

    it('restore from JSON string', () => {
      state.addMessage('user', 'hello');
      const json = JSON.stringify(state.snapshot());
      state.addMessage('user', 'world');
      state.restore(json);
      expect(state.get('messages')).toHaveLength(1);
    });

    it('notifies on restore', () => {
      const listener = jest.fn();
      state.subscribe('restore', listener);
      state.restore(state.snapshot());
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('returns copy of history', () => {
      state.set({ status: 'running' });
      const hist = state.getHistory();
      expect(hist).toHaveLength(2);
      hist.length = 0;
      expect(state.getHistory()).toHaveLength(2);
    });
  });

  describe('subscribe', () => {
    it('calls listener on matching event', () => {
      const listener = jest.fn();
      state.subscribe('update', listener);
      state.set({ status: 'running' });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not call listener for different event', () => {
      const listener = jest.fn();
      state.subscribe('update', listener);
      state.addMessage('user', 'hi');
      expect(listener).not.toHaveBeenCalled();
    });

    it('returns unsubscribe function', () => {
      const listener = jest.fn();
      const unsub = state.subscribe('update', listener);
      unsub();
      state.set({ status: 'running' });
      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple listeners on same event', () => {
      const l1 = jest.fn();
      const l2 = jest.fn();
      state.subscribe('update', l1);
      state.subscribe('update', l2);
      state.set({ status: 'running' });
      expect(l1).toHaveBeenCalledTimes(1);
      expect(l2).toHaveBeenCalledTimes(1);
    });

    it('supports wildcard listener', () => {
      const listener = jest.fn();
      state.subscribe('*', listener);
      state.addMessage('user', 'hi');
      expect(listener).toHaveBeenCalledWith('message', expect.anything(), expect.anything());
    });
  });

  describe('listener error handling', () => {
    it('handles listener that throws', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      state.subscribe('update', () => { throw new Error('listener boom'); });
      expect(() => state.set({ status: 'running' })).not.toThrow();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('clears listeners stops notifications', () => {
      const listener = jest.fn();
      state.subscribe('update', listener);
      state.destroy();
      state.set({ status: 'running' });
      expect(listener).not.toHaveBeenCalled();
    });

    it('clears history', () => {
      state.destroy();
      expect(state.getHistory()).toEqual([]);
    });
  });

  describe('serialization', () => {
    it('toJSON returns state', () => {
      state.set({ status: 'running' });
      const json = state.toJSON();
      expect(json.status).toBe('running');
    });

    it('fromJSON reinstantiates', () => {
      const s = AgentState.fromJSON({ id: 'restored', status: 'running' });
      expect(s.get('id')).toBe('restored');
      expect(s.get('status')).toBe('running');
    });
  });
});

describe('MultiExpertState', () => {
  let experts;
  let mes;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    experts = [
      { id: 'e1', name: 'Analyst', role: 'analyst' },
      { id: 'e2', name: 'Reviewer', role: 'reviewer' }
    ];
    mes = new MultiExpertState(experts, {
      maxParallelism: 2,
      requiredExperts: ['e1'],
      optionalExperts: ['e2']
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('creates expert entries with idle status', () => {
      const e1 = mes.getExpertStatus('e1');
      expect(e1.name).toBe('Analyst');
      expect(e1.role).toBe('analyst');
      expect(e1.status).toBe('idle');
      expect(e1.result).toBeNull();
    });

    it('sets parallelism and required experts', () => {
      expect(mes.get('maxParallelism')).toBe(2);
      expect(mes.get('requiredExperts')).toEqual(['e1']);
      expect(mes.get('optionalExperts')).toEqual(['e2']);
    });
  });

  describe('getExpertStatus', () => {
    it('returns expert by id', () => {
      expect(mes.getExpertStatus('e1').name).toBe('Analyst');
    });

    it('returns undefined for unknown expert', () => {
      expect(mes.getExpertStatus('ghost')).toBeUndefined();
    });
  });

  describe('startExpert', () => {
    it('marks expert as running and returns true', () => {
      const result = mes.startExpert('e1');
      expect(result).toBe(true);
      expect(mes.getExpertStatus('e1').status).toBe('running');
    });

    it('returns false for unknown expert', () => {
      expect(mes.startExpert('ghost')).toBe(false);
    });
  });

  describe('completeExpert', () => {
    it('marks expert completed with result', () => {
      mes.startExpert('e1');
      const result = mes.completeExpert('e1', { rating: 'buy' });
      expect(result).toBe(true);
      const expert = mes.getExpertStatus('e1');
      expect(expert.status).toBe('completed');
      expect(expert.result).toEqual({ rating: 'buy' });
      expect(expert.completedAt).toBeTruthy();
    });

    it('adds expert report', () => {
      mes.startExpert('e1');
      mes.completeExpert('e1', { rating: 'hold' });
      expect(mes.getExpertReports()['e1']).toBeTruthy();
    });

    it('returns false for unknown expert', () => {
      expect(mes.completeExpert('ghost', {})).toBe(false);
    });
  });

  describe('failExpert', () => {
    it('marks expert as failed', () => {
      mes.startExpert('e1');
      const result = mes.failExpert('e1', new Error('timeout'));
      expect(result).toBe(true);
      const expert = mes.getExpertStatus('e1');
      expect(expert.status).toBe('failed');
      expect(expert.error).toBe('timeout');
    });

    it('handles string error', () => {
      mes.startExpert('e1');
      mes.failExpert('e1', 'crashed');
      expect(mes.getExpertStatus('e1').error).toBe('crashed');
    });

    it('adds error record', () => {
      mes.startExpert('e1');
      mes.failExpert('e1', 'fail');
      expect(mes.get('errors')).toHaveLength(1);
    });

    it('returns false for unknown expert', () => {
      expect(mes.failExpert('ghost', 'err')).toBe(false);
    });
  });

  describe('isComplete', () => {
    it('returns true when all required experts completed', () => {
      mes.startExpert('e1');
      mes.completeExpert('e1', {});
      expect(mes.isComplete()).toBe(true);
    });

    it('returns false when required expert not completed', () => {
      mes.startExpert('e1');
      expect(mes.isComplete()).toBe(false);
    });

    it('returns true with empty required experts', () => {
      const m = new MultiExpertState([]);
      expect(m.isComplete()).toBe(true);
    });

    it('generates id when expert has none', () => {
      const m = new MultiExpertState([{ name: 'NoID', role: 'analyst' }]);
      const expert = m.getExpertStatus(m.state.experts[0].id);
      expect(expert.name).toBe('NoID');
      expect(expert.id).toBeDefined();
    });

    it('uses empty experts default when no argument', () => {
      const m = new MultiExpertState();
      expect(m.state.experts).toEqual([]);
    });
  });

  describe('getCompletionStats', () => {
    it('returns stats with mixed statuses', () => {
      mes.startExpert('e1');
      mes.completeExpert('e1', {});
      mes.startExpert('e2');

      const stats = mes.getCompletionStats();
      expect(stats.total).toBe(2);
      expect(stats.completed).toBe(1);
      expect(stats.running).toBe(1);
      expect(stats.failed).toBe(0);
      expect(stats.idle).toBe(0);
      expect(stats.requiredTotal).toBe(1);
      expect(stats.requiredCompleted).toBe(1);
    });
  });
});
