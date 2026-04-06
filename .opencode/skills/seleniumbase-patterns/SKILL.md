---
name: seleniumbase-patterns
description: SeleniumBase 测试框架，UC Mode 反检测、CDP Mode、浏览器池管理、API 测试、Dashboard
---

# SeleniumBase Patterns

> SeleniumBase - 全面的 Selenium 测试框架，12.5K stars，UC Mode（反检测）、CDP Mode、API 测试、Dashboard

## 核心架构

### 1. UC Mode（Undetected Chromedriver）
```python
# SeleniumBase UC Mode 核心
# 原理：修改 chromedriver 特征，模拟真实浏览器

import undetected_chromedriver as uc
from selenium.webdriver.chrome.options import Options

class SeleniumBaseUC:
    """UC Mode - 绕过反爬检测"""
    
    def __init__(self):
        self.options = uc.ChromeOptions()
        self._configure_stealth()
    
    def _configure_stealth(self):
        """配置隐身参数"""
        # 移除 webdriver 标记
        self.options.add_argument("--disable-blink-features=AutomationControlled")
        
        # 模拟真实浏览器
        self.options.add_experimental_option(
            "excludeSwitches", 
            ["enable-automation"]
        )
        self.options.add_experimental_option(
            "useAutomationExtension", 
            False
        )
        
        # 随机化窗口大小
        self.options.add_argument("--window-size=1920,1080")
        
        # 禁用图片加载（可选，加速）
        # self.options.add_argument("--blink-settings=imagesEnabled=false")
    
    def create_driver(self):
        """创建驱动"""
        driver = uc.Chrome(
            driver_executable_path=self._get_chromedriver(),
            options=self.options,
            version_main=None  # 自动匹配 Chrome 版本
        )
        
        # 移除 selenium 特征
        driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
            "source": """
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                })
            """
        })
        
        return driver
```

### 2. CDP Mode（Chrome DevTools Protocol）
```python
# SeleniumBase CDP Mode
class SeleniumBaseCDP:
    """CDP 模式 - 细粒度控制"""
    
    def __init__(self):
        self.driver = None
    
    def activate_cdp_mode(self, driver):
        """激活 CDP 模式"""
        self.driver = driver
        
        # 使用 selenium-wire 或直接 CDP
        import json
        
        # 拦截请求
        self.driver.execute_cdp_cmd("Fetch.enable", {})
        
        # 设置请求拦截
        def handle_requestPause(params):
            request_id = params.get("requestId")
            url = params.get("request", {}).get("url", "")
            
            # 阻止特定请求
            if "ads" in url or "analytics" in url:
                self.driver.execute_cdp_cmd("Fetch.failRequest", {
                    "requestId": request_id,
                    "errorReason": "Failed"
                })
            else:
                self.driver.execute_cdp_cmd("Fetch.continueRequest", {
                    "requestId": request_id
                })
        
        # 注册拦截处理
        self.driver.on_request_paused = handle_requestPause
    
    def modify_response(self, url_pattern: str, modify_func):
        """修改响应"""
        def handler(params):
            if url_pattern in params.get("request", {}).get("url", ""):
                # 获取原始响应
                response_body = self.driver.execute_cdp_cmd(
                    "Fetch.getResponseBody",
                    {"requestId": params["requestId"]}
                )
                
                # 修改响应
                modified = modify_func(response_body)
                
                # 返回修改后的响应
                self.driver.execute_cdp_cmd("Fetch.fulfillRequest", {
                    "requestId": params["requestId"],
                    "responseCode": 200,
                    "responseHeaders": [],
                    "body": modified
                })
        
        self.driver.on_request_paused = handler
```

