/**
 * MCP (Model Context Protocol) 路由
 * 集成 Claude Code 风格的 MCP 客户端
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { MCPClient } = require('../../src/mcp/MCPClient');
const { infoLog, errorLog } = require('../utils/logger');
const { authMiddleware, sensitiveLimiter } = require('../middleware');

// MCP 客户端注册表
const mcpClients = new Map();

/**
 * GET /api/mcp
 * 获取所有 MCP 服务器状态
 */
router.get('/', (req, res) => {
  const servers = Array.from(mcpClients.entries()).map(([name, client]) => ({
    name,
    status: client.isConnected ? 'connected' : 'disconnected',
    lastActivity: client.lastActivity
  }));

  res.json({
    success: true,
    data: servers
  });
});

/**
 * POST /api/mcp/connect
 * 连接 MCP 服务器
 */
router.post('/connect', sensitiveLimiter, authMiddleware, async (req, res) => {
  try {
    const { name, command, args = [], env = {} } = req.body;

    if (!name || !command) {
      return res.status(400).json({
        error: '缺少必要参数: name, command',
        code: 'INVALID_PARAMS'
      });
    }

    // 检查是否已存在
    if (mcpClients.has(name)) {
      return res.status(400).json({
        error: 'MCP 服务器已存在',
        code: 'SERVER_EXISTS'
      });
    }

    // 创建客户端
    const client = new MCPClient(name, command, args, env);

    // 事件处理
    client.on('connected', () => {
      infoLog(`[MCP] ${name} connected`);
    });

    client.on('disconnected', () => {
      infoLog(`[MCP] ${name} disconnected`);
    });

    client.on('error', (error) => {
      errorLog(`[MCP] ${name} error`, { error: error.message });
    });

    // 连接
    await client.connect();
    mcpClients.set(name, client);

    res.json({
      success: true,
      data: { name, status: 'connected' }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: 'MCP_CONNECT_ERROR'
    });
  }
});

/**
 * POST /api/mcp/disconnect
 * 断开 MCP 服务器
 */
router.post('/disconnect', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;

    const client = mcpClients.get(name);
    if (!client) {
      return res.status(404).json({
        error: 'MCP 服务器不存在',
        code: 'NOT_FOUND'
      });
    }

    await client.disconnect();
    mcpClients.delete(name);

    res.json({
      success: true,
      message: `MCP 服务器 ${name} 已断开`
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: 'MCP_DISCONNECT_ERROR'
    });
  }
});

/**
 * POST /api/mcp/call
 * 调用 MCP 工具
 */
router.post('/call', sensitiveLimiter, authMiddleware, async (req, res) => {
  try {
    const { server, tool, arguments: args } = req.body;

    if (!server || !tool) {
      return res.status(400).json({
        error: '缺少必要参数: server, tool',
        code: 'INVALID_PARAMS'
      });
    }

    const client = mcpClients.get(server);
    if (!client || !client.isConnected) {
      return res.status(404).json({
        error: 'MCP 服务器未连接',
        code: 'NOT_CONNECTED'
      });
    }

    const result = await client.callTool(tool, args);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: 'MCP_CALL_ERROR'
    });
  }
});

/**
 * GET /api/mcp/tools/:server
 * 获取 MCP 服务器工具列表
 */
router.get('/tools/:server', authMiddleware, (req, res) => {
  const { server } = req.params;

  const client = mcpClients.get(server);
  if (!client || !client.isConnected) {
    return res.status(404).json({
      error: 'MCP 服务器未连接',
      code: 'NOT_CONNECTED'
    });
  }

  const tools = client.tools || [];

  res.json({
    success: true,
    data: tools
  });
});

// ==================== MCP Status ====================
const { thinkingChain } = require('../../src/mcp/engines/ThinkingChain');
const { rootsManager } = require('../../src/mcp/engines/RootsManager');
const TA = require('../../src/mcp/engines/ToolAnnotations');
const { DryRunEngine, dryRunEngine } = require('../../src/mcp/engines/DryRunEngine');

router.get('/status', authMiddleware, (req, res) => {
  res.json({
    servers: Array.from(mcpClients.entries()).map(([name]) => name),
    tools: mcpClients.size > 0 ? Array.from(mcpClients.values()).flatMap((c) => c.tools || []) : []
  });
});

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    clients: mcpClients.size
  });
});

router.get('/servers', authMiddleware, (req, res) => {
  const servers = Array.from(mcpClients.entries()).map(([name, client]) => ({
    name,
    connected: client.isConnected,
    ready: client.isConnected
  }));
  res.json({ servers });
});

router.get('/tools', authMiddleware, (req, res) => {
  res.json({ tools: [] });
});

