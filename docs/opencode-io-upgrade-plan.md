# OpenCode I/O 层升级规划

> **更新**: 2026-04-13 - Phase 1-5 已完成

## 当前 OpenCode vs Claude Code 对比

### AgentLoop.js (721行) vs Claude Code print.ts (5594行)

| 功能 | OpenCode 当前 | Claude Code 实现 | 优先级 |
|------|--------------|------------------|--------|
| 命令队列 | ❌ 无 | ✅ drainCommandQueue + 批处理 | 🔴 高 |
| Pending Request Map | ❌ 无 | ✅ 请求-响应追踪 | 🔴 高 |
| Result Holdback | ❌ 无 | ✅ 等待后台 Agent | 🟡 中 |
| MCP 动态管理 | ⚠️ 简单缓存 | ✅ updateSdkMcp 增量更新 | 🔴 高 |
| 循环状态机 | ⚠️ 简单 while | ✅ do-while + 状态追踪 | 🟡 中 |

### LLMAdapter.js (316行) vs Claude Code API Client

| 功能 | OpenCode 当前 | Claude Code 实现 | 优先级 |
|------|--------------|------------------|--------|
| 流式处理 | ❌ 无 | ✅ asyncGenerator 模式 | 🔴 高 |
| 重试机制 | ❌ 无 | ✅ 指数退避 + 抖动 | 🔴 高 |
| 请求追踪 | ❌ 无 | ✅ requestId 映射 | 🟡 中 |
| 错误分类 | ❌ 简单 throw | ✅ TelemetrySafeError | 🟡 中 |
| 预算控制 | ❌ 无 | ✅ CostManager | 🟡 中 |

### MessageService.js (412行) vs Claude Code 消息系统

| 功能 | OpenCode 当前 | Claude Code 实现 | 优先级 |
|------|--------------|------------------|--------|
| UUID 追踪 | ⚠️ 简单生成 | ✅ BoundedUUIDSet 去重 | 🔴 高 |
| Flush Gate | ❌ 无 | ✅ 初始消息防乱序 | 🟡 中 |
| 消息合并 | ⚠️ 简单合并 | ✅ 智能合并策略 | 🟡 中 |
| 压缩边界 | ⚠️ 简单标记 | ✅ compact boundary | 🟡 中 |
| 流式追加 | ❌ 无 | ✅ Prepend 机制 | 🟡 中 |

---

## 升级方案：分阶段实施

### Phase 1: 消息层增强 (MessageService)

#### 1.1 BoundedUUIDSet 去重机制

```javascript
// 当前问题：消息可能被重复处理
// 解决方案：环形缓冲区固定内存追踪

class BoundedUUIDSet {
  constructor(capacity = 2000) {
    this.capacity = capacity;
    this.ring = new Array(capacity);
    this.set = new Set();
    this.writeIdx = 0;
  }

  add(uuid) {
    if (this.set.has(uuid)) return;
    
    // 驱逐最旧条目
    const evicted = this.ring[this.writeIdx];
    if (evicted !== undefined) {
      this.set.delete(evicted);
    }
    
    this.ring[this.writeIdx] = uuid;
    this.set.add(uuid);
    this.writeIdx = (this.writeIdx + 1) % this.capacity;
  }

  has(uuid) { return this.set.has(uuid); }
  clear() { this.set.clear(); this.ring.fill(undefined); this.writeIdx = 0; }
}
```

#### 1.2 消息队列防乱序

```javascript
// 当前问题：初始历史消息发送期间，新消息可能乱序到达
// 解决方案：FlushGate 机制

class FlushGate {
  constructor() {
    this.queue = [];
    this.flushed = false;
  }

  enqueue(item) {
    if (!this.flushed) {
      this.queue.push(item);
      return true; // 排队中
    }
    return false; // 已 flush，直接处理
  }

  isFlushed() { return this.flushed; }

  flush() {
    this.flushed = true;
    const pending = this.queue.splice(0);
    return pending;
  }

  reset() {
    this.flushed = false;
    this.queue = [];
  }

  drop() {
    const count = this.queue.length;
    this.queue = [];
    this.flushed = true;
    return count;
  }
}
```

---

### Phase 2: LLM Adapter 增强

#### 2.1 流式处理支持

```javascript
// 当前问题：LLMAdapter 没有流式支持
// 解决方案：asyncGenerator 模式

async *streamGenerate(prompt, options = {}) {
  const response = await fetch(/* ... */, {
    body: JSON.stringify({ model: options.model, prompt, stream: true })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      // 按行分割 NDJSON
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留最后不完整的行

      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            yield data;
          } catch {}
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

#### 2.2 请求追踪 + 重试

```javascript
// 当前问题：无重试机制，请求失败直接抛错
// 解决方案：Pending Request Map + 指数退避

class LLMAdapter {
  constructor(config = {}) {
    super();
    this.pendingRequests = new Map();
    this.requestId = 0;
  }

