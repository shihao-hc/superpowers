# Coordinator 模块深度分析

## 概述

Claude Code 的多 Agent 协调模式。Coordinator（协调器）负责任务分解、Worker 管理、结果聚合。

## 核心架构

```
┌─────────────────────────────────────────────────────────┐
│                    Coordinator                          │
│  (Main Claude Code instance with coordinatorMode)       │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │   Worker A   │  │   Worker B   │  │   Worker C   ││
│  │  (Research)  │  │   (Implement)│  │   (Verify)   ││
│  └──────────────┘  └──────────────┘  └──────────────┘│
│         │                  │                  │      │
│         └──────────────────┼──────────────────┘      │
│                            │                         │
│              SendMessage / TaskNotification            │
│                            │                         │
└────────────────────────────┼─────────────────────────┘
                             │
                    TeamFile / Mailbox
```

## 核心组件

### 1. Coordinator Mode

```typescript
// 启用检查
export function isCoordinatorMode(): boolean {
  if (feature('COORDINATOR_MODE')) {
    return isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)
  }
  return false
}

// Session 模式匹配
export function matchSessionMode(
  sessionMode: 'coordinator' | 'normal' | undefined
): string | undefined
```

### 2. 团队上下文

```typescript
export function getCoordinatorUserContext(
  mcpClients: ReadonlyArray<{ name: string }>,
  scratchpadDir?: string,
): { [k: string]: string }
```

### 3. 团队系统提示

```typescript
export function getCoordinatorSystemPrompt(): string
```

**核心指令**:
1. 分解任务为 Research → Synthesis → Implementation → Verification 阶段
2. 并行启动独立 Worker
3. 通过 SendMessage 继续 Worker
4. 通过 TaskStop 停止 Worker

## Coordinator 的角色

### 1. 任务分解
```
User: "Fix the auth bug"
     ↓
┌─────────────────────────────────────────────┐
│  Coordinator: Research (并行)                 │
│  Worker A: Investigate null pointer          │
│  Worker B: Research auth tests              │
└─────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────┐
│  Coordinator: Synthesis                    │
│  理解研究结果 → 编写实现规格                │
└─────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────┐
│  Coordinator: Implementation               │
│  Worker C: Implement fix                   │
└─────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────┐
│  Coordinator: Verification                │
│  Worker D: Verify fix                     │
└─────────────────────────────────────────────┘
```

### 2. Worker 通信

#### Agent Tool (Spawn Worker)
```typescript
AgentTool({
  description: "Investigate auth bug",
  subagent_type: "worker",
  prompt: "Investigate src/auth/..."
})
```

#### SendMessage Tool (继续 Worker)
```typescript
SendMessageTool({
  to: "agent-a1b",
  message: "Fix the null pointer in src/auth/validate.ts:42..."
})
```

#### TaskStop Tool (停止 Worker)
```typescript
TaskStopTool({
  task_id: "agent-x7q"
})
```

### 3. 结果接收

Worker 结果通过 `<task-notification>` XML 格式接收：
```xml
<task-notification>
  <task-id>agent-a1b</task-id>
  <status>completed|failed|killed</status>
  <summary>Agent "Investigate auth bug" completed</summary>
  <result>Found null pointer in src/auth/validate.ts:42...</result>
  <usage>
    <total_tokens>N</total_tokens>
    <tool_uses>N</tool_uses>
    <duration_ms>N</duration_ms>
  </usage>
</task-notification>
```

## TeamCreateTool

### 创建团队
```typescript
TeamCreateTool({
  team_name: "auth-fix",
  description: "Fix the authentication null pointer",
  agent_type: "coordinator"
})
```

### TeamFile 结构
```typescript
interface TeamFile {
  name: string
  description?: string
  createdAt: number
  leadAgentId: string
  leadSessionId: string
  members: TeamMember[]
}

interface TeamMember {
  agentId: string
  name: string
  agentType: string
  model: string
  joinedAt: number
  tmuxPaneId: string
  cwd: string
  subscriptions: string[]
}
```

### 约束
- 一个 Leader 只能管理一个团队
- 团队名称必须唯一（冲突时自动生成新名称）

## SendMessageTool

### 消息类型
```typescript
// 普通消息
{ to: "worker-name", message: "content" }

// 广播
{ to: "*", message: "content" }

// 结构化消息
{ to: "worker-name", message: { type: "shutdown_request", reason: "..." } }
{ to: "worker-name", message: { type: "shutdown_response", request_id: "...", approve: true } }
```

