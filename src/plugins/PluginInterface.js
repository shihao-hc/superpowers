// Plugin interface for Part 5
class PluginInterface {
  constructor() {
    this.name = '';
    this.enabled = true;
    this.permissions = [];
  }
  init() {}
  async onMessage(message, context) { return { message }; }
  async onMemory(memory, context) { return memory; }
  async onEvent(event, context) { return event; }
  getCapabilities() { return []; }
}
module.exports = PluginInterface;