  async generateWithRetry(prompt, options = {}) {
    const requestId = ++this.requestId;
    let attempt = 0;
    const maxAttempts = options.maxRetries || 3;
    const baseDelay = options.baseDelay || 1000;

    while (attempt < maxAttempts) {
      try {
        const result = await this.generate(prompt, options);
        return result;
      } catch (error) {
        attempt++;
        if (attempt >= maxAttempts) throw error;

        // 指数退避 + 抖动
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt - 1),
          30000
        ) + delay * 0.25 * (2 * Math.random() - 1);

        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
}
```

---

### Phase 3: AgentLoop 增强

#### 3.1 命令批处理

```javascript
// 当前问题：每次迭代独立处理，无批处理
// 解决方案：合并连续同类型命令

class CommandQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  enqueue(command) {
    // 检查是否可以与队尾合并
    const last = this.queue[this.queue.length - 1];
    if (last && this.canBatchWith(last, command)) {
      last.value = last.value + '\n' + command.value;
      last.uuid = command.uuid; // 用最后一个 uuid
      return;
    }
    this.queue.push(command);
  }

  canBatchWith(a, b) {
    return a.type === b.type &&
           a.isMeta === b.isMeta &&
           a.workload === b.workload;
  }

  async *drain() {
    while (this.queue.length > 0) {
      const command = this.queue.shift();
      yield command;
    }
  }
}
```

#### 3.2 Result Holdback (后台 Agent)

```javascript
// 当前问题：无后台任务概念
// 解决方案：后台任务状态追踪

class AgentLoop {
  async run(goal, context = {}) {
    // ...

    while (iteration < this.maxIterations && !taskComplete) {
      // ... 执行循环 ...

      // 检查是否有运行中的后台 Agent
      if (this.hasRunningBackgroundTasks()) {
        // 暂存 result，等待后台 Agent 完成
        this.heldBackResult = result;
        await this.waitForBackgroundTasks();
        // 后台任务完成后，发送 heldBackResult
        this.emit('result', this.heldBackResult);
        this.heldBackResult = null;
      } else {
        this.emit('result', result);
      }
    }
  }

  hasRunningBackgroundTasks() {
    return this.backgroundTasks.some(t => t.status === 'running');
  }

  async waitForBackgroundTasks() {
    while (this.hasRunningBackgroundTasks()) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
}
```

---

### Phase 4: MCP 动态管理

#### 4.1 MCP 增量更新

```javascript
// 当前问题：MCP 工具缓存简单 TTL
// 解决方案：配置变更检测 + 增量更新

class MCPManager {
  async updateMCPServers(configs) {
    const currentNames = new Set(Object.keys(configs));
    const oldNames = new Set(this.serverNames);

    // 检测变更
    const added = [...currentNames].filter(n => !oldNames.has(n));
    const removed = [...oldNames].filter(n => !currentNames.has(n));

    if (added.length === 0 && removed.length === 0) {
      return; // 无变更
    }

    // 清理已移除的服务器
    for (const name of removed) {
      const client = this.clients.get(name);
      if (client) {
        await client.cleanup();
        this.clients.delete(name);
      }
    }

    // 添加新服务器
    for (const name of added) {
      const client = await this.createClient(configs[name]);
      this.clients.set(name, client);
    }

    // 更新工具列表
    this.tools = await this.assembleTools();
  }
}
```

---

## 实施计划

| 阶段 | 内容 | 状态 | 测试 |
|------|------|------|------|
| Phase 1 | MessageService 增强 | ✅ 完成 | ✅ |
| Phase 2 | LLMAdapter 流式 + 重试 | ✅ 完成 | ✅ |
| Phase 3 | AgentLoop 批处理 + 后台任务 | ✅ 完成 | ✅ |
| Phase 4 | MCP 动态管理 | ✅ 完成 | ✅ |
| Phase 5 | Hooks System | ✅ 完成 | ✅ |
| Phase 6 | Session Memory | ✅ 完成 | ✅ |
| Phase 7 | Suggestions Pipeline | ✅ 完成 | ✅ |
| Phase 8 | Settings Sync | ✅ 完成 | ✅ |
| Phase 9 | Native-TS Fuzzy | ✅ 完成 | ✅ |

---

## 已完成模块清单

| 模块 | 文件 | 行数 | 测试 |
|------|------|------|------|
| HooksManager | src/hooks/HooksManager.js | 600 | 25 tests |
| SessionMemory | src/memory/SessionMemory.js | 450 | 20 tests |
| SuggestionPipeline | src/agent/SuggestionPipeline.js | 400 | 18 tests |
| SettingsSync | src/config/SettingsSync.js | 500 | 26 tests |
| FuzzyMatcher | src/utils/FuzzyMatcher.js | 400 | 31 tests |

**总计**: 2350 行新代码，120 个测试

---

## 性能优化

### FuzzyMatcher 优化
- **Memoize 缓存**: `_normalizeCache`, `_distanceCache`, `_scoreCache`
- **Levenshtein 算法**: 使用 `Uint16Array` 替代二维数组
- **批量操作**: `addBatch()`, `rebuildTokenIndex()`

### 新增方法
- `FuzzyMatcher.clearCache()` - 清除所有缓存
- `FuzzyIndex.addBatch(entries)` - 批量添加
- `FuzzyIndex.rebuildTokenIndex()` - 重建索引

---

## 立即可执行的 Quick Wins

1. **BoundedUUIDSet** - 1 天，显著减少重复处理
2. **LLM 重试机制** - 1 天，提升健壮性
3. **MCP TTL 优化** - 0.5 天，立竿见影

---

## 参考文档

- Claude Code cli-deep-dive.md
- Claude Code bridge-deep-dive.md
- claude-to-opencode-analysis.md（功能融合分析）
