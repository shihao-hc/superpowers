# Skills 细致分类手册

**总计: 296 个 (295个第三方 Skills + 1个自有模块)**

> Skills存储: `D:/龙虾/.opencode/skills`

---

## 零、拾号-爬虫系统 (自有模块)

> 拾号项目自有的爬虫工具系统，优先级最高

| Skill | 说明 | 支持平台 |
|-------|------|----------|
| **dynamic-scraper** | 拾号-爬虫系统 - 多平台动态网页爬取 | 抖音/B站/小红书/微博/Youtube/Twitter |

---

## 一、核心AI能力 (约75个)

### 1. AI Agent框架 (32个)
构建和管理AI Agent的核心框架

| Skill | 说明 |
|-------|------|
| autogen-framework | Microsoft AutoGen - 多Agent对话框架 |
| autogpt | AutoGPT - 自主执行Agent |
| crewai | CrewAI - 多Agent协作框架 |
| crewai-multiagent | CrewAI 多Agent |
| langchain | LangChain - LLM应用开发框架 (128K stars) |
| langgraph-multiagent | LangGraph 多Agent |
| llamaindex | LlamaIndex - RAG数据框架 (47K stars) |
| metagpt | MetaGPT - 多Agent软件开发 |
| dify-platform | Dify - 开源LLM应用平台 (130K stars) |
| openclaw | OpenClaw - 本地优先Agent框架 (335K stars) |
| semantic-kernel | Microsoft 企业级AI SDK |
| swarms-framework | Swarms - 企业级多Agent编排 |
| evoagentx-framework | EvoAgentX - 自进化Agent框架 |
| opensage-framework | OpenSage - AI自编程框架 |
|dee rflow-superagent | DeerFlow - 沙箱执行超级Agent |
| agency-agents-personas | 144+专业Agent人格模板 |
| ai-capability-layering | AI能力分层架构 (L1-L4) |
| ai-model-integration | 多模型集成与fallback |
| model-routing | 智能模型路由与成本优化 |
| llm-client-patterns | LLM客户端模式 |
| llm-cost-manager | LLM成本管理 |
| multi-agent-orchestration | 多Agent编排 |
| multi-agent-patterns | 多Agent模式 |
| multi-agent-templates | 多Agent模板 |
| multi-orchestrate | DAG任务编排 |
| agent-loop-patterns | Agent循环执行模式 |
| agent-tool-conversion | 多工具转换 |
| dispatching-parallel-agents | 并行Agent分发 |
| subagent-driven-development | 子Agent驱动开发 |
| device-registration | 设备注册与能力配置 |

### 2. Agent协作与编排 (12个)
Agent之间的协作模式

| Skill | 说明 |
|-------|------|
| multi-agent-orchestration | 多Agent编排 - 团队协作/P2P通信 |
| multi-orchestrate | DAG任务分解与执行 |
| paperclip-orchestration | Paperclip公司编排 - 零人类/分层组织 |
| three-provinces-six-ministries | 三省六部Agent编排 - 唐朝官制 |
| bettafish-patterns | BettaFish论坛协作 - 反思环/报告IR |
| dag-orchestration | DAG动态图编排 |
| task-management | Agent任务管理 |
| kanban-dashboard | 看板任务监控 |
| aip-protocol | WebSocket持久通信协议 |
| permission-matrix | Agent权限控制矩阵 |
| permission-system | 三模式权限系统 |
| error-recovery | 错误恢复系统 |

---

## 二、LLM与模型集成 (约30个)

### 3. LLM集成 (12个)
大语言模型集成相关

| Skill | 说明 |
|-------|------|
| llm-benchmarking | LLM性能评测 |
| llm-budget-alerts | LLM预算告警 |
| llm-client-patterns | 重试/流式/fallback |
| llm-cost-manager | 每日预算/调用限制 |
| model-routing | 智能路由 |
| ollama-adapter | Ollama本地模型适配 |
| vllm-integration | vLLM高性能推理 |
| ai-model-integration | 多provider支持 |
| continuous-inference-system | 实时推理系统 |
| federated-learning | 联邦学习 |
| eval-framework | 模型评估框架 |
| dspy | DSPy - 声明式自改进框架 |

