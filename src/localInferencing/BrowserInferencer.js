// Lightweight mock of a browser-based transformer inference
class BrowserInferencer {
  constructor() {
    // placeholder caches
    this.modelLoaded = false;
  }
  loadModel() {
    // Simulate async model load
    this.modelLoaded = true;
    return Promise.resolve(true);
  }
  infer(input) {
    if (!this.modelLoaded) {
      return { ok: false, reason: 'model-not-loaded' };
    }
    // Very tiny heuristic-based mock inference
    const lower = (input || '').toLowerCase();
    if (lower.includes('hello')) return { ok: true, text: 'Hello there! (inference mock)' };
    return { ok: true, text: `Processed: ${input}` };
  }
}

module.exports = BrowserInferencer;
