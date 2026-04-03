class EnhancedNodeEditor {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.nodes = [];
    this.connections = [];
    this.subWorkflows = new Map();
    this.plugins = new Map();
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = options.maxHistory || 50;
    this.clipboard = null;
    this.selectedNode = null;
    this.selectedNodes = [];
    this.draggingNode = null;
    this.connectingFrom = null;
    this.selectionBox = null;
    this.offset = { x: 0, y: 0 };
    this.pan = { x: 0, y: 0 };
    this.zoom = 1;
    this.gridSize = 20;
    this.nodeWidth = 200;
    this.miniMapEnabled = true;
    this.snapToGrid = true;
    this._lastRenderTime = 0;
    this._renderThrottle = 16;
    this._dirty = true;
    this.onChange = options.onChange || (() => {});

    // XSS防护 - 使用统一工具库或内置实现
    this.utils = window.UltraWorkUtils || {};
    this.escapeHtml = this.utils.escapeHtml || this._defaultEscapeHtml;
    this.onExecute = options.onExecute || (() => {});
    this._init();
  }

  _init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {return;}

    this._createCanvas();
    this._createToolbar();
    this._createSidePanel();
    this._createMiniMap();
    this._setupEvents();
    this._setupKeyboard();
    this._renderLoop();
  }

  /**
   * 默认HTML转义方法（XSS防护）
   */
  _defaultEscapeHtml(str) {
    if (!str) {return '';}
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  _createCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'node-canvas';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '600px';
    this.canvas.style.background = '#1a1a2e';
    this.canvas.style.borderRadius = '12px';
    this.canvas.style.cursor = 'default';
    this.ctx = this.canvas.getContext('2d');

    const wrapper = document.createElement('div');
    wrapper.className = 'node-editor-wrapper';
    wrapper.style.position = 'relative';
    wrapper.appendChild(this.canvas);
    this.container.innerHTML = '';
    this.container.appendChild(wrapper);

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'node-toolbar';
    toolbar.innerHTML = `
      <div class="toolbar-group">
        <button class="toolbar-btn" id="btn-undo" title="撤销 (Ctrl+Z)">↶</button>
        <button class="toolbar-btn" id="btn-redo" title="重做 (Ctrl+Y)">↷</button>
      </div>
      <div class="toolbar-group">
        <button class="toolbar-btn" id="btn-copy" title="复制 (Ctrl+C)">📋</button>
        <button class="toolbar-btn" id="btn-paste" title="粘贴 (Ctrl+V)">📄</button>
        <button class="toolbar-btn" id="btn-delete" title="删除 (Del)">🗑️</button>
      </div>
      <div class="toolbar-group">
        <button class="toolbar-btn" id="btn-zoom-in" title="放大 (+)">🔍+</button>
        <button class="toolbar-btn" id="btn-zoom-out" title="缩小 (-)">🔍-</button>
        <button class="toolbar-btn" id="btn-fit" title="适应画布 (F)">📐</button>
      </div>
      <div class="toolbar-group">
        <input type="text" id="node-search" placeholder="搜索节点..." class="node-search" />
      </div>
      <div class="toolbar-group">
        <button class="toolbar-btn primary" id="btn-execute" title="执行 (F5)">▶ 执行</button>
        <button class="toolbar-btn" id="btn-save" title="保存 (Ctrl+S)">💾</button>
        <button class="toolbar-btn" id="btn-load" title="加载">📂</button>
      </div>
    `;

    this.container.insertBefore(toolbar, this.container.firstChild);

    document.getElementById('btn-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => this.redo());
    document.getElementById('btn-copy')?.addEventListener('click', () => this.copy());
    document.getElementById('btn-paste')?.addEventListener('click', () => this.paste());
    document.getElementById('btn-delete')?.addEventListener('click', () => this.deleteSelected());
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.zoomIn());
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.zoomOut());
    document.getElementById('btn-fit')?.addEventListener('click', () => this.fitToView());
    document.getElementById('btn-execute')?.addEventListener('click', () => this.execute());
    document.getElementById('btn-save')?.addEventListener('click', () => this.save());
    document.getElementById('btn-load')?.addEventListener('click', () => this.load());

    document.getElementById('node-search')?.addEventListener('input', (e) => {
      this._filterNodes(e.target.value);
    });
  }

  _createSidePanel() {
    const panel = document.createElement('div');
    panel.className = 'node-side-panel';
    panel.id = 'node-panel';
    panel.innerHTML = `
      <div class="panel-header">
        <h4>节点库</h4>
        <input type="text" id="panel-search" placeholder="搜索..." />
      </div>
      <div class="panel-categories" id="panel-categories"></div>
      <div class="panel-properties" id="panel-properties" style="display:none">
        <h4>属性</h4>
        <div id="property-editor"></div>
      </div>
    `;

    this.container.appendChild(panel);
    this._renderNodeLibrary();
  }

  _createMiniMap() {
    if (!this.miniMapEnabled) {return;}

    const minimap = document.createElement('canvas');
    minimap.id = 'minimap';
    minimap.width = 200;
    minimap.height = 150;
    minimap.style.cssText = `
      position: absolute;
      bottom: 10px;
      right: 10px;
      background: rgba(0,0,0,0.5);
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.2);
    `;

    this.container.querySelector('.node-editor-wrapper')?.appendChild(minimap);
    this.minimap = minimap;
    this.minimapCtx = minimap.getContext('2d');
  }

  _renderNodeLibrary() {
    const categories = {
      '基础': [
        { type: 'input', name: '输入', icon: '📥' },
        { type: 'output', name: '输出', icon: '📤' },
        { type: 'text', name: '文本', icon: '📝' },
        { type: 'number', name: '数字', icon: '🔢' },
        { type: 'boolean', name: '布尔', icon: '✅' }
      ],
      'AI': [
        { type: 'llm_call', name: 'LLM调用', icon: '🧠' },
        { type: 'vision', name: '视觉分析', icon: '👁️' },
        { type: 'embed', name: '文本嵌入', icon: '🧬' }
      ],
      '浏览器': [
        { type: 'browser_navigate', name: '导航', icon: '🌐' },
        { type: 'browser_extract', name: '提取', icon: '📊' },
        { type: 'browser_screenshot', name: '截图', icon: '📸' },
        { type: 'browser_click', name: '点击', icon: '👆' },
        { type: 'browser_type', name: '输入', icon: '⌨️' }
      ],
      '电商': [
        { type: 'price_check', name: '价格检查', icon: '💰' },
        { type: 'price_predict', name: '价格预测', icon: '📈' },
        { type: 'price_alert', name: '价格告警', icon: '🚨' }
      ],
      '逻辑': [
        { type: 'condition', name: '条件判断', icon: '❓' },
        { type: 'switch', name: '分支', icon: '🔀' },
        { type: 'loop', name: '循环', icon: '🔄' },
        { type: 'merge', name: '合并', icon: '🔗' }
      ],
      '工具': [
        { type: 'delay', name: '延迟', icon: '⏰' },
        { type: 'json_parse', name: 'JSON解析', icon: '📋' },
        { type: 'http_request', name: 'HTTP请求', icon: '🌐' },
        { type: 'notify', name: '通知', icon: '🔔' },
        { type: 'attest', name: '存证', icon: '🔗' }
      ]
    };

    const container = document.getElementById('panel-categories');
    if (!container) {return;}

    container.innerHTML = '';

    for (const [category, items] of Object.entries(categories)) {
      const catEl = document.createElement('div');
      catEl.className = 'panel-category';
      catEl.innerHTML = `
        <div class="category-header">${this.escapeHtml(category)}</div>
        <div class="category-items">
          ${items.map((item) => `
            <div class="node-item" data-type="${this.escapeHtml(item.type)}" draggable="true">
              <span class="node-icon">${this.escapeHtml(item.icon)}</span>
              <span class="node-name">${this.escapeHtml(item.name)}</span>
            </div>
          `).join('')}
        </div>
      `;

      catEl.querySelectorAll('.node-item').forEach((item) => {
        item.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('nodeType', item.dataset.type);
        });
      });

      container.appendChild(catEl);
    }
  }

  _setupEvents() {
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e));
    this.canvas.addEventListener('dblclick', (e) => this._onDblClick(e));
    this.canvas.addEventListener('contextmenu', (e) => this._onContextMenu(e));

    this.canvas.addEventListener('dragover', (e) => e.preventDefault());
    this.canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData('nodeType');
      if (nodeType) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.zoom - this.pan.x;
        const y = (e.clientY - rect.top) / this.zoom - this.pan.y;
        this.addNode(nodeType, x, y);
      }
    });
  }

  _setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {return;}

      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
        case 'z': e.preventDefault(); this.undo(); break;
        case 'y': e.preventDefault(); this.redo(); break;
        case 'c': e.preventDefault(); this.copy(); break;
        case 'v': e.preventDefault(); this.paste(); break;
        case 's': e.preventDefault(); this.save(); break;
        case 'a': e.preventDefault(); this.selectAll(); break;
        }
      } else {
        switch (e.key) {
        case 'Delete': this.deleteSelected(); break;
        case '+': case '=': this.zoomIn(); break;
        case '-': this.zoomOut(); break;
        case 'f': case 'F': this.fitToView(); break;
        case 'F5': e.preventDefault(); this.execute(); break;
        case 'Escape': this._clearSelection(); break;
        }
      }
    });
  }

  _onMouseDown(e) {
    const pos = this._screenToWorld(this._getMousePos(e));

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      this._panning = true;
      this._panStart = { x: e.clientX - this.pan.x, y: e.clientY - this.pan.y };
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    const node = this._getNodeAt(pos);

    if (node) {
      if (e.shiftKey) {
        this._toggleSelection(node);
      } else if (!this.selectedNodes.includes(node)) {
        this.selectedNodes = [node];
      }
      this.selectedNode = node;
      this.draggingNode = node;
      this.offset = { x: pos.x - node.x, y: pos.y - node.y };

      const port = this._getPortAt(pos, node);
      if (port && port.type === 'output') {
        this.connectingFrom = { node, port: port.name };
      }
    } else {
      if (!e.shiftKey) {
        this.selectedNodes = [];
        this.selectedNode = null;
      }
      this.selectionBox = { start: pos, end: pos };
    }

    this._dirty = true;
  }

  _onMouseMove(e) {
    const pos = this._screenToWorld(this._getMousePos(e));

    if (this._panning) {
      this.pan.x = e.clientX - this._panStart.x;
      this.pan.y = e.clientY - this._panStart.y;
      this._dirty = true;
      return;
    }

    if (this.draggingNode) {
      let newX = pos.x - this.offset.x;
      let newY = pos.y - this.offset.y;

      if (this.snapToGrid) {
        newX = Math.round(newX / this.gridSize) * this.gridSize;
        newY = Math.round(newY / this.gridSize) * this.gridSize;
      }

      const dx = newX - this.draggingNode.x;
      const dy = newY - this.draggingNode.y;

      for (const node of this.selectedNodes) {
        node.x += dx;
        node.y += dy;
      }

      this.draggingNode.x = newX;
      this.draggingNode.y = newY;

      this._dirty = true;
    }

    if (this.connectingFrom) {
      this._dirty = true;
    }

    if (this.selectionBox) {
      this.selectionBox.end = pos;
      this._dirty = true;
    }
  }

  _onMouseUp(e) {
    if (this._panning) {
      this._panning = false;
      this.canvas.style.cursor = 'default';
      return;
    }

    if (this.connectingFrom) {
      const pos = this._screenToWorld(this._getMousePos(e));
      const targetNode = this._getNodeAt(pos);

      if (targetNode && targetNode !== this.connectingFrom.node) {
        const port = this._getPortAt(pos, targetNode);
        if (port && port.type === 'input') {
          this.connections.push({
            source: { nodeId: this.connectingFrom.node.id, output: this.connectingFrom.port },
            target: { nodeId: targetNode.id, input: port.name }
          });
          this._saveHistory();
          this.onChange(this.toJSON());
        }
      }
      this.connectingFrom = null;
    }

    if (this.selectionBox) {
      this._selectInBox(this.selectionBox);
      this.selectionBox = null;
    }

    if (this.draggingNode) {
      this._saveHistory();
      this.onChange(this.toJSON());
    }

    this.draggingNode = null;
    this._dirty = true;
  }

  _onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, this.zoom * delta));

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    this.pan.x = mouseX - (mouseX - this.pan.x) * (newZoom / this.zoom);
    this.pan.y = mouseY - (mouseY - this.pan.y) * (newZoom / this.zoom);
    this.zoom = newZoom;

    this._dirty = true;
  }

  _onDblClick(e) {
    const pos = this._screenToWorld(this._getMousePos(e));
    const node = this._getNodeAt(pos);

    if (node) {
      this._showPropertyEditor(node);
    }
  }

  _onContextMenu(e) {
    e.preventDefault();
    // Context menu implementation
  }

  _getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _screenToWorld(screen) {
    return {
      x: (screen.x - this.pan.x) / this.zoom,
      y: (screen.y - this.pan.y) / this.zoom
    };
  }

  _getNodeAt(pos) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      if (pos.x >= node.x && pos.x <= node.x + this.nodeWidth &&
          pos.y >= node.y && pos.y <= node.y + (node.height || 100)) {
        return node;
      }
    }
    return null;
  }

  _getPortAt(pos, node) {
    const portRadius = 10;

    for (let i = 0; i < (node.inputs || []).length; i++) {
      const py = node.y + 45 + i * 28;
      if (Math.abs(pos.x - node.x) < portRadius && Math.abs(pos.y - py) < portRadius) {
        return { type: 'input', name: node.inputs[i].name, index: i };
      }
    }

    for (let i = 0; i < (node.outputs || []).length; i++) {
      const py = node.y + 45 + i * 28;
      if (Math.abs(pos.x - (node.x + this.nodeWidth)) < portRadius && Math.abs(pos.y - py) < portRadius) {
        return { type: 'output', name: node.outputs[i].name, index: i };
      }
    }

    return null;
  }

  _toggleSelection(node) {
    const idx = this.selectedNodes.indexOf(node);
    if (idx > -1) {
      this.selectedNodes.splice(idx, 1);
    } else {
      this.selectedNodes.push(node);
    }
  }

  _selectInBox(box) {
    const minX = Math.min(box.start.x, box.end.x);
    const maxX = Math.max(box.start.x, box.end.x);
    const minY = Math.min(box.start.y, box.end.y);
    const maxY = Math.max(box.start.y, box.end.y);

    this.selectedNodes = this.nodes.filter((n) =>
      n.x >= minX && n.x + this.nodeWidth <= maxX &&
      n.y >= minY && n.y + (n.height || 100) <= maxY
    );
  }

  _clearSelection() {
    this.selectedNodes = [];
    this.selectedNode = null;
    this._dirty = true;
  }

  _renderLoop() {
    if (this._dirty) {
      this._render();
      this._dirty = false;
    }
    requestAnimationFrame(() => this._renderLoop());
  }

  _render() {
    if (!this.ctx) {return;}

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(this.pan.x, this.pan.y);
    ctx.scale(this.zoom, this.zoom);

    this._drawGrid(ctx);

    for (const conn of this.connections) {
      this._drawConnection(ctx, conn);
    }

    if (this.connectingFrom) {
      this._drawTempConnection(ctx, this.connectingFrom);
    }

    for (const node of this.nodes) {
      this._drawNode(ctx, node);
    }

    if (this.selectionBox) {
      this._drawSelectionBox(ctx);
    }

    ctx.restore();

    this._drawMiniMap();
  }

  _drawGrid(ctx) {
    const gridSize = this.gridSize;
    const startX = -this.pan.x / this.zoom;
    const startY = -this.pan.y / this.zoom;
    const endX = startX + this.canvas.width / this.zoom;
    const endY = startY + this.canvas.height / this.zoom;

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;

    for (let x = Math.floor(startX / gridSize) * gridSize; x < endX; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }

    for (let y = Math.floor(startY / gridSize) * gridSize; y < endY; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }
  }

  _drawNode(ctx, node) {
    const x = node.x;
    const y = node.y;
    const w = this.nodeWidth;
    const h = node.height || 100;
    const isSelected = this.selectedNodes.includes(node);

    const statusColors = {
      idle: '#2d2d4a',
      running: '#2980b9',
      completed: '#27ae60',
      failed: '#e74c3c'
    };

    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, statusColors[node.status] || statusColors.idle);
    grad.addColorStop(1, 'rgba(0,0,0,0.3)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();

    ctx.strokeStyle = isSelected ? '#3498db' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`${node.icon || '⚙️'} ${node.name}`, x + 12, y + 28);

    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 35);
    ctx.lineTo(x + w - 10, y + 35);
    ctx.stroke();

    for (let i = 0; i < (node.inputs || []).length; i++) {
      const port = node.inputs[i];
      const py = y + 50 + i * 28;

      ctx.fillStyle = '#3498db';
      ctx.beginPath();
      ctx.arc(x, py, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ddd';
      ctx.font = '11px sans-serif';
      ctx.fillText(port.name, x + 14, py + 4);
    }

    for (let i = 0; i < (node.outputs || []).length; i++) {
      const port = node.outputs[i];
      const py = y + 50 + i * 28;

      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(x + w, py, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ddd';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(port.name, x + w - 14, py + 4);
      ctx.textAlign = 'left';
    }
  }

  _drawConnection(ctx, conn) {
    const sourceNode = this.nodes.find((n) => n.id === conn.source.nodeId);
    const targetNode = this.nodes.find((n) => n.id === conn.target.nodeId);

    if (!sourceNode || !targetNode) {return;}

    const outputIndex = (sourceNode.outputs || []).findIndex((o) => o.name === conn.source.output);
    const inputIndex = (targetNode.inputs || []).findIndex((i) => i.name === conn.target.input);

    if (outputIndex === -1 || inputIndex === -1) {return;}

    const x1 = sourceNode.x + this.nodeWidth;
    const y1 = sourceNode.y + 50 + outputIndex * 28;
    const x2 = targetNode.x;
    const y2 = targetNode.y + 50 + inputIndex * 28;

    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);

    const cpOffset = Math.max(50, Math.abs(x2 - x1) * 0.3);
    ctx.bezierCurveTo(x1 + cpOffset, y1, x2 - cpOffset, y2, x2, y2);
    ctx.stroke();

    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(x2, y2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawTempConnection(ctx, from) {
    // Simplified for space
  }

  _drawSelectionBox(ctx) {
    if (!this.selectionBox) {return;}

    const { start, end } = this.selectionBox;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);

    ctx.strokeStyle = 'rgba(52, 152, 219, 0.8)';
    ctx.fillStyle = 'rgba(52, 152, 219, 0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  _drawMiniMap() {
    if (!this.minimap || !this.minimapCtx) {return;}

    const ctx = this.minimapCtx;
    const scale = 0.05;

    ctx.clearRect(0, 0, 200, 150);

    for (const node of this.nodes) {
      ctx.fillStyle = this.selectedNodes.includes(node) ? '#3498db' : '#4a4a6a';
      ctx.fillRect(node.x * scale, node.y * scale, this.nodeWidth * scale, 5);
    }
  }

  _resize() {
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = 600;
    this._dirty = true;
  }

  addNode(type, x = 100, y = 100, data = {}) {
    const node = {
      id: `node_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`,
      type,
      name: data.name || type,
      icon: data.icon || '⚙️',
      x: this.snapToGrid ? Math.round(x / this.gridSize) * this.gridSize : x,
      y: this.snapToGrid ? Math.round(y / this.gridSize) * this.gridSize : y,
      inputs: data.inputs || [],
      outputs: data.outputs || [],
      data: data.data || {},
      status: 'idle',
      height: 100
    };

    this.nodes.push(node);
    this._saveHistory();
    this.onChange(this.toJSON());
    this._dirty = true;
    return node;
  }

  removeNode(nodeId) {
    this.nodes = this.nodes.filter((n) => n.id !== nodeId);
    this.connections = this.connections.filter(
      (c) => c.source.nodeId !== nodeId && c.target.nodeId !== nodeId
    );
    this._saveHistory();
    this.onChange(this.toJSON());
    this._dirty = true;
  }

  deleteSelected() {
    const ids = this.selectedNodes.map((n) => n.id);
    for (const id of ids) {
      this.removeNode(id);
    }
    this.selectedNodes = [];
    this.selectedNode = null;
  }

  copy() {
    this.clipboard = JSON.parse(JSON.stringify(this.selectedNodes));
  }

  paste() {
    if (!this.clipboard || this.clipboard.length === 0) {return;}

    const idMap = {};
    const offset = 50;

    for (const oldNode of this.clipboard) {
      const newNode = {
        ...oldNode,
        id: `node_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`,
        x: oldNode.x + offset,
        y: oldNode.y + offset,
        status: 'idle'
      };
      idMap[oldNode.id] = newNode.id;
      this.nodes.push(newNode);
    }

    this.selectedNodes = this.nodes.filter((n) => Object.values(idMap).includes(n.id));
    this._saveHistory();
    this.onChange(this.toJSON());
    this._dirty = true;
  }

  selectAll() {
    this.selectedNodes = [...this.nodes];
    this._dirty = true;
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.fromJSON(this.history[this.historyIndex]);
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.fromJSON(this.history[this.historyIndex]);
    }
  }

  _saveHistory() {
    const state = this.toJSON();
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(state);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.historyIndex = this.history.length - 1;
  }

  zoomIn() {
    this.zoom = Math.min(5, this.zoom * 1.2);
    this._dirty = true;
  }

  zoomOut() {
    this.zoom = Math.max(0.1, this.zoom * 0.8);
    this._dirty = true;
  }

  fitToView() {
    if (this.nodes.length === 0) {return;}

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of this.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + this.nodeWidth);
      maxY = Math.max(maxY, n.y + (n.height || 100));
    }

    const padding = 50;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    this.zoom = Math.min(
      this.canvas.width / width,
      this.canvas.height / height,
      2
    );

    this.pan.x = (this.canvas.width - width * this.zoom) / 2 - minX * this.zoom + padding * this.zoom;
    this.pan.y = (this.canvas.height - height * this.zoom) / 2 - minY * this.zoom + padding * this.zoom;

    this._dirty = true;
  }

  async execute() {
    this.onExecute(this.toJSON());
  }

  save() {
    const data = JSON.stringify(this.toJSON(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  load() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) {return;}
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          this.fromJSON(data);
        } catch (err) {
          alert(`加载失败: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  toJSON() {
    return {
      nodes: this.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        name: n.name,
        icon: n.icon,
        x: n.x,
        y: n.y,
        inputs: n.inputs,
        outputs: n.outputs,
        data: n.data
      })),
      connections: this.connections
    };
  }

  fromJSON(data) {
    this.nodes = (data.nodes || []).map((n) => ({ ...n, status: 'idle' }));
    this.connections = data.connections || [];
    this._dirty = true;
  }

  _showPropertyEditor(node) {
    const panel = document.getElementById('panel-properties');
    const editor = document.getElementById('property-editor');
    if (!panel || !editor) {return;}

    panel.style.display = 'block';

    editor.innerHTML = `
      <div class="property-group">
        <label>名称</label>
        <input type="text" value="${this.escapeHtml(node.name)}" data-field="name" />
      </div>
      <div class="property-group">
        <label>类型</label>
        <span>${this.escapeHtml(node.type)}</span>
      </div>
      <div class="property-group">
        <label>ID</label>
        <code>${this.escapeHtml(node.id)}</code>
      </div>
    `;

    editor.querySelectorAll('input').forEach((input) => {
      input.addEventListener('change', () => {
        node[input.dataset.field] = input.value;
        this._dirty = true;
        this.onChange(this.toJSON());
      });
    });
  }

  _filterNodes(keyword) {
    const items = document.querySelectorAll('.node-item');
    items.forEach((item) => {
      const name = item.querySelector('.node-name')?.textContent || '';
      const type = item.dataset.type || '';
      const match = name.toLowerCase().includes(keyword.toLowerCase()) ||
                    type.toLowerCase().includes(keyword.toLowerCase());
      item.style.display = match ? '' : 'none';
    });
  }

  registerPlugin(name, plugin) {
    this.plugins.set(name, plugin);
    if (plugin.nodeTypes) {
      for (const [type, config] of Object.entries(plugin.nodeTypes)) {
        // Register custom node types
      }
    }
  }

  destroy() {
    this.nodes = [];
    this.connections = [];
    this.history = [];
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

if (typeof window !== 'undefined') {
  window.EnhancedNodeEditor = EnhancedNodeEditor;
}
