# 拾号-爬虫 (ShiHao-Crawler)

> 混合多策略爬虫系统 - 集静态抓取、动态渲染、深度爬取于一体

## 特性

- 🕷️ **多策略引擎** - 9种爬虫引擎自由切换
- 🔄 **智能降级** - 自动切换备用爬虫
- 🌐 **JS渲染** - 支持动态网页
- 📊 **批量爬取** - 并行/串行多URL
- 🛡️ **安全验证** - URL安全检查
- ⚡ **零依赖模式** - 标准库即可运行
- 📦 **多模态提取** - 文字/图片/视频/音频
- 🤖 **AI内容分析** - OCR/关键帧提取
- 🔒 **反爬虫技术** - 代理池/UA轮换/频率限制
- ⚙️ **智能工作流** - 自动化策略选择
- 🗣️ **自然语言驱动** - 一句话自动识别并执行 (v1.3.0新增)

## 快速开始

### 安装依赖

```bash
# 基础依赖
pip install requests beautifulsoup4

# 动态渲染（可选）
pip install playwright crawl4ai
python -m playwright install chromium

# AI分析（可选）
pip install paddleocr opencv-python pillow

# 反爬虫（可选）
pip install fake-useragent redis aiohttp
```

### 代码使用

```python
from crawler_shihao import crawl_sync

# 最简使用
result = crawl_sync("https://example.com")
print(result['content'])

# 指定策略
result = crawl_sync("https://bilibili.com", strategy="crawl4ai")
print(result['content'])
```

### 异步使用

```python
import asyncio
from crawler_shihao import CrawlerEngine, CrawlerConfig

async def main():
    config = CrawlerConfig(default_timeout=30, max_retries=3)
    engine = CrawlerEngine(config)
    
    result = await engine.crawl("https://example.com")
    print(result['content'])

asyncio.run(main())
```

### 自然语言驱动 (v1.3.0)

只需一句话描述，系统自动识别意图并执行：

```python
from crawler_shihao import smart_crawl, parse_intent

# 方式1: 一句话爬取
result = smart_crawl("帮我爬取B站视频《原神》")
result = smart_crawl("提取网页中的图片 https://example.com")
result = smart_crawl("采集小红书上关于AI的帖子")

# 方式2: 预览解析结果（不执行）
result = parse_intent("爬取抖音热门视频")
print(f"意图: {result.intent.value}")
print(f"置信度: {result.confidence}")
print(f"实体: {result.entities}")
```

支持的输入示例：
- `帮我爬取B站视频《原神》`
- `采集小红书上关于AI的帖子`
- `提取网页中的图片 https://example.com`
- `监控抖音热门视频`
- `批量采集数据`

## 引擎列表

| 引擎 | 策略 | 依赖 | 说明 |
|------|------|------|------|
| StdlibAdapter | stdio | 无 | 标准库零依赖 |
| ScraplingAdapter | scrapling | requests, bs4 | 静态页面 |
| NodePlaywrightAdapter | node | Node.js playwright | JS渲染 |
| Crawl4AIAdapter | crawl4ai | playwright | LLM友好 |
| BrowserUseAdapter | browser_use | browser-use | AI控制 |
| PydollAdapter | pydoll | pydoll | 轻量CDP |
| SeleniumBaseAdapter | selenium_base | seleniumbase | Selenium封装 |
| FirecrawlAdapter | firecrawl | firecrawl | 云端服务 |

## 降级链

```
AUTO → STDIO(零依赖) → SCRAPLING → CRAWL4AI → 失败
```

## 高级功能

### 多模态内容提取

```python
from crawler_shihao import MultimodalExtractor

extractor = MultimodalExtractor()
result = extractor.extract("https://example.com/article")

# 获取各类内容
text = result.get('text', [])
images = result.get('images', [])
videos = result.get('videos', [])
audio = result.get('audio', [])
```

### 平台适配器

```python
from crawler_shihao import PlatformManager, DouyinAdapter, BilibiliAdapter

manager = PlatformManager()

# 注册平台适配器
manager.register('douyin', DouyinAdapter())
manager.register('bilibili', BilibiliAdapter())

# 使用平台特定策略
result = await manager.crawl_with_strategy('https://douyin.com/video/xxx')
```

### AI内容分析

