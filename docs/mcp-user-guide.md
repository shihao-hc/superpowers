# MCP 工具市场用户指南

> 基于 Model Context Protocol 的统一工具调用平台

---

## 目录

1. [快速开始](#快速开始)
2. [工具市场](#工具市场)
3. [创建 MCP 工作流](#创建-mcp-工作流)
4. [配置告警渠道](#配置告警渠道)
5. [权限与角色](#权限与角色)
6. [常见问题](#常见问题)

---

## 快速开始

### 访问工具市场

打开浏览器访问：`http://localhost:3000/mcp-market`

![MCP 工具市场界面](https://via.placeholder.com/800x400?text=MCP+Marketplace)

### 切换角色

工具市场会根据您的角色显示不同的可用工具：

| 角色 | 可用工具 |
|------|----------|
| 👑 管理员 | 所有工具（含删除、创建 Release 等危险操作） |
| ⚙️ 操作员 | 只读工具 + 部分写入工具（不能删除、不能创建 Release） |
| 👁️ 访客 | 仅只读工具（搜索、读取文件等） |

点击页面右上角的角色选择器切换角色，查看不同权限下可用的工具。

---

## 工具市场

### 浏览工具

1. **按服务器筛选**：点击左侧「服务器」列表，查看特定服务器的可用工具
2. **搜索工具**：在搜索框输入关键词，支持工具名称和描述搜索
3. **查看详情**：点击任意工具卡片，查看详细参数说明

### 工具详情

点击「查看详情」按钮后，可以看到：

- **工具描述**：工具的功能说明
- **参数说明**：每个参数的名称、类型、是否必填
- **调用示例**：JavaScript 和 cURL 两种调用方式
- **工作流示例**：该工具在流程中的位置

### 复制调用代码

在工具详情页，点击「复制」按钮获取可直接使用的代码：

```javascript
// JavaScript 调用示例
const result = await fetch('/api/mcp/call', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    toolFullName: 'filesystem:read_file',
    params: {
      path: '/var/log/app.log'
    }
  })
}).then(r => r.json());

console.log(result);
```

---

## 创建 MCP 工作流

### 使用预置模板

我们提供了多个 MCP 工作流模板，可以一键安装使用：

1. 访问工作流编辑器（或使用 API）
2. 选择模板：
   - 📊 **日志监控告警** - 监控日志文件，分析错误，创建 GitHub Issue
   - 🐙 **GitHub 监控报表** - 监控仓库 Issue，生成统计报表
   - 🔬 **跨平台研究报告** - 搜索 + 本地数据融合
   - 🔍 **代码审查助手** - 自动审查代码变更

### API 安装模板

```bash
# 安装单个模板
curl -X POST http://localhost:3000/api/workflows/templates/install \
  -H "Content-Type: application/json" \
  -d '{"templateName": "日志监控告警"}'

# 查看可用模板
curl http://localhost:3000/api/mcp/templates
```

### 手动创建工作流

在工作流编辑器中，拖拽以下节点类型：

| 节点类型 | 来源 | 说明 |
|----------|------|------|
| `mcp.filesystem.read_file` | MCP | 读取文件内容 |
| `mcp.filesystem.write_file` | MCP | 写入文件 |
| `mcp.github.create_issue` | MCP | 创建 GitHub Issue |
| `mcp.sequential-thinking.think` | MCP | AI 思考分析 |
| `input` | 内置 | 接收用户输入 |
| `output` | 内置 | 输出结果 |

### 示例工作流：日志分析

```
[输入日志路径] 
       ↓
[mCP 读取日志文件]
       ↓
[MCP AI 思考分析]
       ↓
[条件判断] → [创建 GitHub Issue] → [保存报告]
```

---

## 配置告警渠道

### 访问告警管理

1. 打开权限管理页面：`http://localhost:3000/mcp-permissions`
2. 切换到「告警规则」标签

### 预置告警规则

系统自动配置了以下告警规则：

| 规则名称 | 触发条件 | 告警级别 |
|----------|----------|----------|
| 敏感操作告警 | 调用 delete、create_release、write_file | 🟠 高 |
| 认证失败告警 | 权限验证失败 | 🟡 中 |
| 高频失败告警 | 同一工具连续失败 5 次 | 🟠 高 |
| 异常时间活动 | 非工作时间（6:00-22:00 外） | 🔵 低 |

### 添加通知渠道

1. 在「通知渠道配置」区域，点击「+ 添加通知渠道」
2. 选择平台类型（Slack、企业微信、Telegram、Discord）
3. 填写渠道名称和 Webhook URL/Token
4. 点击「添加」

### API 管理告警

```bash
# 查看告警规则
curl http://localhost:3000/api/mcp/alerts/rules

# 查看告警统计
curl http://localhost:3000/api/mcp/alerts/stats

# 查看告警历史
curl http://localhost:3000/api/mcp/alerts/history?since=3600000
```

---

## 权限与角色

### 查看角色权限

在权限管理页面，切换到「工具权限矩阵」标签，查看每个角色对每个工具的权限：

```
工具名称              Admin   Operator   Viewer
─────────────────────────────────────────────
filesystem:read_file   R        R         R
filesystem:write_file   W        W         ✗
filesystem:delete_file A        ✗         ✗
github:create_issue    W        W         ✗
github:create_release   A        ✗         ✗
brave-search:search    R        R         R
```

> R = 只读 | W = 读写 | A = 完全访问 | ✗ = 无权限

### 权限级别说明

| 级别 | 说明 | 典型工具 |
|------|------|----------|
| 只读 (Read) | 可查看、可调用 | read_file, search, list_issues |
| 读写 (Write) | 可修改、可创建 | write_file, create_issue |
| 完全 (Admin) | 所有操作 | delete, create_release |

---

## 常见问题

### Q: 为什么有些工具显示「需要更高权限」？

这表示该工具需要比您当前角色更高的权限。例如访客无法使用 `write_file`。请联系管理员提升权限。

### Q: 告警没有收到？

1. 检查告警规则是否启用
2. 确认通知渠道配置正确
3. 检查 Webhook 是否可达
4. 查看告警历史是否有记录

### Q: 如何查看审计日志？

```bash
# 查看最近 100 条审计日志
curl http://localhost:3000/api/mcp/audit/logs?limit=100

# 按角色筛选
curl http://localhost:3000/api/mcp/audit/logs?role=admin

# 导出 CSV
curl http://localhost:3000/api/mcp/audit/export?format=csv -o audit.csv
```

### Q: 工具调用失败怎么办？

1. 查看错误信息中的 traceId
2. 在审计日志中搜索该 traceId
3. 检查工具参数是否正确
4. 确认服务器是否在线：`/api/mcp/health`

---

## 技术支持

- 📧 邮件：support@example.com
- 💬 Slack：#mcp-support
- 📖 文档：https://docs.example.com/mcp
