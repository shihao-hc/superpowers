# BrainSystem 自动桥接 & 全面监管系统

## 问题

当前 BrainSystem 是"拉"模式（须手动调用 brain-context.js + brain-decision.js），不具备自动触发、持续监控、主动推送的能力。AI 助手需要手动记住运行脚本，大脑无法在需要时自动辅助。

## 目标

将 BrainSystem 从"工具书"转变为"自动工具"——三阶段递进：

- **阶段 A**: AI 助手每次响应前自动调用大脑，免去手动操作
- **阶段 B**: 事件驱动 + 后台守护 + 自动学习，大脑主动监控
- **阶段 C**: AGENTS.md 动态生成，大脑控制决策流程

## 架构总览

```
AI 助手
  └→ brain-bridge.js (统一入口)
       ├→ forceThink + analyzeIntent (意图分析)
       ├→ LessonReminder (教训匹配)
       ├→ ProactiveThinking (模式学习)
       └→ 输出: {intent, lessons, warnings, suggestions}
            ↓
       HooksManager (事件总线)
            ├→ PRE_TOOL → 教训检查
            ├→ POST_TOOL → 验证
            └→ TOOL_ERROR → 自动诊断
                 ↓
            BrainSystem 自动管道
                 ↓
            持久化层 (.opencode/)
                 ├─ lessons.json
                 ├─ backups/ (变更前自动备份)
                 ├─ evolution/
                 └─ evolution/audit/ (审计日志)
```

## 阶段 A: Brain Bridge

### A1. brain-bridge.js

位于项目根目录，统一入口。调用约定：

```bash
node brain-bridge.js <input>             # taskType 自动推断
node brain-bridge.js <input> code        # 显式指定
```

taskType 自动推断逻辑：先用 `analyzeIntent` 分析输入，匹配 `TASK_CATEGORY_MAP` 键（code/test/fix/feature/refactor/security/deploy/review），匹配失败则用 `default`。

`BRAIN_DISABLE=1` 时立即返回空结果（no-op），不加载任何模块。

输出结构化 JSON（stdout）：

```json
{
  "intent": { "type": "代码", "confidence": 0.8 },
  "lessons": [{ "id": "lesson-04", "title": "...", "priority": "high" }],
  "warnings": ["lesson-37 未应用：修复要完整"],
  "suggestions": ["skill: test-generation"],
  "proactive": { "interactionCount": 15, "topIntent": "代码" },
  "source": "brain-bridge-v1"
}
```

超时 5 秒自动返回空结果（fail-open）：

```json
{"intent": null, "lessons": [], "warnings": [], "suggestions": [], "proactive": {}, "source": "brain-bridge-v1", "error": "timeout"}
```

### A2. AGENTS.md 更新

原"手动运行 brain-context.js + brain-decision.js" → 改为自动注入。

关键规则：
- 每次响应前自动调用 brain-bridge.js
- 如果返回空/失败/超时 → 跳过，继续正常响应
- 连续 3 次失败 → 当前会话禁用
- brainResult.warnings 中高优先级警告须在响应中体现

### A3. HooksManager ↔ BrainSystem 接线

在 BrainSystem 上新增方法：

| 方法 | 功能 |
|------|------|
| `connectHooks()` | 注册 hooks 到全局 HookRegistry |
| `disconnectHooks()` | 注销所有 brain hooks |
| `isHooksConnected()` | 检查连接状态 |

注册的 hooks：

| Hook 事件 | Handler |
|-----------|---------|
| `TOOL_ERROR` | forceThink(error.message) + lessonSearch(error) |
| `PRE_TOOL_USE` | 检查即将操作的文件是否有相关教训 |
| `SESSION_START` | 加载教训库 + 初始化状态 |
| `SESSION_END` | 自动保存状态 |

## 阶段 B: Active Agent

### B1. 后台守护进程

独立 Node 进程 `src/daemon/index.js`：

- 文件变更监控（chokidar 或 fs.watch）
- 定时健康检查（每 5 分钟）
- 自动清理过期备份（保留最近 30 个）

### B2. LessonLearner

从成功修复中自动提取教训：

- 监听 `POST_TOOL_USE` 事件
- 如果操作是"修复 bug"且结果成功
- 提取问题模式 + 解决方案
- 写入 `.opencode/evolution/pending-lessons.json`
- 人工审核后移入 lessons.json

### B3. AutoDiagnose

错误 → 教训的智能匹配引擎：

- 解析错误信息关键词
- 模糊匹配教训库中的 problem 字段
- 返回匹配度评分前 3 条教训

## 阶段 C: Full Auto

- AGENTS.md 的决策规则由 BrainSystem **运行时注入**（不改文件，brain-bridge.js 返回动态决策上下文替代静态规则）
- 大脑分析当前上下文后生成定制化的决策指导，覆盖 AGENTS.md 中的静态规则
- 工具调用前自动风险分析
- 跨会话持续进化

## 安全监管架构

### 三层权限

| 等级 | 范围 | 触发 |
|------|------|------|
| READ-ONLY | 读取教训、分析 | 自动 (Shadow) |
| AUTO | 写 .opencode/ | 自动 + 备份 |
| AUTHORIZED | 写外部文件 | 需要 AI 确认 |

### 备份与回滚

每次 `.opencode/` 文件变更前自动备份到 `backups/`。
回滚脚本: `node brain-bridge.js --rollback <timestamp>`。

### 紧急停止

优先级：环境变量 > 配置文件 > 运行时指令

| 方式 | 优先级 | 说明 |
|------|--------|------|
| `BRAIN_DISABLE=1` | 1 (最高) | 进程级，brain-bridge.js 启动时检测 |
| `brain.config.json` enabled: false | 2 | 持久化禁用 |
| 对话中说"大脑关闭" | 3 | 运行时临时禁用（当前会话） |
| 断路器 3 次失败 | 4 (自动) | 自动熔断 |

### 循环检测 (LoopGuard)

- 跟踪最近 50 次触发，记录到审计日志
- 同一模式重复 > 3 次/分钟 → 熔断并写入 `warnings` 数组
- 大脑不准监听自己的输出（brain-bridge.js 的结果不触发 hooks）
- 熔断时返回 `{ loopGuardTripped: true, blockedActions: [...] }`

### 磁盘空间保护

- 备份保留最近 30 个，超出的自动清理
- 每次写入前检查磁盘剩余空间（< 100MB 时跳过备份并告警）
- 审计日志按天分割，保留最近 90 天

### 审计追踪

所有操作写入 `.opencode/evolution/audit/YYYY-MM-DD.jsonl`，JSON Lines 格式。

### 沙箱隔离

- 自动操作仅限 `.opencode/` 目录
- 外部文件写入须 AUTHORIZED 权限
- 读取不限

### 监管仪表盘

`node brain-bridge.js --status` 输出完整状态。
`node brain-bridge.js --repair` 尝试自动修复。

### 断路器

| 状态 | 行为 |
|------|------|
| OPEN | 正常运行 |
| HALF_OPEN | N 次失败后，只做健康检查 |
| CLOSED | 禁用，需 --reset 恢复 |

## 验证

- 阶段 A: `node brain-bridge.js "测试输入"` 返回正确 JSON 结构
- 阶段 B: 文件修改触发审计日志记录
- 阶段 C: AGENTS.md 动态生成内容验证
- 安全: `BRAIN_DISABLE=1` 时所有模块为 no-op
- 回滚: 执行回滚后 lessons.json 恢复备份内容
