"""
Pydoll CDP Adapter - 直接通过 Chrome DevTools Protocol 控制浏览器
无需 WebDriver，高性能、低资源占用
"""

import asyncio
import json
from typing import Optional, Dict, Any, Callable, List
from dataclasses import dataclass, field
from .base import BaseScraper
from .result import normalize_result
from ..types import CrawlResult, CrawlerStrategy
from ..config import CrawlerConfig
from ..exceptions import ScraperError


@dataclass
class CDPConfig:
    port: int = 9222
    headless: bool = True
    user_data_dir: Optional[str] = None
    proxy: Optional[str] = None
    timeout: int = 30


class CDPAdapter:
    """CDP 协议适配器 - 基于 Pydoll 模式"""

    def __init__(self, config: CDPConfig = None):
        self.config = config or CDPConfig()
        self._ws = None
        self._message_id = 0
        self._callbacks: Dict[int, asyncio.Future] = {}
        self._listeners: Dict[str, List[Callable]] = {}
        self._connected = False

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def connect(self):
        """连接到 Chrome CDP 端口"""
        if self._connected:
            return

        try:
            import websockets

            ws_url = f"ws://localhost:{self.config.port}"
            self._ws = await websockets.connect(ws_url, ping_interval=None)
            self._connected = True
            asyncio.create_task(self._listen())
        except ImportError:
            raise ScraperError("websockets library required: pip install websockets")
        except Exception as e:
            raise ScraperError(f"Failed to connect to CDP: {e}")

    async def _listen(self):
        """监听 CDP 事件和响应"""
        try:
            async for msg in self._ws:
                data = json.loads(msg)
                msg_id = data.get("id")

                if msg_id in self._callbacks:
                    self._callbacks[msg_id].set_result(data)
                    del self._callbacks[msg_id]
                elif "method" in data:
                    await self._dispatch_event(data["method"], data.get("params", {}))
        except Exception:
            self._connected = False

    async def _dispatch_event(self, method: str, params: dict):
        """分发事件到监听器"""
        if method in self._listeners:
            for callback in self._listeners[method]:
                try:
                    if asyncio.iscoroutinefunction(callback):
                        await callback(params)
                    else:
                        callback(params)
                except Exception:
                    pass

    def subscribe(self, event: str, callback: Callable):
        """订阅 CDP 事件"""
        if event not in self._listeners:
            self._listeners[event] = []
        self._listeners[event].append(callback)

    async def execute(self, method: str, params: dict = None) -> dict:
        """执行 CDP 命令"""
        if not self._connected:
            await self.connect()

        self._message_id += 1
        msg_id = self._message_id

        future = asyncio.Future()
        self._callbacks[msg_id] = future

        await self._ws.send(
            json.dumps({"id": msg_id, "method": method, "params": params or {}})
        )

        try:
            result = await asyncio.wait_for(future, timeout=self.config.timeout)
            return result
        except asyncio.TimeoutError:
            raise ScraperError(f"CDP command timeout: {method}")

    async def goto(self, url: str, wait_until: str = "load") -> str:
        """导航到 URL"""
        result = await self.execute("Target.createTarget", {"url": "about:blank"})
        target_id = result["result"]["targetId"]

        await self.execute("Target.activateTarget", {"targetId": target_id})
        await self.execute("Page.navigate", {"url": url})

        if wait_until == "load":
            await self.wait_for_event(
                "Page.loadEventFired", timeout=self.config.timeout
            )
        elif wait_until == "networkidle":
            await self.wait_for_event("Network.idle", timeout=self.config.timeout)
        elif wait_until == "domcontent":
            await self.wait_for_event("DOM.contentLoaded", timeout=self.config.timeout)

        return target_id

    async def query_selector(self, selector: str) -> Optional[int]:
        """查询单个元素"""
        doc = await self.execute("DOM.getDocument")
        root_id = doc["result"]["root"]["nodeId"]

        result = await self.execute(
            "DOM.querySelector", {"selector": selector, "nodeId": root_id}
        )

        return result["result"].get("nodeId")

    async def query_selector_all(self, selector: str) -> List[int]:
        """查询所有匹配元素"""
        doc = await self.execute("DOM.getDocument")
        root_id = doc["result"]["root"]["nodeId"]

        result = await self.execute(
            "DOM.querySelectorAll", {"selector": selector, "nodeId": root_id}
        )

        return result["result"].get("nodeIds", [])

    async def evaluate(self, expression: str, return_by_value: bool = True) -> Any:
        """执行 JavaScript"""
        result = await self.execute(
            "Runtime.evaluate",
            {
                "expression": expression,
                "returnByValue": return_by_value,
                "awaitPromise": True,
            },
        )

        if return_by_value:
            return result.get("result", {}).get("value")
        return result

    async def get_element_text(self, node_id: int) -> str:
        """获取元素文本"""
        result = await self.execute("DOM.getOuterHTML", {"nodeId": node_id})
        return result.get("result", {}).get("outerHTML", "")

    async def click_element(self, node_id: int):
        """点击元素"""
        await self.execute("DOM.scrollIntoViewIfNeeded", {"nodeId": node_id})
        box = await self.execute("DOM.getBoundingClientRect", {"nodeId": node_id})

        x = box["result"]["x"] + box["result"]["width"] / 2
        y = box["result"]["y"] + box["result"]["height"] / 2

        await self.execute(
            "Input.dispatchMouseEvent",
            {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1},
        )
        await self.execute(
            "Input.dispatchMouseEvent",
            {
                "type": "mouseReleased",
                "x": x,
                "y": y,
                "button": "left",
                "clickCount": 1,
            },
        )

    async def wait_for_event(self, event: str, timeout: float = None) -> Optional[dict]:
        """等待事件"""
        timeout = timeout or self.config.timeout
        future = asyncio.Future()

        def callback(params):
            if not future.done():
                future.set_result(params)

        self.subscribe(event, callback)

        try:
            return await asyncio.wait_for(future, timeout)
        except asyncio.TimeoutError:
            return None

    async def enable_network_interception(self, handler: Callable):
        """启用网络请求拦截"""
        await self.execute("Fetch.enable", {})

        async def handle_request_paused(params):
            request_id = params["requestId"]
            url = params["request"]["url"]

            try:
                await handler(params, self)
            except Exception:
                await self.execute("Fetch.continueRequest", {"requestId": request_id})

        self.subscribe("Fetch.requestPaused", handle_request_paused)

    async def close(self):
        """关闭连接"""
        if self._ws:
            await self._ws.close()
        self._connected = False


class PydollScraper(BaseScraper):
    """基于 Pydoll CDP 的爬虫"""

    def supports(self, url: str) -> bool:
        return url.startswith("http")

    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        timeout = kwargs.get("timeout", self.config.default_timeout)
        wait_until = kwargs.get("wait_until", "load")

        cdp_config = CDPConfig(timeout=timeout)

        try:
            async with CDPAdapter(cdp_config) as adapter:
                await adapter.goto(url, wait_until=wait_until)

                content = await adapter.evaluate("document.body.innerHTML")
                title = await adapter.evaluate("document.title")
                final_url = await adapter.evaluate("window.location.href")

                return normalize_result(
                    content=content or "",
                    strategy=CrawlerStrategy.PYDOLL,
                    metadata={"url": final_url, "title": title, "original_url": url},
                )
        except ImportError as e:
            return normalize_result(
                content="",
                strategy=CrawlerStrategy.PYDOLL,
                metadata={"error": str(e), "url": url},
                success=False,
            )
        except Exception as e:
            raise ScraperError(f"Pydoll failed for {url}: {e}") from e


adapter = PydollScraper()