// ==================== Tool Annotations ====================
router.get('/annotations', authMiddleware, (req, res) => {
  const { tool } = req.query;
  if (tool) {
    const annotation = TA.getAnnotation(tool);
    return res.json({ tool, annotation });
  }
  res.json({ annotations: TA.ANNOTATIONS, count: Object.keys(TA.ANNOTATIONS).length });
});

router.get('/annotations/summary', authMiddleware, (req, res) => {
  const annotations = TA.ANNOTATIONS;
  res.json({
    total: Object.keys(annotations).length,
    readOnly: Object.values(annotations).filter((a) => a.readOnlyHint).length,
    destructive: Object.values(annotations).filter((a) => a.destructiveHint).length,
    idempotent: Object.values(annotations).filter((a) => a.idempotentHint).length,
    byRiskLevel: {
      safe: Object.values(annotations).filter((a) => TA.getRiskLevel(Object.keys(annotations).find((k) => annotations[k] === a)) === 'safe').length,
      low: Object.values(annotations).filter((a) => TA.getRiskLevel(Object.keys(annotations).find((k) => annotations[k] === a)) === 'low').length,
      medium: Object.values(annotations).filter((a) => TA.getRiskLevel(Object.keys(annotations).find((k) => annotations[k] === a)) === 'medium').length,
      critical: Object.values(annotations).filter((a) => TA.getRiskLevel(Object.keys(annotations).find((k) => annotations[k] === a)) === 'critical').length
    }
  });
});

router.get('/annotations/risk-level', authMiddleware, (req, res) => {
  const { tools } = req.query;
  if (!tools) {
    return res.status(400).json({ error: 'tools query parameter required' });
  }
  const toolList = tools.split(',');
  const riskLevels = toolList.map((tool) => ({
    tool,
    riskLevel: TA.getRiskLevel(tool),
    ...TA.getAnnotation(tool)
  }));
  res.json({ riskLevels });
});

// ==================== Roots Manager ====================
router.get('/roots', authMiddleware, (req, res) => {
  const roots = rootsManager.getRoots();
  res.json({ roots, count: roots.length });
});

router.post('/roots', sensitiveLimiter, authMiddleware, (req, res) => {
  const { path: rootPath, permissions } = req.body;
  if (!rootPath) {
    return res.status(400).json({ error: 'path required' });
  }
  const resolved = path.resolve(rootPath);
  if (!fs.existsSync(resolved)) {
    return res.status(400).json({ error: 'path does not exist', path: rootPath });
  }
  const roots = rootsManager.addRoot(resolved, permissions || ['read', 'write']);
  res.json({ roots, added: resolved });
});

router.post('/roots/sandbox', sensitiveLimiter, authMiddleware, (req, res) => {
  const { prefix } = req.body;
  const sandbox = rootsManager.createTemporaryRoot(prefix || 'mcp-sandbox');
  res.json({ sandbox });
});

router.get('/roots/validate', authMiddleware, (req, res) => {
  const { path: targetPath } = req.query;
  if (!targetPath) {
    return res.status(400).json({ error: 'path query parameter required' });
  }
  const validation = rootsManager.validatePath(targetPath);
  res.json({ ...validation, allowed: validation.valid });
});

// ==================== Thinking Chain ====================
router.post('/thinking/chains', authMiddleware, (req, res) => {
  const { initialThought, metadata } = req.body;
  if (!initialThought) {
    return res.status(400).json({ error: 'initialThought required' });
  }
  const chain = thinkingChain.createChain(initialThought, metadata || {});
  res.json(chain);
});

router.get('/thinking/chains', authMiddleware, (req, res) => {
  const chains = thinkingChain.getAllChains();
  res.json({ chains, count: chains.length });
});

router.get('/thinking/chains/:chainId', authMiddleware, (req, res) => {
  const chain = thinkingChain.getChain(req.params.chainId);
  if (!chain) {
    return res.status(404).json({ error: 'Chain not found' });
  }
  res.json(chain);
});

router.post('/thinking/chains/:chainId/thoughts', authMiddleware, (req, res) => {
  const { thought, options } = req.body;
  if (!thought) {
    return res.status(400).json({ error: 'thought required' });
  }
  try {
    const updatedChain = thinkingChain.addThought(req.params.chainId, thought, options || {});
    res.json(updatedChain);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== Dry-Run ====================
router.post('/dryrun/preview', authMiddleware, (req, res) => {
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
    default:
      preview = { _meta: { dryRun: true, preview: true, tool }, params, confirmationNeeded: true };
    }
    res.json(preview);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/dryrun/history', authMiddleware, (req, res) => {
  const history = dryRunEngine.getHistory();
  res.json({ history, count: history.length });
});

module.exports = router;
