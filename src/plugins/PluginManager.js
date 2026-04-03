'use strict';
'use strict';
'use strict';
'use strict';
'use strict';
const fs = require('fs');
const path = require('path');
let SandboxRunner;
try {
  SandboxRunner = require('./SandboxRunner');
} catch (e) {
  SandboxRunner = null;
}

class PluginManager {
  constructor(basePath) {
    this.basePath = basePath || process.cwd();
    this.pluginDir = path.resolve(this.basePath, 'plugins');
    this.manifestPath = path.resolve(this.pluginDir, 'manifest.json');
    this.plugins = []; // manifest entries
    this.instances = []; // { name, instance }
    this.useSandbox = Boolean(process.env.PLUGIN_SANDBOX === '1' || process.env.PLUGIN_SANDBOX === 'true');
  }
  loadPlugins() {
    let manifest = { plugins: [] };
    try {
      const raw = fs.readFileSync(this.manifestPath, 'utf8');
      manifest = JSON.parse(raw);
    } catch (e) {
      // Fallback: auto-discover plugins with index.js under plugins/
      if (fs.existsSync(this.pluginDir)) {
        const entries = fs.readdirSync(this.pluginDir);
        for (const ent of entries) {
          const full = path.resolve(this.pluginDir, ent, 'index.js');
          if (fs.existsSync(full)) {
            manifest.plugins.push({ name: ent, path: `./plugins/${ent}` });
          }
        }
      }
    }
    this.plugins = manifest.plugins || [];
    this.instances = [];
    for (const p of this.plugins) {
      try {
        const modulePath = path.resolve(this.basePath, p.path || `plugins/${p.name}`, 'index.js');
        if (this.useSandbox && SandboxRunner) {
          // Create a sandboxed proxy for the plugin
          const name = p.name;
          const sandbox = {
            onMessage: async (m, c) => {
              try {
                return await SandboxRunner.run(modulePath, 'onMessage', [m, c], 2000);
              } catch (e) {
                return { message: m };
              }
            },
            onMemory: async (m, c) => {
              try {
                await SandboxRunner.run(modulePath, 'onMemory', [m, c], 1000);
              } catch (e) {
                /* ignore */
              }
            },
            onEvent: async (e, c) => {
              try {
                await SandboxRunner.run(modulePath, 'onEvent', [e, c], 1000);
              } catch (e) {
                /* ignore */
              }
            }
          };
          this.instances.push({ name, instance: sandbox });
        } else {
          const Cls = require(modulePath);
          const inst = new Cls();
          if (typeof inst.init === 'function') inst.init();
          this.instances.push({ name: p.name, instance: inst });
        }
      } catch (err) {
        console.warn('Failed to load plugin', p.name, err && err.message);
      }
    }
  }
  onMessage(message, context = {}) {
    let msg = message;
    for (const { instance } of this.instances) {
      if (typeof instance.onMessage === 'function') {
        const r = instance.onMessage(msg, context);
        if (r && typeof r.message === 'string') msg = r.message;
      }
    }
    return { message: msg };
  }
  onMemory(memory, context = {}) {
    for (const { instance } of this.instances) {
      if (typeof instance.onMemory === 'function') instance.onMemory(memory, context);
    }
  }
  onEvent(event, context = {}) {
    for (const { instance } of this.instances) {
      if (typeof instance.onEvent === 'function') instance.onEvent(event, context);
    }
  }
}

module.exports = PluginManager;
