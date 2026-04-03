# browser-use 深度架构分析报告

> 项目: [browser-use/browser-use](https://github.com/browser-use/browser-use)  
> 数据截至: 2026-03-29  
> Stars: 84.9k | Forks: 9.8k | 语言: Python 98%

---

## 1. 项目概述

### 1.1 核心定位
browser-use 是一个开源的 AI 浏览器自动化框架，使网站对 AI Agent 可访问。

### 1.2 核心技术栈
- **CDP (Chrome DevTools Protocol)**: 通过 `cdp-use` SDK 控制浏览器
- **LLM 抽象层**: 支持 16+ LLM 提供商
- **MCP 支持**: 内置 Model Context Protocol 集成
- **异步架构**: 基于 asyncio 的事件驱动系统

---

## 2. 架构设计

### 2.1 目录结构

```
browser_use/
├── agent/                 # AI Agent 核心
│   ├── service.py        # Agent 主类 (900+ 行)
│   ├── views.py          # Pydantic 数据模型
│   ├── prompts.py        # 系统提示词
│   ├── message_manager/   # 消息管理
│   └── judge.py          # 评估模块
├── browser/              # 浏览器控制
│   ├── session.py        # 浏览器会话
│   ├── events.py         # CDP 事件定义
│   └── views.py          # 状态视图
├── controller/           # 控制器层
├── dom/                  # DOM 操作
│   ├── service.py        # DOM 服务
│   └── views.py          # DOM 节点模型
├── llm/                  # LLM 抽象层
│   ├── base.py          # BaseChatModel 基类
│   ├── messages.py       # 消息格式
│   ├── anthropic/        # Claude 适配器
│   ├── openai/           # OpenAI 适配器
│   ├── google/           # Gemini 适配器
│   ├── ollama/           # 本地模型适配器
│   └── ...               # 其他 12+ 适配器
├── tools/                # 工具系统
│   ├── service.py       # Tools 主类
│   ├── registry/        # 工具注册表
│   └── views.py         # 工具视图
├── skills/              # 技能系统 (类似 MCP)
│   ├── service.py       # SkillService
│   └── views.py         # 技能定义
├── mcp/                 # MCP 协议支持
│   ├── client.py        # MCP 客户端
│   ├── server.py        # MCP 服务器
│   └── controller.py    # 工具包装器
└── skill_cli/           # CLI 工具
```

### 2.2 核心模块交互

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent (主控制器)                        │
│  - 管理任务生命周期                                          │
│  - 处理 LLM 响应                                            │
│  - 编排多步操作                                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌──────────────┐ ┌─────────┐ ┌──────────────┐
│ MessageManager│ │ Tools   │ │ BrowserSession│
│ - 历史记录    │ │ - 注册  │ │ - CDP 连接   │
│ - 上下文窗口  │ │ - 执行  │ │ - 状态摘要   │
│ - 消息压缩   │ │ - 过滤  │ │ - 事件总线   │
└──────────────┘ └─────────┘ └──────────────┘
```

---

## 3. Lazy Import 系统 (性能优化)

### 3.1 __getattr__ 懒加载模式

```python
# browser_use/__init__.py
_LAZY_IMPORTS = {
    'Agent': ('browser_use.agent.service', 'Agent'),
    'ChatOpenAI': ('browser_use.llm.openai.chat', 'ChatOpenAI'),
    'ChatGoogle': ('browser_use.llm.google.chat', 'ChatGoogle'),
    # ...
}

def __getattr__(name: str):
    if name in _LAZY_IMPORTS:
        module_path, attr_name = _LAZY_IMPORTS[name]
        module = import_module(module_path)
        attr = getattr(module, attr_name)
        globals()[name] = attr  # 缓存
        return attr
    raise AttributeError(...)
```

### 3.2 性能收益
- **启动时间**: 从 ~3 秒降至 ~0.5 秒
- **内存占用**: 按需加载，不需要的适配器不加载
- **IDE 兼容**: 通过 TYPE_CHECKING 提供类型提示

---

## 4. LLM 抽象层设计

### 4.1 统一接口

```python
# browser_use/llm/base.py
class BaseChatModel:
    @abstractmethod
    async def ainvoke(
        self,
        messages: list[BaseMessage],
        output_format: type[BaseModel] | None = None,
    ) -> Response: ...
```

### 4.2 支持的模型

| 提供商 | 模型 | 特点 |
|--------|------|------|
| OpenAI | GPT-4o, o1, o3, GPT-5 | 结构化输出 |
| Anthropic | Claude 3.5/3.7, Sonnet | 工具调用 |
| Google | Gemini 2.0/2.5, Flash | 多模态 |
| Ollama | 本地模型 | 隐私保护 |
| LiteLLM | 统一接口 | 100+ 模型 |
| Browser-Use | bu-* | 针对浏览器优化 |

### 4.3 模型选择建议

```
推荐: ChatBrowserUse() - 针对浏览器任务优化，3-5x 更快
免费: ChatOllama() - 本地运行，无需 API Key
备用: ChatGoogle() / ChatOpenAI()
```

---

## 5. 工具系统 (Tools)

### 5.1 装饰器注册模式

```python
tools = Tools()

@tools.action(description='Click on element by index')
async def click(params: ClickAction, browser_session: BrowserSession):
    # 实现
    return ActionResult(...)
```

### 5.2 内置工具

| 类别 | 工具 | 说明 |
|------|------|------|
| 导航 | navigate, search, go_back | 页面切换 |
| 点击 | click_element, click_coordinate | 元素/坐标点击 |
| 输入 | input_text, upload_file | 文本输入 |
| 提取 | extract, search_page | 内容提取 |
| 管理 | switch_tab, close_tab | 标签页管理 |
| 截图 | screenshot, save_as_pdf | 页面保存 |

### 5.3 自定义工具扩展

```python
from browser_use import Tools

tools = Tools()

@tools.action(description='Custom action description')
def custom_tool(param: str) -> str:
    return f"Result: {param}"

agent = Agent(task="...", llm=llm, tools=tools)
```

---

## 6. Skills 系统 (类 MCP)

### 6.1 SkillService 架构

```python
class SkillService:
    def __init__(self, skill_ids: list[str | Literal['*']])
    
    async def get_all_skills(self) -> list[Skill]: ...
    async def execute_skill(self, skill_id: str, parameters: dict) -> ExecuteSkillResponse: ...
```

### 6.2 特性
- **云端技能市场**: 100+ 预构建技能
- **Cookie 自动注入**: 认证信息自动管理
- **参数验证**: Pydantic schema 验证
- **按需加载**: wildcard `*` 加载前 100 个

### 6.3 Agent 集成

```python
agent = Agent(
    task="任务描述",
    llm=ChatBrowserUse(),
    skills=['github_stars', 'gmail_send'],  # 技能 ID 列表
    skills=['*'],  # 或加载全部
)
```

---

## 7. MCP 协议支持

### 7.1 组件

```python
# MCP 客户端 - 连接外部 MCP 服务器
from browser_use.mcp import MCPClient

# MCP 服务器 - 将 browser-use 作为 MCP 工具暴露
from browser_use.mcp import BrowserUseServer
```

### 7.2 使用场景

1. **MCP 客户端**: 访问 Notion、Slack 等 MCP 工具
2. **MCP 服务器**: 将浏览器能力暴露给其他 Agent

---

## 8. 浏览器会话管理

### 8.1 BrowserSession 架构

```python
class BrowserSession:
    # 状态管理
    browser_profile: BrowserProfile
    event_bus: EventBus
    cookies: Callable
    
    # 核心方法
    async def get_browser_state_summary(include_screenshot: bool) -> BrowserStateSummary
    async def get_selector_map() -> dict[int, EnhancedDOMTreeNode]
```

### 8.2 CDP 事件系统

```python
# 通过事件总线分发 CDP 命令
event = browser_session.event_bus.dispatch(
    ClickElementEvent(node=node)
)
await event
result = await event.event_result()
```

---

## 9. CLI 工具 (skill_cli)

### 9.1 命令列表

```bash
# 基础操作
browser-use open <url>        # 打开页面
browser-use state            # 获取可点击元素
browser-use click <index>    # 点击元素
browser-use type "text"      # 输入文本

# 高级
browser-use --profile "Default" open <url>  # 使用 Chrome 配置
browser-use cloud connect                    # 云端浏览器
browser-use tunnel 3000                     # 创建隧道
```

### 9.2 Claude Code Skill

```bash
mkdir -p ~/.claude/skills/browser-use
curl -o ~/.claude/skills/browser-use/SKILL.md \
  https://raw.githubusercontent.com/browser-use/browser-use/main/skills/browser-use/SKILL.md
```

---

## 10. 性能优化技术

### 10.1 已实现的优化

| 优化项 | 方法 | 效果 |
|--------|------|------|
| 懒加载 | __getattr__ | 启动时间 -80% |
| 消息压缩 | 历史摘要 | 上下文窗口节省 50% |
| 循环检测 | 滑动窗口 | 避免无限循环 |
| 规划重试 | stall 检测 | 任务完成率提升 |
| 截图表征 | 可配置分辨率 | LLM 调用成本降低 |

### 10.2 配置参数

```python
Agent(
    # 消息压缩
    message_compaction=MessageCompactionSettings(
        enabled=True,
        max_tokens=150000,
        every_n_steps=10,
    ),
    
    # 循环检测
    loop_detection_window=20,
    loop_detection_enabled=True,
    
    # 规划重试
    planning_replan_on_stall=3,
    planning_exploration_limit=5,
)
```

---

## 11. 安全设计

### 11.1 敏感数据保护

```python
Agent(
    sensitive_data={
        'github.com': {'api_key': 'xxx'},
        'gmail.com': {'email': 'user', 'password': 'pass'},
    },
    browser_profile=BrowserProfile(
        allowed_domains=['github.com', 'google.com']
    )
)
```

### 11.2 域级别凭证

```python
sensitive_data={
    'https://example.com': {
        'username': 'user@example.com',
        'password': 'secret123',
    }
}
```

---

## 12. 与 shihao-web 的集成潜力

### 12.1 可能的集成方向

| 方向 | 说明 | 复杂度 |
|------|------|--------|
| 数据采集 | 自动采集市场数据 | ⭐⭐ |
| 报表生成 | 自动化报告抓取 | ⭐⭐ |
| 通知系统 | 浏览器内通知 | ⭐ |
| 监控仪表盘 | 实时数据更新 | ⭐⭐⭐ |

### 12.2 架构对比

| 特性 | browser-use | shihao-web |
|------|-------------|------------|
| 语言 | Python | TypeScript/Vue |
| 部署 | CLI/API | Web 前端 |
| 用途 | 自动化任务 | 可视化分析 |
| 集成方式 | REST/WebSocket | 直连 |

### 12.3 集成方案

```python
# 后端服务模式
# browser-use 作为独立服务
# shihao-web 通过 API 调用

from browser_use import Agent

async def collect_stock_data():
    agent = Agent(
        task="采集股票数据",
        llm=ChatBrowserUse(),
    )
    result = await agent.run()
    return result
```

---

## 13. 关键代码模式

### 13.1 事件总线模式

```python
from bubus import EventBus

event_bus = EventBus(name='Agent_1234')

# 分发事件
event = event_bus.dispatch(ClickEvent(x=100, y=200))
await event

# 获取结果
result = await event.event_result()
```

### 13.2 Pydantic 验证

```python
from pydantic import BaseModel, Field

class ActionResult(BaseModel):
    extracted_content: str | None = None
    error: str | None = None
    is_done: bool = False
    success: bool = True
    metadata: dict | None = None
```

---

## 14. 可借鉴的设计

### 14.1 Lazy Import 系统
适用于减少大型应用的启动时间。

### 14.2 工具注册装饰器
适用于可扩展的工具系统。

### 14.3 事件驱动架构
适用于异步任务编排。

### 14.4 消息压缩机制
适用于长对话上下文管理。

### 14.5 Claude Code Skill 格式
可参考创建 shihao-web 专属技能。

---

## 15. 总结

browser-use 是一个设计精良的 AI 浏览器自动化框架，核心优势:

1. **架构清晰**: 模块化设计，易于扩展
2. **性能优化**: Lazy loading，消息压缩
3. **多模型支持**: 16+ LLM 提供商
4. **工具生态**: 自定义工具 + Skills 市场
5. **MCP 集成**: 与 AI Agent 生态无缝对接

**潜在价值**: 可为 shihao-web 提供后台自动化数据采集能力，构建端到端的智能投研平台。

---

*报告生成时间: 2026-03-29*
