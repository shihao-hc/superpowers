# Scrapling Patterns

> Scrapling - 自适应 Web 爬虫框架，33K stars，支持自动元素重定位、代理轮换、反爬绕过、MCP 集成

## 核心架构

### 1. Spider 架构
```python
# Scrapling 核心：Spider 类
class Spider:
    def __init__(self, name: str):
        self.name = name
        self.start_urls = []
        self.crawl_policy = " breadth_first"  # or "depth_first"
        self.extractor = self.get_extractor()
    
    def start_requests(self):
        """生成初始请求"""
        for url in self.start_urls:
            yield Request(url, callback=self.parse)
    
    def parse(self, response):
        """解析响应"""
        raise NotImplementedError
    
    def get_extractor(self):
        """获取提取器"""
        return AdaptiveExtractor()
```

### 2. 自适应元素追踪
```python
# 核心特性：元素重定位
class AdaptiveExtractor:
    """当页面结构变化时自动重定位元素"""
    
    def __init__(self):
        self.fingerprint_cache = {}
        self.fallback_strategy = "fuzzy_match"
    
    def extract(self, page, selector: str):
        """提取元素，自动处理结构变化"""
        try:
            return page.query_selector(selector)
        except ElementNotFound:
            # 自动重定位策略
            return self._relocate(page, selector)
    
    def _relocate(self, page, original_selector: str):
        """重定位元素"""
        # 策略 1：文本相似度匹配
        if original_selector.startswith("#"):
            element_id = original_selector[1:]
            fingerprint = self.fingerprint_cache.get(element_id)
            if fingerprint:
                return self._find_by_fingerprint(page, fingerprint)
        
        # 策略 2：XPath 模糊匹配
        return self._fuzzy_xpath_match(page, original_selector)
    
    def _find_by_fingerprint(self, page, fingerprint: dict):
        """通过指纹查找元素"""
        elements = page.query_selector_all("[data-fingerprint]")
        
        for el in elements:
            el_fp = self._compute_fingerprint(el)
            if self._fingerprint_similarity(el_fp, fingerprint) > 0.8:
                return el
        
        return None
    
    def _compute_fingerprint(self, element) -> dict:
        """计算元素指纹"""
        return {
            "text": element.text[:50] if element.text else "",
            "tag": element.tag_name,
            "attrs": {k: v for k, v in element.attributes.items() 
                     if k.startswith("data-") or k in ["class", "id", "href"]},
            "position": element.bounding_box
        }
```

### 3. 调度器与去重
```python
# 请求调度器
class Scheduler:
    """请求调度与去重"""
    
    def __init__(self):
        self.visited_urls = set()
        self.pending_requests = PriorityQueue()
        self.request_fingerprints = {}  # URL -> fingerprint
        self.dedup_strategy = "fingerprint"
    
    def add_request(self, request: Request):
        """添加请求，自动去重"""
        fingerprint = self._compute_fingerprint(request)
        
        if fingerprint in self.request_fingerprints:
            # 检查是否需要重新爬取
            if self._should_rescrape(request, fingerprint):
                self.pending_requests.push(request)
        else:
            self.request_fingerprints[fingerprint] = True
            self.pending_requests.push(request)
    
    def _compute_fingerprint(self, request: Request) -> str:
        """计算请求指纹（用于去重）"""
        import hashlib
        content = f"{request.url}:{request.method}:{request.params}"
        return hashlib.md5(content.encode()).hexdigest()
    
    def _should_rescrape(self, request: Request, fingerprint: str) -> bool:
        """判断是否需要重新爬取"""
        if request.metadata.get("force_update"):
            return True
        
        last_crawl = self.last_crawl_time.get(fingerprint)
        if last_crawl:
            age = datetime.now() - last_crawl
            return age > request.update_interval
        
        return False
```

