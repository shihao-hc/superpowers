class PriceMonitorPanel {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = null;
    this.products = [];
    this.alerts = [];
    this.refreshInterval = options.refreshInterval || 10000;
    this._refreshTimer = null;
  }

  async init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) return;

    await this.loadData();
    this.render();
    this.startAutoRefresh();
  }

  async loadData() {
    try {
      const [prodRes, alertRes] = await Promise.all([
        fetch('/api/price-monitor/products'),
        fetch('/api/price-monitor/alerts')
      ]);

      if (prodRes.ok) this.products = await prodRes.json();
      if (alertRes.ok) this.alerts = await alertRes.json();
    } catch (e) {
      console.warn('[PriceMonitorPanel] Load failed:', e);
    }
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="price-monitor-panel">
        <div class="panel-header">
          <h4>💰 价格监控</h4>
          <div class="panel-actions">
            <button class="btn-create" id="btn-add-product">+ 添加商品</button>
            <button class="btn-filter" id="btn-check-all">🔄 立即检查</button>
          </div>
        </div>

        <div class="alerts-section">
          <h5>🔔 最新告警</h5>
          <div class="alerts-list" id="alerts-list"></div>
        </div>

        <div class="products-section">
          <h5>📦 监控商品</h5>
          <div class="products-grid" id="products-grid"></div>
        </div>
      </div>
    `;

    this.renderAlerts();
    this.renderProducts();
    this.bindEvents();
  }

  renderAlerts() {
    const list = document.getElementById('alerts-list');
    if (!list) return;

    list.innerHTML = '';

    const unreadAlerts = this.alerts.filter(a => !a.read).slice(0, 5);

    if (unreadAlerts.length === 0) {
      list.innerHTML = '<div class="empty-state">暂无新告警</div>';
      return;
    }

    unreadAlerts.forEach(alert => {
      const item = document.createElement('div');
      item.className = `alert-item alert-${alert.type}`;

      const icons = {
        price_below_target: '📉',
        price_above_target: '📈',
        price_spike: '🚀',
        price_drop: '💥'
      };

      item.innerHTML = `
        <span class="alert-icon">${icons[alert.type] || '⚠️'}</span>
        <div class="alert-content">
          <div class="alert-message">${this.escapeHtml(alert.message)}</div>
          <div class="alert-time">${new Date(alert.timestamp).toLocaleString()}</div>
        </div>
        <button class="alert-dismiss" data-id="${alert.id}">✕</button>
      `;

      item.querySelector('.alert-dismiss')?.addEventListener('click', async () => {
        await fetch(`/api/price-monitor/alerts/${alert.id}/read`, { method: 'POST' });
        await this.loadData();
        this.renderAlerts();
      });

      list.appendChild(item);
    });
  }

  renderProducts() {
    const grid = document.getElementById('products-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (this.products.length === 0) {
      grid.innerHTML = '<div class="empty-state">暂无监控商品，点击"+ 添加商品"开始</div>';
      return;
    }

    this.products.forEach(product => {
      const card = this.createProductCard(product);
      grid.appendChild(card);
    });
  }

  createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';

    const trendIcon = product.trend === 'rising' ? '📈' : product.trend === 'falling' ? '📉' : '➡️';
    const priceChange = product.previousPrice
      ? ((product.currentPrice - product.previousPrice) / product.previousPrice * 100).toFixed(1)
      : '0';

    card.innerHTML = `
      <div class="product-header">
        <span class="product-name">${this.escapeHtml(product.name)}</span>
        <span class="product-status status-${product.status}">${product.status === 'active' ? '监控中' : '已暂停'}</span>
      </div>
      <div class="product-body">
        <div class="product-price">
          <span class="current-price">¥${product.currentPrice || '-'}</span>
          <span class="price-change ${parseFloat(priceChange) >= 0 ? 'up' : 'down'}">${trendIcon} ${priceChange}%</span>
        </div>
        <div class="product-stats">
          <span>最低: ¥${product.lowestPrice || '-'}</span>
          <span>最高: ¥${product.highestPrice || '-'}</span>
          <span>目标: ¥${product.targetPrice || '-'}</span>
        </div>
        <div class="product-url">${this.escapeHtml(product.url || '').substring(0, 50)}...</div>
      </div>
      <div class="product-actions">
        <button class="btn-check" data-id="${product.id}">检查</button>
        <button class="btn-history" data-id="${product.id}">历史</button>
        <button class="btn-delete" data-id="${product.id}">删除</button>
      </div>
    `;

    card.querySelector('.btn-check')?.addEventListener('click', async () => {
      await this.recordPrice(product.id);
    });

    card.querySelector('.btn-history')?.addEventListener('click', () => {
      this.showHistory(product);
    });

    card.querySelector('.btn-delete')?.addEventListener('click', async () => {
      if (confirm(`确定删除 ${product.name}？`)) {
        await fetch(`/api/price-monitor/products/${product.id}`, { method: 'DELETE' });
        await this.loadData();
        this.render();
      }
    });

    return card;
  }

  async recordPrice(productId) {
    const price = prompt('输入当前价格:');
    if (!price) return;

    try {
      await fetch(`/api/price-monitor/products/${productId}/price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: parseFloat(price) })
      });

      await this.loadData();
      this.render();
    } catch (e) {
      alert('记录价格失败: ' + e.message);
    }
  }

  showHistory(product) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.innerHTML = `
      <div class="modal">
        <h3>📊 ${this.escapeHtml(product.name)} 价格历史</h3>
        <div class="history-stats">
          <div class="stat">
            <label>当前价格</label>
            <span>¥${product.currentPrice || '-'}</span>
          </div>
          <div class="stat">
            <label>最低价格</label>
            <span>¥${product.lowestPrice || '-'}</span>
          </div>
          <div class="stat">
            <label>最高价格</label>
            <span>¥${product.highestPrice || '-'}</span>
          </div>
          <div class="stat">
            <label>目标价格</label>
            <span>¥${product.targetPrice || '-'}</span>
          </div>
        </div>
        <div class="history-chart" id="history-chart">
          ${(product.priceHistory || []).slice(-20).map(h => {
            const safePrice = typeof h.price === 'number' ? h.price.toFixed(2) : '0';
            const safeHeight = Math.min(100, (h.price || 0) / (product.highestPrice || 100) * 100);
            return `<div class="history-bar" style="height: ${safeHeight}%">
              <span class="bar-price">¥${this.escapeHtml(safePrice)}</span>
            </div>`;
          }).join('')}
        </div>
        <div class="form-actions">
          <button class="btn-cancel" id="close-history">关闭</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#close-history')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  bindEvents() {
    document.getElementById('btn-add-product')?.addEventListener('click', () => {
      this.showAddProductModal();
    });

    document.getElementById('btn-check-all')?.addEventListener('click', async () => {
      await fetch('/api/price-monitor/check-all', { method: 'POST' });
      await this.loadData();
      this.render();
    });
  }

  showAddProductModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.innerHTML = `
      <div class="modal">
        <h3>📦 添加监控商品</h3>
        <div class="form-group">
          <label>商品名称</label>
          <input type="text" id="add-name" placeholder="例如: iPhone 15 Pro" />
        </div>
        <div class="form-group">
          <label>商品URL</label>
          <input type="text" id="add-url" placeholder="https://..." />
        </div>
        <div class="form-group">
          <label>目标价格 (低于此价格告警)</label>
          <input type="number" id="add-target" placeholder="可选" />
        </div>
        <div class="form-group">
          <label>CSS选择器 (用于抓取价格)</label>
          <input type="text" id="add-selector" value=".price" placeholder=".price" />
        </div>
        <div class="form-actions">
          <button class="btn-cancel" id="cancel-add">取消</button>
          <button class="btn-submit" id="submit-add">添加</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#cancel-add')?.addEventListener('click', () => modal.remove());

    modal.querySelector('#submit-add')?.addEventListener('click', async () => {
      const name = modal.querySelector('#add-name')?.value;
      const url = modal.querySelector('#add-url')?.value;
      const target = modal.querySelector('#add-target')?.value;
      const selector = modal.querySelector('#add-selector')?.value;

      if (!name) {
        alert('请输入商品名称');
        return;
      }

      try {
        await fetch('/api/price-monitor/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            url: url || '',
            targetPrice: target ? parseFloat(target) : null,
            selector: selector || '.price'
          })
        });

        modal.remove();
        await this.loadData();
        this.render();
      } catch (e) {
        alert('添加失败: ' + e.message);
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  startAutoRefresh() {
    this._refreshTimer = setInterval(async () => {
      await this.loadData();
      this.renderAlerts();
      this.renderProducts();
    }, this.refreshInterval);
  }

  stopAutoRefresh() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  escapeHtml(str) {
    // 优先使用UltraWorkUtils的escapeHtml
    if (typeof window !== 'undefined' && window.UltraWorkUtils && window.UltraWorkUtils.escapeHtml) {
      return window.UltraWorkUtils.escapeHtml(str);
    }
    
    // 备用实现
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  destroy() {
    this.stopAutoRefresh();
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

if (typeof window !== 'undefined') {
  window.PriceMonitorPanel = PriceMonitorPanel;
}
