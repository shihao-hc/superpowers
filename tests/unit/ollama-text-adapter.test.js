const { OllamaTextAdapter } = require('../../src/chat/OllamaTextAdapter');

describe('OllamaTextAdapter', () => {
  it('implements generate(prompt, options) returning string', async () => {
    const mockBridge = { chat: jest.fn().mockResolvedValue({ ok: true, text: 'AI 回复' }) };
    const adapter = new OllamaTextAdapter(mockBridge);
    const result = await adapter.generate('User: hi\nAssistant:', { model: 'm', temperature: 0.5, maxTokens: 200 });
    expect(result).toBe('AI 回复');
    expect(mockBridge.chat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user', content: 'User: hi\nAssistant:' })
      ]),
      expect.objectContaining({ model: 'm', temperature: 0.5, maxTokens: 200 })
    );
  });

  it('throws when LLM returns empty response', async () => {
    const mockBridge = { chat: jest.fn().mockResolvedValue({ ok: true, text: '' }) };
    const adapter = new OllamaTextAdapter(mockBridge);
    await expect(adapter.generate('hi')).rejects.toThrow('LLM empty response');
  });

  it('propagates bridge errors (caller falls back)', async () => {
    const mockBridge = { chat: jest.fn().mockRejectedValue(new Error('ollama down')) };
    const adapter = new OllamaTextAdapter(mockBridge);
    await expect(adapter.generate('hi')).rejects.toThrow('ollama down');
  });

  it('uses defaults when options omitted', async () => {
    const mockBridge = { chat: jest.fn().mockResolvedValue({ ok: true, text: 'r' }) };
    const adapter = new OllamaTextAdapter(mockBridge);
    await adapter.generate('hi');
    expect(mockBridge.chat).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
      model: 'llama3.2',
      temperature: 0.7
    }));
  });

  it('creates a real bridge when none injected', () => {
    const adapter = new OllamaTextAdapter();
    expect(adapter.bridge).toBeDefined();
  });

  it('handles empty prompt via String coercion', async () => {
    const mockBridge = { chat: jest.fn().mockResolvedValue({ ok: true, text: 'r' }) };
    const adapter = new OllamaTextAdapter(mockBridge);
    await adapter.generate('');
    const userMsg = mockBridge.chat.mock.calls[0][0][1];
    expect(userMsg.content).toBe('');
  });
});