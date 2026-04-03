"""
Test script for ShiHao Finance v3 modules API.
Tests all 9 modules endpoints.
"""

import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:8000"

def test_module_status():
    """Test modules status endpoint."""
    print("\n=== Testing Module Status ===")
    response = requests.get(f"{BASE_URL}/api/v3/modules/status")
    data = response.json()
    
    print(f"Total modules: {data['total']}")
    for module in data['modules']:
        print(f"  - {module['name']}: {module['status']}")
    
    return data

def test_search_module():
    """Test search module."""
    print("\n=== Testing Search Module ===")
    response = requests.post(f"{BASE_URL}/api/v3/search", json={
        "query": "贵州茅台",
        "engines": ["stock", "policy"],
        "limit": 5
    })
    data = response.json()
    
    print(f"Query: {data['query']}")
    print(f"Results: {data['total']}")
    for result in data['results']:
        print(f"  - [{result['source']}] {result['title']}: {result['score']:.2f}")
    
    return data

def test_policy_module():
    """Test policy module."""
    print("\n=== Testing Policy Module ===")
    response = requests.get(f"{BASE_URL}/api/v3/policy/events?days=7&min_impact=0.1")
    data = response.json()
    
    print(f"Total events: {data['total']}")
    for event in data['events'][:3]:  # Show first 3
        print(f"  - [{event['source']}] {event['headline']} (Impact: {event['impact_score']:.1f})")
    
    return data

def test_analysis_module():
    """Test analysis module."""
    print("\n=== Testing Analysis Module ===")
    response = requests.get(f"{BASE_URL}/api/v3/analysis/600519?include_fundamental=true&include_technical=true")
    data = response.json()
    
    print(f"Ticker: {data['ticker']}")
    print(f"Overall Score: {data['overall_score']}")
    print(f"Recommendation: {data['recommendation']}")
    print(f"Signals: {', '.join(data['signals'])}")
    
    return data

def test_review_module():
    """Test review module."""
    print("\n=== Testing Review Module ===")
    response = requests.get(f"{BASE_URL}/api/v3/review/daily")
    data = response.json()
    
    print(f"Date: {data['date']}")
    print(f"Market Summary: {data['market_summary'][:80]}...")
    print(f"Top Signals: {len(data['top_signals'])}")
    
    return data

def test_knowledge_module():
    """Test knowledge module."""
    print("\n=== Testing Knowledge Module ===")
    response = requests.get(f"{BASE_URL}/api/v3/knowledge/items?type=strategy&limit=5")
    data = response.json()
    
    print(f"Total items: {data['total']}")
    for item in data['items']:
        print(f"  - [{item['type']}] {item['title']}: {item['description']}")
    
    return data

def test_ashare_data_module():
    """Test A-share data module."""
    print("\n=== Testing A-share Data Module ===")
    response = requests.get(f"{BASE_URL}/api/v3/data/ashare/tickers?market=SH")
    data = response.json()
    
    print(f"Total tickers: {data['total']}")
    for ticker in data['tickers'][:3]:
        print(f"  - {ticker['code']} {ticker['name']} ({ticker['sector']})")
    
    return data

def test_highfreq_data_module():
    """Test high-frequency data module."""
    print("\n=== Testing High-Freq Data Module ===")
    response = requests.get(f"{BASE_URL}/api/v3/data/highfreq/600519/ticks?limit=10")
    data = response.json()
    
    print(f"Ticker: {data['ticker']}")
    print(f"Total ticks: {data['total']}")
    print(f"First tick: {data['ticks'][0] if data['ticks'] else 'None'}")
    
    return data

def test_backtest_module():
    """Test backtest module."""
    print("\n=== Testing Backtest Module ===")
    response = requests.post(f"{BASE_URL}/api/v3/backtest/run", json={
        "strategy_name": "momentum",
        "tickers": ["600519", "000858"],
        "start_date": "2025-01-01",
        "end_date": "2025-12-31",
        "initial_capital": 1000000,
        "position_size": 0.1
    })
    data = response.json()
    
    print(f"Backtest ID: {data['backtest_id']}")
    print(f"Status: {data['status']}")
    print(f"Total Return: {data['metrics']['total_return']:.1%}")
    print(f"Sharpe Ratio: {data['metrics']['sharpe_ratio']:.2f}")
    
    return data

def test_watchlist_module():
    """Test watchlist module."""
    print("\n=== Testing Watchlist Module ===")
    
    # Get watchlists
    response = requests.get(f"{BASE_URL}/api/v3/watchlist")
    data = response.json()
    print(f"Watchlists: {data['watchlists']}")
    
    # Create a new watchlist
    response = requests.post(f"{BASE_URL}/api/v3/watchlist", json={
        "name": "test_portfolio",
        "tickers": ["600519", "300750"],
        "description": "Test portfolio for integration"
    })
    print(f"Created watchlist: {response.json()}")
    
    return data

def main():
    """Run all module tests."""
    print("=" * 60)
    print("ShiHao Finance v3 Modules API Test")
    print(f"Testing at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    try:
        # Test all modules
        test_module_status()
        test_search_module()
        test_policy_module()
        test_analysis_module()
        test_review_module()
        test_knowledge_module()
        test_ashare_data_module()
        test_highfreq_data_module()
        test_backtest_module()
        test_watchlist_module()
        
        print("\n" + "=" * 60)
        print("All 9 v3 modules tested successfully!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\nTest failed with error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())