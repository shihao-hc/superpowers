# Session 锚点归档（历史记录）

> 本文件是从 AGENTS.md 归档的历史 Session 锚点和运维记录。
> 当前有效的告诫 / 协议 / 动作清单仍在 AGENTS.md（本文件仅供追溯历史）。
> 归档时间：2026-10-16，原因：AGENTS.md 被 35 个历史锚点撑到 1000+ 行，核心内容被淹没。

---

## 7. Session 锚点

```
初始化检查锚点: 2026-06-17
- ESLint: 0/0
- TypeScript: 0 errors
- Tests: 597/56/0
- 安全审计: 9 阶段完成, P1/P2/P3 修复
- 垃圾清理: .pyc/err.txt/test_output.txt/claude-code-leak/
- 全面安全复查: OWASP Top 10, SSRF, deserialize, yaml, CORS, CSP, logging
  - 全面修复: express.urlencoded extended:true→false
  - 全面修复: enhancedCSP 已注册（nonce-based, 替代 helmet 静态 CSP）
  - 全面修复: EnhancedAuthService 已接入 /auth/login（5 次失败锁 15 分钟）
  - 全面修复: trustProxy 生产环境默认启用
  - 全面修复: errorLogger 栈追踪仅开发环境记录
  - 零回归: ESLint 0/0 | tsc 0 | tests 597/56/0

Session 锚点: 2026-08-12 (第90次 — 真实 xlsx 执行器: Excel 表格生成)
- ESLint: 0/0 (相关文件) | Tests: **345 passed suites / 4 skipped / 0 failed** (16,848 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent B5)**: xlsx/pptx 曾归档为 JSON stub; 用户要 Excel 表格得不到真实 .xlsx
- **XlsxExecutor 实现 (真实)**: `src/skills/executors/XlsxExecutor.js` — 用 exceljs (新依赖, 纯 JS 无编译, 3s 安装, audit 0) 生成真实 .xlsx
  - `create`: 基础表格 (标题 + sheet)
  - `createWithData`: 表头 + 数据行 (数组/对象)
  - `read`: 读取工作簿内容 (工作表 + 行)
  - `_resolveOutputPath`: 白名单安全路径 (uploads/skills/<skillName>), stat 失败 size=0 健壮
- **AsyncExecutor**: 白名单 + executorMap 加回 `xlsx` (真实执行器); 工具 schema enum 加 xlsx; `_ruleBasedDocumentCall` 加 `/excel|xlsx|电子表格|工作表/` → xlsx (`表格` 保持 docx Word 表格)
- **验证 (真实)**: create → 真实 .xlsx (6.5KB); createWithData → 带数据; read 回读 5 行; 路径穿越安全
- **新增 5 测试** (mock exceljs): create/createWithData/read/unsupported-action/AsyncExecutor 强制 skill 名
- **验证**: 全量 345/16,848/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 5 文件
- 相关文件: `src/skills/executors/XlsxExecutor.js` (新), `src/skills/agent/AsyncExecutor.js`, `server/services/chatService.js`, `tests/unit/xlsx-executor.test.js` (新), `package.json`

---

Session 锚点: 2026-08-12 (第90次b — 夯实: 通用路径透传 bug 修复 (所有 executor 文件路径曾为 null))
- ESLint: 0/0 (相关文件) | Tests: **345 passed suites / 4 skipped / 0 failed** (16,849 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **xlsx 真实端到端夯实**: chat 工具调用生成 Excel → toolResults {type:xlsx} + 真实 .xlsx 落盘; 普通对话不误触发
- **🔴 通用路径透传 bug 修复 (5.3 发现即修复)**: `_executeToolCalls` L238 `finalResult.result ? (result.path || finalResult.path) : null` — AsyncExecutor 的 `waitForCompletion` resolve `execution.result` (executor 直接返回 `{type,path,...}` 无 `.result` 字段) → `finalResult.result` undefined → **整个表达式返回 null, 所有 executor 的文件路径从未透传给用户** (docx/pdf/xlsx 都受影响, Round 71 引入)
  - 修复: `(finalResult.result && finalResult.result.path) || finalResult.path || null` (兼容 result 包装或直接返回)
  - 验证: xlsx + docx 均正确返回真实路径; 新增 1 测试 (真实执行 + tmp cwd, 断言路径存在且 .xlsx)
- **教训**: 清理 uploads/skills/ 时又误删已跟踪测试产物 → git checkout 恢复 (Round 71c 同教训重复)
- **验证**: 全量 345/16,849/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 2 文件
- 相关文件: `server/services/chatService.js`, `tests/unit/chat-service.test.js` (33→34)

---

Session 锚点: 2026-08-12 (第91次 — pptx 依赖评估放弃 + contextCompact 激活测试)
- ESLint: 0/0 (相关文件) | Tests: **345 passed suites / 4 skipped / 0 failed** (16,850 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **pptx 评估放弃 (诚实决策)**: `pptxgenjs` 安装成功但其依赖 `image-size` 引入 2 个 high 漏洞 → npm audit 0→2 → **回滚 pptxgenjs, 不实现 PPT** (零漏洞原则优先于功能扩展)
- **contextCompact 激活测试 (+1)**: Round 89 激活的上下文压缩此前无单测 → 用 jest.spyOn(shouldCompact/compact) 模拟触发 → 验证 conversation.messages 被压缩 (从 contextCompact.messages 映射回)
  - 坑: 直接用 `=` 赋值 shouldCompact/compact 会破坏真实实例 (后续测试调用 null() 抛错) → 必须 jest.spyOn 自动 restore
- **验证**: 全量 345/16,850/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 1 文件
- 相关文件: `tests/unit/chat-service.test.js` (34→35)

---

Session 锚点: 2026-08-12 (第92次 — 文件交付: 下载路由 + SSE 工具透传 + 前端文件链接)
- ESLint: 0/0 (相关文件) | Tests: **346 passed suites / 4 skipped / 0 failed** (16,854 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: 最高用户可见缺口 — 浏览器用户生成的文档无法访问 (uploads/ 无路由服务 + SSE onEnd 丢弃 toolResults + 前端只显示路径字符串不可点击)
- **文件交付实现**:
  - `server/routes/index.js` 加 `GET /api/files/:skillName/:filename`: 认证保护 + 严格格式校验 (防路径穿越) + res.download
  - `server/routes/chat.js` SSE onEnd 透传 `{source, toolResults}` (此前丢弃)
  - `frontend/index.html` 流式 end 事件渲染文件下载链接 (toolResults.path → /api/files/链接)
- **诚实评估**: 下载需认证 (安全正确) — 匿名主 UI 无法下载 (无认证浏览的固有权衡); 路径穿越经 express 规范化 (404/400); 匿名会话共享是已知限制 (需 session 体系, 留待后续)
- **新增 4 测试** (`tests/unit/file-download-routes.test.js`): 服务文件/404/穿越拦截/无效文件名 (mock middleware/dataMaskService/EnhancedAuthService/logger 使 routes/index 可加载)
- **验证**: 全量 346/16,854/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 4 文件
- 相关文件: `server/routes/index.js`, `server/routes/chat.js`, `frontend/index.html`, `tests/unit/file-download-routes.test.js` (新)

---

Session 锚点: 2026-08-12 (第93次 — 规则文档生成脱离 LLM 依赖: Ollama 宕机仍能生成文档)
- ESLint: 0/0 (相关文件) | Tests: **346 passed suites / 4 skipped / 0 failed** (16,855 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: Rank 2 — `_ruleBasedDocumentCall` 是纯确定性解析 (正则标题/类型), executors 也是纯函数, 但只在 `if (bridge)` + `result.ok` 路径内调用 → Ollama 宕机时文档生成完全死亡 (虽完全确定, 不依赖 LLM)
- **修复**: `generateResponse` fallback 路径 (catch 后, canned 话术前) 加规则兜底 — Ollama 不可用时, 用户明确请求文档仍确定性生成 (source: 'rule-based', ruleBased: true)
  - 不绕过 LLM: 仅在 LLM 失败后才走规则 (Ollama 可用时优先 LLM 路径)
- **验证**: `_getOllamaBridge` 返回 null → 文档请求 → rule-based 生成文件 (tools 1); 普通对话 → fallback 话术
- **新增 1 测试**: generates documents via rule-based fallback when Ollama unavailable
- **验证**: 全量 346/16,855/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 2 文件
- 相关文件: `server/services/chatService.js`, `tests/unit/chat-service.test.js` (35→36)

---

Session 锚点: 2026-08-12 (第94次 — processStream 多轮工具循环: 主 UI 与 POST 路径对齐)
- ESLint: 0/0 (相关文件) | Tests: **346 passed suites / 4 skipped / 0 failed** (16,856 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: processStream 工具块是单次检测 (调一次 LLM 带 tools, 有 tool_calls 执行一次), 与 generateResponse 的 4 轮循环不一致 → 主 UI 用户无法链式多轮 (读→生成)
- **修复**: processStream 工具块改多轮循环 (最多 4 轮, 与 generateResponse 一致): 每轮执行 tool_calls → 累积 roundHistory → 再调 LLM; 累积所有 toolResults; 达上限诚实告知 truncated
  - 无工具结果 → 回退流式 (不误拦截纯文本对话)
- **验证 (mock)**: 连续 2 轮 tool_calls + 最终文本 → toolResults 2 + bridge calls 3 (1 首轮 + 2 工具轮); 普通 SSE 对话仍流式 (27 chunks)
- **新增 1 测试**: supports multi-round tool calls in the stream path
- **诚实记录**: 真实 LLM (llama3.2) 在"读取文件"prompt 下偶尔幻觉 (编造 JSON 而非调工具) — 模型行为非代码 bug
- **验证**: 全量 346/16,856/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 2 文件
- 相关文件: `server/services/chatService.js`, `tests/unit/chat-service.test.js` (36→37)

---

Session 锚点: 2026-08-12 (第95次 — 工具调用可观测性: stats.tools 计数)
- ESLint: 0/0 (相关文件) | Tests: **346 passed suites / 4 skipped / 0 failed** (16,857 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: admin 可观测性 — chatService 无工具/文档生成计数, admin 无法看工具循环是否被用
- **stats.tools 计数**: `chatService.stats.tools` = {calls, success, failed, filesGenerated, byType} — `_executeToolCalls` 遍历 results 累加 (成功/失败/文件/类型分布)
  - GET /api/chat/stats 自动透传 (getStats 展开 stats)
- **验证**: 生成 Excel → calls 4/success 4/filesGenerated 4/byType {xlsx:4} (4 轮多轮循环每轮执行); stats 结构含 tools
- **新增 1 测试**: includes tool usage counters in stats structure
- **时序 flaky**: session-manager TTL 断言 5001 vs 5000 (毫秒边界) — 单独跑 33/33 过, 非回归
- **验证**: 全量 346/16,857/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 2 文件
- 相关文件: `server/services/chatService.js`, `tests/unit/chat-service.test.js` (37→38)

---

Session 锚点: 2026-08-12 (第96次 — 匿名会话隔离: 各浏览器会话独立上下文)
- ESLint: 0/0 (相关文件) | Tests: **346 passed suites / 4 skipped / 0 failed** (16,857 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: 所有匿名浏览器用户共享 `userId='anonymous'` 的 conversation → lastIntent/历史串流 (跨浏览器会话污染)
- **匿名会话隔离**: `server/routes/chat.js` 加 `getSessionUserId(req, res)`:
  - 已认证用户 → req.user.id
  - 匿名用户 → header `x-session-id` (首次生成 `anon_<uuid>` 存响应 header, 各浏览器会话独立)
  - regex `/^[a-zA-Z0-9_-]{16,64}$/` 校验 (防注入)
  - `frontend/index.html`: localStorage 存储/携带 x-session-id (上下文跨请求保留)
- **验证**: 不同匿名会话 distinct (isolated); 同 sid 复用 → 上下文保留 (4 messages); 注入 sid 被拒
- **测试超时修复**: "returns real file path" 真实生成 xlsx 全量下超时 5000ms → 加 20000ms
- **验证**: 全量 346/16,857/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 3 文件
- 相关文件: `server/routes/chat.js`, `frontend/index.html`, `tests/unit/chat-service.test.js` (38→38)

---

Session 锚点: 2026-08-12 (第97次 — 多轮工具 schema 修复 + MCP 每消息重载修复 + agent 跨用户记忆泄漏)
- ESLint: 0/0 (相关文件) | Tests: **346 passed suites / 4 skipped / 0 failed** (16,857 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: 发现 2 个真实 bug + 1 隐私泄漏
- **#1 多轮工具调用被真实 Ollama 破坏 (crown-jewel 功能)**: 工具循环第 1 轮传 tools schema, 但**后续每轮** `_chatWithRetry(bridge, sysPrompt, roundHistory)` 不带 tools → Ollama 无法返回 tool_calls → 链式任务 (读→生成) 生产中断; 且 `toolSchema` 变量未定义 (ReferenceError 被 try 吞 → fallback) → 修复: 提取 toolSchema 变量 + 每轮传 `{ tools: toolSchema }` (generateResponse + processStream)
  - 验证: round1 + round2 都带 tools (BOTH FIXED); 单测加 tools 传递断言
- **#2 MCP plugin 每消息重新加载**: `_buildToolsSchema` 检查 `plugin.status !== 'ready'` 但 MCPPlugin 成功 status='loaded' (永不 ready) → 每消息 onLoad 重新 spawn MCP 子进程 → 修复: 检查 `!== 'loaded' && !== 'ready'`
  - 验证: loaded 不重载 (onLoad 0 次); 真实 onLoad 设 loaded
- **#4 agent 路由跨用户记忆泄漏**: `agent.js` 调 generateResponse 没传 userId (第三参) → 记忆检索无过滤 → 用户 A 的记忆注入 B 的 prompt → 修复: 传 `req.user.id`
- **验证**: 全量 346/16,857/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 3 文件
- 相关文件: `server/services/chatService.js`, `server/routes/agent.js`, `tests/unit/chat-service.test.js` (38→38)

---

Session 锚点: 2026-08-12 (第98次 — 诚实错误提示: 后端故障对用户可见)
- ESLint: 0/0 (相关文件) | Tests: **346 passed suites / 4 skipped / 0 failed** (16,857 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: 后端故障对用户不可见 — SSE onError 发 `{error}` chunk 但前端忽略 (只处理 content/end) → 静默走 canned 话术"狐九在听"; POST 500 的 `{error}` 也被掩盖为 fallback
- **前端诚实错误处理** (`frontend/index.html`):
  - SSE 循环处理 `chunk.error` → 显示 "⚠️ AI 服务暂时不可用" (不静默 fallback)
  - 降级提示: `source === 'fallback'` → "（AI 服务暂不可用，以上为自动回复）"; `source === 'rule-based'` → "（AI 服务不可用，已用规则生成）"
  - 非流式回退检查 `data.error` → 显示错误 (非 canned)
  - `hasError` 标记 → 跳过 fallback 话术
- **验证**: SSE error 事件端到端 (`{error:"test backend failure"}` 发送成功); 前端 6 项改动 + script 标签平衡
- **验证**: 全量 346/16,857/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 1 文件
- 相关文件: `frontend/index.html`

---

Session 锚点: 2026-08-12 (第77次c — 多轮工具调用测试保护: truncated 单测)
- ESLint: 0/0 (相关文件) | Tests: **343 passed suites / 4 skipped / 0 failed** (16,832 passed / 46 skipped) 连续两次全量全绿 | npm audit: 0 vulns | Security: **0 HIGH**
- **测试保护补齐**: truncated 分支 (L492-494) 此前无单测 (仅探针验证) → 加单测: mock bridge 恒返回 tool_calls → 4 轮截断 → truncated:true + toolResults 4 + bridgeCalls 5 (1 首轮 + 4 工具轮)
- **验证**: 全量 ×2 343/16,832/0 (稳定性确认) + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 1 文件
- 相关文件: `tests/unit/chat-service.test.js` (27→28)

---

Session 锚点: 2026-08-12 (第78次 — 会话持久化: server 重启后恢复多轮上下文)
- ESLint: 0/0 (相关文件) | Tests: **343 passed suites / 4 skipped / 0 failed** (16,833 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent 排序)**: D5 多轮工具调用已完成 (Round 77) → 下一个最高价值 D4 会话持久化 (可靠性: server 重启后对话上下文丢失, 最可见的用户缺口)
- **会话持久化实现**: chatService `conversations` Map 纯内存 → 加磁盘持久化:
  - `_saveConversations()`: 对话变更后写 `data/conversations.json` (processMessage assistant 消息 push 后调用)
  - `_loadConversations()`: 构造函数水合 (timestamp 字符串转 Date, 恢复 personality/context/messages/lastActivity)
  - CONVERSATIONS_FILE 模块级常量 (cwd 依赖)
- **验证 (跨进程)**: 进程 A 保存 → 进程 B (模拟重启) 水合恢复: personality ✅ messages ✅ lastIntent.code ✅ timestamp 转 Date ✅
- **测试隔离**: `jest.isolateModules` + `fs.mkdtempSync` 临时 cwd (CONVERSATIONS_FILE 依赖 cwd) — 避免污染真实 data/
- **测试副作用处理**: 主 describe 的 processMessage 会真实写 data/conversations.json (运行时数据) → `.gitignore` 加 `data/conversations.json`
- **新增 1 测试**: persists and restores conversation across restart (临时 cwd 隔离)
- **验证**: 全量 343/16,833/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 3 文件
- 相关文件: `server/services/chatService.js`, `tests/unit/chat-service.test.js` (28→29), `.gitignore`

---

Session 锚点: 2026-08-12 (第79次 — 前端响应合约修复: 浏览器用户看到真实 LLM 回复)
- ESLint: 0/0 (相关文件) | Tests: **343 passed suites / 4 skipped / 0 failed** (16,833 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: 发现真实用户可见 bug — `frontend/index.html:1091` 读 `data.text || data.response || data.message` (回退 canned 话术), 但 `routes/chat.js:45-48` 返回 `{success:true, data:{text,...}}` → 回复在 `data.data.text` → `data.text` 恒 undefined → **浏览器用户从未看到 BrainSystem 真实回复, 一直看 canned fallback**
  - 此前 AGENTS.md "end-to-end chat 200" 验证是 API 级 (curl/supertest), 非浏览器级 — 此 mismatch 从未被捕获
- **修复**: `frontend/index.html` 读取改为 `nestedData = data.data || data` → `nestedData.text` (支持两种结构), emotion 同理
  - 验证: 模拟前端 fetch → 读到真实 LLM 回复 "好！" (不再 fallback)
- **诚实记录**: 前端 HTML 内嵌 JS 无自动化测试 (全量测试不受影响); 生产 server/index.js 服务此 frontend 确认
- **验证**: 全量 343/16,833/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 1 文件
- 相关文件: `frontend/index.html`

---

Session 锚点: 2026-08-12 (第99次 — 教训学习闭环真实化: 占位符 → 实质内容 + 自动审核)
- ESLint: 0/0 (相关文件) | Tests: **346 passed suites / 4 skipped / 0 failed** (16,859 passed / 46 skipped, +2) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户质疑"成果是否有作用、进步是否应用在自身" — 用数据诚实审计)**:
  - 功能层真实可用 (对话/工具/文档/流式/文件交付/隔离/安全)
  - **但自我进化层是名义的**: `growth.json` → `lessonsLearned: 0`; 28 条 pending 全是占位符 `（待审核）`; improvements.json 70 条是交互日志非代码修复; 教训库 70 条 title 全是 "a"/"b" (测试垃圾)
  - 根因: `requireApproval: true` (默认) → 所有教训走 `_extractLesson` (写占位符) → 无自动审核 → pending 卡死; 且教训来源仅 MCP POST_TOOL_USE
- **修复 1 — 教训实质内容** (`LessonLearner._extractLesson`): `lesson: '（待审核）'` → `this._inferLessonText(data)`; `improvement` 同理; 新增 `priority` (security→high)
- **修复 2 — 自动审核低风险教训** (`LessonLearner.autoApproveSafeLessons`): 非 security + 有实质内容 (length>5) 的 pending → 自动 approve 生效; **security 保持人工审核** (防污染风险决策, 延续 Round 55/68)
- **修复 3 — 闭环运转接入** (`BrainSystem.js:2017` POST_TOOL_USE 钩子): recordEvent 后调 autoApproveSafeLessons (低风险自动生效)
- **真实验证 (非 mock)**: 真实 `globalHookRegistry.trigger(HookEvents.POST_TOOL_USE, ctx)` → 触发前 lessons 0 → **触发后 1 条** ("成功修复: 修复了数据库连接泄漏 bug" 实质内容) + 剩余 pending 0
  - 关键: registry API 是 `trigger` 非 `emit` (用错则静默无操作)
- **清理**: 测试污染数据重置 (lessons.json 70 条 "a"/"b" 垃圾 → 空库; pending-lessons.json 28 条占位符 → 空)
- **测试**: `lesson-learner.test.js` +2 (实质内容非占位符 / 自动审核低风险+security保留); mock 用内存 store 支持写入后读回
- **验证**: 全量 346/16,859/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 3 文件
- 相关文件: `src/core/LessonLearner.js`, `src/core/BrainSystem.js`, `tests/unit/lesson-learner.test.js`

---

Session 锚点: 2026-08-12 (第100次 — 自我改进真实化: 检测器误报消除 + 自动修复从空壳到真实)
- ESLint: 0/0 | Tests: **346 passed suites / 4 skipped / 0 failed** (16,861 passed / 46 skipped, +2) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户问"运行模式是否具备智能全自动化" — 运行时审计)**: 40+ setInterval 自动循环但多为机械运维; 关键缺口: SelfCodeImprover 启动扫描 6 问题 (2 空 catch + 4 重复 require) 但 **0 自动修复、全部需手动**
- **根因 1 — 检测器误报** (`_checkDuplicateRequire`): 原正则 `/require(...)/g` 统计所有 require 出现，不区分顶层/局部作用域 → 把合法的**局部延迟 require** (BrainSystem 钩子内 require、AttestationService L196 局部 crypto、LessonLibrary L93 局部 fs/path) 误报为"重复" → 修复: 正则改 `/^const\s+\w+\s*=\s*require(...)$/gm` (行首无缩进 = 顶层)
- **根因 2 — 自动修复空壳** (`_applyFix`): `_canAutoFix` 声明 duplicate-require 可修复，但 `_applyFix` 对**所有类型**恒返回 `{success:false, '需要手动处理'}` → "自动修复"从项目创建起从未真正修复过任何文件 → 新增 `_fixDuplicateRequire`: 删顶层重复 require 行 (保留首次) + 局部 require 保留 + `new vm.Script()` 语法校验通过才写盘 + 失败保留原文件 (原子安全)
- **空 catch 修复 (真实缺陷)**: `AgentRegistry.js:87` 事件回调错误静默吞 → 加 console.warn; `AgentLoop.js:17` BrainFlow 可选集成失败空吞 → 显式 `brainFlow = null` 降级
- **验证**: 扫描 6 → **0 问题** (误报消除 + 空 catch 修复); `_applyFix` 探针: 顶层重复删除 + 局部保留 + 语法 PASS; 运行时日志 "[SelfCodeImprover] 扫描完成: 0 问题"
- **测试**: self-code-improver.test.js 更新语义 (单行内联 → 多行顶层; 新增 2: 忽略局部重复 / _applyFix 无顶层重复安全失败); 注意 ESLint quotes 要求单引号 → --fix
- **诚实结论**: 自我改进从"空壳"变"真实" (检测准确 + 可自动修复顶层重复); 但系统仍**无自主行动** (被动等输入), 未达"智能全自动"
- **工作树审计**: 提交只含本会话 4 文件
- 相关文件: `src/core/SelfCodeImprover.js`, `src/core/AgentRegistry.js`, `src/agent/AgentLoop.js`, `tests/unit/self-code-improver.test.js`

---

Session 锚点: 2026-09-14 (第101次 — 自主行动闭环: 观察→决策→行动→记录 + 教训驱动标记)
- ESLint: 0/0 | Tests: **346 passed suites / 4 skipped / 0 failed** (16,872 passed / 46 skipped, +11) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户选方案B"自主行动边界"**: 让自我改进从"定时扫描+记录"升级为"自主观察→决策→行动→记录"闭环, 并把学习(教训库)真正连接到行动(修复)); 设计文档 `docs/superpowers/specs/2026-09-14-autonomous-action-loop-design.md`
- **LessonLibrary.searchByType(issueType, tags)**: 按问题类型关键词映射 (duplicate-require/empty-catch/version-inconsistency/...) + tags 匹配相关**未应用** (排除 `_applied`) 教训; 复用已有 markApplied
- **SelfCodeImprover 自主行动闭环**:
  - `_getLessonLib()` 惰性 + `_findRelatedLesson(issue)` 匹配教训
  - `_recordAction(action)` 行动日志 `.opencode/evolution/actions.json` (去重: 同 type+file+action+result 不重复记录, 防循环噪音; 限长 200)
  - `_autoFix` 成功时: 关联教训 → markApplied → 记录行动 (含 lessonRef)
  - `runImprovementCycle` 升级: 不可修复问题记录 `manual-required` (needs-human) 到行动日志
- **发现并修复真实 bug (5.3)**: `_scanFile` 的 issue.file 是 **basename** (如 'BrainBridge.js'), 而 `_fixDuplicateRequire` 用它做路径 → existsSync 恒失败 → 自动修复**永远无法定位文件** (第100次未暴露因扫描0问题) → issue 加 `path` (完整路径) 字段, `_fixDuplicateRequire` 用 `issue.path || issue.file`
- **测试根治 (防污染)**: lesson-library.test.js 只 mock `_load` 没 mock `_save` → `add()` 测试真实写盘污染 `.opencode/lessons.json` (2 条 "a"/"b" 垃圾) → beforeAll 补 `_save` mock; 清理真实数据
- **集成验证 (非 mock)**: 临时目录真实文件 + 教训库 → scan 1 issue (path 完整) → _autoFix 1 → 顶层 fs require 1 → 教训 markApplied YES → 行动日志 1 条 `{type,file,action:'auto-fix',lessonRef:'lesson_1',result:'fixed'}`
- **测试**: lesson-library +4 (searchByType 匹配/tags/排除已应用/无匹配), self-code-improver +7 (闭环 7), 共 +11
- **运行时验证**: 0 问题 → 0 行动 (无噪音), 教训库统计正常
- **工作树审计**: 提交只含本会话 5 文件 + spec (已提交)
- 相关文件: `src/core/LessonLibrary.js`, `src/core/SelfCodeImprover.js`, `tests/unit/{lesson-library,self-code-improver}.test.js`, `docs/superpowers/specs/2026-09-14-autonomous-action-loop-design.md`

---

Session 锚点: 2026-09-14 (第101次b — 完整测试验证中发现并修复: 教训库启动重复累积 bug)
- ESLint: 0/0 | Tests: **346 passed suites / 4 skipped / 0 failed** (16,873 passed / 46 skipped, +1) | npm audit: 0 vulns | Security: **0 HIGH**
- **发现 (完整测试验证时)**: 每次 server 启动 lessons.json **追加 34 条** (34→68→...→340) → 教训库无限增长 (之前读到的 340 = 34×10)
- **根因**: `LessonInitEngine._initDefaultLessons` 在 `existingStats.total > 0` 时只清理 designNotes，但**无条件**追加 34 条预设教训 → 每次启动重复
- **修复 (5.3 发现即修复)**: `total > 0` 分支末尾加 `return` (已有教训 = 已初始化 → 幂等跳过默认预设)
- **验证**: 启动前 0 → 第1次 34 → 第2次仍 34 (幂等生效); 新增回归测试 (total>0 时 add 不被调)
- **注意**: lessons.json 是运行时数据 (未跟踪); 34 条为合法预置教训 (保留)
- 相关文件: `src/utils/LessonInitEngine.js`, `tests/unit/lesson-init-engine.test.js`

---

Session 锚点: 2026-09-14 (第102次 — 自主任务引擎: 教训验证 + 健康巡检)
- ESLint: 0/0 | Tests: **347 passed suites / 4 skipped / 0 failed** (16,885 passed / 46 skipped, +12) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户选"补自主任务缺口" → "两者结合")**: 让系统从"被动等输入"变"主动发起"; 用户确认**分离设计** (教训验证只标记+记录, 自动修复仅限已有安全机制)
- **设计文档**: `docs/superpowers/specs/2026-09-14-proactive-task-engine-design.md`
- **新建 `src/core/ProactiveTaskEngine.js`**:
  - `runTasks()` = `runLessonVerification()` + `runHealthCheck()`
  - **任务1 教训验证** (启发式只读): active 教训 → `_extractKeywords` (英文词+停用词过滤) → `_buildSrcIndex` (一次扫描 src 6 目录, 限 1500 文件) → 命中 markApplied / 未命中记录待办; **不自动改代码**
  - **任务2 健康巡检** (只读): pending 积压 / actions manual-required 积压 / 教训 active 比例 >0.8 → 异常写行动日志; 健康无噪音
  - `_recordAction` 复用 actions.json (去重: type+action+lessonRef+result)
  - `startAutoLoop(30min)` / `stopAutoLoop()`
- **接入 `server/index.js`**: 启动时 `new ProactiveTaskEngine().startAutoLoop(30*60*1000)` + `brainTaskEngine` 声明/清理/导出
- **受控验证 (真实 src)**: 34 条预置教训 → verified 4 + pending 30; markApplied **持久化 OK** (applied 0→4); 行动日志 30 verify-pending + 4 verify-applied + 1 health; 引擎启动日志 YES
- **诚实局限 (记录)**: 教训验证是**启发式** (自然语言无法精确映射代码); 预置中文教训命中率低 (4/34, 因英文关键词少) → 保守只标记确凿命中, 不乐观误判; 引擎**只读验证+标记+报告, 不自动改代码**
- **测试**: `tests/unit/proactive-task-engine.test.js` (新, 12 tests): 教训验证 (命中标记/未命中待办/跳过已应用/空)/健康巡检 (积压/比例/健康无噪音)/去重/启停
- **工作树审计**: 提交只含本会话 3 文件 + spec
- 相关文件: `src/core/ProactiveTaskEngine.js` (新), `server/index.js`, `tests/unit/proactive-task-engine.test.js` (新), `docs/superpowers/specs/2026-09-14-proactive-task-engine-design.md`

---

Session 锚点: 2026-09-14 (第102次b — 完整验证中发现并修复: 记忆跨用户隔离失效)
- ESLint: 0/0 | Tests: **347 passed suites / 4 skipped / 0 failed** (16,886 passed / 46 skipped, +1) | npm audit: 0 vulns | Security: **0 HIGH**
- **发现 (实际效果验证时)**: `BrainSystem.smartSearch('...', 5, 'other')` 命中其他用户记忆 → 跨用户隔离**失效** (隐私 bug)
- **根因**: `SmartMemory.search`/`semanticSearch` 的用户过滤只检查 `memory.metadata.userId`，但 `chatService` 用 `smartStore(key, { input, userId })` 把 userId 放在 **value** 里（metadata 为空）→ `metadata.userId` undefined → 过滤永不生效
- **为何测试未捕获**: 现有隔离测试用 `store(key, value, { userId })`（metadata.userId），未覆盖 chatService 实际用法（value.userId）
- **修复**: `search` + `semanticSearch` 过滤改为 `(metadata.userId) || (value.userId)`（兼容两种存储）
- **验证**: 自己用户命中 / 其他用户 **0 命中**（隔离生效）; 新增回归测试 `search isolates by value.userId (chatService pattern)`
- **注意**: 无 userId 的记忆仍共享（设计：系统记忆）；仅带 userId 的记忆隔离
- 相关文件: `src/core/SmartMemory.js`, `tests/unit/smart-memory.test.js` (25→26)

---

Session 锚点: 2026-09-14 (第103次 — 真实使用验证 + 误导性声明根治)
- ESLint: 0/0 | Tests: **347 passed suites / 4 skipped / 0 failed** (16,887 passed / 46 skipped, +1) | npm audit: 0 vulns | Security: **0 HIGH**
- **真实使用验证 (HTTP 用户入口)**: 对话 200/source ollama + 文档生成真实文件 + /health + GET / 全部工作 → 系统可通过真实用户入口使用
- **发现并修复真实 bug (5.3)**: PDF 生成失败 — LLM 幻觉返回 `action:'createWithData'`（不存在的 action）→ PdfExecutor "Unsupported action" → AsyncExecutor 捕获后**回退 create** (AsyncExecutor.js:515 区域) + 回归测试 +1
- **记忆持久化验证**: 正确传 `x-session-id` header → 同会话记忆命中（之前未命中是 probe 未传 header，非 bug）
- **误导性声明根治 (诚实化)**:
  - "305 个Skills" → `技能指令库: 已加载 305 个 SKILL.md（供 AI 参考；可执行工具 5 个: docx/pdf/canvas/xlsx）` (BrainSystem.js + SkillRecognizer.js log)
  - "全方面检查 14维度56项自动触发" → "启动时真实运行" (log 修正, 上轮已接入真实 run)
  - 多代理/情感/价值观/内省 → `接入状态: 对话/记忆/教训/思考/工具=已接入用户路径; 多代理/情感/价值观/内省=实验性(未接入用户对话)` (BrainSystem.js 构造后标注)
- **验证**: 启动日志诚实 (无残留 "个Skills"/"自动触发" 误导); 全量 347/16,887/0
- **工作树审计**: 提交只含本会话文件
- 相关文件: `src/skills/agent/AsyncExecutor.js`, `tests/unit/async-executor.test.js`, `src/core/BrainSystem.js`, `src/core/SkillRecognizer.js`, `docs/audit/2026-09-14-system-honest-audit.md`

---

Session 锚点: 2026-08-12 (第80次 — 真实 Ollama 流式输出: processStream 接真实推理)
- ESLint: 0/0 (相关文件) | Tests: **343 passed suites / 4 skipped / 0 failed** (16,834 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: Direction A — 真实流式输出是聊天助手的 #1 感知质量特性; `processStream` 是假流式 (L595 硬编码话术逐字符 setTimeout); `OllamaBridge.chat` 已支持 stream:true (返回 ollama SDK async iterable) 但未接线
- **processStream 真实流式**: `_getOllamaBridge` → `bridge.chat(messages, {stream:true})` → `for await` 迭代 chunk → 每 delta 调 onData (type:chunk/content/fullText) → onEnd({source:'ollama', text})
  - 保留 fallback (Ollama 不可用 → 原话术逐字符)
  - 持久化会话 (_saveConversations) + source 透传
- **验证 (真实 Ollama)**: 30 个 chunks (真实逐 token 流式), source:ollama, 完整回复; 单测 mock async iterable → 3 chunks + stream:true 断言
- **新增 1 测试**: streams real Ollama output via async iterable
- **诚实记录**: 前端 stream.html 未接 EventSource (假流式在 UI 层仍未消费); WS chat.html 用 socket.io 不匹配生产 ws 库 — 均留待前端接线
- **验证**: 全量 343/16,834/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 2 文件
- 相关文件: `server/services/chatService.js`, `tests/unit/chat-service.test.js` (29→30)

---

Session 锚点: 2026-08-12 (第81次 — 会话持久化健壮性: 防抖 + 异步写盘 + shutdown flush)
- ESLint: 0/0 (相关文件) | Tests: **343 passed suites / 4 skipped / 0 failed** (16,834 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: brave-search 不可行 (包未装 + BRAVE_API_KEY 未设) — 需外部 API key + 网络安装, 不适合自动推进; 转向内部健壮性 Direction D — `_saveConversations` 同步全量 writeFileSync 无防抖, 每消息阻塞事件循环 (O(N) 随用户增长)
- **会话持久化健壮性修复**: `_saveConversations` 改防抖 + 异步写盘:
  - `_conversationsDirty` 标记 + 500ms 防抖 timer (合并短时间多次变更)
  - `fs.writeFile` 异步写盘 (不阻塞事件循环)
  - `shutdown()` 加 flush (清 timer + 同步写盘, 防抖未触发时保证不丢失)
- **测试**: 持久化测试改 async + `await svc1.shutdown()` (flush 同步写盘, 替代立即检查防抖文件)
- **验证**: 防抖+flush 跨进程保存 ✅; 全量 343/16,834/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 2 文件
- 相关文件: `server/services/chatService.js`, `tests/unit/chat-service.test.js` (30→30)

---

Session 锚点: 2026-08-12 (第82次 — 前端 SSE 流式接线: 浏览器用户看到逐 token 输出)
- ESLint: 0/0 (相关文件) | Tests: **343 passed suites / 4 skipped / 0 failed** (16,834 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **前端 EventSource 接线 (第80次服务端流式的 UI 层)**: `frontend/index.html` sendMessage 从 POST /api/chat (非流式) → 优先 SSE /api/chat/stream
  - 转换 typingDiv 为流式输出容器 (移除 typing-indicator + 追加 content div)
  - `getReader()` 读流 → 解析 SSE events → 每 chunk 追加 content → 逐 token 显示
  - 非流式回退 (content-type 非 event-stream 或失败 → JSON 解析)
- **验证 (真实 server)**: SSE 端点 200 + text/event-stream + 23 事件 (逐 token) + [DONE]; 前端集成确认 (getReader/streamResponse/fallback)
- **诚实记录**: stream.html 是直播演示页 (socket.io 假聊天) 非真实 UI; 前端 HTML 无自动化测试
- **🔴 防抖 timer 泄漏修复 (5.3 发现)**: 第81次防抖引入 — `_saveConversations` 的 500ms timer 若测试结束未触发 → 进程挂起 (worker force-exit) → 加 `.unref()` (防抖 timer 不阻止进程退出, 生产 shutdown flush 兜底)
- **验证**: 全量 343/16,834/0 + ESLint 0/0 + Security 0 HIGH; 测试套件 EXIT 0 无 worker 警告
- **工作树审计**: 提交只含本会话 2 文件
- 相关文件: `frontend/index.html`, `server/services/chatService.js`

---

Session 锚点: 2026-08-12 (第83次 — processStream 功能对齐: 主 UI 路径获得记忆/教训/思考 + 统计)
- ESLint: 0/0 (相关文件) | Tests: **343 passed suites / 4 skipped / 0 failed** (16,834 passed / 46 skipped) 全量通过 | npm audit: 0 vulns | Security: **0 HIGH**
- **方向探查 (subagent)**: Gap 4a — processStream (浏览器主 UI 路径) 是功能贫瘠的: 无记忆/教训/思考注入、无工具调用、无统计 → 用户默认聊天路径"最笨"
- **提取 `_buildSysPrompt` 共享方法**: 记忆(语义+关键词) + 教训 + 思考注入 + 工具提示 → 返回 {sysPrompt, toolTrigger}; generateResponse 复用 (消除内联冗余 ~45 行)
- **processStream 功能对齐**: 
  - 动态 sysPrompt (复用 _buildSysPrompt, 含记忆/教训/思考注入)
  - 意图分析 + smartStore (用户消息 + 回复, 与 processMessage 对称, 匿名不写)
  - stats 计数 (totalMessages/totalLatency/llm.attempts/successes)
- **验证 (真实 Ollama)**: 流式 23 chunks + source ollama; stats 更新 (attempts 1/successes 1/totalMessages 1)
- **重构**: generateResponse 内联注入块替换为 _buildSysPrompt 调用 (代码复用, 行为不变)
- **验证**: 全量 343/16,834/0 + ESLint 0/0 + Security 0 HIGH
- **工作树审计**: 提交只含本会话 1 文件
- 相关文件: `server/services/chatService.js`

---

## 运维记录: opencode 数据迁移 C盘→D盘 + 卡顿修复 (2026-08-15)

### 背景问题
- opencode 桌面 APP (v1.16.2, Electron) 发消息无显示/无回复, 只能新建会话
- 根因 1: 快照仓库 packed-refs 被写成 46 字节全零 → git 报 `fatal: unterminated line` → snapshot 服务每 3-5 秒失败一次, 阻塞消息处理 (日志 85+ 条重复错误)
- 根因 2: opencode.db 达 6.4GB 膨胀 (event 表 44.5万行, message.part.updated.1 事件 34.5万条), C盘空间紧张

### 数据布局 (最终)
| 位置 | 用途 | 状态 |
|------|------|------|
| `D:\opencode-data\opencode` | **正式数据** (桌面APP正在使用) | ✅ 活跃 |
| `C:\Users\Administrator\.local\share\opencode` | C盘原数据 | 🛡️ 备份 (未使用) |
| `D:\opencode-backup-20260815` | 迁移时快照备份 (6.4GB) | 🛡️ 备用 |

### 迁移机制 (关键)
- opencode 数据目录由 `XDG_DATA_HOME` 环境变量控制 (已验证: `opencode debug paths` 显示 data 跟随)
- 已设置用户级环境变量: `XDG_DATA_HOME=D:\opencode-data` (桌面APP sidecar 会继承)
- 验证方法: D盘 opencode.db 被 OpenCode 进程锁定使用中 = 迁移生效; C盘 DB 未被锁定 = 已切走
- 桌面APP (v1.16.2) 与 CLI opencode (v1.2.27) 版本不同, 但共享同一数据目录机制
- `opencode debug paths` / `opencode session list` / `opencode db` / `opencode export` 是官方工具

### 本次修复动作
1. 修复 packed-refs: 损坏文件备份为 `packed-refs.bak-zero` 后移除, git fsck 全过
2. 迁移到 D 盘: robocopy + SQLite backup API (一致性), snapshot 中途中断曾致 680/2801 文件缺失 → 已用 C盘完整快照 /MIR 补全 (objects 2130, index 310988)
3. 数据库体检: integrity_check=ok, quick_check=ok, foreign_key_check=0, 632 会话/5.5万消息完整

### 验证命令
`powershell
opencode debug paths          # 确认 data=D:\opencode-data\opencode
opencode session list         # 632 个历史会话
python -c "..."               # DB 完整性检查 (readOnly)
`

### 回滚方法
- 删除用户环境变量 XDG_DATA_HOME → opencode 回到 C 盘原数据, 一切如初
- C盘原数据 + D:\opencode-backup-20260815 双保险
- 确认稳定后可删除 C盘原数据 (~6.4GB) 和 D:\opencode-backup-20260815 释放空间

### 升级后续 (2026-08-18)
- 桌面 APP 从 v1.16.2 升级到 **v1.18.18** (手动下载安装，绕过代理对 GitHub CDN 限速)
  - 根因: opencode 更新器 ERR_CONNECTION_RESET (代理对 github.com 页面可达但 CDN 下载被限速 ~44KB/s)
  - 方案: 6 段分段 curl 下载 (每段 20.1MB) + 拼接，SHA256 验证后 GUI 安装
- **UI 渲染 bug 修复确认**: 之前"消息发送无响应"会话在 v1.18.18 下正常显示/回复 (根因是 v1.16.2 前端渲染 bug，非引擎/数据问题)
- 数据库: integrity=ok, 632 会话/55712 消息完整, events 从 44万降至 290 (v1.18.18 事件溯源迁移, 正常)
- D盘 DB 6301MB 活跃使用, C盘原数据 + D盘备份 + 会话存档(D:\opencode-exports\) 三重保障

### 长期增强 (2026-08-18)
- 建立 opencode 自动维护机制 (方案B: Windows 任务计划)
- 脚本位置: `D:\opencode-tools\`
  - `maintain-opencode.ps1` (主脚本): 调用 Python 检查 + 版本检查 + 汇总日志
  - `check_opencode.py` (Python): DB integrity/fk 检查 + 快照 git fsck + 在线备份(保留5份) + 磁盘检查
  - `reports/` (检查报告) + `maintain.log` (运行日志)
- 定时任务: `OpenCode-Maintain` (每周日 3:00, 自动运行, 全自动)
- 备份位置: `D:\opencode-backup-20260815\auto\` (SQLite 在线一致性备份, 自动保留最近5份)
- 设计原则: **只读+复制, 绝不删除用户数据** (仅自动清理自身旧备份)
- 验证: 手动+定时触发均成功, DB integrity=ok, 快照3仓库健康, 版本检查正常

---

Session 锚点: 2026-09-14 (第104次 — 技能价值发挥: 对话注入 SKILL.md 技能指导)
- ESLint: 0/0 | Tests: **348 passed suites / 4 skipped / 0 failed** (16,893 passed / 46 skipped, +6) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户"先发挥技能价值")**: 305 技能是 SKILL.md 指令文档 (290 含 SKILL.md, 0 可执行脚本), 是给 AI 助手读的指令, 运行时 server 无法自动执行 → 接入: 对话时匹配技能 → 注入 SKILL.md 指导 → LLM 按指令行动
- **接入 `chatService._buildSkillGuidance(text)`**: 提取独立方法 (分离关注点, 可独立测试); SkillRecognizer.recognize 匹配 top1 (score>=0.5) → 读 SKILL.md 摘要 (去 frontmatter, 限 1000 字符) → 注入 sysPrompt; 非侵入式 (无匹配/失败 → 空, 不影响对话); 惰性单例 `_skillRecognizer`
- **发现并修复真实 bug (5.3)**: `OllamaBridge.embed` 的 `client.embeddings` 无超时 → Ollama 无 embeddings 端点时 HTTP 挂起 (测试/首次调用偶发挂起) → 加 5s 超时 (Promise.race + clearTimeout)
- **测试根治**: chat-service 技能测试被 conv-persist chdir 污染 (cwd 变 temp → 技能路径不存在 → 不注入) → skill describe beforeEach 显式 `process.chdir(projectRoot)` 防御
- **端到端验证**: "帮我优化代码性能" → source ollama → 回复按 performance-optimization 方法论 ("有哪些性能瓶颈/优化目标")
- **测试**: chat-service.test.js +5 (匹配注入/无匹配/阈值/文件不存在/SKILL.md body)
- **验证**: 全量 348/16,893/0 + ESLint 0/0
- 相关文件: `server/services/chatService.js`, `src/localInferencing/OllamaBridge.js`, `tests/unit/chat-service.test.js`

---

Session 锚点: 2026-09-14 (第105次 — 技能注入补强: 完整效果检验 + 结构化提取 + 边界修复)
- ESLint: 0/0 | Tests: **347 passed suites / 4 skipped / 0 failed** (16,896 passed / 46 skipped, +5) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户"是否完整测试检验实际效果是否达标")**: 补做完整效果检验 (多领域匹配/对比实验/边界/HTTP入口) → 发现 2 真实不足 + 局限
- **完整效果检验**:
  - 多领域: performance/ui-ux/security-audit/docker/code-review 匹配注入; "爬虫"未匹配 (发现缺口)
  - 对比实验: 有技能 vs 无技能 → 回复不同 YES (但提升有限, 小模型遵循度)
  - 边界: 空文本注入 advanced-css-animations (发现 bug); HTTP 入口 200 + 技能方法论回复
- **修复 1 (空文本注入 bug)**: `recognize('')` 兜底匹配 css 技能 → `_buildSkillGuidance` 空/极短文本 (length<2) 直接返回空
- **修复 2 (自定义模块只告知不执行)**: 自定义模块 (DynamicScraper 爬虫等, isCustomModule) → 注入能力描述 `系统具备「DynamicScraper」：拾号-爬虫系统...` (告知能力; 执行需接入 AsyncExecutor, 留待后续)
- **结构化技能提取 (解决小模型遵循度)**: `_extractSkillEssence(body)` 提取 SKILL.md 骨架 (前 3 主章节的标题/步骤/要点, 跳过代码块与尾部元数据) 而非塞 1000 字符正文 → LLM 更容易遵循 (code-review 端到端: "代码审查结果 → 1. Correctness → ...")
- **测试**: chat-service.test.js +5 (空文本防御/自定义模块/essence 提取/前3章节截断/断言更新)
- **验证**: 全量 347/16,896/0 + ESLint 0/0
- 相关文件: `server/services/chatService.js`, `tests/unit/chat-service.test.js`

---

Session 锚点: 2026-09-14 (第106次 — 匹配覆盖: 从 SKILL.md trigger 自动提取关键词)
- ESLint: 0/0 | Tests: **348 passed suites / 4 skipped / 0 failed** (16,900 passed / 46 skipped, +4) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户选"关键词扩展")**: keywordMap 硬编码 126 个关键词覆盖不全; 发现 SKILL.md 有 `trigger:` 字段 (如 `trigger: "性能优化 | Redis缓存"`) 可自动提取
- **实现**: `SkillRecognizer._parseSkill` 解析 trigger (去除前后引号); `_loadSkills` 加载后从每个 SKILL.md 的 trigger 按 `[|，,、;；]` 分割 → 补充 keywordMap (**不覆盖已有硬编码映射**)
- **效果**: keywordMap 126 → **209** (+83 trigger 词); "性能优化"→performance-optimization / "UI设计"→ui-ux-design / "代码审查"→code-review / "设计系统"→awesome-design-md 全部注入
- **测试**: `tests/unit/skill-recognizer-trigger.test.js` (新, 4 tests): trigger 提取/多分隔符/不覆盖硬编码/按 trigger 词识别
- **验证**: 全量 348/16,900/0 + ESLint 0/0
- 相关文件: `src/core/SkillRecognizer.js`, `tests/unit/skill-recognizer-trigger.test.js` (新)

---

Session 锚点: 2026-09-14 (第107次 — 自定义模块执行: 爬虫接入 + SSRF 防护)
- ESLint: 0/0 | Tests: **349 passed suites / 4 skipped / 0 failed** (16,906 passed / 46 skipped, +6) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (项 1: 自定义模块从"告知"到"执行")**: DynamicScraper 有完整接口 (init/scrape/scrapeMultiple/close) 但只注入 description → 接入 AsyncExecutor
- **新建 `src/skills/executors/ScrapeExecutor.js`**: 适配 DynamicScraper (类实例方法) 为 static execute 接口; **SSRF 防护 `isSafeUrl`** — 拒绝 localhost/127.x/10.x/192.168.x/172.16-31.x/0.0.0.0/[::1]/非 http(s)/非 URL, 仅允许公开 http(s)
- **接入**: AsyncExecutor `builtinExecutable` + `executorMap` 加 `'dynamic-scraper': 'ScrapeExecutor'`; chatService 工具 schema 加 `scrape_web` 工具 + `_executeToolCalls` 加 scrape_web 分支 (经 AsyncExecutor 执行, SSRF 拦截在 executor 内)
- **验证**: SSRF 防护 12/12 正确; 爬虫执行路径 (mock DynamicScraper): 公开 URL 执行 / 内网拦截 / 缺 url 报错 全过
- **测试**: `tests/unit/scrape-executor.test.js` (新, 6 tests): isSafeUrl 白名单+黑名单 / execute 公开URL / SSRF拦截 / 缺url / 非string url
- **诚实边界**: 爬虫仅 SSRF 防护 (拒绝内网), 外部恶意站点风险仍在 (爬虫本身特性, 非 SSRF); 真实爬取需网络
- **验证**: 全量 349/16,906/0 + ESLint 0/0
- 相关文件: `src/skills/executors/ScrapeExecutor.js` (新), `src/skills/agent/AsyncExecutor.js`, `server/services/chatService.js`, `tests/unit/scrape-executor.test.js` (新)

---

Session 锚点: 2026-09-14 (第108次 — 技能库完整性审计 + CRLF frontmatter bug 修复)
- ESLint: 0/0 | Tests: **349 passed suites / 4 skipped / 0 failed** (16,907 passed / 46 skipped, +1) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户"检查技能库是否都可完整使用")**: 系统性审计 292 个技能目录
- **审计发现 (首次误报)**: 263 个技能"frontmatter 无效" — 根因是 **CRLF bug**: SKILL.md 用 `\r\n` 换行 (Windows), 但 `_parseSkill` 的 frontmatter 正则 `/^---\n/` 只匹配 `\n` → 263 个 CRLF 文件的 name/description/trigger 全未解析 (name 靠目录名 fallback, trigger 仅 24 个, description 仅 42 个)
- **真实影响**: trigger 自动提取 (第106次, keywordMap 126→209) 只覆盖了 24 个 LF 文件的 trigger — **263 个 CRLF 技能的 trigger 全部漏掉**; 识别靠硬编码 126 关键词才部分工作
- **修复**: `_parseSkill` frontmatter 正则 `/^---\r?\n([\s\S]*?)\r?\n---/` (兼容 CRLF)
- **修复效果**: trigger 24→**287** | description 42→**305** | keywordMap 209→**691** (+482 trigger 词) | "CSS动画"→advanced-css-animations (现经 trigger 而非硬编码)
- **重新审计 (CRLF 兼容)**: 292 目录 → **290 SKILL.md 完好** (2 个缺 SKILL.md 为 superpowers/_templates 模板目录, 合理)
- **测试**: skill-recognizer-trigger.test.js +1 (CRLF frontmatter 解析)
- **验证**: 全量 349/16,907/0 + ESLint 0/0
- 相关文件: `src/core/SkillRecognizer.js`, `tests/unit/skill-recognizer-trigger.test.js`

---

Session 锚点: 2026-09-14 (第109次 — 学习闭环真实运转: 对话纠正触发学习)
- ESLint: 0/0 | Tests: **349 passed suites / 4 skipped / 0 failed** (16,912 passed / 46 skipped, +5) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户"让学习闭环真实运转")**: `lessonsLearned: 0` 揭示真实缺口 — 教训学习只在 MCP POST_TOOL_USE 触发, 对话/文档生成不触发 → 真实使用中学不到东西
- **修复 (补全接线, 非造新组件)**:
  - `LessonLearner.recordFeedback({ feedback, previousReply })`: 检测纠正信号 (`不对|错了|不是这样|应该是|修正|incorrect|should be` 等) → `_extractLesson` 记录教训 (input="用户纠正: X", result='corrected', tags=['fix','correction'])
  - `chatService.processMessage`: 用户消息后调 `recordFeedback` (关联上一轮助手回复) + `autoApproveSafeLessons` (低风险自动生效, security 保持人工); 非侵入式 try-catch
- **真实使用验证**: 对话纠正 ("不对，应该用索引而不是全表扫描") → 教训库 **34 → 38 (+4)**; 新教训 "从实践中学习: 用户纠正: ..."; 普通消息 ("今天天气不错") 不触发 ✅
- **测试**: lesson-learner.test.js +4 (纠正识别/普通不记录/空/多种纠正信号)
- **验证**: 全量 349/16,912/0 + ESLint 0/0
- 相关文件: `src/core/LessonLearner.js`, `server/services/chatService.js`, `tests/unit/lesson-learner.test.js`

---

Session 锚点: 2026-09-16 (第110次 — 上下文校准: token 预算与真实能力对齐 + 真实账本 + 无损优化)
- ESLint: 0/0 | Tests: **349 passed suites / 4 skipped / 0 failed** (16,926 passed / 46 skipped, +13) | npm audit: 0 vulns | Security: **0 HIGH**
- **背景 (用户: token 是最关键问题, 但质量为先, 不能为省 token 牺牲质量)**: 数据基准揭示根因不是"撑爆窗口"而是"预算与现实的错配 + 全程不可见"
- **P1 上下文校准 (bug 级修复)**:
  - `OllamaBridge.js`: 显式 `num_ctx` (默认 8192, env `OLLAMA_NUM_CTX`), 修复 Ollama 默认 2048 → 模型静默截断 (此前压缩预算 100K vs 真实 ~2K 的错配 = 最大质量缺陷)
  - `chatService.js`: ContextCompact 预算对齐真实 num_ctx (100000→8192, buffer/warning 按比例); `stats.tokens {prompt, completion, total, requests}` 用真实 `prompt_eval_count/eval_count` 记账 (Ollama 已返回却一直被丢弃); >80% 利用率 console.warn (静默截断风险可见); getStats 暴露 contextLength
  - `ContextCompactService.js`: 中文感知 token 估算 (CJK ≈ 1 字符 1 token, 替代 chars/4 低估 → 压缩触发过晚)
- **基准采集 (真实 Ollama 4 场景)**: 普通对话 73 prompt / 技能对话 243 (技能注入 +170) / 文档生成 203 (tools +130) / 40 条历史→回放 6 条仅 +92 (slice(-6) 锁死, 长会话不膨胀)
- **修复空文本静默降级 (诊断发现的质量缺陷)**: LLM 成功但返回空文本 → 曾静默 canned 话术 (前端误显示"AI 服务不可用") → POST 路径空文本重试一次 + 仍空返回 `source:'empty-response'` 诚实告知; SSE 路径空流同样诚实告知
- **无损优化: 技能 essence 同会话去重**: 同会话同技能只完整注入一次, 后续极简引用 (LLM 从对话历史延续) → 实测同技能第 2 条 prompt **243→95 (-61%)**
- **memory/lessons 注入安全阀**: memBody ≤600 字符 / lessonBody ≤300 (正常不触发, 防极端超长撑爆上下文)
- **诚实放弃 (质量风险/收益不确定)**: prompt 前缀 KV 缓存 (动态注入破坏前缀稳定性)、小模型路由、语义缓存接 chat 均不做
- **验证**: 全量 349/16,926/0 + ESLint 0/0 + Security 0 HIGH + 真实 HTTP 端到端 (第 2 条同技能请求 2953ms→457ms, 去重+KV 复用); 临时基准脚本已清理
- **已知限制 (诚实)**: SSE 空流只诚实告知未重试 (流式重试复杂); jest 偶发 open-handle 不退出 (--forceExit 可过, 非回归)
- **质量评测 (真实 A/B/C 对比, 提交 8008c25)**: 3 场景 × 3 版本 (完整/无thinkText/纯基础) 真实 Ollama 实测 →
  - **发现**: forceThink 元认知提问注入对 llama3.2 净负面 — "回答前请先思考：…？" 被弱模型误认为用户输入 (曾现"我看到两个question符号"回复), 且干扰技能 essence 遵循 (场景2 去 thinkText 后回复更贴合技能方法)
  - **修复**: _buildSysPrompt 移除 thinkText 注入 (forceThink 保留为 BrainSystem 内部能力, 仅不注入用户 prompt)
  - **实证**: 技能注入有效 (V2 回复采用 Redis/PM2/函数记忆化 = essence 方法); 移除后真实复测技能遵循正常
  - 测试 +1 (sysPrompt 不得含思考提问)
- **记忆检索修复 (提交 1e76c01)**: SmartMemory.search 用 `split(/\s+/)` 英文分词 → 中文整句永不匹配 value → **记忆存了但从未被检索** (probe: 存"用户喜欢用Vue开发前端", 查"我平时用什么技术栈" → 空) → `_tokenize` 切 CJK bigram + 英文词; 注入改为提取 `value.input` (不再把含 userId 的原始 JSON 塞进 prompt, 隐私+省 token); 真实复验模型正确回复"你喜欢用 Vue 和 Tailwind"; 测试 +3
- **教训检索修复 (提交 ca1aae1)**: LessonLibrary.search 整句 includes → 中文自然语言查询永不命中短标题 → **教训注入从未生效** → 同款 bigram 分词; 真实复验 "优化代码性能" 0→3 命中, sysPrompt 现含教训注入; 测试 +1
- **自我进化闭环端到端验证 (提交 94501df)**: 对话纠正→教训学习→再问同类问题→教训注入→回复体现 完整打通 — 发现对话纠正学习的教训把主题存在 `context` 字段但 search 不匹配 → 加了 context 字段匹配; 真实闭环: 纠正"应该用索引而不是全表扫描" → 教训+1 → 再问"优化数据库查询" → 教训注入 true → 模型回复"使用索引：在需要的列上建立索引"; 测试 +1
- **质量评测结论**: 注入系统 (思考/记忆/教训) 全部真实验证 — 思考净负面(已移除)、记忆/教训此前从未生效(已修复)、技能净正(保留); 遗留: `_extractTags` 中文标签仅统计不影响检索(低优先)
- **模型能力评测 + 升级 (提交 90d206d)**: 13 题真实 A/B (中文/代码/逻辑/多轮) → **llama3.2 77% vs qwen2.5:7b 88.5%**; 决定性差异在多步推理短板区 (灯泡开关/汽水瓶 llama 全失败, qwen 全对; 成语出处 qwen 正确); 系统级验证 qwen 技能遵循更明确
  - **Ollama 模型目录迁移 D 盘** (C 盘满): `OLLAMA_MODELS=D:\ollama-models` (用户级) + robocopy 迁移 6.2GB (清理 4.36GB partial 残留)
  - **默认模型切换**: `OLLAMA_MODEL=qwen2.5:7b` (用户级); llama3.2 保留作备用
  - **模型自动降级 (fallback)**: `fallbackModels` (默认 llama3.2, env `OLLAMA_FALLBACK_MODELS`); 主模型失败→依次尝试备用→都失败才 canned; `result.model` 报告实际使用模型; 真实验证 nonexistent-model→降级 llama3.2 成功; 测试 +3
  - 权衡: qwen 质量 +11.5% 但响应更慢 (7B CPU, 5-15s vs 3B 2-3s)
- 相关文件: `server/services/chatService.js`, `src/localInferencing/OllamaBridge.js`, `src/agent/ContextCompactService.js`, `src/core/{SmartMemory,LessonLibrary}.js`, `tests/unit/{chat-service,ollama-bridge,context-compact-service,smart-memory,lesson-library}.test.js`, `tests/unit/skill-fullstack.integration.test.js` (flaky 超时修复)

---

Session 锚点: 2026-09-18 (第111次 — 支流检查: 前端XSS + 并发/重启验证 + 存储层净化)
- ESLint: 0/0 | Tests: **276 passed suites / 4 skipped / 0 failed** (13,053 passed / 46 skipped, +4) 全量通过 | npm audit: 0 vulns
- **背景 (用户"源头已修, 查支流和未检查部分")**: 高级审计协议(4.4)实战扩展到未覆盖面: 前端JS安全、并发/竞态、重启恢复、MCP其他工具、chatService边界
- **前端XSS审查 (subagent) 发现+修复**:
  - F2 [HIGH]: MCP工具元数据未转义 + onclick注入 (外部MCP name/description → 前端XSS, dev可利用) → **服务端 `sanitizeToolMeta`** (mcp.js: name安全字符集 + desc去尖括号, /tools + /status) — 验证: 恶意payload中和, 合法工具保留
  - F3 [MEDIUM]: index.html 文件链接文本未转义 → `escapeHtml(fn)`
  - F1 [HIGH记录]: **生产CSP nonce断裂** (nonce从不注入HTML → production下前端0 JS + XSS藏CSP后) → README诚实状态记录 (当前dev模式可用)
- **staticServer限流绕过 [HIGH当前]**: 备用入口 staticServer.js apiLimiter **信任x-forwarded-for首值** (每请求换IP即获新桶; 主入口已修此入口漏) → 改 `ipKeyGenerator(req.socket.remoteAddress)`; 顺带 `extended:true→false`
- **marketplace存储型XSS [HIGH潜伏]**: updateSkill/addReview/status无角色检查 + auth guest放行匿名 → **api.js中间件: 所有非GET写路由拒绝guest(401)** (PoC: 401×3/GET 200) + **SkillMarketplace存储层净化**: updateSkill白名单字段 + 字符串HTML转义, addReview转义title/content/reviewer (+3测试, 92 passed) — 纵深防御(已认证用户也不能播种)
- **chatService边界修复**: LLM幻觉返回 `[null]` tool_calls → `call.function` TypeError → 静默canned话术 (同Round110空文本类) → _executeToolCalls 校验无效元素 push {ok:false} (真实链路验证: [null]→正常回复, 非canned; +1测试)
- **真实验证通过 (非漏洞)**: 并发5请求全部隔离+持久化未损坏 | server重启后会话恢复 (重启后回答"你叫测试用户甲") | MCP工具双层白名单+bridge纵深扎实, sequential-thinking无副作用
- **教训 (工作流)**: Write覆盖了已存在的711行测试文件 (教训: 写新文件前先 glob/检查存在性) → git checkout恢复 + 追加合并 + soft reset修正错误提交 (未推送可reset)
- **验证**: 全量 276/13,053/0 + ESLint 0/0
- 相关文件: `server/routes/mcp.js`, `server/staticServer.js`, `server/services/chatService.js`, `src/skills/api.js`, `src/skills/marketplace/SkillMarketplace.js`, `frontend/{index,marketplace}.html`, `tests/unit/{chat-service,skill-marketplace}.test.js`

---

Session 锚点: 2026-09-18 (第112次 — BrainSystem深度审计 + 真实场景验证 + 复盘机制落地)
- ESLint: 0/0 | Tests: **276 passed suites / 4 skipped / 0 failed** (13,055 passed / 46 skipped, +2) 全量通过
- **BrainSystem 深度审计 (威胁建模+数据流+边界穷举) 发现 4 个真实问题全修复**:
  - F1 [HIGH当前]: guardrail hook 触发全项目 `eslint --fix` (30s同步阻塞+改写源码) → verify 只读(不--fix)+只查指定文件+--fast(不写baseline); 实测单文件verify mtime不变
  - F2 [MEDIUM当前]: 用户纠正教训共享 → 跨用户prompt注入 → 教训带userId隔离 (根因: _insertIntoLibrary 转active时丢弃userId); 实测A命中自己/B看不到
  - F3 [MEDIUM当前]: 每次MCP调用产生空垃圾教训+3次同步写盘 → recordEvent 拦截JSON success标记结果 (result:'fixed'仍记录)
  - F4 [MEDIUM潜伏]: _deepMerge 原型污染 → 跳过 __proto__/constructor/prototype
- **真实场景端到端 (qwen2.5:7b)**: 模型正确拒绝越权路径(server/ 不在MCP根) ✅ | 工具链真实生成docx(8643B) ✅ | 模型意图局限(把"查看目录"误解为"生成文档") — 诚实记录模型能力边界
- **token 真实测量 (stats.tokens 记账)**: 普通75/技能123(-49% vs 校准后243)/文档151(-26%) — 对比"未校准前"更低(技能全文+思考注入+无安全阀已移除)
- **复盘机制落地 (用户指导: 复盘对+复盘错)**:
  - `LessonLearner.recordSuccess`: 用户正向反馈("对了/做得好/成功了") → 成功经验教训(tags success,positive, userId隔离) — 与 recordFeedback 构成"对+错"双轨
  - `_inferLessonText` success → "成功方法:"; `_extractLesson` tags 合并显式+推断
  - chatService processMessage 接线 recordSuccess (与 recordFeedback 对称)
- **验证**: 全量 276/13,055/0 + ESLint 0/0 + 真实PoC (recordSuccess→生效→清理)
- 相关文件: `tools/guardrail-fix.js`(gitignored本地), `src/core/{BrainSystem,LessonLearner,LessonLibrary,EvolutionPersistence}.js`, `server/services/chatService.js`, `tests/unit/{lesson-learner,skill-marketplace,chat-service}.test.js`

---



Session 锚点: 2026-09-18 (第113次 — 确定性任务优先架构: 不依赖模型的可靠执行)
- ESLint: 0/0 | Tests: **278 passed suites / 4 skipped / 0 failed** (13,072 passed / 46 skipped, +17) 全量通过
- **背景 (用户洞察: "换更强模型只是概率改善，不排除同类型情况")**: qwen 7B 对开放安全/审计任务遵循弱
  ("检查密钥泄漏"→"你遇到什么问题")，命令式注入(B+C)也无效 → **根本解: 系统知道怎么做的系统直接做，
  模型只处理系统不知道的**（不依赖模型理解 = 确定性可靠）
- **架构**: `generateResponse` 确定性优先链 `_ruleBasedSecurityScan || _ruleBasedCodeQuality`
  → 命中则 `_executeToolCalls` 直接执行 → `source:'deterministic'`（不经模型）；未命中才走模型
- **脚印1 SecurityScanExecutor** (确定性扫描): src/server 扫硬编码密钥/命令注入(exec+模板变量)/
  宽松CORS/shell:true；eval 诚实放弃(正则无法区分真调用 vs 字符串/注释，由 eslint no-eval 负责)；
  _ruleBasedSecurityScan 防误触发(排除"什么是/做了吗/怎么防止")
- **脚印2 CodeQualityExecutor** (确定性 eslint): cmd /c 跑项目 eslint --format json，报错误/警告统计
  (Windows .cmd 需 cmd /c + maxBuffer 20MB)；_ruleBasedCodeQuality 排除"怎么样/之前"评价询问
- **沉淀验证 (每步真实分流)**: 执行请求→deterministic | "代码质量怎么样/做了吗"→ollama | 闲聊→ollama |
  项目真实扫描 319 文件 0 发现(lint 0 硬编码0 CORS白名单 无shell:true)
- **诚实边界**: 复合请求("检查安全和质量")只匹配单个确定性任务(单任务模型，多任务链留待后续)；
  文档生成保持模型路径+fallback(内容生成类需模型，确定性只能搭框架——检查/执行类才确定性优先)
- **验证**: 全量 278/13,072/0 + ESLint 0/0 + 真实HTTP分流测试
- 相关文件: `src/skills/executors/{SecurityScan,CodeQuality}Executor.js` (新), `server/services/chatService.js`,
  `tests/unit/{security-scan-executor,code-quality-executor}.test.js` (新), `tests/unit/chat-service.test.js`

---

Session 锚点: 2026-10-16 (第114次 — 真实验证暴露断裂 + 根治 cwd 根因 + 工具化应用闭环)
- Tests: **280 passed suites / 4 skipped / 0 failed** (13,082 passed / 46 skipped) 全量通过 | 教训库 57 条
- **背景 (用户"验证三点机制是否真完成")**: 声称"三点都完成"→ 真实验证暴露「留后手」链断裂——
  keepalive 空转 30h（任务计划 Start In=N/A → cwd=System32 → 误判 monitor 挂 + 日志污染 System32\logs）
- **根治 cwd 依赖根因 (4 出口全收口)**: ① scripts(keepalive/monitor/backup) process.cwd→__dirname
  ② server 核心(index/chatService/routes) → PROJECT_ROOT ③ dotenv 隐式 cwd 依赖(显式 path 定位 .env)
  ④ 测试隔离 chdir→env 覆盖(CHAT_CONVERSATIONS_FILE/UPLOADS_ROOT)。真实验证: 从 System32 启动 server
  → health 200 + 数据正确落 D:\龙虾 + 零污染
- **验证 AGENTS.md 全部机制**: 6 项真实工作(保活链/定时子任务/backup/health-check 56项/学习闭环/手眼工具)
  → 发现 brain-bridge「自动桥接」名义存在(autoBridge/daemon 配置有、实现无——daemon 文件缺失、无 hook、
  断路器 OPEN)。**诚实标注未自动接入**(改 0.1/0.3/0.5/2 节)
- **改进 REA 死代码检测 (2 bug)**: ① 导出类方法误报(记录类→方法归属 classMethods，排除导出类方法+constructor)
  ② 目录分析同名函数覆盖(4 个 process，callGraph key 加 file 前缀)。效果: BrainBridge 8→0 误报,
  src/core 138→85 候选, 调用图枢纽准确
- **工具化 (把"靠 recall"变"决策时可见")**: 暴露 3 个一等工具 reverse/browser_eye/lessons(plugin tool helper,
  description 注入工具列表)。reverse 热加载实测可用; browser_eye 需重启生效(实证"文档说 config 不热加载"≠
  plugin 实际会热加载——reverse 就是热加载进列表的，别拿文档结论当事实)
- **打通教训库应用环节**: 此前只"记录"不"检索"(靠 AGENTS.md 不查全量库，57 条里 25 条躺库)。
  lessons 工具(query→bigram 检索，用 context.directory 读 lessons.json 绕开 LessonLibrary 的 cwd 依赖)，
  动作清单加「任务前检索教训」。验证: 检索「验证」命中 8 条含本会话新记的
- **沉淀教训 (+3)**: 验证工具要跑到真实输出(非 --help)、改进要跨场景对比(矛盾=更深问题信号)、
  先规划再执行要活成默认(非提醒后响应)。动作清单 +2 条(验证跨场景对比/任务前检索教训)
- **诚实边界**: 3 个工具都是"半自动"(提升可见性、非 100% 强制，需我匹配场景主动调用)；
  src/core 下另一批 cwd 依赖(LessonLibrary/SmartMemory/BrainBridge 等)未收口(本次聚焦不扩大)
-   相关文件: `scripts/{keepalive,monitor-server,backup-core}.js`, `server/{index,routes/index}.js`,
  `server/services/chatService.js`, `scripts/reverse.js`, `.opencode/plugins/{reverse-tool,browser-eye-tool,lessons-tool}.js` (新),
  `tests/unit/{chat-service,file-download-routes}.test.js`, `AGENTS.md`

---

Session 锚点: 2026-10-16 (第115次 — token 用量持久化: 让数据真正可积累)
- Tests: **280 passed suites / 4 skipped / 0 failed** (13,082 passed / 46 skipped) 全量通过 | 教训库 57 条
- **背景 (用户想复盘 token 优化却发现没有数据)**: `stats.tokens` 仅内存，每次 server 重启清零 →
  "更多数据"从未真正累积（重启即归零）
- **实现 (提交 f17db96)**: 每次请求追加 `logs/token-usage.jsonl`（ts/prompt/completion/total/utilization，
  上限 5 万行滚动截断）；启动时 `_loadTokenStats` 从 JSONL 恢复累积统计（重启不丢）
- **真实复测 (re-measure round-110 优化)**: 普通对话 **74 tokens (0.6% of num_ctx 8192)**、
  技能对话 **114 (1.0%)** —— 较 round-110 基线 243 **降 65%**（thinkText 移除 + 技能 essence 去重生效）
- **结论**: num_ctx 8192 余量巨大，数据可积累后（供未来分析）暂无需进一步优化
- **诚实边界**: 新增代码无单测，仅真实复测；本锚点写入时补跑全量 280/13,082/0 确认无回归
- 相关文件: `server/services/chatService.js`

---

Session 锚点: 2026-10-16 (第116次 — 补天 SRC 低危起步: 工具+清单+提交格式+防误报)
- Tests: **280 passed suites / 4 skipped / 0 failed** (13,082 passed / 46 skipped) | 安全: 0 HIGH
- **背景 (用户注册补天，想从小处开始)**: 分工——**AI 提供方法/工具（脑），人做授权测试/提交（手，法律边界）**
- **leak-check.js (提交 621a675)**: 温和 GET-only 信息泄露检测（`.git` / 备份文件 / 敏感文件 / 目录遍历），
  限速 + soft-404 感知 + 法律护栏；`docs/butian-low-risk-checklist.md` 三类低危（信息泄露/弱口令/配置错误）
- **提交表单格式 (提交 790fd3d)**: 从**补天真实提交页 HTML** 提取全字段（厂商/类型/权重/标题规则等）
  + 详细细节**四个必填要求**（关键：两张截图 —— 复现过程 + **厂商归属证明**，缺一易驳回）
- **提交页规则 (提交 2003238)**: 截图必须**本地上传**（禁复制粘贴）、新用户**限 5 个待审**、需**实名认证**
- **soft-404 修复 (提交 3bd208b, 真实教训)**: `meiyouwx.com` 对不存在路径**静默回退首页** →
  `index.php.bak` 返回 200 + 81KB 疑似泄露（实为首页）→ `isSoft404` 增加"与缓存首页内容比对"（原仅查 404 字样）
- **AI 报告核验机制 (提交 1bfbbf6)**: 补天规则——未经人工核验的 AI 报告**扣信誉值（累积 ≤60 封号）**；
  差点把 meiyouwx 的 soft-404 误报为真泄露 → 加提交前**人工核验清单** + 动作清单加
  「**AI 报告标注验证状态**（AI 推断 vs 用户实测）」+ 记纠错教训
- **验证**: 文档 + 独立脚本，未加单测；本锚点写入时全量 280/13,082/0 无回归
- 相关文件: `scripts/leak-check.js` (新), `docs/butian-low-risk-checklist.md` (新), `AGENTS.md`

---

Session 锚点: 2026-10-16 (第117次 — AGENTS.md 收纳整理 + 教训检索相关性排序)
- Tests: **280 passed suites / 4 skipped / 0 failed** (13,082 passed / 46 skipped) | ESLint 0/0
- **背景 (AGENTS.md 被 35 个历史锚点 + 运维记录撑到 1000+ 行)**: 核心告诫/协议/动作清单被淹没
- **归档 (提交 c827c4a)**: 35 个锚点 + 运维记录（~570 行）→ `docs/session-anchors.md`（573 行），
  AGENTS.md 精简到 ~513 行；补**核心工具清单**（scripts/ 有 50+ 脚本，日常该用只有 9 个 → 列入场景→工具映射）
- **收纳规则 (提交 a72d389, 用户"不只现在理，以后有更多也要归纳好")**: 每新增一样东西**当场归类**——
  工具（核心/一次性）、教训（`category` 用统一体系 security/method/verification/thinking/tool/ops，
  `type` 单独标 mistake/success）、机制（当前/历史）、锚点（写归档不进 AGENTS.md）
- **教训检索相关性排序 (提交 40fa8b9)**: `LessonLibrary.search` 此前**只过滤不排序** → 泛词检索最相关被挤后
  （"漏洞报告"把"AI 报告须核验"排第 4）→ 按**命中 token 数评分**，隔离组内降序（隐私隔离仍优先）
- **归档完整性自查 (提交 b4594b9)**: 第一遍归档**漏了 section 8 之后的 2 个锚点（113/114）**，
  复查才抓出 → 印证"验证不靠感觉"（这正是下次扩大验证规则的实证）
- **验证规则扩大 (提交 b145a8c)**: 动作清单「修复后真实验证」→「**任何改动**（代码/工具/归档/分类/整理）」
  验证，逐项查「效果 + 是否破坏 + 是否误伤」
- **验证**: 全量 280/13,082/0（确认两处代码改动无回归）+ 归档完整性复查（补 2 漏锚点）
- **诚实边界**: 教训检索排序改动未加单测
- 相关文件: `AGENTS.md`, `docs/session-anchors.md`, `src/core/LessonLibrary.js`

---

Session 锚点: 2026-10-16 (第118次 — token 节流: 量化工具 + 短会话纪律)
- Tests: **280 passed suites / 4 skipped / 0 failed** (13,082 passed / 46 skipped) 全量通过
- **背景 (token 入不敷出)**: deepseek v4 pro 约 150元/4天（≈1125元/月）；上轮结论「先节流（省钱）活下来，
  再开源（变现）」；用户已换 **deepseek-v4.1-flash** + 新建会话（节流第一步）
- **恢复上下文（新会话读不到上轮对话）**: 从 opencode 会话库（`D:\opencode-data\opencode\opencode.db`）
  用 `node:sqlite` 只读恢复上轮「节流」讨论（会话 ses_ec063b276ffe「上次進度回顧」）——找到方案原文
- **量出真实账（关键发现）**: 最贵两会话 = pro 马拉松 28.29（输入 68.9M）、flash 马拉松 10.84（输入 10.9M）；
  而**短的 pro 会话仅 0.82** → **成本主因是「会话长度」，不是「模型」**（长会话每轮重发全部上下文，
  输入 token 滚到千万级）
- **构建 `scripts/cost-report.js`（提交 b9defb0）**: 读 opencode 库出报表（今日 / 近N天 / 按模型 / Top会话）；
  选项 `--days` `--dir` `--json` `--log`；只读不写库；库路径可用 `OPENCODE_DB` 覆盖；
  静音 node:sqlite 实验警告；缺库/占用/查询失败均友好报错
- **固化机制**: AGENTS.md 动作清单加「**会话节流**」（一个会话做一件事，做完新开）；核心工具清单加 `cost-report`
- **自动化**: `monitor-server.js` 加每日成本快照块（对称于每日备份：spawn `cost-report.js --log`）→
  成本自动落 `logs/cost-report.jsonl`（节流可回看，不凭感觉）
- **会话边界机制（提交 6799d22）**: AGENTS.md 加「会话边界（提醒 + 交接）」——该切新会话的触发
  （任务完成/用量高/换任务）+ 我主动提醒 + 交接靠锚点（新会话读 `docs/session-anchors.md` 末条，
  **不用"恢复旧会话"**——那会重载全部上下文，反更贵）
- **状态**: 节流设施完成；下一步 = 开源（等"愿意付费的真实需求"信号）+ SRC 可跑（待授权目标）
- **验证**: 真实运行（今日 10.91 / 合计 43.41 / Top 会话正确）+ 边界（db 缺失、`--dir`、`--json`、`--log` 均通）
  + 全量测试 280/13,082/0 无回归
- **诚实边界**: cost 单位为 opencode 记录值（随网关，可能美元/积分）；按会话最后活动日归日（近似）；
  **开源（变现）未动**——瓶颈是「找到愿意付费的真实需求」，需真实探索 + 用户的经济身份，非我独自可完成

---

Session 锚点: 2026-10-16 (第119次 — 开源第一步: 数据报表接单包)
- Tests: **280 passed suites / 4 skipped / 0 failed** (13,082 passed / 46 skipped) 全量通过 | ESLint 0/0 (含 --no-ignore 新脚本)
- **背景 (接上轮「先节流再开源」)**: 节流已完成(切 flash + 短会话); 用户选路径 A(数据报表/Excel 自动化接单),
  分工 = **人做我替代不了的部分(上架/沟通/收款/过验证), 其余全归我**
- **真实市场证据 (websearch 多来源交叉, 非推断)**: 闲鱼挂「Excel 数据处理」15 天赚 2180(投入 0);
  月包破万案例; 均价 460/单、每单实际 30 分钟; 共识 = **AI 只是放大器, 获客与沟通必须真人**
- **交付引擎 `scripts/data-report.js`**: 4 动作 clean/merge/summary/report —— 读 xlsx/csv(可多文件合并) →
  清洗(日期多格式统一/金额去符号千分位转数字/去空格/去重/删空行) → 分组汇总(自动降序) → 格式化输出
  (表头色/冻结/列宽/千分位); 只读输入另存输出(不动客户原文件)
- **接单包 `service/data-report/`**: README(分工+引擎用法+依据) / 上架与报价(闲鱼文案+价格阶梯+渠道) /
  接单SOP(6步流程+话术+避坑) / samples(脏数据 xlsx + 引擎产出的成品报表 + CSV)
- **真实样例 + 跨场景验证全过 (非 mock)**: 单表清洗 / xlsx+csv 混合合并 / 分组汇总数值正确 /
  一条龙 report / 边界(缺参/文件不存在/格式不支持/缺分组)清晰报错
- **发现即修复 (5.3)**: clean 中未带货币符的纯数字文本("792"/"1798")未转数字 → 与 "¥1,188"→1188 类型不一致
  → 修 isPureNumber(纯数字转数字) + 前导零保留为编号(00123 不误转 123); 重跑验证一致
- **诚实边界**: CSV 仅吃 UTF-8(GBK 需先转码); 只取每文件首个工作表; 无公式/透视表(留待真实订单驱动);
  **变现临门一脚仍是真人**(我无账号不能登录/收款)——本包交付的是「我全权能做的部分」
- 相关文件: `scripts/data-report.js` (新), `service/data-report/{README,上架与报价,接单SOP}.md` (新),
  `service/data-report/samples/*` (新)

---

Session 锚点: 2026-10-16 (第120次 — 开源落地: 数据报表接单包 + 闲鱼半自动发布链路打通)
- Tests: **280 passed suites / 4 skipped / 0 failed** (13,082 passed / 46 skipped) 全量通过 | ESLint 0/0 (含新脚本 --no-ignore)
- **背景 (接上轮「开源」)**: 用户选路径 A(数据报表/Excel 自动化接单); 市场证据(多来源): 闲鱼 15 天 2180、
  均价 460/单 30 分钟、月包破万; 共识 = AI 是放大器, 获客沟通须真人。分工 = 人做我替代不了的, 其余归我
- **交付 1 接单包 (811a93e)**: `scripts/data-report.js`(clean/merge/summary/report 交付引擎) +
  `service/data-report/`(README 分工+用法 / 上架与报价 / 接单SOP / samples 脏数据→成品报表)
- **交付 2 闲鱼 PoC (5caeb94)**: `scripts/xianyu-poc.js` —— 实测**无头被风控拦('非法访问')、有头能过**;
  扫码登录后发闲置表单可访问; 登录态 profile 持久化(不必每次扫码)
- **交付 3 填草稿 (729a1c8/64a2a06)**: `scripts/xianyu-fill-draft.js` —— 描述(富文本 contenteditable)+
  价格+图片(setInputFiles)+发货(radio 无需邮寄) 自动填入, **读回验证**; 地址用账号默认; 不点发布
- **交付 4 首图生成 (d72c1ec)**: `scripts/xianyu-cover.js` —— HTML(原始vs成品对比) → 1080x1080 PNG
- **🔴 重大发现**: 闲鱼**服务类目(简历修改优化)网页版不支持发布**, 提示用 App 扫码桥接;
  但**链路打通 (da82103)**: **网页自动填表(我) + 点发布弹码 + App 扫码发布(人) = 半自动可用** →
  **第一条真实闲置(数据报表代做·50元)发布成功**
- **可复用教训/发现**: ① 反爬检测主因是 **headless 特征**, 有头(正常 UA)可过 ② 登录检测**不能靠 URL 重定向**
  (/publish 未登录不跳转, 内联"立即登录") ③ 闲鱼服务类目 web-only 限制 → 半自动(填+扫码发)是正解
- **诚实边界**: **全自动不做**(封号是致命成本, 半自动已拿 90% 效率); 扫码+发布必须人在场;
  profile(含 Cookie)存 `data/xianyu-profile/` 已 gitignore; 脚本不碰账号密码
- 相关文件: `scripts/{xianyu-poc,xianyu-fill-draft,xianyu-cover}.js` (新), `service/data-report/闲鱼PoC结果.md` (新),
  `.gitignore`
- 相关文件: `scripts/cost-report.js` (新), `scripts/monitor-server.js`, `AGENTS.md`, `docs/session-anchors.md`

---

Session 锚点: 2026-10-17 (第121次 — 开源第二步: 曝光提升·多Listing铺货包)
- Tests: **280 passed suites / 4 skipped / 0 failed** (13,082 passed / 46 skipped) 全量通过 | ESLint 0/0 (含新脚本 --no-ignore)
- **背景 (接上轮「首条闲置已上线」)**: 用户让我决策下一步 → 分析漏斗(上架→曝光→咨询→沟通→报价→接单→交付→收款)，
  **一条 0 好评闲置在闲鱼算法里几乎不可见** → 当前第一瓶颈 = **曝光/获客**，选「曝光提升包」
- **判断依据 (为何不做擦亮优先)**: 擦亮是每日一次点击(边际收益小)；**多 listing = 搜索覆盖**，是新号唯一能主动放大的杠杆
- **交付 1 多listing铺货包 (`service/data-report/多Listing铺货.md`)**: 3 条**角度不同**的 listing
  （A 通用代做·已发布 / B 数据清洗·30起 / C 报表自动化·200起），各带首行关键词(≈标题)、描述文案文件、价格、首图；
  附**铺货节奏**（每 1-2 天 1 条，防「重复铺货/营销号」判定=封号致命成本）+ 发布命令 + 留痕表
- **交付 2 首图生成器 (`scripts/xianyu-covers.js`)**: 复用 HTML→PNG 模式，批量生成 B/C 两张不同卖点首图
  (B 清洗细节对比 / C「一次配置就够了」流程)，**真实渲染 + Read 看图验证**（C 首版标题换行把「了」挤单行 → 改两行排布重生成）
- **交付 3 填草稿支持传描述 (改 `scripts/xianyu-fill-draft.js`)**: 加 `--desc` / `--desc-file`（原来描述写死，
  铺不同 listing 需可传；缺文件友好报错），保持默认文案向后兼容
- **验证**: 首图脚本真实渲染两张（内容高/页脚底诊断 + 我看图确认）；脚本 `node --check` + `--desc-file` 缺文件报错路径实测；
  ESLint 0/0；**全量 280/13,082/0 无回归**
- **诚实边界**: ① 每条 listing 需**人 App 扫码发布**（服务类目网页不支持发布，上轮已实测），铺 N 条 = N 次扫码；
  ② 改了 xianyu-fill-draft.js 但**未跑真实登录链路**（需活跃登录态，本次未做）——仅语法/参数/报错路径验证；
  ③ **擦亮助手未做**（需活跃登录态 + 真实 DOM 探索，留待下轮，避免产出未验证脚本违反 4.3）
- **执行 (2026-10-17 用户授权「全权负责，扫码才联系」)**: 实测发布 B/C 两条——
  给 `xianyu-fill-draft.js` 加 `--publish`（填好后自动点[发布]）+ 自动展开「点击展示二维码」；
  用**后台分离进程**运行（避免阻塞会话）+ **轮询日志标记**（`>>> FILLED/WAIT_SCAN <<<`）；
  用户在窗口扫码→App 发布 → **B(30元) / C(200元) 均真实发布成功**（用户确认）
- **真实链路验证**: `--probe` 确认登录态有效；B/C 两条真实填入→读回(首图/描述/价格/发货)→点发布→服务类目扫码桥接→人扫码发布；
  全程**真实闲鱼页面，非 mock**；改脚本后全量 280/13,082/0 无回归
- 相关文件: `service/data-report/多Listing铺货.md` (新), `service/data-report/listings/*` (新),
   `scripts/xianyu-covers.js` (新), `scripts/xianyu-fill-draft.js` (改, 加 --publish/--desc-file/展码), `service/data-report/cover/首图{B,C}-*.png` (新)

---

Session 锚点: 2026-10-17 (第122次 — 开源·擦亮助手: 网页无入口 → 打通 mtop 擦亮接口)
- Tests: **280 passed suites / 4 skipped / 0 failed** (13,082 passed / 46 skipped) 全量通过 | ESLint 0/0 (新脚本 --no-ignore)
- **背景 (接上轮「多listing铺货」)**: 用户要「闲鱼每日擦亮半自动」——沿用 `scripts/xianyu-*.js` 模式 + 复用 `data/xianyu-profile` 登录态（人在场扫码）
- **真机探索结论 (非推断, 复用登录态实跑)**: 闲鱼**网页版无「擦亮」**——`/personal` 只列宝贝、无任何管理/擦亮入口；`seller.goofish.com` = 禁止访问；`m.goofish.com` 连不上；`h5.m.goofish.com` 根路径 404；擦亮 UI 仅存在 App（我的→我发布的→一键擦亮宝贝）
- **换思路 (网页缺功能→调底层接口)**: 擦亮底层是 mtop 接口 `mtop.taobao.idle.item.polish`（App 也用它）。脚本在 goofish 页面内 `fetch` → `h5api.m.goofish.com`（**同源带 cookie** + `sign=md5(token&t&appKey&data)`，`_m_h5_tk.split('_')[0]`），复用 profile 半自动擦亮
- **交付 `scripts/xianyu-polish.js`**: `--probe`(只读: 登录检测+拉我的宝贝) / `--dry`(预演) / 默认(逐个擦亮, 间隔2.5s)；令牌过期用 Set-Cookie 自动重试一次；ret 分类 ok/already/delisted/risk/session/fail；结果落 `logs/xianyu-polish.jsonl`；有头浏览器（无头被风控拦）
- **真实验证 (真实闲鱼页面, 非 mock)**: `mtop.idle.web.xyh.item.list` SUCCESS → 解析 3 个宝贝(含 itemId/标题/标签)；`mtop.taobao.idle.item.polish` **3/3 返回 `SUCCESS::调用成功`**
- **🔴 诚实边界 (效果未验证, 不声称完成)**: 连调两次均返回 SUCCESS（**无 `IDLEITEM_POLISH_AGAIN` 重复拒绝**），但**网页侧状态/标签无任何变化**（"24小时内发布" 标签不变、详情无擦亮时间字段）→ 与上游 `zhinianboke/xianyu-auto-reply` **issue #328（返回成功但 App 未联动）完全一致** → 擦亮**是否真的提升曝光须在 App「我发布的」核验**，不以 ret=SUCCESS 声称生效
- **发现即修复 (5.3)**: 探索时另建 `data/xianyu-profile-m`（含登录 Cookie），`.gitignore` 仅忽略 `data/xianyu-profile/` → 该兄弟目录显示 untracked、**险些提交 Cookie** → 删除 + `.gitignore` 改 `data/xianyu-profile*/` + `data/*-profile*/`（按模式而非固定名）
- **教训库 +3**: ① success/tool「网页缺入口→调其底层 mtop 接口绕过 UI」② mistake/verification「ret=SUCCESS ≠ 效果生效，UI 缺入口的功能须可观测或人核验」③ mistake/ops「新建浏览器 profile 目录必须被 gitignore 覆盖」
- **用户补充 (测试作废)**: 用户发布时已顺手手动擦过 → 今天"3/3 SUCCESS 且无重复拒绝"说明不了问题（状态本就已擦亮）→ **用户决定从次日起不再手动擦亮，擦亮全权交我** → 真正验证 = 次日对未擦亮宝贝首擦应 SUCCESS、当天再擦应返回 `IDLEITEM_POLISH_AGAIN`（自证生效，不必依赖 App）
- **每日机制 (全权负责→机制化)**: `xianyu-polish.js` 加 `--auto`（非交互：登录失效即跳过/不等待/不留窗口）；`monitor-server.js` 加**每日擦亮块**（一次/自然日、9 点后触发、标记文件 `logs/xianyu-polish.lastrun` 防重启重复触发，避免多次调用增风控面）；已重启 monitor 使新代码生效（心跳正常，当日未触发——未到 9 点）
- **附带发现 (待办)**: 重启前发现**两个 monitor-server 进程**（重复）——keepalive 靠心跳(2min)判活，重复源自"心跳停但进程僵留"；安全根治需 pidfile 化（改保活脚本有风险，本次未动，留后续）
- **观测先行 (用户同意, 只读)**: 因重复仅**观测到一次**（未证实复发），先"修可观测再谈根治"——新增 `scripts/monitor-observe.js`（只读：数 monitor 实例数 + 心跳年龄 → 追加 `logs/monitor-instances.jsonl`），由 `monitor-server` 每 5 min 调用（不建新计划任务、不改 keepalive）；已重启 monitor 生效（观测到 count=1, pid 26304）；跑几天确认是否复发再决定是否根治
- **对"根治"的定性 (复盘)**: 本质 = 存活信号不权威（心跳 mtime 混淆"进程活/循环健康"）+ 恢复动作不幂等（盲 spawn、无互斥、无对账）→ 只能"至少一个"不能"恰好一个"；pidfile 只是机制之一（有 stale/PID 复用/原子写/进程枚举坑），真根治 = 权威单例 + 对账，且须先让决策逻辑可测
- **验证**: 真实链路（登录→item.list→polish）+ 脚本 `node --check` + ESLint 0/0(--no-ignore) + 安全扫描 0 HIGH + **全量 280/13,082/0 无回归**
- 相关文件: `scripts/xianyu-polish.js` (新, 后加 --auto), `scripts/monitor-server.js` (加每日擦亮块 + 每5min观测), `scripts/monitor-observe.js` (新), `.gitignore`, `AGENTS.md`（核心工具清单加 xianyu-polish；运维清单加 monitor-observe）
