/**
 * WebSocket Service for real-time communication
 */

class WebSocketService {
  constructor() {
    this.connections = {}
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 3000
  }

  /**
   * Connect to WebSocket endpoint
   */
  connect(endpoint, options = {}) {
    const { onMessage, onOpen, onClose, onError } = options
    
    if (this.connections[endpoint]) {
      console.log(`[WebSocket] Already connected to ${endpoint}`)
      return this.connections[endpoint]
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}${endpoint}`
    
    try {
      const ws = new WebSocket(wsUrl)
      
      ws.onopen = (event) => {
        console.log(`[WebSocket] Connected to ${endpoint}`)
        this.reconnectAttempts = 0
        if (onOpen) onOpen(event)
      }
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (onMessage) onMessage(data)
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e)
        }
      }
      
      ws.onclose = (event) => {
        console.log(`[WebSocket] Disconnected from ${endpoint}`)
        delete this.connections[endpoint]
        if (onClose) onClose(event)
        
        // Auto reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++
          setTimeout(() => {
            console.log(`[WebSocket] Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
            this.connect(endpoint, options)
          }, this.reconnectDelay)
        }
      }
      
      ws.onerror = (error) => {
        console.error(`[WebSocket] Error on ${endpoint}:`, error)
        if (onError) onError(error)
      }
      
      this.connections[endpoint] = ws
      return ws
    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error)
      return null
    }
  }

  /**
   * Send message to WebSocket
   */
  send(endpoint, message) {
    const ws = this.connections[endpoint]
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
      return true
    }
    console.warn(`[WebSocket] Not connected to ${endpoint}`)
    return false
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(endpoint) {
    const ws = this.connections[endpoint]
    if (ws) {
      ws.close()
      delete this.connections[endpoint]
    }
  }

  /**
   * Disconnect all connections
   */
  disconnectAll() {
    Object.keys(this.connections).forEach(endpoint => {
      this.disconnect(endpoint)
    })
  }

  /**
   * Check if connected
   */
  isConnected(endpoint) {
    const ws = this.connections[endpoint]
    return ws && ws.readyState === WebSocket.OPEN
  }
}

// Export singleton instance
export const wsService = new WebSocketService()

// Export specific connection helpers
export const chatSocket = {
  connect: (options) => wsService.connect('/ws/chat', options),
  send: (message) => wsService.send('/ws/chat', message),
  disconnect: () => wsService.disconnect('/ws/chat'),
  isConnected: () => wsService.isConnected('/ws/chat')
}

export const marketSocket = {
  connect: (options) => wsService.connect('/ws/market', options),
  send: (message) => wsService.send('/ws/market', message),
  disconnect: () => wsService.disconnect('/ws/market'),
  isConnected: () => wsService.isConnected('/ws/market')
}

export const agentSocket = {
  connect: (options) => wsService.connect('/ws/agent', options),
  send: (message) => wsService.send('/ws/agent', message),
  disconnect: () => wsService.disconnect('/ws/agent'),
  isConnected: () => wsService.isConnected('/ws/agent')
}

export default wsService