const { PriceMonitorService } = require('../../src/industry/ecommerce/PriceMonitorService');

describe('PriceMonitorService', () => {
  let monitor;

  beforeEach(() => {
    monitor = new PriceMonitorService();
  });

  afterEach(() => {
    monitor.destroy();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(monitor.products).toBeInstanceOf(Map);
      expect(monitor.alerts).toEqual([]);
      expect(monitor.maxAlerts).toBe(500);
      expect(monitor.checkInterval).toBe(300000);
      expect(monitor._checkTimer).toBeNull();
    });

    it('should accept custom options', () => {
      const custom = new PriceMonitorService({ maxAlerts: 100, checkInterval: 60000 });
      expect(custom.maxAlerts).toBe(100);
      expect(custom.checkInterval).toBe(60000);
    });
  });

  describe('addProduct', () => {
    it('should add a product and return it', () => {
      const product = monitor.addProduct({
        name: 'Test Product',
        url: 'https://example.com/product',
        targetPrice: 100
      });
      expect(product.id).toMatch(/^prod_/);
      expect(product.name).toBe('Test Product');
      expect(product.url).toBe('https://example.com/product');
      expect(product.targetPrice).toBe(100);
      expect(product.currentPrice).toBeNull();
      expect(product.priceHistory).toEqual([]);
      expect(product.status).toBe('active');
      expect(monitor.products.size).toBe(1);
    });

    it('should set default selector', () => {
      const product = monitor.addProduct({ name: 'Test' });
      expect(product.selector).toBe('.price');
    });
  });

  describe('removeProduct', () => {
    it('should remove an existing product', () => {
      const product = monitor.addProduct({ name: 'Test' });
      expect(monitor.removeProduct(product.id)).toBe(true);
      expect(monitor.products.size).toBe(0);
    });

    it('should return false for non-existent product', () => {
      expect(monitor.removeProduct('nonexistent')).toBe(false);
    });
  });

  describe('recordPrice', () => {
    it('should record a valid price', () => {
      const product = monitor.addProduct({ name: 'Test' });
      const result = monitor.recordPrice(product.id, 99.99);
      expect(result.price).toBe(99.99);
      expect(product.currentPrice).toBe(99.99);
      expect(product.priceHistory).toHaveLength(1);
    });

    it('should return null for invalid price', () => {
      const product = monitor.addProduct({ name: 'Test' });
      expect(monitor.recordPrice(product.id, 'invalid')).toBeNull();
      expect(monitor.recordPrice(product.id, -10)).toBeNull();
      expect(monitor.recordPrice(product.id, Infinity)).toBeNull();
    });

    it('should return null for non-existent product', () => {
      expect(monitor.recordPrice('nonexistent', 100)).toBeNull();
    });

    it('should track lowest and highest prices', () => {
      const product = monitor.addProduct({ name: 'Test' });
      monitor.recordPrice(product.id, 100);
      monitor.recordPrice(product.id, 80);
      monitor.recordPrice(product.id, 120);
      expect(product.lowestPrice).toBe(80);
      expect(product.highestPrice).toBe(120);
    });

    it('should generate alert when price drops below target', () => {
      const product = monitor.addProduct({ name: 'Test', targetPrice: 50 });
      const result = monitor.recordPrice(product.id, 40);
      expect(result.alert).not.toBeNull();
      expect(result.alert.type).toBe('price_below_target');
    });

    it('should generate alert when price rises above target', () => {
      const product = monitor.addProduct({ name: 'Test', targetPrice: 50, alertAbove: true });
      const result = monitor.recordPrice(product.id, 60);
      expect(result.alert).not.toBeNull();
      expect(result.alert.type).toBe('price_above_target');
    });

    it('should generate alert on price spike/drop', () => {
      const product = monitor.addProduct({ name: 'Test' });
      monitor.recordPrice(product.id, 100);
      const result = monitor.recordPrice(product.id, 200);
      expect(result.alert.type).toBe('price_spike');
    });

    it('should call onAlert callback', () => {
      const onAlert = jest.fn();
      const m = new PriceMonitorService({ onAlert });
      const product = m.addProduct({ name: 'Test', targetPrice: 50 });
      m.recordPrice(product.id, 40);
      expect(onAlert).toHaveBeenCalledTimes(1);
    });

    it('should trim price history beyond 100 entries', () => {
      const product = monitor.addProduct({ name: 'Test' });
      for (let i = 0; i < 105; i++) {
        monitor.recordPrice(product.id, 100 + i);
      }
      expect(product.priceHistory.length).toBeLessThanOrEqual(100);
    });

    it('should trim alerts beyond max', () => {
      const m = new PriceMonitorService({ maxAlerts: 2 });
      const product = m.addProduct({ name: 'Test', targetPrice: 50 });
      m.recordPrice(product.id, 40);
      m.recordPrice(product.id, 30);
      m.recordPrice(product.id, 20);
      expect(m.alerts.length).toBeLessThanOrEqual(2);
    });
  });

  describe('checkPrice', () => {
    it('should return product status', async () => {
      const product = monitor.addProduct({ name: 'Test', targetPrice: 100 });
      monitor.recordPrice(product.id, 90);
      const status = await monitor.checkPrice(product.id);
      expect(status.productId).toBe(product.id);
      expect(status.currentPrice).toBe(90);
      expect(status.name).toBe('Test');
    });

    it('should throw for non-existent product', async () => {
      await expect(monitor.checkPrice('nonexistent')).rejects.toThrow('Product not found');
    });
  });

  describe('checkAllPrices', () => {
    it('should check all active products', async () => {
      const p1 = monitor.addProduct({ name: 'P1' });
      const p2 = monitor.addProduct({ name: 'P2' });
      monitor.recordPrice(p1.id, 100);
      monitor.recordPrice(p2.id, 200);
      const results = await monitor.checkAllPrices();
      expect(results).toHaveLength(2);
    });

    it('should skip inactive products', async () => {
      monitor.addProduct({ name: 'P1' });
      const p2 = monitor.addProduct({ name: 'P2' });
      p2.status = 'inactive';
      const results = await monitor.checkAllPrices();
      expect(results).toHaveLength(1);
    });
  });

  describe('startMonitoring / stopMonitoring', () => {
    it('should start and stop monitoring', () => {
      expect(monitor._checkTimer).toBeNull();
      monitor.startMonitoring();
      expect(monitor._checkTimer).not.toBeNull();
      monitor.stopMonitoring();
      expect(monitor._checkTimer).toBeNull();
    });

    it('should not start monitoring twice', () => {
      monitor.startMonitoring();
      const timer = monitor._checkTimer;
      monitor.startMonitoring();
      expect(monitor._checkTimer).toBe(timer);
    });
  });

  describe('getProduct', () => {
    it('should return a product by id', () => {
      const product = monitor.addProduct({ name: 'Test' });
      expect(monitor.getProduct(product.id)).toBe(product);
    });

    it('should return undefined for non-existent product', () => {
      expect(monitor.getProduct('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllProducts', () => {
    it('should return all products', () => {
      monitor.addProduct({ name: 'A' });
      monitor.addProduct({ name: 'B' });
      expect(monitor.getAllProducts()).toHaveLength(2);
    });
  });

  describe('getActiveProducts', () => {
    it('should return only active products', () => {
      monitor.addProduct({ name: 'A' });
      const p2 = monitor.addProduct({ name: 'B' });
      p2.status = 'inactive';
      expect(monitor.getActiveProducts()).toHaveLength(1);
    });
  });

  describe('getPriceHistory', () => {
    it('should return price history for a product', () => {
      const product = monitor.addProduct({ name: 'Test' });
      monitor.recordPrice(product.id, 100);
      monitor.recordPrice(product.id, 200);
      const history = monitor.getPriceHistory(product.id);
      expect(history).toHaveLength(2);
    });

    it('should respect limit', () => {
      const product = monitor.addProduct({ name: 'Test' });
      for (let i = 0; i < 10; i++) {
        monitor.recordPrice(product.id, 100 + i);
      }
      expect(monitor.getPriceHistory(product.id, 3)).toHaveLength(3);
    });

    it('should return empty array for non-existent product', () => {
      expect(monitor.getPriceHistory('nonexistent')).toEqual([]);
    });
  });

  describe('getAlerts', () => {
    it('should return alerts', () => {
      const product = monitor.addProduct({ name: 'Test', targetPrice: 50 });
      monitor.recordPrice(product.id, 40);
      monitor.recordPrice(product.id, 30);
      const alerts = monitor.getAlerts();
      expect(alerts).toHaveLength(2);
    });

    it('should filter unread alerts', () => {
      const product = monitor.addProduct({ name: 'Test', targetPrice: 50 });
      monitor.recordPrice(product.id, 40);
      monitor.recordPrice(product.id, 30);
      monitor.alerts[0].read = true;
      expect(monitor.getAlerts({ unreadOnly: true })).toHaveLength(1);
    });

    it('should filter by productId', () => {
      const p1 = monitor.addProduct({ name: 'P1', targetPrice: 50 });
      const p2 = monitor.addProduct({ name: 'P2', targetPrice: 50 });
      monitor.recordPrice(p1.id, 40);
      monitor.recordPrice(p2.id, 40);
      expect(monitor.getAlerts({ productId: p1.id })).toHaveLength(1);
    });
  });

  describe('markAlertRead', () => {
    it('should mark an alert as read', () => {
      const product = monitor.addProduct({ name: 'Test', targetPrice: 50 });
      monitor.recordPrice(product.id, 40);
      const alertId = monitor.alerts[0].id;
      expect(monitor.markAlertRead(alertId)).toBe(true);
      expect(monitor.alerts[0].read).toBe(true);
    });

    it('should return false for non-existent alert', () => {
      expect(monitor.markAlertRead('nonexistent')).toBe(false);
    });
  });

  describe('getProductStats', () => {
    it('should return stats for a product with history', () => {
      const product = monitor.addProduct({ name: 'Test' });
      monitor.recordPrice(product.id, 100);
      monitor.recordPrice(product.id, 200);
      monitor.recordPrice(product.id, 150);
      const stats = monitor.getProductStats(product.id);
      expect(stats.name).toBe('Test');
      expect(stats.lowestPrice).toBe(100);
      expect(stats.highestPrice).toBe(200);
      expect(stats.priceChanges).toBe(3);
    });

    it('should return null for non-existent product', () => {
      expect(monitor.getProductStats('nonexistent')).toBeNull();
    });

    it('should return null for product with no history', () => {
      const product = monitor.addProduct({ name: 'Test' });
      expect(monitor.getProductStats(product.id)).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return accurate stats', () => {
      const p1 = monitor.addProduct({ name: 'A', targetPrice: 50 });
      const p2 = monitor.addProduct({ name: 'B' });
      p2.status = 'inactive';
      monitor.recordPrice(p1.id, 40);
      const stats = monitor.getStats();
      expect(stats.products.total).toBe(2);
      expect(stats.products.active).toBe(1);
      expect(stats.alerts.total).toBe(1);
      expect(stats.monitoring.active).toBe(false);
    });
  });

  describe('destroy', () => {
    it('should stop monitoring and clear data', () => {
      monitor.startMonitoring();
      monitor.addProduct({ name: 'Test' });
      monitor.destroy();
      expect(monitor._checkTimer).toBeNull();
      expect(monitor.products.size).toBe(0);
      expect(monitor.alerts).toHaveLength(0);
    });
  });

  describe('stopMonitoring additional', () => {
    it('should not throw when stopping an already stopped monitor', () => {
      expect(() => monitor.stopMonitoring()).not.toThrow();
    });
  });

  describe('getProductStats trend detection', () => {
    it('should detect rising trend', () => {
      const product = monitor.addProduct({ name: 'Test' });
      for (let i = 0; i < 10; i++) {
        monitor.recordPrice(product.id, 100);
      }
      monitor.recordPrice(product.id, 150);
      const stats = monitor.getProductStats(product.id);
      expect(stats.trend).toBe('rising');
    });

    it('should detect falling trend', () => {
      const product = monitor.addProduct({ name: 'Test' });
      for (let i = 0; i < 10; i++) {
        monitor.recordPrice(product.id, 100);
      }
      monitor.recordPrice(product.id, 50);
      const stats = monitor.getProductStats(product.id);
      expect(stats.trend).toBe('falling');
    });
  });
});
