# OpenCode 批次1实现规格：核心层完善

**日期**: 2026-04-08  
**批次**: 批次1 - 核心层  
**状态**: 待实施  
**基于**: Claude Code 51万行源码学习成果

---

## 1. 概述

批次1聚焦于核心层模块的完善，基于已学习的 Claude Code 源码模式，实现以下模块：

| 模块 | 描述 | 优先级 |
|------|------|--------|
| core/agent-loop | Agent 主循环流式输出 | P0 |
| core/tools | 工具系统增强 | P0 |
| core/context | 上下文管理 | P1 |
| core/compact | 上下文压缩 | P1 |
| core/permissions | 权限系统 | P1 |

---

## 2. core/agent-loop 完善

### 2.1 目标
将现有 agent-loop 从 6,090 行扩展至完整实现，支持：
- AsyncGenerator 流式输出
- 多种执行模式（stream/blocking/background）
- 错误恢复与重试
- Token 预算管理

### 2.2 架构
```
AgentLoop
├── createAgentLoop()      # 主工厂函数
├── AgentRunner            # 运行器类
├── AgentLoopState         # 状态机
├── TokenBudget            # Token 预算管理
└── ErrorRecovery          # 错误恢复策略
```

### 2.3 关键模式
```typescript
// AsyncGenerator 流式输出
async function* createAgentLoop(
  context: AgentContext,
  options: AgentLoopOptions
): AsyncGenerator<AgentEvent> {
  // 1. 初始化
  yield { type: 'start', timestamp: Date.now() };
  
  // 2. 主循环
  while (context.messages.length < context.maxMessages) {
    // 3. 思考阶段
    const thought = await llm.think(context);
    yield { type: 'thought', content: thought };
    
    // 4. 执行阶段
    if (thought.toolCalls) {
      for (const call of thought.toolCalls) {
        yield { type: 'tool_call', tool: call.name };
        const result = await executeTool(call);
        yield { type: 'tool_result', result };
        context.addMessage(toolMessage(call, result));
      }
    }
    
    // 5. Token 预算检查
    if (tokenBudget.isExhausted()) {
      yield { type: 'budget_exceeded' };
      break;
    }
  }
  
  yield { type: 'complete' };
}
```

### 2.4 文件结构
```
src/core/agent-loop/
├── index.ts                 # 导出入口
├── createAgentLoop.ts       # 工厂函数
├── AgentRunner.ts          # 运行器
├── AgentLoopState.ts       # 状态机
├── TokenBudget.ts          # Token 预算
├── ErrorRecovery.ts        # 错误恢复
├── types.ts                # 类型定义
└── __tests__/
    └── agent-loop.test.ts
```

---

## 3. core/tools 增强

### 3.1 目标
从现有 589 行扩展，支持：
- 泛型工具接口
- 并发控制（semaphore）
- 进度追踪
- 工具注册表

### 3.2 架构
```typescript
// Claude Code 风格的工具接口
interface Tool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  
  execute(input: TInput, context: ToolContext): Promise<TOutput>;
  validate?(input: unknown): TInput;
}

// 工具注册表
class ToolRegistry {
  private tools = new Map<string, Tool>();
  
  register<TInput, TOutput>(tool: Tool<TInput, TOutput>): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  unregister(name: string): boolean;
}

// 并发控制
class Semaphore {
  constructor(private maxConcurrency: number);
  acquire(): Promise<Releaser>;
  runExclusive<T>(fn: () => Promise<T>): Promise<T>;
}
```

### 3.3 内置工具
| 工具 | 描述 |
|------|------|
| BashTool | 命令执行 |
| ReadTool | 文件读取 |
| WriteTool | 文件写入 |
| EditTool | 文件编辑 |
| GrepTool | 内容搜索 |
| GlobTool | 文件搜索 |
| WebFetchTool | HTTP 请求 |
| ReasoningTool | 思考工具 |

