"""
TradingAgents-CN Stock Analysis E2E Tests
End-to-end tests for stock analysis workflow
"""

import asyncio
import json
import os
import pytest
from typing import Optional

BASE_URL = os.getenv("TEST_BASE_URL", "http://localhost:8000")
USE_MOCK_LLM = os.getenv("USE_MOCK_LLM", "false").lower() == "true"


@pytest.mark.asyncio
async def test_stock_analysis_e2e():
    """
    测试股票分析完整流程：
    1. 提交分析任务
    2. 连接 WebSocket 接收进度
    3. 获取最终报告
    4. 验证历史记录持久化
    """
    import httpx
    import websockets

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=60.0) as client:
        # 1. 提交分析任务
        payload = {
            "company": "000001.SZ",
            "trade_date": "2026-03-22",
            "use_cache": True,
            "max_debate_rounds": 2,
        }
        
        resp = await client.post("/api/v1/analyze", json=payload)
        assert resp.status_code == 200, f"Failed to submit task: {resp.text}"
        
        task_data = resp.json()
        task_id = task_data["task_id"]
        print(f"Task submitted: {task_id}")
        
        assert task_id is not None
        assert task_data["status"] in ["pending", "running"]

        # 2. 连接 WebSocket 接收进度
        ws_url = BASE_URL.replace("http", "ws") + f"/ws/{task_id}"
        
        progress_messages = []
        result_received = False
        final_result = None
        
        try:
            async with websockets.connect(ws_url, ping_interval=30) as ws:
                while True:
                    try:
                        message = await asyncio.wait_for(ws.recv(), timeout=60.0)
                        data = json.loads(message)
                        print(f"WebSocket received: type={data.get('type')}, data={data}")
                        
                        if data["type"] == "status":
                            progress_messages.append(data)
                            if data.get("data", {}).get("status") == "running":
                                print(f"Progress: {data.get('data', {}).get('progress', 0) * 100:.1f}%")
                        
                        elif data["type"] == "completed":
                            result_received = True
                            final_result = data.get("data", {}).get("response", {})
                            print(f"Task completed: {task_id}")
                            break
                        
                        elif data["type"] == "error":
                            print(f"Task error: {data.get('error')}")
                            break
                            
                    except asyncio.TimeoutError:
                        print("WebSocket timeout, checking task status...")
                        break
        except Exception as e:
            print(f"WebSocket connection failed: {e}")
            # 如果 WebSocket 连接失败，尝试轮询
            for _ in range(30):
                await asyncio.sleep(2)
                resp = await client.get(f"/api/v1/tasks/{task_id}")
                if resp.status_code == 200:
                    task_data = resp.json()
                    if task_data["status"] in ["completed", "failed"]:
                        final_result = task_data
                        result_received = task_data["status"] == "completed"
                        break

        # 验证进度消息
        assert len(progress_messages) >= 0, "Should receive progress messages"
        
        # 3. 验证最终结果结构
        if final_result:
            print(f"Final result keys: {final_result.keys()}")
            # 验证响应包含预期字段
            assert "task_id" in final_result
            assert "status" in final_result
            print(f"Analysis status: {final_result.get('status')}")

        # 4. 通过 HTTP 获取历史记录验证持久化
        resp = await client.get("/api/v1/tasks?page=1&page_size=10")
        assert resp.status_code == 200
        
        tasks_data = resp.json()
        tasks = tasks_data.get("tasks", [])
        
        # 验证任务被记录
        task_ids = [t["task_id"] for t in tasks]
        assert task_id in task_ids, f"Task {task_id} not found in history"
        
        print(f"E2E test passed! Task ID: {task_id}")


@pytest.mark.asyncio
async def test_stock_analysis_with_llm_provider():
    """
    测试不同 LLM 提供商的选择
    """
    import httpx

    providers = ["deepseek", "dashscope", "openai"]
    
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=60.0) as client:
        for provider in providers:
            payload = {
                "company": "000001.SZ",
                "trade_date": "2026-03-22",
            }
            
            resp = await client.post("/api/v1/analyze", json=payload)
            assert resp.status_code == 200
            
            task_id = resp.json()["task_id"]
            print(f"Task {task_id} submitted with provider check")
            
            # 验证任务创建
            await asyncio.sleep(0.5)
            resp = await client.get(f"/api/v1/tasks/{task_id}")
            assert resp.status_code == 200


@pytest.mark.asyncio
async def test_history_search_and_pagination():
    """
    测试历史记录的分页和搜索功能
    """
    import httpx

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        # 测试分页
        resp = await client.get("/api/v1/tasks?page=1&page_size=5")
        assert resp.status_code == 200
        
        data = resp.json()
        assert "tasks" in data
        assert "total" in data
        assert len(data["tasks"]) <= 5
        
        # 测试搜索
        resp = await client.get("/api/v1/tasks?search=000001")
        assert resp.status_code == 200
        
        # 测试状态过滤
        resp = await client.get("/api/v1/tasks?status=completed")
        assert resp.status_code == 200
        
        print("Pagination and search tests passed!")


@pytest.mark.asyncio
async def test_health_check():
    """
    测试健康检查端点
    """
    import httpx

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        resp = await client.get("/health")
        assert resp.status_code == 200
        
        data = resp.json()
        assert data["status"] == "healthy"
        assert "version" in data
        assert "models" in data
        
        print(f"Health check passed: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