### 4. 会话管理
```python
# 多会话管理
class SessionManager:
    """管理多个浏览器会话"""
    
    def __init__(self, pool_size: int = 5):
        self.sessions = {}
        self.pool_size = pool_size
        self._lock = asyncio.Lock()
    
    async def get_session(self, session_id: str = None) -> Session:
        """获取或创建会话"""
        async with self._lock:
            if session_id and session_id in self.sessions:
                return self.sessions[session_id]
            
            # 创建新会话
            session = Session()
            self.sessions[session.id] = session
            
            # 清理多余会话
            if len(self.sessions) > self.pool_size:
                await self._cleanup_idle_sessions()
            
            return session
    
    async def rotate_session(self) -> Session:
        """轮换会话（用于反检测）"""
        # 关闭当前会话
        current = self.current_session
        if current:
            await current.close()
        
        # 创建新会话
        return await self.get_session()

class Session:
    """单个浏览器会话"""
    
    def __init__(self):
        self.id = str(uuid.uuid4())
        self.browser = None
        self.context = None
        self.page = None
        self.cookies = []
        self.local_storage = {}
        self.created_at = datetime.now()
        self.last_used = datetime.now()
        self.request_count = 0
    
    async def setup(self, proxy: str = None):
        """设置会话"""
        self.browser = await launch_browser(headless=True)
        self.context = await self.browser.new_context(
            proxy=proxy,
            user_agent=self._random_user_agent()
        )
        self.page = await self.context.new_page()
    
    def _random_user_agent(self) -> str:
        """随机 User-Agent"""
        ua_list = load_user_agents()
        return random.choice(ua_list)
    
    async def save_state(self):
        """保存会话状态"""
        self.cookies = await self.context.cookies()
        self.local_storage = await self.page.evaluate("""
            Object.assign({}, localStorage)
        """)
    
    async def restore_state(self):
        """恢复会话状态"""
        if self.cookies:
            await self.context.add_cookies(self.cookies)
        if self.local_storage:
            await self.page.evaluate(f"""
                Object.assign(localStorage, {json.dumps(self.local_storage)})
            """)
    
    async def close(self):
        """关闭会话"""
        if self.page:
            await self.page.close()
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
```

### 5. 检查点与恢复
```python
# 断点续爬
class CheckpointManager:
    """爬虫状态检查点管理"""
    
    def __init__(self, checkpoint_dir: str = "./checkpoints"):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(exist_ok=True)
        self.state_file = self.checkpoint_dir / "crawl_state.json"
    
    def save_checkpoint(self, spider_name: str, state: dict):
        """保存检查点"""
        checkpoint = {
            "spider_name": spider_name,
            "timestamp": datetime.now().isoformat(),
            "pending_urls": state.get("pending", []),
            "completed_urls": state.get("completed", []),
            "failed_urls": state.get("failed", []),
            "stats": state.get("stats", {}),
            "session_state": state.get("session", {})
        }
        
        # 备份旧检查点
        if self.state_file.exists():
            backup = self.checkpoint_dir / f"{spider_name}.backup.json"
            shutil.copy(self.state_file, backup)
        
        with open(self.state_file, "w") as f:
            json.dump(checkpoint, f, indent=2)
    
    def load_checkpoint(self) -> dict:
        """加载检查点"""
        if not self.state_file.exists():
            return None
        
        with open(self.state_file, "r") as f:
            return json.load(f)
    
    async def resume(self, spider: Spider):
        """从检查点恢复爬虫"""
        checkpoint = self.load_checkpoint()
        if not checkpoint:
            return spider
        
        # 恢复待爬 URL
        spider.pending_urls = deque(checkpoint["pending_urls"])
        
        # 恢复已完成 URL
        spider.completed_urls = set(checkpoint["completed_urls"])
        
        # 恢复会话
        if checkpoint.get("session_state"):
            await spider.session.restore_state()
        
        logger.info(f"恢复爬虫，已完成 {len(spider.completed_urls)} 个 URL")
        return spider
```

