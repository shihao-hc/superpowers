class NodeEditor {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.nodes = [];
    this.connections = [];
    this.selectedNode = null;
    this.draggingNode = null;
    this.connectingFrom = null;
    this.offset = { x: 0, y: 0 };
    this.zoom = 1;
    this.gridSize = 20;
    this.nodeWidth = 180;
    this.nodeHeight = 100;
    this.onChange = options.onChange || (() => {});
    this.onExecute = options.onExecute || (() => {});
    this._init();
  }

  _init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) return;

    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '600px';
    this.canvas.style.background = '#1a1a2e';
    this.canvas.style.borderRadius = '12px';
    this.canvas.style.cursor = 'default';
    this.ctx = this.canvas.getContext('2d');

    this.container.innerHTML = '';
    this.container.appendChild(this.canvas);

    this._resize();
    this._setupEvents();
    this._render();

    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = 600;
    this._render();
  }

  _setupEvents() {
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e));
    this.canvas.addEventListener('dblclick', (e) => this._onDblClick(e));
  }

  _onMouseDown(e) {
    const pos = this._getMousePos(e);
    const node = this._getNodeAt(pos);

    if (node) {
      this.selectedNode = node;
      this.draggingNode = node;
      this.offset = {
        x: pos.x - node.x,
        y: pos.y - node.y
      };

      const port = this._getPortAt(pos, node);
      if (port && port.type === 'output') {
        this.connectingFrom = { node, port: port.name };
      }
    } else {
      this.selectedNode = null;
    }

    this._render();
  }

  _onMouseMove(e) {
    const pos = this._getMousePos(e);

    if (this.draggingNode) {
      this.draggingNode.x = pos.x - this.offset.x;
      this.draggingNode.y = pos.y - this.offset.y;
      this._render();
    }

    if (this.connectingFrom) {
      this._render();
      this._drawTempConnection(this.connectingFrom, pos);
    }
  }

  _onMouseUp(e) {
    if (this.connectingFrom) {
      const pos = this._getMousePos(e);
      const targetNode = this._getNodeAt(pos);

      if (targetNode && targetNode !== this.connectingFrom.node) {
        const port = this._getPortAt(pos, targetNode);
        if (port && port.type === 'input') {
          this.connections.push({
            source: { nodeId: this.connectingFrom.node.id, output: this.connectingFrom.port },
            target: { nodeId: targetNode.id, input: port.name }
          });
          this.onChange(this.toJSON());
        }
      }

      this.connectingFrom = null;
    }

    this.draggingNode = null;
    this._render();
  }

  _onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoom = Math.max(0.3, Math.min(3, this.zoom * delta));
    this._render();
  }

  _onDblClick(e) {
    const pos = this._getMousePos(e);
    const node = this._getNodeAt(pos);

    if (node && node.onDblClick) {
      node.onDblClick(node);
    }
  }

  _getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / this.zoom,
      y: (e.clientY - rect.top) / this.zoom
    };
  }

  _getNodeAt(pos) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      if (pos.x >= node.x && pos.x <= node.x + this.nodeWidth &&
          pos.y >= node.y && pos.y <= node.y + this.nodeHeight) {
        return node;
      }
    }
    return null;
  }

  _getPortAt(pos, node) {
    const portRadius = 8;

    for (let i = 0; i < (node.inputs || []).length; i++) {
      const py = node.y + 40 + i * 25;
      if (Math.abs(pos.x - node.x) < portRadius && Math.abs(pos.y - py) < portRadius) {
        return { type: 'input', name: node.inputs[i].name, index: i };
      }
    }

    for (let i = 0; i < (node.outputs || []).length; i++) {
      const py = node.y + 40 + i * 25;
      if (Math.abs(pos.x - (node.x + this.nodeWidth)) < portRadius && Math.abs(pos.y - py) < portRadius) {
        return { type: 'output', name: node.outputs[i].name, index: i };
      }
    }

    return null;
  }

  _render() {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.scale(this.zoom, this.zoom);

    this._drawGrid(ctx, w / this.zoom, h / this.zoom);

    for (const conn of this.connections) {
      this._drawConnection(ctx, conn);
    }

    for (const node of this.nodes) {
      this._drawNode(ctx, node);
    }

    ctx.restore();
  }

  _drawGrid(ctx, w, h) {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;

    for (let x = 0; x < w; x += this.gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    for (let y = 0; y < h; y += this.gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  _drawNode(ctx, node) {
    const x = node.x;
    const y = node.y;
    const w = this.nodeWidth;
    const h = this.nodeHeight;
    const isSelected = this.selectedNode === node;
    const statusColors = {
      idle: '#4a4a6a',
      running: '#3498db',
      completed: '#27ae60',
      failed: '#e74c3c'
    };

    ctx.fillStyle = statusColors[node.status] || statusColors.idle;
    if (isSelected) {
      ctx.fillStyle = '#5a5a8a';
    }

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();

    ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`${node.icon || '⚙️'} ${node.name}`, x + 10, y + 25);

    for (let i = 0; i < (node.inputs || []).length; i++) {
      const port = node.inputs[i];
      const py = y + 40 + i * 25;

      ctx.fillStyle = '#3498db';
      ctx.beginPath();
      ctx.arc(x, py, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ccc';
      ctx.font = '11px sans-serif';
      ctx.fillText(port.name, x + 12, py + 4);
    }

    for (let i = 0; i < (node.outputs || []).length; i++) {
      const port = node.outputs[i];
      const py = y + 40 + i * 25;

      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(x + w, py, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ccc';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(port.name, x + w - 12, py + 4);
      ctx.textAlign = 'left';
    }
  }

  _drawConnection(ctx, conn) {
    const sourceNode = this.nodes.find(n => n.id === conn.source.nodeId);
    const targetNode = this.nodes.find(n => n.id === conn.target.nodeId);

    if (!sourceNode || !targetNode) return;

    const outputIndex = (sourceNode.outputs || []).findIndex(o => o.name === conn.source.output);
    const inputIndex = (targetNode.inputs || []).findIndex(i => i.name === conn.target.input);

    if (outputIndex === -1 || inputIndex === -1) return;

    const x1 = sourceNode.x + this.nodeWidth;
    const y1 = sourceNode.y + 40 + outputIndex * 25;
    const x2 = targetNode.x;
    const y2 = targetNode.y + 40 + inputIndex * 25;

    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);

    const cp1x = x1 + 50;
    const cp2x = x2 - 50;
    ctx.bezierCurveTo(cp1x, y1, cp2x, y2, x2, y2);
    ctx.stroke();
  }

  _drawTempConnection(from, to) {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const x1 = from.node.x + this.nodeWidth;
    const y1 = from.node.y + 40;

    ctx.strokeStyle = 'rgba(52, 152, 219, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  addNode(type, x = 100, y = 100, data = {}) {
    const node = {
      id: `node_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`,
      type,
      name: data.name || type,
      icon: data.icon || '⚙️',
      x,
      y,
      inputs: data.inputs || [],
      outputs: data.outputs || [],
      data: data.data || {},
      status: 'idle'
    };

    this.nodes.push(node);
    this.onChange(this.toJSON());
    this._render();

    return node;
  }

  removeNode(nodeId) {
    this.nodes = this.nodes.filter(n => n.id !== nodeId);
    this.connections = this.connections.filter(
      c => c.source.nodeId !== nodeId && c.target.nodeId !== nodeId
    );
    this.onChange(this.toJSON());
    this._render();
  }

  toJSON() {
    return {
      nodes: this.nodes.map(n => ({
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
    this.nodes = (data.nodes || []).map(n => ({
      ...n,
      status: 'idle'
    }));
    this.connections = data.connections || [];
    this._render();
  }

  destroy() {
    this.nodes = [];
    this.connections = [];
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

if (typeof window !== 'undefined') {
  window.NodeEditor = NodeEditor;
}
