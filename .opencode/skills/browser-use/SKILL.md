---
name: browser-use
description: Use when building AI agents that need web browser automation - Agent loops, natural language instructions, MCP integration, or multi-step web interactions
allowed-tools: Bash Read Write WebFetch WebSearch
---

# Browser-use - AI-Driven Browser Automation

browser-use 通过自然语言指令让 AI Agent 控制浏览器完成复杂网页任务。

## 核心概念

### Agent 思维模式

```
┌─────────────────────────────────────────────────────────────────┐
│                     Agent Loop 工作流                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐                                                   │
│  │  任务    │ ← 用户用自然语言描述                               │
│  └────┬────┘                                                   │
│       ↓                                                         │
│  ┌─────────┐                                                   │
│  │ LLM理解  │ ← 解析任务意图                                     │
│  └────┬────┘                                                   │
│       ↓                                                         │
│  ┌─────────┐                                                   │
│  │ 规划Actions │ ← 生成可执行步骤                                │
│  └────┬────┘                                                   │
│       ↓                                                         │
│  ┌─────────┐                                                   │
│  │  执行动作 │ ← 点击、输入、滚动、截图等                         │
│  └────┬────┘                                                   │
│       ↓                                                         │
│  ┌─────────┐                                                   │
│  │  评估结果 │ ← 判断是否完成或需要继续                          │
│  └────┬────┘                                                   │
│       ↓                                                         │
│  ┌─────────┐     ┌─────────┐                                   │
│  │  完成?  │─否→ │ 返回步骤3 │                                  │
│  └────┬────┘     └─────────┘                                   │
│       ↓ 是                                                      │
│  ┌─────────┐                                                   │
│  │  返回结果 │                                                   │
│  └─────────┘                                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 与 Scrapling 的区别

| 维度 | browser-use | scrapling |
|------|-------------|-----------|
| **控制方式** | AI 理解意图，自动决策 | 规则匹配，CSS/XPath |
| **适用场景** | 复杂交互、多步骤流程 | 简单、结构化页面 |
| **成本** | LLM API 调用 | 几乎免费 |
| **速度** | 较慢 (每步需 LLM) | 极快 |
| **适应性** | 强 (理解变化) | 中 (需 adaptive) |

**推荐策略**: 简单页面用 scrapling，复杂交互用 browser-use

---

## 速查表

### 一行命令
```bash
pip install browser-use
browser-use mcp  # 启动 MCP 服务器
```

### 基本用法
```python
from browser_use import Agent
from langchain_openai import ChatOpenAI

agent = Agent(
    task="任务描述",
    llm=ChatOpenAI(model="gpt-4o")
)
await agent.run()
```

### 支持的 LLM
```python
# OpenAI
from browser_use import Agent, ChatBrowserUse

# Anthropic
from anthropic import Anthropic

# Google
from langchain_google_genai import ChatGenerativeAI

# Ollama (本地)
from langchain_ollama import ChatOllama
```

---

## 完整文档

### 1. 安装与配置

```bash
pip install browser-use
playwright install chromium  # 安装浏览器
```

### 2. 基本 Agent 使用

```python
import asyncio
from browser_use import Agent
from langchain_openai import ChatOpenAI

async def main():
    agent = Agent(
        task="打开 Google，搜索 'AI news'，获取前5条标题",
        llm=ChatOpenAI(model="gpt-4o")
    )
    result = await agent.run()
    print(result)

asyncio.run(main())
```

### 3. 自定义工具

```python
from browser_use import tools, ActionResult
from browser_use.agent import BrowserSession

@tools.action('搜索商品价格')
async def search_price(product: str, browser_session: BrowserSession) -> ActionResult:
    """在购物网站搜索商品并返回价格"""
    page = browser_session.page
    
    # 执行搜索
    await page.fill('input[name="search"]', product)
    await page.click('button[type="submit"]')
    await page.wait_for_load_state('networkidle')
    
    # 提取价格
    price = await page.locator('.price').first.text_content()
    
    return ActionResult(extracted_content=f"{product} 价格: {price}")
```

### 4. MCP 集成

```bash
# 启动 MCP 服务器
browser-use mcp

# 配置到 AI Agent 使用
```

```json
{
  "mcpServers": {
    "browser-use": {
      "command": "browser-use",
      "args": ["mcp"]
    }
  }
}
```

### 5. 浏览器配置

```python
from browser_use import Agent

agent = Agent(
    task="任务",
    llm=llm,
    browser_config={
        "headless": False,  # 显示浏览器窗口
        "stealth": True,    # 隐身模式
        "viewport": {"width": 1920, "height": 1080}
    }
)
```

---

## MCP 工具集

browser-use MCP 提供以下工具:

| 工具 | 描述 |
|------|------|
| `browser_navigate` | 导航到 URL |
| `browser_click` | 点击元素 |
| `browser_type` | 输入文本 |
| `browser_scroll` | 滚动页面 |
| `browser_wait` | 等待元素 |
| `browser_extract` | 提取内容 |
| `browser_screenshot` | 截图 |
| `browser_go_back` | 返回上一页 |

---

## 架构解析

### Agent 组件

```
Agent
├── LLM (理解 + 决策)
├── Memory (历史上下文)
├── Tools (可扩展动作)
├── Controller (浏览器控制)
└── State (页面状态)
```

### 动作类型

| 动作 | 说明 |
|------|------|
| `click` | 点击元素 |
| `input_text` | 输入文本 |
| `scroll_down/up` | 滚动 |
| `go_to_url` | 跳转URL |
| `wait` | 等待加载 |
| `extract_content` | 提取内容 |
| `done` | 任务完成 |

---

## CLI 工具

```bash
# 持久化浏览器会话
browser-use open https://example.com

# 交互式命令
browser-use click "#submit"
browser-use type "input[name=q]" "搜索内容"
browser-use state    # 查看当前状态
browser-use screenshot  # 截图
```

---

## 应用场景

### 1. 自动化测试
```python
agent = Agent(
    task="测试用户登录流程：输入账号密码，点击登录，验证跳转",
    llm=llm
)
```

### 2. 数据采集
```python
agent = Agent(
    task="采集某电商商品信息：名称、价格、评分、评论数",
    llm=llm
)
```

### 3. 表单填写
```python
agent = Agent(
    task="填写并提交表单：姓名、邮箱、选择选项",
    llm=llm
)
```

---

## 最佳实践

1. **明确指令** - 任务描述越具体，效果越好
2. **分步任务** - 复杂任务拆分成多个简单步骤
3. **适当等待** - 使用 `wait_for_selector` 确保元素加载
4. **异常处理** - 添加重试和错误处理逻辑
5. **成本控制** - 简单任务用 scrapling，AI任务用 browser-use

---

## 官方资源

- GitHub: https://github.com/browser-use/browser-use
- 文档: https://docs.browser-use.com
- 官方 Skill: `skills/browser-use/SKILL.md`
