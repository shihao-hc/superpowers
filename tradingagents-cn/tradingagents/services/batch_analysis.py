"""
Batch Analysis Service - 批量分析服务

支持 CSV/JSON 批量提交，后台异步执行，结果汇总
"""

import asyncio
import json
import csv
import io
from typing import Dict, Any, Optional, List
from datetime import datetime
from enum import Enum
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor


class BatchStatus(str, Enum):
    """批量任务状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"  # 部分成功


@dataclass
class BatchTask:
    """批量任务"""
    batch_id: str
    stocks: List[str]
    status: BatchStatus
    created_at: str
    completed_at: Optional[str] = None
    total_count: int = 0
    success_count: int = 0
    failed_count: int = 0
    results: Optional[List[Dict]] = None
    errors: Optional[List[Dict]] = None


@dataclass
class StockAnalysisResult:
    """单只股票分析结果"""
    symbol: str
    status: str  # "success", "failed"
    verdict: Optional[str] = None
    summary: Optional[str] = None
    error: Optional[str] = None


class BatchAnalysisService:
    """
    批量分析服务
    
    支持：
    - CSV/JSON 批量提交
    - 后台异步执行
    - 结果汇总报表
    - 进度跟踪
    """

    def __init__(self):
        self.tasks: Dict[str, BatchTask] = {}
        self._executor = ThreadPoolExecutor(max_workers=4)

    def parse_input(
        self,
        content: str,
        format: str = "csv"
    ) -> List[str]:
        """
        解析批量输入
        
        Args:
            content: 文件内容
            format: 格式 (csv/json)
            
        Returns:
            List[str]: 股票代码列表
        """
        if format == "csv":
            return self._parse_csv(content)
        elif format == "json":
            return self._parse_json(content)
        else:
            raise ValueError(f"Unsupported format: {format}")

    def _parse_csv(self, content: str) -> List[str]:
        """解析CSV格式"""
        stocks = []
        reader = csv.reader(io.StringIO(content))
        for i, row in enumerate(reader):
            if i == 0 and row[0].lower() in ['symbol', '股票代码', 'code']:
                continue
            if row and row[0].strip():
                stocks.append(row[0].strip().upper())
        return list(set(stocks))[:100]  # 最多100只

    def _parse_json(self, content: str) -> List[str]:
        """解析JSON格式"""
        try:
            data = json.loads(content)
            if isinstance(data, list):
                stocks = [s if isinstance(s, str) else s.get("symbol", s.get("code", "")) 
                         for s in data]
            elif isinstance(data, dict):
                stocks = data.get("stocks", data.get("symbols", []))
            else:
                stocks = []
            return list(set(stocks))[:100]
        except json.JSONDecodeError:
            raise ValueError("Invalid JSON format")

    def create_batch(
        self,
        batch_id: str,
        stocks: List[str]
    ) -> BatchTask:
        """
        创建批量任务
        
        Args:
            batch_id: 批次ID
            stocks: 股票代码列表
            
        Returns:
            BatchTask: 批量任务
        """
        task = BatchTask(
            batch_id=batch_id,
            stocks=stocks,
            status=BatchStatus.PENDING,
            created_at=datetime.now().isoformat(),
            total_count=len(stocks),
            results=[],
            errors=[]
        )
        self.tasks[batch_id] = task
        return task

    async def run_batch(
        self,
        batch_id: str,
        max_concurrent: int = 3
    ) -> BatchTask:
        """
        执行批量分析
        
        Args:
            batch_id: 批次ID
            max_concurrent: 最大并发数
            
        Returns:
            BatchTask: 更新后的任务
        """
        if batch_id not in self.tasks:
            raise ValueError(f"Batch task not found: {batch_id}")

        task = self.tasks[batch_id]
        task.status = BatchStatus.RUNNING

        semaphore = asyncio.Semaphore(max_concurrent)

        async def analyze_single(symbol: str) -> StockAnalysisResult:
            async with semaphore:
                try:
                    result = await self._analyze_stock(symbol)
                    return result
                except Exception as e:
                    return StockAnalysisResult(
                        symbol=symbol,
                        status="failed",
                        error=str(e)
                    )

        results = await asyncio.gather(
            *[analyze_single(s) for s in task.stocks],
            return_exceptions=True
        )

        for result in results:
            if isinstance(result, Exception):
                task.errors.append({
                    "error": str(result),
                    "timestamp": datetime.now().isoformat()
                })
                task.failed_count += 1
            elif isinstance(result, StockAnalysisResult):
                if result.status == "success":
                    task.results.append({
                        "symbol": result.symbol,
                        "verdict": result.verdict,
                        "summary": result.summary
                    })
                    task.success_count += 1
                else:
                    task.errors.append({
                        "symbol": result.symbol,
                        "error": result.error
                    })
                    task.failed_count += 1

        task.completed_at = datetime.now().isoformat()
        if task.failed_count > 0 and task.success_count > 0:
            task.status = BatchStatus.PARTIAL
        elif task.failed_count == task.total_count:
            task.status = BatchStatus.FAILED
        else:
            task.status = BatchStatus.COMPLETED

        return task

    async def _analyze_stock(self, symbol: str) -> StockAnalysisResult:
        """
        分析单只股票 (需要接入实际的 TradingAgentsGraph)
        
        Args:
            symbol: 股票代码
            
        Returns:
            StockAnalysisResult: 分析结果
        """
        from ..graph.trading_graph import TradingAgentsGraph
        import os

        provider = os.getenv("LLM_PROVIDER", "deepseek")
        api_key = os.getenv(f"{provider.upper()}_API_KEY")

        if not api_key:
            return StockAnalysisResult(
                symbol=symbol,
                status="failed",
                error="No API key configured"
            )

        config = {"llm_provider": provider}
        graph = TradingAgentsGraph(config=config, debug=False)

        result = await graph.run(company=symbol)

        verdict = result.get("investment_plan", "")[:500] if result.get("investment_plan") else ""

        return StockAnalysisResult(
            symbol=symbol,
            status="success",
            verdict=verdict,
            summary=self._generate_summary(result)
        )

    def _generate_summary(self, result: Dict) -> str:
        """生成分析摘要"""
        reports = result.get("analyst_reports", {})
        if not reports:
            return "No analysis data"

        summaries = []
        for name, report in reports.items():
            if isinstance(report, dict) and "report" in report:
                summaries.append(f"{name}: {report['report'][:100]}...")

        return " | ".join(summaries[:3])

    def get_task(self, batch_id: str) -> Optional[BatchTask]:
        """获取批量任务"""
        return self.tasks.get(batch_id)

    def get_task_progress(self, batch_id: str) -> Dict[str, Any]:
        """获取任务进度"""
        task = self.tasks.get(batch_id)
        if not task:
            return {"status": "not_found"}

        processed = task.success_count + task.failed_count
        progress = processed / task.total_count if task.total_count > 0 else 0

        return {
            "batch_id": batch_id,
            "status": task.status.value,
            "progress": progress,
            "total": task.total_count,
            "success": task.success_count,
            "failed": task.failed_count,
            "results": task.results[-10:] if task.results else [],
            "errors": task.errors[-5:] if task.errors else []
        }

    def generate_report(self, batch_id: str) -> Dict[str, Any]:
        """
        生成汇总报表
        
        Args:
            batch_id: 批次ID
            
        Returns:
            Dict: 汇总报告
        """
        task = self.tasks.get(batch_id)
        if not task:
            return {"error": "Task not found"}

        recommendations = {
            "BUY": [],
            "SELL": [],
            "HOLD": []
        }

        for result in (task.results or []):
            verdict = result.get("verdict", "").upper()
            if "BUY" in verdict or "买入" in verdict or "增持" in verdict:
                recommendations["BUY"].append(result["symbol"])
            elif "SELL" in verdict or "卖出" in verdict or "减持" in verdict:
                recommendations["SELL"].append(result["symbol"])
            else:
                recommendations["HOLD"].append(result["symbol"])

        return {
            "batch_id": batch_id,
            "generated_at": datetime.now().isoformat(),
            "summary": {
                "total": task.total_count,
                "success": task.success_count,
                "failed": task.failed_count,
                "success_rate": (
                    task.success_count / task.total_count * 100
                    if task.total_count > 0 else 0
                )
            },
            "recommendations": recommendations,
            "top_picks": recommendations["BUY"][:5] if recommendations["BUY"] else [],
            "results": task.results,
            "errors": task.errors
        }


batch_service = BatchAnalysisService()
