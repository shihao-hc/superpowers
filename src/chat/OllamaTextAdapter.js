/**
 * OllamaTextAdapter - 适配 ChatWebSocketHandler 的 LLM 接口
 *
 * ChatWebSocketHandler 期望 adapter.generate(stringPrompt, options) → Promise<string>
 * 此适配器用 OllamaBridge.chat(messages, options) 实现该接口
 */

const { OllamaBridge } = require('../localInferencing/OllamaBridge');

class OllamaTextAdapter {
  constructor(bridge = null) {
    this.bridge = bridge || new OllamaBridge();
  }

  async generate(prompt, options = {}) {
    const result = await this.bridge.chat([
      { role: 'system', content: '你是一个乐于助人的中文 AI 助手。' },
      { role: 'user', content: String(prompt || '') }
    ], {
      model: options.model || 'llama3.2',
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens || 1000
    });

    if (!result || !result.ok || !result.text) {
      throw new Error('LLM empty response');
    }

    return result.text;
  }
}

module.exports = { OllamaTextAdapter };