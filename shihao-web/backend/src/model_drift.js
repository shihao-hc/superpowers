// Minimal JS-based model drift detector (prototype)
export default class DriftDetector {
  constructor() {
    this.history = [];
    this._callbacks = []
    this.lastDriftStatus = 'stable'
  }

  register_drift_callback(cb) {
    if (typeof cb === 'function') this._callbacks.push(cb)
  }

  log(ic) {
    // ic: information coefficient (simulation value)
    this.history.push(ic)
    if (this.history.length > 100) this.history.shift()
    // Evaluate drift after each update and notify if status changed to drifted
    const info = this.check()
    if (info.drift && this.lastDriftStatus !== 'drifted') {
      this.lastDriftStatus = 'drifted'
      this._callbacks.forEach(cb => {
        try { cb({ drift_status: 'drifted', mean: info.mean, length: info.length }) } catch {}
      })
    } else if (!info.drift && this.lastDriftStatus !== 'stable') {
      this.lastDriftStatus = 'stable'
    }
  }

  check() {
    if (this.history.length < 20) {
      return { drift: false, mean: 0, length: this.history.length, status: 'insufficient' };
    }
    const sum = this.history.reduce((a, b) => a + b, 0);
    const mean = sum / this.history.length;
    // naive drift signal: if mean drifts significantly from 0
    const drift = Math.abs(mean) > 0.5 ? true : false;
    return { drift, mean, length: this.history.length, status: drift ? 'drifted' : 'stable' };
  }
}
