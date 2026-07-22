const Emotion = require('../../src/core/Emotion');

describe('Emotion', () => {
  let emotion;

  beforeEach(() => {
    emotion = new Emotion({});
  });

  describe('constructor', () => {
    it('initializes with default emotion and energy', () => {
      expect(emotion.current).toBe('curious');
      expect(emotion.mood).toBe('neutral');
      expect(emotion.energy).toBe(80);
    });

    it('has all predefined emotions', () => {
      expect(Object.keys(emotion.emotions)).toEqual([
        'curious', 'focused', 'calm', 'hopeful', 'playful', 'careful', 'creative', 'analytical'
      ]);
    });
  });

  describe('setEmotion', () => {
    it('sets a valid emotion', () => {
      const result = emotion.setEmotion('focused');
      expect(result.success).toBe(true);
      expect(emotion.current).toBe('focused');
    });

    it('returns error for unknown emotion', () => {
      const result = emotion.setEmotion('unknown');
      expect(result.success).toBe(false);
    });
  });

  describe('_detectEmotion', () => {
    it('detects curious from keywords', () => {
      expect(emotion._detectEmotion('我想知道 why')).toBe('curious');
    });

    it('detects focused from keywords', () => {
      expect(emotion._detectEmotion('分析并 test')).toBe('focused');
    });

    it('detects playful from keywords', () => {
      expect(emotion._detectEmotion('这个很有趣')).toBe('playful');
    });

    it('detects careful from keywords', () => {
      expect(emotion._detectEmotion('小心 注意')).toBe('careful');
    });

    it('detects creative from keywords', () => {
      expect(emotion._detectEmotion('创造 新方法')).toBe('creative');
    });

    it('detects hopeful from keywords', () => {
      expect(emotion._detectEmotion('希望 期待')).toBe('hopeful');
    });

    it('returns current emotion when no match', () => {
      emotion.current = 'focused';
      expect(emotion._detectEmotion('nothing here')).toBe('focused');
    });
  });

  describe('_detectIntensity', () => {
    it('returns high for intensifiers', () => {
      expect(emotion._detectIntensity('非常 important')).toBe(0.9);
    });

    it('returns low for diminishers', () => {
      expect(emotion._detectIntensity('有点 interesting')).toBe(0.3);
    });

    it('returns medium by default', () => {
      expect(emotion._detectIntensity('normal text')).toBe(0.6);
    });
  });

  describe('_shiftEmotion', () => {
    it('increases energy for positive emotions', () => {
      emotion.energy = 50;
      emotion._shiftEmotion('creative');
      expect(emotion.energy).toBe(60);
      expect(emotion.mood).toBe('positive');
    });

    it('decreases energy for neutral emotions', () => {
      emotion.energy = 80;
      emotion._shiftEmotion('focused');
      expect(emotion.energy).toBe(75);
      expect(emotion.mood).toBe('neutral');
    });

    it('records shift in history', () => {
      emotion._shiftEmotion('focused');
      expect(emotion.history).toHaveLength(1);
      expect(emotion.history[0].from).toBe('curious');
      expect(emotion.history[0].to).toBe('focused');
    });
  });

  describe('adjustResponse', () => {
    it('adds extra for curious', () => {
      const resp = emotion.adjustResponse({ text: 'hello' });
      expect(resp.extra).toBe('这很有趣...');
      expect(resp.pace).toBe('slow');
    });

    it('sets fast pace for focused', () => {
      emotion.setEmotion('focused');
      const resp = emotion.adjustResponse({ text: 'hello' });
      expect(resp.pace).toBe('fast');
      expect(resp.clarity).toBe('high');
    });

    it('sets playful tone', () => {
      emotion.setEmotion('playful');
      const resp = emotion.adjustResponse({ text: 'hello' });
      expect(resp.tone).toBe('playful');
    });

    it('adds warning for careful', () => {
      emotion.setEmotion('careful');
      const resp = emotion.adjustResponse({ text: 'hello' });
      expect(resp.warning).toBe('需要考虑...');
      expect(resp.confidence).toBe('medium');
    });

    it('marks as alternative for creative', () => {
      emotion.setEmotion('creative');
      const resp = emotion.adjustResponse({ text: 'hello' });
      expect(resp.alternative).toBe(true);
      expect(resp.perspective).toBe('unusual');
    });

    it('sets structure for analytical', () => {
      emotion.setEmotion('analytical');
      const resp = emotion.adjustResponse({ text: 'hello' });
      expect(resp.structure).toBe('systematic');
      expect(resp.evidence).toBe(true);
    });

    it('preserves existing response properties', () => {
      const resp = emotion.adjustResponse({ text: 'hello', custom: true });
      expect(resp.text).toBe('hello');
      expect(resp.custom).toBe(true);
    });
  });

  describe('express', () => {
    it('returns preface and content with emotion', () => {
      const result = emotion.express('test content');
      expect(result.content).toBe('test content');
      expect(result.emotion).toBe('curious');
      expect(result.preface).toBeTruthy();
    });
  });

  describe('perceive', () => {
    it('detects emotion from input and records history', () => {
      const result = emotion.perceive('分析这个');
      expect(result.detected).toBe('focused');
      expect(emotion.history.length).toBeGreaterThanOrEqual(1);
      expect(emotion.history.some(h => h.detected === 'focused')).toBe(true);
    });
  });

  describe('getEmotionState', () => {
    it('returns current state', () => {
      const state = emotion.getEmotionState();
      expect(state.current).toBe('curious');
      expect(state.expression).toBe('思考');
    });
  });

  describe('getHistory', () => {
    it('returns last 10 entries', () => {
      for (let i = 0; i < 15; i++) emotion.history.push({ i });
      expect(emotion.getHistory()).toHaveLength(10);
    });
  });

  describe('diagnose', () => {
    it('returns diagnosis', () => {
      const diag = emotion.diagnose();
      expect(diag.current).toBe('curious');
      expect(diag.mood).toBe('neutral');
    });
  });

  describe('coverage edge cases', () => {
    it('perceive skips shift when emotion unchanged', () => {
      emotion.current = 'curious';
      emotion.perceive('好奇 why');
      expect(emotion.current).toBe('curious');
    });

    it('express handles emotion missing from expressions', () => {
      emotion.current = 'calm';
      const result = emotion.express('test');
      expect(result.emotion).toBe('calm');
      expect(result.preface).toBeUndefined();
    });

    it('_detectEmotion detects analytical', () => {
      expect(emotion._detectEmotion('为什么这样')).toBe('analytical');
    });

    it('_detectEmotion detects frustrated', () => {
      expect(emotion._detectEmotion('生气')).toBe('frustrated');
    });

    it('_shiftEmotion handles emotion not in any energy group', () => {
      emotion.energy = 80;
      emotion.mood = 'neutral';
      emotion._shiftEmotion('playful');
      expect(emotion.energy).toBe(80);
      expect(emotion.mood).toBe('neutral');
    });
  });
});
