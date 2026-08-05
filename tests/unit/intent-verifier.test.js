const { verifyIntent } = require('../../src/core/IntentVerifier');

describe('src/core/IntentVerifier', () => {
  describe('verifyIntent', () => {
    describe('check 1 - definition question', () => {
      test('passes when answer contains a definition keyword', () => {
        const result = verifyIntent('什么是AI大脑', 'AI大脑是一种模拟人类认知的系统');
        expect(result.valid).toBe(true);
        expect(result.issues).toEqual([]);
      });

      test('passes when answer contains 定义', () => {
        const result = verifyIntent('什么是意识', '意识可以被定义为主体对自身存在的感知');
        expect(result.valid).toBe(true);
      });

      test('fails when answer lacks a definition keyword', () => {
        const result = verifyIntent('什么是AI大脑', '它可以检查各种状态');
        expect(result.valid).toBe(false);
        expect(result.issues).toContain('回答缺少定义');
      });

      test('does not run check 1 when question has no 什么...是 pattern', () => {
        const result = verifyIntent('请介绍一下自己', '你好，我是助手');
        expect(result.valid).toBe(true);
        expect(result.issues).toEqual([]);
      });
    });

    describe('check 2 - AI brain / consciousness question', () => {
      test('passes when answer uses definition wording', () => {
        const result = verifyIntent('你的AI大脑是什么', 'AI大脑的核心本质是规则驱动的推理引擎');
        expect(result.valid).toBe(true);
      });

      test('fails when answer uses forbidden 检查 wording', () => {
        const result = verifyIntent('AI大脑是什么', '我通过检查各项指标来工作');
        expect(result.valid).toBe(false);
        expect(result.issues).toContain('用检查代替了AI大脑定义');
      });

      test('passes when question has no AI brain pattern', () => {
        const result = verifyIntent('今天天气怎么样', '检查结果显示晴天');
        expect(result.valid).toBe(true);
      });
    });

    describe('both checks / aggregation', () => {
      test('aggregates issues from both checks', () => {
        const result = verifyIntent('什么是AI大脑', '我会检查系统状态');
        expect(result.valid).toBe(false);
        expect(result.issues).toEqual(['回答缺少定义', '用检查代替了AI大脑定义']);
      });
    });

    describe('edge cases', () => {
      test('handles empty answer gracefully', () => {
        const result = verifyIntent('什么是AI大脑', '');
        expect(result.valid).toBe(false);
        expect(result.issues.length).toBeGreaterThan(0);
      });

      test('is case-insensitive', () => {
        const result = verifyIntent('AI Brain是什么', '这是对大脑的定义');
        expect(result.valid).toBe(true);
      });

      test('returns valid true for unrelated question and answer', () => {
        const result = verifyIntent('如何提升性能', '优化缓存和数据库查询');
        expect(result.valid).toBe(true);
      });
    });
  });
});
