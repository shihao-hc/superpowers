# Batch1 核心层实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现核心层5大模块：tools、permissions、agent-loop、context、compact

**Architecture:** 基于 Claude Code 源码模式，实现 TypeScript 风格的模块化架构。tools 作为基础模块被其他模块依赖。

**Tech Stack:** TypeScript, Node.js, Jest, ESLint

---

## 文件结构

```
src/core/
├── tools/
│   ├── index.ts                    # 导出入口
│   ├── Tool.ts                     # 工具基类接口
│   ├── ToolRegistry.ts             # 工具注册表
│   ├── ToolExecutor.ts             # 工具执行器
│   ├── Semaphore.ts                # 并发控制信号量
│   ├── ProgressTracker.ts          # 进度追踪
│   ├── types.ts                    # 类型定义
│   ├── builtins/
│   │   ├── BashTool.ts
│   │   ├── ReadTool.ts
│   │   ├── WriteTool.ts
│   │   ├── EditTool.ts
│   │   ├── GrepTool.ts
│   │   └── GlobTool.ts
│   └── __tests__/
│       └── tools.test.ts
├── permissions/
│   ├── index.ts
│   ├── PermissionSystem.ts          # 权限系统核心
│   ├── PermissionDialog.ts         # 权限对话框
│   ├── PermissionMode.ts           # 6种权限模式
│   ├── rules.ts                    # 内置规则
│   ├── types.ts
│   └── __tests__/
│       └── permissions.test.ts
├── agent-loop/
│   ├── index.ts
│   ├── createAgentLoop.ts           # 工厂函数
│   ├── AgentRunner.ts              # 运行器
│   ├── AgentLoopState.ts           # 状态机
│   ├── TokenBudget.ts              # Token预算
│   ├── ErrorRecovery.ts            # 错误恢复
│   ├── types.ts
│   ├── constants.ts
│   └── __tests__/
│       └── agent-loop.test.ts
├── context/
│   ├── index.ts
│   ├── ContextManager.ts            # 上下文管理器
│   ├── ContextProvider.ts          # 提供者基类
│   ├── providers/
│   │   ├── ConversationProvider.ts
│   │   ├── WorkspaceProvider.ts
│   │   ├── SessionProvider.ts
│   │   └── ProjectProvider.ts
│   ├── types.ts
│   └── __tests__/
│       └── context.test.ts
├── compact/
│   ├── index.ts
│   ├── ContextCompactor.ts          # 压缩器
│   ├── strategies/
│   │   ├── AggressiveStrategy.ts
│   │   ├── BalancedStrategy.ts
│   │   └── ConservativeStrategy.ts
│   ├── types.ts
│   └── __tests__/
│       └── compact.test.ts
```

---

## 批次1A: 工具系统

### Task 1: 工具类型定义

**Files:**
- Create: `src/core/tools/types.ts`
- Test: `src/core/tools/__tests__/tools.test.ts`

- [ ] **Step 1: 创建 types.ts**

```typescript
export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolOutput {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface ToolContext {
  workspaceRoot: string;
  sessionId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    duration?: number;
    tokens?: number;
  };
}

export type ToolExecute<TInput = ToolInput, TOutput = ToolOutput> = (
  input: TInput,
  context: ToolContext
) => Promise<ToolResult<TOutput>>;

export interface Tool<TInput = ToolInput, TOutput = ToolOutput> {
  definition: ToolDefinition;
  execute: ToolExecute<TInput, TOutput>;
  validate?: (input: unknown) => TInput;
}
```

- [ ] **Step 2: 创建测试文件**

```typescript
import { describe, it, expect } from 'vitest';
import type { Tool, ToolContext, ToolDefinition } from '../types';

describe('Tool Types', () => {
  it('should define Tool interface', () => {
    const mockTool: Tool = {
      definition: {
        name: 'test',
        description: 'Test tool',
        inputSchema: { type: 'object' },
      },
      execute: async (input, context) => ({ success: true, data: input }),
    };
    expect(mockTool.definition.name).toBe('test');
  });

  it('should have valid ToolContext', () => {
    const context: ToolContext = {
      workspaceRoot: '/test',
      sessionId: '123',
    };
    expect(context.workspaceRoot).toBe('/test');
  });

  it('should have ToolResult structure', () => {
    const result = { success: true, data: 'test' };
    expect(result.success).toBe(true);
    expect(result.data).toBe('test');
  });
});
```

- [ ] **Step 3: 运行测试验证**

