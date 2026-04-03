const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const ALLOWED_COMMANDS = new Set(['npx', 'node', 'npm', 'deno', 'bun']);

function isSafeCommand(command) {
  if (ALLOWED_COMMANDS.has(command)) return true;
  if (/^[a-zA-Z0-9_.-]+$/.test(command)) return true;
  return false;
}

function sanitizeArg(arg) {
  if (typeof arg !== 'string') return String(arg);
  if (arg.includes('\x00')) return arg.replace(/\x00/g, '');
  if (arg.length > 10000) return arg.substring(0, 10000);
  return arg;
}

class MCPClient extends EventEmitter {
  constructor(name, command, args = [], env = {}, options = {}) {
    super();
    this.name = name;
    
    if (!isSafeCommand(command)) {
      throw new Error(`Unsafe command: ${command}`);
    }
    this.command = command;
    this.args = Array.isArray(args) ? args.map(sanitizeArg) : [];
    this.env = this._processEnv(env);
    this.options = {
      timeout: options.timeout || 60000,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 2000,
      heartbeatInterval: options.heartbeatInterval || 60000,
      ...options
    };

    this.process = null;
    this.requestId = 0;
    this.pending = new Map();
    this.ready = false;
    this.connected = false;
    this.closing = false;
    this.heartbeatTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;

    this._messageBuffer = '';
  }

