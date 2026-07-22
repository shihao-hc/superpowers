# Phase 0: 永久执行层 — 永久智能安全系统

## 概述

构建安全扫描的永久执行基础设施，确保每一次代码变更都会被自动检测。Phase 0 是 Intelligent Security Daemon 5 层架构中的第 0 层，也是后续所有智能功能的基础。

## 架构

```
用户编辑文件
    │
    ▼
┌─────────────────────────────────────────────────┐
│  Layer 0: 永久执行层                              │
│                                                   │
│  ┌──────────────┐  变更事件  ┌────────────────┐  │
│  │ chokidar     │────────▶  │ 增量扫描引擎     │  │
│  │ 文件监控      │           │ (per-file scan)  │  │
│  │ (daemon嵌入)  │           └────────┬───────┘  │
│  └──────────────┘                    │           │
│                                      ▼           │
│  ┌──────────────┐           ┌────────────────┐  │
│  │ husky +      │────────▶  │ 结果处理器      │  │
│  │ lint-staged  │           │ · 终端警告       │  │
│  │ (pre-commit) │           │ · 日志记录       │  │
│  └──────────────┘           │ · dev: warn     │  │
│                             │ · prod: block   │  │
│  ┌──────────────┐           └────────────────┘  │
│  │ dev server   │                                │
│  │ 启动时嵌入    │                                │
│  └──────────────┘                                │
└─────────────────────────────────────────────────┘
```

## 组件设计

### 1. 文件监控 (chokidar)

**位置**: `src/daemon/index.js` — 现有 Daemon 类扩展

- 监控目录: `src/`, `server/`, `scripts/`（递归）
- 忽略: `node_modules/`, `.git/`, `dist/`, `coverage/`, `test/`, `tests/`
- 事件: `change`（文件修改）、`add`（新增文件）
- 防抖: 300ms 窗口合并批量变更
- 触发: 调用增量扫描引擎（只传变更文件列表）

**守护进程入口扩展**:
```
# 新增 CLI 子命令
node src/daemon/index.js start       # 启动完整守护（含安全监控）
node src/daemon/index.js status      # 查看状态
node src/daemon/index.js stop        # 停止

# 新参数
node src/daemon/index.js start --security-only  # 仅启动安全监控
```

### 2. 增量扫描引擎

**位置**: 改造 `scripts/security-scan.js`

当前问题: 每次全量扫描 ~382 个 JS 文件，~5-8 秒。增量模式只需扫变更文件。

**接口**:
```js
// 全量扫描 (保留)
scanAll(): ScanResult[]

// 增量扫描 (新增)
scanFiles(filePaths: string[]): ScanResult[]

// 单文件扫描 (新增)
scanFile(filePath: string): ScanResult | null
```

**改造方案**:
- 将现有扫描逻辑暴露为 `scanFile(filePath)` 函数
- `scanFiles()` 并发扫描多个文件
- `scanAll()` 内部调用 `scanFiles(allFiles)`
- 保持输出格式完全兼容

**CLI 入口新增**:
```
node scripts/security-scan.js                    # 全量 (行为不变)
node scripts/security-scan.js --incremental a.js b.js  # 增量
node scripts/security-scan.js --watch            # 监控模式 (chokidar + 增量)
```

### 3. Pre-commit 升级

**当前**: 手动 `.git/hooks/pre-commit` 运行 `npx eslint . --max-warnings=0`（全量扫描）

**改为**: husky + lint-staged

- `husky`: 管理 git hooks（替代手动 `.git/hooks/` 文件）
- `lint-staged`: 只对 staged 文件运行 linter + 安全扫描

**配置**:

```json
// package.json
{
  "lint-staged": {
    "*.js": [
      "node scripts/security-scan.js --incremental",
      "npx eslint --max-warnings=0"
    ]
  }
}
```

安装: `npx husky init && npm install --save-dev lint-staged`

### 4. Dev Server 嵌入

**位置**: `server/index.js`

启动时检查是否在 `dev` 模式（`NODE_ENV=development`），自动启动安全守护：
- `dev` 模式: 启动守护，发现 HIGH 警告但不阻塞
- `production` 模式: 不启动（生产环境由 CI/CD + pre-commit 覆盖）

```js
// server/index.js (伪代码)
if (process.env.NODE_ENV === 'development') {
  const { startSecurityMonitor } = require('../src/daemon/securityMonitor');
  startSecurityMonitor();
}
```

### 5. 结果处理器

统一处理扫描结果的模块:

| 场景 | HIGH 违规 | MEDIUM 违规 | LOW 违规 |
|------|-----------|-------------|---------|
| 文件监控(dev) | 终端红色警告 + 日志 | 终端黄色提示 + 日志 | 仅日志 |
| 文件监控(prod) | 终端红色警告 + 日志 | 终端黄色提示 + 日志 | 仅日志 |
| pre-commit | **阻塞提交** | 警告但不阻塞 | 忽略 |
| CI (push/PR) | 阻断流水线 | 警告 | 忽略 |

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/daemon/index.js` | **修改** | 集成 chokidar 文件监控 + 安全守护逻辑 |
| `scripts/security-scan.js` | **修改** | 抽取 scanFile/scanFiles 接口，支持增量模式 |
| `server/index.js` | **修改** | 开发模式自动启动安全守护 |
| `package.json` | **修改** | 添加 lint-staged 配置 + husky/lint-staged 依赖 |
| `.husky/pre-commit` | **新建** | `npx lint-staged` |
| `.husky/.gitignore` | **新建** | 忽略 husky 内部文件 |
| `docs/superpowers/specs/2026-06-28-permanent-intelligent-security-phase0.md` | **新建** | 本设计文档 |

## 不纳入范围

- 规则 DSL / auto-fix（Phase 1）
- LLM 降噪（Phase 2）
- 自学习引擎（Phase 3）
- 自适应策略（Phase 4）
- 前端文件安全扫描（`frontend/` 有独立测试和 lint）
- TypeScript 文件扫描（tsc 已覆盖类型安全）

## 验收标准

1. 修改 `src/` 下的任意 JS 文件，3 秒内终端出现安全扫描结果
2. `git add` + `git commit` 时仅扫描 staged 文件，含 HIGH 违规则阻塞
3. `NODE_ENV=development npm run dev` 时自动启动安全守护
4. `node scripts/security-scan.js` 保持完全向后兼容
5. `node scripts/security-scan.js --incremental file1.js file2.js` 正常工作
6. 零回归: ESLint 0/0 · tsc PASS · Tests 363/56/0 · Security 0 HIGH · Audit 0 vulns

## 风险与缓解

| 风险 | 可能性 | 缓解 |
|------|--------|------|
| chokidar 内存泄漏 | 低 | 现有 SettingsSync.js 已使用，生产验证无泄漏 |
| 增量扫描漏报 | 中 | 同时保留每日全量扫描作为兜底 |
| lint-staged 与现有钩子冲突 | 低 | 备份并移除旧的 `.git/hooks/pre-commit` |
| 扫描阻塞 dev server 启动 | 低 | 守护异步启动，不阻塞主进程 |