### 3.4 文件结构
```
src/core/tools/
├── index.ts
├── Tool.ts                 # 工具基类
├── ToolRegistry.ts         # 注册表
├── ToolExecutor.ts         # 执行器
├── Semaphore.ts           # 并发控制
├── ProgressTracker.ts     # 进度追踪
├── builtins/
│   ├── BashTool.ts
│   ├── ReadTool.ts
│   ├── WriteTool.ts
│   ├── EditTool.ts
│   ├── GrepTool.ts
│   └── GlobTool.ts
└── __tests__/
    └── tools.test.ts
```

---

## 4. core/context 管理

### 4.1 目标
实现 Claude Code 风格的多层上下文管理：
- ConversationContext
- WorkspaceContext
- SessionContext
- ProjectContext

### 4.2 架构
```typescript
// 上下文提供者接口
interface ContextProvider {
  getContext(): Promise<Context>;
  updateContext(changes: Partial<Context>): Promise<void>;
  subscribe(callback: ContextCallback): Unsubscribe;
}

// 多层上下文合并
class LayeredContext implements ContextProvider {
  constructor(private layers: ContextProvider[]);
  
  async getContext(): Promise<Context> {
    const contexts = await Promise.all(
      this.layers.map(l => l.getContext())
    );
    return this.mergeContexts(contexts);
  }
  
  private mergeContexts(contexts: Context[]): Context {
    // 从底向上合并，后面层覆盖前面
    return contexts.reduce((acc, ctx) => ({
      ...acc,
      ...ctx,
      files: [...acc.files, ...ctx.files],
    }));
  }
}
```

---

## 5. core/compact 压缩系统

### 5.1 目标
实现 Claude Code 的 autocompact 机制：
- 自动压缩触发
- 微压缩（microcompact）
- Token 预算管理
- 压缩策略配置

### 5.2 架构
```typescript
interface CompactOptions {
  targetTokens: number;
  strategy: 'aggressive' | 'balanced' | 'conservative';
  preservePatterns: RegExp[];  // 保留匹配的内容
  priorityMessages: number[];   // 优先保留的消息索引
}

class ContextCompactor {
  constructor(
    private llm: LLMClient,
    private options: CompactOptions
  );
  
  async shouldCompact(context: Context): Promise<boolean> {
    const currentTokens = await this.countTokens(context);
    return currentTokens > this.options.targetTokens * 0.9;
  }
  
  async compact(context: Context): Promise<Context> {
    // 1. 识别保留内容
    const preserved = this.identifyPreserved(context);
    
    // 2. 生成摘要
    const summary = await this.summarize(context, preserved);
    
    // 3. 重组上下文
    return this.rebuildContext(context, summary, preserved);
  }
  
  private async summarize(
    context: Context,
    preserved: PreservedContent
  ): Promise<string> {
    // 使用 LLM 生成压缩摘要
    const prompt = `Summarize this conversation concisely:
${JSON.stringify(context.messages)}
      
Preserve: ${JSON.stringify(preserved)}`;
    
    return this.llm.complete(prompt);
  }
}
```

---

## 6. core/permissions 权限系统

### 6.1 目标
基于 Claude Code 的 6 种权限模式实现：
- all (允许所有)
- read (只读)
- browse (浏览)
- limitharm (限制伤害)
- noinvoke (禁止调用)
- deny (拒绝所有)