### 6. 代理轮换
```python
# 代理池管理
class ProxyPool:
    """代理池管理"""
    
    def __init__(self):
        self.proxies = []
        self.failed_proxies = {}
        self.current_index = 0
        self.rotation_strategy = "round_robin"
    
    def add_proxy(self, proxy: str, tags: list = None):
        """添加代理"""
        self.proxies.append({
            "url": proxy,
            "tags": tags or [],
            "success_count": 0,
            "fail_count": 0,
            "last_used": None,
            "latency": None
        })
    
    def get_proxy(self) -> str:
        """获取代理"""
        if self.rotation_strategy == "round_robin":
            proxy = self.proxies[self.current_index]
            self.current_index = (self.current_index + 1) % len(self.proxies)
        elif self.rotation_strategy == "weighted_random":
            proxy = self._weighted_random_select()
        elif self.rotation_strategy == "smart":
            proxy = self._smart_select()
        
        proxy["last_used"] = datetime.now()
        return proxy["url"]
    
    def _smart_select(self) -> dict:
        """智能选择：优先选择成功率高、延迟低的代理"""
        available = [p for p in self.proxies 
                    if p["fail_count"] < 5]
        
        if not available:
            # 所有代理都失败过，重置并返回
            for p in self.proxies:
                p["fail_count"] = 0
            available = self.proxies
        
        return min(available, 
                   key=lambda p: (p["fail_count"], p["latency"] or 999))
    
    def mark_success(self, proxy: str):
        """标记代理成功"""
        for p in self.proxies:
            if p["url"] == proxy:
                p["success_count"] += 1
                p["fail_count"] = 0
                break
    
    def mark_failure(self, proxy: str):
        """标记代理失败"""
        for p in self.proxies:
            if p["url"] == proxy:
                p["fail_count"] += 1
                if p["fail_count"] > 10:
                    self.proxies.remove(p)
                break
```

## 集成到项目

### 在 crawler/ 中创建 scrapling_adapter.py

```python
# src/crawler/adapters/scrapling_adapter.py
"""Scrapling 集成适配器"""
from typing import List, Dict, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from ...core.browser_manager import BrowserManager
from .pydoll_adapter import PydollAdapter

@dataclass
class SpiderConfig:
    name: str
    start_urls: List[str] = field(default_factory=list)
    crawl_policy: str = "breadth_first"
    max_concurrent: int = 5
    retry_times: int = 3
    proxy_pool: Optional["ProxyPool"] = None

@dataclass
class Request:
    url: str
    callback: Callable = None
    method: str = "GET"
    params: dict = None
    headers: dict = None
    metadata: dict = field(default_factory=dict)
    
    def __hash__(self):
        return hash(self.url)

class ScraplingSpider:
    """Scrapling 风格的 Spider"""
    
    def __init__(self, config: SpiderConfig):
        self.config = config
        self.name = config.name
        self.pending_urls = []
        self.completed_urls = set()
        self.failed_urls = {}
        self.stats = {
            "pages_crawled": 0,
            "items_extracted": 0,
            "bytes_downloaded": 0
        }
        self.session_manager = SessionManager()
        self.checkpoint_manager = CheckpointManager()
        self.adapter = PydollAdapter()
    
    def start_requests(self) -> List[Request]:
        """生成初始请求"""
        requests = []
        for url in self.config.start_urls:
            requests.append(Request(url=url, callback=self.parse))
            self.pending_urls.append(url)
        return requests
    
    async def start(self):
        """启动爬虫"""
        await self.adapter.connect()
        
        try:
            for request in self.start_requests():
                await self.crawl(request)
        finally:
            await self.adapter.close()
    
    async def crawl(self, request: Request):
        """爬取单个请求"""
        if request.url in self.completed_urls:
            return
        
        if self.config.proxy_pool:
            proxy = self.config.proxy_pool.get_proxy()
        else:
            proxy = None
        
        try:
            await self.adapter.goto(request.url)
            
            # 调用回调处理响应
            if request.callback:
                await request.callback(self.adapter)
            
            self.completed_urls.add(request.url)
            self.stats["pages_crawled"] += 1
            
            if self.config.proxy_pool:
                self.config.proxy_pool.mark_success(proxy)
        
        except Exception as e:
            self.failed_urls[request.url] = str(e)
            logger.error(f"爬取失败 {request.url}: {e}")
            
            if self.config.proxy_pool and proxy:
                self.config.proxy_pool.mark_failure(proxy)
            
            # 重试
            if request.metadata.get("retry_count", 0) < self.config.retry_times:
                request.metadata["retry_count"] = request.metadata.get("retry_count", 0) + 1
                await self.crawl(request)
    
    async def parse(self, adapter: PydollAdapter):
        """解析页面 - 子类实现"""
        raise NotImplementedError
    
    def save_checkpoint(self):
        """保存检查点"""
        self.checkpoint_manager.save_checkpoint(self.name, {
            "pending": self.pending_urls,
            "completed": list(self.completed_urls),
            "failed": self.failed_urls,
            "stats": self.stats
        })
    
    async def resume(self):
        """从检查点恢复"""
        checkpoint = self.checkpoint_manager.load_checkpoint()
        if checkpoint and checkpoint["spider_name"] == self.name:
            self.pending_urls = checkpoint["pending_urls"]
            self.completed_urls = set(checkpoint["completed"])
            self.failed_urls = checkpoint["failed"]
            self.stats = checkpoint["stats"]
            logger.info(f"恢复爬虫，已完成 {len(self.completed_urls)} 个页面")
        
        await self.start()
```

