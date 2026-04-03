#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TradingAgents-CN Real Data Test Script
直接调用智能体引擎测试 000001.SZ (平安银行)

用法:
    python test_run.py
"""

import asyncio
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from dotenv import load_dotenv
load_dotenv()

from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.tools.akshare_provider import AKShareProvider


def print_header(title: str):
    print("\n" + "=" * 80)
    print(f" {title}")
    print("=" * 80)


def print_section(title: str):
    print(f"\n### {title}")
    print("-" * 60)


async def get_stock_info(symbol: str = "000001") -> dict:
    """获取股票基本信息"""
    provider = AKShareProvider()
    history = await provider.get_stock_history(symbol, period="daily")
    if history and len(history) > 0:
        latest = history[-1]
        return {
            "symbol": symbol,
            "name": "平安银行",
            "date": latest.get("日期"),
            "open": latest.get("开盘"),
            "close": latest.get("收盘"),
            "high": latest.get("最高"),
            "low": latest.get("最低"),
            "volume": latest.get("成交量"),
            "change_pct": latest.get("涨跌幅"),
        }
    return {}


async def test_analysis():
    """测试完整分析流程"""
    print_header("TradingAgents-CN Real Data Test")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Provider: {os.getenv('LLM_PROVIDER', 'deepseek')}")

    print_section("1. 获取股票数据")
    stock_info = await get_stock_info("000001")
    if stock_info:
        print(f"  股票代码: {stock_info['symbol']}.SZ")
        print(f"  股票名称: {stock_info['name']}")
        print(f"  日期: {stock_info['date']}")
        print(f"  开盘: ¥{stock_info['open']}")
        print(f"  收盘: ¥{stock_info['close']}")
        print(f"  最高: ¥{stock_info['high']}")
        print(f"  最低: ¥{stock_info['low']}")
        print(f"  涨跌幅: {stock_info['change_pct']}%")
    else:
        print("  [WARN] 无法获取股票数据")

    print_section("2. 初始化智能体引擎")
    api_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
    provider = os.getenv("LLM_PROVIDER", "deepseek")

    if not api_key:
        print("  [ERROR] 未配置 API 密钥!")
        print("  请设置以下环境变量之一:")
        print("    - DEEPSEEK_API_KEY")
        print("    - DASHSCOPE_API_KEY")
        print("    - OPENAI_API_KEY")
        return

    print(f"  LLM Provider: {provider}")
    print(f"  API Key: {api_key[:10]}...")

    try:
        graph = TradingAgentsGraph(debug=True)
        print("  [OK] TradingAgentsGraph initialized")
    except Exception as e:
        print(f"  [ERROR] 初始化失败: {e}")
        return

    print_section("3. 执行工作流")
    initial_state = {
        "company_of_interest": "000001.SZ (平安银行)",
        "trade_date": datetime.now().strftime("%Y-%m-%d"),
        "sender": "test_user",
    }

    try:
        final_state = await graph.run(
            company="000001.SZ (平安银行)",
            trade_date=datetime.now().strftime("%Y-%m-%d"),
        )
    except Exception as e:
        print(f"  [ERROR] 工作流执行失败: {e}")
        import traceback
        traceback.print_exc()
        return

    print_section("4. 分析结果")

    print("\n【市场报告】")
    market = final_state.get("market_report", "无")
    print(f"  {market[:800]}..." if len(market) > 800 else f"  {market}")

    print("\n【基本面报告】")
    fundamentals = final_state.get("fundamentals_report", "无")
    print(f"  {fundamentals[:800]}..." if len(fundamentals) > 800 else f"  {fundamentals}")

    print("\n【新闻报告】")
    news = final_state.get("news_report", "无")
    print(f"  {news[:800]}..." if len(news) > 800 else f"  {news}")

    print("\n【情绪报告】")
    sentiment = final_state.get("sentiment_report", "无")
    print(f"  {sentiment[:800]}..." if len(sentiment) > 800 else f"  {sentiment}")

    print_section("5. 辩论结果")
    investment_plan = final_state.get("investment_plan", "无")
    print(f"  投资计划:")
    print(f"  {investment_plan[:1000]}..." if len(investment_plan) > 1000 else f"  {investment_plan}")

    print_section("6. 风险评估")
    risk_state = final_state.get("risk_debate_state", {})
    print(f"  激进观点: {risk_state.get('risky_history', 'N/A')[:500]}...")
    print(f"  保守观点: {risk_state.get('safe_history', 'N/A')[:500]}...")
    print(f"  中性观点: {risk_state.get('neutral_history', 'N/A')[:500]}...")

    print_section("7. 最终交易决策")
    decision = final_state.get("final_trade_decision", "无")
    print(f"  {decision}")

    print_header("Test Complete")
    print(f"Final Status: {final_state.get('status', 'unknown')}")
    print(f"Updated At: {final_state.get('updated_at', 'N/A')}")


async def test_quick():
    """快速测试 - 不调用 LLM"""
    print_header("TradingAgents-CN Quick Test (No LLM)")

    print_section("1. 数据获取测试")
    stock_info = await get_stock_info("000001")
    print(f"  股票: {stock_info['symbol']}.SZ")
    print(f"  收盘价: ¥{stock_info['close']}")
    print(f"  涨跌幅: {stock_info['change_pct']}%")

    print_section("2. LLM 配置检查")
    providers = ["DEEPSEEK_API_KEY", "DASHSCOPE_API_KEY", "OPENAI_API_KEY"]
    for p in providers:
        if os.getenv(p):
            print(f"  [OK] {p}: configured")
        else:
            print(f"  [--] {p}: not set")

    print_header("Quick Test Complete")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="TradingAgents-CN Test")
    parser.add_argument("--quick", action="store_true", help="跳过 LLM 调用")
    args = parser.parse_args()

    if args.quick:
        asyncio.run(test_quick())
    else:
        asyncio.run(test_analysis())