### 4. 语音与TTS (10个)
语音合成与交互

| Skill | 说明 |
|-------|------|
| tts-integration | TTS集成 |
| multi-tts-engine | 多TTS引擎 |
| voice-interaction | 语音交互 |
| voice-interaction-system | STT/TTS/VAD系统 |
| enhanced-voice-system | 情感感知TTS |
| webrtc-voice-streaming | WebRTC实时语音P2P |
| elevenlabs-lip-sync | ElevenLabs口型同步 |
| claude-code-voice | Claude Code语音模式 |
| frontend-voice-integration | 前端语音集成 |
| multimodal-vision | 多模态视觉/图像捕获 |

---

## 三、记忆与知识系统 (约20个)

### 5. 记忆系统 (9个)
长期记忆与知识存储

| Skill | 说明 |
|-------|------|
| memory-plus-evolution | Letta/Mem0 + GEP进化 |
| mem0-memory | Mem0个性化记忆层 |
| memdir-memory | 三层记忆系统 |
| long-term-memory | 长期记忆 |
| long-term-memory-system | IndexedDB会话存储 |
| graph-memory | 图关系记忆 |
| semantic-memory-system | ChromaDB向量存储 |
| letta-architecture | Letta(MemGPT)分层记忆 |
| claude-code-memdir | Claude Code记忆目录 |

### 6. RAG与搜索 (6个)
检索增强与知识获取

| Skill | 说明 |
|-------|------|
| tavily-search-rag | Tavily AI搜索RAG |
| deep-search-agent | 深度搜索Agent+反思环 |
| haystack | Haystack RAG管道 |
| search-act-used-glob-to-find-files-then-grep-to-filter-before-acting | 文件搜索模式 |
| database-patterns | SQLAlchemy 2.x ORM模式 |
| duckdb-wasm-local-db | DuckDB WASM浏览器数据库 |

---

## 四、MCP协议 (约15个)

### 7. MCP核心 (9个)
Model Context Protocol相关

| Skill | 说明 |
|-------|------|
| mcp-integration | 统一MCP集成 - 多服务器/工具注册 |
| mcp-server-builder | MCP服务器构建 |
| mcp-bridge | MCP协议桥接/适配器 |
| mcp-implementation-guide | MCP实现指南 |
| mcp-fullstack-implementation | 完整MCP实现 |
| mcp-advanced | 缓存/审计/告警/权限 |
| mcp-security | MCP安全加固 |
| mcp-security-hardening | 输入验证/路径安全/限流 |
| mcp-ui-integration-testing | MCP UI集成测试 |

### 8. MCP工具 (5个)
MCP相关工具

| Skill | 说明 |
|-------|------|
| claude-code-mcp | Claude Code MCP架构 |
| mcp-comparison-analysis | MCP对比分析 |
| mcp-server-builder | MCP服务器构建 |
| agent-browser | Browser MCP自动化 |
| browser-use | 浏览器自动化Agent |

---

## 五、浏览器与爬虫

### 9. 拾号-爬虫 (自有模块)

> 优先级最高，通用网页抓取首选

| 模块 | 说明 |
|------|------|
| **DynamicScraper** | 拾号爬虫系统 - 多平台动态网页，支持抖音/B站/小红书等 |

### 10. 第三方浏览器自动化 (10个)

| Skill | 说明 |
|-------|------|
| browser-automation | Playwright/指纹隔离/URL安全 |
| browser-use | 浏览器自动化Agent |
| playwright | Playwright测试 |
| lightpanda-browser | Lightpanda超轻量浏览器 |
| pydoll-patterns | Pydoll CDP无头浏览器 |

### 11. 第三方网页爬虫 (10个)

> 显式指定第三方工具时使用

| Skill | 说明 |
|-------|------|
| crawl4ai-patterns | Crawl4AI - LLM友好爬虫 |
| crawlee-patterns | Crawlee Python自动扩缩容 |
| scrapling | 自适应反爬爬虫 |
| easyspider-patterns | EasySpider可视化 |
| firecrawl-patterns | Firecrawl API |
| seleniumbase-patterns | SeleniumBase反检测 |

---

## 六、安全与审计 (约25个)

### 11. 安全防护 (18个)

