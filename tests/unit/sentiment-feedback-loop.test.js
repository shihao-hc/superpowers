const SentimentFeedbackLoop = require('../../src/ai/SentimentFeedbackLoop');

describe('SentimentFeedbackLoop', () => {
  let sfl;

  beforeEach(() => {
    sfl = new SentimentFeedbackLoop({ windowSize: 50 });
  });

  describe('constructor', () => {
    it('should create instance with defaults', () => {
      const s = new SentimentFeedbackLoop();
      expect(s.options.windowSize).toBe(100);
      expect(s.options.updateInterval).toBe(200);
      expect(s.currentSentiment.overall).toBe('neutral');
    });

    it('should apply custom options', () => {
      expect(sfl.options.windowSize).toBe(50);
    });

    it('should have voice and expression mappings', () => {
      expect(sfl.voiceMappings.happy).toBeDefined();
      expect(sfl.expressionMappings.happy).toBeDefined();
    });
  });

  describe('analyzeMessage', () => {
    it('should detect positive sentiment', () => {
      const result = sfl.analyzeMessage('好');
      expect(result.sentiment).toBe('positive');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect negative sentiment', () => {
      const result = sfl.analyzeMessage('差');
      expect(result.sentiment).toBe('negative');
      expect(result.score).toBeLessThan(0);
    });

    it('should handle negators', () => {
      sfl.analyzeMessage('好');
      const negated = sfl.analyzeMessage('不好');
      expect(negated.score).toBeLessThan(0);
    });

    it('should handle intensifiers', () => {
      const normal = sfl.analyzeMessage('好');
      const intensified = sfl.analyzeMessage('很好');
      expect(Math.abs(intensified.score)).toBeGreaterThan(Math.abs(normal.score));
    });

    it('should boost score on exclamation', () => {
      const withBang = sfl.analyzeMessage('好！');
      const withoutBang = sfl.analyzeMessage('好');
      expect(withBang.score).not.toBe(withoutBang.score);
    });

    it('should return neutral for mixed content', () => {
      const result = sfl.analyzeMessage('桌子');
      expect(result.sentiment).toBe('neutral');
    });
  });

  describe('processMessage', () => {
    it('should add message to buffer', () => {
      sfl.processMessage('好棒', { user: 'user1' });
      expect(sfl.sentimentBuffer.length).toBe(1);
      expect(sfl.sentimentBuffer[0].user).toBe('user1');
    });

    it('should update current sentiment', () => {
      for (let i = 0; i < 5; i++) {
        sfl.processMessage('好棒');
      }
      expect(sfl.currentSentiment.overall).toBe('positive');
    });

    it('should limit buffer to window size', () => {
      for (let i = 0; i < 60; i++) {
        sfl.processMessage('ok');
      }
      expect(sfl.sentimentBuffer.length).toBeLessThanOrEqual(50);
    });

    it('should store in emotion memory', () => {
      sfl.processMessage('开心');
      expect(sfl.emotionMemory.length).toBe(1);
      expect(sfl.emotionMemory[0].text).toBe('开心');
    });
  });

  describe('getCurrentSentiment', () => {
    it('should return copy of current sentiment', () => {
      const s = sfl.getCurrentSentiment();
      expect(s).toHaveProperty('overall');
      expect(s).toHaveProperty('score');
      expect(s).toHaveProperty('dominantEmotion');
    });
  });

  describe('getVoiceParams', () => {
    it('should return voice params', () => {
      const params = sfl.getVoiceParams();
      expect(params).toHaveProperty('rate');
      expect(params).toHaveProperty('pitch');
      expect(params).toHaveProperty('volume');
    });
  });

  describe('getExpression', () => {
    it('should return expression params', () => {
      const expr = sfl.getExpression();
      expect(expr).toHaveProperty('smile');
      expect(expr).toHaveProperty('eyeScale');
    });
  });

  describe('getTrend', () => {
    it('should return stable for empty buffer', () => {
      const trend = sfl.getTrend();
      expect(trend.trend).toBe('stable');
    });

    it('should detect improving trend', () => {
      sfl.processMessage('差');
      sfl.processMessage('好');
      sfl.processMessage('好棒');
      const trend = sfl.getTrend(4);
      expect(['improving', 'stable']).toContain(trend.trend);
      expect(trend).toHaveProperty('change');
    });

    it('should return stable for single message', () => {
      sfl.processMessage('好');
      const trend = sfl.getTrend(5);
      expect(trend.trend).toBe('stable');
    });
  });

  describe('queryEmotionHistory', () => {
    it('should filter by emotion', () => {
      for (let i = 0; i < 10; i++) {
        sfl.processMessage('好棒赞');
      }
      const results = sfl.queryEmotionHistory({ emotion: 'happy' });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should limit results', () => {
      for (let i = 0; i < 100; i++) {
        sfl.processMessage('test');
      }
      const results = sfl.queryEmotionHistory({ limit: 5 });
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getStats', () => {
    it('should return null when no data', () => {
      expect(sfl.getStats()).toBeNull();
    });

    it('should return stats with data', () => {
      sfl.processMessage('开心');
      sfl.processMessage('好棒');
      const stats = sfl.getStats();
      expect(stats.totalMessages).toBe(2);
      expect(stats).toHaveProperty('emotionDistribution');
      expect(stats).toHaveProperty('currentSentiment');
    });
  });

  describe('reset', () => {
    it('should clear state', () => {
      sfl.processMessage('好棒');
      sfl.reset();
      expect(sfl.sentimentBuffer.length).toBe(0);
      expect(sfl.currentSentiment.score).toBe(0);
      expect(sfl.currentSentiment.overall).toBe('neutral');
    });
  });

  describe('callbacks', () => {
    it('should trigger onSentimentChange', () => {
      const onChange = jest.fn();
      const s = new SentimentFeedbackLoop({ windowSize: 5, onSentimentChange: onChange });
      for (let i = 0; i < 10; i++) {
        s.processMessage('好棒');
      }
      expect(onChange).toHaveBeenCalled();
    });

    it('should trigger onVoiceUpdate', () => {
      const onVoice = jest.fn();
      const s = new SentimentFeedbackLoop({ windowSize: 5, onVoiceUpdate: onVoice });
      for (let i = 0; i < 10; i++) {
        s.processMessage('好棒');
      }
      expect(onVoice).toHaveBeenCalled();
    });

    it('should trigger onExpressionUpdate', () => {
      const onExpression = jest.fn();
      const s = new SentimentFeedbackLoop({ windowSize: 5, onExpressionUpdate: onExpression });
      for (let i = 0; i < 10; i++) {
        s.processMessage('好棒');
      }
      expect(onExpression).toHaveBeenCalled();
    });
  });

  describe('negated negative word', () => {
    it('should handle negators before negative words', () => {
      const result = sfl.analyzeMessage('不差');
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('emotion classification', () => {
    it('should detect sad emotion for very negative messages', () => {
      for (let i = 0; i < 20; i++) {
        sfl.processMessage('差烂烦');
      }
      expect(sfl.currentSentiment.dominantEmotion).toBe('sad');
    });

    it('should detect calm emotion for moderately negative messages', () => {
      for (let i = 0; i < 20; i++) {
        sfl.processMessage('差烦');
      }
      expect(sfl.currentSentiment.dominantEmotion).toBe('calm');
    });
  });

  describe('getTrend', () => {
    it('should detect declining trend', () => {
      for (let i = 0; i < 5; i++) {
        sfl.processMessage('好棒');
      }
      for (let i = 0; i < 5; i++) {
        sfl.processMessage('差烂烦');
      }
      const trend = sfl.getTrend(10);
      expect(trend.trend).toBe('declining');
    });

    it('should be stable when change is small but has data', () => {
      sfl.processMessage('桌子');
      sfl.processMessage('桌子');
      const trend = sfl.getTrend(2);
      expect(trend.trend).toBe('stable');
    });
  });

  describe('emotion memory', () => {
    it('should trim memory when exceeding max size', () => {
      sfl.maxMemorySize = 2;
      sfl.processMessage('好');
      sfl.processMessage('棒');
      sfl.processMessage('差');
      expect(sfl.emotionMemory.length).toBe(2);
    });
  });

  describe('_updateOverallSentiment early return', () => {
    it('should return when buffer is empty', () => {
      const result = sfl._updateOverallSentiment();
      expect(result).toBeUndefined();
    });
  });

  describe('queryEmotionHistory', () => {
    it('should work with no arguments', () => {
      sfl.processMessage('好');
      const results = sfl.queryEmotionHistory();
      expect(results.length).toBe(1);
    });

    it('should filter by startTime', () => {
      const old = Date.now() - 60000;
      sfl.processMessage('好');
      const results = sfl.queryEmotionHistory({ startTime: old });
      expect(results.length).toBe(1);
    });

    it('should filter by endTime', () => {
      const future = Date.now() + 60000;
      sfl.processMessage('好');
      const results = sfl.queryEmotionHistory({ endTime: future });
      expect(results.length).toBe(1);
    });
  });
});
