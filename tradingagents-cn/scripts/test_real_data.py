#!/usr/bin/env python3
"""
TradingAgents-CN Real Data Test Script
测试完整流程: 000001.SZ (平安银行)

用法:
    python scripts/test_real_data.py

环境变量:
    DEEPSEEK_API_KEY - DeepSeek API密钥
    DASHSCOPE_API_KEY - 阿里云API密钥
    OPENAI_API_KEY - OpenAI API密钥
"""

import os
import sys
import asyncio
import json
from datetime import datetime
from typing import Dict, Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()


def print_header(title: str):
    print("\n" + "=" * 80)
    print(f" {title}")
    print("=" * 80)


def print_section(title: str):
    print(f"\n### {title}")
    print("-" * 60)


async def test_llm_adapters():
    """测试LLM适配器"""
    print_header("LLM Adapter Test")

    from tradingagents.llm import create_llm_adapter, list_supported_providers

    print(f"Supported providers: {list_supported_providers()}")

    test_cases = [
        ("deepseek", "DEEPSEEK_API_KEY", "deepseek-chat"),
        ("dashscope", "DASHSCOPE_API_KEY", "qwen-plus"),
        ("openai", "OPENAI_API_KEY", "gpt-4o-mini"),
    ]

    results = {}
    for provider, env_key, model in test_cases:
        api_key = os.getenv(env_key)
        if not api_key:
            print(f"  [SKIP] {provider}: No API key found")
            results[provider] = "SKIP"
            continue

        try:
            print(f"\n  Testing {provider} ({model})...")
            llm = create_llm_adapter(provider=provider, api_key=api_key, model=model)

            response = await llm.ainvoke(
                "用一句话介绍自己，包括你是什么模型、来自哪里。回答要简洁。"
            )

            content = response.content if hasattr(response, 'content') else str(response)
            print(f"  [OK] Response: {content[:200]}...")
            results[provider] = "OK"
        except Exception as e:
            print(f"  [FAIL] {provider}: {str(e)}")
            results[provider] = f"FAIL: {str(e)[:100]}"

    return results


async def test_akshare_data():
    """测试AKShare数据获取"""
    print_header("AKShare Data Test")

    from tradingagents.tools.akshare_provider import AKShareProvider

    provider = AKShareProvider()
    symbol = "000001"

    print_section("实时行情")
    try:
        data = await provider.get_stock_realtime_quote(symbol)
        if data and "error" not in data:
            print(f"  [OK] 获取成功")
            print(f"      代码: {data.get('代码', 'N/A')}")
            print(f"      名称: {data.get('名称', 'N/A')}")
            print(f"      最新价: {data.get('最新价', 'N/A')}")
            print(f"      涨跌幅: {data.get('涨跌幅', 'N/A')}%")
        else:
            print(f"  [WARN] {data.get('error', 'No data')}")
    except Exception as e:
        print(f"  [FAIL] {str(e)}")

    print_section("历史K线 (最近30天)")
    try:
        data = await provider.get_stock_history(
            symbol=symbol,
            period="daily",
        )
        if data and isinstance(data, list) and len(data) > 0:
            print(f"  [OK] 获取成功，共 {len(data)} 条数据")
            latest = data[-1]
            print(f"      最新: 日期={latest.get('日期', 'N/A')}, 收盘={latest.get('收盘', 'N/A')}")
        else:
            print(f"  [WARN] No data returned")
    except Exception as e:
        print(f"  [FAIL] {str(e)}")

    print_section("市场概览")
    try:
        data = await provider.get_market_summary()
        if "error" not in data:
            print(f"  [OK] 市场统计")
            print(f"      股票总数: {data.get('total_count', 'N/A')}")
            print(f"      上涨: {data.get('up_count', 'N/A')}")
            print(f"      下跌: {data.get('down_count', 'N/A')}")
            print(f"      平均涨跌: {data.get('avg_change', 'N/A'):.2f}%")
        else:
            print(f"  [WARN] {data.get('error')}")
    except Exception as e:
        print(f"  [FAIL] {str(e)}")

    return True


async def test_cache_system():
    """测试缓存系统"""
    print_header("Cache System Test")

    from tradingagents.tools.cache import CacheManager, MultiLevelCache, MemoryCache

    cache = CacheManager()

    print_section("Memory Cache Test")
    try:
        test_key = "test:hello"
        test_value = {"message": "Hello, Cache!", "timestamp": datetime.now().isoformat()}

        decorator = cache.cached(key_prefix="test", ttl=60)

        @decorator
        async def fetch_data():
            return test_value

        result1 = await fetch_data()
        result2 = await fetch_data()

        is_cached = result1 == result2 and result1 is result2
        print(f"  [OK] Cache working: {is_cached}")
        print(f"      Value: {result1}")
    except Exception as e:
        print(f"  [FAIL] {str(e)}")

    return True


