const vm = require('vm');

class SkillSandbox {
  constructor(options = {}) {
    this.options = {
      timeout: options.timeout || 1000,
      memoryLimit: options.memoryLimit || 128 * 1024 * 1024,
      ...options
    };
    this._scriptCache = new Map();
  }

  _createSecureContext(context = {}) {
    const safeContext = {
      console: {
        log: () => {},
        error: () => {},
        warn: () => {},
        info: () => {}
      },
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      Map,
      Set,
      Promise,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      ...context
    };

    const contextKeys = Object.keys(safeContext);
    return contextKeys.reduce((ctx, key) => {
      Object.defineProperty(ctx, key, {
        value: safeContext[key],
        writable: false,
        enumerable: true
      });
      return ctx;
    }, {});
  }

  async executeCode(code, context = {}) {
    if (!code || typeof code !== 'string') {
      throw new Error('Code must be a non-empty string');
    }

    if (code.length > 10000) {
      throw new Error('Code too long (max 10000 characters)');
    }

    const allowedPattern = /^[a-zA-Z0-9\s\[\]{}().,'"=+\-*/<>!&|?:;_|\n]+$/;
    if (!allowedPattern.test(code)) {
      throw new Error('Code contains disallowed characters');
    }

    const wrappedCode = `(async (inputs) => { ${code} })`;
    const secureContext = this._createSecureContext(context);

    try {
      const script = new vm.Script(wrappedCode, {
        filename: 'sandbox.js',
        timeout: this.options.timeout,
        cachedData: this._scriptCache.get(wrappedCode)
      });

      const compiledScript = script;
      const sandbox = vm.createContext(secureContext);

      const fn = compiledScript.runInContext(sandbox, {
        timeout: this.options.timeout,
        displayErrors: true
      });

      const result = await fn(context.inputs || context);

      if (result && typeof result === 'object') {
        const serialized = JSON.stringify(result);
        if (serialized.length > 1024 * 1024) {
          throw new Error('Result too large');
        }
        return JSON.parse(serialized);
      }

      return result;
    } catch (error) {
      if (error.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
        throw new Error('Execution timeout');
      }
      if (error.code === 'ERR_SCRIPT_NOT_COMPILABLE') {
        throw new Error('Invalid code syntax');
      }
      throw error;
    }
  }

  executeSync(code, context = {}) {
    if (!code || typeof code !== 'string') {
      throw new Error('Code must be a non-empty string');
    }

    const wrappedCode = `(function(inputs) { ${code} })`;
    const secureContext = this._createSecureContext(context);

    const script = new vm.Script(wrappedCode, {
      filename: 'sandbox.js'
    });

    const sandbox = vm.createContext(secureContext);
    const fn = script.runInContext(sandbox, {
      timeout: this.options.timeout,
      displayErrors: true
    });

    return fn(context.inputs || context);
  }

  clearCache() {
    this._scriptCache.clear();
  }
}

module.exports = { SkillSandbox };
