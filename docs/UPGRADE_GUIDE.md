# OpenCode Upgrade Guide

> 从 Claude Code 迁移到 OpenCode 的升级指南

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Agent Loop

```typescript
import { AgentLoop } from './core/agent-loop';

const agent = new AgentLoop({
  model: 'claude-3-opus',
  maxTurns: 50,
  enableStreaming: true,
  enableErrorRecovery: true
});

agent.on('turn', (state) => {
  console.log(`Turn ${state.turnCount}`);
});

await agent.run([{ role: 'user', content: 'Hello!' }]);
```

### 3. Register Tools

```typescript
import { globalToolRegistry } from './core/tools';

globalToolRegistry.register({
  name: 'read-file',
  description: 'Read file contents',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' }
    },
    required: ['path']
  },
  isEnabled: () => true,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  call: async (input) => {
    return fs.readFileSync(input.path, 'utf8');
  }
});
```

### 4. Configure Permissions

```typescript
import { globalPermissionService } from './core/permissions';

globalPermissionService.setMode('user-1', 'auto');

globalPermissionService.registerPermission({
  id: 'file.read',
  name: 'File Read',
  category: 'file'
});

globalPermissionService.grant('user-1', 'file.read');
```

## 🔧 Configuration

### Agent Loop

```typescript
interface AgentConfig {
  model: string;
  maxTurns?: number;
  taskBudget?: { total: number };
  fallbackModel?: string;
  enableStreaming: boolean;
  enableErrorRecovery: boolean;
  systemPrompt?: string;
}
```

### Token Budget

```typescript
const budget = new TokenBudget({
  maxTokens: 100000,
  warningThreshold: 0.8,
  criticalThreshold: 0.95
});
```

### Feature Flags

```typescript
import { globalFeatures } from './features';

globalFeatures.register('MY_FEATURE', {
  enabled: true,
  description: 'My feature description',
  category: 'experimental',
  rollout: {
    percentage: 50,
    userIds: ['user-1', 'user-2']
  }
});

if (globalFeatures.isEnabled('MY_FEATURE')) {
  // Feature code
}
```

## 🛠️ Migration

### From Claude Code

| Claude Code | OpenCode |
|-------------|----------|
| `query.ts` | `src/core/agent-loop/` |
| `Tool.ts` | `src/core/tools/` |
| `CompactService` | `src/core/compact/` |
| `PermissionService` | `src/core/permissions/` |
| `commands/` | `src/commands/` |
| `plugins/` | `src/plugins/` |

### API Changes

```typescript
// Before (Claude Code)
const response = await queryModel(messages, config);

// After (OpenCode)
const agent = new AgentLoop(config);
const result = await agent.run(messages);
```

## 📝 Examples

### Basic Agent

```typescript
import { AgentLoop } from './core/agent-loop';

const agent = new AgentLoop({
  model: 'claude-3-sonnet',
  enableStreaming: true,
  enableErrorRecovery: true
});

const result = await agent.run([
  { role: 'user', content: 'What is 2+2?' }
]);

console.log(result.output);
```

### With Tools

```typescript
const agent = new AgentLoop({
  model: 'claude-3-opus',
  tools: [
    {
      name: 'calculator',
      description: 'Calculate math',
      inputSchema: { type: 'object' },
      isEnabled: () => true,
      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      call: async ({ expression }) => eval(expression)
    }
  ]
});
```

### With Permissions

```typescript
const agent = new AgentLoop({
  model: 'claude-3-opus',
  permissions: [
    {
      id: 'read.files',
      name: 'Read Files',
      category: 'file'
    }
  ]
});

agent.setPermissionMode('user-1', 'auto');
```

## 🐛 Troubleshooting

### Token Budget Exceeded

```typescript
budget.on('warning', (usage) => {
  console.log('Token warning:', usage.percentage);
});

budget.on('stop', () => {
  console.log('Budget exceeded, stopping');
});
```

### Tool Execution Failed

```typescript
tool.on('error', (error) => {
  console.error('Tool error:', error);
});
```

## 📚 Resources

- [Architecture](./ARCHITECTURE.md)
- [API Reference](./API.md)
- [Examples](./EXAMPLES.md)
