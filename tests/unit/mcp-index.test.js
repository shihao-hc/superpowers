const mcp = require('../../src/mcp/index');

describe('MCP index exports', () => {
  it('should export MCPBridge', () => {
    expect(mcp.MCPBridge).toBeDefined();
    expect(typeof mcp.MCPBridge).toBe('function');
  });

  it('should export MCPToolRegistry', () => {
    expect(mcp.MCPToolRegistry).toBeDefined();
    expect(typeof mcp.MCPToolRegistry).toBe('function');
  });

  it('should export MCPNodeManager', () => {
    expect(mcp.MCPNodeManager).toBeDefined();
    expect(typeof mcp.MCPNodeManager).toBe('function');
  });

  it('should export MCPPlugin', () => {
    expect(mcp.MCPPlugin).toBeDefined();
    expect(typeof mcp.MCPPlugin).toBe('function');
  });

  it('should export MCPPermissionManager', () => {
    expect(mcp.MCPPermissionManager).toBeDefined();
    expect(typeof mcp.MCPPermissionManager).toBe('function');
  });

  it('should export MCPManager', () => {
    expect(mcp.MCPManager).toBeDefined();
    expect(typeof mcp.MCPManager).toBe('function');
  });

  it('should export MCPClient', () => {
    expect(mcp.MCPClient).toBeDefined();
    expect(typeof mcp.MCPClient).toBe('function');
  });

  it('should export MCPServerConfig', () => {
    expect(mcp.MCPServerConfig).toBeDefined();
    expect(typeof mcp.MCPServerConfig).toBe('function');
  });

  it('should export LRUCache', () => {
    expect(mcp.LRUCache).toBeDefined();
    expect(typeof mcp.LRUCache).toBe('function');
  });

  it('should export ServerType', () => {
    expect(mcp.ServerType).toBeDefined();
  });

  it('should export ConnectionStatus', () => {
    expect(mcp.ConnectionStatus).toBeDefined();
  });
});
