# UltraWork AI — BrainSystem 本地 AI 助手

本地运行的 AI 助手 server：对话 + 文档生成 + 记忆 + 学习闭环 + 技能方法论。

## 快速开始

```bash
npm start        # 启动 server（默认 qwen2.5:7b，备用 llama3.2）
# 或双击 start.bat（开机自启已配置）
```

访问 http://localhost:3000

依赖：Node.js ≥ 18、Ollama（`ollama serve` + `qwen2.5:7b`）。

## 真实能力（已真实验收）

| 能力 | 状态 |
|------|------|
| 对话（POST /api/chat）| ✅ 真实 Ollama 推理 |
| SSE 流式（/api/chat/stream）| ✅ 逐 token |
| 文档生成 docx/pdf/xlsx | ✅ 真实文件（canvas 暂未启用：缺原生依赖）|
| 网页爬取 + SSRF 防护 | ✅ 公开 URL 可爬、内网拦截 |
| 记忆（存→检索→注入）| ✅ |
| 教训学习闭环（纠正→学习→注入）| ✅ |
| 技能方法论注入 | ✅ 291 技能 |
| 模型自动降级（qwen→llama3.2）| ✅ |
| 匿名会话隔离 | ✅ |
| 认证防护 | ✅ JWT（JWT_SECRET 在 .env）|

## 诚实状态（未实现 / 占位）

| 项 | 说明 |
|----|------|
| PDF/DOCX 文本提取（read/edit action）| 未实现（需 pdf-parse/docx 解析库）|
| canvas 图形生成 | 未启用（`canvas` 原生依赖未安装）|
| /api/personality、/api/game、/api/vision、/api/workflow、/api/marketplace | 占位路由（返回 501 未实现）|
| BrainSystem 部分"子系统"（Dream/Ethics/Controller 等）| 模块不存在（相关方法返回 not initialized）|
| `src/commands`、`src/features`、`src/plugins`、`src/core/{agent-loop,compact,permissions,tools}` | 未接线的 TS 子系统（tsconfig 排除、测试用 vitest 未接入 jest）|

## 测试

```bash
npm test          # 352 suites / ~17000 tests
npm run lint
npm run typecheck
```

## 详细使用

见 `QUICKSTART.md`。