| Skill | 说明 |
|-------|------|
| security-audit | 安全审计 - 密钥/权限/漏洞扫描 |
| security-audit-v2 | 漏洞扫描v2 |
| security-audit-v3 | 综合安全审查 |
| security-audit-learnings | 安全漏洞修复 |
| comprehensive-security-audit | 逐步安全审计方法 |
| security-hardening | 综合安全防护 |
| security-hardening-ultrawork | XSS防护/限流 |
| fastapi-security-patterns | FastAPI安全模式 |
| fastapi-security-hardening | FastAPI安全加固 |
| api-security-patterns | API安全模式 |
| frontend-security-patterns | 前端安全XSS防护 |
| mcp-security | MCP安全 |
| mcp-security-hardening | MCP安全加固 |
| cli-tool-security | CLI工具安全 |
| owasp-top10-compliance | OWASP Top10合规 |
| permission-system | 权限控制系统 |
| permission-matrix | Agent权限矩阵 |
| error-sanitization | 错误信息脱敏 |

### 12. 代码质量 (6个)

| Skill | 说明 |
|-------|------|
| code-review | 代码审查 |
| verify | 验证循环 - Build/Test/Lint |
| quality-assurance-patterns | QA模式 |
| receiving-code-review | 接收代码审查反馈 |
| requesting-code-review | 请求代码审查 |
| skillsystem-audit | Skill系统审计 |

---

## 七、Claude Code架构 (约45个)

### 13. Claude Code核心 (45个)

| Skill | 说明 |
|-------|------|
| claude-code-architecture | Claude Code源码架构分析 |
| claude-code-agent-loop | Agent循环架构 |
| claude-code-cli | CLI入口与I/O处理 |
| claude-code-commands | 85+斜杠命令系统 |
| claude-code-components | 组件设计系统 |
| claude-code-constants | 常量定义 |
| claude-code-context | 上下文提供者 |
| claude-code-coordinator | 协调模式 |
| claude-code-entrypoints | 应用入口点 |
| claude-code-features | 40+特性开关 |
| claude-code-hooks | Hooks系统 |
| claude-code-ink | Terminal UI |
| claude-code-keybindings | 键绑定系统 |
| claude-code-mcp | MCP协议架构 |
| claude-code-memdir | 记忆目录 |
| claude-code-messages | 消息处理系统 |
| claude-code-migrations | 设置迁移 |
| claude-code-native-ts | TypeScript Yoga布局 |
| claude-code-outputstyles | 动态输出样式 |
| claude-code-permission | 6种权限模式 |
| claude-code-plugins | 插件系统 |
| claude-code-remote | 远程会话管理 |
| claude-code-schemas | Hook schemas定义 |
| claude-code-screens | 终端屏幕 |
| claude-code-server | 服务器集成 |
| claude-code-services | 服务层架构 |
| claude-code-skills | Skills系统 |
| claude-code-state | React Context状态管理 |
| claude-code-tasks | 4种任务类型 |
| claude-code-tool-system | 工具系统架构 |
| claude-code-tools | 工具集 |
| claude-code-types | TypeScript类型定义 |
| claude-code-utils | 工具函数库 |
| claude-code-vim | Vim输入模式 |
| claude-code-voice | 语音模式 |
| claude-code-assistant | 会话历史管理 |
| claude-code-bootstrap | 全局状态管理 |
| claude-code-bridge | 远程控制桥接 |
| claude-code-buddy | 伙伴系统 |
| claude-code-compact | 上下文压缩系统 |
| claude-code-moreright | More Right特性 |

---

## 八、虚拟形象与VTuber (约15个)

### 14. VTuber系统 (9个)

| Skill | 说明 |
|-------|------|
| vrm-integration | VRM 3D模型集成 |
| vrm-animation-system | VRMA/BVH动作 |
| enhanced-avatar-system | 增强Avatar系统 |
| enhanced-avatar-engine-v2 | 高级VRM控制 |
| ai-virtual-character-engine | AI虚拟角色引擎 |
| ai-vtuber-best-practices | VTuber最佳实践 |
| gesture-recognition-system | 手势识别系统 |
| gesture-ml-classifier | 手势ML分类器 |
| emotion-animation-system | 情感动画系统 |

