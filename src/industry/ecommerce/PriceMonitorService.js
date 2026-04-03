const crypto = require('crypto');

class PriceMonitorService {
  constructor(options = {}) {
    this.products = new Map();
    this.alerts = [];
    this.maxAlerts = options.maxAlerts || 500;
    this.checkInterval = options.checkInterval || 300000;
    this._checkTimer = null;
    this.onAlert = options.onAlert || (() => {});
    this.onError = options.onError || ((e) => console.error('[PriceMonitor]', e));
  }

  addProduct(config) {
    const productId = `prod_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    const product = {
      id: productId,
      name: config.name,
      url: config.url,
      selector: config.selector || '.price',
      targetPrice: config.targetPrice || null,
      alertBelow: config.alertBelow !== false,
      alertAbove: config.alertAbove || false,
      currentPrice: null,
      previousPrice: null,
      lowestPrice: null,
      highestPrice: null,
      priceHistory: [],
      lastChecked: null,
      status: 'active',
      createdAt: Date.now()
    };

    this.products.set(productId, product);
    return product;
  }

  removeProduct(productId) {
    return this.products.delete(productId);
  }

  recordPrice(productId, price, source = 'manual') {
    const product = this.products.get(productId);
    if (!product) return null;

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice < 0 || !isFinite(numericPrice)) return null;

    product.previousPrice = product.currentPrice;
    product.currentPrice = numericPrice;
    product.lastChecked = Date.now();

    if (product.lowestPrice === null || numericPrice < product.lowestPrice) {
      product.lowestPrice = numericPrice;
    }
    if (product.highestPrice === null || numericPrice > product.highestPrice) {
      product.highestPrice = numericPrice;
    }

    product.priceHistory.push({
      price: numericPrice,
      timestamp: Date.now(),
      source
    });

    if (product.priceHistory.length > 100) {
      product.priceHistory = product.priceHistory.slice(-100);
    }

    const alert = this._checkAlerts(product, numericPrice);
    if (alert) {
      this.alerts.push(alert);
      if (this.alerts.length > this.maxAlerts) {
        this.alerts = this.alerts.slice(-this.maxAlerts);
      }
      this.onAlert(alert);
    }

    return { price: numericPrice, alert };
  }

  _checkAlerts(product, price) {
    let alertType = null;
    let message = '';

    if (product.targetPrice && product.alertBelow && price <= product.targetPrice) {
      alertType = 'price_below_target';
      message = `${product.name} 价格降至 ${price}，低于目标价 ${product.targetPrice}`;
    }

    if (product.targetPrice && product.alertAbove && price >= product.targetPrice) {
      alertType = 'price_above_target';
      message = `${product.name} 价格升至 ${price}，高于目标价 ${product.targetPrice}`;
    }

    if (product.previousPrice !== null && product.previousPrice > 0) {
      const changePercent = ((price - product.previousPrice) / product.previousPrice) * 100;

      if (Math.abs(changePercent) >= 10) {
        alertType = changePercent > 0 ? 'price_spike' : 'price_drop';
        message = `${product.name} 价格${changePercent > 0 ? '暴涨' : '暴跌'} ${Math.abs(changePercent).toFixed(1)}%`;
      }
    }

    if (!alertType) return null;

    return {
      id: `alert_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
      productId: product.id,
      productName: product.name,
      type: alertType,
      message,
      price,
      previousPrice: product.previousPrice,
      targetPrice: product.targetPrice,
      timestamp: Date.now(),
      read: false
    };
  }

  async checkPrice(productId) {
    const product = this.products.get(productId);
    if (!product) throw new Error('Product not found');

    return {
      productId,
      name: product.name,
      currentPrice: product.currentPrice,
      previousPrice: product.previousPrice,
      lowestPrice: product.lowestPrice,
      highestPrice: product.highestPrice,
      targetPrice: product.targetPrice,
      lastChecked: product.lastChecked,
      status: product.status
    };
  }

  async checkAllPrices() {
    const results = [];

    for (const [productId, product] of this.products) {
      if (product.status !== 'active') continue;

      try {
        const status = await this.checkPrice(productId);
        results.push(status);
      } catch (error) {
        this.onError(error);
        results.push({ productId, error: error.message });
      }
    }

    return results;
  }

  startMonitoring() {
    if (this._checkTimer) return;

    this._checkTimer = setInterval(() => {
      this.checkAllPrices().catch(this.onError);
    }, this.checkInterval);
  }

  stopMonitoring() {
    if (this._checkTimer) {
      clearInterval(this._checkTimer);
      this._checkTimer = null;
    }
  }

  getProduct(productId) {
    return this.products.get(productId);
  }

  getAllProducts() {
    return Array.from(this.products.values());
  }

  getActiveProducts() {
    return Array.from(this.products.values()).filter(p => p.status === 'active');
  }

  getPriceHistory(productId, limit = 50) {
    const product = this.products.get(productId);
    if (!product) return [];
    return product.priceHistory.slice(-limit);
  }

  getAlerts(options = {}) {
    let alerts = [...this.alerts];

    if (options.unreadOnly) {
      alerts = alerts.filter(a => !a.read);
    }

    if (options.productId) {
      alerts = alerts.filter(a => a.productId === options.productId);
    }

    return alerts.slice(-(options.limit || 50));
  }

  markAlertRead(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.read = true;
      return true;
    }
    return false;
  }

  getProductStats(productId) {
    const product = this.products.get(productId);
    if (!product) return null;

    const history = product.priceHistory;
    if (history.length === 0) return null;

    const prices = history.map(h => h.price);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

    const recentPrices = prices.slice(-10);
    const recentAvg = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;

    const trend = recentAvg > avgPrice ? 'rising' : recentAvg < avgPrice ? 'falling' : 'stable';

    return {
      productId: product.id,
      name: product.name,
      currentPrice: product.currentPrice,
      lowestPrice: product.lowestPrice,
      highestPrice: product.highestPrice,
      avgPrice: avgPrice.toFixed(2),
      trend,
      priceChanges: history.length,
      lastChecked: product.lastChecked
    };
  }

  getStats() {
    const products = Array.from(this.products.values());

    return {
      products: {
        total: products.length,
        active: products.filter(p => p.status === 'active').length
      },
      alerts: {
        total: this.alerts.length,
        unread: this.alerts.filter(a => !a.read).length
      },
      monitoring: {
        active: this._checkTimer !== null,
        interval: this.checkInterval
      }
    };
  }

  destroy() {
    this.stopMonitoring();
    this.products.clear();
    this.alerts = [];
  }
}

module.exports = { PriceMonitorService };
