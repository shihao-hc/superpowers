// Plugin interface for Part 5
class PluginInterface {
  constructor() {
    this.name = '';
    this.enabled = true;
    this.permissions = [];
  }
  init() {}
  async onMessage(message, _context) { return { message }; }
  async onMemory(memory, _context) { return memory; }
  async onEvent(event, _context) { return event; }
  getCapabilities() { return []; }
}
module.exports = PluginInterface;