### 15. 动画与 Lip Sync (6个)

| Skill | 说明 |
|-------|------|
| emotion-animation | 情绪动画 |
| elevenlabs-lip-sync | ElevenLabs口型同步 |
| mixamo-animation-integration | Mixamo动画 |
| advanced-css-animations | 高级CSS动画 |
| css-animations | CSS动画模式 |
| frontend-progress-components | Vue3进度动画 |

---

## 九、前端开发 (约15个)

### 16. 前端框架 (12个)

| Skill | 说明 |
|-------|------|
| vue-frontend | Vue3 + Element Plus模式 |
| frontend-vue | Vue前端 |
| pinia-state-management | Pinia状态管理 |
| frontend-progress-components | 实时进度组件 |
| frontend-security-patterns | 前端安全 |
| frontend-voice-integration | 前端语音 |
| ui-ux-design | UI/UX设计 - 50+样式/161配色 |
| advanced-css-animations | 高级CSS动画 |
| css-animations | CSS动画 |
| component-lifecycle | 组件生命周期管理 |

---

## 十、部署与运维 (约25个)

### 17. 容器与部署 (10个)

| Skill | 说明 |
|-------|------|
| docker | Docker容器操作 |
| docker-deployment | Docker多阶段构建/非root |
| kubernetes-helm-charts | K8s Helm Charts |
| online-deployment | Vercel/Railway部署 |
| production-deployment | 生产部署 - JWT/Prometheus |
| cicd-pipeline | GitHub Actions CI/CD |
| cicd-pipeline-v2 | UltraWork CI/CD |
| github-actions-workflows | GitHub Actions工作流 |
| cicd-integration-testing | CI/CD集成测试 |
| trend-analysis-pipeline | 趋势分析管道 |

### 18. 监控与日志 (6个)

| Skill | 说明 |
|-------|------|
| monitoring-dashboard | Grafana仪表盘 |
| monitoring-ops | Prometheus监控 |
| prometheus-health-metrics | 健康指标 |
| analytics-telemetry | 分析遥测 |
| api-monitoring | API监控 |
| performance-monitor-dashboard | FPS/内存监控 |

### 19. 性能优化 (5个)

| Skill | 说明 |
|-------|------|
| performance-optimization | Redis缓存/PM2集群 |
| performance-optimization-v2 | k6性能自动扩缩容 |
| performance-tuning | 工作流并行/批量写入 |
| performance-testing-k6 | k6负载测试 |
| latency-optimizer | 延迟优化 |

### 20. 运维工具 (10个)

| Skill | 说明 |
|-------|------|
| task-scheduling | 任务调度 - 优先级/分布式 |
| computation-worker | 后台处理/任务队列 |
| workflow-engine | 工作流引擎 |
| workflow-optimizer | Q-Learning工作流优化 |
| n8n-workflow | n8n自动化 (174K stars) |
| node-processing-pipeline | 可复用节点系统 |
| lru-cache | LRU缓存 |
| resilient-websocket | WebSocket自动重连 |
| websocket-state-machine | WS状态机 |
| config-management | 配置管理 pydantic |

---

## 十一、测试 (约10个)

### 21. 单元与集成测试 (6个)

| Skill | 说明 |
|-------|------|
| test-driven-development | TDD测试驱动开发 |
| test-generation | Jest测试模板生成 |
| generate-unit-test-from-service | 从服务生成测试 |
| integration-testing-jest | Jest集成测试 |
| stress-testing | 压力测试 |
| e2e-testing-playwright | Playwright E2E测试 |

---

## 十二、开发流程 (约20个)

### 22. 开发方法论 (8个)

| Skill | 说明 |
|-------|------|
| brainstorming | 头脑风暴 - 创意工作前必用 |
| writing-plans | 编写规范/计划 |
| executing-plans | 执行实施计划 |
| finishing-a-development-branch | 完成开发分支 |
| test-driven-development | TDD |
| systematic-debugging | 系统调试方法 |
| skill-creation-methodology | Skill创建方法论 |
| verify | 验证循环 |

### 23. 代码改进 (4个)

