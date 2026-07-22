const ContinuousInferenceSystem = require('../../src/ai/ContinuousInferenceSystem');

describe('ContinuousInferenceSystem', () => {
  let cis;

  beforeEach(() => {
    jest.useFakeTimers();
    cis = new ContinuousInferenceSystem({ inferenceInterval: 50, maxThinkingTime: 1000 });
  });

  afterEach(() => {
    cis.stop();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create instance with defaults', () => {
      const c = new ContinuousInferenceSystem();
      expect(c.options.inferenceInterval).toBe(100);
      expect(c.options.enableEmergence).toBe(true);
      expect(c.isRunning).toBe(false);
      expect(c.thoughtStream).toEqual([]);
    });

    it('should apply custom options', () => {
      expect(cis.options.inferenceInterval).toBe(50);
    });

    it('should have persona layer', () => {
      expect(cis.personaLayer.traits.curiosity).toBe(0.7);
      expect(cis.personaLayer.boundaries.profanity).toBe(false);
    });
  });

  describe('start / stop', () => {
    it('should start inference loop', () => {
      cis.start();
      expect(cis.isRunning).toBe(true);
      expect(cis.inferenceLoop).toBeDefined();
    });

    it('should stop inference loop', () => {
      cis.start();
      cis.stop();
      expect(cis.isRunning).toBe(false);
      expect(cis.inferenceLoop).toBeNull();
    });

    it('should not double-start', () => {
      cis.start();
      const loop = cis.inferenceLoop;
      cis.start();
      expect(cis.inferenceLoop).toBe(loop);
    });
  });

  describe('receiveInput', () => {
    it('should add message to chat', () => {
      cis.receiveInput({ text: 'hello', user: 'user1' });
      expect(cis.environment.chatMessages.length).toBe(1);
      expect(cis.environment.chatMessages[0].text).toBe('hello');
    });

    it('should limit chat messages to 1000', () => {
      for (let i = 0; i < 1001; i++) {
        cis.receiveInput({ text: `msg-${i}`, user: 'u' });
      }
      expect(cis.environment.chatMessages.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('updateEnvironment', () => {
    it('should update viewer count', () => {
      cis.updateEnvironment({ viewerCount: 500 });
      expect(cis.environment.viewerCount).toBe(500);
    });

    it('should push game events', () => {
      cis.updateEnvironment({ gameEvent: 'kill' });
      expect(cis.environment.gameEvents.length).toBe(1);
    });
  });

  describe('_analyzeSentiment', () => {
    it('should detect positive sentiment', () => {
      expect(cis._analyzeSentiment('真棒')).toBe('positive');
      expect(cis._analyzeSentiment('awesome')).toBe('positive');
    });

    it('should detect negative sentiment', () => {
      expect(cis._analyzeSentiment('真无聊')).toBe('negative');
      expect(cis._analyzeSentiment('讨厌')).toBe('negative');
    });

    it('should detect questions', () => {
      expect(cis._analyzeSentiment('为什么？')).toBe('curious');
    });

    it('should return neutral for unknown', () => {
      expect(cis._analyzeSentiment('桌子')).toBe('neutral');
    });
  });

  describe('_extractTopics', () => {
    it('should extract game topics', () => {
      const topics = cis._extractTopics('我爱玩Minecraft');
      expect(topics).toContain('game');
    });

    it('should extract music topics', () => {
      expect(cis._extractTopics('听歌')).toContain('music');
    });
  });

  describe('_absorbEmotion', () => {
    it('should amplify matching emotion', () => {
      cis._absorbEmotion('positive', 0.2);
      expect(cis.emotionState.current).toBe('happy');
      expect(cis.emotionState.intensity).toBeCloseTo(0.2);
    });

    it('should store emotion history', () => {
      cis._absorbEmotion('positive', 0.5);
      expect(cis.emotionState.history.length).toBe(1);
    });
  });

  describe('_updateEmotion', () => {
    it('should decay intensity', () => {
      cis.emotionState.intensity = 0.8;
      cis._updateEmotion();
      expect(cis.emotionState.intensity).toBeLessThan(0.8);
    });

    it('should reset to neutral when low', () => {
      cis.emotionState.current = 'happy';
      cis.emotionState.intensity = 0.05;
      cis._updateEmotion();
      expect(cis.emotionState.current).toBe('neutral');
      expect(cis.emotionState.intensity).toBe(0.1);
    });
  });

  describe('_generateThought', () => {
    it('should generate and store thought', () => {
      cis._generateThought();
      expect(cis.thoughtStream.length).toBe(1);
      expect(cis.thoughtStream[0].emotion).toBe('neutral');
    });

    it('should limit thought stream to 100', () => {
      for (let i = 0; i < 101; i++) {
        cis._generateThought();
      }
      expect(cis.thoughtStream.length).toBeLessThanOrEqual(100);
    });
  });

  describe('_addThought', () => {
    it('should add thought with timestamp', () => {
      cis._addThought({ type: 'pattern', content: 'test', priority: 0.8 });
      expect(cis.thoughtStream.length).toBe(1);
      expect(cis.thoughtStream[0].timestamp).toBeGreaterThan(0);
    });
  });

  describe('_applyPersonaLayer', () => {
    it('should filter negative content', () => {
      cis.personaLayer.boundaries.negativity = 0;
      const result = cis._applyPersonaLayer('我讨厌这个');
      expect(result).not.toContain('讨厌');
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      const state = cis.getState();
      expect(state).toHaveProperty('emotion');
      expect(state).toHaveProperty('persona');
      expect(state).toHaveProperty('thoughts');
      expect(state).toHaveProperty('environment');
    });
  });

  describe('timer loop — _perceiveEnvironment + _detectSpecialEvents', () => {
    it('should process chat messages and absorb non-neutral sentiment', () => {
      cis.receiveInput({ text: '真棒啊哈哈', user: 'u1' });
      cis.receiveInput({ text: '可爱喜欢棒', user: 'u2' });
      cis.receiveInput({ text: '厉害awesome', user: 'u3' });
      cis.start();
      jest.advanceTimersByTime(50);
      expect(cis.emotionState.current).toBe('happy');
    });

    it('should extract topics from chat and deduplicate', () => {
      cis.receiveInput({ text: '玩Minecraft好开心', user: 'u1' });
      cis.receiveInput({ text: 'Minecraft真好玩', user: 'u2' });
      cis.start();
      jest.advanceTimersByTime(50);
      expect(cis.environment.recentTopics).toContain('game');
      const gameCount = cis.environment.recentTopics.filter((t) => t === 'game').length;
      expect(gameCount).toBe(1);
    });

    it('should extract multiple topic patterns', () => {
      cis.receiveInput({ text: '听歌好开心', user: 'u1' });
      cis.receiveInput({ text: '这代码太难了', user: 'u2' });
      cis.receiveInput({ text: '今天心情好', user: 'u3' });
      cis.start();
      jest.advanceTimersByTime(50);
      expect(cis.environment.recentTopics).toContain('music');
      expect(cis.environment.recentTopics).toContain('tech');
      expect(cis.environment.recentTopics).toContain('emotion');
    });

    it('should trigger special event when viewer count > 1000', () => {
      cis.updateEnvironment({ viewerCount: 1500 });
      cis.start();
      jest.advanceTimersByTime(50);
      expect(cis.emotionState.current).toBe('happy');
    });

    it('should add pattern thought when 3+ recent questions', () => {
      for (let i = 0; i < 5; i++) {
        cis.receiveInput({ text: '为什么呢？', user: 'u' });
      }
      cis.start();
      jest.advanceTimersByTime(50);
      const patternThought = cis.thoughtStream.find((t) => t.type === 'pattern');
      expect(patternThought).toBeDefined();
      expect(patternThought.priority).toBe(0.7);
    });

    it('should skip perceive when loop fires after stop', () => {
      cis.start();
      cis.stop();
      const snapshot = { ...cis.emotionState };
      jest.advanceTimersByTime(200);
      expect(cis.emotionState.intensity).toBe(snapshot.intensity);
    });

    it('should handle neutral chat without absorbing emotion', () => {
      cis.receiveInput({ text: '一张桌子', user: 'u1' });
      cis.start();
      jest.advanceTimersByTime(50);
      expect(cis.emotionState.current).toBe('neutral');
    });
  });

  describe('_absorbEmotion — same emotion amplification', () => {
    it('should amplify when target matches current', () => {
      cis.emotionState.current = 'happy';
      cis.emotionState.intensity = 0.4;
      cis._absorbEmotion('positive', 0.2);
      expect(cis.emotionState.current).toBe('happy');
      expect(cis.emotionState.intensity).toBeCloseTo(0.6);
    });

    it('should cap intensity at 1', () => {
      cis.emotionState.current = 'happy';
      cis.emotionState.intensity = 0.95;
      cis._absorbEmotion('positive', 0.2);
      expect(cis.emotionState.intensity).toBe(1);
    });

    it('should truncate emotion history when > 100', () => {
      for (let i = 0; i < 105; i++) {
        cis._absorbEmotion(i % 2 === 0 ? 'positive' : 'negative', 0.1);
      }
      expect(cis.emotionState.history.length).toBe(100);
    });

    it('should shift to different emotion', () => {
      cis.emotionState.current = 'happy';
      cis.emotionState.intensity = 0.8;
      cis._absorbEmotion('negative', 0.3);
      expect(cis.emotionState.current).toBe('sad');
      expect(cis.emotionState.intensity).toBe(0.3);
    });

    it('should map neutral to current emotion', () => {
      cis.emotionState.current = 'curious';
      cis._absorbEmotion('neutral', 0.1);
      expect(cis.emotionState.current).toBe('curious');
    });
  });

  describe('_checkEmergence', () => {
    it('should return early when emergence disabled', () => {
      cis.options.enableEmergence = false;
      cis.emotionState.intensity = 0.9;
      cis._addThought({ type: 'internal', content: 'test', priority: 0.5 });
      cis._checkEmergence();
      expect(cis.thoughtStream.length).toBe(1);
    });

    it('should not emerge when intensity too low', () => {
      cis.emotionState.intensity = 0.3;
      cis._addThought({ type: 'internal', content: 'test', priority: 0.5 });
      const len = cis.thoughtStream.length;
      cis._checkEmergence();
      expect(cis.thoughtStream.length).toBe(len);
    });

    it('should not emerge when thought stream empty', () => {
      cis.emotionState.intensity = 0.8;
      cis._checkEmergence();
      expect(cis.thoughtStream.length).toBe(0);
    });

    it('should trigger emergence when all conditions met (mock random)', () => {
      cis.emotionState.intensity = 0.8;
      cis._addThought({ type: 'internal', content: 'test', priority: 0.5 });
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.005)
        .mockReturnValueOnce(0);
      cis._checkEmergence();
      const emergence = cis.thoughtStream.find((t) => t.type === 'emergence');
      expect(emergence).toBeDefined();
      spy.mockRestore();
    });
  });

  describe('_triggerEmergence — weighted random action selection', () => {
    it('should trigger existential_question (weight 0.2)', () => {
      const spy = jest.spyOn(Math, 'random').mockImplementation(() => 0.05);
      cis._triggerEmergence();
      const t = cis.thoughtStream.find((t) => t.action === 'existential_question');
      expect(t).toBeDefined();
      expect(t.content).toBeTruthy();
      spy.mockRestore();
    });

    it('should trigger unexpected_joke (weight 0.3)', () => {
      const spy = jest.spyOn(Math, 'random').mockImplementation(() => 0.35);
      cis._triggerEmergence();
      const t = cis.thoughtStream.find((t) => t.action === 'unexpected_joke');
      expect(t).toBeDefined();
      spy.mockRestore();
    });

    it('should trigger deep_topic (weight 0.3)', () => {
      const spy = jest.spyOn(Math, 'random').mockImplementation(() => 0.65);
      cis._triggerEmergence();
      const t = cis.thoughtStream.find((t) => t.action === 'deep_topic');
      expect(t).toBeDefined();
      spy.mockRestore();
    });

    it('should trigger emotional_expression (weight 0.2)', () => {
      const spy = jest.spyOn(Math, 'random').mockImplementation(() => 0.95);
      cis._triggerEmergence();
      const t = cis.thoughtStream.find((t) => t.action === 'emotional_expression');
      expect(t).toBeDefined();
      spy.mockRestore();
    });

    it('should call all emergence helpers directly', () => {
      expect(typeof cis._generateExistentialThought()).toBe('string');
      expect(typeof cis._generateSpontaneousJoke()).toBe('string');
      expect(typeof cis._pivotToDeepTopic()).toBe('string');
      expect(typeof cis._expressInnerEmotion()).toBe('string');
    });
  });

  describe('_decideAction', () => {
    it('should emit proactive_speech when high intensity + random < 0.05', () => {
      cis.emotionState.intensity = 0.7;
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.03);
      cis._decideAction();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('proactive_speech'),
        expect.any(Object)
      );
      spy.mockRestore();
      logSpy.mockRestore();
    });

    it('should emit when thought has priority > 0.8', () => {
      cis._addThought({ type: 'emergence', content: 'deep', priority: 0.9 });
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.02);
      cis._decideAction();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('proactive_speech'),
        expect.any(Object)
      );
      spy.mockRestore();
      logSpy.mockRestore();
    });

    it('should not emit when random too high', () => {
      cis.emotionState.intensity = 0.8;
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.9);
      cis._decideAction();
      const proactiveCalls = logSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('proactive_speech')
      );
      expect(proactiveCalls.length).toBe(0);
      spy.mockRestore();
      logSpy.mockRestore();
    });

    it('should use fallback thought when no high-priority thought found', () => {
      cis.emotionState.intensity = 0.7;
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.03)
        .mockReturnValue(0.8);
      cis._decideAction();
      expect(logSpy).toHaveBeenCalled();
      spy.mockRestore();
      logSpy.mockRestore();
    });

    it('should not emit when intensity <= 0.6 and no high priority thought', () => {
      cis.emotionState.intensity = 0.4;
      cis._addThought({ type: 'internal', content: 'x', priority: 0.5 });
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      cis._decideAction();
      const proactiveCalls = logSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('proactive_speech')
      );
      expect(proactiveCalls.length).toBe(0);
      logSpy.mockRestore();
    });
  });

  describe('_applyPersonaLayer — append exclamation', () => {
    it('should append exclamation mark based on speech pattern', () => {
      const spy = jest.spyOn(Math, 'random')
        .mockImplementationOnce(() => 0.1)
        .mockImplementationOnce(() => 0.9);
      const result = cis._applyPersonaLayer('hello');
      expect(result).toBe('hello！');
      spy.mockRestore();
    });

    it('should skip exclamation when random too high', () => {
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.9);
      const result = cis._applyPersonaLayer('hello');
      expect(result).not.toContain('hello!');
      expect(result).toBe('hello');
      spy.mockRestore();
    });

    it('should not filter negativity when threshold >= 0.5', () => {
      cis.personaLayer.boundaries.negativity = 0.6;
      const result = cis._applyPersonaLayer('我讨厌这个');
      expect(result).toContain('讨厌');
    });
  });

  describe('updateEnvironment — partial updates', () => {
    it('should update streamDuration', () => {
      cis.updateEnvironment({ streamDuration: 300 });
      expect(cis.environment.streamDuration).toBe(300);
    });

    it('should keep streamDuration when not provided', () => {
      cis.updateEnvironment({ streamDuration: 300 });
      cis.updateEnvironment({ viewerCount: 10 });
      expect(cis.environment.streamDuration).toBe(300);
    });

    it('should handle undefined viewerCount gracefully', () => {
      cis.updateEnvironment({ gameEvent: 'win' });
      expect(cis.environment.viewerCount).toBe(0);
    });
  });

  describe('full loop integration', () => {
    it('should run multiple loop ticks', () => {
      cis.start();
      jest.advanceTimersByTime(200);
      expect(cis.thoughtStream.length).toBeGreaterThan(0);
    });

    it('should handle loop error without crashing', () => {
      cis.receiveInput({ text: 'test', user: 'u' });
      jest.spyOn(cis, '_perceiveEnvironment').mockImplementation(() => { throw new Error('boom'); });
      cis.start();
      expect(() => jest.advanceTimersByTime(50)).not.toThrow();
    });
  });
});
