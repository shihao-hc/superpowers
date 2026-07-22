# Phase 1: 规则 DSL + Auto-Fix 框架

## 概述

构建声明式规则 DSL 和自动修复框架，将现有 24 条硬编码 regex 检查迁移为配置化规则，新增 auto-fix 能力，并利用 DSL 的简洁性将规则翻倍至 50+。

## 设计

### 规则 DSL 格式

```js
// scripts/rules/example.js
module.exports = {
  id: 'HARDCODED_SECRET',
  severity: 'HIGH',
  description: '检测硬编码密钥/密码',
  cwe: 'CWE-798',
  enabled: true,

  // 匹配模式
  patterns: [
    /(?:password|apiKey|api_secret)\s*[:=]\s*['"]([^'"\s]{8,})['"]/
  ],

  // 上下文过滤（减少误报）
  context: {
    excludePatterns: [/process\.env/, /require\(/, /mock/, /test/],
    requireKeywords: ['token', 'secret', 'key', 'auth']
  },

  // 可选：自动修复
  autoFix: {
    enabled: true,
    description: '替换为环境变量引用',
    fix: (match) => `process.env.${match.variable.toUpperCase()}`
  }
};
```

### 扫描引擎改造

新的扫描引擎流程：

```
加载所有规则文件 (*.js in scripts/rules/)
     │
     ▼
对所有规则编译 regex + context filter
     │
     ▼
scanFile(filePath):
  读取文件 → 逐行匹配每条规则
  命中 → 检查 context 排除/包含条件
  通过 → 记录结果（含 autoFix 信息）
  非通过 → 跳过
```

### Auto-Fix 框架

| 规则 | 修复方式 | 安全等级 |
|------|---------|---------|
| `Math.random()` 用于安全上下文 | `crypto.randomBytes(n).toString('hex')` | HIGH |
| `md5`/`sha1` 用于哈希 | `sha256` | HIGH |
| `exec`/`execSync` 含变量 | `spawn` + 参数数组 | HIGH |
| `console.log` 含敏感数据 | `logger.info` (结构化) | MEDIUM |
| 未设 limit 的 body parser | 添加 `limit: '10mb'` | LOW |

Auto-fix 模式：`--fix` 参数直接修改文件，`--fix-dry-run` 只输出建议。

### 规则翻倍目标

新增 26+ 规则覆盖：

**HIGH (12+)**
- AWS/GCP/Azure 密钥模式
- JWT 硬编码（`jwt.sign(` 含字面量 secret）
- 数据库连接串硬编码
- 内网 IP/域名硬编码
- 硬编码 OAuth token
- npm/GitHub token 模式
- 弱 TLS 版本（`TLSv1`/`TLSv1.1`）
- `eval` 替代品（`Function('return ' + ...)`）
- 不安全 `__proto__` 访问
- 不安全 `constructor` 访问
- 不安全 `prototype` 访问
- RegExp 拒绝服务（回溯爆炸模式）

**MEDIUM (8+)**
- 文件上传无大小限制
- 无 CSRF token
- Cookie 无 Secure/HttpOnly 标志
- CORS 允许所有来源
- 缺少 `X-Content-Type-Options`
- 缺少 `X-Frame-Options`
- 硬编码 User-Agent
- 长行/嵌套过深（可维护性）

**LOW (6+)**
- TODO/FIXME 注释遗留
- `var` 声明（非 const/let）
- 空 catch 块
- 未使用的变量/import
- 重复的 Object key
- 超过 500 行的文件

## 文件结构

```
scripts/
├── security-scan.js       # 修改：集成规则加载器
├── security-fix.js        # 新建：CLI 入口，--fix / --fix-dry-run
├── rules/                 # 新建：规则目录
│   ├── index.js           # 规则加载器 + 注册
│   ├── hardcoded-secrets.js
│   ├── command-injection.js
│   ├── weak-crypto.js
│   ├── insecure-random.js
│   ├── dom-xss.js
│   ├── nosql-injection.js
│   ├── ... (按类别拆分)
│   └── best-practices.js
└── auto-fix/              # 新建：修复器目录
    ├── index.js           # 修复调度器
    ├── crypto-fix.js      # Math.random → crypto.randomBytes
    ├── hash-fix.js        # md5/sha1 → sha256
    ├── exec-fix.js        # exec → spawn
    └── log-fix.js         # console.log → logger
```

## 不纳入范围

- LLM 降噪 / 自学习 / 自适应阈值（Phase 2+）
- 前端文件安全扫描（`frontend/`）
- TypeScript 文件扫描（tsc 已覆盖）
- 规则可视化编辑器

## 验收标准

1. 现有 24 条检查全部迁移至规则 DSL，输出完全一致
2. 新增 26+ 规则可独立启用/禁用
3. `--fix` 参数可自动修复已知模式
4. `--fix-dry-run` 只输出建议不修改文件
5. `require('./scripts/rules')` 返回所有规则的元数据
6. 零回归：ESLint 0/0 · tsc PASS · Tests 363/56/0 · Security 0 HIGH · Audit 0 vulns
