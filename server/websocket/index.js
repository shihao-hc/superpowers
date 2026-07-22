/**
 * WebSocket 服务器模块
 * 提供实时通信能力
 */

const { WebSocketServer: WS } = require('ws');
const url = require('url');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');

let wss = null;
let _app = null;
const clients = new Map();

/**
 * 初始化 WebSocket 服务器
 * @param {http.Server} server - HTTP 服务器实例
 * @param {Express.Application} expressApp - Express 应用实例
 */
function init(server, expressApp) {
  _app = expressApp;

  wss = new WS({ server });

  wss.on('connection', (ws, req) => {
    const parsedUrl = url.parse(req.url, true);
    const clientId = generateClientId();

    // 解析 token
    const token = parsedUrl.query.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, config.get('security.jwtSecret'));
        ws.user = decoded;
      } catch (error) {
        logger.warn('WebSocket 认证失败，拒绝连接', { error: error.message });
        ws.close(4001, 'AUTH_FAILED');
        return;
      }
    }

    clients.set(clientId, { ws, user: ws.user, connectedAt: Date.now() });
    logger.info('WebSocket 客户端连接', { clientId, user: ws.user?.id });

    // 发送欢迎消息
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      timestamp: Date.now()
    }));

    // 消息处理
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        handleMessage(clientId, data);
      } catch (error) {
        logger.error('WebSocket 消息解析失败', { error: error.message });
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    // 断开连接
    ws.on('close', () => {
      clients.delete(clientId);
      logger.info('WebSocket 客户端断开', { clientId });
    });

    // 错误处理
    ws.on('error', (error) => {
      logger.error('WebSocket 错误', { clientId, error: error.message });
      clients.delete(clientId);
    });
  });

  // 定期心跳检测
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  logger.info('WebSocket 服务已初始化');
  return wss;
}

/**
 * 处理客户端消息
 */
function handleMessage(clientId, data) {
  const client = getClient(clientId);
  if (!client) {return;}

  switch (data.type) {
  case 'ping':
    client.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
    break;

  case 'subscribe':
    if (data.channel) {
      client.subscriptions = client.subscriptions || new Set();
      client.subscriptions.add(data.channel);
      client.ws.send(JSON.stringify({
        type: 'subscribed',
        channel: data.channel
      }));
    }
    break;

  case 'unsubscribe':
    if (data.channel && client.subscriptions) {
      client.subscriptions.delete(data.channel);
      client.ws.send(JSON.stringify({
        type: 'unsubscribed',
        channel: data.channel
      }));
    }
    break;

  case 'broadcast':
    if (data.channel && data.message) {
      broadcast(data.channel, data.message, clientId);
    }
    break;

  default:
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'Unknown message type'
    }));
  }
}

/**
 * 生成客户端ID
 */
function generateClientId() {
  return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 获取客户端
 */
function getClient(clientId) {
  for (const [id, client] of clients) {
    if (id === clientId) {return client;}
  }
  return null;
}

/**
 * 广播消息到指定频道
 */
function broadcast(channel, message, _excludeClientId = null) {
  if (!wss) {return;}

  const payload = JSON.stringify({
    type: 'broadcast',
    channel,
    message,
    timestamp: Date.now()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      // 检查订阅
      if (client.subscriptions && client.subscriptions.has(channel)) {
        client.send(payload);
      }
    }
  });
}

/**
 * 发送消息给指定用户
 */
function sendToUser(userId, message) {
  if (!wss) {return;}

  const payload = JSON.stringify({
    type: 'direct',
    message,
    timestamp: Date.now()
  });

  wss.clients.forEach((client) => {
    if (client.user?.id === userId && client.readyState === 1) {
      client.send(payload);
    }
  });
}

/**
 * 关闭 WebSocket 服务器
 */
function close() {
  if (wss) {
    wss.close();
    wss = null;
  }
}

module.exports = init;
module.exports.broadcast = broadcast;
module.exports.sendToUser = sendToUser;
module.exports.close = close;
