# QUICKSTART — BrainSystem 本地 AI 助手

> 本地运行的 AI 助手 server：对话 + 文档生成 + 记忆 + 学习 + 技能方法论。

## 启动

```bash
# 方式 1: npm
npm start

# 方式 2: 直接运行
node server/index.js
```

启动后访问：**http://localhost:3000**

启动日志确认（关键组件）：
```
[Server] Claude Code 模块初始化完成
[BrainSystem] 钩子系统已连接 (自动诊断/教训学习/风险分析/会话管理)
[BrainSystem] 全方面检查完成: 56 项 | 52 通过
[SelfCodeImprover] 自动代码改进循环已启动 (间隔: 1小时)
[ProactiveTaskEngine] 自主任务引擎已启动 (间隔: 30分钟)
```

## 核心使用

### 1. 对话（真实 LLM 推理）
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "x-session-id: mysession12345678" \
  -d '{"text": "帮我优化代码性能"}'
```
- 自动识别任务领域 → 注入相关技能方法论
- 自动记忆对话内容（按 session 隔离）
- 返回 `source: ollama`（真实推理）

### 2. 文档生成（真实文件）
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"text": "生成一份标题为周报的 Word 文档"}'
```
- LLM 自动调用 `generate_document` 工具
- 生成真实 docx/pdf/xlsx 文件到 `uploads/skills/`（canvas 图形生成暂未启用：需要 `canvas` 原生依赖，未安装）
- 工具结果返回文件路径

### 3. 网页爬取（含 SSRF 防护）
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"text": "抓取 https://example.com 的网页内容"}'
```
- 自动调用 `scrape_web` 工具
- 仅允许公开 http(s) URL（拒绝内网）

### 4. 系统状态
```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/chat/stats   # AI 路径指标
```

## 用于自身：真实使用建议

让系统**真实服务于开发工作**（产生真实流量，验证效果）：

1. **记忆开发历史**：把关键决策/教训存为对话 → 系统记忆积累
   ```bash
   curl -X POST .../api/chat -d '{"text": "记录：本次修复了 CRLF frontmatter bug"}'
   ```
2. **生成真实文档**：用系统生成项目报告/总结
   ```bash
   curl -X POST .../api/chat -d '{"text": "生成一份标题为系统审计报告的 PDF"}'
   ```
3. **方法论查询**：用技能注入获取专业建议
   ```bash
   curl -X POST .../api/chat -d '{"text": "如何做代码审查"}'
   ```

## 真实状态（诚实）

| 能力 | 状态 |
|------|------|
| 对话 / 文档 / 记忆 / 技能注入 / 学习闭环 / 自我改进 / 自主任务 / 安全 | ✅ 真实运转 |
| 多代理 / 情感 / 价值观 / 内省 | ⚠️ 实验性（未接入用户对话）|
| 真实流量验证 | ⏳ 待真实使用（`lessonsLearned` 需真实工具调用积累）|

## 自主运行（无需人工）

启动后自动运转：
- **每 30 分钟**：自主任务（教训验证 + 健康巡检）
- **每 1 小时**：自我代码改进扫描
- **启动时**：全方面检查（56 项）

## 环境要求

- Node.js ≥ 18
- Ollama（本地 LLM）：`ollama serve` + `ollama pull llama3.2`
- （可选）Playwright 浏览器（爬虫）：`npx playwright install chromium`

## 测试

```bash
npm test              # 全量测试
npm run lint          # ESLint
npm run typecheck     # TypeScript
```
