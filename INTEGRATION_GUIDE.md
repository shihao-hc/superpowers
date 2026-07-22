# OpenCode BrainSystem 集成指南 v2.0

## 目录
1. [概述](#概述)
2. [方法1：Hook方式](#方法1hook方式)
3. [方法2：CLAUDE.md配置](#方法2claudiemd配置)
4. [方法3：启动器脚本](#方法3启动器脚本)
5. [快速验证](#快速验证)
6. [常见问题](#常见问题)

---

## 概述

本文档说明三种在 OpenCode 中集成 BrainSystem 的方法。

**核心功能：**
- 自动强制思考
- 意图分析
- 主动建议
- 情感表达
- 持久化
- 预测

---

## 方法1：Hook方式

### 原理
通过 OpenCode 的 Hook 机制，在每次对话前后自动调用 BrainSystem。

### 步骤

#### 步骤1：已创建的文件
```
D:/龙虾/.opencode-hooks/
├── brain-hook.js      (Hook主文件)
└── package.json       (配置文件)
```

#### 步骤2：在 OpenCode 中启用 Hook

**方��A：通过配置文件**
1. 找到 OpenCode 的配置文件 `opencode.json`
2. 添加：
```json
{
  "hooks": {
    "before-response": "D:/龙虾/.opencode-hooks/brain-hook.js",
    "after-response": "D:/龙虾/.opencode-hooks/brain-hook.js"
  }
}
```

**方法B：通过环境变量**
```bash
export OPENCODE_HOOK_BEFORE="D:/龙虾/.opencode-hooks/brain-hook.js"
export OPENCODE_HOOK_AFTER="D:/龙虾/.opencode-hooks/brain-hook.js"
```

**方法C：在项目 .env 文件中**
```
OPENCODE_HOOK_BEFORE=D:/龙虾/.opencode-hooks/brain-hook.js
OPENCODE_HOOK_AFTER=D:/龙虾/.opencode-hooks/brain-hook.js
```

#### 步骤3：验证

```bash
# 进入 hooks 目录
cd D:/龙虾/.opencode-hooks

# 安装依赖
npm install

# 测试 Hook
node brain-hook.js test
```

#### 预期效果
启用后，每次对话前会显示：
```
[BrainSystem] 意图分析中...
[BrainSystem] 建议加载: TDD
```

---

## 方法2：CLAUDE.md配置

### 原理
通过在 CLAUDE.md 中添加配置指令，让 AI 在每次响应前自动调用 BrainSystem。

### 步骤

#### 步骤1：修改 AGENTS.md
已在 `D:/龙虾/AGENTS.md` 中配置：
```
# 每次响应必须调用 BrainSystem
const { forceThink } = require('./src/core/BrainSystem');
forceThink(用户输入);
```

#### 步骤2：在 AGENTS.md 添加快捷命令

编辑 `D:/龙虾/AGENTS.md`，在末尾添加：

```
## 快捷命令

| 命令 | 功能 |
|------|------|
| `/brain status` | 显示 BrainSystem 状态 |
| `/brain test` | 运行功能测试 |
| `/brain persist` | 持久化当前状态 |
| `/brain clear` | 清除记忆 |

## 自动调用

每次对话前会自动调用：
1. forceThink() - 强制思考
2. analyzeIntent() - 意图分析
3. verifyCall() - 验证调用
```

#### 步骤3：验证

在新对话中输入：
```
请调用 BrainSystem 的 forceThink 分析："测试输入"
```

预期看到调用证明输出。

---

## 方法3：启动器脚本

### 原理
通过启动器脚本同时启动 OpenCode 和预热 BrainSystem。

### 步骤

#### 步骤1：双击运行脚本

**Windows (CMD):**
```bash
# 双击打开
opencode-brain.bat
```

**Windows (PowerShell):**
```powershell
# 右键 -> 使用 PowerShell 运行
.\opencode-brain.ps1
```

#### 步骤2：选择模式

```
========================================
 OpenCode BrainSystem Launcher
 版本: v19.0
========================================

请选择模式:
 1. 启动 OpenCode (标准模式)
 2. 启动 OpenCode + BrainSystem (增强模式)  <-- 推荐
 3. 运行 BrainSystem 测试
 4. 查看 BrainSystem 状态
 5. 退出

请输入选项 (1-5): 2
```

#### 步骤3：选择增强模式

```
[启动] 增强模式 (BrainSystem v19.0)...
[配置] 自动强制思考: 启用
[配置] 意图分析: 启用
[配置] 情感表达: 启用
[配置] 持久化: 启用

[提示] 在对话中我会自动调用 BrainSystem

正在启动 OpenCode...
```

---

## 快速验证

### 验证1：运行测试

```bash
node D:/龙虾/brain-entry.js --test
```

预期输出：
```
=== 运行测试 ===
✓ forceThink: OK
✓ analyzeIntent: OK
✓ proactiveThink: OK
✓ expressEmotion: OK
✓ predict: OK
✓ smartSearch: OK
```

### 验证2：查看状态

```bash
node D:/龙虾/brain-entry.js --status
```

预期输出：
```
=== BrainSystem 状态 ===
版本: v19.0
持久化 lessons: 94
主动思考次数: 0
智能记忆: 0
进化记录: 0
```

### 验证3：统一处理测试

```bash
node D:/龙虾/brain-entry.js "帮我优化代码性能"
```

预期输出：
```
=== 处理输入 ===
意图: code_optimize
置信度: 0.80
建议: performance-optimization, TDD
```

---

## 常见问题

### Q1: Hook 不执行？

**检查清单：**
1. OpenCode 版本是否支持 Hook
2. 配置文件路径是否正确
3. 权限是否足够

**解决方法：**
```bash
# 检查 OpenCode 版本
npx opencode --version

# 查看 Hook 配置
cat ~/.opencode/config.json | grep hook
```

### Q2: 启动太慢？

**原因：** 每次调用都重新加载 BrainSystem

**解决方法：** 使用预热模式
```bash
# 先预热
node brain-entry.js --status

# 再启动
npx opencode
```

### Q3: 权限错误？

**原因：** 文件访问权限不足

**解决方法：**
```powershell
# 以管理员身份运行 PowerShell
Start-Process powershell -Verb RunAs

# 或修改文件权限
icacls "D:/龙虾" /grant Everyone:F /T
```

### Q4: 找不到模块？

**检查路径：**
```
D:/龙虾/src/core/BrainSystem.js  (正确)
D:/龙虾/brain-entry.js            (入口)
```

**解决方法：**
```bash
# 确认文件存在
ls D:/龙虾/src/core/BrainSystem.js

# 重新安装依赖
cd D:/龙虾
npm install
```

---

## 推荐配置

### 最小配置 (方法3)

最简单，只需双击运行 `opencode-brain.bat`

### 推荐配置 (方法2)

在 AGENTS.md 中配置自动调用

### 完整配置 (方法1)

Hook + 配置 + 启动器

---

## 版本信息

- BrainSystem: v19.0
- 核心模块: 19个
- Skills: 304个
- 持久化: ✅
- 主动思考: ✅
- 情感表达: ✅

## 获取帮助

有问题请查看：
- `OPENCODE_INTEGRATION.md` - 原始集成指南
- `brain-entry.js` - 入口脚本
- `D:/龙虾/src/core/BrainSystem.js` - 核心代码