"""Node.js Playwright bridge - uses system-installed playwright."""

import asyncio
import json
import subprocess
import tempfile
import os
from typing import Optional, Any
from .base import BaseScraper
from ..types import CrawlResult, CrawlerStrategy
from ..config import CrawlerConfig
from ..exceptions import ScraperError


class NodePlaywrightAdapter(BaseScraper):
    """Adapter using Node.js Playwright (system installed).

    Features:
    - Uses Node.js playwright (already installed in system)
    - JavaScript rendering support
    - Stealth mode
    - Screenshot capability
    """

    def __init__(self, config: Optional[CrawlerConfig] = None):
        super().__init__(config)
        self._script_path = self._create_script()

    def supports(self, url: str) -> bool:
        return True

    def _create_script(self) -> str:
        """Create Node.js script for playwright."""
        script = """
const { chromium } = require('playwright');

async function crawl(url) {
    const browser = await chromium.launch({ 
        headless: true,
        executablePath: 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe',
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const result = {
        success: true,
        url: page.url(),
        title: await page.title(),
        content: await page.evaluate(() => document.body.innerText),
        links: []
    };
    
    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]'))
            .slice(0, 50)
            .map(a => ({ href: a.href, text: a.textContent?.trim() || '' }));
    });
    result.links = links;
    
    const video = await page.evaluate(() => {
        const v = document.querySelector('video');
        return v ? { src: v.src || v.querySelector('source')?.src, poster: v.poster } : null;
    });
    result.video = video;
    
    await browser.close();
    console.log(JSON.stringify(result));
}

const url = process.argv[2];
crawl(url).catch(e => {
    console.error(JSON.stringify({ success: false, error: e.message }));
    process.exit(1);
});
"""
        # Save script to a permanent location (in the project)
        script_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "node_playwright_crawl.js",
        )
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(script)
        return script_path

    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        """Crawl using Node.js Playwright."""
        try:
            options = json.dumps(
                {
                    "waitTime": kwargs.get("wait_time", 2000),
                    "stealth": kwargs.get("stealth", True),
                }
            )

            result = await self._run_node(url, options)
            return self._normalize_result(result, url)

        except Exception as e:
            raise ScraperError(f"Node Playwright failed for {url}: {e}") from e
        finally:
            if os.path.exists(self._script_path):
                os.unlink(self._script_path)

    async def _run_node(self, url: str, options: str) -> dict:
        """Run Node.js script from project root."""
        proc = await asyncio.create_subprocess_exec(
            "node",
            self._script_path,
            url,
            options,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=r"D:\龙虾",  # Run from directory with node_modules
        )

        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)

        if proc.returncode != 0:
            error = stderr.decode("utf-8", errors="replace")
            raise ScraperError(f"Node.js error: {error}")

        return json.loads(stdout.decode("utf-8"))

    def _normalize_result(self, result: dict, url: str) -> CrawlResult:
        """Normalize result."""
        content = result.get("content", "") or ""

        return {
            "success": result.get("success", False),
            "content": content,
            "strategy_used": "node_playwright",
            "metadata": {
                "url": url,
                "final_url": result.get("url"),
                "title": result.get("title"),
                "links_count": len(result.get("links", [])),
                "links": result.get("links", [])[:20],
                "video": result.get("video"),
            },
        }

    async def screenshot(self, url: str, save_path: str = None) -> dict:
        """Take screenshot using Node.js Playwright."""
        script = """
const { chromium } = require('playwright');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(process.argv[2], { waitUntil: 'networkidle' });
    
    const screenshot = await page.screenshot({ 
        fullPage: false,
        type: 'png'
    });
    
    const fs = require('fs');
    fs.writeFileSync(process.argv[3] || 'screenshot.png', screenshot);
    
    await browser.close();
    console.log(JSON.stringify({ success: true, path: process.argv[3] || 'screenshot.png' }));
}

main().catch(e => console.error(JSON.stringify({ success: false, error: e.message })));
"""
        temp_script = tempfile.NamedTemporaryFile(
            mode="w", suffix=".js", delete=False, encoding="utf-8"
        ).name
        with open(temp_script, "w", encoding="utf-8") as f:
            f.write(script)

        try:
            save = save_path or "screenshot.png"
            proc = await asyncio.create_subprocess_exec(
                "node",
                temp_script,
                url,
                save,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=60)
            return json.loads(stdout.decode("utf-8"))
        finally:
            if os.path.exists(temp_script):
                os.unlink(temp_script)
