#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Quick test to verify all services are running.
"""

import requests
import sys

# Ensure UTF-8 output
sys.stdout.reconfigure(encoding="utf-8")

BASE_URL = "http://localhost:8000"


def test_health():
    """Test health endpoint."""
    print("1. Testing Health Endpoint...")
    response = requests.get(f"{BASE_URL}/health")
    if response.status_code == 200:
        print("   ✅ Health: OK")
        return True
    else:
        print(f"   ❌ Health: FAILED ({response.status_code})")
        return False


def test_search():
    """Test search endpoint."""
    print("2. Testing Search Endpoint...")
    response = requests.post(
        f"{BASE_URL}/api/v3/search", json={"query": "茅台", "limit": 3}
    )
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Search: OK (Results: {data['total']})")
        return True
    else:
        print(f"   ❌ Search: FAILED ({response.status_code})")
        return False


def test_analysis():
    """Test analysis endpoint."""
    print("3. Testing Analysis Endpoint...")
    response = requests.get(f"{BASE_URL}/api/v3/analysis/600519")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Analysis: OK (Ticker: {data['ticker']})")
        return True
    else:
        print(f"   ❌ Analysis: FAILED ({response.status_code})")
        return False


def test_sync():
    """Test sync endpoint."""
    print("4. Testing Sync Endpoint...")
    response = requests.post(f"{BASE_URL}/api/v3/sync/history", json={"history": []})
    if response.status_code == 200:
        print("   ✅ Sync: OK")
        return True
    else:
        print(f"   ❌ Sync: FAILED ({response.status_code})")
        return False


def main():
    print("=" * 50)
    print("ShiHao Finance - Service Status Check")
    print("=" * 50)
    print()

    results = []
    results.append(test_health())
    results.append(test_search())
    results.append(test_analysis())
    results.append(test_sync())

    print()
    print("=" * 50)
    passed = sum(results)
    total = len(results)
    print(f"Results: {passed}/{total} tests passed")

    if passed == total:
        print()
        print("✅ All services are running!")
        print()
        print("🌐 Frontend: http://localhost:5173")
        print("🔧 Backend:  http://localhost:8000")
        print("📚 API Docs: http://localhost:8000/docs")
    else:
        print()
        print("⚠️  Some services may not be running properly.")
        print("   Please check the logs for details.")

    print("=" * 50)


if __name__ == "__main__":
    main()
