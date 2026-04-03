#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Test all new features added based on Douyin video analysis.
"""

import requests
import sys

sys.stdout.reconfigure(encoding="utf-8")

BASE_URL = "http://localhost:8000"


def test_strategy_templates():
    """Test strategy templates API."""
    print("1. Testing Strategy Templates...")
    response = requests.get(f"{BASE_URL}/api/v3/strategy/templates")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Templates: {len(data['templates'])} strategies available")
        return True
    else:
        print(f"   ❌ Templates: FAILED")
        return False


def test_strategy_generate():
    """Test strategy generation API."""
    print("2. Testing Strategy Generation...")
    response = requests.post(
        f"{BASE_URL}/api/v3/strategy/generate",
        json={"ticker": "600519", "type": "trend", "risk_level": "medium"},
    )
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Generated: {data['strategy']['name']}")
        return True
    else:
        print(f"   ❌ Generation: FAILED")
        return False


def test_risk_analyze():
    """Test risk analysis API."""
    print("3. Testing Risk Analysis...")
    response = requests.post(
        f"{BASE_URL}/api/v3/risk/analyze",
        json={"positions": [{"ticker": "600519", "value": 10000}]},
    )
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Risk Score: {data['risk_metrics']['diversification_score']}%")
        return True
    else:
        print(f"   ❌ Risk Analysis: FAILED")
        return False


def test_paper_portfolio():
    """Test paper trade portfolio API."""
    print("4. Testing Paper Trade Portfolio...")
    response = requests.get(f"{BASE_URL}/api/v3/paper/portfolio")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Portfolio: ¥{data['portfolio']['total_value']:,.2f}")
        return True
    else:
        print(f"   ❌ Portfolio: FAILED")
        return False


def test_paper_order():
    """Test paper trade order API."""
    print("5. Testing Paper Trade Order...")
    response = requests.post(
        f"{BASE_URL}/api/v3/paper/order",
        json={"ticker": "600519", "action": "buy", "quantity": 100},
    )
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Order: {data['order']['status']}")
        return True
    else:
        print(f"   ❌ Order: FAILED")
        return False


def test_marketplace():
    """Test marketplace API."""
    print("6. Testing Strategy Marketplace...")
    response = requests.get(f"{BASE_URL}/api/v3/marketplace/strategies")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Marketplace: {len(data['strategies'])} strategies")
        return True
    else:
        print(f"   ❌ Marketplace: FAILED")
        return False


def main():
    print("=" * 60)
    print("ShiHao Finance - New Features Test")
    print("Based on Douyin Video: AI搭建量化平台")
    print("=" * 60)
    print()

    tests = [
        test_strategy_templates,
        test_strategy_generate,
        test_risk_analyze,
        test_paper_portfolio,
        test_paper_order,
        test_marketplace,
    ]

    results = []
    for test in tests:
        try:
            results.append(test())
        except Exception as e:
            print(f"   ❌ Error: {e}")
            results.append(False)

    print()
    print("=" * 60)
    passed = sum(results)
    total = len(results)
    print(f"Results: {passed}/{total} tests passed")

    if passed == total:
        print()
        print("✅ All new features are working!")
        print()
        print("📊 New Features Added:")
        print("   - AI策略生成器 (AI Strategy Generator)")
        print("   - 风险控制模块 (Risk Control Module)")
        print("   - 模拟交易系统 (Paper Trading System)")
        print("   - 策略市场 (Strategy Marketplace)")
        print()
        print("🌐 Access:")
        print("   - Frontend: http://localhost:5173")
        print("   - Strategy: http://localhost:5173/stock/strategy-generator")
        print("   - Paper Trade: http://localhost:5173/stock/paper-trade")
    else:
        print()
        print("⚠️  Some features may not be working properly.")

    print("=" * 60)


if __name__ == "__main__":
    main()