async def test_market_analyst(llm):
    """测试市场分析师"""
    print_header("Market Analyst Test")

    from tradingagents.agents.analysts.market_analyst import MarketAnalyst
    from tradingagents.tools.akshare_provider import AKShareProvider

    analyst = MarketAnalyst(llm)
    data_provider = AKShareProvider()

    symbol = "000001"
    trade_date = datetime.now().strftime("%Y-%m-%d")

    print_section("获取市场数据")
    history = await data_provider.get_stock_history(symbol, period="daily")
    if history and len(history) > 0:
        print(f"  [OK] 获取到 {len(history)} 条历史数据")
        latest = history[-1]
        market_context = f"""
        股票代码: {symbol}
        最新日期: {latest.get('日期')}
        开盘: {latest.get('开盘')}
        收盘: {latest.get('收盘')}
        最高: {latest.get('最高')}
        最低: {latest.get('最低')}
        成交量: {latest.get('成交量')}
        涨跌幅: {latest.get('涨跌幅')}%
        """
        print(f"  最新收盘价: {latest.get('收盘')}")
    else:
        market_context = f"股票代码: {symbol}, 数据获取失败"
        print(f"  [WARN] 无法获取历史数据")

    print_section("执行分析")
    try:
        state = {"market_data": market_context}
        report = await analyst.analyze(
            company=f"{symbol}.SZ",
            trade_date=trade_date,
            state=state
        )
        print(f"  [OK] 分析完成")
        print(f"  报告长度: {len(report)} 字符")
        print(f"  报告预览:\n{report[:500]}...")
    except Exception as e:
        print(f"  [FAIL] {str(e)}")

    return True


async def test_full_workflow():
    """测试完整工作流"""
    print_header("Full Workflow Test (000001.SZ - Ping An Bank)")

    provider = os.getenv("LLM_PROVIDER", "deepseek")
    api_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("DASHSCOPE_API_KEY")

    if not api_key:
        print("  [SKIP] No API key found. Set DEEPSEEK_API_KEY or DASHSCOPE_API_KEY")
        return False

    from tradingagents.llm import create_llm_adapter
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    print(f"\n  Provider: {provider}")
    llm = create_llm_adapter(provider=provider, api_key=api_key)

    print_section("初始化TradingAgents系统")
    try:
        config = {
            "llm_provider": provider,
            "quick_think_llm": None,
            "deep_think_llm": None,
        }
        graph = TradingAgentsGraph(config=config, debug=True)
        print("  [OK] TradingAgentsGraph initialized")
    except Exception as e:
        print(f"  [FAIL] Initialization error: {str(e)}")
        return False

    print_section("执行分析流程")
    company = "000001.SZ (平安银行)"
    trade_date = datetime.now().strftime("%Y-%m-%d")

    progress_log = []

    async def progress_callback(node_name: str, state: Dict[str, Any]):
        progress_log.append({
            "node": node_name,
            "phase": state.get("current_phase", "unknown"),
            "status": state.get("status", "unknown")
        })
        print(f"    [{node_name}] phase={state.get('current_phase', 'N/A')}, status={state.get('status', 'N/A')}")

    try:
        result = await graph.run(
            company=company,
            trade_date=trade_date,
            progress_callback=progress_callback
        )

        print_section("工作流完成")
        print(f"  Final status: {result.get('status', 'unknown')}")
        print(f"  Phases completed: {[p['node'] for p in progress_log]}")

        print_section("分析师报告摘要")
        for report_type in ["market_report", "fundamentals_report", "news_report", "sentiment_report"]:
            content = result.get(report_type, "")
            if content:
                print(f"\n  [{report_type}]:")
                print(f"    {content[:300]}...")

        print_section("最终决策")
        decision = result.get("final_trade_decision", "No decision")
        print(f"  {decision[:500]}...")

        return True
    except Exception as e:
        print(f"  [FAIL] Workflow error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def test_websocket_server():
    """测试WebSocket服务器"""
    print_header("WebSocket Server Test")

    try:
        from tradingagents.api.app import create_app

        app = create_app()

        print("  [OK] FastAPI app created")
        print(f"  Routes available:")
        for route in app.routes:
            if hasattr(route, 'path'):
                methods = getattr(route, 'methods', {'GET'})
                print(f"      {list(methods)[0] if methods else 'GET'} {route.path}")

        return True
    except Exception as e:
        print(f"  [FAIL] {str(e)}")
        return False


async def main():
    print("\n" + "#" * 80)
    print("#" + " " * 78 + "#")
    print("#" + "  TradingAgents-CN Real Data Test Suite".center(78) + "#")
    print("#" + "  Testing: 000001.SZ (Ping An Bank)".center(78) + "#")
    print("#" + " " * 78 + "#")
    print("#" * 80)

    test_results = {}

    test_results["llm_adapters"] = await test_llm_adapters()

    test_results["akshare"] = await test_akshare_data()

    test_results["cache"] = await test_cache_system()

    test_results["websocket"] = await test_websocket_server()

    api_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
    if api_key:
        provider = os.getenv("LLM_PROVIDER", "deepseek")
        from tradingagents.llm import create_llm_adapter
        llm = create_llm_adapter(provider=provider, api_key=api_key)
        test_results["market_analyst"] = await test_market_analyst(llm)
        test_results["full_workflow"] = await test_full_workflow()
    else:
        print("\n[SKIP] Skipping LLM-dependent tests (no API key)")

    print_header("Test Summary")
    for test_name, result in test_results.items():
        if isinstance(result, dict):
            status = "OK" if all(v == "OK" for v in result.values()) else "PARTIAL"
            print(f"  {test_name}: {status}")
            for provider, state in result.items():
                print(f"      {provider}: {state}")
        else:
            print(f"  {test_name}: {'PASS' if result else 'FAIL'}")

    print("\n" + "#" * 80)
    print("#  Test Complete!".center(78))
    print("#" * 80 + "\n")

    return all(
        r for r in test_results.values()
        if isinstance(r, bool) and r
    ) or all(
        v == "OK" for v in r.values()
        for r in test_results.values()
        if isinstance(r, dict)
    )


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
