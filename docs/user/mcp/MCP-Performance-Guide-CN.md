# MCP 性能优化方案

## 一、前端加载优化

### 1. 代码分割

将 MCP 各页面拆分为独立 chunk，按需加载：

```javascript
// 动态导入页面组件
async function loadToolMarket() {
  const { renderToolMarket } = await import('./pages/tool-market.js');
  renderToolMarket();
}

// 预加载关键资源
<link rel="preload" href="js/mcp-client.js" as="script">
```

### 2. MCP Client 缓存优化

已在 `frontend/js/mcp-client.js` 中实现：

```javascript
class MCPClient {
  constructor(baseUrl = '/api/mcp') {
    this.cache = {
      tools: { data: null, timestamp: 0, ttl: 60000 },      // 1分钟
      annotations: { data: null, timestamp: 0, ttl: 300000 }, // 5分钟
      roots: { data: null, timestamp: 0, ttl: 30000 },      // 30秒
    };
  }
  
  // 去抖动 - 用于搜索输入
  debounce(key, fn, delay = 300) { ... }
  
  // 节流 - 用于频繁调用
  throttle(fn, limit = 100) { ... }
}
```

### 3. 资源压缩与缓存

```nginx
# Nginx 配置
location /frontend/ {
  gzip on;
  gzip_types text/plain text/css application/javascript;
  gzip_min_length 1000;
  
  # 静态资源长期缓存
  location ~* \.(js|css)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
}
```

---

## 二、思维链大数据量渲染优化

### 1. 虚拟滚动

当思维链节点数量超过 100 个时，使用虚拟滚动只渲染可视区域：

```javascript
class VirtualTreeRenderer {
  constructor(container, options = {}) {
    this.container = container;
    this.itemHeight = options.itemHeight || 80;
    this.buffer = options.buffer || 5; // 缓冲行数
    this.visibleCount = 0;
    this.scrollTop = 0;
    this.items = [];
  }
  
  setItems(items) {
    this.items = items;
    this.render();
  }
  
  getVisibleRange() {
    const start = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.buffer);
    const end = Math.min(
      this.items.length,
      start + this.visibleCount + this.buffer * 2
    );
    return { start, end };
  }
  
  render() {
    const { start, end } = this.getVisibleRange();
    const visibleItems = this.items.slice(start, end);
    
    // 渲染可见项
    this.container.innerHTML = visibleItems.map(item => 
      this.renderItem(item, start)
    ).join('');
    
    // 设置偏移量
    this.container.style.paddingTop = `${start * this.itemHeight}px`;
  }
}
```

### 2. 分支折叠与懒加载

```javascript
class CollapsibleTree {
  constructor() {
    this.expandedNodes = new Set();
    this.maxAutoExpandDepth = 2;
  }
  
  shouldAutoExpand(node, depth) {
    return depth < this.maxAutoExpandDepth && 
           node.children?.length <= 5;
  }
  
  toggle(nodeId) {
    if (this.expandedNodes.has(nodeId)) {
      this.expandedNodes.delete(nodeId);
    } else {
      this.expandedNodes.add(nodeId);
    }
    this.render();
  }
}
```

### 3. Web Worker 布局计算

```javascript
// layout.worker.js
self.onmessage = function(e) {
  const { nodes, layout } = e.data;
  const result = calculateLayout(nodes, layout);
  self.postMessage(result);
};

function calculateLayout(nodes, layout) {
  const positions = {};
  const levels = {};
  
  // 层级布局算法
  nodes.forEach((node, index) => {
    levels[node.id] = calculateDepth(node);
    positions[node.id] = {
      x: levels[node.id] * 200,
      y: index * 100
    };
  });
  
  return { positions, levels };
}
```

### 4. 搜索与过滤

```javascript
class TreeFilter {
  filter(nodes, query) {
    if (!query) return nodes;
    
    const lowerQuery = query.toLowerCase();
    return nodes.filter(node => 
      node.content.toLowerCase().includes(lowerQuery) ||
      node.id.toLowerCase().includes(lowerQuery)
    );
  }
  
  highlightMatches(nodes, query) {
    if (!query) return nodes;
    
    const regex = new RegExp(`(${query})`, 'gi');
    return nodes.map(node => ({
      ...node,
      highlighted: node.content.replace(regex, '<mark>$1</mark>')
    }));
  }
}
```

---

## 三、后端接口响应优化

### 1. 异步任务处理

对于耗时操作，采用异步任务：

```javascript
// 异步创建沙箱
app.post('/api/mcp/roots/sandbox', async (req, res) => {
  const taskId = generateTaskId();
  
  // 立即返回任务 ID
  res.status(202).json({
    taskId,
    status: 'pending',
    message: 'Sandbox creation started'
  });
  
  // 后台执行
  process.nextTick(async () => {
    try {
      const sandbox = await createSandbox();
      await completeTask(taskId, { sandbox, status: 'completed' });
    } catch (error) {
      await completeTask(taskId, { status: 'failed', error: error.message });
    }
  });
});

// 轮询任务状态
app.get('/api/mcp/tasks/:taskId', async (req, res) => {
  const task = await getTask(req.params.taskId);
  res.json(task);
});
```

### 2. 思维链增量加载

```javascript
// 分页加载思维链步骤
app.get('/api/mcp/thinking/chains/:chainId', async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const chain = await getChain(req.params.chainId);
  
  const start = (page - 1) * limit;
  const end = start + parseInt(limit);
  const thoughts = chain.thoughts.slice(start, end);
  
  res.json({
    chain: {
      id: chain.id,
      initialThought: chain.initialThought
    },
    thoughts,
    pagination: {
      page,
      limit,
      total: chain.thoughts.length,
      hasMore: end < chain.thoughts.length
    }
  });
});
```

### 3. 缓存策略

```javascript
// Redis 缓存热门数据
const redis = require('redis');
const client = redis.createClient();

async function getCachedRoots(userId) {
  const cacheKey = `roots:${userId}`;
  const cached = await client.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  const roots = await fetchRootsFromDB(userId);
  await client.setex(cacheKey, 300, JSON.stringify(roots)); // 5分钟 TTL
  return roots;
}
```

---

## 四、性能监控指标

### 关键指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 首屏加载时间 | < 2s | 首次加载 MCP 控制台 |
| 工具列表响应 | < 500ms | 获取工具列表 API |
| 思维链渲染 | < 1s | 100节点以内 |
| 预览生成 | < 2s | Dry-run 预览响应 |
| 缓存命中率 | > 70% | 工具/注解缓存 |

### 性能检测代码

```javascript
// 性能埋点
function measurePerformance(label, fn) {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;
  
  console.log(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
  
  // 上报到监控系统
  if (window.metrics) {
    window.metrics.timing(label, duration);
  }
  
  return result;
}

// 使用示例
measurePerformance('loadTools', async () => {
  await mcpClient.listTools();
});
```

---

## 五、优化检查清单

- [ ] 启用 gzip/brotli 压缩
- [ ] 静态资源设置长期缓存
- [ ] MCP Client 缓存配置正确
- [ ] 搜索输入使用去抖动
- [ ] 大量思维链节点启用虚拟滚动
- [ ] 分支默认折叠，限制展开深度
- [ ] 耗时操作使用异步任务
- [ ] 热门数据启用 Redis 缓存
- [ ] 思维链支持分页加载
- [ ] 性能指标监控已配置
