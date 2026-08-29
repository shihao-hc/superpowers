const express = require('express');
const request = require('supertest');

jest.mock('../../src/mcp/MCPClient', () => {
  const { EventEmitter } = require('events');
  class MockMCPClient extends EventEmitter {
    constructor(name) {
      super();
      this.name = name;
      this.isConnected = false;
      this.lastActivity = null;
      this.tools = [];
    }
    connect() {
      this.isConnected = true;
      this.lastActivity = Date.now();
      this.emit('connected');
      return Promise.resolve(this);
    }
    disconnect() {
      this.isConnected = false;
      this.emit('disconnected');
      return Promise.resolve();
    }
    callTool(tool, _args) {
      this.lastActivity = Date.now();
      return Promise.resolve({ output: `done:${tool}` });
    }
    getToolList() {
      return this.tools;
    }
  }
  return { MCPClient: MockMCPClient };
});

jest.mock('../../src/mcp/engines/DryRunEngine', () => {
  const DryRunEngineMock = jest.fn().mockImplementation(() => ({
    previewWrite: jest.fn((p, c) => ({ path: p, contentLength: c.length })),
    previewEdit: jest.fn((p, edits) => ({ path: p, edits })),
    previewDelete: jest.fn((p) => ({ path: p })),
    previewMove: jest.fn((s, d) => ({ source: s, dest: d })),
    previewMkdir: jest.fn((p) => ({ path: p })),
    previewGeneric: jest.fn((t, p) => ({ tool: t, params: p })),
  }));
  return { DryRunEngine: DryRunEngineMock };
});

jest.mock('../../src/mcp/engines/ThinkingChain', () => {
  const chain = { id: 'chain-1', thoughts: [] };
  return {
    thinkingChain: {
      createChain: jest.fn((thought, meta) => ({ id: 'chain-1', initialThought: thought, metadata: meta })),
      getAllChains: jest.fn(() => [chain]),
      getChain: jest.fn((id) => id === 'chain-1' ? chain : null),
      addThought: jest.fn((chainId, thought, opts) => ({ id: chainId, thoughts: [...chain.thoughts, { thought, ...opts }] })),
    },
  };
});

jest.mock('../../src/mcp/engines/RootsManager', () => ({
  rootsManager: {
    getRoots: jest.fn(() => ['/workspace']),
    addRoot: jest.fn((p) => ['/workspace', p]),
    removeRoot: jest.fn((_p) => ['/workspace']),
    createTemporaryRoot: jest.fn(() => ({ id: 'sandbox-1', path: '/tmp/sandbox_abc' })),
    removeTemporaryRoot: jest.fn((id) => id === 'sandbox-1'),
    validatePath: jest.fn((p) => ({ valid: !p.includes('..'), path: p })),
  },
}));

jest.mock('../../server/middleware', () => ({
  authMiddleware: (req, res, next) => next(),
  sensitiveLimiter: (req, res, next) => next(),
}));

jest.mock('../../server/utils/logger', () => ({
  infoLog: jest.fn(),
  errorLog: jest.fn(),
  warnLog: jest.fn(),
}));

const mcpRouter = require('../../server/routes/mcp');
const app = express();
app.use(express.json());
app.use('/api/mcp', mcpRouter);

describe('server/routes/mcp.js (production path)', () => {
  it('connects a mock MCP client', async () => {
    const res = await request(app).post('/api/mcp/connect').send({
      name: 'srv1', command: 'node', args: ['x.js'],
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('blocks dangerous shell exec tool via risk gate', async () => {
    await request(app).post('/api/mcp/connect').send({
      name: 'srv2', command: 'node', args: ['x.js'],
    });
    const res = await request(app).post('/api/mcp/call').send({
      server: 'srv2', tool: 'exec', arguments: { cmd: 'rm -rf /' },
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MCP_BLOCKED');
  });

  it('allows safe read tool through risk gate', async () => {
    await request(app).post('/api/mcp/connect').send({
      name: 'srv3', command: 'node', args: ['x.js'],
    });
    const res = await request(app).post('/api/mcp/call').send({
      server: 'srv3', tool: 'read', arguments: { path: '/tmp/a' },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});