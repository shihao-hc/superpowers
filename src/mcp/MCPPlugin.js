const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const { MCPBridge } = require('./MCPBridge');
const { MCPToolRegistry } = require('./MCPToolRegistry');
const { MCPNodeManager } = require('./MCPNodeManager');
const { MCPPermissionManager } = require('./MCPPermissionManager');

class MCPPlugin extends EventEmitter {
  constructor(options = {}) {
    super();
    this.id = 'mcp-integration';
    this.name = 'MCP Integration';
    this.version = '1.0.0';
    this.description = 'Unified MCP server integration for agents and workflows';

    this.config = {
      configPath: options.configPath || path.join(process.cwd(), 'config', 'mcp-servers.json'),
      autoRefreshInterval: options.autoRefreshInterval || 60000,
      enableWorkflowIntegration: options.enableWorkflowIntegration !== false,
      enableAgentIntegration: options.enableAgentIntegration !== false,
      ...options
    };

    this.bridge = null;
    this.registry = null;
    this.nodeManager = null;
    this.workflowEngine = null;
    this.agentLoop = null;
    this.permissionManager = null;
    this.status = 'uninitialized';
    this.serverConfig = null;
  }

  get nodeTypes() {
    return [];
  }

  get hooks() {
    return {
      onLoad: this.onLoad.bind(this),
      onUnload: this.onUnload.bind(this),
      onServerStart: this.onServerStart.bind(this),
      onServerStop: this.onServerStop.bind(this),
      getBridge: () => this.bridge,
      getRegistry: () => this.registry,
      getNodeManager: () => this.nodeManager
    };
  }

