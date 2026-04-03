class Plugin {
  constructor(options = {}) {
    this.name = options.name || 'UnnamedPlugin';
    this.version = options.version || '1.0.0';
    this.description = options.description || '';
    this.enabled = false;
    this.dependencies = options.dependencies || [];
  }

  async onLoad(config) {
    this.config = config;
    console.log(`[Plugin] ${this.name} v${this.version} loaded`);
  }

  async onEnable(app) {
    this.app = app;
    this.enabled = true;
    console.log(`[Plugin] ${this.name} enabled`);
  }

  async onDisable() {
    this.enabled = false;
    console.log(`[Plugin] ${this.name} disabled`);
  }

  async onMessage(message, context) {
    return null;
  }

  async onEvent(event, data) {
    return null;
  }

  getRoutes() {
    return [];
  }

  getMiddleware() {
    return [];
  }
}

module.exports = Plugin;
