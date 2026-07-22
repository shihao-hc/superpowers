# Phase B: Active Agent — 实现计划

## 目标
为 BrainSystem 添加事件驱动的后台守护进程、自动教训提取引擎和错误诊断能力。

## 架构

```
brain-bridge.js CLI
  ├── --diagnose <error>  → AutoDiagnose 引擎
  ├── --daemon start|stop → 后台守护进程
  ├── --pending           → 查看待审核教训
  ├── --approve <id>      → 批准教训
  └── --reject <id>       → 拒绝教训

BrainSystem hooks
  └── POST_TOOL_USE
       └── LessonLearner.recordEvent()
            ├── 检测修复操作
            └── 写入 pending-lessons.json

src/daemon/index.js (独立进程)
  ├── fs.watch 监控 .opencode/
  ├── 每 5 分钟健康检查
  └── 每小时清理过期备份
```

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/core/LessonLearner.js` | 新建 | 自动教训提取 |
| `src/core/AutoDiagnose.js` | 新建 | 错误-教训匹配 |
| `src/daemon/index.js` | 新建 | 后台守护进程 |
| `src/core/BrainSystem.js` | 修改 | 添加 POST_TOOL_USE → LessonLearner 接线 |
| `src/core/BrainBridge.js` | 修改 | 添加 diagnose() 方法 |
| `brain-bridge.js` | 修改 | 添加 --diagnose, --daemon, --pending, --approve, --reject |
| `.opencode/brain.config.json` | 修改 | 添加 daemon/learner/diagnose 段 |
| `docs/superpowers/plans/phase-b-impl-plan.md` | 新建 | 本文件 |

## 实现步骤

### Step 1: LessonLearner.js
- 监听工具事件，检测修复操作（type=fix/tags 含 fix）
- 提取问题模式 + 上下文 → pending-lessons.json
- 提供 `approveLesson(id)` 移入 `.opencode/lessons.json`
- 提供 `rejectLesson(id)` 从 pending 移除

### Step 2: AutoDiagnose.js
- `diagnose(errorMessage)` → 对 lessons.json 的 problem 字段做关键词评分
- 返回前 3 条匹配教训 + 匹配度分数
- 独立模块，不依赖 BrainSystem

### Step 3: Daemon
- `fs.watch` 监控 `.opencode/` 目录变更
- 每 5 分钟健康检查：断路器状态、磁盘空间
- 每小时清理备份（保留 30 个）
- 独立进程可 start/stop/status

### Step 4: BrainSystem hooks 接线
- connectHooks() 添加 POST_TOOL_USE → lessonLearner.recordEvent()
- disconnectHooks() 清理

### Step 5: BrainBridge.diagnose()
- 调用 AutoDiagnose.diagnose(error)
- 记录到审计日志
- 返回匹配结果

### Step 6: CLI 扩展
- `--diagnose <error>` → AutoDiagnose
- `--daemon start|stop|status` → daemon 控制
- `--pending` → 查看待审核教训
- `--approve <id> [--edit]` → 批准 + 可选修改
- `--reject <id>` → 拒绝

### Step 7: 验证
- LessonLearner: 记录、批准、拒绝全流程
- AutoDiagnose: 匹配准确度、边界值
- Daemon: 启动/停止/文件监控
- Hooks: POST_TOOL_USE 触发 LessonLearner
- 回归: Phase A 全部通过 + 旧功能零破坏