  async onLoad(pluginConfig = {}) {
    try {
      this.status = 'loading';
      this.emit('status-change', { status: 'loading' });

      const config = { ...this.config, ...pluginConfig };

      this.serverConfig = await this._loadConfig(config.configPath);

      this.bridge = new MCPBridge({
        toolCacheTTL: config.toolCacheTTL || 300000,
        rateLimit: config.rateLimit || { enabled: false }
      });

      this.registry = new MCPToolRegistry({
        autoRefresh: true,
        refreshInterval: config.autoRefreshInterval,
        enableSchemaValidation: true
      });

      this.registry.initialize(this.bridge);

      const securityConfig = this.serverConfig.security || {};
      this.permissionManager = new MCPPermissionManager({
        customRoles: securityConfig.roleRestrictions,
        toolPermissions: securityConfig.toolPermissions
      });

      this.nodeManager = new MCPNodeManager(this.bridge, this.registry, {
        nodePrefix: 'mcp',
        category: 'MCP'
      });

      this._setupBridgeListeners();

      const servers = this.serverConfig.servers || [];
      console.log(`[MCP] Found ${servers.length} servers to register`);
      for (const server of servers) {
        if (server.enabled !== false) {
          console.log(`[MCP] Registering server: ${server.name}`);
          try {
            await this._registerServer(server);
            console.log(`[MCP] Server ${server.name} registered successfully`);
          } catch (err) {
            console.error(`[MCP] Failed to register server ${server.name}:`, err.message);
          }
        } else {
          console.log(`[MCP] Server ${server.name} is disabled, skipping`);
        }
      }

      await this.registry.refresh();

      this.status = 'loaded';
      this.emit('status-change', { status: 'loaded' });
      this.emit('loaded', {
        serversRegistered: servers.filter(s => s.enabled !== false).length,
        toolsAvailable: this.registry.getTools().length
      });

      return { success: true };
    } catch (error) {
      this.status = 'error';
      this.emit('status-change', { status: 'error', error: error.message });
      console.error('[MCP] onLoad failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  async onUnload() {
    try {
      this.status = 'unloading';
      this.emit('status-change', { status: 'unloading' });

      if (this.nodeManager) {
        this.nodeManager.destroy();
      }

      if (this.registry) {
        this.registry.destroy();
      }

      if (this.bridge) {
        await this.bridge.shutdown();
      }

      this.status = 'unloaded';
      this.emit('status-change', { status: 'unloaded' });
      this.emit('unloaded');

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async onServerStart(serverName) {
    const server = this.serverConfig?.servers?.find(s => s.name === serverName);
    if (!server) {
      throw new Error(`Server ${serverName} not found in config`);
    }

    await this._registerServer(server);
    await this.registry.refresh();

    this.emit('server-started', { name: serverName });
  }

  async onServerStop(serverName) {
    await this.bridge.unregister(serverName);
    await this.registry.refresh();

    this.emit('server-stopped', { name: serverName });
  }

  async registerWorkflowEngine(workflowEngine) {
    if (!this.nodeManager) {
      throw new Error('MCP plugin not loaded');
    }

    this.workflowEngine = workflowEngine;
    this.nodeManager.registerToEngine(workflowEngine);

    if (this.nodeManager.registeredNodes.size > 0) {
      this.emit('workflow-engine-connected', {
        nodeCount: this.nodeManager.registeredNodes.size
      });
    }
  }

  async registerAgentLoop(agentLoop) {
    if (!this.registry) {
      throw new Error('MCP plugin not loaded');
    }

    this.agentLoop = agentLoop;

    if (typeof agentLoop.registerAction === 'function') {
      agentLoop.registerAction('mcp_call', async (params) => {
        return this.executeTool(params.toolFullName, params.params);
      });
    }

    this.emit('agent-loop-connected');
  }

  async executeTool(toolFullName, params = {}, context = {}) {
    if (!this.bridge) {
      throw new Error('MCP plugin not loaded');
    }

    return this.bridge.call(toolFullName, params, {
      traceId: context.traceId || `agent_${Date.now().toString(36)}`
    });
  }

  async _loadConfig(configPath) {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      return this._processConfig(config);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { servers: [], global: {} };
      }
      throw error;
    }
  }

  _processConfig(config) {
    const processed = JSON.parse(JSON.stringify(config));

    if (processed.servers) {
      for (const server of processed.servers) {
        if (server.env) {
          for (const [key, value] of Object.entries(server.env)) {
            if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
              const envVar = value.slice(2, -1);
              server.env[key] = process.env[envVar] || value;
            }
          }
        }
      }
    }

    return processed;
  }

  async _registerServer(serverConfig) {
    try {
      await this.bridge.register(serverConfig);
      this.emit('server-registered', { name: serverConfig.name });
    } catch (error) {
      this.emit('server-registration-error', {
        name: serverConfig.name,
        error: error.message
      });
      throw error;
    }
  }

  _setupBridgeListeners() {
    this.bridge.on('client-error', ({ server, error }) => {
      this.emit('client-error', { server, error });
    });

    this.bridge.on('reconnecting', ({ server, attempt, delay }) => {
      this.emit('reconnecting', { server, attempt, delay });
    });

    this.bridge.on('reconnected', ({ server }) => {
      this.emit('reconnected', { server });
    });

    this.bridge.on('circuit-breaker-opened', ({ server }) => {
      this.emit('circuit-breaker-opened', { server });
    });

    this.bridge.on('circuit-breaker-half-open', ({ server }) => {
      this.emit('circuit-breaker-half-open', { server });
    });
  }

  getStatus() {
    return {
      status: this.status,
      servers: this.bridge ? this.bridge.getServerStatus() : {},
      tools: this.registry ? this.registry.getTools().length : 0,
      nodes: this.nodeManager ? this.nodeManager.registeredNodes.size : 0
    };
  }

  async getDeepHealthCheck() {
    const results = {
      overall: 'healthy',
      timestamp: Date.now(),
      version: this.version,
      uptime: process.uptime(),
      checks: {}
    };

    if (this.status === 'error') {
      results.overall = 'unhealthy';
      results.checks.plugin = { status: 'unhealthy', error: 'Plugin in error state' };
      return results;
    }

    results.checks.plugin = { status: 'healthy' };

    if (this.registry) {
      const tools = this.registry.getTools();
      results.checks.registry = {
        status: 'healthy',
        toolCount: tools.length,
        lastRefresh: this.registry._lastRefresh || null
      };
    } else {
      results.checks.registry = { status: 'unknown' };
    }

    if (this.nodeManager) {
      results.checks.nodeManager = {
        status: 'healthy',
        registeredNodes: this.nodeManager.registeredNodes.size
      };
    }

    if (this.bridge) {
      const serverChecks = {};
      let healthyCount = 0;
      let unhealthyCount = 0;

      for (const [serverName, client] of this.bridge.clients) {
        const check = {
          connected: client.connected || false,
          ready: client.ready || false,
          lastError: client._lastError || null
        };

        if (check.connected && check.ready) {
          try {
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Health check timeout')), 5000);
            });
            
            await Promise.race([
              client.listTools(),
              timeoutPromise
            ]);
            
            check.listToolsSuccess = true;
            check.status = 'healthy';
            healthyCount++;
          } catch (error) {
            check.listToolsSuccess = false;
            check.status = 'degraded';
            check.error = error.message;
            unhealthyCount++;
          }
        } else {
          check.status = 'unhealthy';
          unhealthyCount++;
        }

        serverChecks[serverName] = check;
      }

      results.checks.servers = {
        status: unhealthyCount === 0 ? 'healthy' : unhealthyCount === healthyCount ? 'unhealthy' : 'degraded',
        total: this.bridge.clients.size,
        healthy: healthyCount,
        unhealthy: unhealthyCount,
        details: serverChecks
      };

      if (this.bridge.getCacheStats) {
        results.checks.cache = this.bridge.getCacheStats();
      }

      if (this.bridge.getMetrics) {
        const metrics = this.bridge.getMetrics();
        results.checks.metrics = {
          totalCalls: metrics.totalCalls,
          successRate: metrics.totalCalls > 0 
            ? ((metrics.successfulCalls / metrics.totalCalls) * 100).toFixed(2) + '%' 
            : 'N/A'
        };
      }
    }

