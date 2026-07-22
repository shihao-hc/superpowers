const { MCPBridge } = require('./MCPBridge');
const { MCPToolRegistry } = require('./MCPToolRegistry');
const { MCPNodeManager } = require('./MCPNodeManager');
const { MCPPlugin } = require('./MCPPlugin');
const { MCPPermissionManager } = require('./MCPPermissionManager');
const mcpManager = require('./MCPManager');

module.exports = {
  MCPBridge,
  MCPToolRegistry,
  MCPNodeManager,
  MCPPlugin,
  MCPPermissionManager,
  MCPManager: mcpManager.MCPManager,
  MCPClient: mcpManager.MCPClient,
  MCPServerConfig: mcpManager.MCPServerConfig,
  LRUCache: mcpManager.LRUCache,
  ServerType: mcpManager.ServerType,
  ConnectionStatus: mcpManager.ConnectionStatus
};
