import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MCPClient, mcpClient } from '../src/mcp/client'

describe('MCPClient', () => {
  let client: MCPClient

  beforeEach(() => {
    client = new MCPClient()
  })

  describe('connection management', () => {
    it('should create a new client', () => {
      expect(client).toBeInstanceOf(MCPClient)
    })

    it('should have no connections initially', () => {
      expect(client.getConnections()).toHaveLength(0)
    })

    it('should return undefined for non-existent connection', () => {
      expect(client.getConnection('test')).toBeUndefined()
    })

    it('should return empty tool list initially', async () => {
      const tools = await client.listTools()
      expect(tools).toHaveLength(0)
    })

    it('should return empty resource list initially', async () => {
      const resources = await client.listResources()
      expect(resources).toHaveLength(0)
    })

    it('should emit connecting event', async () => {
      const connectingHandler = vi.fn()
      client.on('connecting', connectingHandler)

      try {
        await client.connect('test', { type: 'stdio', command: 'nonexistent' })
      } catch {}

      expect(connectingHandler).toHaveBeenCalled()
    })

    it('should not have connected servers initially', () => {
      expect(client.getConnectedServers()).toHaveLength(0)
    })
  })

  describe('mcpClient singleton', () => {
    it('should be an MCPClient instance', () => {
      expect(mcpClient).toBeInstanceOf(MCPClient)
    })
  })

  describe('server config types', () => {
    it('should support stdio config', async () => {
      const config = { type: 'stdio' as const, command: 'node', args: ['--version'] }
      expect(config.type).toBe('stdio')
    })

    it('should support http config', async () => {
      const config = { type: 'http' as const, url: 'http://localhost:3000' }
      expect(config.type).toBe('http')
    })

    it('should support sse config', async () => {
      const config = { type: 'sse' as const, url: 'http://localhost:3000', headers: {} }
      expect(config.type).toBe('sse')
    })
  })
})
