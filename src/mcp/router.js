/**
 * MCP 管理 API 路由
 * 包含安全增强：认证、速率限制、输入验证、权限检查
 */

const express = require('express');
const router = express.Router();
const { MCPPermissionManager } = require('./MCPPermissionManager');

let mcpPlugin = null;
let authMiddleware = null;
let rateLimiter = new Map();
let permissionManager = null;

setInterval(() => {
  const now = Date.now();
  const windowMs = 60000;
  for (const [key, timestamps] of rateLimiter) {
    const recent = timestamps.filter(t => t > now - windowMs);
    if (recent.length === 0) {
      rateLimiter.delete(key);
    } else {
      rateLimiter.set(key, recent);
    }
  }
}, 60000);

function setMCPPlugin(plugin) {
  mcpPlugin = plugin;
}

function setAuthMiddleware(fn) {
  authMiddleware = fn;
}

function setPermissionManager(pm) {
  permissionManager = pm;
}

function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60000;
  const max = options.max || 100;
  
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!rateLimiter.has(key)) {
      rateLimiter.set(key, []);
    }
    
    const requests = rateLimiter.get(key).filter(t => t > now - windowMs);
    
    if (requests.length >= max) {
      return res.status(429).json({ 
        error: 'Too many requests',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    requests.push(now);
    rateLimiter.set(key, requests);
    next();
  };
}

const toolCallLimiter = createRateLimiter({ windowMs: 60000, max: 60 });
const serverOpLimiter = createRateLimiter({ windowMs: 60000, max: 20 });

function validateToolName(name) {
  if (!name || typeof name !== 'string') return false;
  const parts = name.split(':');
  if (parts.length !== 2) return false;
  return /^[a-zA-Z0-9_-]+$/.test(parts[0]) && /^[a-zA-Z0-9_]+$/.test(parts[1]);
}

function validateServerConfig(config) {
  if (!config || typeof config !== 'object') return false;
  if (!config.name || !/^[a-zA-Z0-9_-]+$/.test(config.name)) return false;
  if (!config.command || typeof config.command !== 'string') return false;
  if (!Array.isArray(config.args)) return false;
  return true;
}

function checkToolPermission(toolFullName, userRole) {
  if (!permissionManager) return { allowed: true };
  return permissionManager.checkToolAccess(toolFullName, userRole);
}

function createPermissionMiddleware(options = {}) {
  return (req, res, next) => {
    if (!permissionManager || !authMiddleware) {
      return next();
    }
    
    if (req.method === 'POST' && (req.path === '/call' || req.path === '/batch-call')) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required for tool calls' });
      }
      
      const token = authHeader.slice(7);
      const result = authMiddleware(token);
      
      if (!result || !result.valid) {
        return res.status(401).json({ error: result?.error || 'Invalid token' });
      }
      
      req.user = {
        username: result.username,
        role: result.role
      };
      
      if (req.body.toolFullName) {
        const access = permissionManager.checkToolAccess(req.body.toolFullName, result.role);
        if (!access.allowed) {
          return res.status(403).json({ 
            error: 'Tool access denied',
            reason: access.reason,
            tool: req.body.toolFullName
          });
        }
      }
      
      if (req.body.calls && Array.isArray(req.body.calls)) {
        for (const call of req.body.calls) {
          if (call.toolFullName) {
            const access = permissionManager.checkToolAccess(call.toolFullName, result.role);
            if (!access.allowed) {
              return res.status(403).json({ 
                error: 'Batch call contains unauthorized tool',
                reason: access.reason,
                tool: call.toolFullName
              });
            }
          }
        }
      }
    }
    
    next();
  };
}

router.use(createRateLimiter({ windowMs: 60000, max: 200 }));

router.get('/status', (req, res) => {
  if (!mcpPlugin) {
    return res.status(503).json({ error: 'MCP plugin not loaded' });
  }
  res.json(mcpPlugin.getStatus());
});