### 爬虫示例

```python
# examples/amazon_spider.py
"""Amazon 商品爬虫示例"""
from src.crawler.adapters.scrapling_adapter import ScraplingSpider, SpiderConfig, Request
import asyncio

class AmazonSpider(ScraplingSpider):
    
    def __init__(self):
        config = SpiderConfig(
            name="amazon",
            start_urls=[
                "https://www.amazon.com/s?k=laptop",
                "https://www.amazon.com/s?k=phone"
            ],
            crawl_policy="depth_first",
            max_concurrent=3,
            proxy_pool=ProxyPool()  # 使用代理池
        )
        super().__init__(config)
        self.items = []
    
    async def parse(self, adapter):
        """解析商品列表"""
        items = await adapter.query_selector_all(".s-result-item")
        
        for item in items[:10]:  # 只取前10个
            try:
                title = await adapter.evaluate(
                    f"document.querySelector('[data-asin=\"{item}\"] h2').textContent"
                )
                price = await adapter.evaluate(
                    f"document.querySelector('[data-asin=\"{item}\"] .a-price-whole').textContent"
                )
                
                self.items.append({
                    "title": title.strip(),
                    "price": price
                })
                self.stats["items_extracted"] += 1
                
            except Exception as e:
                logger.warning(f"解析商品失败: {e}")
        
        # 翻页
        next_page = await adapter.query_selector(".a-pagination .a-last a")
        if next_page:
            next_url = await adapter.evaluate(
                "document.querySelector('.a-pagination .a-last a').href"
            )
            self.pending_urls.append(next_url)

if __name__ == "__main__":
    spider = AmazonSpider()
    asyncio.run(spider.start())
```

## 关键模式总结

| 模式 | 作用 | 实现难度 |
|------|------|---------|
| 自适应元素追踪 | 页面结构变化时自动重定位 | 中 |
| 请求去重 | 避免重复爬取 | 低 |
| 会话管理 | 多会话轮换，反检测 | 中 |
| 检查点恢复 | 断点续爬 | 中 |
| 代理轮换 | 避免 IP 被封 | 低 |
