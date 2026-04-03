"use strict";
const { Worker, isMainThread, parentPort, workerData } = (() => {
  try { return require('worker_threads'); } catch (e) { return {}; }
})();

if (!isMainThread) {
  // Worker thread: execute a plugin method
  const { pluginPath, method, args } = workerData;
  try {
    let Cls = require(pluginPath);
    let inst = null;
    if (typeof Cls === 'function') {
      inst = new Cls();
    } else {
      inst = Cls;
    }
    const fn = (typeof inst[method] === 'function') ? inst[method].bind(inst) : null;
    if (!fn) {
      parentPort.postMessage({ error: 'method-not-found' });
    } else {
      Promise.resolve(fn(...(args || []))).then((ret) => {
        parentPort.postMessage({ result: ret });
      }).catch((err) => {
        parentPort.postMessage({ error: err && err.message ? err.message : String(err) });
      });
    }
  } catch (err) {
    parentPort.postMessage({ error: err && err.message ? err.message : String(err) });
  }
} else {
  // Main thread: export a run() API to call a plugin method in a sandboxed worker
  module.exports = {
    run: (pluginPath, method, args, timeoutMs = 3000) => {
      return new Promise((resolve, reject) => {
        const worker = new Worker(__filename, { workerData: { pluginPath, method, args } });
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            worker.terminate();
            reject(new Error('timeout'));
          }
        }, timeoutMs);
        worker.on('message', (msg) => {
          clearTimeout(timer);
          settled = true;
          if (msg && msg.error) reject(new Error(msg.error));
          else resolve(msg.result);
        });
        worker.on('error', (err) => {
          clearTimeout(timer);
          if (!settled) { settled = true; reject(err); }
        });
      });
    }
  };
}
