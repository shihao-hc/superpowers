"""
TradingAgents-CN LLM Performance Benchmark
对比不同 LLM 提供商的性能和吞吐量
"""

import asyncio
import time
import statistics
from typing import Dict, List, Optional
from dataclasses import dataclass
import pytest

from tradingagents.llm.factory import create_llm_adapter


@dataclass
class BenchmarkResult:
    provider: str
    model: str
    total_requests: int
    successful_requests: int
    failed_requests: int
    total_time: float
    requests_per_second: float
    avg_latency: float
    p50_latency: float
    p95_latency: float
    p99_latency: float
    min_latency: float
    max_latency: float


class LLMPerformanceBenchmark:
    """LLM 性能基准测试"""

    def __init__(
        self,
        provider: str,
        model: str,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        prompt: str = "请简要解释什么是人工智能，用中文回答，控制在50字以内。"
    ):
        self.provider = provider
        self.model = model
        self.prompt = prompt
        self.adapter = create_llm_adapter(
            provider=provider,
            model=model,
            api_key=api_key,
            base_url=base_url
        )
        self.latencies: List[float] = []
        self.successful = 0
        self.failed = 0

    async def run_single_request(self) -> float:
        """执行单个请求并返回延迟"""
        start = time.time()
        try:
            await self.adapter.ainvoke(self.prompt)
            latency = time.time() - start
            self.latencies.append(latency)
            self.successful += 1
            return latency
        except Exception as e:
            self.failed += 1
            return -1

    async def run_concurrent_requests(self, num_requests: int, concurrency: int = 5) -> BenchmarkResult:
        """运行并发请求基准测试
        
        Args:
            num_requests: 总请求数
            concurrency: 并发数
        """
        self.latencies = []
        self.successful = 0
        self.failed = 0

        start_time = time.time()

        semaphore = asyncio.Semaphore(concurrency)
        
        async def bounded_request():
            async with semaphore:
                await self.run_single_request()

        tasks = [bounded_request() for _ in range(num_requests)]
        await asyncio.gather(*tasks, return_exceptions=True)

        total_time = time.time() - start_time

        valid_latencies = [l for l in self.latencies if l > 0]

        if not valid_latencies:
            return BenchmarkResult(
                provider=self.provider,
                model=self.model,
                total_requests=num_requests,
                successful_requests=self.successful,
                failed_requests=self.failed,
                total_time=total_time,
                requests_per_second=0,
                avg_latency=0,
                p50_latency=0,
                p95_latency=0,
                p99_latency=0,
                min_latency=0,
                max_latency=0,
            )

        sorted_latencies = sorted(valid_latencies)
        p95_idx = int(len(sorted_latencies) * 0.95)
        p99_idx = int(len(sorted_latencies) * 0.99)

        return BenchmarkResult(
            provider=self.provider,
            model=self.model,
            total_requests=num_requests,
            successful_requests=self.successful,
            failed_requests=self.failed,
            total_time=total_time,
            requests_per_second=self.successful / total_time,
            avg_latency=statistics.mean(valid_latencies),
            p50_latency=statistics.median(valid_latencies),
            p95_latency=sorted_latencies[p95_idx] if p95_idx < len(sorted_latencies) else sorted_latencies[-1],
            p99_latency=sorted_latencies[p99_idx] if p99_idx < len(sorted_latencies) else sorted_latencies[-1],
            min_latency=min(valid_latencies),
            max_latency=max(valid_latencies),
        )

    async def run_streaming_benchmark(self, num_requests: int = 5) -> Dict[str, float]:
        """测试流式输出的吞吐量"""
        total_tokens = 0
        start_time = time.time()

        for _ in range(num_requests):
            token_count = 0
            async for chunk in self.adapter.astream(self.prompt):
                token_count += 1
            total_tokens += token_count

        total_time = time.time() - start_time

        return {
            "total_tokens": total_tokens,
            "total_time": total_time,
            "tokens_per_second": total_tokens / total_time if total_time > 0 else 0,
            "avg_request_time": total_time / num_requests,
        }