### 6.2 架构
```typescript
enum PermissionMode {
  ALL = 'all',
  READ = 'read',
  BROWSE = 'browse',
  LIMIT_HARM = 'limitharm',
  NO_INVOKE = 'noinvoke',
  DENY = 'deny',
}

interface PermissionRule {
  pattern: string | RegExp;
  mode: PermissionMode;
  reason?: string;
}

class PermissionSystem {
  private rules: PermissionRule[] = [];
  
  async checkPermission(
    toolName: string,
    args: unknown,
    mode: PermissionMode
  ): Promise<PermissionResult> {
    // 1. 检查模式
    if (mode === PermissionMode.ALL) return { allowed: true };
    if (mode === PermissionMode.DENY) return { allowed: false, reason: 'deny mode' };
    
    // 2. 匹配规则
    const rule = this.findMatchingRule(toolName);
    if (rule) {
      return this.evaluateRule(rule, toolName, args);
    }
    
    // 3. 默认策略
    return this.defaultPolicy(toolName, mode);
  }
  
  // 规则匹配
  private findMatchingRule(toolName: string): PermissionRule | undefined {
    return this.rules.find(rule => {
      if (typeof rule.pattern === 'string') {
        return rule.pattern === toolName || 
               toolName.startsWith(rule.pattern);
      }
      return rule.pattern.test(toolName);
    });
  }
}
```

---

## 7. 测试策略

### 7.1 TDD 流程
每个模块遵循：
1. 编写测试 → 2. 运行测试(失败) → 3. 实现代码 → 4. 运行测试(通过) → 5. 重构

### 7.2 测试覆盖目标
| 模块 | 覆盖率目标 |
|------|-----------|
| agent-loop | >90% |
| tools | >90% |
| context | >85% |
| compact | >85% |
| permissions | >90% |

### 7.3 测试文件
```
src/core/
├── agent-loop/__tests__/agent-loop.test.ts
├── tools/__tests__/tools.test.ts
├── context/__tests__/context.test.ts
├── compact/__tests__/compact.test.ts
└── permissions/__tests__/permissions.test.ts
```

---

## 8. 实现顺序

### 批次1A: 工具系统 (基础)
1. `core/tools/Tool.ts` - 工具基类
2. `core/tools/ToolRegistry.ts` - 注册表
3. `core/tools/Semaphore.ts` - 并发控制
4. `core/tools/builtins/BashTool.ts` - Bash 工具
5. `core/tools/builtins/ReadTool.ts` - 读取工具
6. `core/tools/builtins/WriteTool.ts` - 写入工具
7. `core/tools/builtins/EditTool.ts` - 编辑工具

### 批次1B: 权限系统 (依赖工具)
1. `core/permissions/types.ts` - 类型定义
2. `core/permissions/PermissionSystem.ts` - 权限系统
3. `core/permissions/PermissionDialog.ts` - 权限对话框
4. `core/permissions/rules.ts` - 内置规则

### 批次1C: Agent Loop (依赖工具+权限)
1. `core/agent-loop/types.ts` - 类型定义
2. `core/agent-loop/TokenBudget.ts` - Token 预算
3. `core/agent-loop/ErrorRecovery.ts` - 错误恢复
4. `core/agent-loop/AgentLoopState.ts` - 状态机
5. `core/agent-loop/AgentRunner.ts` - 运行器
6. `core/agent-loop/createAgentLoop.ts` - 工厂函数

### 批次1D: 上下文与压缩
1. `core/context/types.ts`
2. `core/context/ContextManager.ts`
3. `core/context/providers/` - 各种提供者
4. `core/compact/ContextCompactor.ts`
5. `core/compact/strategies/` - 压缩策略

---

## 9. 成功标准

- [ ] 所有 288 个现有测试继续通过
- [ ] 新增 100+ 测试用例
- [ ] 代码覆盖率 >90%
- [ ] TypeScript 编译无错误
- [ ] ESLint 检查通过

---

## 10. 依赖关系

```
tools (基础)
  ├── permissions (依赖 tools)
  ├── agent-loop (依赖 tools + permissions)
  ├── context (依赖 agent-loop)
  └── compact (依赖 context)
```

---

## 11. 备注

- 基于 Claude Code 源码中的 `src/tools/`, `src/utils/permissions/`, `src/services/compact/` 等模块
- 遵循现有代码风格和命名约定
- 优先实现核心功能，暂不实现高级特性（如多 Agent 协作）
