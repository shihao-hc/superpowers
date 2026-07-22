/**
 * OpenCode BrainSystem Hook
 * 自动在每次对话时调用BrainSystem核心功能
 */

const BrainSystem = require('../src/core/BrainSystem');

module.exports = {
  name: 'BrainSystem-Hook',
  version: '1.0.0',
  enabled: true,

  /**
   * 对话前处理
   * 在AI响应之前执行
   */
  async beforeResponse(context) {
    const { input } = context;

    // 1. 强制思考 - 分析输入
    const think = BrainSystem.forceThink?.(input) || {};

    // 2. 意图分析 - 理解用户真实意图
    const intent = BrainSystem.analyzeIntent?.(input) || {};

    // 3. 主动思考 - 生成建议和提问
    const proactive = BrainSystem.proactiveThink?.(input, {}) || {};

    // 4. 持久化 - 保存当前状态
    BrainSystem.autoPersist?.();

    // 返回增强的上下文
    return {
      ...context,
      brain: {
        enabled: true,
        version: '19.0',
        intent: intent.intent || null,
        intentConfidence: intent.confidence || 0,
        suggestions: intent.suggestions || [],
        questions: proactive.questions || [],
        metaQuestions: think.questions || []
      }
    };
  },

  /**
   * 对话后处理
   * 在AI响应之后执行
   */
  async afterResponse(context) {
    const { input, response } = context;

    // 1. 情感表达 - 检测并回应情感
    const emotion = BrainSystem.expressEmotion?.(input, response);

    // 2. 智能记忆 - 存储交互
    if (response) {
      BrainSystem.smartStore?.(`interaction_${Date.now()}`, {
        input,
        response: response.substring(0, 200)
      });
    }

    // 3. 学习交互 - 更新预测模型
    const intent = context.brain?.intent;
    BrainSystem.learnInteraction?.(input, intent);

    // 4. 记录进化
    BrainSystem.recordImprovement?.('interaction', input, {
      intent,
      emotion: emotion?.detected
    });

    return context;
  },

  /**
   * 错误处理
   */
  onError(error, context) {
    console.error('[BrainSystem-Hook] Error:', error.message);
    return context;
  }
};