### 3. 浏览器池管理
```python
# SeleniumBase 浏览器池
from contextlib import contextmanager
from queue import Queue
import threading

class BrowserPool:
    """浏览器连接池"""
    
    def __init__(self, pool_size: int = 5):
        self.pool_size = pool_size
        self.available = Queue()
        self.in_use = set()
        self.lock = threading.Lock()
        
        # 预热池
        for _ in range(pool_size):
            driver = self._create_driver()
            self.available.put(driver)
    
    def _create_driver(self):
        """创建浏览器实例"""
        options = uc.ChromeOptions()
        options.add_argument("--headless=new")
        
        driver = uc.Chrome(options=options)
        driver.implicitly_wait(10)
        return driver
    
    @contextmanager
    def get_driver(self):
        """获取浏览器实例"""
        driver = self.available.get()
        
        with self.lock:
            self.in_use.add(driver)
        
        try:
            yield driver
        finally:
            with self.lock:
                self.in_use.discard(driver)
            
            # 重置状态
            driver.delete_all_cookies()
            self.available.put(driver)
    
    def close_all(self):
        """关闭所有浏览器"""
        while not self.available.empty():
            try:
                driver = self.available.get_nowait()
                driver.quit()
            except:
                pass
```

### 4. 智能等待
```python
# SeleniumBase 智能等待
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By

class SmartWait:
    """智能等待机制"""
    
    def __init__(self, driver, timeout: int = 20):
        self.driver = driver
        self.wait = WebDriverWait(driver, timeout)
    
    def element_visible(self, selector: str, by: str = By.CSS_SELECTOR):
        """等待元素可见"""
        return self.wait.until(
            EC.visibility_of_element_located((by, selector))
        )
    
    def element_clickable(self, selector: str, by: str = By.CSS_SELECTOR):
        """等待元素可点击"""
        return self.wait.until(
            EC.element_to_be_clickable((by, selector))
        )
    
    def text_present(self, text: str):
        """等待文本出现"""
        return self.wait.until(
            EC.text_to_be_present_in_element((By.TAG_NAME, "body"), text)
        )
    
    def page_loaded(self):
        """等待页面加载完成"""
        return self.wait.until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )
```

### 5. 元素操作封装
```python
# SeleniumBase 元素操作
class ElementActions:
    """元素操作封装"""
    
    def __init__(self, driver):
        self.driver = driver
    
    def hover(self, selector: str):
        """悬停"""
        from selenium.webdriver.common.action_chains import ActionChains
        
        element = self.driver.find_element(By.CSS_SELECTOR, selector)
        ActionChains(self.driver).move_to_element(element).perform()
    
    def drag_and_drop(self, source: str, target: str):
        """拖拽"""
        from selenium.webdriver.common.action_chains import ActionChains
        
        src = self.driver.find_element(By.CSS_SELECTOR, source)
        dst = self.driver.find_element(By.CSS_SELECTOR, target)
        
        ActionChains(self.driver).drag_and_drop(src, dst).perform()
    
    def scroll_to_element(self, selector: str):
        """滚动到元素"""
        element = self.driver.find_element(By.CSS_SELECTOR, selector)
        self.driver.execute_script("arguments[0].scrollIntoView(true);", element)
    
    def execute_script(self, script: str, *args):
        """执行 JavaScript"""
        return self.driver.execute_script(script, *args)
    
    def take_screenshot(self, path: str):
        """截图"""
        self.driver.save_screenshot(path)
```

### 6. 反检测最佳实践
```python
# SeleniumBase 反检测配置
class AntiDetection:
    """反检测最佳实践"""
    
    @staticmethod
    def patch_navigator(driver):
        """修改 navigator 对象"""
        driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
            "source": """
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [
                        { name: 'Chrome PDF Plugin' },
                        { name: 'Chrome PDF Viewer' },
                        { name: 'Native Client' }
                    ]
                });
                
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['zh-CN', 'zh', 'en-US', 'en']
                });
                
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
                );
            """
        })
    
    @staticmethod
    def randomize_viewport(driver):
        """随机化视口"""
        widths = [1920, 1366, 1536, 1440]
        heights = [1080, 768, 900, 810]
        
        import random
        width = random.choice(widths)
        height = random.choice(heights)
        
        driver.set_window_size(width, height)
    
    @staticmethod
    def human_behavior(driver):
        """模拟人类行为"""
        import random
        import time
        
        # 随机延迟
        time.sleep(random.uniform(0.5, 2.0))
        
        # 随机滚动
        for _ in range(random.randint(1, 3)):
            scroll_amount = random.randint(100, 500)
            driver.execute_script(f"window.scrollBy(0, {scroll_amount})")
            time.sleep(random.uniform(0.3, 0.8))
```