### 消息路由
```typescript
export type MessageRouting = {
  sender: string
  senderColor?: string
  target: string
  targetColor?: string
  summary?: string
  content?: string
}
```

### 邮箱机制
```typescript
await writeToMailbox(
  recipientName,
  {
    from: senderName,
    text: content,
    summary,
    timestamp: new Date().toISOString(),
    color: senderColor,
  },
  teamName,
)
```

## Worker 管理策略

### 1. Continue vs Spawn

| 情况 | 机制 | 原因 |
|------|------|------|
| 研究结果恰好是要编辑的文件 | **Continue** (SendMessage) | Worker 已有上下文 |
| 研究广泛但实现窄 | **Spawn fresh** (AgentTool) | 避免探索噪声 |
| 修正失败 | **Continue** | 有错误上下文 |
| 验证其他 Worker 写的代码 | **Spawn fresh** | 验证者应独立 |
| 完全无关的任务 | **Spawn fresh** | 无可复用上下文 |

### 2. Worker Prompts 编写原则

**必须包含**:
- 具体文件路径和行号
- 具体要做什么
- "Done" 的定义
- 目的声明（指导深度）

**禁止**:
- "Based on your findings..." — 自己做合成
- 模糊的上下文 — Worker 看不到对话
- 不完整的指令 — 包含完整上下文

### 3. 并行策略

```
研究阶段: 自由并行
         ↓
实现阶段: 串行（同一文件）
         ↓
验证阶段: 可与实现并行（不同文件）
```

## Scratchpad 机制

```typescript
if (scratchpadDir && isScratchpadGateEnabled()) {
  content += `\n\nScratchpad directory: ${scratchpadDir}
Workers can read and write here without permission prompts.`
}
```

**用途**:
- 跨 Worker 持久化知识
- 结构化文件存储
- 无需权限提示的共享空间

## 内部 Worker 工具

```typescript
const INTERNAL_WORKER_TOOLS = new Set([
  TEAM_CREATE_TOOL_NAME,
  TEAM_DELETE_TOOL_NAME,
  SEND_MESSAGE_TOOL_NAME,
  SYNTHETIC_OUTPUT_TOOL_NAME,
])
```

这些工具对 Worker 不可见。

## 事件追踪

```typescript
logEvent('tengu_team_created', {
  team_name: finalTeamName,
  teammate_count: 1,
  lead_agent_type: leadAgentType,
  teammate_mode: getResolvedTeammateMode(),
})

logEvent('tengu_coordinator_mode_switched', {
  to: sessionMode,
})
```

## 关键设计模式

### 1. 任务通知格式
```xml
<task-notification>
  <task-id>{agentId}</task-id>
  <status>completed|failed|killed</status>
  <summary>{summary}</summary>
  <result>{text}</result>
  <usage>...</usage>
</task-notification>
```

### 2. 邮箱持久化
```typescript
await writeToMailbox(recipientName, message, teamName)
```

### 3. 团队文件持久化
```typescript
await writeTeamFileAsync(finalTeamName, teamFile)
registerTeamForSessionCleanup(finalTeamName)
```

## 深入洞察

### 1. 为什么需要 Synthesis 阶段？

```
Worker 研究结果 → Coordinator 理解 → 具体规格 → 继续 Worker
                                    ↑
                          如果没理解清楚，会导致：
                          - 错误的文件
                          - 错误的修改
                          - 重复工作
```

### 2. 为什么 "Continue vs Spawn" 要思考上下文重叠？

```
高重叠 → Continue
- Worker 已有相关文件
- 继续有上下文优势

低重叠 → Spawn fresh
- 避免错误上下文污染
- 干净的开始
- 避免锚定失败路径
```

### 3. 为什么 Worker 不能看对话？

```
每个 Worker 的 prompt 必须自包含
→ 避免隐式依赖
→ 确保 Worker 可独立运行
→ 强制 Coordinator 做真正的合成工作
```

### 4. 验证为什么重要？

```
实现 Worker 可能：
- 只验证 happy path
- 忽略边界情况
- 自我确认偏见

验证 Worker 应该：
- 独立思考
- 尝试边界情况
- 调查失败而不是忽略
```

### 5. 为什么需要 TaskStop？

```
情况：Worker 起飞后方向错误
      用户中途改变需求

解决：TaskStop 可以：
- 停止错误的 Worker
- SendMessage 继续修正
- 保持 Worker ID 不变
```

### 6. Scratchpad 的设计意图

```
跨 Worker 知识共享：
- 不需要每次传递完整上下文
- Worker 可以写中间发现
- 其他 Worker 可以读取
- 无权限提示（已信任的环境）
```
