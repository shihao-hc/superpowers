"""
SeleniumBase UC Mode Adapter - 反检测浏览器自动化
绕过 Cloudflare、Distil Networks 等反爬机制
"""

from __future__ import annotations
import time
import random
from typing import Optional, Callable, List, TYPE_CHECKING
from dataclasses import dataclass

if TYPE_CHECKING:
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

from .base import BaseScraper
from .result import normalize_result
from ..types import CrawlResult, CrawlerStrategy
from ..config import CrawlerConfig
from ..exceptions import ScraperError


@dataclass
class UCConfig:
    headless: bool = True
    user_data_dir: Optional[str] = None
    proxy: Optional[str] = None
    timeout: int = 20
    page_load_timeout: int = 30
    window_size: tuple = (1920, 1080)


class StealthBrowser:
    """隐身浏览器 - UC Mode 实现"""

    def __init__(self, config: UCConfig = None):
        self.config = config or UCConfig()
        self.driver = None
        self.wait = None

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def _create_uc_driver(self):
        """创建 undetected-chromedriver"""
        try:
            import undetected_chromedriver as uc

            options = uc.ChromeOptions()

            if self.config.headless:
                options.add_argument("--headless=new")

            if self.config.proxy:
                options.add_argument(f"--proxy-server={self.config.proxy}")

            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--no-sandbox")
            options.add_argument(
                f"--window-size={self.config.window_size[0]},{self.config.window_size[1]}"
            )

            driver = uc.Chrome(options=options, version_main=None)
            return driver
        except ImportError:
            return self._create_selenium_driver()

    def _create_selenium_driver(self):
        """创建标准 Selenium 驱动（备用）"""
        from selenium.webdriver.chrome.service import Service
        from selenium.webdriver.chrome.options import Options
        from selenium import webdriver

        options = Options()

        if self.config.headless:
            options.add_argument("--headless=new")

        if self.config.proxy:
            options.add_argument(f"--proxy-server={self.config.proxy}")

        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument(
            f"--window-size={self.config.window_size[0]},{self.config.window_size[1]}"
        )

        service = Service()
        driver = webdriver.Chrome(service=service, options=options)
        return driver

    def connect(self):
        """连接到浏览器"""
        from selenium.webdriver.support.ui import WebDriverWait

        self.driver = self._create_uc_driver()
        self.driver.set_page_load_timeout(self.config.page_load_timeout)
        self.wait = WebDriverWait(self.driver, self.config.timeout)

        self._apply_anti_detection()
        self._randomize_viewport()

    def _apply_anti_detection(self):
        """应用反检测脚本"""
        self.driver.execute_cdp_cmd(
            "Page.addScriptToEvaluateOnNewDocument",
            {
                "source": """
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });
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
            """
            },
        )

    def _randomize_viewport(self):
        """随机化视口大小"""
        widths = [1920, 1366, 1536, 1440, 1280]
        heights = [1080, 768, 900, 810, 720]
        w = random.choice(widths)
        h = random.choice(heights)
        self.driver.set_window_size(w, h)

    def goto(self, url: str, wait_until: str = "load"):
        """导航到 URL"""
        self.driver.get(url)

        if wait_until == "load":
            self.wait.until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
        elif wait_until == "domcontentloaded":
            self.wait.until(
                lambda d: d.execute_script("return document.readyState")
                == "interactive"
            )

    def find_element(self, selector: str, by: str = "css selector"):
        """查找单个元素"""
        from selenium.webdriver.common.by import By

        return self.driver.find_element(
            By.CSS_SELECTOR if by == "css selector" else by, selector
        )

    def find_elements(self, selector: str, by: str = "css selector") -> List:
        """查找所有匹配元素"""
        from selenium.webdriver.common.by import By

        return self.driver.find_elements(
            By.CSS_SELECTOR if by == "css selector" else by, selector
        )

    def wait_for_element(
        self, selector: str, by: str = "css selector", state: str = "visible"
    ):
        """等待元素状态"""
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support import expected_conditions as EC

        by_val = By.CSS_SELECTOR if by == "css selector" else by
        if state == "visible":
            return self.wait.until(EC.visibility_of_element_located((by_val, selector)))
        elif state == "clickable":
            return self.wait.until(EC.element_to_be_clickable((by_val, selector)))
        elif state == "present":
            return self.wait.until(EC.presence_of_element_located((by_val, selector)))

    def click(self, selector: str, by: str = "css selector"):
        """点击元素"""
        element = self.wait_for_element(selector, by, "clickable")
        element.click()

    def type(
        self,
        selector: str,
        text: str,
        by: str = "css selector",
        clear_first: bool = True,
    ):
        """输入文本"""
        element = self.wait_for_element(selector, by)
        if clear_first:
            element.clear()
        element.send_keys(text)

    def scroll_to(self, selector: str = None, y: int = None):
        """滚动页面"""
        if selector:
            element = self.find_element(selector)
            self.driver.execute_script("arguments[0].scrollIntoView(true);", element)
        elif y is not None:
            self.driver.execute_script(f"window.scrollTo(0, {y})")
        else:
            self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")

    def human_scroll(self, times: int = 3):
        """模拟人类滚动"""
        for _ in range(times):
            scroll_amount = random.randint(200, 600)
            self.driver.execute_script(f"window.scrollBy(0, {scroll_amount})")
            time.sleep(random.uniform(0.3, 0.8))

    def execute_script(self, script: str, *args):
        """执行 JavaScript"""
        return self.driver.execute_script(script, *args)

    def get_cookies(self):
        """获取 cookies"""
        return self.driver.get_cookies()

    def add_cookies(self, cookies: List[dict]):
        """添加 cookies"""
        for cookie in cookies:
            self.driver.add_cookie(cookie)

    def screenshot(self, path: str):
        """截图"""
        self.driver.save_screenshot(path)

    def get_page_source(self) -> str:
        """获取页面源码"""
        return self.driver.page_source

    def get_title(self) -> str:
        """获取页面标题"""
        return self.driver.title

    def get_current_url(self) -> str:
        """获取当前 URL"""
        return self.driver.current_url

    def close(self):
        """关闭浏览器"""
        if self.driver:
            self.driver.quit()
            self.driver = None


class SeleniumBaseScraper(BaseScraper):
    """基于 SeleniumBase UC Mode 的爬虫"""

    def __init__(self, config: CrawlerConfig = None):
        super().__init__(config)
        self.browser = None

    def supports(self, url: str) -> bool:
        return url.startswith("http")

    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        timeout = kwargs.get("timeout", self.config.default_timeout)
        wait_until = kwargs.get("wait_until", "load")
        proxy = kwargs.get("proxy")

        uc_config = UCConfig(
            headless=True, proxy=proxy, timeout=timeout, page_load_timeout=timeout
        )

        try:
            self.browser = StealthBrowser(uc_config)
            self.browser.connect()

            self.browser.goto(url, wait_until=wait_until)

            content = self.browser.get_page_source()
            title = self.browser.get_title()
            final_url = self.browser.get_current_url()

            self.browser.close()

            return normalize_result(
                content=content or "",
                strategy=CrawlerStrategy.SELENIUM_BASE,
                metadata={"url": final_url, "title": title, "original_url": url},
            )
        except ImportError as e:
            return normalize_result(
                content="",
                strategy=CrawlerStrategy.SELENIUM_BASE,
                metadata={"error": str(e), "url": url},
                success=False,
            )
        except Exception as e:
            if self.browser:
                self.browser.close()
            raise ScraperError(f"SeleniumBase failed for {url}: {e}") from e


adapter = SeleniumBaseScraper()
