const GameEventHandler = require('../../src/game/GameEventHandler');

function makeMocks() {
  const game = {
    on: jest.fn(),
    chat: jest.fn().mockResolvedValue({}),
    whisper: jest.fn().mockResolvedValue({}),
    moveTo: jest.fn().mockResolvedValue({}),
    getStatus: jest.fn().mockReturnValue({
      username: 'Bot', health: 20, food: 20,
      position: { x: 0, y: 64, z: 0 }, connected: true,
      inventory: { items: ['dirt'] }
    })
  };
  const pm = {
    driftMood: jest.fn(),
    getMood: jest.fn().mockReturnValue('neutral')
  };
  const chat = {
    respond: jest.fn().mockResolvedValue({ reply: 'hello back' })
  };
  return { game, pm, chat };
}

describe('GameEventHandler', () => {
  let handler, mocks;

  beforeEach(() => {
    mocks = makeMocks();
    handler = new GameEventHandler(mocks.game, mocks.pm, mocks.chat);
  });

  describe('constructor', () => {
    it('stores dependencies', () => {
      expect(handler.game).toBe(mocks.game);
      expect(handler.pm).toBe(mocks.pm);
      expect(handler.chat).toBe(mocks.chat);
    });

    it('initializes state properties', () => {
      expect(handler.ws).toBeNull();
      expect(handler.eventHandlers).toBeInstanceOf(Map);
      expect(handler.eventHandlers.size).toBe(0);
      expect(handler.lastMoodChange).toEqual({});
      expect(handler.eventHistory).toEqual([]);
    });

    it('defines mood triggers', () => {
      expect(handler.moodTriggers.hurt).toEqual({ mood: 'fearful', weight: 0.8, cooldown: 30000 });
      expect(handler.moodTriggers.died).toEqual({ mood: 'sad', weight: 1.0, cooldown: 60000 });
      expect(handler.moodTriggers.attacked_mob).toEqual({ mood: 'excited', weight: 0.5, cooldown: 10000 });
      expect(handler.moodTriggers.found_diamond).toEqual({ mood: 'excited', weight: 0.9, cooldown: 0 });
      expect(handler.moodTriggers.player_gift).toEqual({ mood: 'happy', weight: 1.0, cooldown: 0 });
      expect(handler.moodTriggers.night).toEqual({ mood: 'curious', weight: 0.3, cooldown: 0 });
      expect(handler.moodTriggers.day).toEqual({ mood: 'happy', weight: 0.3, cooldown: 0 });
    });

    it('sets constants', () => {
      expect(handler.ALLOWED_COMMANDS).toEqual(['/status', '/goto', '/inventory', '/inv', '/say', '/whisper', '/follow']);
      expect(handler.MAX_COORD).toBe(30000000);
      expect(handler.MIN_COORD).toBe(-30000000);
      expect(handler.MAX_MESSAGE_LENGTH).toBe(500);
      const patterns = handler.FORBIDDEN_PATTERNS;
      expect(patterns[0]).toEqual(/^http/i);
      expect(patterns[1]).toEqual(/^ftp/i);
      expect(patterns[2]).toEqual(/\x00/); // eslint-disable-line no-control-regex
      expect(patterns[3]).toEqual(/<script/i);
      expect(patterns[4]).toEqual(/javascript:/i);
    });
  });

  describe('sanitizeMessage', () => {
    it('returns empty string for null', () => {
      expect(handler.sanitizeMessage(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(handler.sanitizeMessage(undefined)).toBe('');
    });

    it('returns empty string for non-string', () => {
      expect(handler.sanitizeMessage(123)).toBe('');
    });

    it('truncates long messages', () => {
      const long = 'a'.repeat(600);
      const result = handler.sanitizeMessage(long);
      expect(result.length).toBe(500);
    });

    it('replaces http links', () => {
      expect(handler.sanitizeMessage('http://evil.com')).toBe('█://evil.com');
    });

    it('replaces https links', () => {
      expect(handler.sanitizeMessage('https://evil.com')).toBe('█s://evil.com');
    });

    it('replaces ftp links', () => {
      expect(handler.sanitizeMessage('ftp://files')).toBe('█://files');
    });

    it('replaces script tags', () => {
      expect(handler.sanitizeMessage('<script>alert(1)</script>')).toBe('█>alert(1)</script>');
    });

    it('replaces javascript: protocol', () => {
      const msg = 'javascript' + ':alert(1)';
      expect(handler.sanitizeMessage(msg)).toBe('█alert(1)');
    });

    it('strips control characters', () => {
      expect(handler.sanitizeMessage('hello\x1Fworld\x7Ftest')).toBe('helloworldtest');
    });

    it('handles multiple forbidden patterns', () => {
      expect(handler.sanitizeMessage('http://x.com <script>')).toBe('█://x.com █>');
    });

    it('preserves normal text', () => {
      expect(handler.sanitizeMessage('hello world')).toBe('hello world');
    });

    it('handles empty string', () => {
      expect(handler.sanitizeMessage('')).toBe('');
    });
  });

  describe('validateCoordinates', () => {
    it('returns true for valid coordinates', () => {
      expect(handler.validateCoordinates(0, 64, 0)).toBe(true);
    });

    it('returns true for max boundary', () => {
      expect(handler.validateCoordinates(30000000, 30000000, 30000000)).toBe(true);
    });

    it('returns true for min boundary', () => {
      expect(handler.validateCoordinates(-30000000, -30000000, -30000000)).toBe(true);
    });

    it('returns false for non-integer x', () => {
      expect(handler.validateCoordinates(1.5, 0, 0)).toBe(false);
    });

    it('returns false for non-integer y', () => {
      expect(handler.validateCoordinates(0, 'a', 0)).toBe(false);
    });

    it('returns false for x out of max range', () => {
      expect(handler.validateCoordinates(30000001, 0, 0)).toBe(false);
    });

    it('returns false for y out of min range', () => {
      expect(handler.validateCoordinates(0, -30000001, 0)).toBe(false);
    });

    it('returns false for z out of range', () => {
      expect(handler.validateCoordinates(0, 0, 99999999)).toBe(false);
    });
  });

  describe('isCommandInjection', () => {
    it('returns false for null', () => {
      expect(handler.isCommandInjection(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(handler.isCommandInjection(undefined)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(handler.isCommandInjection('')).toBe(false);
    });

    it('returns false for normal text', () => {
      expect(handler.isCommandInjection('hello world')).toBe(false);
    });

    it('returns false for allowed /status', () => {
      expect(handler.isCommandInjection('/status')).toBe(false);
    });

    it('returns false for allowed /goto', () => {
      expect(handler.isCommandInjection('/goto 0 64 0')).toBe(false);
    });

    it('returns false for allowed /inv', () => {
      expect(handler.isCommandInjection('/inv')).toBe(false);
    });

    it('returns false for allowed /say', () => {
      expect(handler.isCommandInjection('/say hello')).toBe(false);
    });

    it('returns false for allowed /whisper', () => {
      expect(handler.isCommandInjection('/whisper player hi')).toBe(false);
    });

    it('returns false for allowed /follow', () => {
      expect(handler.isCommandInjection('/follow')).toBe(false);
    });

    it('returns true for blocked /op', () => {
      expect(handler.isCommandInjection('/op')).toBe(true);
    });

    it('returns true for blocked /give', () => {
      expect(handler.isCommandInjection('/give me diamonds')).toBe(true);
    });

    it('returns true for blocked /kill', () => {
      expect(handler.isCommandInjection('/kill @a')).toBe(true);
    });
  });

  describe('setWebSocket', () => {
    it('sets ws property', () => {
      const ws = { broadcast: jest.fn() };
      handler.setWebSocket(ws);
      expect(handler.ws).toBe(ws);
    });
  });

  describe('setupListeners', () => {
    it('registers all event listeners on game.on', () => {
      handler.setupListeners();
      expect(mocks.game.on).toHaveBeenCalledTimes(7);
      expect(mocks.game.on).toHaveBeenCalledWith('hurt', expect.any(Function));
      expect(mocks.game.on).toHaveBeenCalledWith('died', expect.any(Function));
      expect(mocks.game.on).toHaveBeenCalledWith('whisper', expect.any(Function));
      expect(mocks.game.on).toHaveBeenCalledWith('chat', expect.any(Function));
      expect(mocks.game.on).toHaveBeenCalledWith('playerJoined', expect.any(Function));
      expect(mocks.game.on).toHaveBeenCalledWith('playerLeft', expect.any(Function));
      expect(mocks.game.on).toHaveBeenCalledWith('health', expect.any(Function));
    });

    it('hurt event invokes _handleEvent and _triggerMoodChange', () => {
      handler.setupListeners();
      const hurtCb = mocks.game.on.mock.calls.find(c => c[0] === 'hurt')[1];
      jest.spyOn(handler, '_handleEvent');
      jest.spyOn(handler, '_triggerMoodChange');
      jest.spyOn(handler, '_broadcastWs');
      hurtCb({ health: 5 });
      expect(handler._handleEvent).toHaveBeenCalledWith('hurt', { health: 5 });
      expect(handler._triggerMoodChange).toHaveBeenCalledWith('hurt');
      expect(handler._broadcastWs).toHaveBeenCalledWith({ type: 'hurt', data: { health: 5 } });
    });

    it('died event broadcasts death message', () => {
      handler.setupListeners();
      const diedCb = mocks.game.on.mock.calls.find(c => c[0] === 'died')[1];
      jest.spyOn(handler, '_broadcast');
      diedCb({});
      expect(handler._broadcast).toHaveBeenCalledWith('我死了... 😢');
    });

    it('health event triggers mood change based on threshold', () => {
      handler.setupListeners();
      const healthCb = mocks.game.on.mock.calls.find(c => c[0] === 'health')[1];
      jest.spyOn(handler, '_triggerMoodChange');
      healthCb({ health: 4 });
      expect(handler._triggerMoodChange).toHaveBeenCalledWith('hurt', 0.6);
    });

    it('health event triggers healthy mood when above 15', () => {
      handler.setupListeners();
      const healthCb = mocks.game.on.mock.calls.find(c => c[0] === 'health')[1];
      jest.spyOn(handler, '_triggerMoodChange');
      healthCb({ health: 20 });
      expect(handler._triggerMoodChange).toHaveBeenCalledWith('healthy', 0.1);
    });

    it('health event does not trigger mood change in middle range', () => {
      handler.setupListeners();
      const healthCb = mocks.game.on.mock.calls.find(c => c[0] === 'health')[1];
      jest.spyOn(handler, '_triggerMoodChange');
      healthCb({ health: 10 });
      expect(handler._triggerMoodChange).not.toHaveBeenCalled();
    });
  });

  describe('on', () => {
    it('registers a handler for a new event type', () => {
      const cb = jest.fn();
      handler.on('testEvent', cb);
      expect(handler.eventHandlers.get('testEvent')).toEqual([cb]);
    });

    it('appends handler to existing event type', () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      handler.on('testEvent', cb1);
      handler.on('testEvent', cb2);
      expect(handler.eventHandlers.get('testEvent')).toEqual([cb1, cb2]);
    });

    it('supports multiple event types', () => {
      handler.on('a', jest.fn());
      handler.on('b', jest.fn());
      expect(handler.eventHandlers.size).toBe(2);
    });
  });

  describe('_handleEvent', () => {
    it('pushes event to history', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1000);
      handler._handleEvent('test', { msg: 'hi' });
      expect(handler.eventHistory).toHaveLength(1);
      expect(handler.eventHistory[0]).toEqual({ type: 'test', data: { msg: 'hi' }, time: 1000 });
      jest.spyOn(Date, 'now').mockRestore();
    });

    it('limits history to 100 entries', () => {
      for (let i = 0; i < 101; i++) {
        handler._handleEvent('e', { i });
      }
      expect(handler.eventHistory).toHaveLength(100);
      expect(handler.eventHistory[0].data.i).toBe(1);
    });

    it('invokes registered handlers for the event type', () => {
      const cb = jest.fn();
      handler.on('myEvent', cb);
      handler._handleEvent('myEvent', { val: 42 });
      expect(cb).toHaveBeenCalledWith({ val: 42 });
    });

    it('invokes all handlers for the same type', () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      handler.on('multi', cb1);
      handler.on('multi', cb2);
      handler._handleEvent('multi', {});
      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });

    it('does not error when no handler registered', () => {
      expect(() => handler._handleEvent('unregistered', {})).not.toThrow();
    });

    it('catches handler errors gracefully', () => {
      const errCb = jest.fn().mockImplementation(() => { throw new Error('handler fail'); });
      const goodCb = jest.fn();
      handler.on('errTest', errCb);
      handler.on('errTest', goodCb);
      expect(() => handler._handleEvent('errTest', {})).not.toThrow();
      expect(goodCb).toHaveBeenCalled();
    });

    it('returns { type, data }', () => {
      const result = handler._handleEvent('returnTest', { done: true });
      expect(result).toEqual({ type: 'returnTest', data: { done: true } });
    });
  });

  describe('_triggerMoodChange', () => {
    it('does nothing for unknown trigger', () => {
      handler._triggerMoodChange('unknown');
      expect(mocks.pm.driftMood).not.toHaveBeenCalled();
    });

    it('respects cooldown', () => {
      handler.moodTriggers.hurt.cooldown = 100000;
      handler.lastMoodChange.hurt = Date.now();
      handler._triggerMoodChange('hurt');
      expect(mocks.pm.driftMood).not.toHaveBeenCalled();
    });

    it('calls driftMood when probability passes', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.1);
      handler.moodTriggers.hurt.weight = 0.5;
      handler._triggerMoodChange('hurt');
      expect(mocks.pm.driftMood).toHaveBeenCalledWith(1);
      jest.spyOn(Math, 'random').mockRestore();
    });

    it('does not call driftMood when probability fails', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.9);
      handler.moodTriggers.hurt.weight = 0.5;
      handler._triggerMoodChange('hurt');
      expect(mocks.pm.driftMood).not.toHaveBeenCalled();
      jest.spyOn(Math, 'random').mockRestore();
    });

    it('uses custom weight override', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.01);
      handler._triggerMoodChange('hurt', 0.02);
      expect(mocks.pm.driftMood).toHaveBeenCalledWith(1);
      jest.spyOn(Math, 'random').mockRestore();
    });

    it('records lastMoodChange on success', () => {
      handler.lastMoodChange = {};
      jest.spyOn(Date, 'now').mockReturnValue(5000);
      jest.spyOn(Math, 'random').mockReturnValue(0.01);
      handler.moodTriggers.hurt.cooldown = 0;
      handler._triggerMoodChange('hurt');
      expect(handler.lastMoodChange.hurt).toBe(5000);
      jest.spyOn(Math, 'random').mockRestore();
      jest.spyOn(Date, 'now').mockRestore();
    });

    it('no cooldown when cooldown is 0', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.01);
      handler.moodTriggers.player_gift.weight = 1.0;
      handler._triggerMoodChange('player_gift');
      handler._triggerMoodChange('player_gift');
      expect(mocks.pm.driftMood).toHaveBeenCalledTimes(2);
      jest.spyOn(Math, 'random').mockRestore();
    });
  });

  describe('_processWhisper', () => {
    it('sanitizes message before processing', async () => {
      jest.spyOn(handler, 'sanitizeMessage').mockReturnValue('clean');
      await handler._processWhisper({ message: 'raw', from: 'Player1' });
      expect(handler.sanitizeMessage).toHaveBeenCalledWith('raw');
    });

    it('blocks command injection', async () => {
      jest.spyOn(handler, 'sanitizeMessage').mockReturnValue('/op give');
      jest.spyOn(handler, 'isCommandInjection').mockReturnValue(true);
      await handler._processWhisper({ message: '/op give', from: 'Player1' });
      expect(mocks.chat.respond).not.toHaveBeenCalled();
    });

    it('calls chat.respond with sanitized message', async () => {
      jest.spyOn(handler, 'sanitizeMessage').mockReturnValue('hello');
      jest.spyOn(handler, 'isCommandInjection').mockReturnValue(false);
      await handler._processWhisper({ message: 'hello', from: 'Player1' });
      expect(mocks.chat.respond).toHaveBeenCalledWith('hello');
    });

    it('whispers back the reply', async () => {
      jest.spyOn(handler, 'isCommandInjection').mockReturnValue(false);
      await handler._processWhisper({ message: 'hello back to you', from: 'Player1' });
      expect(mocks.chat.respond).toHaveBeenCalledWith('hello back to you');
      expect(mocks.game.whisper).toHaveBeenCalledWith('Player1', 'hello back');
    });

    it('sanitizes the reply before whispering', async () => {
      jest.spyOn(handler, 'sanitizeMessage').mockImplementation((m) => m);
      await handler._processWhisper({ message: 'hi', from: 'Player1' });
      const calls = handler.sanitizeMessage.mock.calls;
      expect(calls[calls.length - 1][0]).toBe('hello back');
    });

    it('handles errors gracefully', async () => {
      mocks.chat.respond.mockRejectedValue(new Error('API down'));
      await expect(handler._processWhisper({ message: 'hi', from: 'P' })).resolves.toBeUndefined();
    });

    it('does nothing when chat returns no reply', async () => {
      mocks.chat.respond.mockResolvedValue({});
      jest.spyOn(handler, 'sanitizeMessage').mockReturnValue('hi');
      jest.spyOn(handler, 'isCommandInjection').mockReturnValue(false);
      await handler._processWhisper({ message: 'hi', from: 'P' });
      expect(mocks.game.whisper).not.toHaveBeenCalled();
    });
  });

  describe('_broadcast', () => {
    it('calls game.chat with message', async () => {
      await handler._broadcast('hello server');
      expect(mocks.game.chat).toHaveBeenCalledWith('hello server');
    });

    it('handles errors gracefully', async () => {
      mocks.game.chat.mockRejectedValue(new Error('chat fail'));
      await expect(handler._broadcast('test')).resolves.toBeUndefined();
    });
  });

  describe('_broadcastWs', () => {
    it('broadcasts via ws when set', () => {
      const ws = { broadcast: jest.fn() };
      handler.setWebSocket(ws);
      handler._broadcastWs({ type: 'custom', data: { x: 1 } });
      expect(ws.broadcast).toHaveBeenCalledWith({ type: 'custom', data: { x: 1 } });
    });

    it('does nothing when ws is null', () => {
      expect(() => handler._broadcastWs({ type: 'test' })).not.toThrow();
    });
  });

  describe('handleUserCommand', () => {
    it('returns error for null', async () => {
      const result = await handler.handleUserCommand(null);
      expect(result).toEqual({ error: '无效命令' });
    });

    it('returns error for non-string', async () => {
      const result = await handler.handleUserCommand(123);
      expect(result).toEqual({ error: '无效命令' });
    });

    describe('/status', () => {
      it('returns game status', async () => {
        jest.spyOn(handler, 'getGameStatus').mockReturnValue({ status: 'ok' });
        const result = await handler.handleUserCommand('/status');
        expect(result).toEqual({ status: 'ok' });
      });
    });

    describe('/goto', () => {
      it('calls game.moveTo with valid coordinates', async () => {
        await handler.handleUserCommand('/goto 100 64 -200');
        expect(mocks.game.moveTo).toHaveBeenCalledWith(100, 64, -200);
      });

      it('returns error for out-of-range coordinates', async () => {
        const result = await handler.handleUserCommand('/goto 99999999 0 0');
        expect(result).toEqual({ error: '坐标超出有效范围' });
      });

      it('returns error for non-numeric coordinates', async () => {
        const result = await handler.handleUserCommand('/goto a b c');
        expect(result).toEqual({ error: '无效坐标' });
      });
    });

    describe('/inventory', () => {
      it('returns inventory from game status', async () => {
        const result = await handler.handleUserCommand('/inventory');
        expect(result).toEqual({ inventory: { items: ['dirt'] } });
      });
    });

    describe('/inv', () => {
      it('returns inventory (short form)', async () => {
        const result = await handler.handleUserCommand('/inv');
        expect(result).toEqual({ inventory: { items: ['dirt'] } });
      });
    });

    describe('/say', () => {
      it('calls game.chat with message', async () => {
        await handler.handleUserCommand('/say hello world');
        expect(mocks.game.chat).toHaveBeenCalledWith('hello world');
      });

      it('sanitizes the said message', async () => {
        await handler.handleUserCommand('/say hello <script>alert(1)</script>');
        expect(mocks.game.chat).toHaveBeenCalledWith('hello █>alert(1)</script>');
      });
    });

    describe('/whisper', () => {
      it('calls game.whisper with target and message', async () => {
        await handler.handleUserCommand('/whisper Player1 hello there');
        expect(mocks.game.whisper).toHaveBeenCalledWith('Player1', 'hello there');
      });

      it('sanitizes target player name', async () => {
        await handler.handleUserCommand('/whisper P@yer! hi');
        expect(mocks.game.whisper).toHaveBeenCalledWith('Pyer', 'hi');
      });

      it('returns error for missing target', async () => {
        const result = await handler.handleUserCommand('/whisper');
        expect(result).toEqual({ error: '用法: /whisper <玩家> <消息>' });
      });

      it('returns error for missing message', async () => {
        const result = await handler.handleUserCommand('/whisper Player1');
        expect(result).toEqual({ error: '用法: /whisper <玩家> <消息>' });
      });

      it('returns error for empty whisper message', async () => {
        const result = await handler.handleUserCommand('/whisper Player1 ');
        expect(result).toEqual({ error: '用法: /whisper <玩家> <消息>' });
      });
    });

    describe('/follow', () => {
      it('returns placeholder message', async () => {
        const result = await handler.handleUserCommand('/follow');
        expect(result).toEqual({ message: '跟随功能待实现' });
      });
    });

    describe('unknown command', () => {
      it('returns error', async () => {
        const result = await handler.handleUserCommand('/unknown');
        expect(result).toEqual({ error: '未知命令' });
      });

      it('returns error for non-command text', async () => {
        const result = await handler.handleUserCommand('just chatting');
        expect(result).toEqual({ error: '未知命令' });
      });
    });
  });

  describe('getGameStatus', () => {
    it('returns bot info, mood, and recent events', () => {
      handler.eventHistory.push(
        { type: 'hurt', data: {}, time: Date.now() - 2000 },
        { type: 'chat', data: {}, time: Date.now() - 1000 }
      );
      const status = handler.getGameStatus();
      expect(status.bot).toEqual({
        name: 'Bot', health: 20, food: 20,
        position: { x: 0, y: 64, z: 0 }, connected: true
      });
      expect(status.mood).toBe('neutral');
      expect(status.recentEvents).toHaveLength(2);
    });

    it('includes at most 5 recent events', () => {
      for (let i = 0; i < 10; i++) {
        handler.eventHistory.push({ type: 'e', data: {}, time: i });
      }
      const status = handler.getGameStatus();
      expect(status.recentEvents).toHaveLength(5);
    });
  });

  describe('getEventHistory', () => {
    it('returns the event history array', () => {
      expect(handler.getEventHistory()).toBe(handler.eventHistory);
    });
  });
});
