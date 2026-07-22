# 安全提醒 - 由 AI 记住

> 生成时间: 2026-04-14
> 来源: Claude Code 模块集成后安全审计

## 后续开放给其他用户时需要执行的安全措施

---

### 1. 审查所有自定义 Hook 配置

**文件**: `src/hooks/HooksManager.js`

**问题**: HookExecutor.executeCommand() 使用 exec() 执行命令

**已完成修复**:
- ✅ 添加命令白名单验证 (node, python, python3, git, npm, npx)
- ✅ 添加危险模式检测 (管道、命令链接、Shell 注入)
- ✅ 添加命令长度限制 (1000 字符)

**后续工作**:
- [ ] 开放用户前，审查所有注册的 Hook 配置
- [ ] 考虑添加 Hook 配置签名验证
- [ ] 记录所有 Hook 执行日志

---

### 2. 将用户存储迁移到数据库

**当前状态**: `server/routes/auth.js` 使用内存 Map 存储用户

**问题**: 内存存储在服务器重启后会丢失，不适合生产环境

**迁移建议**:
- [ ] MongoDB: `server/database/index.js` 已集成
- [ ] PostgreSQL: 可用于关系型数据存储
- [ ] 需要迁移字段:
  - 用户注册/登录
  - 会话管理
  - 审计日志

---

### 3. 启用更严格的 CORS 配置

**当前状态**: 
```javascript
corsOrigins: process.env.CORS_ORIGINS ? 
  CORS_ORIGINS.split(',') : 
  ['http://localhost:3000', 'http://127.0.0.1:3000']
```

**问题**: 开发环境允许 localhost，生产环境需要更严格控制

**迁移建议**:
- [ ] 生产环境必须设置 `CORS_ORIGINS` 环境变量
- [ ] 考虑添加域名白名单验证
- [ ] 添加 Origin 指纹验证防止 CSRF
- [ ] 考虑使用 CORS 预检请求缓存

---

### 4. 爬虫模块安全使用

**文件**: `src/agent/BrowserAgent.js`, `src/agent/DynamicScraper.js`

**已实现的安全措施**:
- ✅ URL 协议验证 (仅 HTTP/HTTPS)
- ✅ 元数据服务访问阻止 (169.254.169.254 等)
- ✅ 私有 IP 访问警告
- ✅ 请求超时保护
- ✅ Stealth 模式防检测

**使用建议**:
- [ ] 爬虫应在隔离环境运行
- [ ] 遵守目标网站的 robots.txt
- [ ] 添加请求频率限制
- [ ] 记录爬虫使用日志

---

## 安全加固清单

### 高优先级 (开放用户前必须完成)
- [ ] 用户数据迁移到数据库
- [ ] 设置 `CORS_ORIGINS` 环境变量
- [ ] 添加 IP 白名单功能 (可选)
- [ ] 启用双因素认证 (可选)

### 中优先级 (后续迭代)
- [ ] Hook 配置签名验证
- [ ] 敏感操作二次确认
- [ ] 异常行为检测
- [ ] 安全报告自动生成

### 低优先级 (增强体验)
- [ ] 用户角色权限细化
- [ ] 操作审计 Dashboard
- [ ] 安全通知推送

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `src/hooks/HooksManager.js` | Hook 执行器 (已加固) |
| `server/routes/auth.js` | 认证路由 (需迁移) |
| `server/middleware/index.js` | CORS 中间件 |
| `server/config/index.js` | 安全配置 |

---

## 提醒方式

当用户要求开放系统给其他人使用时，必须:
1. 检查此文件中的待办事项
2. 执行必要的迁移步骤
3. 验证安全配置
4. 报告给用户确认
