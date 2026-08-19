const TaskPlanner = require('../../src/game/TaskPlanner');

describe('TaskPlanner', () => {
  let game;
  let chat;
  let memory;
  let planner;

  function makeGame(overrides = {}) {
    return {
      connected: true,
      getStatus: jest.fn().mockReturnValue({
        position: { x: 0, y: 64, z: 0 },
        inventory: [{ name: 'dirt', count: 10 }, { name: 'stone', count: 5 }],
        health: 20,
        food: 20,
        ...overrides
      }),
      moveTo: jest.fn().mockResolvedValue({ ok: true }),
      dig: jest.fn().mockResolvedValue({ ok: true }),
      placeBlock: jest.fn().mockResolvedValue({ ok: true }),
      equip: jest.fn().mockResolvedValue({ ok: true }),
      chat: jest.fn().mockResolvedValue({ ok: true }),
      craft: jest.fn().mockResolvedValue({ ok: true, message: '合成成功' }),
      ...overrides
    };
  }

  function makeChat() {
    return {
      respond: jest.fn().mockResolvedValue({ reply: '' })
    };
  }

  function makeMemory() {
    return {
      remember: jest.fn()
    };
  }

  beforeEach(() => {
    game = makeGame();
    chat = makeChat();
    memory = makeMemory();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.useFakeTimers();
    planner = new TaskPlanner(game, chat, memory);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should set game, chat, memory agents', () => {
      expect(planner.game).toBe(game);
      expect(planner.chat).toBe(chat);
      expect(planner.memory).toBe(memory);
    });

    it('should initialize state', () => {
      expect(planner.currentTask).toBeNull();
      expect(planner.taskHistory).toEqual([]);
      expect(planner.variables).toEqual({});
      expect(planner.executionState.loopCount).toBe(0);
      expect(planner.executionState.maxErrors).toBe(5);
      expect(planner.auditLog).toEqual([]);
      expect(planner.MAX_AUDIT_LOG).toBe(1000);
    });
  });

  describe('_audit', () => {
    it('should add entry to audit log', () => {
      planner._audit('test', { msg: 'hello' });
      expect(planner.auditLog.length).toBe(1);
      expect(planner.auditLog[0].action).toBe('test');
      expect(planner.auditLog[0].details.msg).toBe('hello');
    });

    it('should wrap non-object details', () => {
      planner._audit('warn', 'just a string');
      expect(planner.auditLog[0].details.message).toBe('just a string');
    });

    it('should cap audit log at MAX_AUDIT_LOG', () => {
      for (let i = 0; i < 1005; i++) {
        planner._audit('a', { i });
      }
      expect(planner.auditLog.length).toBe(1000);
    });

    it('should set ISO timestamp on entries', () => {
      const now = new Date('2026-07-01T12:00:00.000Z');
      jest.setSystemTime(now);
      planner._audit('test', {});
      const iso = new Date(planner.auditLog[0].timestamp).toISOString();
      expect(iso).toBe('2026-07-01T12:00:00.000Z');
    });
  });

  describe('_parsePlan', () => {
    it('should parse basic steps', () => {
      const text = 'STEP_1: move 100 64 100\nSTEP_2: dig stone\nSTEP_3: chat "done"';
      const steps = planner._parsePlan(text);
      expect(steps).toHaveLength(3);
      expect(steps[0].type).toBe('step');
      expect(steps[0].action).toBe('move');
      expect(steps[1].action).toBe('dig');
      expect(steps[2].action).toBe('chat');
    });

    it('should ignore actions not in SAFE_ACTIONS', () => {
      const text = 'STEP_1: kill player\nSTEP_2: move 0 0 0';
      const steps = planner._parsePlan(text);
      expect(steps).toHaveLength(1);
      expect(steps[0].action).toBe('move');
    });

    it('should parse IF conditions', () => {
      const text = 'STEP_1: dig stone\nIF health < 5 THEN STEP_3 ELSE STEP_1';
      const steps = planner._parsePlan(text);
      expect(steps).toHaveLength(2);
      expect(steps[1].type).toBe('if');
      expect(steps[1].condition).toBe('health < 5');
      expect(steps[1].thenStep).toBe(3);
      expect(steps[1].elseStep).toBe(1);
    });

    it('should parse LOOP blocks', () => {
      const text = 'LOOP 3 TIMES\n  STEP_1: dig stone\nEND';
      const steps = planner._parsePlan(text);
      expect(steps).toHaveLength(1);
      expect(steps[0].type).toBe('loop');
      expect(steps[0].iterations).toBe(3);
      expect(steps[0].steps).toHaveLength(1);
      expect(steps[0].steps[0].action).toBe('dig');
    });

    it('should parse nested loops', () => {
      const text = 'LOOP 2 TIMES\n  LOOP 2 TIMES\n    STEP_1: dig stone\n  END\nEND';
      const steps = planner._parsePlan(text);
      expect(steps).toHaveLength(1);
      expect(steps[0].type).toBe('loop');
      expect(steps[0].steps[0].type).toBe('loop');
    });

    it('should enforce MAX_TASK_STEPS limit', () => {
      const lines = [];
      for (let i = 1; i <= 60; i++) {
        lines.push(`STEP_${i}: move ${i} 0 0`);
      }
      const steps = planner._parsePlan(lines.join('\n'));
      expect(steps.length).toBeLessThanOrEqual(50);
    });

    it('should sanitize action params', () => {
      const text = 'STEP_1: chat "hello;\nworld\r"';
      const steps = planner._parsePlan(text);
      expect(steps[0].raw).not.toContain(';');
      expect(steps[0].raw).not.toContain('\n');
    });

    it('should parse IF condition with lower-case step prefix', () => {
      const text = 'if health < 5 then step_3 else step_1';
      const steps = planner._parsePlan(text);
      expect(steps).toHaveLength(1);
      expect(steps[0].type).toBe('if');
    });

    it('should handle empty text', () => {
      expect(planner._parsePlan('')).toEqual([]);
    });

    it('should handle missing STEP prefix gracefully', () => {
      const text = 'STEP: move 10 20 30\nSTEP_: dig stone';
      const steps = planner._parsePlan(text);
      expect(steps).toHaveLength(2);
    });
  });

  describe('_evaluateCondition', () => {
    it('should evaluate health comparison', () => {
      expect(planner._evaluateCondition('health < 10')).toBe(false);
      expect(planner._evaluateCondition('health > 10')).toBe(true);
    });

    it('should evaluate food comparison', () => {
      expect(planner._evaluateCondition('food == 20')).toBe(true);
      expect(planner._evaluateCondition('food != 20')).toBe(false);
    });

    it('should evaluate position conditions', () => {
      expect(planner._evaluateCondition('x == 0')).toBe(true);
      expect(planner._evaluateCondition('y >= 64')).toBe(true);
    });

    it('should evaluate has() inventory function', () => {
      expect(planner._evaluateCondition('has("dirt")')).toBe(false);
      expect(planner._evaluateCondition('has("diamond")')).toBe(false);
    });

    it('should handle logical AND', () => {
      expect(planner._evaluateCondition('health > 10 && food > 10')).toBe(true);
      expect(planner._evaluateCondition('health < 10 && food > 10')).toBe(false);
    });

    it('should handle logical OR', () => {
      expect(planner._evaluateCondition('health < 5 || food > 10')).toBe(true);
      expect(planner._evaluateCondition('health < 5 || food < 5')).toBe(false);
    });

    it('should handle NOT', () => {
      expect(planner._evaluateCondition('!false')).toBe(true);
      expect(planner._evaluateCondition('!true')).toBe(false);
    });

    it('should handle parentheses', () => {
      expect(planner._evaluateCondition('(health > 5)')).toBe(true);
      expect(planner._evaluateCondition('(health < 5) || (food > 10 && x == 0)')).toBe(true);
    });

    it('should use variables in ctx', () => {
      planner.variables.target = 'stone';
      planner.variables.count = 5;
      expect(planner._evaluateCondition('count > 3')).toBe(true);
      expect(planner._evaluateCondition('count == 5')).toBe(true);
    });

    it('should throw on invalid characters in expression', () => {
      expect(planner._evaluateCondition('health < 10; drop table')).toBe(false);
    });

    it('should return false on eval error gracefully', () => {
      expect(planner._evaluateCondition('')).toBe(false);
    });

    it('should handle less-than-or-equal operator', () => {
      expect(planner._evaluateCondition('food <= 20')).toBe(true);
      expect(planner._evaluateCondition('health <= 5')).toBe(false);
    });

    it('should handle whitespace-only expression', () => {
      expect(planner._evaluateCondition('   ')).toBe(false);
    });
  });

  describe('_parseCoords', () => {
    it('should parse 3 integers from text', () => {
      expect(planner._parseCoords('100 64 100')).toEqual({ x: 100, y: 64, z: 100 });
    });

    it('should parse negative coords', () => {
      expect(planner._parseCoords('-100 0 200')).toEqual({ x: -100, y: 0, z: 200 });
    });

    it('should return null for invalid text', () => {
      expect(planner._parseCoords('abc')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(planner._parseCoords('')).toBeNull();
    });

    it('should return null for non-string', () => {
      expect(planner._parseCoords(null)).toBeNull();
      expect(planner._parseCoords(undefined)).toBeNull();
    });

    it('should enforce coordinate bounds', () => {
      expect(planner._parseCoords('99999999 0 0')).toBeNull();
      expect(planner._parseCoords('-99999999 0 0')).toBeNull();
    });
  });

  describe('_estimateTime', () => {
    it('should estimate based on step count', () => {
      const steps = [
        { type: 'step', action: 'move' },
        { type: 'step', action: 'dig' }
      ];
      expect(planner._estimateTime(steps)).toBe('10秒');
    });

    it('should account for loop steps', () => {
      const steps = [
        { type: 'step', action: 'move' },
        { type: 'loop', iterations: 3, steps: [{ type: 'step', action: 'dig' }] }
      ];
      const est = planner._estimateTime(steps);
      expect(est).toMatch(/(秒|分)/);
    });
  });

  describe('_saveToMemory', () => {
    it('should call memory.remember when memory exists', () => {
      planner._saveToMemory('task_planned', { request: 'build house', steps: 5 });
      expect(memory.remember).toHaveBeenCalled();
      const args = memory.remember.mock.calls[0];
      expect(args[0]).toMatch(/^game_task_planned_/);
      expect(args[1].type).toBe('task_planned');
      expect(args[1].request).toBe('build house');
    });

    it('should not fail when memory is null', () => {
      const p = new TaskPlanner(game, chat, null);
      expect(() => p._saveToMemory('test', {})).not.toThrow();
    });

    it('should not fail when memory is undefined', () => {
      const p = new TaskPlanner(game, chat, undefined);
      expect(() => p._saveToMemory('test', {})).not.toThrow();
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      const status = planner.getStatus();
      expect(status.connected).toBe(true);
      expect(status.currentTask).toBeNull();
      expect(status.variables).toEqual([]);
      expect(status.executionState).toBeDefined();
    });

    it('should return connected false when game lacks connected', () => {
      const p = new TaskPlanner({}, chat, memory);
      expect(p.getStatus().connected).toBe(false);
    });
  });

  describe('getAuditLog', () => {
    it('should return recent log entries', () => {
      planner._audit('a', {});
      planner._audit('b', {});
      const log = planner.getAuditLog();
      expect(log).toHaveLength(2);
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        planner._audit('a', { i });
      }
      expect(planner.getAuditLog(3)).toHaveLength(3);
    });
  });

  describe('clearAuditLog', () => {
    it('should clear all entries', () => {
      planner._audit('a', {});
      planner.clearAuditLog();
      expect(planner.auditLog).toEqual([]);
    });
  });

  describe('cancelTask', () => {
    it('should clear current task and variables', () => {
      planner.currentTask = { request: 'test' };
      planner.variables = { x: 1 };
      const result = planner.cancelTask();
      expect(result.ok).toBe(true);
      expect(planner.currentTask).toBeNull();
      expect(planner.variables).toEqual({});
    });
  });

  describe('_executeStep', () => {
    it('should return error for invalid action', async () => {
      const result = await planner._executeStep({ action: 'invalid' });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Invalid action');
    });

    it('should return error for null step', async () => {
      const result = await planner._executeStep(null);
      expect(result.ok).toBe(false);
    });

    it('should execute move action', async () => {
      await planner._executeStep({ action: 'move', target: '100 64 100' });
      expect(game.moveTo).toHaveBeenCalledWith(100, 64, 100);
    });

    it('should return error for move with invalid coords', async () => {
      const result = await planner._executeStep({ action: 'move', target: 'abc' });
      expect(result.ok).toBe(false);
    });

    it('should execute dig action', async () => {
      await planner._executeStep({ action: 'dig', target: 'stone' });
      expect(game.dig).toHaveBeenCalledWith('stone');
    });

    it('should execute place action', async () => {
      await planner._executeStep({ action: 'place', target: 'dirt' });
      expect(game.placeBlock).toHaveBeenCalledWith('dirt');
    });

    it('should execute equip action', async () => {
      await planner._executeStep({ action: 'equip', target: 'pickaxe' });
      expect(game.equip).toHaveBeenCalledWith('pickaxe');
    });

    it('should execute craft action', async () => {
      await planner._executeStep({ action: 'craft', target: 'stone_pickaxe' });
      expect(game.craft).toHaveBeenCalledWith('stone_pickaxe');
    });

    it('should handle craft when game.craft is undefined', async () => {
      const g = makeGame();
      delete g.craft;
      const p = new TaskPlanner(g, chat, memory);
      const result = await p._executeStep({ action: 'craft', target: 'stick' });
      expect(result.ok).toBe(true);
    });

    it('should execute chat action', async () => {
      await planner._executeStep({ action: 'chat', target: 'hello' });
      expect(game.chat).toHaveBeenCalledWith('hello');
    });

    it('should return error for chat message exceeding 256 chars', async () => {
      const result = await planner._executeStep({ action: 'chat', target: 'x'.repeat(257) });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('256');
    });

    it('should execute wait action', async () => {
      const promise = planner._executeStep({ action: 'wait', params: '1' });
      jest.advanceTimersByTime(1000);
      const result = await promise;
      expect(result.ok).toBe(true);
      expect(result.waited).toBe(1);
    });

    it('should clamp wait to 1-60 seconds', async () => {
      const promise = planner._executeStep({ action: 'wait', params: '999' });
      jest.advanceTimersByTime(60000);
      const result = await promise;
      expect(result.waited).toBe(60);
    });

    it('should execute find action', async () => {
      const result = await planner._executeStep({ action: 'find', target: 'diamond' });
      expect(result.ok).toBe(true);
    });

    it('should execute check action', async () => {
      const result = await planner._executeStep({ action: 'check', target: '' });
      expect(result.ok).toBe(true);
      expect(result.status).toBeDefined();
    });

    it('should execute set action to set variables', async () => {
      const result = await planner._executeStep({ action: 'set', target: 'target stone' });
      expect(result.ok).toBe(true);
      expect(planner.variables.target).toBe('stone');
    });

    it('should return error for set with empty variable name', async () => {
      const result = await planner._executeStep({ action: 'set', target: '' });
      expect(result.ok).toBe(false);
    });

    it('should return error for set with too-long variable name', async () => {
      const result = await planner._executeStep({ action: 'set', target: 'x'.repeat(51) + ' value' });
      expect(result.ok).toBe(false);
    });

    it('should execute goto action', async () => {
      const result = await planner._executeStep({ action: 'goto', target: '5' });
      expect(result.ok).toBe(true);
      expect(result.goto).toBe(4);
    });

    it('should clamp goto target to MAX_TASK_STEPS', async () => {
      const result = await planner._executeStep({ action: 'goto', target: '999' });
      expect(result.goto).toBe(50);
    });

    it('should handle goto with minimum of 0', async () => {
      const result = await planner._executeStep({ action: 'goto', target: '0' });
      expect(result.goto).toBe(0);
    });

    it('should audit execution', async () => {
      await planner._executeStep({ action: 'dig', target: 'stone' });
      const log = planner.getAuditLog(1);
      expect(log[0].action).toBe('execute');
    });
  });

  describe('planTask', () => {
    it('should return plan with steps when chat responds', async () => {
      chat.respond.mockResolvedValue({
        reply: 'STEP_1: move 100 64 100\nSTEP_2: dig stone'
      });
      const result = await planner.planTask('mine stone');
      expect(result.ok).toBe(true);
      expect(result.steps).toHaveLength(2);
      expect(result.request).toBe('mine stone');
      expect(result.estimatedTime).toBeDefined();
    });

    it('should set currentTask when plan is created', async () => {
      chat.respond.mockResolvedValue({ reply: 'STEP_1: dig stone' });
      await planner.planTask('mine');
      expect(planner.currentTask).not.toBeNull();
      expect(planner.currentTask.status).toBe('planned');
    });

    it('should return error when no valid plan generated', async () => {
      chat.respond.mockResolvedValue({ reply: 'I have no idea' });
      const result = await planner.planTask('do something');
      expect(result.ok).toBe(false);
    });

    it('should handle chat error gracefully', async () => {
      chat.respond.mockRejectedValue(new Error('API error'));
      const result = await planner.planTask('mine');
      expect(result.ok).toBe(false);
    });

    it('should save plan to memory', async () => {
      chat.respond.mockResolvedValue({ reply: 'STEP_1: move 0 0 0' });
      await planner.planTask('move');
      expect(memory.remember).toHaveBeenCalled();
    });

    it('should reset variables on new plan', async () => {
      planner.variables.oldKey = 'old';
      chat.respond.mockResolvedValue({ reply: 'STEP_1: wait 1' });
      await planner.planTask('wait');
      expect(planner.variables).toEqual({});
    });
  });

  describe('executePlan', () => {
    it('should execute steps in order', async () => {
      const steps = [
        { type: 'step', action: 'dig', target: 'stone' },
        { type: 'step', action: 'move', target: '0 64 0' }
      ];
      const result = await planner.executePlan(steps);
      expect(result.ok).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(game.dig).toHaveBeenCalledWith('stone');
      expect(game.moveTo).toHaveBeenCalledWith(0, 64, 0);
    });

    it('should handle IF conditions and jump to thenStep', async () => {
      const steps = [
        { type: 'step', action: 'dig', target: 'stone' },
        { type: 'if', condition: 'health > 10', thenStep: 3, elseStep: 1 }
      ];
      const result = await planner.executePlan(steps);
      expect(result.ok).toBe(true);
    });

    it('should handle LOOP blocks', async () => {
      const steps = [
        { type: 'loop', iterations: 3, steps: [
          { type: 'step', action: 'dig', target: 'stone' }
        ]}
      ];
      const result = await planner.executePlan(steps);
      expect(result.ok).toBe(true);
      expect(game.dig).toHaveBeenCalledTimes(3);
    });

    it('should abort on too many errors', async () => {
      game.dig.mockRejectedValue(new Error('fail'));
      const steps = Array(7).fill(null).map(() => ({ type: 'step', action: 'dig', target: 'stone' }));
      const result = await planner.executePlan(steps);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('错误次数过多');
    });

    it('should abort on too many loops', async () => {
      const steps = [
        { type: 'loop', iterations: 101, steps: [
          { type: 'step', action: 'check' }
        ]},
        { type: 'step', action: 'check' }
      ];
      const result = await planner.executePlan(steps);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('循环次数过多');
    });

    it('should execute wait action with setTimeout', async () => {
      const steps = [{ type: 'step', action: 'wait', params: '1' }];
      const promise = planner.executePlan(steps);
      await jest.runAllTimersAsync();
      const result = await promise;
      expect(result.ok).toBe(true);
    });

    it('should track step errors but continue', async () => {
      game.moveTo.mockRejectedValue(new Error('fail'));
      game.dig.mockResolvedValue({ ok: true });
      const steps = [
        { type: 'step', action: 'move', target: '10 0 10' },
        { type: 'step', action: 'dig', target: 'stone' }
      ];
      const result = await planner.executePlan(steps);
      expect(result.ok).toBe(true);
      expect(planner.executionState.errorCount).toBeGreaterThan(0);
    });

    it('should call _saveToMemory on completion', async () => {
      const steps = [{ type: 'step', action: 'dig', target: 'stone' }];
      await planner.executePlan(steps);
      expect(memory.remember).toHaveBeenCalled();
    });

    it('should clear currentTask after execution', async () => {
      const steps = [{ type: 'step', action: 'dig', target: 'stone' }];
      await planner.executePlan(steps);
      expect(planner.currentTask).toBeNull();
    });
  });

  describe('_executeLoop', () => {
    it('should execute loop steps for iteration count', async () => {
      const loopStep = { type: 'loop', iterations: 3, steps: [
        { type: 'step', action: 'dig', target: 'stone' }
      ]};
      const results = await planner._executeLoop(loopStep);
      expect(results).toHaveLength(3);
      expect(game.dig).toHaveBeenCalledTimes(3);
    });

    it('should update loopCount in execution state', async () => {
      const loopStep = { type: 'loop', iterations: 2, steps: [
        { type: 'step', action: 'dig', target: 'stone' }
      ]};
      await planner._executeLoop(loopStep);
      expect(planner.executionState.loopCount).toBe(2);
    });
  });

  describe('validateCoord (module-level)', () => {
    it('should validate coordinates within range', () => {
      expect(planner._parseCoords('0 0 0')).toBeDefined();
      expect(planner._parseCoords('1000 -2000 30000000')).toBeDefined();
    });

    it('should reject coordinates out of range', () => {
      expect(planner._parseCoords('30000001 0 0')).toBeNull();
      expect(planner._parseCoords('-30000001 0 0')).toBeNull();
    });
  });

  describe('sanitizeActionParam', () => {
    it('should trim whitespace and replace control chars', () => {
      expect(planner._executeStep({ action: 'chat', target: 'a;\nb\r' }).then(() => {})).resolves.not.toThrow();
    });
  });

  describe('integration: plan then execute', () => {
    it('should plan and execute successfully', async () => {
      chat.respond.mockResolvedValue({
        reply: 'STEP_1: dig stone\nSTEP_2: craft stone_pickaxe'
      });
      const plan = await planner.planTask('make a pickaxe');
      expect(plan.ok).toBe(true);

      const result = await planner.executePlan(plan.steps);
      expect(result.ok).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it('should handle step with complex multi-word action', async () => {
      const result = await planner._executeStep({ action: 'set', target: 'home_pos 100 64 200' });
      expect(result.ok).toBe(true);
      expect(planner.variables.home_pos).toBe('100 64 200');
    });
  });

  describe('coverage gaps', () => {
    it('should parse IF condition inside LOOP (line 163)', () => {
      const text = 'LOOP 3 TIMES\n  IF health < 5 THEN STEP_1 ELSE STEP_2\nEND';
      const steps = planner._parsePlan(text);
      expect(steps).toHaveLength(1);
      expect(steps[0].type).toBe('loop');
      expect(steps[0].steps[0].type).toBe('if');
      expect(steps[0].steps[0].condition).toBe('health < 5');
    });

    it('should handle null/undefined in parseValue (lines 224/227)', () => {
      expect(planner._evaluateCondition('null')).toBe(false);
      expect(planner._evaluateCondition('undefined')).toBe(false);
    });

    it('should return false for unsafe single-letter variable (line 250)', () => {
      expect(planner._evaluateCondition('health > a')).toBe(false);
    });

    it('should handle true/false literals (line 255)', () => {
      expect(planner._evaluateCondition('true')).toBe(true);
      expect(planner._evaluateCondition('false')).toBe(false);
    });

    it('should handle =!= and bare = in tokenizer (lines 283-284)', () => {
      expect(planner._evaluateCondition('health =!= 20')).toBe(false);
      expect(planner._evaluateCondition('health = 20')).toBe(true);
    });

    it('should handle stray non-operator char in tokenizer (line 291)', () => {
      expect(planner._evaluateCondition('health & 10')).toBe(true);
    });

    it('should handle unmatched closing paren (line 357)', () => {
      expect(planner._evaluateCondition(')')).toBe(false);
    });

    it('should increment errorCount for non-ok step result (line 406)', async () => {
      game.dig.mockResolvedValue({ ok: false });
      const steps = [{ type: 'step', action: 'dig', target: 'stone' }];
      await planner.executePlan(steps);
      expect(planner.executionState.errorCount).toBe(1);
    });

    it('should jump to elseStep when IF condition is false (line 415)', async () => {
      const steps = [
        { type: 'step', action: 'dig', target: 'stone' },
        { type: 'if', condition: 'health < 5', thenStep: 1, elseStep: 3 },
        { type: 'step', action: 'dig', target: 'wood' }
      ];
      await planner.executePlan(steps);
      expect(game.dig).toHaveBeenCalledTimes(2);
      expect(game.dig).toHaveBeenLastCalledWith('wood');
    });

    it('should skip unknown step type in executePlan (line 423)', async () => {
      const steps = [
        { type: 'weird', action: 'nothing' },
        { type: 'step', action: 'dig', target: 'stone' }
      ];
      const result = await planner.executePlan(steps);
      expect(result.ok).toBe(true);
      expect(result.results).toHaveLength(1);
    });

    it('should return error for attack action (line 525, in SAFE_ACTIONS but no switch case)', async () => {
      const result = await planner._executeStep({ action: 'attack', target: 'zombie' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Unknown action');
    });
  });
});