    if (results.overall === 'healthy' && results.checks.servers?.status !== 'healthy') {
      results.overall = results.checks.servers.status;
    }

    return results;
  }

  getAvailableTools(options = {}) {
    if (!this.registry) return [];
    return this.registry.formatForLLM(options);
  }

  getToolsForPrompt(options = {}) {
    if (!this.registry) return 'No MCP tools available.';
    return this.registry.formatForPrompt(options);
  }

  getPermissionManager() {
    return this.permissionManager;
  }

  checkToolPermission(toolFullName, userRole) {
    if (!this.permissionManager) {
      return { allowed: true };
    }
    return this.permissionManager.checkToolAccess(toolFullName, userRole);
  }

  getPermissionAuditLog(options = {}) {
    if (!this.permissionManager) return [];
    return this.permissionManager.getAuditLog(options);
  }

  async addServer(serverConfig) {
    if (!this.serverConfig) {
      this.serverConfig = { servers: [], global: {} };
    }

    this.serverConfig.servers.push(serverConfig);
    await this._registerServer(serverConfig);
    await this.registry.refresh();

    this.emit('server-added', { name: serverConfig.name });
  }

  async removeServer(serverName) {
    await this.bridge.unregister(serverName);
    this.serverConfig.servers = this.serverConfig.servers.filter(s => s.name !== serverName);
    await this.registry.refresh();

    this.emit('server-removed', { name: serverName });
  }

  async restartServer(serverName) {
    await this.bridge.restartServer(serverName);
    await this.registry.refresh();

    this.emit('server-restarted', { name: serverName });
  }

  emit(event, data) {
    super.emit(event, data);
  }
}

module.exports = { MCPPlugin };