## 集成到项目

### 在 crawler/ 中创建 seleniumbase_adapter.py

```python
# src/crawler/adapters/seleniumbase_adapter.py
"""SeleniumBase UC Mode 集成适配器"""
import time
import random
from typing import Optional, Callable
from dataclasses import dataclass
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import undetected_chromedriver as uc

@dataclass
class SeleniumBaseConfig:
    headless: bool = True
    user_data_dir: Optional[str] = None
    proxy: Optional[str] = None
    uc_mode: bool = True
    cdp_mode: bool = False
    timeout: int = 20
    page_load_timeout: int = 30

class SeleniumBaseAdapter:
    """SeleniumBase UC Mode 适配器"""
    
    def __init__(self, config: SeleniumBaseConfig = None):
        self.config = config or SeleniumBaseConfig()
        self.driver = None
        self.wait = None
    
    def __enter__(self):
        self.connect()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
    
    def connect(self):
        """连接到浏览器"""
        if self.config.uc_mode:
            self.driver = self._create_uc_driver()
        else:
            self.driver = self._create_selenium_driver()
        
        self.driver.set_page_load_timeout(self.config.page_load_timeout)
        self.wait = WebDriverWait(self.driver, self.config.timeout)
        
        # 应用反检测
        self._apply_anti_detection()
    
    def _create_uc_driver(self):
        """创建 UC 驱动"""
        options = uc.ChromeOptions()
        
        if self.config.headless:
            options.add_argument("--headless=new")
        
        if self.config.proxy:
            options.add_argument(f"--proxy-server={self.config.proxy}")
        
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--no-sandbox")
        
        driver = uc.Chrome(options=options, version_main=None)
        return driver
    
    def _create_selenium_driver(self):
        """创建标准 Selenium 驱动"""
        options = Options()
        
        if self.config.headless:
            options.add_argument("--headless=new")
        
        if self.config.proxy:
            options.add_argument(f"--proxy-server={self.config.proxy}")
        
        options.add_argument("--disable-blink-features=AutomationControlled")
        
        service = Service()
        driver = webdriver.Chrome(service=service, options=options)
        return driver
    
    def _apply_anti_detection(self):
        """应用反检测措施"""
        self.driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
            "source": """
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });
            """
        })
    
    def goto(self, url: str, wait_until: str = "load"):
        """导航到 URL"""
        self.driver.get(url)
        
        if wait_until == "load":
            self.wait.until(lambda d: d.execute_script("return document.readyState") == "complete")
        elif wait_until == "domcontentloaded":
            self.wait.until(lambda d: d.execute_script("return document.readyState") == "interactive")
    
    def find_element(self, selector: str, by: str = By.CSS_SELECTOR):
        """查找单个元素"""
        return self.driver.find_element(by, selector)
    
    def find_elements(self, selector: str, by: str = By.CSS_SELECTOR):
        """查找所有匹配元素"""
        return self.driver.find_elements(by, selector)
    
    def wait_for_element(self, selector: str, by: str = By.CSS_SELECTOR, state: str = "visible"):
        """等待元素"""
        if state == "visible":
            return self.wait.until(EC.visibility_of_element_located((by, selector)))
        elif state == "clickable":
            return self.wait.until(EC.element_to_be_clickable((by, selector)))
        elif state == "present":
            return self.wait.until(EC.presence_of_element_located((by, selector)))
    
    def click(self, selector: str):
        """点击元素"""
        element = self.wait_for_element(selector, state="clickable")
        element.click()
    
    def type(self, selector: str, text: str, clear_first: bool = True):
        """输入文本"""
        element = self.wait_for_element(selector)
        if clear_first:
            element.clear()
        element.send_keys(text)
    
    def scroll_to(self, selector: str = None, y: int = None):
        """滚动"""
        if selector:
            element = self.find_element(selector)
            self.driver.execute_script("arguments[0].scrollIntoView(true);", element)
        elif y is not None:
            self.driver.execute_script(f"window.scrollTo(0, {y})")
        else:
            self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
    
    def execute_script(self, script: str, *args):
        """执行 JavaScript"""
        return self.driver.execute_script(script, *args)
    
    def get_cookies(self):
        """获取 cookies"""
        return self.driver.get_cookies()
    
    def add_cookies(self, cookies: list):
        """添加 cookies"""
        for cookie in cookies:
            self.driver.add_cookie(cookie)
    
    def screenshot(self, path: str):
        """截图"""
        self.driver.save_screenshot(path)
    
    def close(self):
        """关闭浏览器"""
        if self.driver:
            self.driver.quit()
            self.driver = None
    
    # CDP 操作
    def activate_cdp(self):
        """激活 CDP 模式"""
        self.cdp_enabled = True
    
    def cdp_execute(self, cmd: str, params: dict = None):
        """执行 CDP 命令"""
        if hasattr(self.driver, 'execute_cdp_cmd'):
            return self.driver.execute_cdp_cmd(cmd, params or {})
        return None
    
    def block_urls(self, patterns: list):
        """阻止特定 URL"""
        self.cdp_execute("Fetch.enable", {})
        
        def handler(params):
            request_id = params.get("requestId")
            url = params.get("request", {}).get("url", "")
            
            for pattern in patterns:
                if pattern in url:
                    self.cdp_execute("Fetch.failRequest", {
                        "requestId": request_id,
                        "errorReason": "Failed"
                    })
                    return
        
        self.driver.on_request_paused = handler
```

