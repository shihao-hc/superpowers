const { NotificationService } = require('../../src/industry/ecommerce/NotificationService');

describe('NotificationService', () => {
  let service;

  beforeEach(() => {
    service = new NotificationService();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(service.channels).toBeInstanceOf(Map);
      expect(service.notifications).toEqual([]);
      expect(service.maxNotifications).toBe(1000);
      expect(typeof service.onSend).toBe('function');
      expect(typeof service.onError).toBe('function');
    });

    it('should accept custom options', () => {
      const onSend = jest.fn();
      const custom = new NotificationService({ maxNotifications: 50, onSend });
      expect(custom.maxNotifications).toBe(50);
      expect(custom.onSend).toBe(onSend);
    });
  });

  describe('registerChannel', () => {
    it('should register a channel and return it', () => {
      const channel = service.registerChannel('wechat', {
        name: 'WeChat Work',
        type: 'wechat_work',
        config: { webhook: 'https://qyapi.weixin.qq.com/hook' }
      });
      expect(channel.id).toBe('wechat');
      expect(channel.name).toBe('WeChat Work');
      expect(channel.type).toBe('wechat_work');
      expect(channel.enabled).toBe(true);
      expect(service.channels.size).toBe(1);
    });

    it('should allow disabled channel', () => {
      const channel = service.registerChannel('disabled', { name: 'D', type: 'webhook', enabled: false });
      expect(channel.enabled).toBe(false);
    });
  });

  describe('send', () => {
    it('should send a notification through registered channels', async () => {
      service.registerChannel('email', { name: 'Email', type: 'email', config: { to: 'test@test.com' } });
      const result = await service.send({
        title: 'Test',
        body: 'Hello',
        type: 'info',
        channels: ['email']
      });
      expect(result.notificationId).toMatch(/^notif_/);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
    });

    it('should handle send without channels', async () => {
      service.registerChannel('email', { name: 'Email', type: 'email', config: { to: 'a@b.com' } });
      const result = await service.send({ title: 'T', body: 'B' });
      expect(result.results).toEqual([]);
    });

    it('should mark status as sent when at least one channel succeeds', async () => {
      service.registerChannel('email', { name: 'Email', type: 'email', config: { to: 'test@test.com' } });
      const result = await service.send({ title: 'T', body: 'B', channels: ['email'] });
      const notif = service.notifications.find((n) => n.id === result.notificationId);
      expect(notif.status).toBe('sent');
    });

    it('should mark status as failed when no channel succeeds', async () => {
      const result = await service.send({ title: 'T', body: 'B', channels: ['nonexistent'] });
      const notif = service.notifications.find((n) => n.id === result.notificationId);
      expect(notif.status).toBe('failed');
    });

    it('should skip disabled channels', async () => {
      service.registerChannel('disabled', { name: 'D', type: 'webhook', enabled: false });
      const result = await service.send({ title: 'T', body: 'B', channels: ['disabled'] });
      expect(result.results).toHaveLength(0);
    });

    it('should throw for unknown channel type', async () => {
      service.registerChannel('unknown', { name: 'U', type: 'unknown_type' });
      const result = await service.send({ title: 'T', body: 'B', channels: ['unknown'] });
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('Unknown channel type');
    });

    it('should call onSend callback', async () => {
      const onSend = jest.fn();
      const svc = new NotificationService({ onSend });
      svc.registerChannel('email', { name: 'E', type: 'email', config: { to: 'a@b.com' } });
      await svc.send({ title: 'T', body: 'B', channels: ['email'] });
      expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('should call onError callback on failure', async () => {
      const onError = jest.fn();
      const svc = new NotificationService({ onError });
      svc.registerChannel('unknown', { name: 'U', type: 'unknown_type' });
      await svc.send({ title: 'T', body: 'B', channels: ['unknown'] });
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('should trim notifications when exceeding max', async () => {
      const svc = new NotificationService({ maxNotifications: 2 });
      svc.registerChannel('email', { name: 'E', type: 'email', config: { to: 'a@b.com' } });
      await svc.send({ title: '1', body: '1', channels: ['email'] });
      await svc.send({ title: '2', body: '2', channels: ['email'] });
      await svc.send({ title: '3', body: '3', channels: ['email'] });
      expect(svc.notifications).toHaveLength(2);
    });

    it('should handle all channel types', async () => {
      const types = ['wechat_work', 'telegram', 'webhook', 'email', 'push'];
      for (const type of types) {
        service = new NotificationService();
        service.registerChannel(type, { name: type, type, config: {} });
        const result = await service.send({ title: 'T', body: 'B', channels: [type] });
        expect(result.results[0].success).toBe(true);
      }
    });
  });

  describe('sendPriceAlert', () => {
    beforeEach(() => {
      service.registerChannel('email', { name: 'Email', type: 'email', config: { to: 'a@b.com' } });
    });

    it('should send a below-target alert', async () => {
      const result = await service.sendPriceAlert('Product X', 80, 100, 'below');
      expect(result.notificationId).toBeTruthy();
      expect(result.results).toHaveLength(1);
    });

    it('should send alerts for all types', async () => {
      for (const type of ['below', 'above', 'spike', 'drop']) {
        const result = await service.sendPriceAlert('Product', 100, 50, type);
        expect(result.results[0].success).toBe(true);
      }
    });

    it('should send price alert with unknown type', async () => {
      const result = await service.sendPriceAlert('Product', 100, 50, 'unknown');
      expect(result.results[0].success).toBe(true);
    });
  });

  describe('sendPredictionAlert', () => {
    beforeEach(() => {
      service.registerChannel('email', { name: 'Email', type: 'email', config: { to: 'a@b.com' } });
    });

    it('should send a prediction alert', async () => {
      const prediction = {
        currentPrice: 100,
        trend: 'rising',
        predictions: [{ price: 110 }, { price: 115 }]
      };
      const result = await service.sendPredictionAlert('Product X', prediction);
      expect(result.results[0].success).toBe(true);
    });

    it('should handle empty predictions', async () => {
      const prediction = { currentPrice: 100, trend: 'stable', predictions: [] };
      const result = await service.sendPredictionAlert('Product X', prediction);
      expect(result.results[0].success).toBe(true);
    });

    it('should send prediction with falling trend', async () => {
      const prediction = {
        currentPrice: 100,
        trend: 'falling',
        predictions: [{ price: 90 }, { price: 85 }]
      };
      const result = await service.sendPredictionAlert('Product X', prediction);
      expect(result.results[0].success).toBe(true);
    });
  });

  describe('sendAdjustmentAlert', () => {
    beforeEach(() => {
      service.registerChannel('email', { name: 'Email', type: 'email', config: { to: 'a@b.com' } });
    });

    it('should send an adjustment alert', async () => {
      const result = await service.sendAdjustmentAlert('Product X', 100, 90, 'Competitor lower');
      expect(result.results[0].success).toBe(true);
      const notif = service.notifications[0];
      expect(notif.data.change).toBe('-10.0');
    });
  });

  describe('getChannel', () => {
    it('should return a channel by id', () => {
      service.registerChannel('test', { name: 'Test', type: 'webhook' });
      expect(service.getChannel('test').name).toBe('Test');
    });

    it('should return undefined for non-existent channel', () => {
      expect(service.getChannel('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllChannels', () => {
    it('should return all channels', () => {
      service.registerChannel('a', { name: 'A', type: 'webhook' });
      service.registerChannel('b', { name: 'B', type: 'email' });
      expect(service.getAllChannels()).toHaveLength(2);
    });
  });

  describe('getNotifications', () => {
    it('should return recent notifications', async () => {
      service.registerChannel('email', { name: 'E', type: 'email', config: { to: 'a@b.com' } });
      await service.send({ title: 'T1', body: 'B1', channels: ['email'] });
      await service.send({ title: 'T2', body: 'B2', channels: ['email'] });
      const notifications = service.getNotifications();
      expect(notifications).toHaveLength(2);
    });

    it('should respect limit', async () => {
      service.registerChannel('email', { name: 'E', type: 'email', config: { to: 'a@b.com' } });
      for (let i = 0; i < 5; i++) {
        await service.send({ title: `T${i}`, body: `B${i}`, channels: ['email'] });
      }
      expect(service.getNotifications(2)).toHaveLength(2);
    });
  });

  describe('getUnreadNotifications', () => {
    it('should return only unread notifications', async () => {
      service.registerChannel('email', { name: 'E', type: 'email', config: { to: 'a@b.com' } });
      await service.send({ title: 'T1', body: 'B1', channels: ['email'] });
      await service.send({ title: 'T2', body: 'B2', channels: ['email'] });
      expect(service.getUnreadNotifications()).toHaveLength(2);
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read', async () => {
      service.registerChannel('email', { name: 'E', type: 'email', config: { to: 'a@b.com' } });
      const result = await service.send({ title: 'T', body: 'B', channels: ['email'] });
      expect(service.markAsRead(result.notificationId)).toBe(true);
      const notif = service.notifications[0];
      expect(notif.read).toBe(true);
    });

    it('should return false for non-existent notification', () => {
      expect(service.markAsRead('nonexistent')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return accurate stats', async () => {
      service.registerChannel('email', { name: 'E', type: 'email', config: { to: 'a@b.com' } });
      service.registerChannel('disabled', { name: 'D', type: 'webhook', enabled: false });
      await service.send({ title: 'T', body: 'B', channels: ['email'] });
      await service.send({ title: 'T2', body: 'B2', channels: ['nonexistent'] });
      const stats = service.getStats();
      expect(stats.channels.total).toBe(2);
      expect(stats.channels.enabled).toBe(1);
      expect(stats.notifications.total).toBe(2);
      expect(stats.notifications.sent).toBe(1);
      expect(stats.notifications.failed).toBe(1);
    });
  });

  describe('destroy', () => {
    it('should clear all channels and notifications', () => {
      service.registerChannel('email', { name: 'E', type: 'email', config: { to: 'a@b.com' } });
      service.destroy();
      expect(service.channels.size).toBe(0);
      expect(service.notifications).toHaveLength(0);
    });
  });
});