def format_result(result: BenchmarkResult) -> str:
    """格式化基准测试结果"""
    return f"""
{'='*60}
{result.provider.upper()} ({result.model}) Benchmark Results
{'='*60}
Total Requests:     {result.total_requests}
Successful:          {result.successful_requests}
Failed:              {result.failed_requests}
Total Time:          {result.total_time:.2f}s
Throughput:          {result.requests_per_second:.2f} req/s

Latency Stats:
  Average:           {result.avg_latency:.3f}s
  Median (P50):      {result.p50_latency:.3f}s
  P95:               {result.p95_latency:.3f}s
  P99:               {result.p99_latency:.3f}s
  Min:               {result.min_latency:.3f}s
  Max:               {result.max_latency:.3f}s
{'='*60}
"""


@pytest.mark.asyncio
async def test_ollama_benchmark():
    """测试 Ollama 性能"""
    provider = "ollama"
    model = "tinyllama"
    base_url = "http://localhost:11434"

    try:
        benchmark = LLMPerformanceBenchmark(
            provider=provider,
            model=model,
            base_url=base_url,
        )
        
        result = await benchmark.run_concurrent_requests(
            num_requests=10,
            concurrency=3
        )
        
        print(format_result(result))
        
        assert result.successful_requests > 0, "No successful requests"
        
    except Exception as e:
        pytest.skip(f"Ollama not available: {e}")


@pytest.mark.asyncio
async def test_vllm_benchmark():
    """测试 vLLM 性能"""
    provider = "vllm"
    model = "meta-llama/Llama-2-7b-chat-hf"
    base_url = "http://localhost:8000/v1"

    try:
        benchmark = LLMPerformanceBenchmark(
            provider=provider,
            model=model,
            base_url=base_url,
        )
        
        result = await benchmark.run_concurrent_requests(
            num_requests=10,
            concurrency=3
        )
        
        print(format_result(result))
        
        assert result.successful_requests > 0, "No successful requests"
        
    except Exception as e:
        pytest.skip(f"vLLM not available: {e}")


@pytest.mark.asyncio
async def test_provider_comparison():
    """对比多个提供商的性能"""
    providers = [
        {"provider": "mock", "model": "mock-model", "base_url": None},
    ]

    results = []
    
    for config in providers:
        try:
            benchmark = LLMPerformanceBenchmark(
                provider=config["provider"],
                model=config["model"],
                base_url=config.get("base_url"),
            )
            
            result = await benchmark.run_concurrent_requests(
                num_requests=5,
                concurrency=2
            )
            results.append(result)
            print(format_result(result))
            
        except Exception as e:
            print(f"Provider {config['provider']} failed: {e}")

    assert len(results) > 0, "No providers available for comparison"


async def run_full_benchmark():
    """运行完整基准测试并生成报告"""
    configs = [
        {"provider": "ollama", "model": "tinyllama", "base_url": "http://localhost:11434"},
    ]

    results: List[BenchmarkResult] = []
    
    print("Starting LLM Performance Benchmark...")
    print("=" * 60)

    for config in configs:
        print(f"\nTesting {config['provider']} ({config['model']})...")
        
        try:
            benchmark = LLMPerformanceBenchmark(
                provider=config["provider"],
                model=config["model"],
                base_url=config.get("base_url"),
            )
            
            result = await benchmark.run_concurrent_requests(
                num_requests=20,
                concurrency=5
            )
            results.append(result)
            print(format_result(result))
            
        except Exception as e:
            print(f"Failed: {e}")

    if len(results) > 1:
        print("\n" + "=" * 60)
        print("COMPARISON SUMMARY")
        print("=" * 60)
        
        for result in sorted(results, key=lambda x: x.avg_latency):
            print(f"{result.provider:15} | "
                  f"RPS: {result.requests_per_second:6.2f} | "
                  f"Avg: {result.avg_latency:6.3f}s | "
                  f"P95: {result.p95_latency:6.3f}s")


if __name__ == "__main__":
    asyncio.run(run_full_benchmark())