Run: `npm test -- src/core/tools/__tests__/tools.test.ts`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/core/tools/types.ts src/core/tools/__tests__/tools.test.ts
git commit -m "feat(tools): add tool type definitions"
```

---

### Task 2: Semaphore 并发控制

**Files:**
- Create: `src/core/tools/Semaphore.ts`
- Test: `src/core/tools/__tests__/tools.test.ts` (追加)

- [ ] **Step 1: 写失败测试**

```typescript
describe('Semaphore', () => {
  it('should limit concurrency', async () => {
    const semaphore = new Semaphore(2);
    let activeCount = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 5 }, async (_, i) => {
      const release = await semaphore.acquire();
      activeCount++;
      maxActive = Math.max(maxActive, activeCount);
      await new Promise(r => setTimeout(r, 10));
      activeCount--;
      release();
    });

    await Promise.all(tasks);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('should support runExclusive', async () => {
    const semaphore = new Semaphore(1);
    const results: number[] = [];

    await semaphore.runExclusive(async () => {
      results.push(1);
      await new Promise(r => setTimeout(r, 5));
      results.push(2);
    });

    expect(results).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- src/core/tools/__tests__/tools.test.ts`
Expected: FAIL with "Semaphore is not defined"

- [ ] **Step 3: 实现 Semaphore**

```typescript
export class Semaphore {
  private permits: number;
  private waiting: Array<{
    resolve: (value: Releaser) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(private maxPermits: number) {
    this.permits = maxPermits;
  }

  async acquire(): Promise<Releaser> {
    if (this.permits > 0) {
      this.permits--;
      return { release: () => this.release() };
    }

    return new Promise((resolve, reject) => {
      this.waiting.push({
        resolve: (releaser: Releaser) => resolve(releaser),
        reject,
      });
    });
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) {
      next.resolve({ release: () => this.doRelease() });
    } else {
      this.permits++;
    }
  }

  private doRelease(): void {
    const next = this.waiting.shift();
    if (next) {
      next.resolve({ release: () => this.doRelease() });
    } else {
      this.permits++;
    }
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export interface Releaser {
  release: () => void;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- src/core/tools/__tests__/tools.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/tools/Semaphore.ts
git commit -m "feat(tools): add Semaphore for concurrency control"
```

---

### Task 3: ToolRegistry 工具注册表

**Files:**
- Create: `src/core/tools/ToolRegistry.ts`
- Modify: `src/core/tools/index.ts`
- Test: `src/core/tools/__tests__/tools.test.ts` (追加)

- [ ] **Step 1: 写失败测试**

```typescript
describe('ToolRegistry', () => {
  it('should register and retrieve tools', () => {
    const registry = new ToolRegistry();
    const tool = createMockTool('test');
    registry.register(tool);
    expect(registry.get('test')).toBe(tool);
  });

  it('should list all tools', () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool('tool1'));
    registry.register(createMockTool('tool2'));
    const tools = registry.list();
    expect(tools).toHaveLength(2);
  });

  it('should unregister tools', () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool('test'));
    expect(registry.unregister('test')).toBe(true);
    expect(registry.get('test')).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- src/core/tools/__tests__/tools.test.ts`
Expected: FAIL with "ToolRegistry is not defined"

- [ ] **Step 3: 实现 ToolRegistry**

```typescript
import type { Tool, ToolDefinition } from './types';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register<TInput, TOutput>(tool: Tool<TInput, TOutput>): void {
    if (this.tools.has(tool.definition.name)) {
      throw new Error(`Tool ${tool.definition.name} is already registered`);
    }
    this.tools.set(tool.definition.name, tool as Tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  clear(): void {
    this.tools.clear();
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- src/core/tools/__tests__/tools.test.ts`
Expected: PASS

- [ ] **Step 5: 更新 index.ts**

```typescript
export * from './types';
export { Semaphore } from './Semaphore';
export { ToolRegistry } from './ToolRegistry';
export type { Tool, ToolContext, ToolResult } from './types';
```

- [ ] **Step 6: 提交**

```bash
git add src/core/tools/ToolRegistry.ts src/core/tools/index.ts
git commit -m "feat(tools): add ToolRegistry"
```

---

### Task 4: 内置 BashTool

**Files:**
- Create: `src/core/tools/builtins/BashTool.ts`
- Test: `src/core/tools/__tests__/tools.test.ts` (追加)

- [ ] **Step 1: 写失败测试**

```typescript
describe('BashTool', () => {
  it('should execute commands', async () => {
    const tool = new BashTool();
    const result = await tool.execute(
      { command: 'echo "hello"' },
      { workspaceRoot: '/tmp', sessionId: 'test' }
    );
    expect(result.success).toBe(true);
    expect(result.data?.stdout).toContain('hello');
  });

  it('should handle command errors', async () => {
    const tool = new BashTool();
    const result = await tool.execute(
      { command: 'exit 1' },
      { workspaceRoot: '/tmp', sessionId: 'test' }
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- src/core/tools/__tests__/tools.test.ts`
Expected: FAIL with "BashTool is not defined"

- [ ] **Step 3: 实现 BashTool**

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import type { Tool, ToolContext, ToolResult } from '../types';

const execAsync = promisify(exec);

export class BashTool implements Tool {
  definition = {
    name: 'bash',
    description: 'Execute bash commands',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to execute' },
        cwd: { type: 'string', description: 'Working directory' },
        timeout: { type: 'number', description: 'Timeout in ms' },
      },
      required: ['command'],
    },
  };

  async execute(
    input: { command: string; cwd?: string; timeout?: number },
    context: ToolContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    try {
      const { stdout, stderr } = await execAsync(input.command, {
        cwd: input.cwd || context.workspaceRoot,
        timeout: input.timeout || 30000,
        shell: process.platform === 'win32' ? 'powershell' : '/bin/bash',
      });
      return {
        success: true,
        data: { stdout, stderr, exitCode: 0 },
        metadata: { duration: Date.now() - startTime },
      };
    } catch (error: unknown) {
      const execError = error as { stdout?: string; stderr?: string; code?: number };
      return {
        success: false,
        error: execError.stderr || (error as Error).message,
        data: {
          stdout: execError.stdout || '',
          stderr: execError.stderr || '',
          exitCode: execError.code || 1,
        },
        metadata: { duration: Date.now() - startTime },
      };
    }
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- src/core/tools/__tests__/tools.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/core/tools/builtins/BashTool.ts
git commit -m "feat(tools): add BashTool"
```

---

### Task 5: 内置文件工具 (Read/Write/Edit/Glob/Grep)

**Files:**
- Create: `src/core/tools/builtins/ReadTool.ts`
- Create: `src/core/tools/builtins/WriteTool.ts`
- Create: `src/core/tools/builtins/EditTool.ts`
- Create: `src/core/tools/builtins/GlobTool.ts`
- Create: `src/core/tools/builtins/GrepTool.ts`

- [ ] **Step 1: 实现 ReadTool**

```typescript
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { Tool, ToolContext, ToolResult } from '../types';

export class ReadTool implements Tool {
  definition = {
    name: 'read',
    description: 'Read file contents',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'File path to read' },
        encoding: { type: 'string', default: 'utf-8' },
        limit: { type: 'number', description: 'Max lines to read' },
        offset: { type: 'number', description: 'Line offset' },
      },
      required: ['filePath'],
    },
  };

  async execute(
    input: { filePath: string; encoding?: string; limit?: number; offset?: number },
    context: ToolContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    try {
      const fullPath = resolve(context.workspaceRoot, input.filePath);
      let content = await readFile(fullPath, input.encoding || 'utf-8');
      
      const lines = content.split('\n');
      if (input.offset) {
        content = lines.slice(input.offset).join('\n');
      }
      if (input.limit) {
        content = lines.slice(0, input.limit).join('\n');
      }
      
      return {
        success: true,
        data: { content, filePath: fullPath, lineCount: lines.length },
        metadata: { duration: Date.now() - startTime },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        metadata: { duration: Date.now() - startTime },
      };
    }
  }
}
```

- [ ] **Step 2: 实现 WriteTool**

```typescript
import { writeFile } from 'fs/promises';
import { resolve } from 'path';
import type { Tool, ToolContext, ToolResult } from '../types';

export class WriteTool implements Tool {
  definition = {
    name: 'write',
    description: 'Write content to file',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'File path to write' },
        content: { type: 'string', description: 'Content to write' },
        createDir: { type: 'boolean', default: true },
      },
      required: ['filePath', 'content'],
    },
  };

  async execute(
    input: { filePath: string; content: string; createDir?: boolean },
    context: ToolContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    try {
      const fullPath = resolve(context.workspaceRoot, input.filePath);
      await writeFile(fullPath, input.content, 'utf-8');
      return {
        success: true,
        data: { filePath: fullPath, bytesWritten: input.content.length },
        metadata: { duration: Date.now() - startTime },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        metadata: { duration: Date.now() - startTime },
      };
    }
  }
}
```

- [ ] **Step 3: 实现 EditTool**

```typescript
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import type { Tool, ToolContext, ToolResult } from '../types';

export class EditTool implements Tool {
  definition = {
    name: 'edit',
    description: 'Edit file content by replacing text',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'File path to edit' },
        oldString: { type: 'string', description: 'Text to replace' },
        newString: { type: 'string', description: 'Replacement text' },
      },
      required: ['filePath', 'oldString', 'newString'],
    },
  };

  async execute(
    input: { filePath: string; oldString: string; newString: string },
    context: ToolContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    try {
      const fullPath = resolve(context.workspaceRoot, input.filePath);
      let content = await readFile(fullPath, 'utf-8');
      
      if (!content.includes(input.oldString)) {
        return {
          success: false,
          error: `Could not find "${input.oldString}" in file`,
          metadata: { duration: Date.now() - startTime },
        };
      }
      
      const newContent = content.replace(input.oldString, input.newString);
      await writeFile(fullPath, newContent, 'utf-8');
      
      return {
        success: true,
        data: { filePath: fullPath, changes: 1 },
        metadata: { duration: Date.now() - startTime },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        metadata: { duration: Date.now() - startTime },
      };
    }
  }
}
```

- [ ] **Step 4: 实现 GlobTool**

```typescript
import { glob as globAsync } from 'glob';
import type { Tool, ToolContext, ToolResult } from '../types';

export class GlobTool implements Tool {
  definition = {
    name: 'glob',
    description: 'Find files matching pattern',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern' },
        cwd: { type: 'string', description: 'Working directory' },
      },
      required: ['pattern'],
    },
  };

  async execute(
    input: { pattern: string; cwd?: string },
    context: ToolContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    try {
      const files = await globAsync(input.pattern, {
        cwd: input.cwd || context.workspaceRoot,
        absolute: true,
      });
      return {
        success: true,
        data: { files, count: files.length },
        metadata: { duration: Date.now() - startTime },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        metadata: { duration: Date.now() - startTime },
      };
    }
  }
}
```

- [ ] **Step 5: 实现 GrepTool**

```typescript
import { grep } from 'grep-async';
import type { Tool, ToolContext, ToolResult } from '../types';

export class GrepTool implements Tool {
  definition = {
    name: 'grep',
    description: 'Search file contents',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern' },
        files: { type: 'array', items: { type: 'string' }, description: 'Files to search' },
        flags: { type: 'string', description: 'Regex flags' },
      },
      required: ['pattern', 'files'],
    },
  };

  async execute(
    input: { pattern: string; files: string[]; flags?: string },
    context: ToolContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    try {
      const results = await grep(input.files, input.pattern, {
        flags: input.flags || 'g',
        cwd: context.workspaceRoot,
      });
      return {
        success: true,
        data: { matches: results, count: results.length },
        metadata: { duration: Date.now() - startTime },
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        metadata: { duration: Date.now() - startTime },
      };
    }
  }
}
```

- [ ] **Step 6: 更新 index.ts 并提交**

```typescript
export * from './types';
export { Semaphore } from './Semaphore';
export { ToolRegistry } from './ToolRegistry';
export { BashTool } from './builtins/BashTool';
export { ReadTool } from './builtins/ReadTool';
export { WriteTool } from './builtins/WriteTool';
export { EditTool } from './builtins/EditTool';
export { GlobTool } from './builtins/GlobTool';
export { GrepTool } from './builtins/GrepTool';
```

- [ ] **Step 7: 提交**

```bash
git add src/core/tools/builtins/
git commit -m "feat(tools): add ReadTool, WriteTool, EditTool, GlobTool, GrepTool"
```

---

## 批次1B: 权限系统

### Task 6: 权限模式与类型

**Files:**
- Create: `src/core/permissions/types.ts`
- Create: `src/core/permissions/PermissionMode.ts`
- Test: `src/core/permissions/__tests__/permissions.test.ts`

- [ ] **Step 1: 实现 types.ts**

```typescript
export enum PermissionMode {
  ALL = 'all',
  READ = 'read',
  BROWSE = 'browse',
  LIMIT_HARM = 'limitharm',
  NO_INVOKE = 'noinvoke',
  DENY = 'deny',
}

export interface PermissionRule {
  pattern: string | RegExp;
  mode: PermissionMode;
  reason?: string;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
}

export interface PermissionContext {
  toolName: string;
  args: unknown;
  sessionId: string;
  mode: PermissionMode;
}
```

- [ ] **Step 2: 实现 PermissionSystem**

```typescript
import { PermissionMode, PermissionRule, PermissionResult, PermissionContext } from './types';

export class PermissionSystem {
  private rules: PermissionRule[] = [];

  addRule(pattern: string | RegExp, mode: PermissionMode, reason?: string): void {
    this.rules.push({ pattern, mode, reason });
  }

  async checkPermission(
    context: PermissionContext
  ): Promise<PermissionResult> {
    const { toolName, args, mode } = context;

    if (mode === PermissionMode.ALL) {
      return { allowed: true };
    }

    if (mode === PermissionMode.DENY) {
      return { allowed: false, reason: 'deny mode' };
    }

    const matchingRule = this.findMatchingRule(toolName);
    if (matchingRule) {
      return this.evaluateRule(matchingRule, toolName, args);
    }

    return this.defaultPolicy(toolName, mode);
  }

  private findMatchingRule(toolName: string): PermissionRule | undefined {
    return this.rules.find(rule => {
      if (typeof rule.pattern === 'string') {
        return rule.pattern === toolName || toolName.startsWith(rule.pattern + '/');
      }
      return rule.pattern.test(toolName);
    });
  }

  private evaluateRule(
    rule: PermissionRule,
    toolName: string,
    args: unknown
  ): PermissionResult {
    switch (rule.mode) {
      case PermissionMode.ALLOW:
        return { allowed: true };
      case PermissionMode.DENY:
        return { allowed: false, reason: rule.reason || 'denied by rule' };
      case PermissionMode.CONFIRM:
        return { allowed: false, requiresConfirmation: true, reason: rule.reason };
      default:
        return { allowed: true };
    }
  }

  private defaultPolicy(toolName: string, mode: PermissionMode): PermissionResult {
    const readOnlyTools = ['read', 'grep', 'glob'];
    if (readOnlyTools.includes(toolName)) {
      return { allowed: true };
    }

    switch (mode) {
      case PermissionMode.READ:
        return { allowed: false, reason: 'read-only mode' };
      case PermissionMode.BROWSE:
        return { allowed: toolName === 'webfetch', reason: 'browse mode' };
      default:
        return { allowed: true };
    }
  }
}
```

- [ ] **Step 3: 写测试并验证**

```typescript
describe('PermissionSystem', () => {
  it('should allow all in ALL mode', async () => {
    const system = new PermissionSystem();
    const result = await system.checkPermission({
      toolName: 'bash',
      args: { command: 'rm -rf /' },
      sessionId: 'test',
      mode: PermissionMode.ALL,
    });
    expect(result.allowed).toBe(true);
  });

  it('should deny all in DENY mode', async () => {
    const system = new PermissionSystem();
    const result = await system.checkPermission({
      toolName: 'bash',
      args: {},
      sessionId: 'test',
      mode: PermissionMode.DENY,
    });
    expect(result.allowed).toBe(false);
  });

  it('should allow read-only tools', async () => {
    const system = new PermissionSystem();
    const result = await system.checkPermission({
      toolName: 'read',
      args: {},
      sessionId: 'test',
      mode: PermissionMode.LIMIT_HARM,
    });
    expect(result.allowed).toBe(true);
  });

  it('should apply custom rules', async () => {
    const system = new PermissionSystem();
    system.addRule('bash', PermissionMode.DENY, 'bash not allowed');
    const result = await system.checkPermission({
      toolName: 'bash',
      args: {},
      sessionId: 'test',
      mode: PermissionMode.ALL,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('bash not allowed');
  });
});
```

- [ ] **Step 4: 提交**

```bash
git add src/core/permissions/
git commit -m "feat(permissions): add PermissionSystem with 6 modes"
```

---

## 批次1C: Agent Loop

### Task 7: Agent Loop 核心类型与状态机

**Files:**
- Create: `src/core/agent-loop/types.ts`
- Create: `src/core/agent-loop/AgentLoopState.ts`
- Test: `src/core/agent-loop/__tests__/agent-loop.test.ts`

- [ ] **Step 1: 实现 types.ts**

```typescript
export enum AgentStatus {
  IDLE = 'idle',
  THINKING = 'thinking',
  EXECUTING = 'executing',
  WAITING = 'waiting',
  COMPLETE = 'complete',
  ERROR = 'error',
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  timestamp: number;
}

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface ToolResult {
  callId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface AgentEvent {
  type: 'start' | 'thought' | 'tool_call' | 'tool_result' | 'budget_exceeded' | 'complete' | 'error';
  content?: string;
  tool?: ToolCall;
  result?: ToolResult;
  timestamp: number;
}

export interface AgentLoopOptions {
  maxIterations?: number;
  maxTokens?: number;
  maxMessages?: number;
  timeout?: number;
}

export interface AgentContext {
  messages: AgentMessage[];
  workspaceRoot: string;
  sessionId: string;
}
```

- [ ] **Step 2: 实现 AgentLoopState**

```typescript
import { AgentStatus } from './types';

export class AgentLoopState {
  private status: AgentStatus = AgentStatus.IDLE;
  private iteration: number = 0;
  private error: Error | null = null;

  getStatus(): AgentStatus {
    return this.status;
  }

  setStatus(status: AgentStatus): void {
    this.status = status;
  }

  getIteration(): number {
    return this.iteration;
  }

  incrementIteration(): number {
    return ++this.iteration;
  }

  setError(error: Error): void {
    this.error = error;
    this.status = AgentStatus.ERROR;
  }

  getError(): Error | null {
    return this.error;
  }

  reset(): void {
    this.status = AgentStatus.IDLE;
    this.iteration = 0;
    this.error = null;
  }

  isComplete(): boolean {
    return this.status === AgentStatus.COMPLETE || this.status === AgentStatus.ERROR;
  }
}
```

- [ ] **Step 3: 写测试**

```typescript
describe('AgentLoopState', () => {
  it('should track status transitions', () => {
    const state = new AgentLoopState();
    expect(state.getStatus()).toBe(AgentStatus.IDLE);
    
    state.setStatus(AgentStatus.THINKING);
    expect(state.getStatus()).toBe(AgentStatus.THINKING);
  });

  it('should count iterations', () => {
    const state = new AgentLoopState();
    expect(state.getIteration()).toBe(0);
    state.incrementIteration();
    expect(state.getIteration()).toBe(1);
  });

  it('should detect completion', () => {
    const state = new AgentLoopState();
    expect(state.isComplete()).toBe(false);
    state.setStatus(AgentStatus.COMPLETE);
    expect(state.isComplete()).toBe(true);
  });
});
```

- [ ] **Step 4: 提交**

```bash
git add src/core/agent-loop/types.ts src/core/agent-loop/AgentLoopState.ts
git commit -m "feat(agent-loop): add types and state machine"
```

---

### Task 8: Token Budget 与 Error Recovery

**Files:**
- Create: `src/core/agent-loop/TokenBudget.ts`
- Create: `src/core/agent-loop/ErrorRecovery.ts`
- Test: `src/core/agent-loop/__tests__/agent-loop.test.ts` (追加)

- [ ] **Step 1: 实现 TokenBudget**

```typescript
export class TokenBudget {
  private used: number = 0;
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  use(tokens: number): void {
    this.used += tokens;
  }

  getUsed(): number {
    return this.used;
  }

  getRemaining(): number {
    return this.limit - this.used;
  }

  getLimit(): number {
    return this.limit;
  }

  isExhausted(): boolean {
    return this.used >= this.limit;
  }

  getUsagePercent(): number {
    return (this.used / this.limit) * 100;
  }

  reset(): void {
    this.used = 0;
  }

  shouldCompact(): boolean {
    return this.getUsagePercent() > 80;
  }
}
```

- [ ] **Step 2: 实现 ErrorRecovery**

```typescript
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

export class ErrorRecovery {
  private retryCount = new Map<string, number>();

  constructor(private config: RetryConfig = { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }) {}

  shouldRetry(error: Error, operationId: string): boolean {
    const currentRetries = this.retryCount.get(operationId) || 0;
    if (currentRetries >= this.config.maxRetries) {
      this.retryCount.delete(operationId);
      return false;
    }
    return this.isRetryable(error);
  }

  private isRetryable(error: Error): boolean {
    const retryablePatterns = [
      'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED',
      'rate limit', 'timeout', 'temporary'
    ];
    return retryablePatterns.some(p => error.message.toLowerCase().includes(p.toLowerCase()));
  }

  getDelay(operationId: string): number {
    const retries = this.retryCount.get(operationId) || 0;
    const delay = Math.min(this.config.baseDelay * Math.pow(2, retries), this.config.maxDelay);
    this.retryCount.set(operationId, retries + 1);
    return delay;
  }

  recordFailure(operationId: string): void {
    const current = this.retryCount.get(operationId) || 0;
    this.retryCount.set(operationId, current + 1);
  }

  recordSuccess(operationId: string): void {
    this.retryCount.delete(operationId);
  }

  reset(): void {
    this.retryCount.clear();
  }
}
```

- [ ] **Step 3: 写测试并验证**

- [ ] **Step 4: 提交**

```bash
git add src/core/agent-loop/TokenBudget.ts src/core/agent-loop/ErrorRecovery.ts
git commit -m "feat(agent-loop): add TokenBudget and ErrorRecovery"
```

---

### Task 9: createAgentLoop 工厂函数

**Files:**
- Create: `src/core/agent-loop/createAgentLoop.ts`
- Modify: `src/core/agent-loop/index.ts`
- Test: `src/core/agent-loop/__tests__/agent-loop.test.ts` (追加)

- [ ] **Step 1: 写失败测试**

```typescript
describe('createAgentLoop', () => {
  it('should create agent loop generator', async () => {
    const mockLLM = {
      think: vi.fn().mockResolvedValue({ content: 'test response', toolCalls: [] })
    };
    
    const loop = createAgentLoop({
      context: { messages: [], workspaceRoot: '/test', sessionId: 'test' },
      llm: mockLLM as any,
      tools: [],
    });
    
    const events: AgentEvent[] = [];
    for await (const event of loop) {
      events.push(event);
    }
    
    expect(events[0].type).toBe('start');
    expect(events[events.length - 1].type).toBe('complete');
  });
});
```

- [ ] **Step 2: 实现 createAgentLoop**

```typescript
import type { AgentContext, AgentEvent, AgentLoopOptions, Tool, ToolResult } from './types';
import { AgentLoopState } from './AgentLoopState';
import { TokenBudget } from './TokenBudget';
import { ErrorRecovery } from './ErrorRecovery';
import { AgentStatus } from './types';

export interface LLMClient {
  think(context: AgentContext): Promise<{
    content: string;
    toolCalls?: Array<{ id: string; name: string; args: unknown }>;
  }>;
}

export interface AgentLoopConfig {
  context: AgentContext;
  llm: LLMClient;
  tools: Tool[];
  options?: AgentLoopOptions;
}

export async function* createAgentLoop(
  config: AgentLoopConfig
): AsyncGenerator<AgentEvent> {
  const {
    context,
    llm,
    tools,
    options = {},
  } = config;

  const state = new AgentLoopState();
  const budget = new TokenBudget(options.maxTokens || 100000);
  const errorRecovery = new ErrorRecovery();

  yield {
    type: 'start',
    timestamp: Date.now(),
  };

  state.setStatus(AgentStatus.THINKING);

  while (!state.isComplete()) {
    state.incrementIteration();

    if (options.maxIterations && state.getIteration() > options.maxIterations) {
      yield { type: 'error', content: 'max iterations exceeded', timestamp: Date.now() };
      break;
    }

    if (budget.isExhausted()) {
      yield { type: 'budget_exceeded', timestamp: Date.now() };
      break;
    }

    try {
      const thought = await llm.think(context);
      yield { type: 'thought', content: thought.content, timestamp: Date.now() };

      if (thought.toolCalls && thought.toolCalls.length > 0) {
        for (const call of thought.toolCalls) {
          yield { type: 'tool_call', tool: call, timestamp: Date.now() };

          const tool = tools.find(t => t.definition.name === call.name);
          let result: ToolResult;

          if (tool) {
            try {
              const toolResult = await tool.execute(call.args as any, {
                workspaceRoot: context.workspaceRoot,
                sessionId: context.sessionId,
              });
              result = { callId: call.id, success: toolResult.success, data: toolResult.data, error: toolResult.error };
            } catch (err) {
              result = { callId: call.id, success: false, error: (err as Error).message };
            }
          } else {
            result = { callId: call.id, success: false, error: `Tool ${call.name} not found` };
          }

          yield { type: 'tool_result', result, timestamp: Date.now() };
        }
      }

      context.messages.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: thought.content,
        timestamp: Date.now(),
      });

      if (!thought.toolCalls || thought.toolCalls.length === 0) {
        state.setStatus(AgentStatus.COMPLETE);
      }
    } catch (error) {
      errorRecovery.recordFailure('main');
      if (errorRecovery.shouldRetry(error as Error, 'main')) {
        const delay = errorRecovery.getDelay('main');
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      state.setError(error as Error);
      yield { type: 'error', content: (error as Error).message, timestamp: Date.now() };
    }
  }

  yield { type: 'complete', timestamp: Date.now() };
}
```

- [ ] **Step 3: 运行测试验证**

- [ ] **Step 4: 提交**

```bash
git add src/core/agent-loop/createAgentLoop.ts
git commit -m "feat(agent-loop): add createAgentLoop factory"
```

---

## 批次1D: Context 与 Compact

### Task 10: Context 管理

**Files:**
- Create: `src/core/context/types.ts`
- Create: `src/core/context/ContextManager.ts`
- Test: `src/core/context/__tests__/context.test.ts`

- [ ] **Step 1: 实现 ContextManager**

```typescript
import type { AgentMessage } from '../agent-loop/types';

export interface Context {
  messages: AgentMessage[];
  workspace: {
    files: string[];
    cwd: string;
  };
  session: {
    id: string;
    startTime: number;
  };
  metadata: Record<string, unknown>;
}

export interface ContextProvider {
  getContext(): Promise<Context>;
  updateContext(changes: Partial<Context>): Promise<void>;
}

export class ContextManager implements ContextProvider {
  private context: Context;

  constructor(initial?: Partial<Context>) {
    this.context = {
      messages: [],
      workspace: { files: [], cwd: process.cwd() },
      session: { id: crypto.randomUUID(), startTime: Date.now() },
      metadata: {},
      ...initial,
    };
  }

  async getContext(): Promise<Context> {
    return { ...this.context, messages: [...this.context.messages] };
  }

  async updateContext(changes: Partial<Context>): Promise<void> {
    this.context = { ...this.context, ...changes };
  }

  async addMessage(message: AgentMessage): Promise<void> {
    this.context.messages.push(message);
  }

  async clearMessages(): Promise<void> {
    this.context.messages = [];
  }
}
```

- [ ] **Step 2: 写测试并验证**

- [ ] **Step 3: 提交**

---

### Task 11: ContextCompactor 压缩器

**Files:**
- Create: `src/core/compact/ContextCompactor.ts`
- Create: `src/core/compact/types.ts`
- Test: `src/core/compact/__tests__/compact.test.ts`

- [ ] **Step 1: 实现 ContextCompactor**

```typescript
import type { Context } from '../context/ContextManager';
import type { AgentMessage } from '../agent-loop/types';

export interface CompactOptions {
  targetTokens: number;
  strategy: 'aggressive' | 'balanced' | 'conservative';
  preservePatterns: RegExp[];
}

export class ContextCompactor {
  constructor(private options: CompactOptions) {}

  async shouldCompact(context: Context): Promise<boolean> {
    const currentTokens = await this.estimateTokens(context);
    return currentTokens > this.options.targetTokens * 0.9;
  }

  async compact(context: Context): Promise<Context> {
    const preserved = this.identifyPreserved(context);
    const toCompact = context.messages.filter(m => !preserved.includes(m));

    const summary = await this.summarize(toCompact);

    return {
      ...context,
      messages: [
        ...context.messages.filter(m => preserved.includes(m)),
        {
          id: crypto.randomUUID(),
          role: 'system',
          content: `[Previous conversation summarized: ${summary}]`,
          timestamp: Date.now(),
        },
      ],
    };
  }

  private identifyPreserved(context: Context): AgentMessage[] {
    const preserve: AgentMessage[] = [];
    const recentCount = this.getRecentCount();

    for (let i = Math.max(0, context.messages.length - recentCount); i < context.messages.length; i++) {
      preserve.push(context.messages[i]);
    }

    for (const message of context.messages) {
      if (message.role === 'system' || message.role === 'user') {
        if (this.matchesPreservePattern(message.content)) {
          preserve.push(message);
        }
      }
    }

    return preserve;
  }

  private matchesPreservePattern(content: string): boolean {
    return this.options.preservePatterns.some(p => p.test(content));
  }

  private getRecentCount(): number {
    switch (this.options.strategy) {
      case 'aggressive': return 5;
      case 'balanced': return 10;
      case 'conservative': return 20;
    }
  }

  private async summarize(messages: AgentMessage[]): Promise<string> {
    return `Compressed ${messages.length} messages`;
  }

  private async estimateTokens(context: Context): Promise<number> {
    const text = JSON.stringify(context);
    return Math.ceil(text.length / 4);
  }
}
```

- [ ] **Step 2: 写测试并验证**

- [ ] **Step 3: 提交**

---

## 最终验证

- [ ] **Step: 运行所有测试**

```bash
npm test -- src/core/
```

Expected: All tests pass

- [ ] **Step: 运行覆盖率检查**

```bash
npm run test:coverage -- src/core/
```

Expected: Coverage >90%

- [ ] **Step: 运行 ESLint**

```bash
npm run lint
```

Expected: No errors

---

## 总结

共 **11 个 Task**，预计完成时间：
- 批次1A (Task 1-5): ~1小时
- 批次1B (Task 6): ~20分钟
- 批次1C (Task 7-9): ~1小时
- 批次1D (Task 10-11): ~40分钟

**总预计: ~3小时**
