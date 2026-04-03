class AttestationViewer {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = null;
    this.attestations = [];
    this.refreshInterval = options.refreshInterval || 10000;
    this._refreshTimer = null;
  }

  async init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) return;

    await this.loadAttestations();
    this.render();
    this.startAutoRefresh();
  }

  async loadAttestations() {
    try {
      const response = await fetch('/api/attestations');
      if (response.ok) {
        this.attestations = await response.json();
      }
    } catch (e) {
      console.warn('[AttestationViewer] Load failed:', e);
    }
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="attestation-viewer">
        <div class="attestation-header">
          <h4>🔗 链上存证</h4>
          <div class="attestation-stats">
            <span class="stat" id="att-stat-total">总计: ${this.attestations.length}</span>
            <span class="stat success" id="att-stat-verified">已验证: ${this.attestations.filter(a => a.verified).length}</span>
          </div>
          <div class="attestation-actions">
            <button class="btn-small" id="btn-create-attestation">+ 创建存证</button>
            <button class="btn-small" id="btn-verify-all">验证全部</button>
          </div>
        </div>
        <div class="attestation-list" id="attestation-list"></div>
      </div>
    `;

    this.renderAttestations();
    this.bindEvents();
  }

  renderAttestations() {
    const list = document.getElementById('attestation-list');
    if (!list) return;

    list.innerHTML = '';

    if (this.attestations.length === 0) {
      list.innerHTML = '<div class="empty-state">暂无存证记录</div>';
      return;
    }

    this.attestations.slice().reverse().forEach(att => {
      const card = this.createCard(att);
      list.appendChild(card);
    });
  }

  createCard(attestation) {
    const card = document.createElement('div');
    card.className = `attestation-card ${attestation.verified ? 'verified' : ''}`;

    const time = new Date(attestation.metadata?.createdAt || Date.now()).toLocaleString();
    const hash = attestation.hash ? attestation.hash.substring(0, 16) + '...' : '-';
    const type = attestation.metadata?.description || attestation.data?.type || '未知类型';

    card.innerHTML = `
      <div class="att-card-header">
        <span class="att-type">${this.escapeHtml(type)}</span>
        <span class="att-time">${time}</span>
      </div>
      <div class="att-card-body">
        <div class="att-hash">
          <span class="hash-label">哈希:</span>
          <code class="hash-value">${this.escapeHtml(hash)}</code>
          <button class="btn-copy" data-hash="${this.escapeHtml(attestation.hash)}" title="复制完整哈希">📋</button>
        </div>
        ${attestation.signature ? `
          <div class="att-signature">
            <span class="sig-label">签名:</span>
            <span class="sig-status ${attestation.verified ? 'verified' : 'unverified'}">
              ${attestation.verified ? '✅ 已验证' : '⏳ 未验证'}
            </span>
          </div>
        ` : ''}
        ${attestation.metadata?.issuer ? `
          <div class="att-issuer">
            <span class="issuer-label">发行者:</span>
            <span class="issuer-value">${this.escapeHtml(attestation.metadata.issuer)}</span>
          </div>
        ` : ''}
      </div>
      <div class="att-card-actions">
        <button class="btn-action" data-action="verify" data-id="${attestation.id}">验证</button>
        <button class="btn-action" data-action="details" data-id="${attestation.id}">详情</button>
        <button class="btn-action" data-action="export" data-id="${attestation.id}">导出</button>
      </div>
    `;

    card.querySelectorAll('.btn-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        const id = e.target.dataset.id;
        this.handleAction(action, id);
      });
    });

    card.querySelectorAll('.btn-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const hash = e.target.dataset.hash;
        navigator.clipboard?.writeText(hash);
        e.target.textContent = '✅';
        setTimeout(() => e.target.textContent = '📋', 1000);
      });
    });

    return card;
  }

  async handleAction(action, attestationId) {
    switch (action) {
      case 'verify':
        await this.verifyAttestation(attestationId);
        break;
      case 'details':
        this.showDetails(attestationId);
        break;
      case 'export':
        await this.exportAttestation(attestationId);
        break;
    }
  }

  async verifyAttestation(attestationId) {
    try {
      const response = await fetch(`/api/attestations/${attestationId}/verify`, {
        method: 'POST'
      });

      const result = await response.json();

      const att = this.attestations.find(a => a.id === attestationId);
      if (att) {
        att.verified = result.valid;
      }

      this.renderAttestations();

      return result;
    } catch (e) {
      console.error('[AttestationViewer] Verify failed:', e);
      return { valid: false, error: e.message };
    }
  }

  showDetails(attestationId) {
    const att = this.attestations.find(a => a.id === attestationId);
    if (!att) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.innerHTML = `
      <div class="modal attestation-detail-modal">
        <h3>🔗 存证详情</h3>
        <div class="detail-section">
          <label>ID</label>
          <code>${att.id}</code>
        </div>
        <div class="detail-section">
          <label>哈希</label>
          <code class="hash-full">${att.hash || '-'}</code>
        </div>
        <div class="detail-section">
          <label>数据</label>
          <pre>${JSON.stringify(att.data, null, 2)}</pre>
        </div>
        <div class="detail-section">
          <label>元数据</label>
          <pre>${JSON.stringify(att.metadata, null, 2)}</pre>
        </div>
        ${att.signature ? `
          <div class="detail-section">
            <label>签名</label>
            <code class="signature-full">${att.signature.substring(0, 64)}...</code>
          </div>
        ` : ''}
        <div class="form-actions">
          <button class="btn-cancel" id="close-detail-modal">关闭</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#close-detail-modal')?.addEventListener('click', () => {
      modal.remove();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  async exportAttestation(attestationId) {
    try {
      const response = await fetch(`/api/attestations/${attestationId}/export`);
      const data = await response.text();

      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attestation_${attestationId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[AttestationViewer] Export failed:', e);
    }
  }

  bindEvents() {
    document.getElementById('btn-create-attestation')?.addEventListener('click', () => {
      this.showCreateModal();
    });

    document.getElementById('btn-verify-all')?.addEventListener('click', async () => {
      for (const att of this.attestations) {
        await this.verifyAttestation(att.id);
      }
    });
  }

  showCreateModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.innerHTML = `
      <div class="modal">
        <h3>🔗 创建存证</h3>
        <div class="form-group">
          <label>描述</label>
          <input type="text" id="att-description" placeholder="存证用途描述" />
        </div>
        <div class="form-group">
          <label>数据 (JSON)</label>
          <textarea id="att-data" rows="5" placeholder='{"key": "value"}'></textarea>
        </div>
        <div class="form-actions">
          <button class="btn-cancel" id="cancel-create-att">取消</button>
          <button class="btn-submit" id="submit-create-att">创建</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#cancel-create-att')?.addEventListener('click', () => {
      modal.remove();
    });

    modal.querySelector('#submit-create-att')?.addEventListener('click', async () => {
      const description = modal.querySelector('#att-description')?.value;
      const dataStr = modal.querySelector('#att-data')?.value;

      let data;
      try {
        data = JSON.parse(dataStr || '{}');
      } catch (e) {
        alert('JSON 格式错误');
        return;
      }

      try {
        await fetch('/api/attestations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, description })
        });

        await this.loadAttestations();
        this.renderAttestations();
        modal.remove();
      } catch (e) {
        alert('创建失败: ' + e.message);
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  startAutoRefresh() {
    this._refreshTimer = setInterval(async () => {
      await this.loadAttestations();
      this.renderAttestations();
    }, this.refreshInterval);
  }

  stopAutoRefresh() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
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
  window.AttestationViewer = AttestationViewer;
}