| Skill | 说明 |
|-------|------|
| self-improving | 自我改进 - 从反馈学习 |
| self-code-improver | 自我代码改进系统 |
| error-recovery | 错误恢复 |
| receiving-code-review | 接收代码审查 |

### 24. Git与工作流 (5个)

| Skill | 说明 |
|-------|------|
| git-workflow | 标准Git工作流 |
| using-git-worktrees | Git worktree隔离开发 |
| state-machine | 严格任务状态转换 |
| component-lifecycle | 组件生命周期 |
| hooks | 钩子系统 |

---

## 十三、垂直领域 (约20个)

### 25. TradingAgents交易 (4个)

| Skill | 说明 |
|-------|------|
| tradingagents-cn | 股票分析多Agent |
| tradingagents-cn-cicd | CI/CD流水线 |
| tradingagents-cn-security | 安全加固 |
| demo-environment | Demo环境搭建 |

### 26. 小说与创作 (4个)

| Skill | 说明 |
|-------|------|
| novel-assistant | AI小说创作助手 |
| novel-plotter | 小说情节规划师 |
| truth-files-manager | 真相文件管理器 |
| writing-skills | 写作Skills |

### 27. 电商与营销 (3个)

| Skill | 说明 |
|-------|------|
| ecommerce-solutions | 价格监控/预测/调价 |
| china-platform-integration | 微信/小红书/B站/抖音集成 |
| product-review-adapter | 产品评测Adapter |

### 28. 其他垂直领域 (8个)

| Skill | 说明 |
|-------|------|
| api-market | API市场 - 服务注册/计费 |
| legal-domain-adapter | 法律领域适配 |
| domain-adaptation | 跨域框架迁移 |
| demo-environment | Demo环境 |
| platform-bridge | 跨平台集成 (Slack/Discord/微信) |
| social-platform-integration | 社交平台集成 |
| on-chain-identity | 链上身份/DID |
| game-engine-patterns | 游戏引擎架构 |

---

## 十四、工具与Utility (约20个)

### 29. 实用工具 (12个)

| Skill | 说明 |
|-------|------|
| wacli | 通用CLI命令执行 |
| vidbee_download | 视频下载 |
| vidbee_desktop_download | 桌面下载器 |
| summarize | 内容摘要 |
| commands-system | 斜杠命令系统 |
| tool-system | 工具系统架构 |
| document-generation | 文档生成 |
| digital-pet-generator | 数字宠物生成器 |
| buddy-pet-system | 伙伴宠物系统 |
| visualize-builder | 可视化流程构建 |
| plugin-development-guide | 插件开发指南 |

### 30. Claude Code工具 (8个)

| Skill | 说明 |
|-------|------|
| claude-code-tools | 工具集 |
| claude-code-tool-system | 工具系统 |
| claude-code-cli | CLI工具 |
| claude-code-services | 服务层 |
| claude-code-utils | 工具函数 |
| claude-code-types | 类型定义 |
| claude-code-schemas | Schema定义 |
| claude-code-constants | 常量定义 |

---

## 十五、其他 (约15个)

### 31. 特殊系统 (15个)

| Skill | 说明 |
|-------|------|
| hooks-system | Hooks系统 |
| hooks | 生命周期钩子 |
| context-management | 上下文管理 - 5层压缩 |
| feature-flags | 特性开关 |
| async-resource-lifecycle | 异步资源生命周期 |
| config-management | 配置管理 |
| computation-worker | 计算工作器 |
| intent-understanding | 意图理解 |
| sentiment-feedback-loop | 情感反馈 |
| personality-customization | 人格定制 |
| personality-customization-system | 人格系统 |
| feedback-system | 反馈系统 |
| ecosystem-building | 生态系统构建 |
| graph-memory | 图记忆 |
| voice-interaction-system | 语音交互系统 |

---

## 使用建议

1. **开发Agent应用** → 参考 "AI Agent框架" + "MCP协议"
2. **浏览器自动化** → "浏览器与爬虫" 分类
3. **安全审计** → "安全与审计" 分类
4. **部署上线** → "部署与运维" 分类
5. **VTuber开发** → "虚拟形象与VTuber" 分类
6. **代码质量** → "Claude Code架构" 分类

> 更多细节请查阅各 Skill 的 SKILL.md 文件
