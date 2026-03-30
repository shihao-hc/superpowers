# Pydoll Patterns

> Pydoll - 无头浏览器自动化库，6.7K stars，直接通过 CDP（Chrome DevTools Protocol）控制浏览器，无需 WebDriver

## 核心架构

### 1. CDP WebSocket 通信
```python
# Pydoll 核心：CDP WebSocket 客户端
class Pydoll:
    def __init__(self, browser_type="chrome", headless=True):
        self.ws_url = self._start_browser()
        self.ws = WebSocketClient(self.ws_url)
    
    def execute(self, method: str, params: dict = None) -> dict:
        """发送 CDP 命令并等待响应"""
        message_id = generate_id()
        self.ws.send({
            "id": message_id,
            "method": method,
            "params": params or {}
        })
        return self._wait_for_response(message_id)
```

### 2. 事件驱动架构
```python
# 监听浏览器事件
async def handle_events():
    async with Pydoll() as browser:
        # 订阅事件
        browser.subscribe("Page.frameStartedLoading", callback)
        browser.subscribe("Runtime.consoleAPICalled", handle_console)
        
        # 执行操作
        await browser.go_to("https://example.com")
        
        # 异步等待事件
        await browser.wait_for_event("Page.loadEventFired")
```

## 关键模式

### 模式 1：CDP 命令封装
```python
class CDPCommand:
    """CDP 命令构建器"""
    
    # DOM 操作
    DOCUMENT_QUERY_SELECTOR = "DOM.querySelector"
    DOCUMENT_QUERY_SELECTOR_ALL = "DOM.querySelectorAll"
    GET_DOCUMENT = "DOM.getDocument"
    
    # 执行上下文
    EVALUATE = "Runtime.evaluate"
    CALL_FUNCTION_ON = "Runtime.callFunctionOn"
    
    # 网络拦截
    FETCH_ENABLE = "Fetch.enable"
    FETCH_REQUEST_PAUSE = "Fetch.requestPaused"
    FETCH_FULFILL_REQUEST = "Fetch.fulfillRequest"
    
    @classmethod
    def query_selector(cls, selector: str, node_id: int = None):
        return {
            "selector": selector,
            "nodeId": node_id
        }
```

### 模式 2：无 WebDriver 架构
```python
# 对比传统 Selenium vs Pydoll
# Selenium: WebDriver -> ChromeDriver -> Chrome
# Pydoll: 直接 CDP WebSocket -> Chrome

class PydollBrowser:
    """直接 CDP 控制，无需中间层"""
    
    def __init__(self, port=9222):
        # 直接连接到 Chrome 的 CDP 端口
        self.chrome_url = f"http://localhost:{port}"
        self.ws_url = self._get_websocket_url()
    
    def new_page(self) -> "PydollPage":
        """创建新页面"""
        tab_id = self._create_target()
        return PydollPage(tab_id, self.ws_url)
```

### 模式 3：元素定位与交互
```python
class Element:
    """CDP 原生元素操作"""
    
    def __init__(self, node_id: int, backend_id: str, page: "PydollPage"):
        self.node_id = node_id
        self.backend_id = backend_id
        self.page = page
    
    async def click(self):
        self.page.execute("Runtime.evaluate", {
            "expression": f"""
                document.querySelector('[data-node-id="{self.node_id}"]').click()
            """
        })
    
    async def fill(self, text: str):
        self.page.execute("DOM.setAttributeValue", {
            "nodeId": self.node_id,
            "name": "value",
            "value": text
        })
    
    async def get_text(self) -> str:
        result = self.page.execute("Runtime.callFunctionOn", {
            "functionDeclaration": "(el) => el.textContent",
            "objectId": self.backend_id
        })
        return result.get("result", {}).get("value", "")
```

### 模式 4：异步上下文管理器
```python
class Pydoll:
    """异步上下文管理器，自动资源清理"""
    
    async def __aenter__(self):
        await self.start()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    async def start(self):
        """启动浏览器"""
        self.ws = await websockets.connect(self.ws_url)
        self._running = True
    
    async def close(self):
        """清理资源"""
        self._running = False
        if self.ws:
            await self.ws.close()
        await self._kill_browser()
```

### 模式 5：请求拦截
```python
# 网络请求拦截
async def intercept_requests():
    async with Pydoll() as browser:
        page = browser.new_page()
        
        # 启用请求拦截
        await page.execute("Fetch.enable", {})
        
        # 注册拦截处理器
        async def handle_intercept(msg):
            if msg["method"] == "Fetch.requestPaused":
                params = msg["params"]
                
                # 阻止某些请求
                if "analytics" in params["request"]["url"]:
                    await page.execute("Fetch.failRequest", {
                        "requestId": params["requestId"],
                        "errorReason": "Failed"
                    })
                else:
                    await page.execute("Fetch.continueRequest", {
                        "requestId": params["requestId"]
                    })
        
        page.on("Fetch.requestPaused", handle_intercept)
        await page.goto("https://example.com")
```

## 集成到项目

### 在 crawler/ 中创建 pydoll_adapter.py

