# OpenCode Architecture

> 基于 Claude Code 源码分析的系统架构文档

## 📁 Project Structure

```
opencode/
├── src/
│   ├── core/
│   │   ├── agent-loop/     # Agent 循环核心
│   │   ├── compact/         # 上下文压缩
│   │   ├── permissions/     # 权限系统
│   │   └── tools/           # 工具系统
│   ├── commands/            # 命令系统
│   ├── plugins/             # 插件系统
│   └── features/            # 特性开关
└── docs/
    └── ARCHITECTURE.md
```

## 🔄 Agent Loop

### State Machine

```
┌─────────────┐
│   IDLE      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ QUERY_MODEL │◄────┐
└──────┬──────┘     │
       │            │
       ▼            │
┌─────────────┐     │
│ EXECUTE_TOOL │─────┘
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   COMPLETE  │
└─────────────┘
```

### Token Budget

| Level | Threshold | Action |
|-------|-----------|--------|
| OK | < 80% | Normal operation |
| Warning | 80-95% | Emit warning |
| Critical | > 95% | Stop execution |

## 📦 Tools

### Tool Interface

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: unknown;
  
  call(input: Input, context: ToolContext): Promise<Output>;
  validateInput?(input: Input, context: ToolContext): ValidationResult;
  checkPermissions?(input: Input, context: ToolContext): PermissionResult;
  
  isEnabled(): boolean;
  isConcurrencySafe(input: Input): boolean;
  isReadOnly(input: Input): boolean;
}
```

## 🔐 Permissions

### Modes

| Mode | Description | Auto-Decision |
|------|-------------|----------------|
| `default` | Ask for permission | ask |
| `plan` | Pause for approval | pause |
| `acceptEdits` | Auto-accept edits | allow |
| `bypassPermissions` | Skip all checks | allow |
| `dontAsk` | Deny all | deny |
| `auto` | Use rules | varies |

## 🗜️ Context Compaction

### Types

1. **Auto** - Triggered when buffer exceeds 13k tokens
2. **Micro** - Lightweight per-turn compression
3. **Partial** - Selective message removal
4. **Session** - Session-level memory summary

## 🔌 Plugin System

### Lifecycle

```
register → load → init → [onMessage] → destroy
```

### Hooks

- `session.start`
- `session.end`
- `message.before/after`
- `tool.before/after`
- `error`

## ⚙️ Feature Flags

### Categories

- `core` - Core functionality
- `agent` - Agent behavior
- `tool` - Tool system
- `permission` - Permission control
- `telemetry` - Telemetry
- `ui` - User interface
- `experimental` - Experimental features
- `runtime` - Runtime behavior

## 📊 Monitoring

### Metrics

- Token usage (input/output/total)
- Turn count
- Compaction history
- Tool execution time
- Permission decisions
