const PersonalityManager = require('./PersonalityManager');

class ChatAgent {
  async respond(message) {
    // Simple simulated response with personality
    const prompt = PersonalityManager.getSystemPrompt ? PersonalityManager.getSystemPrompt() : '';
    const replyBase = `你说的是：${message}`;
    // Apply personality decorations if available
    const response = (typeof PersonalityManager.applyPersonality === 'function') ? PersonalityManager.applyPersonality(replyBase) : replyBase;
    // Include the system prompt in the response for debugging (not typically sent to user)
    return response;
  }
}

module.exports = new ChatAgent();
