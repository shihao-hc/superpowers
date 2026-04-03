/**
 * MCP (Model Context Protocol) 路由
 * 集成 Claude Code 风格的 MCP 客户端
 */

const express = require('express');
const router = express.Router();
const { MCPClient } = require('../../src/mcp/MCPClient');

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
router.post('/connect', async (req, res) => {
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
      console.log(`[MCP] ${name} connected`);
    });
    
    client.on('disconnected', () => {
      console.log(`[MCP] ${name} disconnected`);
    });
    
    client.on('error', (error) => {
      console.error(`[MCP] ${name} error:`, error.message);
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
router.post('/disconnect', async (req, res) => {
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
router.post('/call', async (req, res) => {
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
router.get('/tools/:server', (req, res) => {
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

module.exports = router;