```python
# src/crawler/adapters/pydoll_adapter.py
"""Pydoll CDP 集成适配器"""
import asyncio
import json
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass
from ...core.browser_manager import BrowserManager

@dataclass
class CDPConfig:
    port: int = 9222
    headless: bool = True
    user_data_dir: Optional[str] = None
    proxy: Optional[str] = None

class PydollAdapter:
    """Pydoll CDP 适配器"""
    
    def __init__(self, config: CDPConfig = None):
        self.config = config or CDPConfig()
        self._ws = None
        self._message_id = 0
        self._callbacks: Dict[int, asyncio.Future] = {}
        self._listeners: Dict[str, list] = {}
    
    async def __aenter__(self):
        await self.connect()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    async def connect(self):
        """连接到 Chrome CDP"""
        import websockets
        self._ws = await websockets.connect(f"ws://localhost:{self.config.port}")
        asyncio.create_task(self._listen())
    
    async def _listen(self):
        """监听 CDP 事件"""
        async for msg in self._ws:
            data = json.loads(msg)
            msg_id = data.get("id")
            
            if msg_id in self._callbacks:
                self._callbacks[msg_id].set_result(data)
            elif "method" in data:
                await self._dispatch_event(data["method"], data.get("params", {}))
    
    async def _dispatch_event(self, method: str, params: dict):
        """分发事件到监听器"""
        if method in self._listeners:
            for callback in self._listeners[method]:
                await callback(params)
    
    def subscribe(self, event: str, callback: Callable):
        """订阅事件"""
        if event not in self._listeners:
            self._listeners[event] = []
        self._listeners[event].append(callback)
    
    async def execute(self, method: str, params: dict = None) -> dict:
        """执行 CDP 命令"""
        self._message_id += 1
        msg_id = self._message_id
        
        future = asyncio.Future()
        self._callbacks[msg_id] = future
        
        await self._ws.send(json.dumps({
            "id": msg_id,
            "method": method,
            "params": params or {}
        }))
        
        return await future
    
    async def goto(self, url: str, wait_until: str = "load"):
        """导航到 URL"""
        # 创建新页面
        result = await self.execute("Target.createTarget", {
            "url": "about:blank"
        })
        target_id = result["result"]["targetId"]
        
        # 激活页面
        await self.execute("Target.activateTarget", {"targetId": target_id})
        
        # 导航
        await self.execute("Page.navigate", {"url": url})
        
        # 等待加载完成
        if wait_until == "load":
            await self.wait_for_event("Page.loadEventFired")
        elif wait_until == "networkidle":
            await self.wait_for_event("Network.idle")
        
        return target_id
    
    async def query_selector(self, selector: str):
        """查询单个元素"""
        doc = await self.execute("DOM.getDocument")
        root_id = doc["result"]["root"]["nodeId"]
        
        result = await self.execute("DOM.querySelector", {
            "selector": selector,
            "nodeId": root_id
        })
        
        return result["result"]["nodeId"]
    
    async def query_selector_all(self, selector: str) -> list:
        """查询所有匹配元素"""
        doc = await self.execute("DOM.getDocument")
        root_id = doc["result"]["root"]["nodeId"]
        
        result = await self.execute("DOM.querySelectorAll", {
            "selector": selector,
            "nodeId": root_id
        })
        
        return result["result"]["nodeIds"]
    
    async def evaluate(self, expression: str) -> Any:
        """执行 JavaScript"""
        result = await self.execute("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True
        })
        return result["result"].get("value")
    
    async def close(self):
        """关闭连接"""
        if self._ws:
            await self._ws.close()
    
    async def wait_for_event(self, event: str, timeout: float = 30):
        """等待事件"""
        future = asyncio.Future()
        
        def callback(params):
            if not future.done():
                future.set_result(params)
        
        self.subscribe(event, callback)
        
        try:
            return await asyncio.wait_for(future, timeout)
        except asyncio.TimeoutError:
            return None
```

### 异步爬虫示例

```python
# src/crawler/async_crawler.py
"""基于 Pydoll 的异步爬虫"""
from .adapters.pydoll_adapter import PydollAdapter, CDPConfig
from typing import List, Dict
import asyncio

class AsyncCrawler:
    """异步爬虫"""
    
    def __init__(self, max_concurrent: int = 5):
        self.max_concurrent = max_concurrent
        self.semaphore = asyncio.Semaphore(max_concurrent)
    
    async def crawl(self, urls: List[str]) -> List[Dict]:
        """并发爬取多个 URL"""
        async with PydollAdapter(CDPConfig()) as adapter:
            tasks = [self._crawl_page(adapter, url) for url in urls]
            return await asyncio.gather(*tasks)
    
    async def _crawl_page(self, adapter: PydollAdapter, url: str) -> Dict:
        async with self.semaphore:
            await adapter.goto(url)
            content = await adapter.evaluate("document.body.innerHTML")
            title = await adapter.evaluate("document.title")
            
            return {
                "url": url,
                "title": title,
                "content": content
            }
```

## 优势

| 特性 | Selenium | Pydoll |
|------|----------|--------|
| 速度 | 慢 | 快（无中间层）|
| 资源占用 | 高 | 低 |
| 控制粒度 | 粗 | 细（直接 CDP）|
| 异步支持 | 需显式配置 | 原生支持 |
| 学习曲线 | 低 | 中 |

## 使用场景

1. **高性能爬虫**：需要并发爬取大量页面
2. **细粒度控制**：需要拦截请求、修改响应
3. **资源受限环境**：无头服务器、资源有限
4. **实时交互**：需要监听大量浏览器事件
