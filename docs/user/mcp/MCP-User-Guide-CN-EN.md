# MCP 功能用户手册 / MCP Feature User Guide

## 目录 / Table of Contents

- [快速开始 / Quick Start](#快速开始--quick-start)
- [工具市场 / Tool Market](#工具市场--tool-market)
- [Dry-run 预览 / Dry-run Preview](#dry-run-预览--dry-run-preview)
- [思维链 / Thinking Chain](#思维链--thinking-chain)
- [Roots 管理 / Roots Management](#roots-管理--roots-management)
- [安全机制 / Security](#安全机制--security)

---

## 快速开始 / Quick Start

### 访问 MCP 控制台 / Access MCP Console

1. 打开浏览器，访问 `http://localhost:3000/frontend/mcp-dashboard.html`
2. 查看 MCP 服务器状态和工具统计
3. 通过导航卡片进入各个功能模块

### 系统状态说明 / System Status

| 状态 / Status | 颜色 / Color | 含义 / Meaning |
|--------------|-------------|---------------|
| 🟢 在线 / Online | 绿色 / Green | MCP 服务器正常运行 / Server running |
| 🔴 离线 / Offline | 红色 / Red | MCP 服务器未连接 / Server not connected |
| 🟡 警告 / Warning | 黄色 / Yellow | 部分功能不可用 / Some features unavailable |

---

## 工具市场 / Tool Market

### 功能介绍 / Feature Overview

工具市场展示所有可用的 MCP 工具，带有安全注解标签，帮助你了解每个工具的风险等级。

**入口 / Entry Point**: `mcp-annotation-ui.html`

### 注解标签说明 / Annotation Labels

| 标签 / Label | 颜色 / Color | 含义 / Meaning |
|-------------|-------------|---------------|
| 📖 只读 / ReadOnly | 绿色 / Green | 不会修改数据 / Does not modify data |
| ✏️ 可写 / Writable | 黄色 / Yellow | 可能修改文件 / May modify files |
| ⚠️ 破坏性 / Destructive | 红色 / Red | 可能删除数据 / May delete data |
| 🔄 幂等 / Idempotent | 蓝色 / Blue | 多次执行结果相同 / Same result if run multiple times |

### 使用步骤 / Usage Steps

1. **浏览工具 / Browse Tools**
   - 使用左侧服务器筛选器查看特定服务器的工具
   - 使用搜索框按名称过滤工具
   - 使用类型过滤器按注解类型筛选

2. **查看工具详情 / View Tool Details**
   - 点击任意工具卡片查看详情
   - 查看工具参数说明和返回值格式

3. **执行工具 / Execute Tool**
   - 点击"执行"按钮调用工具
   - 📖 只读工具：直接执行
   - ⚠️ 破坏性工具：弹出确认对话框
   - ✏️ 可写工具：根据设置可能需要确认

### 风险等级 / Risk Levels

| 等级 / Level | 说明 / Description |
|-------------|-------------------|
| Safe | 安全操作，无风险 |
| Low | 低风险，仅读取信息 |
| Medium | 中等风险，修改配置 |
| Critical | 高风险，可能破坏数据 |

---

## Dry-run 预览 / Dry-run Preview

### 功能介绍 / Feature Overview

Dry-run 功能让你在执行操作前预览结果，确保操作符合预期，避免误操作。

**入口 / Entry Point**: `mcp-dryrun.html`

### 适用场景 / Use Cases

| 场景 / Scenario | 说明 / Description |
|---------------|-------------------|
| 编辑文件 / Edit File | 预览文件修改的差异 (diff) |
| 写入文件 / Write File | 预览新文件内容 |
| 删除文件 / Delete File | 预览将被删除的文件 |
| 创建目录 / Create Directory | 预览目录结构变化 |
| GitHub 操作 / GitHub Operations | 预览 Issue/PR 创建效果 |

### 使用步骤 / Usage Steps

1. **选择工具 / Select Tool**
   - 从下拉菜单选择操作类型
   - 工具类型包括：edit_file, write_file, delete_file 等

2. **输入参数 / Input Parameters**
   - 文件路径 (`filePath`)
   - 编辑内容 (`edits`) - JSON 格式
   - 当前内容 (`currentContent`) - 可选

3. **预览操作 / Preview**
   - 点击"预览"按钮
   - 查看差异对比视图 (Diff View)
   - 绿色表示新增，红色表示删除

4. **确认执行 / Confirm Execution**
   - 预览满意后点击"确认执行"
   - 系统将执行实际操作
   - 查看执行结果

5. **查看历史 / View History**
   - 切换到"历史"标签
   - 查看所有预览记录
   - 点击记录可重新预览

### Diff 视图说明 / Diff View Explanation

```
┌─────────────────┬─────────────────┐
│   修改前 (Before) │   修改后 (After)  │
├─────────────────┼─────────────────┤
│ - 删除的行 (Removed)   │ + 新增的行 (Added)    │
│   未修改的行 (Unchanged)   │
└─────────────────┴─────────────────┘
```

---

## 思维链 / Thinking Chain

### 功能介绍 / Feature Overview

思维链帮助你追踪复杂的推理过程，支持分支、反思和回溯操作。

**入口 / Entry Point**: `mcp-thinking-chain.html`

### 核心概念 / Core Concepts

| 概念 / Concept | 说明 / Description |
|---------------|-------------------|
| 思维链 / Chain | 一个完整的推理过程 |
| 思维步骤 / Thought | 链中的一个思考节点 |
| 分支 / Branch | 从某个步骤分出的新路径 |
| 反思 / Reflection | 对某个步骤的批评或反思 |
| 回溯 / Backtrack | 从某个步骤重新执行 |

### 使用步骤 / Usage Steps

1. **创建思维链 / Create Chain**
   - 点击"新建思维链"按钮
   - 输入初始问题或思考
   - 点击"创建"生成链

2. **添加思维步骤 / Add Thought**
   - 选择一个节点后点击"添加步骤"
   - 输入思考内容
   - 可选添加推理说明

3. **创建分支 / Create Branch**
   - 选择一个步骤后点击"创建分支"
   - 输入分支名称
   - 分支将作为子路径

4. **添加反思 / Add Reflection**
   - 选择一个步骤后点击"添加反思"
   - 输入批评或反思内容
   - 反思以特殊样式显示

5. **回溯执行 / Backtrack**
   - 选择一个步骤后点击"回溯"
   - 系统将从该步骤重新执行
   - 可用于修正错误推理

6. **保存为 Memo / Save as Memo**
   - 点击"保存为 Memo"
   - 当前思维链将保存为笔记
   - 可在 Memos 中查看

### 可视化图例 / Visualization Legend

| 图标 / Icon | 含义 / Meaning |
|------------|---------------|
| 🔵 | 主思维步骤 / Main thought |
| 🟡 | 分支节点 / Branch node |
| 🟠 | 反思节点 / Reflection |
| 🔗 | 步骤连接 / Step connection |

---

## Roots 管理 / Roots Management

### 功能介绍 / Feature Overview

Roots 管理允许你控制 MCP 工具可以访问的目录范围，确保操作安全性。

**入口 / Entry Point**: `mcp-roots.html`

### 权限类型 / Permission Types

| 权限 / Permission | 说明 / Description |
|------------------|-------------------|
| 📖 读取 / Read | 可以读取目录中的文件 |
| ✏️ 写入 / Write | 可以在目录中创建/修改文件 |
| 📋 只读 / ReadOnly | 只能读取，不能写入 |

### 使用步骤 / Usage Steps

1. **查看 Roots / View Roots**
   - 页面显示所有配置的根目录
   - 显示每个目录的权限和状态

2. **添加根目录 / Add Root**
   - 点击"添加根目录"按钮
   - 输入目录路径
   - 选择权限（读取/写入）
   - 点击"添加"

3. **验证路径 / Validate Path**
   - 在路径验证输入框输入路径
   - 点击"验证"按钮
   - 查看路径是否在允许范围内

4. **创建沙箱 / Create Sandbox**
   - 点击"创建沙箱"按钮
   - 系统生成临时目录
   - 自动添加到 Roots
   - 使用后可手动清理

5. **删除根目录 / Delete Root**
   - 点击根目录项的删除按钮
   - 确认删除操作
   - 目录将从 Roots 移除

### 路径验证结果 / Path Validation Results

| 结果 / Result | 说明 / Description |
|-------------|-------------------|
| ✅ 有效 / Valid | 路径在允许范围内 |
| ❌ 无效 / Invalid | 路径超出允许范围 |
| ⚠️ 权限不足 / No Permission | 路径存在但权限不够 |

---

## 安全机制 / Security

### 安全特性 / Security Features

| 特性 / Feature | 说明 / Description |
|---------------|-------------------|
| 路径限制 / Path Restriction | 工具只能访问 Roots 内的路径 |
| 操作预览 / Operation Preview | 执行前预览操作结果 |
| 破坏性确认 / Destructive Confirmation | 危险操作需二次确认 |
| 权限管理 / Permission Management | 细粒度权限控制 |

### 安全建议 / Security Tips

1. **最小权限原则 / Least Privilege**
   - 只添加必要的目录到 Roots
   - 优先使用只读权限

2. **使用 Dry-run / Use Dry-run**
   - 执行前先预览操作结果
   - 确认无误后再确认执行

3. **定期清理 / Regular Cleanup**
   - 定期清理不需要的 Roots
   - 删除临时沙箱目录

4. **监控操作 / Monitor Operations**
   - 关注告警通知
   - 审查操作日志

### 风险操作警告 / Risky Operation Warnings

```
⚠️  警告 / Warning: 以下操作可能导致数据丢失

- 删除文件 (delete_file)
- 删除目录 (delete_directory)
- 覆盖文件 (write_file with overwrite)
- 执行命令 (exec_cmd)
- 合并 PR (merge_pr)

执行这些操作前请务必使用 Dry-run 预览！
```

---

## 故障排除 / Troubleshooting

### 常见问题 / Common Issues

| 问题 / Issue | 解决方案 / Solution |
|-------------|-------------------|
| 工具执行失败 / Tool execution failed | 检查路径是否在 Roots 内 |
| 页面加载慢 / Page loads slowly | 刷新页面或检查网络连接 |
| 操作无法预览 / Preview not working | 检查工具参数格式是否正确 |
| MCP 服务器离线 / MCP server offline | 重启服务器或检查配置 |

### 获取帮助 / Get Help

- 查看服务器日志: `node server/staticServer.js` 控制台输出
- 检查 MCP 状态: 访问 `/api/mcp/status`
- 查看健康状态: 访问 `/api/mcp/health`

---

## 附录 / Appendix

### 相关链接 / Related Links

| 资源 / Resource | 链接 / Link |
|---------------|------------|
| MCP 文档 / MCP Docs | `/api-docs` |
| API 端点 / API Endpoints | `/api/mcp/*` |

### 版本信息 / Version Info

| 项目 / Item | 版本 / Version |
|------------|--------------|
| MCP 版本 / MCP Version | 1.0.0 |
| API 版本 / API Version | v1 |
| 最后更新 / Last Updated | 2026-03-21 |

---

*本文档由 UltraWork AI MCP 系统自动生成 / This document is auto-generated by UltraWork AI MCP System*
