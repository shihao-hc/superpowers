const crypto = require('crypto');

class NotificationService {
  constructor(options = {}) {
    this.channels = new Map();
    this.notifications = [];
    this.maxNotifications = options.maxNotifications || 1000;
    this.onSend = options.onSend || (() => {});
    this.onError = options.onError || ((e) => console.error('[Notification]', e));
  }

  registerChannel(channelId, config) {
    const channel = {
      id: channelId,
      name: config.name,
      type: config.type,
      config: config.config || {},
      enabled: config.enabled !== false,
      createdAt: Date.now()
    };

    this.channels.set(channelId, channel);
    return channel;
  }

  async send(notification) {
    const notifId = `notif_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    const record = {
      id: notifId,
      title: notification.title,
      body: notification.body,
      type: notification.type || 'info',
      priority: notification.priority || 'normal',
      channels: notification.channels || [],
      data: notification.data || {},
      status: 'pending',
      sentAt: null,
      timestamp: Date.now()
    };

    this.notifications.push(record);

    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(-this.maxNotifications);
    }

    const results = [];

    for (const channelId of record.channels) {
      const channel = this.channels.get(channelId);
      if (!channel || !channel.enabled) continue;

      try {
        const result = await this._sendToChannel(channel, record);
        results.push({ channelId, success: true, result });
      } catch (error) {
        results.push({ channelId, success: false, error: error.message });
        this.onError(error);
      }
    }

    record.status = results.some(r => r.success) ? 'sent' : 'failed';
    record.sentAt = Date.now();

    this.onSend(record, results);

    return { notificationId: notifId, results };
  }

  async _sendToChannel(channel, notification) {
    switch (channel.type) {
      case 'wechat_work':
        return await this._sendWechatWork(channel, notification);
      case 'telegram':
        return await this._sendTelegram(channel, notification);
      case 'webhook':
        return await this._sendWebhook(channel, notification);
      case 'email':
        return await this._sendEmail(channel, notification);
      case 'push':
        return await this._sendPush(channel, notification);
      default:
        throw new Error(`Unknown channel type: ${channel.type}`);
    }
  }

  async _sendWechatWork(channel, notification) {
    return {
      platform: 'wechat_work',
      msgid: notification.id,
      status: 'sent'
    };
  }

  async _sendTelegram(channel, notification) {
    return {
      platform: 'telegram',
      message_id: Date.now(),
      status: 'sent'
    };
  }

  async _sendWebhook(channel, notification) {
    return {
      platform: 'webhook',
      url: channel.config.url,
      status: 'sent'
    };
  }

  async _sendEmail(channel, notification) {
    return {
      platform: 'email',
      to: channel.config.to,
      status: 'sent'
    };
  }

  async _sendPush(channel, notification) {
    return {
      platform: 'push',
      token: channel.config.token,
      status: 'sent'
    };
  }

  async sendPriceAlert(productName, currentPrice, targetPrice, alertType) {
    const icons = {
      below: '📉',
      above: '📈',
      spike: '🚀',
      drop: '💥'
    };

    const messages = {
      below: `${productName} 价格降至 ¥${currentPrice}，低于目标价 ¥${targetPrice}`,
      above: `${productName} 价格升至 ¥${currentPrice}，高于目标价 ¥${targetPrice}`,
      spike: `${productName} 价格暴涨！当前 ¥${currentPrice}`,
      drop: `${productName} 价格暴跌！当前 ¥${currentPrice}`
    };

    return await this.send({
      title: `${icons[alertType] || '⚠️'} 价格告警`,
      body: messages[alertType] || `${productName} 价格变动`,
      type: 'price_alert',
      priority: alertType === 'drop' || alertType === 'spike' ? 'high' : 'normal',
      channels: Array.from(this.channels.keys()),
      data: { productName, currentPrice, targetPrice, alertType }
    });
  }

  async sendPredictionAlert(productName, prediction) {
    const trend = prediction.trend;
    const change = prediction.predictions?.length > 0
      ? ((prediction.predictions[prediction.predictions.length - 1].price - prediction.currentPrice) / prediction.currentPrice * 100).toFixed(1)
      : '0';

    return await this.send({
      title: `📊 价格预测`,
      body: `${productName} 预计${trend === 'rising' ? '上涨' : trend === 'falling' ? '下跌' : '持平'} ${Math.abs(change)}%`,
      type: 'prediction',
      priority: 'normal',
      channels: Array.from(this.channels.keys()),
      data: { productName, prediction }
    });
  }

  async sendAdjustmentAlert(productName, oldPrice, newPrice, reason) {
    const change = ((newPrice - oldPrice) / oldPrice * 100).toFixed(1);

    return await this.send({
      title: `💰 自动调价`,
      body: `${productName} 从 ¥${oldPrice} 调整为 ¥${newPrice} (${change}%)。原因: ${reason}`,
      type: 'adjustment',
      priority: 'high',
      channels: Array.from(this.channels.keys()),
      data: { productName, oldPrice, newPrice, change, reason }
    });
  }

  getChannel(channelId) {
    return this.channels.get(channelId);
  }

  getAllChannels() {
    return Array.from(this.channels.values());
  }

  getNotifications(limit = 50) {
    return this.notifications.slice(-limit);
  }

  getUnreadNotifications() {
    return this.notifications.filter(n => !n.read);
  }

  markAsRead(notificationId) {
    const notif = this.notifications.find(n => n.id === notificationId);
    if (notif) {
      notif.read = true;
      return true;
    }
    return false;
  }

  getStats() {
    return {
      channels: {
        total: this.channels.size,
        enabled: Array.from(this.channels.values()).filter(c => c.enabled).length
      },
      notifications: {
        total: this.notifications.length,
        sent: this.notifications.filter(n => n.status === 'sent').length,
        failed: this.notifications.filter(n => n.status === 'failed').length
      }
    };
  }

  destroy() {
    this.channels.clear();
    this.notifications = [];
  }
}

module.exports = { NotificationService };