router.get('/health', async (req, res) => {
  if (!mcpPlugin) {
    return res.status(503).json({ error: 'MCP plugin not loaded' });
  }
  
  const { deep } = req.query;
  
  if (deep === 'true') {
    const health = await mcpPlugin.getDeepHealthCheck();
    const statusCode = health.overall === 'healthy' ? 200 : health.overall === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  } else {
    const status = mcpPlugin.getStatus();
    res.json({
      status: status.status === 'loaded' ? 'healthy' : 'unhealthy',
      servers: Object.keys(status.servers || {}).length,
      tools: status.tools
    });
  }
});

router.get('/health/:serverName', async (req, res) => {
  if (!mcpPlugin || !mcpPlugin.bridge) {
    return res.status(503).json({ error: 'MCP plugin not loaded' });
  }
  
  const { serverName } = req.params;
  const client = mcpPlugin.bridge.clients.get(serverName);
  
  if (!client) {
    return res.status(404).json({ error: `Server ${serverName} not found` });
  }
  
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    await Promise.race([
      client.listTools(),
      timeoutPromise
    ]);
    
    res.json({
      server: serverName,
      status: 'healthy',
      connected: client.connected,
      ready: client.ready,
      toolsCount: client.tools?.length || 0
    });
  } catch (error) {
    res.status(503).json({
      server: serverName,
      status: 'unhealthy',
      error: error.message,
      connected: client.connected,
      ready: client.ready
    });
  }
});

router.get('/tools', (req, res) => {
  if (!mcpPlugin) {
    return res.status(503).json({ error: 'MCP plugin not loaded' });
  }
  
  const { server, tags, search } = req.query;
  const options = {};
  
  if (server && /^[a-zA-Z0-9_-]+$/.test(server)) {
    options.serverName = server;
  }
  if (tags) {
    const validTags = tags.split(',').filter(t => /^[a-zA-Z0-9_]+$/.test(t));
    if (validTags.length) options.tags = validTags;
  }
  if (search && search.length <= 100) {
    options.search = search;
  }
  
  const tools = mcpPlugin.getAvailableTools(options);
  res.json({ tools, count: tools.length });
});

router.get('/tools/prompt', (req, res) => {
  if (!mcpPlugin) {
    return res.status(503).json({ error: 'MCP plugin not loaded' });
  }
  
  const prompt = mcpPlugin.getToolsForPrompt({ includeSchema: false });
  res.type('text/plain').send(prompt);
});

router.get('/servers', (req, res) => {
  if (!mcpPlugin) {
    return res.status(503).json({ error: 'MCP plugin not loaded' });
  }
  
  const servers = mcpPlugin.bridge ? mcpPlugin.bridge.getRegisteredServers() : [];
  const status = mcpPlugin.getStatus().servers || {};
  
  res.json({
    servers: servers.map(name => ({
      name,
      connected: status[name]?.connected,
      ready: status[name]?.ready
    }))
  });
});

router.get('/servers/:name', (req, res) => {
  if (!mcpPlugin) {
    return res.status(503).json({ error: 'MCP plugin not loaded' });
  }
  
  const { name } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid server name' });
  }
  
  const serverStatus = mcpPlugin.bridge?.getServerStatus(name);
  
  if (!serverStatus) {
    return res.status(404).json({ error: `Server ${name} not found` });
  }
  
  const tools = mcpPlugin.getAvailableTools({ serverName: name });
  
  res.json({
    name,
    connected: serverStatus.connected,
    ready: serverStatus.ready,
    toolsCount: tools.length
  });
});