### 使用示例

```python
# examples/amazon_scraper.py
"""使用 SeleniumBase UC Mode 爬取 Amazon"""
from src.crawler.adapters.seleniumbase_adapter import SeleniumBaseAdapter, SeleniumBaseConfig
import time
import random

class AmazonScraper:
    """Amazon 爬虫"""
    
    def __init__(self):
        self.config = SeleniumBaseConfig(
            headless=True,
            uc_mode=True,
            timeout=20
        )
        self.adapter = SeleniumBaseAdapter(self.config)
    
    def search(self, keyword: str) -> list:
        """搜索商品"""
        results = []
        
        with self.adapter as driver:
            # 访问搜索页面
            url = f"https://www.amazon.com/s?k={keyword.replace(' ', '+')}"
            driver.goto(url, wait_until="domcontentloaded")
            
            # 模拟人类行为
            time.sleep(random.uniform(1, 2))
            driver.scroll_to(y=500)
            time.sleep(random.uniform(0.5, 1))
            
            # 提取商品
            items = driver.find_elements(".s-result-item")
            
            for item in items[:10]:
                try:
                    title = item.find_element(By.CSS_SELECTOR, "h2 a span").text
                    price = item.find_element(By.CSS_SELECTOR, ".a-price-whole").text
                    results.append({"title": title, "price": price})
                except:
                    continue
        
        return results

if __name__ == "__main__":
    scraper = AmazonScraper()
    products = scraper.search("laptop")
    print(f"找到 {len(products)} 个商品")
```

## 优势对比

| 特性 | 标准 Selenium | SeleniumBase UC Mode |
|------|-------------|---------------------|
| 反检测 | ❌ 容易被识别 | ✅ 模拟真实浏览器 |
| 速度 | 慢 | 中等 |
| 稳定性 | 一般 | 高 |
| 维护成本 | 低 | 中（版本同步）|

## 使用场景

1. **反检测爬虫**：需要绕过 Cloudflare、Distil Networks 等
2. **大规模爬取**：需要多个浏览器实例
3. **自动化测试**：需要可靠的浏览器自动化
4. **复杂交互**：需要拖拽、悬停等操作
