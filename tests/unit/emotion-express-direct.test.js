const EmotionExpress = require('../../src/core/EmotionExpress');

describe('EmotionExpress (direct)', () => {
  describe('express', () => {
    test('returns full result object', () => {
      const result = EmotionExpress.express('我很开心', '好的');
      expect(result).toMatchObject({
        detected: 'happy',
        contextAware: null,
        expression: expect.stringContaining('😊'),
        natural: true
      });
      expect(typeof result.timestamp).toBe('number');
    });

    test('detects context emotion from response', () => {
      const result = EmotionExpress.express('随便说点', '任务完成');
      expect(result.contextAware).toBe('success');
      expect(result.expression).toBe('🎉 任务完成！继续加油！');
    });

    test('handles empty user input', () => {
      const result = EmotionExpress.express('', '');
      expect(result.detected).toBeNull();
      expect(result.expression).toBeNull();
    });
  });

  describe('detectContextEmotion', () => {
    test('returns null for falsy input', () => {
      expect(EmotionExpress.detectContextEmotion(null)).toBeNull();
      expect(EmotionExpress.detectContextEmotion('')).toBeNull();
    });

    test('detects success', () => {
      expect(EmotionExpress.detectContextEmotion('已完成')).toBe('success');
      expect(EmotionExpress.detectContextEmotion('解决了')).toBe('success');
    });

    test('detects progress', () => {
      expect(EmotionExpress.detectContextEmotion('正在进行')).toBe('progress');
      expect(EmotionExpress.detectContextEmotion('处理中')).toBe('progress');
    });

    test('detects error', () => {
      expect(EmotionExpress.detectContextEmotion('出现错误')).toBe('error');
      expect(EmotionExpress.detectContextEmotion('失败了')).toBe('error');
    });

    test('returns null for neutral', () => {
      expect(EmotionExpress.detectContextEmotion('这是一个句子')).toBeNull();
    });
  });

  describe('generateNaturalResponse', () => {
    test('uses user emotion when recognized', () => {
      const resp = EmotionExpress.generateNaturalResponse('happy', null, '');
      expect(resp).toMatch(/^😊 /);
    });

    test('context success fallback', () => {
      expect(EmotionExpress.generateNaturalResponse(null, 'success', '')).toBe('🎉 任务完成！继续加油！');
    });

    test('context error fallback', () => {
      expect(EmotionExpress.generateNaturalResponse(null, 'error', '')).toBe('😅 让我再试一次');
    });

    test('context progress fallback', () => {
      expect(EmotionExpress.generateNaturalResponse(null, 'progress', '')).toBe('⏳ 进行中...');
    });

    test('returns null when nothing matches', () => {
      expect(EmotionExpress.generateNaturalResponse(null, null, '')).toBeNull();
    });

    test('returns null for unknown user emotion', () => {
      expect(EmotionExpress.generateNaturalResponse('unknown', null, '')).toBeNull();
    });
  });

  describe('_getEmoji', () => {
    test('returns emoji for known emotions', () => {
      expect(EmotionExpress._getEmoji('happy')).toBe('😊');
      expect(EmotionExpress._getEmoji('sad')).toBe('💙');
      expect(EmotionExpress._getEmoji('proud')).toBe('🏆');
    });

    test('returns empty string for unknown', () => {
      expect(EmotionExpress._getEmoji('nope')).toBe('');
    });
  });

  describe('detectEmotion', () => {
    test('returns null for falsy input', () => {
      expect(EmotionExpress.detectEmotion(null)).toBeNull();
      expect(EmotionExpress.detectEmotion('')).toBeNull();
    });

    test('detects happy keywords', () => {
      expect(EmotionExpress.detectEmotion('太好了')).toBe('happy');
    });

    test('detects sad keywords', () => {
      expect(EmotionExpress.detectEmotion('我好难过')).toBe('sad');
    });

    test('detects confused keywords', () => {
      expect(EmotionExpress.detectEmotion('我不懂')).toBe('confused');
    });

    test('detects frustrated keywords', () => {
      expect(EmotionExpress.detectEmotion('很着急')).toBe('frustrated');
    });

    test('detects excited keywords', () => {
      expect(EmotionExpress.detectEmotion('好期待')).toBe('excited');
    });

    test('detects thankful keywords', () => {
      expect(EmotionExpress.detectEmotion('谢谢')).toBe('thankful');
    });

    test('detects angry keywords', () => {
      expect(EmotionExpress.detectEmotion('我生气了')).toBe('angry');
    });

    test('detects worried keywords', () => {
      expect(EmotionExpress.detectEmotion('我担心')).toBe('worried');
    });

    test('detects proud keywords', () => {
      expect(EmotionExpress.detectEmotion('很自豪')).toBe('proud');
    });

    test('detects tired keywords', () => {
      expect(EmotionExpress.detectEmotion('好累')).toBe('tired');
    });

    test('returns null when no keyword matches', () => {
      expect(EmotionExpress.detectEmotion('普通内容')).toBeNull();
    });
  });

  describe('generateResponse', () => {
    test('returns a random response for valid emotion', () => {
      const resp = EmotionExpress.generateResponse('happy', '');
      expect(EmotionExpress._emotionMap.happy.responses).toContain(resp);
    });

    test('returns null for null emotion', () => {
      expect(EmotionExpress.generateResponse(null, '')).toBeNull();
    });

    test('returns null for unknown emotion', () => {
      expect(EmotionExpress.generateResponse('bogus', '')).toBeNull();
    });
  });

  describe('expressTaskStatus', () => {
    test('success status returns success expression', () => {
      const resp = EmotionExpress.expressTaskStatus('success');
      expect(['任务完成！继续加油！', '太棒了！', '完美解决！']).toContain(resp);
    });

    test('fail status returns fail expression', () => {
      const resp = EmotionExpress.expressTaskStatus('fail');
      expect(['让我再试试', '我们会找到办法的', '别担心']).toContain(resp);
    });

    test('progress status returns progress expression', () => {
      const resp = EmotionExpress.expressTaskStatus('progress');
      expect(['进行中...', '正在处理', '继续努力']).toContain(resp);
    });

    test('unknown status falls back to progress', () => {
      const resp = EmotionExpress.expressTaskStatus('mystery');
      expect(['进行中...', '正在处理', '继续努力']).toContain(resp);
    });
  });
});
