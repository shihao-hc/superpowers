class ModelMarketViewer {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = null;
    this.models = [];
    this.filter = { industry: null, type: null, sortBy: 'rating' };
    this.refreshInterval = options.refreshInterval || 10000;
    this._refreshTimer = null;
  }

  async init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) return;

    await this.loadModels();
    this.render();
    this.startAutoRefresh();
  }

  async loadModels() {
    try {
      const params = new URLSearchParams();
      if (this.filter.industry) params.set('industry', this.filter.industry);
      if (this.filter.type) params.set('type', this.filter.type);
      if (this.filter.sortBy) params.set('sortBy', this.filter.sortBy);

      const response = await fetch(`/api/models?${params}`);
      if (response.ok) {
        this.models = await response.json();
      }
    } catch (e) {
      console.warn('[ModelMarketViewer] Load failed:', e);
    }
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="model-market">
        <div class="market-header">
          <h4>🧠 模型市场</h4>
          <div class="market-filters">
            <select id="filter-industry">
              <option value="">全部行业</option>
              <option value="finance">金融</option>
              <option value="ecommerce">电商</option>
              <option value="general">通用</option>
              <option value="healthcare">医疗</option>
            </select>
            <select id="filter-type">
              <option value="">全部类型</option>
              <option value="federated">联邦学习</option>
              <option value="pretrained">预训练</option>
            </select>
            <select id="filter-sort">
              <option value="rating">按评分</option>
              <option value="downloads">按下载</option>
              <option value="price">按价格</option>
            </select>
          </div>
          <button class="btn-create" id="btn-train-model">+ 训练新模型</button>
        </div>
        <div class="model-grid" id="model-grid"></div>
      </div>
    `;

    this.renderModels();
    this.bindEvents();
  }

  renderModels() {
    const grid = document.getElementById('model-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (this.models.length === 0) {
      grid.innerHTML = '<div class="empty-state">暂无可用模型</div>';
      return;
    }

    this.models.forEach(model => {
      const card = this.createModelCard(model);
      grid.appendChild(card);
    });
  }

  createModelCard(model) {
    const card = document.createElement('div');
    card.className = 'model-card';

    const typeBadge = model.type === 'federated' ? '联邦学习' : '预训练';
    const typeColor = model.type === 'federated' ? '#4CAF50' : '#2196F3';

    card.innerHTML = `
      <div class="model-header">
        <span class="model-name">${this.escapeHtml(model.name)}</span>
        <span class="model-type" style="background:${typeColor}20;color:${typeColor}">${typeBadge}</span>
      </div>
      <div class="model-body">
        <div class="model-industry">${this.escapeHtml(model.industry || '通用')}</div>
        <div class="model-rating">
          ${this.renderStars(model.rating)}
          <span class="rating-num">${(model.rating || 0).toFixed(1)}</span>
        </div>
        <div class="model-stats">
          <span>下载: ${model.downloads || 0}</span>
          <span>价格: ${model.price || 0} 积分</span>
        </div>
      </div>
      <div class="model-actions">
        <button class="btn-subscribe" data-id="${model.id}">订阅</button>
        <button class="btn-details" data-id="${model.id}">详情</button>
      </div>
    `;

    card.querySelector('.btn-subscribe')?.addEventListener('click', () => {
      this.subscribeModel(model.id);
    });

    card.querySelector('.btn-details')?.addEventListener('click', () => {
      this.showDetails(model);
    });

    return card;
  }

  renderStars(rating) {
    const fullStars = Math.floor(rating || 0);
    const hasHalf = (rating || 0) % 1 >= 0.5;
    let stars = '';

    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars += '⭐';
      } else if (i === fullStars && hasHalf) {
        stars += '⭐';
      } else {
        stars += '☆';
      }
    }

    return stars;
  }

  async subscribeModel(modelId) {
    try {
      const response = await fetch(`/api/models/${modelId}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'basic' })
      });

      const result = await response.json();
      if (result.success) {
        alert('订阅成功！');
        await this.loadModels();
        this.renderModels();
      }
    } catch (e) {
      alert('订阅失败: ' + e.message);
    }
  }

  showDetails(model) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.innerHTML = `
      <div class="modal">
        <h3>🧠 ${this.escapeHtml(model.name)}</h3>
        <div class="detail-section">
          <label>行业</label>
          <span>${this.escapeHtml(model.industry || '通用')}</span>
        </div>
        <div class="detail-section">
          <label>类型</label>
          <span>${model.type === 'federated' ? '联邦学习' : '预训练'}</span>
        </div>
        <div class="detail-section">
          <label>评分</label>
          <span>${this.renderStars(model.rating)} (${(model.rating || 0).toFixed(1)})</span>
        </div>
        <div class="detail-section">
          <label>下载量</label>
          <span>${model.downloads || 0}</span>
        </div>
        <div class="detail-section">
          <label>价格</label>
          <span>${model.price || 0} 积分</span>
        </div>
        <div class="form-actions">
          <button class="btn-cancel" id="close-model-modal">关闭</button>
          <button class="btn-submit" id="subscribe-model-btn" data-id="${model.id}">订阅</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#close-model-modal')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#subscribe-model-btn')?.addEventListener('click', () => {
      this.subscribeModel(model.id);
      modal.remove();
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  bindEvents() {
    document.getElementById('filter-industry')?.addEventListener('change', (e) => {
      this.filter.industry = e.target.value || null;
      this.refreshModels();
    });

    document.getElementById('filter-type')?.addEventListener('change', (e) => {
      this.filter.type = e.target.value || null;
      this.refreshModels();
    });

    document.getElementById('filter-sort')?.addEventListener('change', (e) => {
      this.filter.sortBy = e.target.value;
      this.refreshModels();
    });

    document.getElementById('btn-train-model')?.addEventListener('click', () => {
      this.showTrainModal();
    });
  }

  async refreshModels() {
    await this.loadModels();
    this.renderModels();
  }

  showTrainModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.innerHTML = `
      <div class="modal">
        <h3>🧠 训练新模型</h3>
        <div class="form-group">
          <label>模型名称</label>
          <input type="text" id="train-name" placeholder="输入模型名称" />
        </div>
        <div class="form-group">
          <label>行业</label>
          <select id="train-industry">
            <option value="finance">金融</option>
            <option value="ecommerce">电商</option>
            <option value="general">通用</option>
            <option value="healthcare">医疗</option>
          </select>
        </div>
        <div class="form-group">
          <label>参与节点数</label>
          <input type="number" id="train-nodes" value="3" min="2" max="10" />
        </div>
        <div class="form-actions">
          <button class="btn-cancel" id="cancel-train">取消</button>
          <button class="btn-submit" id="start-train">开始训练</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#cancel-train')?.addEventListener('click', () => modal.remove());

    modal.querySelector('#start-train')?.addEventListener('click', async () => {
      const name = modal.querySelector('#train-name')?.value;
      const industry = modal.querySelector('#train-industry')?.value;
      const nodes = parseInt(modal.querySelector('#train-nodes')?.value) || 3;

      if (!name) {
        alert('请输入模型名称');
        return;
      }

      try {
        const response = await fetch('/api/models/train', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            industry,
            participants: Array.from({ length: nodes }, (_, i) => ({ id: `node_${i + 1}`, dataSize: 1000 }))
          })
        });

        const result = await response.json();
        alert(`训练任务已启动: ${result.id}`);
        modal.remove();

        await this.loadModels();
        this.renderModels();
      } catch (e) {
        alert('启动训练失败: ' + e.message);
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  startAutoRefresh() {
    this._refreshTimer = setInterval(async () => {
      await this.loadModels();
      this.renderModels();
    }, this.refreshInterval);
  }

  stopAutoRefresh() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  escapeHtml(str) {
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
  window.ModelMarketViewer = ModelMarketViewer;
}
