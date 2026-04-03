class LoggerPlugin {
  constructor() { this.name = 'Logger'; }
  onMessage(message, context) {
    console.log('[LoggerPlugin] onMessage:', message);
    return { message };
  }
  onMemory(memory, context) {
    console.log('[LoggerPlugin] memory snapshot:', memory);
  }
  onEvent(event, context) {
    console.log('[LoggerPlugin] event:', event);
  }
}
module.exports = LoggerPlugin;