```python
from crawler_shihao import OCREngine, KeyFrameExtractor

# OCR文字识别
ocr = OCREngine()
text = ocr.extract_from_image(image_path)

# 视频关键帧提取
keyframes = KeyFrameExtractor().extract(video_path, num_frames=10)
```

### 反爬虫技术

```python
from crawler_shihao import ProxyPool, UserAgentPool, DomainRateLimiter

# 代理池
proxy_pool = ProxyPool()
proxy = proxy_pool.get_random_proxy()

# User-Agent轮换
ua_pool = UserAgentPool()
ua = ua_pool.get_random()

# 域名频率限制
rate_limiter = DomainRateLimiter()
await rate_limiter.acquire('example.com')
```

### 智能工作流

```python
from crawler_shihao import WorkflowEngine, SmartStrategySelector

# 策略选择器
selector = SmartStrategySelector()
strategy = selector.select(url)

# 工作流引擎
workflow = WorkflowEngine()
result = await workflow.execute(url, strategy=strategy)
```

## 配置

```python
from crawler_shihao import CrawlerConfig

config = CrawlerConfig(
    default_timeout=30,      # 超时时间
    max_retries=3,          # 最大重试
    headless=True,          # 无头模式
)
```

## 测试通过的网站

- ✅ example.com - 简单页面
- ✅ bilibili.com - 动态页面
- ✅ github.com - JS渲染
- ✅ hacker news - 新闻站点
- ✅ 微博 - 社交媒体
- ✅ 小红书 - 移动端
- ✅ YouTube - 视频
- ✅ Twitter/X - 社交

## CLI 使用

```bash
cd shihao-web/python-backend
python examples/test_hybrid_engine.py
python examples/test_stdlib.py
python examples/test_crawl4ai_engine.py
```

## 目录结构

```
shihao-web/python-backend/
├── crawler_shihao.py          # 入口文件 (v1.2.1)
├── src/crawler/
│   ├── __init__.py           # 包初始化
│   ├── core/                  # 核心引擎
│   │   ├── crawler_engine.py # 主引擎
│   │   ├── fallback_chain.py # 降级链
│   │   └── retry_handler.py  # 重试处理
│   ├── scrapers/             # 爬虫适配器
│   │   ├── stdlib_adapter.py       # 零依赖
│   │   ├── scrapling_adapter.py   # 静态
│   │   ├── crawl4ai_adapter.py    # 动态
│   │   └── ...
│   ├── multimodal/           # 多模态提取
│   │   ├── text_extractor.py
│   │   ├── image_extractor.py
│   │   ├── video_extractor.py
│   │   └── audio_extractor.py
│   ├── platforms/            # 平台适配器
│   │   ├── douyin_adapter.py
│   │   ├── bilibili_adapter.py
│   │   ├── xiaohongshu_adapter.py
│   │   └── platform_manager.py
│   ├── ai_analysis/          # AI分析
│   │   ├── ocr_engine.py
│   │   ├── keyframe_extractor.py
│   │   └── image_captioner.py
│   ├── anti_crawl/           # 反爬虫技术
│   │   ├── proxy_pool.py
│   │   ├── user_agent_pool.py
│   │   ├── rate_limiter.py
│   │   └── captcha_handler.py
│   ├── automation/           # 自动化
│   │   ├── workflow_engine.py
│   │   ├── strategy_selector.py
│   │   └── deduplicator.py
│   ├── structured/            # 结构化数据
│   │   ├── jsonld_extractor.py
│   │   ├── data_validator.py
│   │   └── data_cleaner.py
│   ├── router/               # 路由选择
│   ├── config.py             # 配置
│   └── types.py              # 类型定义
└── examples/                  # 示例
    ├── test_stdlib.py
    ├── test_crawl4ai_engine.py
    └── test_hybrid_engine.py
```

## 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v1.3.0 | 2026-04-15 | 自然语言驱动: smart_crawl一句话自动爬取 |
| v1.2.2 | 2026-04-15 | 修复: 类型验证、轮询优化、空引用防护 |
| v1.2.1 | 2026-04-15 | 安全修复: 超时参数、URL验证、敏感信息处理 |
| v1.2.0 | 2026-04-15 | Phase 5-6: 自动化工作流、结构化数据提取 |
| v1.1.0 | 2026-04-15 | Phase 1-4: 多模态提取、平台适配器、AI分析、反爬虫 |
| v1.0.0 | 2026-04-14 | 初始版本: 核心爬虫引擎 |

## License

MIT - ShiHao Team
