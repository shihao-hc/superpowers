const LocalEngine = require('./LocalEngine');

class InferenceBridge {
  constructor() {
    this.pmBridge = null;
    this.engine = null;
    this.modelLoaded = false;
    this.externalEndpoint = process.env.INFER_ENDPOINT || null;
  }
  async loadModel() {
    if (this.externalEndpoint) {
      this.modelLoaded = true;
      // external inference; no local model to load
      return true;
    }
    // Use local engine as default
    const Eng = LocalEngine;
    this.engine = new Eng();
    this.modelLoaded = await this.engine.loadModel();
    return this.modelLoaded;
  }
  async infer(input) {
    if (this.externalEndpoint) {
      // External endpoint path (HTTP)
      try {
        const fetch = global.fetch || ((await import('node-fetch')).default);
        const res = await fetch(this.externalEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: input })
        });
        const json = await res.json();
        return json;
      } catch (e) {
        return { ok: false, text: 'external-infer-error', error: e.message };
      }
    }
    if (!this.modelLoaded || !this.engine) {
      return { ok: false, text: 'model-not-loaded' };
    }
    const res = this.engine.infer(input);
    return res;
  }
}

module.exports = InferenceBridge;
