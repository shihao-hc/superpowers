// Phase 5: Plugins framework smoke test
const PluginManager = require('../src/plugins/PluginManager');
const path = require('path');

(async () => {
  const pm = new PluginManager(path.resolve(__dirname, '..'));
  pm.loadPlugins();
  if (pm && typeof pm.onMessage === 'function') {
    const res = pm.onMessage('hello', {});
    console.log('Phase5-plugins-test: onMessage result:', res);
  }
})();
