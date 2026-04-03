class EchoPlugin {
  constructor() {
    this.name = 'Echo';
    this.version = '1.0.0';
    this.enabled = false;
  }

  init() {
    console.log('[Echo] Plugin initialized');
  }

  onMessage(message, context) {
    return {
      message: message + ' (echoed)',
      plugin: this.name
    };
  }
}

module.exports = EchoPlugin;
