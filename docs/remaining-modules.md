# 未精读模块汇总

## 高优先级 (有价值深度理解)

### 1. memdir (~103KB) - MEMORY.md 记忆系统

**文件列表**:
| 文件 | 大小 | 说明 |
|------|------|------|
| memoryTypes.ts | 23KB | 4种记忆类型定义 |
| memdir.ts | 21KB | 核心入口点和截断逻辑 |
| teamMemPaths.ts | 12KB | 团队记忆路径管理 |
| paths.ts | 11KB | 记忆路径解析 |
| findRelevantMemories.ts | 5KB | 相关记忆查找 |
| teamMemPrompts.ts | 6KB | 团队记忆提示构建 |
| memoryScan.ts | 3KB | 记忆文件扫描 |
| memoryAge.ts | 2KB | 记忆老化 |

**核心概念**:
- 4种记忆类型: user, feedback, project, reference
- 双目录结构: private (autoMem) + team (teamMem)
- MEMORY.md 入口点 (最多200行/25KB)
- 相关性查找: Sonnet 模型选择相关记忆

### 2. upstreamproxy (~25KB) - CCR MITM 代理

**文件列表**:
| 文件 | 大小 | 说明 |
|------|------|------|
| relay.ts | 15KB | WebSocket 中继核心 |
| upstreamproxy.ts | 10KB | 代理初始化 |

**核心概念**:
- CONNECT-over-WebSocket 隧道
- MITM 代理设置
- CA 证书下载和配置
- prctl 设置不可 dumpable
- Protobuf 编码

### 3. buddy (~70KB) - 伙伴系统

**文件列表**:
| 文件 | 大小 | 说明 |
|------|------|------|
| CompanionSprite.tsx | 46KB | 伙伴精灵渲染组件 |
| sprites.ts | 10KB | 精灵系统 |
| useBuddyNotification.tsx | 10KB | 伙伴通知 |
| types.ts | 4KB | 类型定义 |
| companion.ts | 4KB | 伙伴核心 |
| prompt.ts | 1KB | 伙伴提示 |

**核心概念**:
- 伙伴精灵渲染 (React组件)
- 伙伴通知系统

## 中优先级 (可能已被其他模块覆盖)

### 4. moreright (~3KB) - 超参调优
- useMoreRight.tsx - 可能是 More/Right 面板

### 5. assistant (~2KB) - 会话历史
- sessionHistory.ts - 可能已被 session 模块覆盖

## 低优先级 (框架/工具类)

### 6. screens (~1011KB)
- 大量 React 组件，可能 UI 相关

### 7. components (~9412KB)  
- 最大的模块，React 组件库

### 8. cli (~501KB)
- CLI 相关命令

### 9. upstreamproxy (已分析)

## 已精读模块统计

| 模块 | 大小 | 状态 |
|------|------|------|
| tools | 2673KB | ✅ 完成 |
| commands | 2455KB | ✅ 完成 |
| services | 1858KB | ✅ 完成 |
| hooks | 1239KB | ✅ 完成 |
| ink | 1038KB | ✅ 完成 |
| bridge | 480KB | ✅ 完成 |
| memdir | 103KB | ⏳ 待精读 |
| upstreamproxy | 25KB | ⏳ 待精读 |
| buddy | 70KB | ⏳ 待精读 |
| 其他 | ~15000KB | 可选 |

## 建议

1. **优先精读 memdir** (~103KB) - 记忆系统核心
2. **次优先 upstreamproxy** (~25KB) - 代理架构
3. **可选 buddy** (~70KB) - 伙伴系统 UI

**预计时间**:
- memdir: 2-3 小时
- upstreamproxy: 1-2 小时  
- buddy: 1-2 小时