  _processEnv(env) {
    const processed = {};
    const allowedEnvVars = new Set([
      'PATH', 'HOME', 'USER', 'NODE_ENV', 
      'GITHUB_TOKEN', 'BRAVE_API_KEY', 'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY', 'GITHUB_PERSONAL_ACCESS_TOKEN'
    ]);

    for (const key of Object.keys(env)) {
      if (key.startsWith('_') || allowedEnvVars.has(key)) {
        processed[key] = process.env[key] || '';
      }
    }

    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && value.includes('${') && value.includes('}')) {
        const envVar = value.match(/\$\{([^}]+)\}/)?.[1];
        if (envVar && process.env[envVar]) {
          processed[envVar] = process.env[envVar];
        }
      } else if (typeof value === 'string') {
        processed[key] = value;
      }
    }
    return processed;
  }

  async start() {
    if (this.process) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`MCP client ${this.name} start timeout`));
      }, this.options.timeout);

      try {
        this.process = spawn(this.command, this.args, {
          env: this.env,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: false,
          windowsHide: true
        });

        this.process.stdout.on('data', (data) => this._handleStdout(data));
        this.process.stderr.on('data', (data) => this._handleStderr(data));
        this.process.on('error', (error) => this._handleError(error));
        this.process.on('exit', (code, signal) => this._handleExit(code, signal));
        
        this.process.on('spawn', () => {
          console.log(`[MCPClient:${this.name}] Process spawned successfully`);
        });

        let initDone = false;
        
        const initResponseHandler = (message) => {
          console.log(`[MCPClient:${this.name}] Received message:`, JSON.stringify(message));
          if (message.id === initId && !initDone) {
            initDone = true;
            this.removeListener('message', initResponseHandler);
            
            if (message.error) {
              clearTimeout(timeout);
              reject(new Error(`Initialize failed: ${message.error.message}`));
              return;
            }
            
            this.send({
              jsonrpc: '2.0',
              method: 'notifications/initialized'
            });
            
            clearTimeout(timeout);
            this.ready = true;
            this.connected = true;
            this._startHeartbeat();
            this.emit('connected');
            resolve();
          }
        };
        
        this.on('message', initResponseHandler);

        this.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        const initId = this._nextId();
        console.log(`[MCPClient:${this.name}] Sending initialize with id: ${initId}`);
        
        setTimeout(() => {
          this.send({
            jsonrpc: '2.0',
            id: initId,
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: {
                name: 'ultrawork-mcp-client',
                version: '1.0.0'
              }
            }
          });
        }, 500);

      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async stop() {
    this.closing = true;
    this._stopHeartbeat();

    if (this.process) {
      this.process.stdin.end();
      this.process.kill('SIGTERM');
      
      await new Promise((resolve) => {
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });

      this.process = null;
    }

    this.pending.forEach((deferred) => {
      deferred.reject(new Error('MCP client stopped'));
    });
    this.pending.clear();

    this.ready = false;
    this.connected = false;
    this.emit('disconnected');
  }

  async restart() {
    await this.stop();
    this.closing = false;
    this.ready = false;
    await this.start();
  }

  _handleStdout(data) {
    this._messageBuffer += data.toString();
    const lines = this._messageBuffer.split('\n');
    this._messageBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        this._handleMessage(line);
      }
    }
  }

  _handleStderr(data) {
    const stderr = data.toString();
    if (stderr.trim()) {
      console.log(`[MCPClient:${this.name}] stderr: ${stderr.trim()}`);
    }
    this.emit('stderr', stderr);
  }

  _handleError(error) {
    this.emit('process-error', error);
    this._handleReconnect();
  }

  _handleExit(code, signal) {
    this.emit('exit', { code, signal });
    
    if (!this.closing) {
      this._handleReconnect();
    }
  }

  async _handleReconnect() {
    if (this.closing || this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('error', new Error(`MCP client ${this.name} failed to reconnect after ${this.maxReconnectAttempts} attempts`));
      return;
    }

    this.reconnectAttempts++;
    this.ready = false;
    this.connected = false;

    const delay = this.options.retryDelay * Math.pow(2, this.reconnectAttempts - 1);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      this.process = null;
      await this.start();
      this.reconnectAttempts = 0;
      this.emit('reconnected');
    } catch (error) {
      await this._handleReconnect();
    }
  }

  _handleMessage(line) {
    try {
      const message = JSON.parse(line);

      if (message.id && this.pending.has(message.id)) {
        const deferred = this.pending.get(message.id);
        this.pending.delete(message.id);

        if (message.error) {
          deferred.reject(new Error(message.error.message || JSON.stringify(message.error)));
        } else {
          deferred.resolve(message.result);
        }
      }

      if (message.method === 'notifications/initialized') {
        this.emit('ready');
      }

      if (message.method === 'ping') {
        this.send({ jsonrpc: '2.0', id: this._nextId(), result: null });
      }

      this.emit('message', message);
    } catch (error) {
      this.emit('parse-error', { line, error });
    }
  }

  _nextId() {
    return ++this.requestId;
  }

  send(message) {
    if (this.process && this.process.stdin && !this.process.stdin.destroyed) {
      const json = JSON.stringify(message) + '\n';
      this.process.stdin.write(Buffer.from(json, 'utf8'));
    }
  }

  async call(method, params = {}, retryCount = 0) {
    if (!this.ready) {
      throw new Error(`MCP client ${this.name} is not ready`);
    }

    return new Promise((resolve, reject) => {
      const id = this._nextId();
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP call ${method} timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);

      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      this.send({ jsonrpc: '2.0', id, method, params });
    }).catch(async (error) => {
      if (retryCount < this.options.maxRetries && this._isRetryableError(error)) {
        const delay = this.options.retryDelay * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.call(method, params, retryCount + 1);
      }
      throw error;
    });
  }

  _isRetryableError(error) {
    const retryablePatterns = [
      /timeout/i,
      /connection/i,
      /econnreset/i,
      /etimedout/i,
      /network/i
    ];
    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  async listTools() {
    const result = await this.call('tools/list');
    return result?.tools || [];
  }

  async callTool(toolName, args = {}) {
    return this.call('tools/call', { name: toolName, arguments: args });
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(async () => {
      if (this.ready && !this.closing) {
        try {
          await this.call('ping', {}, 0);
        } catch (error) {
          this.emit('heartbeat-failed', error);
        }
      }
    }, this.options.heartbeatInterval);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  getStatus() {
    return {
      name: this.name,
      connected: this.connected,
      ready: this.ready,
      pendingRequests: this.pending.size,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  getAvailableTools() {
    return this.tools || [];
  }
}

module.exports = { MCPClient };