router.post('/servers/:name/restart', serverOpLimiter, async (req, res) => {
  if (!mcpPlugin) {
    return res.status(503).json({ error: 'MCP plugin not loaded' });
  }
  
  const { name } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid server name' });
  }
  
  try {
    await mcpPlugin.restartServer(name);
    res.json({ success: true, message: `Server ${name} restarted` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/servers', serverOpLimiter, async (req, res) => {
  if (!mcpPlugin) {
    return res.status(503).json({ error: 'MCP plugin not loaded' });
  }
  
  const { name, command, args, env, enabled } = req.body;
  
  if (!validateServerConfig({ name, command, args })) {
    return res.status(400).json({ error: 'Invalid server configuration' });
  }
  
  try {
    await mcpPlugin.addServer({ 
      name, 
      command, 
      args: args || [], 
      env: env || {}, 
      enabled: enabled !== false 
    });
    res.json({ success: true, message: `Server ${name} added` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/servers/:name', serverOpLimiter, async (req, res) => {
  if (!mcpPlugin) {
    return res.status(503).json({ error: 'MCP plugin not loaded' });
  }
  
  const { name } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid server name' });
  }
  
  try {
    await mcpPlugin.removeServer(name);
    res.json({ success: true, message: `Server ${name} removed` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/tools/refresh', async (req, res) => {
  if (!mcpPlugin || !mcpPlugin.registry) {
    return res.status(503).json({ error: 'MCP plugin not loaded' });
  }
  
  try {
    await mcpPlugin.registry.refresh();
    res.json({ success: true, message: 'Tools refreshed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/call', toolCallLimiter, createPermissionMiddleware(), async (req, res) => {
  if (!mcpPlugin) {
    return res.status(503).json({ error: 'MCP plugin not loaded' });
  }
  
  const { toolFullName, params } = req.body;
  const userRole = req.user?.role || 'viewer';
  const username = req.user?.username || 'anonymous';
  const traceId = `api_${Date.now().toString(36)}`;
  
  if (!toolFullName || !validateToolName(toolFullName)) {
    return res.status(400).json({ error: 'Invalid tool name format' });
  }
  
  if (params && typeof params !== 'object') {
    return res.status(400).json({ error: 'Params must be an object' });
  }
  
  const access = checkToolPermission(toolFullName, userRole);
  if (!access.allowed) {
    const { logMCPCall } = require('./metrics');
    logMCPCall({
      traceId,
      toolFullName,
      server: toolFullName.split(':')[0],
      tool: toolFullName.split(':')[1],
      params,
      username,
      role: userRole,
      ip: req.ip,
      success: false,
      error: 'access_denied',
      source: 'api'
    });
    return res.status(403).json({ 
      error: 'Tool access denied',
      reason: access.reason,
      tool: toolFullName
    });
  }

  const sanitizedParams = JSON.parse(JSON.stringify(params || {}));
  const startTime = Date.now();
  
  try {
    const result = await mcpPlugin.executeTool(toolFullName, sanitizedParams, {
      traceId
    });
    const duration = Date.now() - startTime;
    
    const { logMCPCall } = require('./metrics');
    logMCPCall({
      traceId,
      toolFullName,
      server: toolFullName.split(':')[0],
      tool: toolFullName.split(':')[1],
      params: sanitizedParams,
      username,
      role: userRole,
      ip: req.ip,
      success: true,
      duration,
      source: 'api'
    });
    
    res.json({ success: true, result, traceId });
  } catch (error) {
    const duration = Date.now() - startTime;
    const { logMCPCall } = require('./metrics');
    logMCPCall({
      traceId,
      toolFullName,
      server: toolFullName.split(':')[0],
      tool: toolFullName.split(':')[1],
      params: sanitizedParams,
      username,
      role: userRole,
      ip: req.ip,
      success: false,
      duration,
      error: error.message,
      source: 'api'
    });
    res.status(500).json({ error: error.message, traceId });
  }
});

router.post('/batch-call', toolCallLimiter, createPermissionMiddleware(), async (req, res) => {
  if (!mcpPlugin || !mcpPlugin.bridge) {
    return res.status(503).json({ error: 'MCP plugin not loaded' });
  }
  
  const { calls } = req.body;
  const userRole = req.user?.role || 'viewer';
  const username = req.user?.username || 'anonymous';
  const traceId = `api_${Date.now().toString(36)}`;
  
  if (!calls || !Array.isArray(calls)) {
    return res.status(400).json({ error: 'calls array is required' });
  }
  
  if (calls.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 calls per batch' });
  }

  const validatedCalls = calls
    .filter(c => c && typeof c === 'object')
    .filter(c => validateToolName(c.toolFullName))
    .map(c => ({
      toolFullName: c.toolFullName,
      params: JSON.parse(JSON.stringify(c.params || {}))
    }));
  
  if (validatedCalls.length === 0) {
    return res.status(400).json({ error: 'No valid calls provided' });
  }
  
  for (const call of validatedCalls) {
    const access = checkToolPermission(call.toolFullName, userRole);
    if (!access.allowed) {
      const { logMCPCall } = require('./metrics');
      logMCPCall({
        traceId,
        toolFullName: call.toolFullName,
        server: call.toolFullName.split(':')[0],
        tool: call.toolFullName.split(':')[1],
        params: call.params,
        username,
        role: userRole,
        ip: req.ip,
        success: false,
        error: 'access_denied',
        source: 'api'
      });
      return res.status(403).json({ 
        error: 'Batch call contains unauthorized tool',
        reason: access.reason,
        tool: call.toolFullName
      });
    }
  }
  
  const startTime = Date.now();
  try {
    const results = await mcpPlugin.bridge.batchCall(validatedCalls, { traceId });
    const duration = Date.now() - startTime;
    
    const { logMCPCall } = require('./metrics');
    for (const call of validatedCalls) {
      logMCPCall({
        traceId,
        toolFullName: call.toolFullName,
        server: call.toolFullName.split(':')[0],
        tool: call.toolFullName.split(':')[1],
        params: call.params,
        username,
        role: userRole,
        ip: req.ip,
        success: true,
        duration,
        source: 'api'
      });
    }
    
    res.json({ success: true, results, traceId });
  } catch (error) {
    const duration = Date.now() - startTime;
    const { logMCPCall } = require('./metrics');
    for (const call of validatedCalls) {
      logMCPCall({
        traceId,
        toolFullName: call.toolFullName,
        server: call.toolFullName.split(':')[0],
        tool: call.toolFullName.split(':')[1],
        params: call.params,
        username,
        role: userRole,
        ip: req.ip,
        success: false,
        duration,
        error: error.message,
        source: 'api'
      });
    }
    res.status(500).json({ error: error.message, traceId });
  }
});

router.get('/metrics', (req, res) => {
  if (!mcpPlugin || !mcpPlugin.bridge) {
    return res.status(503).json({ error: 'MCP plugin not available' });
  }
  
  const metrics = mcpPlugin.bridge.getMetrics();
  const { getMCPAuditStats } = require('./metrics');
  const auditStats = getMCPAuditStats();
  
  res.json({
    totalCalls: metrics.totalCalls,
    successfulCalls: metrics.successfulCalls,
    failedCalls: metrics.failedCalls,
    successRate: metrics.totalCalls > 0 
      ? ((metrics.successfulCalls / metrics.totalCalls) * 100).toFixed(2) + '%'
      : 'N/A',
    callsByServer: metrics.callsByServer,
    callsByTool: metrics.callsByTool,
    callsByRole: metrics.callsByRole,
    auditSummary: {
      totalAuditEntries: auditStats.total,
      byRole: auditStats.byRole,
      avgDuration: auditStats.avgDuration
    }
  });
});

router.get('/audit/stats', (req, res) => {
  const { logMCPAuditStats } = require('./metrics');
  const { since } = req.query;
  const stats = logMCPAuditStats({ since });
  res.json(stats);
});

router.get('/audit/logs', (req, res) => {
  const { getMCPAuditEntries } = require('./metrics');
  const { tool, server, role, username, success, limit } = req.query;
  
  const options = {};
  if (tool) options.toolFullName = tool;
  if (server) options.server = server;
  if (role) options.role = role;
  if (username) options.username = username;
  if (success !== undefined) options.success = success === 'true';
  if (limit) options.limit = parseInt(limit);
  
  const logs = getMCPAuditEntries(options);
  res.json({ logs, count: logs.length });
});

router.get('/audit/export', (req, res) => {
  const { getMCPAuditLogger } = require('./metrics');
  const { format } = req.query;
  const logger = getMCPAuditLogger();
  const data = logger.export(format || 'json');
  
  if (format === 'csv') {
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="mcp-audit.csv"');
  } else {
    res.set('Content-Type', 'application/json');
  }
  
  res.send(data);
});

router.delete('/audit/logs', (req, res) => {
  const { getMCPAuditLogger } = require('./metrics');
  const logger = getMCPAuditLogger();
  const result = logger.clear();
  res.json(result);
});

router.post('/permissions', (req, res) => {
  if (!mcpPlugin || !mcpPlugin.permissionManager) {
    return res.status(503).json({ error: 'Permission manager not available' });
  }
  
  const { permissions } = req.body;
  if (!permissions || typeof permissions !== 'object') {
    return res.status(400).json({ error: 'Invalid permissions object' });
  }
  
  try {
    for (const [toolName, rolePerms] of Object.entries(permissions)) {
      if (rolePerms.admin === 'admin') {
        mcpPlugin.permissionManager.setToolPermission(toolName, 'admin');
      } else if (rolePerms.operator === 'admin') {
        mcpPlugin.permissionManager.setToolPermission(toolName, 'admin');
      } else {
        mcpPlugin.permissionManager.setToolPermission(toolName, { allowed: true });
      }
    }
    
    res.json({ success: true, message: 'Permissions updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/permissions', (req, res) => {
  if (!mcpPlugin || !mcpPlugin.permissionManager) {
    return res.status(503).json({ error: 'Permission manager not available' });
  }
  
  const config = mcpPlugin.permissionManager.exportConfig();
  res.json(config);
});

// ==================== Tool Annotations API ====================
router.get('/annotations', (req, res) => {
  const TA = require('./engines/ToolAnnotations');
  const { tool } = req.query;
  
  if (tool) {
    const annotation = TA.getAnnotation(tool);
    return res.json({ tool, annotation });
  }
  
  res.json({ annotations: TA.ANNOTATIONS, count: Object.keys(TA.ANNOTATIONS).length });
});

router.get('/annotations/summary', (req, res) => {
  const TA = require('./engines/ToolAnnotations');
  const annotations = TA.ANNOTATIONS;
  
  const summary = {
    total: Object.keys(annotations).length,
    readOnly: Object.values(annotations).filter(a => a.readOnlyHint).length,
    destructive: Object.values(annotations).filter(a => a.destructiveHint).length,
    idempotent: Object.values(annotations).filter(a => a.idempotentHint).length,
    byRiskLevel: {
      safe: Object.values(annotations).filter(a => TA.getRiskLevel(Object.keys(annotations).find(k => annotations[k] === a)) === 'safe').length,
      low: Object.values(annotations).filter(a => TA.getRiskLevel(Object.keys(annotations).find(k => annotations[k] === a)) === 'low').length,
      medium: Object.values(annotations).filter(a => TA.getRiskLevel(Object.keys(annotations).find(k => annotations[k] === a)) === 'medium').length,
      critical: Object.values(annotations).filter(a => TA.getRiskLevel(Object.keys(annotations).find(k => annotations[k] === a)) === 'critical').length
    }
  };
  res.json(summary);
});

router.get('/annotations/risk-level', (req, res) => {
  const TA = require('./engines/ToolAnnotations');
  const { tools } = req.query;
  
  if (!tools) {
    return res.status(400).json({ error: 'tools query parameter required' });
  }
  
  const toolList = tools.split(',');
  const riskLevels = toolList.map(tool => ({
    tool,
    riskLevel: TA.getRiskLevel(tool),
    ...TA.getAnnotation(tool)
  }));
  
  res.json({ riskLevels });
});

// ==================== Dry-Run API ====================
router.post('/dryrun/preview', (req, res) => {
  const { DryRunEngine } = require('./engines/DryRunEngine');
  const { tool, params } = req.body;
  
  if (!tool || !params) {
    return res.status(400).json({ error: 'tool and params required' });
  }
  
  const engine = new DryRunEngine();
  let preview;
  
  try {
    switch (tool) {
      case 'write_file':
        preview = engine.previewWrite(params.path, params.content);
        break;
      case 'edit_file':
        preview = engine.previewEdit(params.path, params.edits, params.currentContent);
        break;
      case 'delete_file':
        preview = engine.previewDelete(params.path);
        break;
      case 'move_file':
        preview = engine.previewMove(params.source, params.destination);
        break;
      case 'create_directory':
        preview = engine.previewMkdir(params.path);
        break;
      default:
        preview = engine.previewGeneric(tool, params);
    }
    res.json(preview);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/dryrun/history', (req, res) => {
  const { dryRunEngine } = require('./engines/DryRunEngine');
  const history = dryRunEngine.getHistory();
  res.json({ history, count: history.length });
});

router.get('/dryrun/diff/:id', (req, res) => {
  const { dryRunEngine } = require('./engines/DryRunEngine');
  const history = dryRunEngine.getHistory();
  const entry = history.find(h => h.id === req.params.id);
  if (!entry) {
    return res.status(404).json({ error: 'Diff not found' });
  }
  res.json(entry);
});

// ==================== Thinking Chain API ====================
router.post('/thinking/chains', (req, res) => {
  const { thinkingChain } = require('./engines/ThinkingChain');
  const { initialThought, metadata } = req.body;
  
  if (!initialThought) {
    return res.status(400).json({ error: 'initialThought required' });
  }
  
  const chain = thinkingChain.createChain(initialThought, metadata || {});
  res.json(chain);
});

router.get('/thinking/chains', (req, res) => {
  const { thinkingChain } = require('./engines/ThinkingChain');
  const chains = thinkingChain.getAllChains();
  res.json({ chains, count: chains.length });
});

router.get('/thinking/chains/:chainId', (req, res) => {
  const { thinkingChain } = require('./engines/ThinkingChain');
  const chain = thinkingChain.getChain(req.params.chainId);
  if (!chain) {
    return res.status(404).json({ error: 'Chain not found' });
  }
  res.json(chain);
});

router.post('/thinking/chains/:chainId/thoughts', (req, res) => {
  const { thinkingChain } = require('./engines/ThinkingChain');
  const { thought, options } = req.body;
  
  if (!thought) {
    return res.status(400).json({ error: 'thought required' });
  }
  
  try {
    const updatedChain = thinkingChain.addThought(req.params.chainId, thought, options || {});
    res.json(updatedChain);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/thinking/chains/:chainId/branches', (req, res) => {
  const { thinkingChain } = require('./engines/ThinkingChain');
  const { fromStep, label } = req.body;
  
  try {
    const branch = thinkingChain.createBranch(req.params.chainId, fromStep, label);
    res.json(branch);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/thinking/chains/:chainId/reflect', (req, res) => {
  const { thinkingChain } = require('./engines/ThinkingChain');
  const { stepId, criticism } = req.body;
  
  if (!stepId || !criticism) {
    return res.status(400).json({ error: 'stepId and criticism required' });
  }
  
  try {
    const updatedChain = thinkingChain.addReflection(req.params.chainId, stepId, criticism);
    res.json(updatedChain);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/thinking/chains/:chainId/backtrack', (req, res) => {
  const { thinkingChain } = require('./engines/ThinkingChain');
  const { toStep } = req.body;
  
  if (toStep === undefined) {
    return res.status(400).json({ error: 'toStep required' });
  }
  
  try {
    const updatedChain = thinkingChain.backtrack(req.params.chainId, toStep);
    res.json(updatedChain);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== Roots Manager API ====================
router.get('/roots', (req, res) => {
  const { rootsManager } = require('./engines/RootsManager');
  const roots = rootsManager.getRoots();
  res.json({ roots, count: roots.length });
});

router.post('/roots', (req, res) => {
  const { rootsManager } = require('./engines/RootsManager');
  const { path: rootPath, permissions } = req.body;
  
  if (!rootPath) {
    return res.status(400).json({ error: 'path required' });
  }
  
  const roots = rootsManager.addRoot(rootPath, permissions || ['read', 'write']);
  res.json({ roots, added: rootPath });
});

router.delete('/roots/:path', (req, res) => {
  const { rootsManager } = require('./engines/RootsManager');
  const decodedPath = decodeURIComponent(req.params.path);
  const roots = rootsManager.removeRoot(decodedPath);
  res.json({ roots, removed: decodedPath });
});

router.post('/roots/sandbox', (req, res) => {
  const { rootsManager } = require('./engines/RootsManager');
  const { prefix } = req.body;
  
  const sandbox = rootsManager.createTemporaryRoot(prefix || 'mcp-sandbox');
  res.json({ sandbox });
});

router.delete('/roots/sandbox/:id', (req, res) => {
  const { rootsManager } = require('./engines/RootsManager');
  const removed = rootsManager.removeTemporaryRoot(req.params.id);
  res.json({ removed });
});

router.get('/roots/validate', (req, res) => {
  const { rootsManager } = require('./engines/RootsManager');
  const { path: targetPath } = req.query;
  
  if (!targetPath) {
    return res.status(400).json({ error: 'path query parameter required' });
  }
  
  const validation = rootsManager.validatePath(targetPath);
  res.json(validation);
});

router.post('/roles', (req, res) => {
  if (!mcpPlugin || !mcpPlugin.permissionManager) {
    return res.status(503).json({ error: 'Permission manager not available' });
  }
  
  const { name, level } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Role name required' });
  }
  
  const validLevels = ['read', 'write', 'admin'];
  const permLevel = validLevels.includes(level) ? level : 'read';
  
  const result = mcpPlugin.permissionManager.addCustomRole(name, {
    level: permLevel,
    allowedTools: permLevel === 'admin' ? ['*'] : permLevel === 'write' ? ['filesystem:read*', 'github:read*', 'brave-search:*'] : ['filesystem:read_file', 'brave-search:*'],
    deniedTools: []
  });
  
  if (result.error) {
    return res.status(400).json(result);
  }
  
  res.json({ success: true, role: result.role });
});

router.post('/alerts/channels', (req, res) => {
  const { MCPAlertManager } = require('./MCPAlertManager');
  const { type, name, token } = req.body;
  
  if (!type || !name) {
    return res.status(400).json({ error: 'Type and name required' });
  }
  
  const alertManager = require('./MCPAlertManager').getMCPAlertManager();
  const channelId = `${type}_${Date.now()}`;
  
  alertManager.registerAlertChannel(channelId, {
    platform: type,
    name,
    token
  });
  
  res.json({ success: true, channelId });
});

router.get('/alerts/rules', (req, res) => {
  const { getMCPAlertManager } = require('./MCPAlertManager');
  const alertManager = getMCPAlertManager();
  res.json(alertManager.exportConfig());
});

router.get('/alerts/stats', (req, res) => {
  const { getMCPAlertManager } = require('./MCPAlertManager');
  const alertManager = getMCPAlertManager();
  res.json(alertManager.getStats());
});

router.get('/alerts/history', (req, res) => {
  const { getMCPAlertManager } = require('./MCPAlertManager');
  const alertManager = getMCPAlertManager();
  const { since, severity, username } = req.query;
  
  const options = {};
  if (since) options.since = parseInt(since);
  if (severity) options.severity = severity;
  if (username) options.username = username;
  
  const history = alertManager.getAlertHistory(options);
  res.json({ history, count: history.length });
});

module.exports = { router, setMCPPlugin, setAuthMiddleware, setPermissionManager, MCPPermissionManager };
